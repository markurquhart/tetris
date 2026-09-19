import type { Game } from './game';

const MOVE_THRESHOLD = 16;
const TAP_SLOP = 10;
const FLICK_DISTANCE = 56;
const FLICK_VELOCITY = 0.45; // px/ms
const HOLD_MS = 380;
const SOFT_DROP_EVERY_MS = 16; // ~60Hz while dragging down

export interface TouchHooks {
  unlock: () => void;
  /** Repaint immediately after a touch action (don't wait for rAF). */
  paint: () => void;
}

/**
 * Low-latency playfield gestures:
 * - tap → rotate CW
 * - long-press → hold
 * - swipe L/R → move (applied immediately)
 * - drag down → soft drop
 * - flick down → hard drop
 * - swipe up → hold
 */
export function bindPlayfieldGestures(
  surface: HTMLElement,
  game: Game,
  hooks: TouchHooks,
): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startTime = 0;
  let movedCellsX = 0;
  let lastSoftDropAt = 0;
  let holdTimer: number | null = null;
  let longPressed = false;
  let consumed = false;

  const clearHoldTimer = () => {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const bump = () => {
    hooks.unlock();
    hooks.paint();
  };

  surface.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointerId !== null) return;
      e.preventDefault();

      pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      startTime = performance.now();
      movedCellsX = 0;
      lastSoftDropAt = startTime;
      longPressed = false;
      consumed = false;
      hooks.unlock();

      clearHoldTimer();
      holdTimer = window.setTimeout(() => {
        if (pointerId === null || consumed) return;
        const dx = lastX - startX;
        const dy = lastY - startY;
        if (Math.hypot(dx, dy) < TAP_SLOP) {
          longPressed = true;
          consumed = true;
          game.touchHold();
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
      lastX = e.clientX;
      lastY = e.clientY;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > TAP_SLOP || absY > TAP_SLOP) {
        clearHoldTimer();
      }

      // Horizontal steps — apply immediately
      if (absX > absY && absX >= MOVE_THRESHOLD * 0.7) {
        const cells = Math.floor(absX / MOVE_THRESHOLD);
        let painted = false;
        while (movedCellsX < cells) {
          const ok = game.touchMove(dx < 0 ? -1 : 1);
          movedCellsX += 1;
          consumed = true;
          if (ok) painted = true;
          else break;
        }
        if (painted) bump();
      }

      // Soft drop while dragging down — step at ~60Hz, not waiting on game DAS
      if (dy > MOVE_THRESHOLD * 0.75 && absY >= absX) {
        consumed = true;
        if (now - lastSoftDropAt >= SOFT_DROP_EVERY_MS) {
          lastSoftDropAt = now;
          game.touchSoftDropStep();
          bump();
        }
      }
    },
    { passive: false },
  );

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = Math.max(1, performance.now() - startTime);
    const dist = Math.hypot(dx, dy);
    const velocity = dist / dt;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    clearHoldTimer();

    if (!longPressed && !consumed) {
      if (dist < TAP_SLOP) {
        game.touchRotate();
        bump();
      } else if (dy < -MOVE_THRESHOLD && absY > absX) {
        game.touchHold();
        bump();
      } else if (
        dy > FLICK_DISTANCE &&
        absY > absX &&
        (velocity >= FLICK_VELOCITY || dy > FLICK_DISTANCE * 1.3)
      ) {
        game.touchHardDrop();
        bump();
      }
    } else if (
      !longPressed &&
      dy > FLICK_DISTANCE &&
      absY > absX &&
      velocity >= FLICK_VELOCITY
    ) {
      game.touchHardDrop();
      bump();
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
