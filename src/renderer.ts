import type { Board } from './board';
import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_ROWS,
  BOARD_X,
  BOARD_Y,
  CELL_SIZE,
  DARK_GRAY,
  GHOST_ALPHA,
  HOLD_PANEL_X,
  HOLD_PANEL_Y,
  NEXT_PANEL_X,
  NEXT_PANEL_Y,
  PIECE_COLORS,
  SCORE_PANEL_X,
  SCORE_PANEL_Y,
  SHAPES,
  WHITE,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
  rgb,
  type PieceType,
  type RGB,
} from './constants';
import type { Tetromino } from './tetromino';

const PIXEL = '"Press Start 2P", monospace';
const UI = '"Chakra Petch", sans-serif';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private tick = 0;
  private cellSprites = new Map<string, HTMLCanvasElement>();
  private boardBg: HTMLCanvasElement | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  clear(): void {
    this.tick += 1;
    this.ctx.fillStyle = '#05070c';
    this.ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    // Cheap dust — skip most frames on busy boards
    if (this.tick % 3 === 0) {
      this.ctx.fillStyle = 'rgba(255,200,120,0.07)';
      for (let i = 0; i < 10; i++) {
        const x = (i * 73 + this.tick) % WINDOW_WIDTH;
        const y = (i * 97) % WINDOW_HEIGHT;
        this.ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  private cellKey(color: RGB): string {
    return `${color[0]},${color[1]},${color[2]}`;
  }

  private getCellSprite(color: RGB): HTMLCanvasElement {
    const key = this.cellKey(color);
    let sprite = this.cellSprites.get(key);
    if (sprite) return sprite;

    sprite = document.createElement('canvas');
    sprite.width = CELL_SIZE;
    sprite.height = CELL_SIZE;
    const c = sprite.getContext('2d')!;

    const grad = c.createLinearGradient(0, 0, 0, CELL_SIZE);
    grad.addColorStop(
      0,
      rgb([
        Math.min(color[0] + 60, 255),
        Math.min(color[1] + 60, 255),
        Math.min(color[2] + 60, 255),
      ]),
    );
    grad.addColorStop(1, rgb(color));
    c.fillStyle = grad;
    c.fillRect(1, 1, CELL_SIZE - 2, CELL_SIZE - 2);

    c.strokeStyle = rgb([
      Math.min(color[0] + 90, 255),
      Math.min(color[1] + 90, 255),
      Math.min(color[2] + 90, 255),
    ]);
    c.beginPath();
    c.moveTo(1, 1);
    c.lineTo(CELL_SIZE - 2, 1);
    c.moveTo(1, 1);
    c.lineTo(1, CELL_SIZE - 2);
    c.stroke();

    c.strokeStyle = rgb([
      Math.max(color[0] - 70, 0),
      Math.max(color[1] - 70, 0),
      Math.max(color[2] - 70, 0),
    ]);
    c.beginPath();
    c.moveTo(1, CELL_SIZE - 2);
    c.lineTo(CELL_SIZE - 2, CELL_SIZE - 2);
    c.moveTo(CELL_SIZE - 2, 1);
    c.lineTo(CELL_SIZE - 2, CELL_SIZE - 2);
    c.stroke();

    this.cellSprites.set(key, sprite);
    return sprite;
  }

  private drawCell(row: number, col: number, color: RGB, alpha = 255): void {
    const x = BOARD_X + col * CELL_SIZE;
    const y = BOARD_Y + row * CELL_SIZE;

    if (alpha < 255) {
      this.ctx.fillStyle = rgb(color, alpha / 255);
      this.ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      return;
    }

    this.ctx.drawImage(this.getCellSprite(color), x, y);
  }

  drawBoardBackground(): void {
    if (!this.boardBg) {
      this.boardBg = document.createElement('canvas');
      this.boardBg.width = WINDOW_WIDTH;
      this.boardBg.height = WINDOW_HEIGHT;
      const c = this.boardBg.getContext('2d')!;

      c.fillStyle = '#0b0f16';
      c.fillRect(BOARD_X - 6, BOARD_Y - 6, BOARD_COLS * CELL_SIZE + 12, BOARD_ROWS * CELL_SIZE + 12);

      c.strokeStyle = '#4ecdc4';
      c.lineWidth = 2;
      c.strokeRect(
        BOARD_X - 3,
        BOARD_Y - 3,
        BOARD_COLS * CELL_SIZE + 6,
        BOARD_ROWS * CELL_SIZE + 6,
      );

      c.fillStyle = rgb(DARK_GRAY);
      c.fillRect(BOARD_X, BOARD_Y, BOARD_COLS * CELL_SIZE, BOARD_ROWS * CELL_SIZE);

      c.strokeStyle = 'rgba(80, 90, 110, 0.45)';
      c.lineWidth = 1;
      for (let col = 0; col <= BOARD_COLS; col++) {
        const x = BOARD_X + col * CELL_SIZE;
        c.beginPath();
        c.moveTo(x, BOARD_Y);
        c.lineTo(x, BOARD_Y + BOARD_ROWS * CELL_SIZE);
        c.stroke();
      }
      for (let row = 0; row <= BOARD_ROWS; row++) {
        const y = BOARD_Y + row * CELL_SIZE;
        c.beginPath();
        c.moveTo(BOARD_X, y);
        c.lineTo(BOARD_X + BOARD_COLS * CELL_SIZE, y);
        c.stroke();
      }
    }

    this.ctx.drawImage(this.boardBg, 0, 0);
  }

  drawBoard(board: Board, lineClearProgress = 0): void {
    const visible = board.getVisibleGrid();
    for (let row = 0; row < BOARD_ROWS; row++) {
      const isClearing = board.isRowInClearAnimation(row);
      for (let col = 0; col < BOARD_COLS; col++) {
        const color = visible[row][col];
        if (!color) continue;
        if (isClearing) {
          const cellsHidden = board.getRowClearProgress(row, lineClearProgress);
          const center = BOARD_COLS / 2;
          if (col < center - cellsHidden || col >= center + cellsHidden) {
            this.drawCell(row, col, Math.floor(lineClearProgress * 10) % 2 === 0 ? WHITE : color);
          }
        } else {
          this.drawCell(row, col, color);
        }
      }
    }
  }

  drawPiece(piece: Tetromino | null): void {
    if (!piece) return;
    for (const [row, col] of piece.getCells()) {
      const visibleRow = row - BOARD_HIDDEN_ROWS;
      if (visibleRow >= 0) this.drawCell(visibleRow, col, piece.color);
    }
  }

  drawGhost(piece: Tetromino | null, ghostRow: number | null): void {
    if (!piece || ghostRow === null) return;
    const cells = piece.getCellsAt(ghostRow, piece.col, piece.rotationState);
    // Outline-style ghost so dark blues/purples stay readable on black
    const rim: RGB = [
      Math.min(255, Math.max(piece.color[0], 90) + 100),
      Math.min(255, Math.max(piece.color[1], 90) + 100),
      Math.min(255, Math.max(piece.color[2], 90) + 100),
    ];

    for (const [row, col] of cells) {
      const visibleRow = row - BOARD_HIDDEN_ROWS;
      if (visibleRow < 0) continue;
      const x = BOARD_X + col * CELL_SIZE;
      const y = BOARD_Y + visibleRow * CELL_SIZE;

      this.ctx.fillStyle = rgb(piece.color, GHOST_ALPHA / 255);
      this.ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);

      this.ctx.strokeStyle = rgb(rim, 0.85);
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x + 1.5, y + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
    }
  }

  private drawPreviewPiece(pieceType: PieceType | null, x: number, y: number, scale = 0.7): void {
    if (pieceType === null) return;
    const color = PIECE_COLORS[pieceType];
    const shape = SHAPES[pieceType][0];
    const cellSize = Math.floor(CELL_SIZE * scale);
    const minR = Math.min(...shape.map(([r]) => r));
    const maxR = Math.max(...shape.map(([r]) => r));
    const minC = Math.min(...shape.map(([, c]) => c));
    const maxC = Math.max(...shape.map(([, c]) => c));
    const width = (maxC - minC + 1) * cellSize;
    const height = (maxR - minR + 1) * cellSize;
    const offsetX = x + Math.floor((80 - width) / 2);
    const offsetY = y + Math.floor((60 - height) / 2);

    for (const [r, c] of shape) {
      const px = offsetX + (c - minC) * cellSize;
      const py = offsetY + (r - minR) * cellSize;
      this.ctx.fillStyle = rgb(color);
      this.ctx.fillRect(px, py, cellSize - 1, cellSize - 1);
    }
  }

  private panel(x: number, y: number, w: number, h: number, title: string, titleColor = '#4ecdc4'): void {
    this.ctx.fillStyle = '#0c1018';
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = '#2a3444';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.fillStyle = titleColor;
    this.ctx.font = `10px ${PIXEL}`;
    this.ctx.fillText(title, x + 12, y + 18);
  }

  drawNextPanel(nextPieces: PieceType[]): void {
    this.panel(NEXT_PANEL_X, NEXT_PANEL_Y, 100, 190, 'NEXT');
    nextPieces.slice(0, 3).forEach((pieceType, i) => {
      this.drawPreviewPiece(pieceType, NEXT_PANEL_X + 10, NEXT_PANEL_Y + 25 + i * 55);
    });
  }

  drawHoldPanel(holdPieceType: PieceType | null, holdAvailable: boolean): void {
    this.panel(
      HOLD_PANEL_X,
      HOLD_PANEL_Y,
      100,
      80,
      'HOLD',
      holdAvailable ? '#4ecdc4' : '#666',
    );
    if (holdPieceType !== null) {
      this.drawPreviewPiece(holdPieceType, HOLD_PANEL_X + 10, HOLD_PANEL_Y + 20);
    }
  }

  drawScorePanel(score: number, highScore: number, level: number, lines: number): void {
    let y = SCORE_PANEL_Y;
    const rows: Array<[string, string, string]> = [
      ['SCORE', String(score), '#7ef0e8'],
      ['HIGH', String(highScore), '#f0c14a'],
      ['LEVEL', String(level), '#6ddea8'],
      ['LINES', String(lines), '#c8d0dc'],
    ];
    for (const [label, value, color] of rows) {
      this.ctx.fillStyle = '#8a909c';
      this.ctx.font = `9px ${PIXEL}`;
      this.ctx.fillText(label, SCORE_PANEL_X, y);
      this.ctx.fillStyle = color;
      this.ctx.font = `14px ${PIXEL}`;
      this.ctx.fillText(value, SCORE_PANEL_X, y + 22);
      y += 56;
    }
  }

  drawStartScreen(selectedLevel: number, playerName: string, status: string): void {
    this.clear();
    this.ctx.textAlign = 'center';

    const blink = Math.floor(this.tick / 30) % 2 === 0;

    this.ctx.fillStyle = '#7ef0e8';
    this.ctx.font = `22px ${PIXEL}`;
    this.ctx.fillText('DEF NOT', WINDOW_WIDTH / 2, 95);
    this.ctx.font = `28px ${PIXEL}`;
    this.ctx.fillText('TETRIS', WINDOW_WIDTH / 2, 132);

    this.ctx.fillStyle = '#8b97a8';
    this.ctx.font = `10px ${PIXEL}`;
    this.ctx.fillText('ATTRACT MODE', WINDOW_WIDTH / 2, 165);

    [0, 1, 2, 3, 4, 5, 6].forEach((pt, i) => {
      this.drawPreviewPiece(pt as PieceType, 45 + i * 58, 185, 0.55);
    });

    this.ctx.fillStyle = '#e8eef6';
    this.ctx.font = `12px ${PIXEL}`;
    this.ctx.fillText(`LEVEL ${selectedLevel}`, WINDOW_WIDTH / 2, 310);

    this.ctx.fillStyle = '#8b97a8';
    this.ctx.font = `14px ${UI}`;
    this.ctx.fillText(`Operator: ${playerName}`, WINDOW_WIDTH / 2, 350);
    this.ctx.fillText(status, WINDOW_WIDTH / 2, 375);

    if (blink) {
      this.ctx.fillStyle = '#4ecdc4';
      this.ctx.font = `11px ${PIXEL}`;
      this.ctx.fillText('PRESS START', WINDOW_WIDTH / 2, 430);
    }

    this.ctx.fillStyle = '#8b97a8';
    this.ctx.font = `13px ${UI}`;
    this.ctx.fillText('Desktop: arrows · X/Z rotate · Space drop', WINDOW_WIDTH / 2, 480);
    this.ctx.fillText('Phone: swipe on the screen to play', WINDOW_WIDTH / 2, 505);

    this.ctx.textAlign = 'left';
  }

  drawPauseOverlay(): void {
    this.ctx.fillStyle = 'rgba(0,0,0,0.72)';
    this.ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#4ecdc4';
    this.ctx.font = `24px ${PIXEL}`;
    this.ctx.fillText('PAUSED', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 - 8);
    this.ctx.fillStyle = '#8b97a8';
    this.ctx.font = `14px ${UI}`;
    this.ctx.fillText('Press P / PAUSE to resume', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 28);
    this.ctx.textAlign = 'left';
  }

  drawGameOverOverlay(score: number, highScore: number, isNewHigh: boolean): void {
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
    this.ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#e23b3b';
    this.ctx.font = `22px ${PIXEL}`;
    this.ctx.fillText('GAME OVER', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 - 70);

    this.ctx.fillStyle = '#f7f1e8';
    this.ctx.font = `12px ${PIXEL}`;
    this.ctx.fillText(`SCORE ${score}`, WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 - 20);

    if (isNewHigh) {
      this.ctx.fillStyle = '#f0c14a';
      this.ctx.fillText('NEW RECORD!', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 20);
    } else {
      this.ctx.fillStyle = '#8b97a8';
      this.ctx.font = `14px ${UI}`;
      this.ctx.fillText(`Best ${highScore}`, WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 20);
    }

    this.ctx.fillStyle = '#4ecdc4';
    this.ctx.font = `14px ${UI}`;
    this.ctx.fillText('Press R / RESET for another round', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 70);
    this.ctx.textAlign = 'left';
  }

  drawSoundIndicator(enabled: boolean): void {
    this.ctx.fillStyle = enabled ? '#5dff9c' : '#666';
    this.ctx.font = `9px ${PIXEL}`;
    this.ctx.fillText(enabled ? 'SND ON' : 'SND OFF', BOARD_X, WINDOW_HEIGHT - 22);
  }
}
