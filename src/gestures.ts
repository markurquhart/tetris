import { CELL_SIZE, WINDOW_WIDTH } from './constants';
import type { InputHandler } from './input';

/**
 * Cell-space touch model with precision vs travel modes.
 *
 *   cell = CELL_SIZE * (crtWidth / WINDOW_WIDTH)
 *
 * Precision (default): tiny nudges commit at most **1 cell**.
 * Travel: once the finger has clearly moved farther (TRAVEL_UNLOCK),
 *         seek follows grab + round(delta/cell) across the board.
 *
 * This is intentional classification — not a global sensitivity crank.
 *
 * Discrete (stricter vertical):
 *   Tap / long-press / swipe-up hold unchanged in spirit
 *   Hard drop only on a real downward flick (velocity + distance + vertical axis)
 */
const TAP_SLOP_CELLS = 0.32;
/** First 1-cell nudge in precision mode. */
const PRECISION_COMMIT_CELLS = 0.55;
/**
 * Finger must travel this far from grab before multi-cell follow unlocks.
 * Keeps a 1-cell nudge from leaping to 2–3 columns.
 */
const TRAVEL_UNLOCK_CELLS = 2.15;
const FLICK_DISTANCE_CELLS = 1.85;
/** Required for hard drop — distance alone never hard-drops. */
const FLICK_VELOCITY = 0.55; // px/ms
const FLICK_MAX_MS = 420;
const HOLD_MS = 420;
const AXIS_LOCK_CELLS = 0.42;
const HOLD_SWIPE_UP_CELLS = 0.95;
/** Escaping horizontal → vertical needs a clearer intent (stops false soft/hard drops). */
const AXIS_H_TO_V_RATIO = 1.65;
const AXIS_V_TO_H_RATIO = 1.35;

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
  precisionCommit: number;
  travelUnlock: number;
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
    precisionCommit: cell * PRECISION_COMMIT_CELLS,
    travelUnlock: cell * TRAVEL_UNLOCK_CELLS,
  };
}

/**
 * Precision: 0 or ±1 until travel unlocks.
 * Travel: round(dx/cell) so broad drags still cover the board.
 */
function horizontalOffset(
  dx: number,
  cell: number,
  travel: boolean,
  precisionCommit: number,
  travelUnlock: number,
): { offset: number; travel: boolean } {
  const abs = Math.abs(dx);
  const sign = dx < 0 ? -1 : 1;
  let nowTravel = travel;
  if (!nowTravel && abs >= travelUnlock) nowTravel = true;

  if (!nowTravel) {
    if (abs < precisionCommit) return { offset: 0, travel: false };
    return { offset: sign, travel: false };
  }

  const raw = dx / cell;
  if (Math.abs(raw) < PRECISION_COMMIT_CELLS) return { offset: 0, travel: true };
  return { offset: Math.round(raw), travel: true };
}

/** Down-only soft drop with the same precision → travel gate. */
function verticalDownOffset(
  dy: number,
  cell: number,
  travel: boolean,
  precisionCommit: number,
  travelUnlock: number,
): { offset: number; travel: boolean } {
  if (dy <= 0) return { offset: 0, travel };
  const abs = dy;
  let nowTravel = travel;
  if (!nowTravel && abs >= travelUnlock) nowTravel = true;

  if (!nowTravel) {
    if (abs < precisionCommit) return { offset: 0, travel: false };
    return { offset: 1, travel: false };
  }

  if (abs < cell * PRECISION_COMMIT_CELLS) return { offset: 0, travel: true };
  return { offset: Math.max(0, Math.round(dy / cell)), travel: true };
}

/**
 * Touch / pointer gestures — precision nudges vs broad travel, cell-space throughout.
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
  let hTravel = false;
  let vTravel = false;
  let didHorizontal = false;
  let didVertical = false;
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
    hTravel = false;
    vTravel = false;
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
    const { offset, travel } = horizontalOffset(
      clientX - grabX,
      scale.cell,
      hTravel,
      scale.precisionCommit,
      scale.travelUnlock,
    );
    hTravel = travel;
    const desired = grabCol + offset;
    if (desired === col) return false;
    const moved = hooks.seekCol(desired);
    if (moved) didHorizontal = true;
    return moved;
  };

  const syncVertical = (clientX: number, clientY: number): boolean => {
    if (!ensureGrab(clientX, clientY)) return false;
    const row = hooks.getRow();
    if (row === null) return false;
    const { offset, travel } = verticalDownOffset(
      clientY - grabY,
      scale.cell,
      vTravel,
      scale.precisionCommit,
      scale.travelUnlock,
    );
    vTravel = travel;
    const desired = grabRow + offset;
    if (desired <= row) return false;
    const moved = hooks.seekRow(desired);
    if (moved) didVertical = true;
    return moved;
  };

  const updateAxisLock = (absX: number, absY: number): void => {
    if (axisLock === 'none') {
      if (absX < scale.axisLock && absY < scale.axisLock) return;
      // Prefer horizontal when close — L/R is the common precise action.
      if (absX >= absY * 1.05) axisLock = 'h';
      else if (absY > absX * 1.25) axisLock = 'v';
      return;
    }
    if (axisLock === 'v' && absX > absY * AXIS_V_TO_H_RATIO) {
      axisLock = 'h';
    } else if (axisLock === 'h' && absY > absX * AXIS_H_TO_V_RATIO) {
      axisLock = 'v';
    }
  };

  /** Hard drop only for a short, fast, clearly vertical flick. */
  const isFlickDown = (
    dx: number,
    dy: number,
    avgVelocity: number,
    recentVelocity: number,
    durationMs: number,
  ): boolean => {
    if (isTitleScreen()) return false;
    if (didHorizontal && !didVertical) return false;
    if (axisLock === 'h') return false;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (dy < scale.flickDist || absY < absX * 1.2) return false;
    if (axisLock !== 'v' && absY < absX * 1.5) return false;
    if (durationMs > FLICK_MAX_MS) return false;
    const speed = Math.max(avgVelocity, recentVelocity);
    return speed >= FLICK_VELOCITY;
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
      hTravel = false;
      vTravel = false;
      didHorizontal = false;
      didVertical = false;
      longPressed = false;
      consumed = false;
      regrab(e.clientX, e.clientY);
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

      if (axisLock === 'h' || (axisLock === 'none' && absX >= absY)) {
        if (syncHorizontal(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
        return;
      }

      if (axisLock === 'v' || (axisLock === 'none' && absY > absX)) {
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
      if (axisLock === 'h' || (axisLock === 'none' && absX >= absY && absX >= scale.tapSlop)) {
        if (syncHorizontal(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
      } else if (
        (axisLock === 'v' || (axisLock === 'none' && absY > absX)) &&
        dy > 0
      ) {
        if (syncVertical(e.clientX, e.clientY)) {
          consumed = true;
          bump();
        }
      }
    }

    if (!longPressed && isFlickDown(dx, dy, avgVelocity, recentVelocity, dt)) {
      hooks.hardDrop();
      bump();
    } else if (!longPressed && !consumed) {
      if (dist < scale.tapSlop) {
        if (isTitleScreen()) hooks.start();
        else hooks.rotate();
        bump();
      } else if (!isTitleScreen() && dy <= -scale.holdUp && absY > absX * 1.15) {
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
