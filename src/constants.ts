export const FPS = 60;

export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;
export const BOARD_HIDDEN_ROWS = 2;
export const BOARD_TOTAL_ROWS = BOARD_ROWS + BOARD_HIDDEN_ROWS;

export const CELL_SIZE = 30;
export const BOARD_X = 30;
export const BOARD_Y = 50;

export const NEXT_PANEL_X = BOARD_X + BOARD_COLS * CELL_SIZE + 20;
export const NEXT_PANEL_Y = BOARD_Y;
export const HOLD_PANEL_X = NEXT_PANEL_X;
export const HOLD_PANEL_Y = NEXT_PANEL_Y + 200;
export const SCORE_PANEL_X = NEXT_PANEL_X;
export const SCORE_PANEL_Y = HOLD_PANEL_Y + 120;

export const WINDOW_WIDTH = 500;
export const WINDOW_HEIGHT = 700;

export type RGB = readonly [number, number, number];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];
export const GRAY: RGB = [128, 128, 128];
export const DARK_GRAY: RGB = [40, 40, 40];
export const LIGHT_GRAY: RGB = [200, 200, 200];

export const CYAN: RGB = [0, 255, 255];
export const YELLOW: RGB = [255, 255, 0];
export const PURPLE: RGB = [160, 32, 240];
export const GREEN: RGB = [0, 255, 0];
export const RED: RGB = [255, 0, 0];
export const BLUE: RGB = [0, 0, 255];
export const ORANGE: RGB = [255, 165, 0];

export const GHOST_ALPHA = 110;

export const I_PIECE = 0;
export const O_PIECE = 1;
export const T_PIECE = 2;
export const S_PIECE = 3;
export const Z_PIECE = 4;
export const J_PIECE = 5;
export const L_PIECE = 6;

export type PieceType =
  | typeof I_PIECE
  | typeof O_PIECE
  | typeof T_PIECE
  | typeof S_PIECE
  | typeof Z_PIECE
  | typeof J_PIECE
  | typeof L_PIECE;

export const PIECE_COLORS: Record<PieceType, RGB> = {
  [I_PIECE]: CYAN,
  [O_PIECE]: YELLOW,
  [T_PIECE]: PURPLE,
  [S_PIECE]: GREEN,
  [Z_PIECE]: RED,
  [J_PIECE]: BLUE,
  [L_PIECE]: ORANGE,
};

export type CellOffset = readonly [number, number];

export const SHAPES: Record<PieceType, CellOffset[][]> = {
  [I_PIECE]: [
    [[0, 0], [0, 1], [0, 2], [0, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  [O_PIECE]: [
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
  ],
  [T_PIECE]: [
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ],
  [S_PIECE]: [
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  [Z_PIECE]: [
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ],
  [J_PIECE]: [
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  [L_PIECE]: [
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
};

type KickMap = Record<string, CellOffset[]>;

export const WALL_KICKS_JLSTZ: KickMap = {
  '0,1': [[0, 0], [0, -1], [-1, -1], [2, 0], [2, -1]],
  '1,0': [[0, 0], [0, 1], [1, 1], [-2, 0], [-2, 1]],
  '1,2': [[0, 0], [0, 1], [1, 1], [-2, 0], [-2, 1]],
  '2,1': [[0, 0], [0, -1], [-1, -1], [2, 0], [2, -1]],
  '2,3': [[0, 0], [0, 1], [-1, 1], [2, 0], [2, 1]],
  '3,2': [[0, 0], [0, -1], [1, -1], [-2, 0], [-2, -1]],
  '3,0': [[0, 0], [0, -1], [1, -1], [-2, 0], [-2, -1]],
  '0,3': [[0, 0], [0, 1], [-1, 1], [2, 0], [2, 1]],
};

export const WALL_KICKS_I: KickMap = {
  '0,1': [[0, 0], [0, -2], [0, 1], [1, -2], [-2, 1]],
  '1,0': [[0, 0], [0, 2], [0, -1], [-1, 2], [2, -1]],
  '1,2': [[0, 0], [0, -1], [0, 2], [-2, -1], [1, 2]],
  '2,1': [[0, 0], [0, 1], [0, -2], [2, 1], [-1, -2]],
  '2,3': [[0, 0], [0, 2], [0, -1], [1, 2], [-2, -1]],
  '3,2': [[0, 0], [0, -2], [0, 1], [-1, -2], [2, 1]],
  '3,0': [[0, 0], [0, 1], [0, -2], [-2, 1], [1, -2]],
  '0,3': [[0, 0], [0, -1], [0, 2], [2, -1], [-1, 2]],
};

export const WALL_KICKS_O: KickMap = {
  '0,1': [[0, 0]],
  '1,0': [[0, 0]],
  '1,2': [[0, 0]],
  '2,1': [[0, 0]],
  '2,3': [[0, 0]],
  '3,2': [[0, 0]],
  '3,0': [[0, 0]],
  '0,3': [[0, 0]],
};

export const SPAWN_POSITIONS: Record<PieceType, CellOffset> = {
  [I_PIECE]: [0, 3],
  [O_PIECE]: [0, 4],
  [T_PIECE]: [0, 3],
  [S_PIECE]: [0, 3],
  [Z_PIECE]: [0, 3],
  [J_PIECE]: [0, 3],
  [L_PIECE]: [0, 3],
};

export const GRAVITY_FRAMES: Record<number, number> = {
  0: 48, 1: 43, 2: 38, 3: 33, 4: 28, 5: 23, 6: 18, 7: 13, 8: 8, 9: 6,
  10: 5, 11: 5, 12: 5, 13: 4, 14: 4, 15: 4, 16: 3, 17: 3, 18: 3, 19: 2,
  20: 2, 21: 2, 22: 2, 23: 2, 24: 2, 25: 2, 26: 2, 27: 2, 28: 2, 29: 1,
};

export const LOCK_DELAY_FRAMES = 30;
export const DAS_DELAY_FRAMES = 10;
export const DAS_REPEAT_FRAMES = 2;

export const SCORE_SINGLE = 40;
export const SCORE_DOUBLE = 100;
export const SCORE_TRIPLE = 300;
export const SCORE_TETRIS = 1200;
export const SCORE_SOFT_DROP = 1;
export const SCORE_HARD_DROP = 2;

export const LINES_PER_LEVEL = 10;
export const LINE_CLEAR_ANIMATION_FRAMES = 20;

export const STATE_START = 'start';
export const STATE_PLAYING = 'playing';
export const STATE_PAUSED = 'paused';
export const STATE_GAME_OVER = 'game_over';
export const STATE_LINE_CLEAR = 'line_clear';

export type GameState =
  | typeof STATE_START
  | typeof STATE_PLAYING
  | typeof STATE_PAUSED
  | typeof STATE_GAME_OVER
  | typeof STATE_LINE_CLEAR;

export function rgb(color: RGB, alpha = 1): string {
  if (alpha >= 1) return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}
