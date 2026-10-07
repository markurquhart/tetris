import { DAS_DELAY_MS, DAS_REPEAT_MS, SOFT_DROP_REPEAT_MS } from './constants';

export interface InputActions {
  moveLeft: boolean;
  moveRight: boolean;
  softDrop: boolean;
  rotateCw: boolean;
  rotateCcw: boolean;
  hardDrop: boolean;
  hold: boolean;
  pause: boolean;
  restart: boolean;
  mute: boolean;
  anyKey: boolean;
  start: boolean;
  levelUp: boolean;
  levelDown: boolean;
}

export class InputHandler {
  leftHeld = false;
  rightHeld = false;
  downHeld = false;
  leftInitialMove = false;
  rightInitialMove = false;
  downInitialMove = false;
  private leftNextAt = 0;
  private rightNextAt = 0;
  private downNextAt = 0;

  private rotateCw = false;
  private rotateCcw = false;
  private hardDrop = false;
  private hold = false;
  private pause = false;
  private restart = false;
  private mute = false;
  private anyKey = false;
  private start = false;
  private levelUp = false;
  private levelDown = false;
  private pendingMoveLeft = 0;
  private pendingMoveRight = 0;

  reset(): void {
    this.leftHeld = false;
    this.rightHeld = false;
    this.downHeld = false;
    this.leftInitialMove = false;
    this.rightInitialMove = false;
    this.downInitialMove = false;
    this.leftNextAt = 0;
    this.rightNextAt = 0;
    this.downNextAt = 0;
    this.clearOneShots();
    this.pendingMoveLeft = 0;
    this.pendingMoveRight = 0;
  }

  private clearOneShots(): void {
    this.rotateCw = false;
    this.rotateCcw = false;
    this.hardDrop = false;
    this.hold = false;
    this.pause = false;
    this.restart = false;
    this.mute = false;
    this.anyKey = false;
    this.start = false;
    this.levelUp = false;
    this.levelDown = false;
  }

  handleKeyDown(code: string, event?: KeyboardEvent): void {
    // Ignore browser/OS shortcuts (Cmd+R refresh, Ctrl+R, etc.)
    if (event?.metaKey || event?.ctrlKey || event?.altKey) return;

    this.anyKey = true;
    switch (code) {
      case 'ArrowLeft':
        this.leftHeld = true;
        this.leftInitialMove = false;
        this.leftNextAt = 0;
        break;
      case 'ArrowRight':
        this.rightHeld = true;
        this.rightInitialMove = false;
        this.rightNextAt = 0;
        break;
      case 'ArrowDown':
        this.downHeld = true;
        this.downInitialMove = false;
        this.downNextAt = 0;
        this.levelDown = true;
        break;
      case 'ArrowUp':
      case 'KeyX':
        this.rotateCw = true;
        this.levelUp = true;
        break;
      case 'KeyZ':
        this.rotateCcw = true;
        break;
      case 'Space':
        this.hardDrop = true;
        this.start = true;
        break;
      case 'KeyC':
        this.hold = true;
        break;
      case 'KeyP':
        this.pause = true;
        break;
      case 'KeyR':
        this.restart = true;
        break;
      case 'KeyM':
        this.mute = true;
        break;
      case 'Enter':
        this.start = true;
        this.restart = true;
        break;
      case 'Equal':
      case 'NumpadAdd':
        this.levelUp = true;
        break;
      case 'Minus':
      case 'NumpadSubtract':
        this.levelDown = true;
        break;
    }
  }

  handleKeyUp(code: string): void {
    switch (code) {
      case 'ArrowLeft':
        this.leftHeld = false;
        this.leftInitialMove = false;
        this.leftNextAt = 0;
        break;
      case 'ArrowRight':
        this.rightHeld = false;
        this.rightInitialMove = false;
        this.rightNextAt = 0;
        break;
      case 'ArrowDown':
        this.downHeld = false;
        this.downInitialMove = false;
        this.downNextAt = 0;
        break;
    }
  }

  /** Fire a one-shot action from on-screen touch buttons. */
  trigger(action: keyof Pick<
    InputActions,
    | 'rotateCw'
    | 'rotateCcw'
    | 'hardDrop'
    | 'hold'
    | 'pause'
    | 'restart'
    | 'mute'
    | 'start'
    | 'levelUp'
    | 'levelDown'
  >): void {
    this[action] = true;
    this.anyKey = true;
  }

  /** Queue a single left step (swipe). */
  triggerMoveLeft(): void {
    this.pendingMoveLeft += 1;
    this.anyKey = true;
  }

  /** Queue a single right step (swipe). */
  triggerMoveRight(): void {
    this.pendingMoveRight += 1;
    this.anyKey = true;
  }

  setHeld(
    direction: 'left' | 'right' | 'down',
    held: boolean,
  ): void {
    if (direction === 'left') {
      this.leftHeld = held;
      this.leftInitialMove = false;
      this.leftNextAt = 0;
    } else if (direction === 'right') {
      this.rightHeld = held;
      this.rightInitialMove = false;
      this.rightNextAt = 0;
    } else {
      this.downHeld = held;
      this.downInitialMove = false;
      this.downNextAt = 0;
    }
  }

  /**
   * Sample held directions against wall-clock time so DAS/ARR stay crisp
   * even when the sim drops or catches up frames under a busy board.
   */
  update(now = performance.now()): InputActions {
    const actions: InputActions = {
      moveLeft: this.pendingMoveLeft > 0,
      moveRight: this.pendingMoveRight > 0,
      softDrop: false,
      rotateCw: this.rotateCw,
      rotateCcw: this.rotateCcw,
      hardDrop: this.hardDrop,
      hold: this.hold,
      pause: this.pause,
      restart: this.restart,
      mute: this.mute,
      anyKey: this.anyKey,
      start: this.start,
      levelUp: this.levelUp,
      levelDown: this.levelDown,
    };

    if (this.pendingMoveLeft > 0) this.pendingMoveLeft -= 1;
    if (this.pendingMoveRight > 0) this.pendingMoveRight -= 1;
    this.clearOneShots();

    if (this.leftHeld) {
      if (!this.leftInitialMove) {
        actions.moveLeft = true;
        this.leftInitialMove = true;
        this.leftNextAt = now + DAS_DELAY_MS;
      } else if (now >= this.leftNextAt) {
        actions.moveLeft = true;
        this.leftNextAt = Math.max(now, this.leftNextAt) + DAS_REPEAT_MS;
      }
    }

    if (this.rightHeld) {
      if (!this.rightInitialMove) {
        actions.moveRight = true;
        this.rightInitialMove = true;
        this.rightNextAt = now + DAS_DELAY_MS;
      } else if (now >= this.rightNextAt) {
        actions.moveRight = true;
        this.rightNextAt = Math.max(now, this.rightNextAt) + DAS_REPEAT_MS;
      }
    }

    if (this.downHeld) {
      if (!this.downInitialMove) {
        actions.softDrop = true;
        this.downInitialMove = true;
        this.downNextAt = now + SOFT_DROP_REPEAT_MS;
      } else if (now >= this.downNextAt) {
        actions.softDrop = true;
        this.downNextAt = Math.max(now, this.downNextAt) + SOFT_DROP_REPEAT_MS;
      }
    }

    return actions;
  }
}
