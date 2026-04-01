"""
Main game logic module for Tetris.
"""

import random
from constants import (
    BOARD_HIDDEN_ROWS,
    GRAVITY_FRAMES, LOCK_DELAY_FRAMES,
    SCORE_SINGLE, SCORE_DOUBLE, SCORE_TRIPLE, SCORE_TETRIS,
    SCORE_SOFT_DROP, SCORE_HARD_DROP,
    LINES_PER_LEVEL, LINE_CLEAR_ANIMATION_FRAMES,
    STATE_START, STATE_PLAYING, STATE_PAUSED, STATE_GAME_OVER, STATE_LINE_CLEAR,
    I_PIECE, O_PIECE, T_PIECE, S_PIECE, Z_PIECE, J_PIECE, L_PIECE
)
from tetromino import Tetromino
from board import Board


class Game:
    """Main game logic controller."""

    def __init__(self, sound_manager):
        """
        Initialize the game.

        Args:
            sound_manager: SoundManager instance for audio
        """
        self.sound_manager = sound_manager
        self.board = Board()

        # Game state
        self.state = STATE_START
        self.selected_level = 0

        # Scoring
        self.score = 0
        self.high_score = 0
        self.lines_cleared = 0
        self.level = 0

        # Pieces
        self.current_piece = None
        self.hold_piece_type = None
        self.hold_available = True
        self.piece_bag = []
        self.next_pieces = []

        # Timing
        self.gravity_counter = 0
        self.lock_counter = 0
        self.is_locking = False
        self.lock_moves_remaining = 15  # Max moves during lock delay

        # Line clear animation
        self.line_clear_counter = 0
        self.lines_to_clear = []

        # New high score flag
        self.is_new_high_score = False

    def set_high_score(self, score):
        """Set the loaded high score."""
        self.high_score = score

    def start_game(self):
        """Start a new game."""
        self.board.reset()
        self.state = STATE_PLAYING

        self.score = 0
        self.lines_cleared = 0
        self.level = self.selected_level

        self.current_piece = None
        self.hold_piece_type = None
        self.hold_available = True
        self.piece_bag = []
        self.next_pieces = []

        self.gravity_counter = 0
        self.lock_counter = 0
        self.is_locking = False

        self.is_new_high_score = False

        # Fill the piece bag and next queue
        self._refill_bag()
        for _ in range(3):
            self.next_pieces.append(self._get_next_piece_type())

        # Spawn first piece
        self._spawn_piece()

    def _refill_bag(self):
        """Refill the 7-bag with shuffled pieces."""
        bag = [I_PIECE, O_PIECE, T_PIECE, S_PIECE, Z_PIECE, J_PIECE, L_PIECE]
        random.shuffle(bag)
        self.piece_bag.extend(bag)

    def _get_next_piece_type(self):
        """Get the next piece type from the bag."""
        if len(self.piece_bag) < 7:
            self._refill_bag()
        return self.piece_bag.pop(0)

    def _spawn_piece(self):
        """Spawn a new piece at the top."""
        if not self.next_pieces:
            piece_type = self._get_next_piece_type()
        else:
            piece_type = self.next_pieces.pop(0)
            self.next_pieces.append(self._get_next_piece_type())

        self.current_piece = Tetromino(piece_type)
        self.is_locking = False
        self.lock_counter = 0
        self.lock_moves_remaining = 15
        self.hold_available = True

        # Check if spawn position is blocked (game over)
        if not self.board.cells_valid(self.current_piece.get_cells()):
            self._game_over()

    def _game_over(self):
        """Handle game over."""
        self.state = STATE_GAME_OVER
        self.sound_manager.play('game_over')

        if self.score > self.high_score:
            self.high_score = self.score
            self.is_new_high_score = True

    def _get_gravity_frames(self):
        """Get current gravity speed in frames."""
        level = min(self.level, 29)
        return GRAVITY_FRAMES.get(level, 1)

    def _try_move(self, d_row, d_col):
        """
        Try to move the current piece.

        Args:
            d_row: Row offset
            d_col: Column offset

        Returns:
            True if move succeeded
        """
        if self.current_piece is None:
            return False

        new_cells = self.current_piece.get_cells_at(
            self.current_piece.row + d_row,
            self.current_piece.col + d_col,
            self.current_piece.rotation_state
        )

        if self.board.cells_valid(new_cells):
            self.current_piece.move(d_row, d_col)
            return True
        return False

    def _try_rotate(self, clockwise=True):
        """
        Try to rotate the current piece with wall kicks.

        Args:
            clockwise: True for CW, False for CCW

        Returns:
            True if rotation succeeded
        """
        if self.current_piece is None:
            return False

        from_state = self.current_piece.rotation_state
        to_state = (from_state + (1 if clockwise else -1)) % 4

        # Get wall kick offsets
        kicks = self.current_piece.get_wall_kicks(from_state, to_state)

        for row_offset, col_offset in kicks:
            new_row = self.current_piece.row + row_offset
            new_col = self.current_piece.col + col_offset

            new_cells = self.current_piece.get_cells_at(new_row, new_col, to_state)

            if self.board.cells_valid(new_cells):
                self.current_piece.row = new_row
                self.current_piece.col = new_col
                self.current_piece.rotation_state = to_state
                return True

        return False

    def _check_on_ground(self):
        """Check if piece is on the ground (can't move down)."""
        if self.current_piece is None:
            return False

        below_cells = self.current_piece.get_cells_at(
            self.current_piece.row + 1,
            self.current_piece.col,
            self.current_piece.rotation_state
        )
        return not self.board.cells_valid(below_cells)

    def _lock_piece(self):
        """Lock the current piece into the board."""
        if self.current_piece is None:
            return

        # Lock the piece
        valid = self.board.lock_piece(self.current_piece)
        self.sound_manager.play('lock')

        if not valid:
            self._game_over()
            return

        # Check for line clears
        complete_lines = self.board.find_complete_lines()
        if complete_lines:
            self.board.start_line_clear_animation(complete_lines)
            self.lines_to_clear = complete_lines
            self.line_clear_counter = 0
            self.state = STATE_LINE_CLEAR
            self.current_piece = None

            # Play sound based on lines cleared
            if len(complete_lines) == 4:
                self.sound_manager.play('tetris')
            else:
                self.sound_manager.play('line_clear')
        else:
            # No lines, spawn next piece
            self._spawn_piece()

    def _finish_line_clear(self):
        """Finish line clear animation and update score."""
        num_lines = self.board.end_line_clear_animation()

        # Calculate score
        level_multiplier = self.level + 1
        if num_lines == 1:
            points = SCORE_SINGLE * level_multiplier
        elif num_lines == 2:
            points = SCORE_DOUBLE * level_multiplier
        elif num_lines == 3:
            points = SCORE_TRIPLE * level_multiplier
        else:  # 4 lines (Tetris)
            points = SCORE_TETRIS * level_multiplier

        self.score += points
        self.lines_cleared += num_lines

        # Level up check
        old_level = self.level
        self.level = self.selected_level + (self.lines_cleared // LINES_PER_LEVEL)

        if self.level > old_level:
            self.sound_manager.play('level_up')

        # Spawn next piece
        self.state = STATE_PLAYING
        self._spawn_piece()

    def _do_hard_drop(self):
        """Perform a hard drop."""
        if self.current_piece is None:
            return

        # Calculate drop distance
        drop_distance = 0
        while self._try_move(1, 0):
            drop_distance += 1

        # Award points
        self.score += drop_distance * SCORE_HARD_DROP

        self.sound_manager.play('hard_drop')

        # Lock immediately
        self._lock_piece()

    def _do_hold(self):
        """Perform hold action."""
        if self.current_piece is None or not self.hold_available:
            return

        current_type = self.current_piece.piece_type

        if self.hold_piece_type is None:
            # No held piece, hold current and spawn new
            self.hold_piece_type = current_type
            self._spawn_piece()
        else:
            # Swap with held piece
            self.current_piece = Tetromino(self.hold_piece_type)
            self.hold_piece_type = current_type

        self.hold_available = False
        self.is_locking = False
        self.lock_counter = 0
        self.sound_manager.play('hold')

    def handle_input(self, actions):
        """
        Handle input actions.

        Args:
            actions: Dictionary of action states from InputHandler
        """
        if self.state == STATE_START:
            # Start screen input
            if actions['any_key'] or actions['hard_drop']:
                self.start_game()
                self.sound_manager.play('select')

            # Level selection
            if actions['rotate_cw']:
                self.selected_level = min(9, self.selected_level + 1)
                self.sound_manager.play('move')
            if actions['rotate_ccw']:
                self.selected_level = max(0, self.selected_level - 1)
                self.sound_manager.play('move')

            return

        if self.state == STATE_GAME_OVER:
            if actions['restart']:
                self.state = STATE_START
                self.sound_manager.play('select')
            return

        if self.state == STATE_PAUSED:
            if actions['pause']:
                self.state = STATE_PLAYING
            return

        if self.state == STATE_LINE_CLEAR:
            # No input during line clear
            return

        # STATE_PLAYING
        if actions['pause']:
            self.state = STATE_PAUSED
            return

        if actions['restart']:
            self.state = STATE_START
            return

        if self.current_piece is None:
            return

        # Movement
        moved = False
        if actions['move_left']:
            if self._try_move(0, -1):
                moved = True
                self.sound_manager.play('move')

        if actions['move_right']:
            if self._try_move(0, 1):
                moved = True
                self.sound_manager.play('move')

        if actions['soft_drop']:
            if self._try_move(1, 0):
                self.score += SCORE_SOFT_DROP
                self.gravity_counter = 0  # Reset gravity on manual drop

        # Rotation
        if actions['rotate_cw']:
            if self._try_rotate(True):
                moved = True
                self.sound_manager.play('rotate')

        if actions['rotate_ccw']:
            if self._try_rotate(False):
                moved = True
                self.sound_manager.play('rotate')

        # Hard drop
        if actions['hard_drop']:
            self._do_hard_drop()
            return

        # Hold
        if actions['hold']:
            self._do_hold()
            return

        # If piece moved during lock delay, reset lock but decrement moves
        if moved and self.is_locking:
            if self.lock_moves_remaining > 0:
                self.lock_counter = 0
                self.lock_moves_remaining -= 1
            # If no moves remaining, piece will lock on next frame

    def update(self):
        """
        Update game state. Call once per frame.

        Returns:
            Line clear animation progress (0.0-1.0) or None
        """
        if self.state == STATE_LINE_CLEAR:
            self.line_clear_counter += 1
            progress = self.line_clear_counter / LINE_CLEAR_ANIMATION_FRAMES

            if self.line_clear_counter >= LINE_CLEAR_ANIMATION_FRAMES:
                self._finish_line_clear()
                return None

            return progress

        if self.state != STATE_PLAYING:
            return None

        if self.current_piece is None:
            return None

        # Gravity
        self.gravity_counter += 1
        if self.gravity_counter >= self._get_gravity_frames():
            self.gravity_counter = 0

            if not self._try_move(1, 0):
                # Can't move down, start/continue lock delay
                if not self.is_locking:
                    self.is_locking = True
                    self.lock_counter = 0

        # Lock delay
        if self.is_locking:
            if not self._check_on_ground():
                # Piece is no longer on ground (player moved it)
                self.is_locking = False
                self.lock_counter = 0
            else:
                self.lock_counter += 1
                if self.lock_counter >= LOCK_DELAY_FRAMES or self.lock_moves_remaining <= 0:
                    self._lock_piece()

        return None

    def get_ghost_row(self):
        """Get the ghost piece row position."""
        if self.current_piece is None:
            return None
        return self.current_piece.get_ghost_position(self.board)
