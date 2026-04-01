"""
Game constants and configuration values for Tetris.
"""

# Display settings
WINDOW_WIDTH = 500
WINDOW_HEIGHT = 700
FPS = 60

# Board dimensions
BOARD_COLS = 10
BOARD_ROWS = 20
BOARD_HIDDEN_ROWS = 2  # Hidden rows at top for spawning
BOARD_TOTAL_ROWS = BOARD_ROWS + BOARD_HIDDEN_ROWS

# Cell size and board positioning
CELL_SIZE = 30
BOARD_X = 30
BOARD_Y = 50

# UI panel positioning
NEXT_PANEL_X = BOARD_X + BOARD_COLS * CELL_SIZE + 20
NEXT_PANEL_Y = BOARD_Y
HOLD_PANEL_X = NEXT_PANEL_X
HOLD_PANEL_Y = NEXT_PANEL_Y + 200
SCORE_PANEL_X = NEXT_PANEL_X
SCORE_PANEL_Y = HOLD_PANEL_Y + 120

# Colors (RGB)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRAY = (128, 128, 128)
DARK_GRAY = (40, 40, 40)
LIGHT_GRAY = (200, 200, 200)

# Tetromino colors (classic NES-style)
CYAN = (0, 255, 255)      # I-piece
YELLOW = (255, 255, 0)    # O-piece
PURPLE = (160, 32, 240)   # T-piece
GREEN = (0, 255, 0)       # S-piece
RED = (255, 0, 0)         # Z-piece
BLUE = (0, 0, 255)        # J-piece
ORANGE = (255, 165, 0)    # L-piece

# Ghost piece transparency
GHOST_ALPHA = 80

# Piece type indices
I_PIECE = 0
O_PIECE = 1
T_PIECE = 2
S_PIECE = 3
Z_PIECE = 4
J_PIECE = 5
L_PIECE = 6

# Piece colors mapping
PIECE_COLORS = {
    I_PIECE: CYAN,
    O_PIECE: YELLOW,
    T_PIECE: PURPLE,
    S_PIECE: GREEN,
    Z_PIECE: RED,
    J_PIECE: BLUE,
    L_PIECE: ORANGE,
}

# Tetromino shapes in all 4 rotation states (SRS standard)
# Each shape is a list of (row, col) offsets from the piece's origin
SHAPES = {
    I_PIECE: [
        [(0, 0), (0, 1), (0, 2), (0, 3)],   # State 0
        [(0, 2), (1, 2), (2, 2), (3, 2)],   # State 1
        [(2, 0), (2, 1), (2, 2), (2, 3)],   # State 2
        [(0, 1), (1, 1), (2, 1), (3, 1)],   # State 3
    ],
    O_PIECE: [
        [(0, 0), (0, 1), (1, 0), (1, 1)],   # State 0
        [(0, 0), (0, 1), (1, 0), (1, 1)],   # State 1
        [(0, 0), (0, 1), (1, 0), (1, 1)],   # State 2
        [(0, 0), (0, 1), (1, 0), (1, 1)],   # State 3
    ],
    T_PIECE: [
        [(0, 1), (1, 0), (1, 1), (1, 2)],   # State 0
        [(0, 1), (1, 1), (1, 2), (2, 1)],   # State 1
        [(1, 0), (1, 1), (1, 2), (2, 1)],   # State 2
        [(0, 1), (1, 0), (1, 1), (2, 1)],   # State 3
    ],
    S_PIECE: [
        [(0, 1), (0, 2), (1, 0), (1, 1)],   # State 0
        [(0, 1), (1, 1), (1, 2), (2, 2)],   # State 1
        [(1, 1), (1, 2), (2, 0), (2, 1)],   # State 2
        [(0, 0), (1, 0), (1, 1), (2, 1)],   # State 3
    ],
    Z_PIECE: [
        [(0, 0), (0, 1), (1, 1), (1, 2)],   # State 0
        [(0, 2), (1, 1), (1, 2), (2, 1)],   # State 1
        [(1, 0), (1, 1), (2, 1), (2, 2)],   # State 2
        [(0, 1), (1, 0), (1, 1), (2, 0)],   # State 3
    ],
    J_PIECE: [
        [(0, 0), (1, 0), (1, 1), (1, 2)],   # State 0
        [(0, 1), (0, 2), (1, 1), (2, 1)],   # State 1
        [(1, 0), (1, 1), (1, 2), (2, 2)],   # State 2
        [(0, 1), (1, 1), (2, 0), (2, 1)],   # State 3
    ],
    L_PIECE: [
        [(0, 2), (1, 0), (1, 1), (1, 2)],   # State 0
        [(0, 1), (1, 1), (2, 1), (2, 2)],   # State 1
        [(1, 0), (1, 1), (1, 2), (2, 0)],   # State 2
        [(0, 0), (0, 1), (1, 1), (2, 1)],   # State 3
    ],
}

# SRS Wall Kick data
# Wall kicks for J, L, S, T, Z pieces
WALL_KICKS_JLSTZ = {
    (0, 1): [(0, 0), (0, -1), (-1, -1), (2, 0), (2, -1)],
    (1, 0): [(0, 0), (0, 1), (1, 1), (-2, 0), (-2, 1)],
    (1, 2): [(0, 0), (0, 1), (1, 1), (-2, 0), (-2, 1)],
    (2, 1): [(0, 0), (0, -1), (-1, -1), (2, 0), (2, -1)],
    (2, 3): [(0, 0), (0, 1), (-1, 1), (2, 0), (2, 1)],
    (3, 2): [(0, 0), (0, -1), (1, -1), (-2, 0), (-2, -1)],
    (3, 0): [(0, 0), (0, -1), (1, -1), (-2, 0), (-2, -1)],
    (0, 3): [(0, 0), (0, 1), (-1, 1), (2, 0), (2, 1)],
}

# Wall kicks for I piece
WALL_KICKS_I = {
    (0, 1): [(0, 0), (0, -2), (0, 1), (1, -2), (-2, 1)],
    (1, 0): [(0, 0), (0, 2), (0, -1), (-1, 2), (2, -1)],
    (1, 2): [(0, 0), (0, -1), (0, 2), (-2, -1), (1, 2)],
    (2, 1): [(0, 0), (0, 1), (0, -2), (2, 1), (-1, -2)],
    (2, 3): [(0, 0), (0, 2), (0, -1), (1, 2), (-2, -1)],
    (3, 2): [(0, 0), (0, -2), (0, 1), (-1, -2), (2, 1)],
    (3, 0): [(0, 0), (0, 1), (0, -2), (-2, 1), (1, -2)],
    (0, 3): [(0, 0), (0, -1), (0, 2), (2, -1), (-1, 2)],
}

# O piece has no wall kicks (it doesn't rotate visually)
WALL_KICKS_O = {
    (0, 1): [(0, 0)],
    (1, 0): [(0, 0)],
    (1, 2): [(0, 0)],
    (2, 1): [(0, 0)],
    (2, 3): [(0, 0)],
    (3, 2): [(0, 0)],
    (3, 0): [(0, 0)],
    (0, 3): [(0, 0)],
}

# Spawn positions for each piece (column offset)
SPAWN_POSITIONS = {
    I_PIECE: (0, 3),
    O_PIECE: (0, 4),
    T_PIECE: (0, 3),
    S_PIECE: (0, 3),
    Z_PIECE: (0, 3),
    J_PIECE: (0, 3),
    L_PIECE: (0, 3),
}

# Gravity speeds (frames per cell drop) for each level
# Based on NES Tetris gravity
GRAVITY_FRAMES = {
    0: 48,
    1: 43,
    2: 38,
    3: 33,
    4: 28,
    5: 23,
    6: 18,
    7: 13,
    8: 8,
    9: 6,
    10: 5,
    11: 5,
    12: 5,
    13: 4,
    14: 4,
    15: 4,
    16: 3,
    17: 3,
    18: 3,
    19: 2,
    20: 2,
    21: 2,
    22: 2,
    23: 2,
    24: 2,
    25: 2,
    26: 2,
    27: 2,
    28: 2,
    29: 1,  # Maximum speed
}

# Lock delay (frames before piece locks after touching ground)
LOCK_DELAY_FRAMES = 30

# DAS (Delayed Auto Shift) settings
DAS_DELAY_FRAMES = 10  # Initial delay before auto-repeat starts
DAS_REPEAT_FRAMES = 2  # Frames between each auto-repeat

# Scoring
SCORE_SINGLE = 40
SCORE_DOUBLE = 100
SCORE_TRIPLE = 300
SCORE_TETRIS = 1200
SCORE_SOFT_DROP = 1
SCORE_HARD_DROP = 2

# Lines per level
LINES_PER_LEVEL = 10

# Animation timings (in frames)
LINE_CLEAR_ANIMATION_FRAMES = 20

# High score file
HIGH_SCORE_FILE = "highscore.txt"

# Game states
STATE_START = "start"
STATE_PLAYING = "playing"
STATE_PAUSED = "paused"
STATE_GAME_OVER = "game_over"
STATE_LINE_CLEAR = "line_clear"
