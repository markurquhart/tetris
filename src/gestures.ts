import type { InputHandler } from './input';

/**
 * Incremental L/R from last step. Step distance scales mildly with finger
 * velocity so slow drags crawl and quick swipes keep up — without the prior
 * oversensitive multi-step / tiny fast-step thresholds.
 */
const FIRST_MOVE_PX = 24;
const SLOW_STEP_PX = 48;
const BASE_STEP_PX = 34;
const FAST_STEP_PX = 24;
/** Horizontal velocity (px/ms) treated as a light/slow drag. */
const VEL_SLOW = 0.12;
/** Horizontal velocity (px/ms) treated as a quick swipe. */
const VEL_FAST = 0.7;
const TAP_SLOP = 12;
const FLICK_DISTANCE = 52;
const FLICK_VELOCITY = 0.4; // px/ms
const HOLD_MS = 420;
const AXIS_LOCK_PX = 14;
/** Second cell only when a fast coalesced move clearly covers 2× the step. */
const FAST_CATCHUP_STEPS = 2;

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
 * - swipe L/R → move (velocity-scaled step distance)
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
  let lastMoveTime = 0;
  let startTime = 0;
  let sampleX = 0;
  let sampleY = 0;
  let sampleTime = 0;
  /** Smoothed |vx| so a single coalesced jump doesn't jump to "fast" mode. */
  let smoothVelX = 0;
  /** Finger X where the last L/R step was charged from. */
  let stepOriginX = 0;
  /** 0 until first L/R step this gesture; then -1 or 1. */
  let moveDir: -1 | 0 | 1 = 0;
  /** Lock gesture to horizontal or vertical after a clear intent. */
  let axisLock: 'none' | 'h' | 'v' = 'none';
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
    hooks.paint();
  };

  const stepDistanceForVelocity = (velocityPxPerMs: number, isFirst: boolean): number => {
    if (isFirst) return FIRST_MOVE_PX;
    const t = Math.max(0, Math.min(1, (velocityPxPerMs - VEL_SLOW) / (VEL_FAST - VEL_SLOW)));
    // Slow → large gap; fast → closer to FIRST, not twitchy micro-steps.
    if (t <= 0.5) {
      const u = t / 0.5;
      return SLOW_STEP_PX + (BASE_STEP_PX - SLOW_STEP_PX) * u;
    }
    const u = (t - 0.5) / 0.5;
    return BASE_STEP_PX + (FAST_STEP_PX - BASE_STEP_PX) * u;
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
      startX = lastX = sampleX = stepOriginX = e.clientX;
      startY = lastY = sampleY = e.clientY;
      startTime = sampleTime = lastMoveTime = performance.now();
      smoothVelX = 0;
      moveDir = 0;
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
      if (now - sampleTime >= 40) {
        sampleX = lastX;
        sampleY = lastY;
        sampleTime = now;
      }

      const dt = Math.max(1, now - lastMoveTime);
      const instantVelX = Math.abs(e.clientX - lastX) / dt;
      // EMA — dampens one-frame coalesced spikes that made swipes too hot.
      smoothVelX = smoothVelX * 0.65 + instantVelX * 0.35;
      lastX = e.clientX;
      lastY = e.clientY;
      lastMoveTime = now;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX > TAP_SLOP || absY > TAP_SLOP) {
        clearHoldTimer();
      }

      if (isTitleScreen()) return;

      // Commit to one axis so diagonal jitter can't flip modes mid-swipe
      if (axisLock === 'none' && (absX >= AXIS_LOCK_PX || absY >= AXIS_LOCK_PX)) {
        axisLock = absX > absY * 1.15 ? 'h' : absY > absX * 1.15 ? 'v' : 'none';
      }

      if (axisLock === 'h' || (axisLock === 'none' && absX > absY)) {
        const fromOrigin = e.clientX - stepOriginX;
        const dir: -1 | 1 = fromOrigin < 0 ? -1 : 1;

        // Direction reverse: re-arm from here, don't dump multiple cells
        if (moveDir !== 0 && dir !== moveDir) {
          moveDir = 0;
          stepOriginX = e.clientX;
          return;
        }

        const needed = stepDistanceForVelocity(smoothVelX, moveDir === 0);
        const travel = Math.abs(e.clientX - stepOriginX);
        if (travel < needed) return;

        // Default: one cell. Fast coalesced moves may take a second if earned.
        const maxSteps =
          moveDir !== 0 && smoothVelX >= VEL_FAST && travel >= needed * 2
            ? FAST_CATCHUP_STEPS
            : 1;

        let stepped = false;
        let steps = 0;
        while (steps < maxSteps) {
          const stepPx = stepDistanceForVelocity(smoothVelX, moveDir === 0);
          if (Math.abs(e.clientX - stepOriginX) < stepPx) break;
          hooks.move(dir);
          stepOriginX += dir * stepPx;
          moveDir = dir;
          consumed = true;
          stepped = true;
          steps += 1;
        }
        if (stepped) bump();
        return;
      }

      if (axisLock === 'v' || (axisLock === 'none' && absY >= absX)) {
        if (dy > BASE_STEP_PX) {
          if (!softDropping) {
            softDropping = true;
            input.setHeld('down', true);
            consumed = true;
            hooks.unlock();
          }
        } else if (softDropping && dy < BASE_STEP_PX * 0.5) {
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

    if (!longPressed && isFlickDown(dx, dy, avgVelocity, recentVelocity)) {
      hooks.hardDrop();
      bump();
    } else if (!longPressed && !consumed) {
      if (dist < TAP_SLOP) {
        if (isTitleScreen()) hooks.start();
        else hooks.rotate();
        bump();
      } else if (!isTitleScreen() && dy < -BASE_STEP_PX && absY > absX) {
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
