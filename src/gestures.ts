import {
  BOARD_COLS,
  CELL_SIZE,
  WINDOW_WIDTH,
} from './constants';
import type { InputHandler } from './input';

/**
 * Horizontal moves track finger offset in *displayed* cell widths
 * (canvas CSS scale → cell px). Absolute target cells from touch origin
 * so the piece can't drift/"overshoot" relative to the finger mid-game.
 */
const FIRST_CELL_FRAC = 0.48;
const STEP_CELL_FRAC = 1;
/** Safety cap if a huge coalesced jump arrives after a long hitch. */
const MAX_CATCHUP_CELLS = 5;
const TAP_SLOP_CELLS = 0.35;
const FLICK_DISTANCE_CELLS = 1.6;
const FLICK_VELOCITY = 0.4; // px/ms
const HOLD_MS = 420;
const AXIS_LOCK_CELLS = 0.4;
const SOFT_DROP_CELLS = 0.85;

export interface GestureHooks {
  unlock: () => void;
  paint: () => void;
  /** Apply one cell; return false if blocked (wall/stack). */
  move: (dir: -1 | 1) => boolean;
  rotate: () => void;
  hardDrop: () => void;
  hold: () => void;
  start: () => void;
}

interface Scale {
  cell: number;
  tapSlop: number;
  axisLock: number;
  softDrop: number;
  flickDist: number;
}

function readScale(surface: HTMLElement): Scale {
  const rect = surface.getBoundingClientRect();
  // CRT/canvas is letterboxed to WINDOW aspect; width drives cell CSS size.
  const scaleX = rect.width > 0 ? rect.width / WINDOW_WIDTH : 1;
  const cell = Math.max(12, CELL_SIZE * scaleX);
  return {
    cell,
    tapSlop: cell * TAP_SLOP_CELLS,
    axisLock: cell * AXIS_LOCK_CELLS,
    softDrop: cell * SOFT_DROP_CELLS,
    flickDist: cell * FLICK_DISTANCE_CELLS,
  };
}

function targetCellsFromDx(dx: number, cell: number): number {
  const abs = Math.abs(dx);
  const firstPx = cell * FIRST_CELL_FRAC;
  if (abs < firstPx) return 0;
  const sign = dx < 0 ? -1 : 1;
  const stepPx = cell * STEP_CELL_FRAC;
  return sign * (1 + Math.floor((abs - firstPx) / stepPx));
}

/**
 * Touch / pointer gestures on the playfield:
 * - tap → rotate CW (or start game on the title screen)
 * - long-press → hold
 * - drag L/R → piece tracks finger by cell widths (1:1 with on-screen cells)
 * - drag down → soft drop
 * - flick down → hard drop
 * - swipe up → hold
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
  /** Touch origin X for absolute L/R quantization (re-anchored on wall hits). */
  let anchorX = 0;
  /** Net successful L/R cells applied this gesture. */
  let signedCells = 0;
  let axisLock: 'none' | 'h' | 'v' = 'none';
  let softDropping = false;
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

  const endSoftDrop = () => {
    if (softDropping) {
      input.setHeld('down', false);
      softDropping = false;
    }
  };

  const bump = () => {
    hooks.paint();
  };

  const syncHorizontal = (clientX: number): boolean => {
    let target = targetCellsFromDx(clientX - anchorX, scale.cell);
    // Never ask for more than board width of catch-up in one gesture.
    target = Math.max(-BOARD_COLS, Math.min(BOARD_COLS, target));

    let stepped = false;
    let guard = 0;
    while (signedCells < target && guard < MAX_CATCHUP_CELLS) {
      if (!hooks.move(1)) {
        // Wall: re-anchor so further motion in this direction doesn't queue delay.
        anchorX = clientX - signedCells * scale.cell;
        break;
      }
      signedCells += 1;
      stepped = true;
      guard += 1;
    }
    while (signedCells > target && guard < MAX_CATCHUP_CELLS) {
      if (!hooks.move(-1)) {
        anchorX = clientX - signedCells * scale.cell;
        break;
      }
      signedCells -= 1;
      stepped = true;
      guard += 1;
    }
    if (stepped) consumed = true;
    return stepped;
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
      startX = lastX = sampleX = anchorX = e.clientX;
      startY = lastY = sampleY = e.clientY;
      startTime = sampleTime = performance.now();
      signedCells = 0;
      axisLock = 'none';
      longPressed = false;
      consumed = false;
      endSoftDrop();
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

      if (axisLock === 'none' && (absX >= scale.axisLock || absY >= scale.axisLock)) {
        axisLock = absX > absY * 1.15 ? 'h' : absY > absX * 1.15 ? 'v' : 'none';
      }

      if (axisLock === 'h' || (axisLock === 'none' && absX > absY)) {
        if (syncHorizontal(e.clientX)) bump();
        return;
      }

      if (axisLock === 'v' || (axisLock === 'none' && absY >= absX)) {
        if (dy > scale.softDrop) {
          if (!softDropping) {
            softDropping = true;
            input.setHeld('down', true);
            consumed = true;
            hooks.unlock();
          }
        } else if (softDropping && dy < scale.softDrop * 0.5) {
          endSoftDrop();
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
    endSoftDrop();

    // Final L/R sync so a last coalesced sample can't leave the piece short/long.
    if (!longPressed && !isTitleScreen() && (axisLock === 'h' || (axisLock === 'none' && absX > absY && absX >= scale.tapSlop))) {
      if (syncHorizontal(e.clientX)) bump();
    }

    if (!longPressed && isFlickDown(dx, dy, avgVelocity, recentVelocity)) {
      hooks.hardDrop();
      bump();
    } else if (!longPressed && !consumed) {
      if (dist < scale.tapSlop) {
        if (isTitleScreen()) hooks.start();
        else hooks.rotate();
        bump();
      } else if (!isTitleScreen() && dy < -scale.softDrop && absY > absX) {
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

  // Keep cell scale fresh if the CRT resizes (rotation / browser chrome).
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
