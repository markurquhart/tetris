import type { InputHandler } from './input';

const MOVE_THRESHOLD = 28;
const TAP_SLOP = 12;
const FLICK_DISTANCE = 70;
const FLICK_VELOCITY = 0.55; // px/ms
const HOLD_MS = 420;

/**
 * Touch / pointer gestures on the playfield:
 * - tap → rotate CW
 * - long-press → hold
 * - swipe L/R → move (steps as you drag)
 * - drag down → soft drop
 * - flick down → hard drop
 * - swipe up → hold
 */
export function bindPlayfieldGestures(
  surface: HTMLElement,
  input: InputHandler,
  onGesture: () => void,
): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startTime = 0;
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

  surface.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointerId !== null) return;

      pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      startTime = performance.now();
      movedCellsX = 0;
      longPressed = false;
      consumed = false;
      endSoftDrop();
      onGesture();

      clearHoldTimer();
      holdTimer = window.setTimeout(() => {
        if (pointerId === null || consumed) return;
        const dx = lastX - startX;
        const dy = lastY - startY;
        if (Math.hypot(dx, dy) < TAP_SLOP) {
          longPressed = true;
          consumed = true;
          input.trigger('hold');
          onGesture();
        }
      }, HOLD_MS);
    },
    { passive: true },
  );

  surface.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== pointerId) return;

      lastX = e.clientX;
      lastY = e.clientY;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > TAP_SLOP || absY > TAP_SLOP) {
        clearHoldTimer();
      }

      // Horizontal steps
      if (absX > absY && absX >= MOVE_THRESHOLD) {
        const cells = Math.floor(absX / MOVE_THRESHOLD);
        while (movedCellsX < cells) {
          if (dx < 0) input.triggerMoveLeft();
          else input.triggerMoveRight();
          movedCellsX += 1;
          consumed = true;
          onGesture();
        }
      }

      // Soft drop while dragging down
      if (dy > MOVE_THRESHOLD && absY >= absX) {
        if (!softDropping) {
          softDropping = true;
          input.setHeld('down', true);
          consumed = true;
          onGesture();
        }
      } else if (softDropping && dy < MOVE_THRESHOLD * 0.5) {
        endSoftDrop();
      }
    },
    { passive: true },
  );

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = Math.max(1, performance.now() - startTime);
    const dist = Math.hypot(dx, dy);
    const velocity = dist / dt;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    clearHoldTimer();
    endSoftDrop();

    if (!longPressed && !consumed) {
      if (dist < TAP_SLOP) {
        input.trigger('rotateCw');
        onGesture();
      } else if (dy < -MOVE_THRESHOLD && absY > absX) {
        input.trigger('hold');
        onGesture();
      } else if (
        dy > FLICK_DISTANCE &&
        absY > absX &&
        (velocity >= FLICK_VELOCITY || dy > FLICK_DISTANCE * 1.4)
      ) {
        input.trigger('hardDrop');
        onGesture();
      }
    } else if (
      !longPressed &&
      dy > FLICK_DISTANCE &&
      absY > absX &&
      velocity >= FLICK_VELOCITY
    ) {
      // Flick after some soft-drop drag still counts as hard drop
      input.trigger('hardDrop');
      onGesture();
    }

    pointerId = null;
    try {
      surface.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  surface.addEventListener('pointerup', finish);
  surface.addEventListener('pointercancel', finish);
}
