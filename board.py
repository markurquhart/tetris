"""
Game board module handling the Tetris playfield.
"""

from constants import (
    BOARD_COLS, BOARD_TOTAL_ROWS, BOARD_HIDDEN_ROWS, BOARD_ROWS
)


class Board:
    """Represents the Tetris game board."""

    def __init__(self):
        """Initialize an empty game board."""
        self.grid = [[None for _ in range(BOARD_COLS)] for _ in range(BOARD_TOTAL_ROWS)]
        self.cleared_lines = []  # Lines being cleared (for animation)

    def reset(self):
        """Clear the board."""
        self.grid = [[None for _ in range(BOARD_COLS)] for _ in range(BOARD_TOTAL_ROWS)]
        self.cleared_lines = []

    def cell_valid(self, row, col):
        """
        Check if a single cell position is valid (in bounds and empty).

        Args:
            row: Row index
            col: Column index

        Returns:
            True if position is valid and empty
        """
        # Check column bounds
        if col < 0 or col >= BOARD_COLS:
            return False
        # Check row bounds (can go above board but not below)
        if row >= BOARD_TOTAL_ROWS:
            return False
        # Allow positions above the board
        if row < 0:
            return True
        # Check if cell is empty
        return self.grid[row][col] is None

    def cells_valid(self, cells):
        """
        Check if all cell positions are valid.

        Args:
            cells: List of (row, col) tuples

        Returns:
            True if all positions are valid
        """
        return all(self.cell_valid(row, col) for row, col in cells)

    def lock_piece(self, piece):
        """
        Lock a piece into the board.

        Args:
            piece: Tetromino to lock

        Returns:
            True if piece was locked successfully (not above visible area)
        """
        cells = piece.get_cells()
        for row, col in cells:
            if 0 <= row < BOARD_TOTAL_ROWS and 0 <= col < BOARD_COLS:
                self.grid[row][col] = piece.color

        # Check if any part of piece is above visible area (game over condition)
        return all(row >= BOARD_HIDDEN_ROWS for row, col in cells)

    def find_complete_lines(self):
        """
        Find all complete lines.

        Returns:
            List of row indices that are complete
        """
        complete = []
        for row in range(BOARD_TOTAL_ROWS):
            if all(self.grid[row][col] is not None for col in range(BOARD_COLS)):
                complete.append(row)
        return complete

    def clear_lines(self, lines):
        """
        Clear specified lines and drop rows above.

        Args:
            lines: List of row indices to clear
        """
        if not lines:
            return

        # Sort lines from top to bottom
        lines = sorted(lines)

        # Remove the lines
        for row in reversed(lines):
            del self.grid[row]

        # Add new empty rows at top
        for _ in range(len(lines)):
            self.grid.insert(0, [None for _ in range(BOARD_COLS)])

    def start_line_clear_animation(self, lines):
        """Start line clear animation for specified lines."""
        self.cleared_lines = lines[:]

    def end_line_clear_animation(self):
        """End line clear animation and actually clear the lines."""
        lines = self.cleared_lines
        self.cleared_lines = []
        self.clear_lines(lines)
        return len(lines)

    def get_visible_grid(self):
        """
        Get only the visible portion of the grid.

        Returns:
            2D list representing visible rows
        """
        return self.grid[BOARD_HIDDEN_ROWS:]

    def is_row_in_clear_animation(self, visible_row):
        """Check if a visible row is being cleared."""
        actual_row = visible_row + BOARD_HIDDEN_ROWS
        return actual_row in self.cleared_lines

    def get_row_clear_progress(self, visible_row, progress):
        """
        Get which cells should be hidden during clear animation.

        Args:
            visible_row: Visible row index
            progress: Animation progress (0.0 to 1.0)

        Returns:
            Number of cells to hide from each side
        """
        cells_to_hide = int((BOARD_COLS / 2) * progress)
        return cells_to_hide

    def is_game_over(self):
        """
        Check if any blocks are in the hidden spawn area.

        Returns:
            True if game should end
        """
        for row in range(BOARD_HIDDEN_ROWS):
            for col in range(BOARD_COLS):
                if self.grid[row][col] is not None:
                    return True
        return False
