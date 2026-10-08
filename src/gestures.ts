import { CELL_SIZE, WINDOW_WIDTH } from './constants';
import type { InputHandler } from './input';

/**
 * Unified mobile touch model — everything in on-screen cell space.
 *
 *   displayedCell = CELL_SIZE * (crtWidth / WINDOW_WIDTH)
 *
 * Continuous drags (finger-follow):
 *   L/R:  desiredCol = grabCol + round(dx / cell)
 *   Soft: desiredRow = grabRow + max(0, round(dy / cell))
 *
 * Discrete actions (same cell units for thresholds):
 *   Tap (< tapSlop)     → rotate / start
 *   Long-press           → hold
 *   Swipe up (≥ 1 cell)  → hold
 *   Flick down           → hard drop
 *
 * No velocity-scaled step sizes. Axis lock can escape if the other axis
 * clearly dominates so diagonal jitter can't steal the gesture forever.
 */
const TAP_SLOP_CELLS = 0.32;
const FIRST_COMMIT_CELLS = 0.42;
const FLICK_DISTANCE_CELLS = 1.55;
const FLICK_VELOCITY = 0.45; // px/ms — discrete flick only
const HOLD_MS = 420;
const AXIS_LOCK_CELLS = 0.38;
const HOLD_SWIPE_UP_CELLS = 0.9;
const AXIS_RELOCK_RATIO = 1.35;

export interface GestureHooks {
  unlock: () => void;
  paint: () => void;
  getCol: () => number | null;
  getRow: () => number | null;
  getPieceEpoch: () => number;
  seekCol: (col: number) => boolean;
  seekRow: (row: number) => boolean;
  rotate: () => void;
  hardDrop: () => void;
  hold: () => void;
  start: () => void;
}

interface Scale {
  cell: number;
  tapSlop: number;
  axisLock: number;
  holdUp: number;
  flickDist: number;
}

function readScale(surface: HTMLElement): Scale {
  const rect = surface.getBoundingClientRect();
  const scaleX = rect.width > 0 ? rect.width / WINDOW_WIDTH : 1;
  const cell = Math.max(14, CELL_SIZE * scaleX);
  return {
    cell,
    tapSlop: cell * TAP_SLOP_CELLS,
    axisLock: cell * AXIS_LOCK_CELLS,
    holdUp: cell * HOLD_SWIPE_UP_CELLS,
    flickDist: cell * FLICK_DISTANCE_CELLS,
  };
}

function offsetFromDx(dx: number, cell: number): number {
  const raw = dx / cell;
  if (Math.abs(raw) < FIRST_COMMIT_CELLS) return 0;
  return Math.round(raw);
}

/** Down-only soft-drop offset (never negative). */
function downOffsetFromDy(dy: number, cell: number): number {
  if (dy < cell * FIRST_COMMIT_CELLS) return 0;
  return Math.max(0, Math.round(dy / cell));
}

/**
 * Touch / pointer gestures on the playfield — one cell-space model for all moves.
 */
export function bindPlayfieldGestures(
  surface: HTMLElement,
  input: InputHandler,
  hooks: GestureHooks,
  isTitleScreen: () => boolean,
): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startTime = 0;
  let sampleX = 0;
  let sampleY = 0;
  let sampleTime = 0;
  let grabX = 0;
  let grabY = 0;
  let grabCol = 0;
  let grabRow = 0;
  let grabEpoch = -1;
  let axisLock: 'none' | 'h' | 'v' = 'none';
  let holdTimer: number | null = null;
  let longPressed = false;
  let consumed = false;
  let scale = readScale(surface);

  const clearHoldTimer = () => {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const bump = () => {
    hooks.paint();
  };

  const regrab = (clientX: number, clientY: number): boolean => {
    const col = hooks.getCol();
    const row = hooks.getRow();
    if (col === null || row === null) return false;
    grabX = clientX;
    grabY = clientY;
    grabCol = col;
    grabRow = row;
    grabEpoch = hooks.getPieceEpoch();
    return true;
  };

  const ensureGrab = (clientX: number, clientY: number): boolean => {
    if (hooks.getPieceEpoch() !== grabEpoch || hooks.getCol() === null) {
      return regrab(clientX, clientY);
    }
    return true;
  };

  const syncHorizontal = (clientX: number, clientY: number): boolean => {
    if (!ensureGrab(clientX, clientY)) return false;
    const col = hooks.getCol();
    if (col === null) return false;
    const desired = grabCol + offsetFromDx(clientX - grabX, scale.cell);
    if (desired === col) return false;
    return hooks.seekCol(desired);
  };

  const syncVertical = (clientX: number, clientY: number): boolean => {
    if (!ensureGrab(clientX, clientY)) return false;
    const row = hooks.getRow();
    if (row === null) return false;
    const desired = grabRow + downOffsetFromDy(clientY - grabY, scale.cell);
    if (desired <= row) return false;
    return hooks.seekRow(desired);
  };

  const updateAxisLock = (absX: number, absY: number): void => {
    if (axisLock === 'none') {
      if (absX < scale.axisLock && absY < scale.axisLock) return;
      if (absX > absY * 1.12) axisLock = 'h';
      else if (absY > absX * 1.12) axisLock = 'v';
      return;
    }
    if (axisLock === 'v' && absX > absY * AXIS_RELOCK_RATIO) axisLock = 'h';
    else if (axisLock === 'h' && absY > absX * AXIS_RELOCK_RATIO) axisLock = 'v';
  };

  const isFlickDown = (
    dx: number,
    dy: number,
    avgVelocity: number,
    recentVelocity: number,
  ): boolean => {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (isTitleScreen()) return false;
    if (dy < scale.flickDist || absY < absX * 0.85) return false;
    return (
      avgVelocity >= FLICK_VELOCITY ||
      recentVelocity >= FLICK_VELOCITY ||
      dy >= scale.flickDist * 1.25
    );
  };

  surface.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointerId !== null) return;
      e.preventDefault();

      scale = readScale(surface);
      pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      startX = lastX = sampleX = e.clientX;
      startY = lastY = sampleY = e.clientY;
      startTime = sampleTime = performance.now();
      axisLock = 'none';
      longPressed = false;
      consumed = false;
      regrab(e.clientX, e.clientY);
      // Clear any stale soft-drop hold from a previous broken gesture.
      input.setHeld('down', false);
      hooks.unlock();

      clearHoldTimer();
      holdTimer = window.setTimeout(() => {
        if (pointerId === null || consumed || isTitleScreen()) return;
        const dx = lastX - startX;
        const dy = lastY - startY;
        if (Math.hypot(dx, dy) < scale.tapSlop) {
          longPressed = true;
          consumed = true;
          hooks.hold();
          bump();
        }
      }, HOLD_MS);
    },
    { passive: false },
  );

  surface.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();

      const now = performance.now();
      if (now - sampleTime >= 40) {
        sampleX = lastX;
        sampleY = lastY;
        sampleTime = now;
      }

      lastX = e.clientX;
      lastY = e.clientY;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > scale.tapSlop || absY > scale.tapSlop) {
        clearHoldTimer();
      }

      if (isTitleScreen()) return;

      updateAxisLock(absX, absY);

      if (axisLock === 'h' || (axisLock === 'none' && absX > absY)) {
        if (syncHorizontal(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
        return;
      }

      if (axisLock === 'v' || (axisLock === 'none' && absY >= absX)) {
        // Up-swipe hold is handled on pointerup; down = finger-follow soft drop.
        if (dy > 0 && syncVertical(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
      }
    },
    { passive: false },
  );

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();

    const now = performance.now();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = Math.max(1, now - startTime);
    const dist = Math.hypot(dx, dy);
    const avgVelocity = dist / dt;
    const recentDt = Math.max(1, now - sampleTime);
    const recentVelocity =
      Math.hypot(e.clientX - sampleX, e.clientY - sampleY) / recentDt;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    clearHoldTimer();
    input.setHeld('down', false);

    if (!longPressed && !isTitleScreen()) {
      if (axisLock === 'h' || (axisLock === 'none' && absX > absY && absX >= scale.tapSlop)) {
        if (syncHorizontal(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
      } else if (
        (axisLock === 'v' || (axisLock === 'none' && absY >= absX)) &&
        dy > 0
      ) {
        if (syncVertical(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
      }
    }

    if (!longPressed && isFlickDown(dx, dy, avgVelocity, recentVelocity)) {
      hooks.hardDrop();
      bump();
    } else if (!longPressed && !consumed) {
      if (dist < scale.tapSlop) {
        if (isTitleScreen()) hooks.start();
        else hooks.rotate();
        bump();
      } else if (!isTitleScreen() && dy <= -scale.holdUp && absY > absX) {
        hooks.hold();
        bump();
      }
    }

    pointerId = null;
    try {
      surface.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  surface.addEventListener('pointerup', finish, { passive: false });
  surface.addEventListener('pointercancel', finish, { passive: false });

  surface.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  surface.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      scale = readScale(surface);
    });
    ro.observe(surface);
  }
}

/** Page-level: stop iOS double-tap zoom outside captured pointers. */
export function preventMobilePageZoom(): void {
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false },
  );
}
