import type { Board } from './board';
import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_X,
  BOARD_Y,
  CELL_SIZE,
  GHOST_ALPHA,
  SHAPES,
  WHITE,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
  rgb,
  type PieceType,
  type RGB,
} from './constants';
import type { Tetromino } from './tetromino';

/**
 * Playfield renderer.
 *
 * Draws the board, the active piece, its ghost, and the line-clear animation —
 * nothing else. Score, NEXT, HOLD, pause and game-over all live in the DOM, so
 * this file no longer renders a single glyph of text. That removed the canvas
 * text hot path entirely (it used to re-render three panels on every score
 * change); HTML text updates cost nothing by comparison.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cellSprites = new Map<string, HTMLCanvasElement>();
  private boardBg: HTMLCanvasElement | null = null;
  /** Frozen stack of locked cells — rebuilt only when board.revision changes. */
  private boardStack: HTMLCanvasElement | null = null;
  private boardStackRevision = -1;
  private boardStackCtx: CanvasRenderingContext2D | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  clear(): void {
    this.ctx.fillStyle = '#0d1016';
    this.ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);
  }

  private cellKey(color: RGB): string {
    return `${color[0]},${color[1]},${color[2]}`;
  }

  /**
   * One pre-rendered tile per colour. Flat fill, soft top highlight and a
   * rounded corner — reads as a modern UI tile rather than a bevelled 90s
   * sprite, and still costs a single drawImage per cell.
   */
  private getCellSprite(color: RGB): HTMLCanvasElement {
    const key = this.cellKey(color);
    const existing = this.cellSprites.get(key);
    if (existing) return existing;

    const sprite = document.createElement('canvas');
    sprite.width = CELL_SIZE;
    sprite.height = CELL_SIZE;
    const c = sprite.getContext('2d')!;

    const inset = 1;
    const size = CELL_SIZE - inset * 2;
    const radius = 6;

    const grad = c.createLinearGradient(0, inset, 0, inset + size);
    grad.addColorStop(0, rgb(lighten(color, 38)));
    grad.addColorStop(0.55, rgb(color));
    grad.addColorStop(1, rgb(darken(color, 26)));

    c.fillStyle = grad;
    roundRect(c, inset, inset, size, size, radius);
    c.fill();

    // Single hairline along the top edge for depth; no four-sided bevel.
    c.strokeStyle = rgb(lighten(color, 70), 0.55);
    c.lineWidth = 1;
    roundRect(c, inset + 0.5, inset + 0.5, size - 1, size - 1, radius - 0.5);
    c.stroke();

    this.cellSprites.set(key, sprite);
    return sprite;
  }

  private drawCellOn(
    target: CanvasRenderingContext2D,
    row: number,
    col: number,
    color: RGB,
  ): void {
    target.drawImage(
      this.getCellSprite(color),
      BOARD_X + col * CELL_SIZE,
      BOARD_Y + row * CELL_SIZE,
    );
  }

  private ensureBoardStack(): HTMLCanvasElement {
    if (!this.boardStack) {
      this.boardStack = document.createElement('canvas');
      this.boardStack.width = WINDOW_WIDTH;
      this.boardStack.height = WINDOW_HEIGHT;
      this.boardStackCtx = this.boardStack.getContext('2d');
    }
    return this.boardStack;
  }

  /**
   * Every locked cell except rows mid-clear-animation. Cacheable: depends only
   * on board.revision, so a full stack costs one blit per frame.
   */
  private paintStableCells(target: CanvasRenderingContext2D, board: Board): void {
    for (let row = 0; row < BOARD_ROWS; row++) {
      if (board.isRowInClearAnimation(row)) continue;
      const gridRow = board.grid[row + BOARD_HIDDEN_ROWS];
      for (let col = 0; col < BOARD_COLS; col++) {
        const color = gridRow[col];
        if (color) this.drawCellOn(target, row, col, color);
      }
    }
  }

  /** The <=4 rows currently retracting. Live every frame, but bounded. */
  private paintClearingRows(
    target: CanvasRenderingContext2D,
    board: Board,
    lineClearProgress: number,
  ): void {
    const flash = Math.floor(lineClearProgress * 10) % 2 === 0;
    const center = BOARD_COLS / 2;
    for (const gridRowIndex of board.clearedLines) {
      const row = gridRowIndex - BOARD_HIDDEN_ROWS;
      if (row < 0 || row >= BOARD_ROWS) continue;
      const gridRow = board.grid[gridRowIndex];
      const cellsHidden = board.getRowClearProgress(row, lineClearProgress);
      for (let col = 0; col < BOARD_COLS; col++) {
        const color = gridRow[col];
        if (!color) continue;
        if (col < center - cellsHidden || col >= center + cellsHidden) {
          this.drawCellOn(target, row, col, flash ? WHITE : color);
        }
      }
    }
  }

  drawBoardBackground(): void {
    if (!this.boardBg) {
      this.boardBg = document.createElement('canvas');
      this.boardBg.width = WINDOW_WIDTH;
      this.boardBg.height = WINDOW_HEIGHT;
      const c = this.boardBg.getContext('2d')!;

      c.fillStyle = '#0d1016';
      c.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

      c.fillStyle = '#141922';
      roundRect(c, BOARD_X, BOARD_Y, BOARD_COLS * CELL_SIZE, BOARD_ROWS * CELL_SIZE, 10);
      c.fill();

      // Recessive grid: dots at cell corners rather than full rules.
      c.fillStyle = 'rgba(148, 163, 184, 0.14)';
      for (let row = 1; row < BOARD_ROWS; row++) {
        for (let col = 1; col < BOARD_COLS; col++) {
          c.fillRect(BOARD_X + col * CELL_SIZE - 1, BOARD_Y + row * CELL_SIZE - 1, 2, 2);
        }
      }
    }

    this.ctx.drawImage(this.boardBg, 0, 0);
  }

  drawBoard(board: Board, lineClearProgress = 0): void {
    const stack = this.ensureBoardStack();
    if (this.boardStackRevision !== board.revision) {
      const c = this.boardStackCtx!;
      c.clearRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);
      this.paintStableCells(c, board);
      this.boardStackRevision = board.revision;
    }

    // startLineClearAnimation() bumps revision, so the cache above excludes the
    // clearing rows and stays valid for the whole animation.
    this.ctx.drawImage(stack, 0, 0);

    if (board.clearedLines.length > 0) {
      this.paintClearingRows(this.ctx, board, lineClearProgress);
    }
  }

  drawPiece(piece: Tetromino | null): void {
    if (!piece) return;
    for (const [row, col] of piece.getCells()) {
      const visibleRow = row - BOARD_HIDDEN_ROWS;
      if (visibleRow >= 0) this.drawCellOn(this.ctx, visibleRow, col, piece.color);
    }
  }

  drawGhost(piece: Tetromino | null, ghostRow: number | null): void {
    if (!piece || ghostRow === null) return;
    const cells = piece.getCellsAt(ghostRow, piece.col, piece.rotationState);

    for (const [row, col] of cells) {
      const visibleRow = row - BOARD_HIDDEN_ROWS;
      if (visibleRow < 0) continue;
      const x = BOARD_X + col * CELL_SIZE;
      const y = BOARD_Y + visibleRow * CELL_SIZE;

      this.ctx.fillStyle = rgb(piece.color, GHOST_ALPHA / 255 / 1.7);
      roundRect(this.ctx, x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, 5);
      this.ctx.fill();

      // Bright rim keeps dark blues/purples legible against the board.
      this.ctx.strokeStyle = rgb(lighten(piece.color, 90), 0.8);
      this.ctx.lineWidth = 1.5;
      roundRect(this.ctx, x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, 5);
      this.ctx.stroke();
    }
  }
}

/**
 * Renders a piece preview into a small standalone canvas (NEXT / HOLD cards).
 * Separate from Renderer because these are DOM components with their own
 * lifecycle, not part of the per-frame playfield paint.
 */
export function drawPiecePreview(
  canvas: HTMLCanvasElement,
  pieceType: PieceType | null,
  color: RGB | null,
  dimmed = false,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (pieceType === null || !color) return;

  const shape = SHAPES[pieceType][0];
  const rows = shape.map(([r]) => r);
  const cols = shape.map(([, c]) => c);
  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);

  const cellsW = maxC - minC + 1;
  const cellsH = maxR - minR + 1;
  const cell = Math.floor(Math.min((w - 8) / cellsW, (h - 8) / cellsH));
  const offsetX = Math.round((w - cellsW * cell) / 2);
  const offsetY = Math.round((h - cellsH * cell) / 2);

  ctx.globalAlpha = dimmed ? 0.3 : 1;
  for (const [r, c] of shape) {
    const x = offsetX + (c - minC) * cell;
    const y = offsetY + (r - minR) * cell;
    const grad = ctx.createLinearGradient(0, y, 0, y + cell);
    grad.addColorStop(0, rgb(lighten(color, 38)));
    grad.addColorStop(1, rgb(darken(color, 20)));
    ctx.fillStyle = grad;
    roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, Math.max(2, cell * 0.2));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function lighten(color: RGB, amount: number): RGB {
  return [
    Math.min(color[0] + amount, 255),
    Math.min(color[1] + amount, 255),
    Math.min(color[2] + amount, 255),
  ];
}

function darken(color: RGB, amount: number): RGB {
  return [
    Math.max(color[0] - amount, 0),
    Math.max(color[1] - amount, 0),
    Math.max(color[2] - amount, 0),
  ];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
