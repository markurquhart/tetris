import {
  I_PIECE,
  O_PIECE,
  PIECE_COLORS,
  SHAPES,
  SPAWN_POSITIONS,
  WALL_KICKS_I,
  WALL_KICKS_JLSTZ,
  WALL_KICKS_O,
  type CellOffset,
  type PieceType,
  type RGB,
} from './constants';
import type { Board } from './board';

export class Tetromino {
  pieceType: PieceType;
  rotationState: number;
  row: number;
  col: number;
  color: RGB;

  constructor(pieceType: PieceType) {
    this.pieceType = pieceType;
    this.rotationState = 0;
    const [row, col] = SPAWN_POSITIONS[pieceType];
    this.row = row;
    this.col = col;
    this.color = PIECE_COLORS[pieceType];
  }

  getCells(): Array<[number, number]> {
    const shape = SHAPES[this.pieceType][this.rotationState];
    return shape.map(([r, c]) => [this.row + r, this.col + c]);
  }

  getCellsAt(row: number, col: number, rotationState: number): Array<[number, number]> {
    const shape = SHAPES[this.pieceType][rotationState];
    return shape.map(([r, c]) => [row + r, col + c]);
  }

  move(dRow: number, dCol: number): void {
    this.row += dRow;
    this.col += dCol;
  }

  getWallKicks(fromState: number, toState: number): CellOffset[] {
    const key = `${fromState},${toState}`;
    if (this.pieceType === I_PIECE) return WALL_KICKS_I[key] ?? [[0, 0]];
    if (this.pieceType === O_PIECE) return WALL_KICKS_O[key] ?? [[0, 0]];
    return WALL_KICKS_JLSTZ[key] ?? [[0, 0]];
  }

  copy(): Tetromino {
    const piece = new Tetromino(this.pieceType);
    piece.rotationState = this.rotationState;
    piece.row = this.row;
    piece.col = this.col;
    return piece;
  }

  getGhostPosition(board: Board): number {
    let ghostRow = this.row;
    while (true) {
      const testCells = this.getCellsAt(ghostRow + 1, this.col, this.rotationState);
      if (board.cellsValid(testCells)) {
        ghostRow += 1;
      } else {
        break;
      }
    }
    return ghostRow;
  }
}
