import { Board } from './board';
import {
  GRAVITY_FRAMES,
  I_PIECE,
  J_PIECE,
  L_PIECE,
  LINE_CLEAR_ANIMATION_FRAMES,
  LINES_PER_LEVEL,
  LOCK_DELAY_FRAMES,
  O_PIECE,
  S_PIECE,
  SCORE_DOUBLE,
  SCORE_HARD_DROP,
  SCORE_SINGLE,
  SCORE_SOFT_DROP,
  SCORE_TETRIS,
  SCORE_TRIPLE,
  STATE_GAME_OVER,
  STATE_LINE_CLEAR,
  STATE_PAUSED,
  STATE_PLAYING,
  STATE_START,
  T_PIECE,
  Z_PIECE,
  type GameState,
  type PieceType,
} from './constants';
import type { InputActions } from './input';
import type { SoundManager } from './sound';
import { Tetromino } from './tetromino';

const ALL_PIECES: PieceType[] = [I_PIECE, O_PIECE, T_PIECE, S_PIECE, Z_PIECE, J_PIECE, L_PIECE];

export class Game {
  board = new Board();
  state: GameState = STATE_START;
  selectedLevel = 0;
  score = 0;
  highScore = 0;
  linesCleared = 0;
  level = 0;
  currentPiece: Tetromino | null = null;
  holdPieceType: PieceType | null = null;
  holdAvailable = true;
  pieceBag: PieceType[] = [];
  nextPieces: PieceType[] = [];
  gravityCounter = 0;
  lockCounter = 0;
  isLocking = false;
  lockMovesRemaining = 15;
  lineClearCounter = 0;
  linesToClear: number[] = [];
  isNewHighScore = false;
  private sound: SoundManager;

  constructor(sound: SoundManager) {
    this.sound = sound;
  }

  setHighScore(score: number): void {
    this.highScore = score;
  }

  startGame(): void {
    this.board.reset();
    this.state = STATE_PLAYING;
    this.score = 0;
    this.linesCleared = 0;
    this.level = this.selectedLevel;
    this.currentPiece = null;
    this.holdPieceType = null;
    this.holdAvailable = true;
    this.pieceBag = [];
    this.nextPieces = [];
    this.gravityCounter = 0;
    this.lockCounter = 0;
    this.isLocking = false;
    this.isNewHighScore = false;

    this.refillBag();
    for (let i = 0; i < 3; i++) {
      this.nextPieces.push(this.getNextPieceType());
    }
    this.spawnPiece();
  }

  private refillBag(): void {
    const bag = [...ALL_PIECES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.pieceBag.push(...bag);
  }

  private getNextPieceType(): PieceType {
    if (this.pieceBag.length < 7) this.refillBag();
    return this.pieceBag.shift()!;
  }

  private spawnPiece(): void {
    const pieceType = this.nextPieces.length
      ? this.nextPieces.shift()!
      : this.getNextPieceType();
    this.nextPieces.push(this.getNextPieceType());

    this.currentPiece = new Tetromino(pieceType);
    this.isLocking = false;
    this.lockCounter = 0;
    this.lockMovesRemaining = 15;
    this.holdAvailable = true;

    if (!this.board.cellsValid(this.currentPiece.getCells())) {
      this.gameOver();
    }
  }

  private gameOver(): void {
    this.state = STATE_GAME_OVER;
    this.sound.play('game_over');
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewHighScore = true;
    }
  }

  private getGravityFrames(): number {
    const level = Math.min(this.level, 29);
    return GRAVITY_FRAMES[level] ?? 1;
  }

  private tryMove(dRow: number, dCol: number): boolean {
    if (!this.currentPiece) return false;
    const newCells = this.currentPiece.getCellsAt(
      this.currentPiece.row + dRow,
      this.currentPiece.col + dCol,
      this.currentPiece.rotationState,
    );
    if (this.board.cellsValid(newCells)) {
      this.currentPiece.move(dRow, dCol);
      return true;
    }
    return false;
  }

  private tryRotate(clockwise: boolean): boolean {
    if (!this.currentPiece) return false;
    const fromState = this.currentPiece.rotationState;
    const toState = (fromState + (clockwise ? 1 : -1) + 4) % 4;
    const kicks = this.currentPiece.getWallKicks(fromState, toState);

    for (const [rowOffset, colOffset] of kicks) {
      const newRow = this.currentPiece.row + rowOffset;
      const newCol = this.currentPiece.col + colOffset;
      const newCells = this.currentPiece.getCellsAt(newRow, newCol, toState);
      if (this.board.cellsValid(newCells)) {
        this.currentPiece.row = newRow;
        this.currentPiece.col = newCol;
        this.currentPiece.rotationState = toState;
        return true;
      }
    }
    return false;
  }

  private checkOnGround(): boolean {
    if (!this.currentPiece) return false;
    const below = this.currentPiece.getCellsAt(
      this.currentPiece.row + 1,
      this.currentPiece.col,
      this.currentPiece.rotationState,
    );
    return !this.board.cellsValid(below);
  }

  private lockPiece(): void {
    if (!this.currentPiece) return;
    const valid = this.board.lockPiece(this.currentPiece);
    this.sound.play('lock');
    if (!valid) {
      this.gameOver();
      return;
    }

    const completeLines = this.board.findCompleteLines();
    if (completeLines.length) {
      this.board.startLineClearAnimation(completeLines);
      this.linesToClear = completeLines;
      this.lineClearCounter = 0;
      this.state = STATE_LINE_CLEAR;
      this.currentPiece = null;
      this.sound.play(completeLines.length === 4 ? 'tetris' : 'line_clear');
    } else {
      this.spawnPiece();
    }
  }

  private finishLineClear(): void {
    const numLines = this.board.endLineClearAnimation();
    const levelMultiplier = this.level + 1;
    let points = SCORE_TETRIS * levelMultiplier;
    if (numLines === 1) points = SCORE_SINGLE * levelMultiplier;
    else if (numLines === 2) points = SCORE_DOUBLE * levelMultiplier;
    else if (numLines === 3) points = SCORE_TRIPLE * levelMultiplier;

    this.score += points;
    this.linesCleared += numLines;

    const oldLevel = this.level;
    this.level = this.selectedLevel + Math.floor(this.linesCleared / LINES_PER_LEVEL);
    if (this.level > oldLevel) this.sound.play('level_up');

    this.state = STATE_PLAYING;
    this.spawnPiece();
  }

  private doHardDrop(): void {
    if (!this.currentPiece) return;
    let dropDistance = 0;
    while (this.tryMove(1, 0)) dropDistance += 1;
    this.score += dropDistance * SCORE_HARD_DROP;
    this.sound.play('hard_drop');
    this.lockPiece();
  }

  private doHold(): void {
    if (!this.currentPiece || !this.holdAvailable) return;
    const currentType = this.currentPiece.pieceType;
    if (this.holdPieceType === null) {
      this.holdPieceType = currentType;
      this.spawnPiece();
    } else {
      this.currentPiece = new Tetromino(this.holdPieceType);
      this.holdPieceType = currentType;
    }
    this.holdAvailable = false;
    this.isLocking = false;
    this.lockCounter = 0;
    this.sound.play('hold');
  }

  handleInput(actions: InputActions): void {
    if (this.state === STATE_START) {
      if (actions.anyKey || actions.hardDrop || actions.start) {
        this.startGame();
        this.sound.play('select');
      }
      if (actions.rotateCw || actions.levelUp) {
        this.selectedLevel = Math.min(9, this.selectedLevel + 1);
        this.sound.play('move');
      }
      if (actions.rotateCcw || actions.levelDown) {
        this.selectedLevel = Math.max(0, this.selectedLevel - 1);
        this.sound.play('move');
      }
      return;
    }

    if (this.state === STATE_GAME_OVER) {
      if (actions.restart) {
        this.state = STATE_START;
        this.sound.play('select');
      }
      return;
    }

    if (this.state === STATE_PAUSED) {
      if (actions.pause) this.state = STATE_PLAYING;
      return;
    }

    if (this.state === STATE_LINE_CLEAR) return;

    if (actions.pause) {
      this.state = STATE_PAUSED;
      return;
    }
    if (actions.restart) {
      this.state = STATE_START;
      return;
    }
    if (!this.currentPiece) return;

    let moved = false;
    if (actions.moveLeft && this.tryMove(0, -1)) {
      moved = true;
      this.sound.play('move');
    }
    if (actions.moveRight && this.tryMove(0, 1)) {
      moved = true;
      this.sound.play('move');
    }
    if (actions.softDrop && this.tryMove(1, 0)) {
      this.score += SCORE_SOFT_DROP;
      this.gravityCounter = 0;
    }
    if (actions.rotateCw && this.tryRotate(true)) {
      moved = true;
      this.sound.play('rotate');
    }
    if (actions.rotateCcw && this.tryRotate(false)) {
      moved = true;
      this.sound.play('rotate');
    }
    if (actions.hardDrop) {
      this.doHardDrop();
      return;
    }
    if (actions.hold) {
      this.doHold();
      return;
    }

    if (moved && this.isLocking && this.lockMovesRemaining > 0) {
      this.lockCounter = 0;
      this.lockMovesRemaining -= 1;
    }
  }

  update(): number | null {
    if (this.state === STATE_LINE_CLEAR) {
      this.lineClearCounter += 1;
      const progress = this.lineClearCounter / LINE_CLEAR_ANIMATION_FRAMES;
      if (this.lineClearCounter >= LINE_CLEAR_ANIMATION_FRAMES) {
        this.finishLineClear();
        return null;
      }
      return progress;
    }

    if (this.state !== STATE_PLAYING || !this.currentPiece) return null;

    this.gravityCounter += 1;
    if (this.gravityCounter >= this.getGravityFrames()) {
      this.gravityCounter = 0;
      if (!this.tryMove(1, 0) && !this.isLocking) {
        this.isLocking = true;
        this.lockCounter = 0;
      }
    }

    if (this.isLocking) {
      if (!this.checkOnGround()) {
        this.isLocking = false;
        this.lockCounter = 0;
      } else {
        this.lockCounter += 1;
        if (this.lockCounter >= LOCK_DELAY_FRAMES || this.lockMovesRemaining <= 0) {
          this.lockPiece();
        }
      }
    }

    return null;
  }

  getGhostRow(): number | null {
    if (!this.currentPiece) return null;
    return this.currentPiece.getGhostPosition(this.board);
  }
}
