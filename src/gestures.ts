import type { InputHandler } from './input';

/** Horizontal moves stay calm; flick-down stays easy to register. */
const MOVE_THRESHOLD = 30;
const TAP_SLOP = 12;
const FLICK_DISTANCE = 52;
const FLICK_VELOCITY = 0.4; // px/ms
const HOLD_MS = 420;

export interface GestureHooks {
  unlock: () => void;
  paint: () => void;
  move: (dir: -1 | 1) => void;
  rotate: () => void;
  hardDrop: () => void;
  hold: () => void;
  start: () => void;
}

/**
 * Touch / pointer gestures on the playfield:
 * - tap → rotate CW (or start game on the title screen)
 * - long-press → hold
 * - swipe L/R → move (steps as you drag)
 * - drag down → soft drop
 * - flick down → hard drop
 * - swipe up → hold
 *
 * One-shot actions apply immediately + repaint; soft-drop still uses held input
 * so continuous drag doesn't get twitchy.
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
  let movedCellsX = 0;
  let softDropping = false;
  let holdTimer: number | null = null;
  let longPressed = false;
  let consumed = false;

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
    hooks.unlock();
    hooks.paint();
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
    if (dy < FLICK_DISTANCE || absY < absX * 0.85) return false;
    return (
      avgVelocity >= FLICK_VELOCITY ||
      recentVelocity >= FLICK_VELOCITY ||
      dy >= FLICK_DISTANCE * 1.25
    );
  };

  surface.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointerId !== null) return;
      e.preventDefault();

      pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      startX = lastX = sampleX = e.clientX;
      startY = lastY = sampleY = e.clientY;
      startTime = sampleTime = performance.now();
      movedCellsX = 0;
      longPressed = false;
      consumed = false;
      endSoftDrop();
      hooks.unlock();

      clearHoldTimer();
      holdTimer = window.setTimeout(() => {
        if (pointerId === null || consumed || isTitleScreen()) return;
        const dx = lastX - startX;
        const dy = lastY - startY;
        if (Math.hypot(dx, dy) < TAP_SLOP) {
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
      // Keep a ~40ms trailing sample so flick velocity isn't washed out by a long drag
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

      if (absX > TAP_SLOP || absY > TAP_SLOP) {
        clearHoldTimer();
      }

      if (isTitleScreen()) return;

      // Horizontal steps
      if (absX > absY && absX >= MOVE_THRESHOLD) {
        const cells = Math.floor(absX / MOVE_THRESHOLD);
        let stepped = false;
        while (movedCellsX < cells) {
          if (dx < 0) hooks.move(-1);
          else hooks.move(1);
          movedCellsX += 1;
          consumed = true;
          stepped = true;
        }
        if (stepped) bump();
      }

      // Soft drop while dragging down (held path — not per-pixel)
      if (dy > MOVE_THRESHOLD && absY >= absX) {
        if (!softDropping) {
          softDropping = true;
          input.setHeld('down', true);
          consumed = true;
          hooks.unlock();
        }
      } else if (softDropping && dy < MOVE_THRESHOLD * 0.5) {
        endSoftDrop();
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

    // Flick wins even if soft-drop already marked the gesture as consumed
    if (!longPressed && isFlickDown(dx, dy, avgVelocity, recentVelocity)) {
      hooks.hardDrop();
      bump();
    } else if (!longPressed && !consumed) {
      if (dist < TAP_SLOP) {
        if (isTitleScreen()) hooks.start();
        else hooks.rotate();
        bump();
      } else if (!isTitleScreen() && dy < -MOVE_THRESHOLD && absY > absX) {
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
