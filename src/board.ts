import {
  BOARD_COLS,
  BOARD_HIDDEN_ROWS,
  BOARD_TOTAL_ROWS,
  type RGB,
} from './constants';
import type { Tetromino } from './tetromino';

export class Board {
  grid: (RGB | null)[][];
  clearedLines: number[];

  constructor() {
    this.grid = this.emptyGrid();
    this.clearedLines = [];
  }

  private emptyGrid(): (RGB | null)[][] {
    return Array.from({ length: BOARD_TOTAL_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => null),
    );
  }

  reset(): void {
    this.grid = this.emptyGrid();
    this.clearedLines = [];
  }

  cellValid(row: number, col: number): boolean {
    if (col < 0 || col >= BOARD_COLS) return false;
    if (row >= BOARD_TOTAL_ROWS) return false;
    if (row < 0) return true;
    return this.grid[row][col] === null;
  }

  cellsValid(cells: Array<[number, number]>): boolean {
    return cells.every(([row, col]) => this.cellValid(row, col));
  }

  lockPiece(piece: Tetromino): boolean {
    const cells = piece.getCells();
    for (const [row, col] of cells) {
      if (row >= 0 && row < BOARD_TOTAL_ROWS && col >= 0 && col < BOARD_COLS) {
        this.grid[row][col] = piece.color;
      }
    }
    return cells.every(([row]) => row >= BOARD_HIDDEN_ROWS);
  }

  findCompleteLines(): number[] {
    const complete: number[] = [];
    for (let row = 0; row < BOARD_TOTAL_ROWS; row++) {
      if (this.grid[row].every((cell) => cell !== null)) {
        complete.push(row);
      }
    }
    return complete;
  }

  clearLines(lines: number[]): void {
    if (!lines.length) return;
    const sorted = [...lines].sort((a, b) => a - b);
    for (let i = sorted.length - 1; i >= 0; i--) {
      this.grid.splice(sorted[i], 1);
    }
    for (let i = 0; i < sorted.length; i++) {
      this.grid.unshift(Array.from({ length: BOARD_COLS }, () => null));
    }
  }

  startLineClearAnimation(lines: number[]): void {
    this.clearedLines = [...lines];
  }

  endLineClearAnimation(): number {
    const lines = this.clearedLines;
    this.clearedLines = [];
    this.clearLines(lines);
    return lines.length;
  }

  getVisibleGrid(): (RGB | null)[][] {
    return this.grid.slice(BOARD_HIDDEN_ROWS);
  }

  isRowInClearAnimation(visibleRow: number): boolean {
    return this.clearedLines.includes(visibleRow + BOARD_HIDDEN_ROWS);
  }

  getRowClearProgress(_visibleRow: number, progress: number): number {
    return Math.floor((BOARD_COLS / 2) * progress);
  }

  isGameOver(): boolean {
    for (let row = 0; row < BOARD_HIDDEN_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (this.grid[row][col] !== null) return true;
      }
    }
    return false;
  }
}
