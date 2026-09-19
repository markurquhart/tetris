import { DAS_DELAY_FRAMES, DAS_REPEAT_FRAMES } from './constants';

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
  leftDasCounter = 0;
  rightDasCounter = 0;
  downDasCounter = 0;
  leftInitialMove = false;
  rightInitialMove = false;
  downInitialMove = false;

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
    this.leftDasCounter = 0;
    this.rightDasCounter = 0;
    this.downDasCounter = 0;
    this.leftInitialMove = false;
    this.rightInitialMove = false;
    this.downInitialMove = false;
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
        this.leftDasCounter = 0;
        this.leftInitialMove = false;
        break;
      case 'ArrowRight':
        this.rightHeld = true;
        this.rightDasCounter = 0;
        this.rightInitialMove = false;
        break;
      case 'ArrowDown':
        this.downHeld = true;
        this.downDasCounter = 0;
        this.downInitialMove = false;
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
        this.leftDasCounter = 0;
        this.leftInitialMove = false;
        break;
      case 'ArrowRight':
        this.rightHeld = false;
        this.rightDasCounter = 0;
        this.rightInitialMove = false;
        break;
      case 'ArrowDown':
        this.downHeld = false;
        this.downDasCounter = 0;
        this.downInitialMove = false;
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
      this.leftDasCounter = 0;
      this.leftInitialMove = false;
    } else if (direction === 'right') {
      this.rightHeld = held;
      this.rightDasCounter = 0;
      this.rightInitialMove = false;
    } else {
      this.downHeld = held;
      this.downDasCounter = 0;
      this.downInitialMove = false;
    }
  }

  update(): InputActions {
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
      } else {
        this.leftDasCounter += 1;
        if (this.leftDasCounter >= DAS_DELAY_FRAMES) {
          const repeatFrame = this.leftDasCounter - DAS_DELAY_FRAMES;
          if (repeatFrame % DAS_REPEAT_FRAMES === 0) actions.moveLeft = true;
        }
      }
    }

    if (this.rightHeld) {
      if (!this.rightInitialMove) {
        actions.moveRight = true;
        this.rightInitialMove = true;
      } else {
        this.rightDasCounter += 1;
        if (this.rightDasCounter >= DAS_DELAY_FRAMES) {
          const repeatFrame = this.rightDasCounter - DAS_DELAY_FRAMES;
          if (repeatFrame % DAS_REPEAT_FRAMES === 0) actions.moveRight = true;
        }
      }
    }

    if (this.downHeld) {
      if (!this.downInitialMove) {
        actions.softDrop = true;
        this.downInitialMove = true;
      } else {
        this.downDasCounter += 1;
        if (this.downDasCounter % 2 === 0) actions.softDrop = true;
      }
    }

    return actions;
  }
}
