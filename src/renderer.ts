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

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  clear(): void {
    this.tick += 1;
    const g = this.ctx.createLinearGradient(0, 0, 0, WINDOW_HEIGHT);
    g.addColorStop(0, '#0a1018');
    g.addColorStop(0.55, '#05070c');
    g.addColorStop(1, '#030406');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    // Subtle starfield / dust for attract feel
    this.ctx.fillStyle = 'rgba(255,200,120,0.08)';
    for (let i = 0; i < 18; i++) {
      const x = (i * 73 + this.tick) % WINDOW_WIDTH;
      const y = (i * 97) % WINDOW_HEIGHT;
      this.ctx.fillRect(x, y, 2, 2);
    }
  }

  private drawCell(row: number, col: number, color: RGB, alpha = 255): void {
    const x = BOARD_X + col * CELL_SIZE;
    const y = BOARD_Y + row * CELL_SIZE;

    if (alpha < 255) {
      this.ctx.fillStyle = rgb(color, alpha / 255);
      this.ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      return;
    }

    const grad = this.ctx.createLinearGradient(x, y, x, y + CELL_SIZE);
    grad.addColorStop(0, rgb([
      Math.min(color[0] + 60, 255),
      Math.min(color[1] + 60, 255),
      Math.min(color[2] + 60, 255),
    ]));
    grad.addColorStop(1, rgb(color));
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    this.ctx.strokeStyle = rgb([
      Math.min(color[0] + 90, 255),
      Math.min(color[1] + 90, 255),
      Math.min(color[2] + 90, 255),
    ]);
    this.ctx.beginPath();
    this.ctx.moveTo(x + 1, y + 1);
    this.ctx.lineTo(x + CELL_SIZE - 2, y + 1);
    this.ctx.moveTo(x + 1, y + 1);
    this.ctx.lineTo(x + 1, y + CELL_SIZE - 2);
    this.ctx.stroke();

    this.ctx.strokeStyle = rgb([
      Math.max(color[0] - 70, 0),
      Math.max(color[1] - 70, 0),
      Math.max(color[2] - 70, 0),
    ]);
    this.ctx.beginPath();
    this.ctx.moveTo(x + 1, y + CELL_SIZE - 2);
    this.ctx.lineTo(x + CELL_SIZE - 2, y + CELL_SIZE - 2);
    this.ctx.moveTo(x + CELL_SIZE - 2, y + 1);
    this.ctx.lineTo(x + CELL_SIZE - 2, y + CELL_SIZE - 2);
    this.ctx.stroke();
  }

  drawBoardBackground(): void {
    this.ctx.fillStyle = '#0b0f16';
    this.ctx.fillRect(BOARD_X - 6, BOARD_Y - 6, BOARD_COLS * CELL_SIZE + 12, BOARD_ROWS * CELL_SIZE + 12);

    this.ctx.strokeStyle = '#ffb000';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      BOARD_X - 3,
      BOARD_Y - 3,
      BOARD_COLS * CELL_SIZE + 6,
      BOARD_ROWS * CELL_SIZE + 6,
    );

    this.ctx.fillStyle = rgb(DARK_GRAY);
    this.ctx.fillRect(BOARD_X, BOARD_Y, BOARD_COLS * CELL_SIZE, BOARD_ROWS * CELL_SIZE);

    this.ctx.strokeStyle = 'rgba(80, 90, 110, 0.45)';
    this.ctx.lineWidth = 1;
    for (let col = 0; col <= BOARD_COLS; col++) {
      const x = BOARD_X + col * CELL_SIZE;
      this.ctx.beginPath();
      this.ctx.moveTo(x, BOARD_Y);
      this.ctx.lineTo(x, BOARD_Y + BOARD_ROWS * CELL_SIZE);
      this.ctx.stroke();
    }
    for (let row = 0; row <= BOARD_ROWS; row++) {
      const y = BOARD_Y + row * CELL_SIZE;
      this.ctx.beginPath();
      this.ctx.moveTo(BOARD_X, y);
      this.ctx.lineTo(BOARD_X + BOARD_COLS * CELL_SIZE, y);
      this.ctx.stroke();
    }
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
    for (const [row, col] of cells) {
      const visibleRow = row - BOARD_HIDDEN_ROWS;
      if (visibleRow >= 0) this.drawCell(visibleRow, col, piece.color, GHOST_ALPHA);
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

  private panel(x: number, y: number, w: number, h: number, title: string, titleColor = '#ffb000'): void {
    this.ctx.fillStyle = '#0c1018';
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = '#35e8ff';
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
      holdAvailable ? '#ffb000' : '#666',
    );
    if (holdPieceType !== null) {
      this.drawPreviewPiece(holdPieceType, HOLD_PANEL_X + 10, HOLD_PANEL_Y + 20);
    }
  }

  drawScorePanel(score: number, highScore: number, level: number, lines: number): void {
    let y = SCORE_PANEL_Y;
    const rows: Array<[string, string, string]> = [
      ['SCORE', String(score), '#35e8ff'],
      ['HIGH', String(highScore), '#ffb000'],
      ['LEVEL', String(level), '#5dff9c'],
      ['LINES', String(lines), '#f0c000'],
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

    this.ctx.fillStyle = '#ffb000';
    this.ctx.font = `28px ${PIXEL}`;
    this.ctx.fillText('TETRIS', WINDOW_WIDTH / 2, 110);

    this.ctx.fillStyle = '#35e8ff';
    this.ctx.font = `10px ${PIXEL}`;
    this.ctx.fillText('ATTRACT MODE', WINDOW_WIDTH / 2, 145);

    [0, 1, 2, 3, 4, 5, 6].forEach((pt, i) => {
      this.drawPreviewPiece(pt as PieceType, 45 + i * 58, 175, 0.55);
    });

    this.ctx.fillStyle = '#f7f1e8';
    this.ctx.font = `12px ${PIXEL}`;
    this.ctx.fillText(`LEVEL ${selectedLevel}`, WINDOW_WIDTH / 2, 300);

    this.ctx.fillStyle = '#b9a89a';
    this.ctx.font = `14px ${UI}`;
    this.ctx.fillText(`Operator: ${playerName}`, WINDOW_WIDTH / 2, 340);
    this.ctx.fillText(status, WINDOW_WIDTH / 2, 365);

    if (blink) {
      this.ctx.fillStyle = '#ffb000';
      this.ctx.font = `11px ${PIXEL}`;
      this.ctx.fillText('PRESS START', WINDOW_WIDTH / 2, 430);
    }

    this.ctx.fillStyle = '#8a909c';
    this.ctx.font = `13px ${UI}`;
    this.ctx.fillText('↑/Z level · arrows move · A/B rotate · DROP', WINDOW_WIDTH / 2, 480);
    this.ctx.fillText('Sign in to sync high scores across devices', WINDOW_WIDTH / 2, 505);

    this.ctx.textAlign = 'left';
  }

  drawPauseOverlay(): void {
    this.ctx.fillStyle = 'rgba(0,0,0,0.72)';
    this.ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#ffb000';
    this.ctx.font = `24px ${PIXEL}`;
    this.ctx.fillText('PAUSED', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 - 8);
    this.ctx.fillStyle = '#b9a89a';
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
      this.ctx.fillStyle = '#ffb000';
      this.ctx.fillText('NEW RECORD!', WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 20);
    } else {
      this.ctx.fillStyle = '#b9a89a';
      this.ctx.font = `14px ${UI}`;
      this.ctx.fillText(`Best ${highScore}`, WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 20);
    }

    this.ctx.fillStyle = '#35e8ff';
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
