import { CELL_SIZE, WINDOW_WIDTH } from './constants';
import type { InputHandler } from './input';
import { isButtonDasScheme } from './touchScheme';

/**
 * Cell-space touch model — fingers on a **TouchEvent** path, mouse/pen on Pointer.
 *
 * When `TOUCH_SCHEME_BUTTON_DAS` is on (default), horizontal seekCol / precision-
 * travel and flick hard-drop are OFF. Canvas keeps optional tap-rotate; soft drop
 * uses setHeld('down') on a downward drag (not the same continuum as hard drop).
 *
 * Legacy finger-follow (precision vs travel) remains behind `?controls=gestures`.
 */
const TAP_SLOP_CELLS = 0.28;
/** First 1-cell nudge — kept under half a cell so first contact feels immediate. */
const PRECISION_COMMIT_CELLS = 0.38;
const TRAVEL_UNLOCK_CELLS = 2.15;
const FLICK_DISTANCE_CELLS = 1.85;
const FLICK_VELOCITY = 0.55; // px/ms
const FLICK_MAX_MS = 420;
const HOLD_MS = 420;
/** Axis direction can lock once the finger clears this (was too high → first-move mush). */
const AXIS_LOCK_CELLS = 0.22;
const HOLD_SWIPE_UP_CELLS = 0.95;
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

/** Last contact source that began a gesture (`touch` | `pointer`). For demos/tests. */
let lastGestureSource: 'touch' | 'pointer' | null = null;

export function getLastGestureSource(): 'touch' | 'pointer' | null {
  return lastGestureSource;
}

/**
 * Playfield gestures. Finger input is driven by TouchEvents; mouse/pen by PointerEvents.
 * Touch and pointer never process the same contact (avoids double seeks).
 */
export function bindPlayfieldGestures(
  surface: HTMLElement,
  input: InputHandler,
  hooks: GestureHooks,
  isTitleScreen: () => boolean,
): void {
  const buttonDas = isButtonDasScheme();
  type Source = 'none' | 'touch' | 'pointer';
  let source: Source = 'none';
  let pointerId: number | null = null;
  let touchId: number | null = null;
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
  let softHeld = false;
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
      // Prefer horizontal when close — first-contact L/R is the common action.
      if (absX >= absY * 0.95) axisLock = 'h';
      else if (absY > absX * 1.15) axisLock = 'v';
      return;
    }
    if (axisLock === 'v' && absX > absY * AXIS_V_TO_H_RATIO) {
      axisLock = 'h';
    } else if (axisLock === 'h' && absY > absX * AXIS_H_TO_V_RATIO) {
      axisLock = 'v';
    }
  };

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
    return Math.max(avgVelocity, recentVelocity) >= FLICK_VELOCITY;
  };

  const releaseSoft = () => {
    if (!softHeld) return;
    softHeld = false;
    input.setHeld('down', false);
  };

  const beginContact = (clientX: number, clientY: number, src: Exclude<Source, 'none'>): void => {
    scale = readScale(surface);
    source = src;
    lastGestureSource = src;
    startX = lastX = sampleX = clientX;
    startY = lastY = sampleY = clientY;
    startTime = sampleTime = performance.now();
    axisLock = 'none';
    hTravel = false;
    vTravel = false;
    didHorizontal = false;
    didVertical = false;
    softHeld = false;
    longPressed = false;
    consumed = false;
    regrab(clientX, clientY);
    // Legacy path clears soft-drop on new contact; button DAS leaves pad holds alone.
    if (!buttonDas) input.setHeld('down', false);
    // Defer audio unlock so it never races first-move seek/paint.
    queueMicrotask(() => hooks.unlock());

    clearHoldTimer();
    holdTimer = window.setTimeout(() => {
      if (source === 'none' || consumed || isTitleScreen()) return;
      const dx = lastX - startX;
      const dy = lastY - startY;
      if (Math.hypot(dx, dy) < scale.tapSlop) {
        longPressed = true;
        consumed = true;
        hooks.hold();
        bump();
      }
    }, HOLD_MS);
  };

  const moveContact = (clientX: number, clientY: number): void => {
    const now = performance.now();
    if (now - sampleTime >= 40) {
      sampleX = lastX;
      sampleY = lastY;
      sampleTime = now;
    }

    lastX = clientX;
    lastY = clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > scale.tapSlop || absY > scale.tapSlop) {
      clearHoldTimer();
    }

    if (isTitleScreen()) return;

    // Button+DAS scheme: no seekCol / precision-travel. Optional soft-drop hold
    // on a clear downward drag; hard drop is dock-only (never from this drag).
    if (buttonDas) {
      if (dy > scale.tapSlop && absY > absX * 1.15) {
        if (!softHeld) {
          softHeld = true;
          input.setHeld('down', true);
          consumed = true;
          bump();
        }
      } else if (softHeld && (dy <= scale.tapSlop || absX >= absY)) {
        releaseSoft();
      }
      return;
    }

    updateAxisLock(absX, absY);

    // Eager first-axis: once past tap slop with a clear winner, lock so the
    // first cell can commit without waiting for a second threshold.
    if (axisLock === 'none' && (absX > scale.tapSlop || absY > scale.tapSlop)) {
      if (absX >= absY) axisLock = 'h';
      else axisLock = 'v';
    }

    if (axisLock === 'h' || (axisLock === 'none' && absX >= absY)) {
      if (syncHorizontal(clientX, clientY)) {
        consumed = true;
        bump();
      }
      return;
    }

    if (axisLock === 'v' || (axisLock === 'none' && absY > absX)) {
      if (dy > 0 && syncVertical(clientX, clientY)) {
        consumed = true;
        bump();
      }
    }
  };

  const endContact = (clientX: number, clientY: number): void => {
    const now = performance.now();
    const dx = clientX - startX;
    const dy = clientY - startY;
    const dt = Math.max(1, now - startTime);
    const dist = Math.hypot(dx, dy);
    const avgVelocity = dist / dt;
    const recentDt = Math.max(1, now - sampleTime);
    const recentVelocity = Math.hypot(clientX - sampleX, clientY - sampleY) / recentDt;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    clearHoldTimer();
    releaseSoft();

    if (buttonDas) {
      // No flick hard-drop on the soft-drop continuum; tap = rotate (or start).
      // Do not clear pad DOWN holds — only releaseSoft() undoes canvas soft-drop.
      if (!longPressed && !consumed) {
        if (dist < scale.tapSlop) {
          if (isTitleScreen()) hooks.start();
          else hooks.rotate();
          bump();
        } else if (!isTitleScreen() && dy <= -scale.holdUp && absY > absX * 1.15) {
          hooks.hold();
          bump();
        }
      }
      source = 'none';
      pointerId = null;
      touchId = null;
      return;
    }

    input.setHeld('down', false);

    if (!longPressed && !isTitleScreen()) {
      if (axisLock === 'h' || (axisLock === 'none' && absX >= absY && absX >= scale.tapSlop)) {
        if (syncHorizontal(clientX, clientY)) {
          consumed = true;
          bump();
        }
      } else if (
        (axisLock === 'v' || (axisLock === 'none' && absY > absX)) &&
        dy > 0
      ) {
        if (syncVertical(clientX, clientY)) {
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

    source = 'none';
    pointerId = null;
    touchId = null;
  };

  // ── Finger path: real TouchEvents (primary on mobile) ───────────────────
  surface.addEventListener(
    'touchstart',
    (e) => {
      // Always preventDefault on the playfield — stops scroll, 300ms click
      // delay, and compatibility mouse events that make first contact mushy.
      e.preventDefault();
      if (source !== 'none') return;
      const t = e.changedTouches[0];
      if (!t) return;
      touchId = t.identifier;
      beginContact(t.clientX, t.clientY, 'touch');
    },
    { passive: false },
  );

  surface.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      if (source !== 'touch' || touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchId) {
          moveContact(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false },
  );

  const finishTouch = (e: TouchEvent) => {
    e.preventDefault();
    if (source !== 'touch' || touchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId) {
        endContact(t.clientX, t.clientY);
        break;
      }
    }
  };

  surface.addEventListener('touchend', finishTouch, { passive: false });
  surface.addEventListener('touchcancel', finishTouch, { passive: false });

  // ── Mouse / pen path: PointerEvents (ignore touch — already handled) ────
  surface.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') return; // TouchEvent path owns fingers
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (source !== 'none') return;
      e.preventDefault();
      pointerId = e.pointerId;
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      beginContact(e.clientX, e.clientY, 'pointer');
    },
    { passive: false },
  );

  surface.addEventListener(
    'pointermove',
    (e) => {
      if (source !== 'pointer' || e.pointerId !== pointerId) return;
      e.preventDefault();
      moveContact(e.clientX, e.clientY);
    },
    { passive: false },
  );

  const finishPointer = (e: PointerEvent) => {
    if (source !== 'pointer' || e.pointerId !== pointerId) return;
    e.preventDefault();
    endContact(e.clientX, e.clientY);
    try {
      surface.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  surface.addEventListener('pointerup', finishPointer, { passive: false });
  surface.addEventListener('pointercancel', finishPointer, { passive: false });

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
