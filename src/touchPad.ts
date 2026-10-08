import type { InputHandler } from './input';

export interface TouchPadHooks {
  unlock: () => void;
  rotate: () => void;
  hardDrop: () => void;
  hold: () => void;
  paint: () => void;
  isPlayable: () => boolean;
}

type HoldDir = 'left' | 'right' | 'down';

/**
 * Bind large LEFT/RIGHT/DOWN hold zones to InputHandler DAS/ARR, and one-shot
 * ROTATE / HARD DROP / HOLD buttons. TouchEvents for fingers; Pointer for mouse.
 */
export function bindTouchPad(
  root: HTMLElement,
  input: InputHandler,
  hooks: TouchPadHooks,
): void {
  const holds = root.querySelectorAll<HTMLElement>('[data-hold]');
  const actions = root.querySelectorAll<HTMLElement>('[data-action]');

  const activeHolds = new Map<number | string, HoldDir>();

  const releaseHold = (key: number | string) => {
    const dir = activeHolds.get(key);
    if (!dir) return;
    activeHolds.delete(key);
    // Only clear if no other contact still holds the same direction.
    for (const other of activeHolds.values()) {
      if (other === dir) return;
    }
    input.setHeld(dir, false);
  };

  const pressHold = (key: number | string, dir: HoldDir, el: HTMLElement) => {
    if (!hooks.isPlayable()) return;
    activeHolds.set(key, dir);
    input.setHeld(dir, true);
    el.classList.add('is-pressed');
    hooks.unlock();
    hooks.paint();
  };

  const clearPressedClass = (dir: HoldDir) => {
    for (const el of holds) {
      if (el.dataset.hold === dir && ![...activeHolds.values()].includes(dir)) {
        el.classList.remove('is-pressed');
      }
    }
  };

  const endHoldKey = (key: number | string) => {
    const dir = activeHolds.get(key);
    releaseHold(key);
    if (dir) clearPressedClass(dir);
  };

  for (const el of holds) {
    const dir = el.dataset.hold as HoldDir | undefined;
    if (dir !== 'left' && dir !== 'right' && dir !== 'down') continue;

    let touchId: number | null = null;
    let pointerId: number | null = null;

    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (touchId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        touchId = t.identifier;
        pressHold(`t:${t.identifier}`, dir, el);
      },
      { passive: false },
    );

    const finishTouch = (e: TouchEvent) => {
      if (touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchId) {
          e.preventDefault();
          endHoldKey(`t:${t.identifier}`);
          touchId = null;
          break;
        }
      }
    };

    el.addEventListener('touchend', finishTouch, { passive: false });
    el.addEventListener('touchcancel', finishTouch, { passive: false });

    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pointerId = e.pointerId;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        pressHold(`p:${e.pointerId}`, dir, el);
      },
      { passive: false },
    );

    const finishPointer = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      e.preventDefault();
      endHoldKey(`p:${e.pointerId}`);
      pointerId = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    el.addEventListener('pointerup', finishPointer, { passive: false });
    el.addEventListener('pointercancel', finishPointer, { passive: false });
    el.addEventListener('lostpointercapture', () => {
      if (pointerId !== null) {
        endHoldKey(`p:${pointerId}`);
        pointerId = null;
      }
    });
  }

  // Release all holds if the tab hides mid-press.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') return;
    for (const key of [...activeHolds.keys()]) endHoldKey(key);
  });

  for (const el of actions) {
    const action = el.dataset.action;
    if (!action) continue;

    const fire = () => {
      if (!hooks.isPlayable() && action !== 'hold') {
        // Allow rotate/drop only while playing; hold also only while playing.
      }
      if (!hooks.isPlayable()) return;
      hooks.unlock();
      if (action === 'rotate') hooks.rotate();
      else if (action === 'hardDrop') hooks.hardDrop();
      else if (action === 'hold') hooks.hold();
      hooks.paint();
    };

    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('is-pressed');
        fire();
      },
      { passive: false },
    );

    const clearTouchPress = () => el.classList.remove('is-pressed');
    el.addEventListener('touchend', clearTouchPress, { passive: true });
    el.addEventListener('touchcancel', clearTouchPress, { passive: true });

    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('is-pressed');
        fire();
      },
      { passive: false },
    );

    el.addEventListener('pointerup', () => el.classList.remove('is-pressed'));
    el.addEventListener('pointercancel', () => el.classList.remove('is-pressed'));
    el.addEventListener('pointerleave', () => el.classList.remove('is-pressed'));
  }
}
