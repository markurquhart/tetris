"""
Tetromino class representing a Tetris piece.
"""

from constants import (
    SHAPES, PIECE_COLORS, SPAWN_POSITIONS,
    WALL_KICKS_JLSTZ, WALL_KICKS_I, WALL_KICKS_O,
    I_PIECE, O_PIECE
)


class Tetromino:
    """Represents a Tetris piece with position, rotation, and movement."""

    def __init__(self, piece_type):
        """
        Initialize a new tetromino.

        Args:
            piece_type: Integer constant representing the piece type
        """
        self.piece_type = piece_type
        self.rotation_state = 0
        self.row, self.col = SPAWN_POSITIONS[piece_type]
        self.color = PIECE_COLORS[piece_type]

    def get_cells(self):
        """
        Get the absolute board positions of all cells in this piece.

        Returns:
            List of (row, col) tuples for each cell
        """
        shape = SHAPES[self.piece_type][self.rotation_state]
        return [(self.row + r, self.col + c) for r, c in shape]

    def get_cells_at(self, row, col, rotation_state):
        """
        Get cell positions if piece were at given position and rotation.

        Args:
            row: Row position
            col: Column position
            rotation_state: Rotation state (0-3)

        Returns:
            List of (row, col) tuples for each cell
        """
        shape = SHAPES[self.piece_type][rotation_state]
        return [(row + r, col + c) for r, c in shape]

    def move(self, d_row, d_col):
        """Move the piece by the given offset."""
        self.row += d_row
        self.col += d_col

    def rotate_cw(self):
        """Rotate the piece clockwise."""
        self.rotation_state = (self.rotation_state + 1) % 4

    def rotate_ccw(self):
        """Rotate the piece counter-clockwise."""
        self.rotation_state = (self.rotation_state - 1) % 4

    def get_wall_kicks(self, from_state, to_state):
        """
        Get wall kick offsets for a rotation.

        Args:
            from_state: Starting rotation state
            to_state: Target rotation state

        Returns:
            List of (row_offset, col_offset) tuples to try
        """
        if self.piece_type == I_PIECE:
            kicks = WALL_KICKS_I
        elif self.piece_type == O_PIECE:
            kicks = WALL_KICKS_O
        else:
            kicks = WALL_KICKS_JLSTZ

        return kicks.get((from_state, to_state), [(0, 0)])

    def copy(self):
        """Create a copy of this tetromino."""
        new_piece = Tetromino(self.piece_type)
        new_piece.rotation_state = self.rotation_state
        new_piece.row = self.row
        new_piece.col = self.col
        return new_piece

    def get_ghost_position(self, board):
        """
        Calculate where this piece would land (ghost position).

        Args:
            board: The game board to check against

        Returns:
            Row position where piece would land
        """
        ghost_row = self.row
        while True:
            test_cells = self.get_cells_at(ghost_row + 1, self.col, self.rotation_state)
            if board.cells_valid(test_cells):
                ghost_row += 1
            else:
                break
        return ghost_row
