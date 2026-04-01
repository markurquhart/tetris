"""
Rendering module for all game graphics.
"""

import pygame
from constants import (
    WINDOW_WIDTH, WINDOW_HEIGHT,
    BOARD_COLS, BOARD_ROWS, BOARD_HIDDEN_ROWS,
    CELL_SIZE, BOARD_X, BOARD_Y,
    NEXT_PANEL_X, NEXT_PANEL_Y,
    HOLD_PANEL_X, HOLD_PANEL_Y,
    SCORE_PANEL_X, SCORE_PANEL_Y,
    BLACK, WHITE, GRAY, DARK_GRAY, LIGHT_GRAY,
    PIECE_COLORS, SHAPES, GHOST_ALPHA,
    STATE_START, STATE_PLAYING, STATE_PAUSED, STATE_GAME_OVER, STATE_LINE_CLEAR,
    LINE_CLEAR_ANIMATION_FRAMES
)


class Renderer:
    """Handles all game rendering."""

    def __init__(self, screen):
        """
        Initialize renderer.

        Args:
            screen: pygame display surface
        """
        self.screen = screen

        # Initialize fonts
        pygame.font.init()
        self.font_large = pygame.font.Font(None, 48)
        self.font_medium = pygame.font.Font(None, 36)
        self.font_small = pygame.font.Font(None, 24)

    def clear(self):
        """Clear the screen."""
        self.screen.fill(BLACK)

    def draw_board_background(self):
        """Draw the board background and grid."""
        # Board border
        border_rect = pygame.Rect(
            BOARD_X - 2, BOARD_Y - 2,
            BOARD_COLS * CELL_SIZE + 4,
            BOARD_ROWS * CELL_SIZE + 4
        )
        pygame.draw.rect(self.screen, GRAY, border_rect, 2)

        # Board background
        board_rect = pygame.Rect(
            BOARD_X, BOARD_Y,
            BOARD_COLS * CELL_SIZE,
            BOARD_ROWS * CELL_SIZE
        )
        pygame.draw.rect(self.screen, DARK_GRAY, board_rect)

        # Grid lines
        for col in range(BOARD_COLS + 1):
            x = BOARD_X + col * CELL_SIZE
            pygame.draw.line(
                self.screen, (50, 50, 50),
                (x, BOARD_Y),
                (x, BOARD_Y + BOARD_ROWS * CELL_SIZE)
            )
        for row in range(BOARD_ROWS + 1):
            y = BOARD_Y + row * CELL_SIZE
            pygame.draw.line(
                self.screen, (50, 50, 50),
                (BOARD_X, y),
                (BOARD_X + BOARD_COLS * CELL_SIZE, y)
            )

    def draw_cell(self, row, col, color, alpha=255):
        """
        Draw a single cell.

        Args:
            row: Visible row (0 = top visible row)
            col: Column
            color: RGB tuple
            alpha: Transparency (0-255)
        """
        x = BOARD_X + col * CELL_SIZE
        y = BOARD_Y + row * CELL_SIZE

        if alpha < 255:
            # Draw semi-transparent cell
            s = pygame.Surface((CELL_SIZE - 1, CELL_SIZE - 1))
            s.fill(color)
            s.set_alpha(alpha)
            self.screen.blit(s, (x + 1, y + 1))
        else:
            # Draw solid cell with border effect
            rect = pygame.Rect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2)
            pygame.draw.rect(self.screen, color, rect)

            # Highlight (top-left)
            highlight = tuple(min(c + 50, 255) for c in color)
            pygame.draw.line(self.screen, highlight, (x + 1, y + 1), (x + CELL_SIZE - 2, y + 1))
            pygame.draw.line(self.screen, highlight, (x + 1, y + 1), (x + 1, y + CELL_SIZE - 2))

            # Shadow (bottom-right)
            shadow = tuple(max(c - 50, 0) for c in color)
            pygame.draw.line(self.screen, shadow, (x + 1, y + CELL_SIZE - 2), (x + CELL_SIZE - 2, y + CELL_SIZE - 2))
            pygame.draw.line(self.screen, shadow, (x + CELL_SIZE - 2, y + 1), (x + CELL_SIZE - 2, y + CELL_SIZE - 2))

    def draw_board(self, board, line_clear_progress=0):
        """
        Draw the game board with locked pieces.

        Args:
            board: Board object
            line_clear_progress: Animation progress (0.0 to 1.0) for line clear
        """
        visible_grid = board.get_visible_grid()

        for row in range(BOARD_ROWS):
            is_clearing = board.is_row_in_clear_animation(row)

            for col in range(BOARD_COLS):
                color = visible_grid[row][col]
                if color is not None:
                    if is_clearing:
                        # Flash effect during line clear
                        cells_hidden = board.get_row_clear_progress(row, line_clear_progress)
                        center = BOARD_COLS // 2
                        if col < center - cells_hidden or col >= center + cells_hidden:
                            # Draw with flash effect
                            if int(line_clear_progress * 10) % 2 == 0:
                                self.draw_cell(row, col, WHITE)
                            else:
                                self.draw_cell(row, col, color)
                    else:
                        self.draw_cell(row, col, color)

    def draw_piece(self, piece):
        """Draw the current falling piece."""
        if piece is None:
            return

        for row, col in piece.get_cells():
            visible_row = row - BOARD_HIDDEN_ROWS
            if visible_row >= 0:
                self.draw_cell(visible_row, col, piece.color)

    def draw_ghost(self, piece, ghost_row):
        """
        Draw the ghost piece.

        Args:
            piece: Current tetromino
            ghost_row: Row where ghost should appear
        """
        if piece is None:
            return

        cells = piece.get_cells_at(ghost_row, piece.col, piece.rotation_state)
        for row, col in cells:
            visible_row = row - BOARD_HIDDEN_ROWS
            if visible_row >= 0:
                self.draw_cell(visible_row, col, piece.color, GHOST_ALPHA)

    def draw_preview_piece(self, piece_type, x, y, scale=0.7):
        """
        Draw a small preview of a piece.

        Args:
            piece_type: Type of piece to draw
            x, y: Top-left position
            scale: Size scale
        """
        if piece_type is None:
            return

        color = PIECE_COLORS[piece_type]
        shape = SHAPES[piece_type][0]  # Use rotation state 0

        cell_size = int(CELL_SIZE * scale)

        # Find bounding box
        min_r = min(r for r, c in shape)
        max_r = max(r for r, c in shape)
        min_c = min(c for r, c in shape)
        max_c = max(c for r, c in shape)

        # Center the piece in preview area
        width = (max_c - min_c + 1) * cell_size
        height = (max_r - min_r + 1) * cell_size

        offset_x = x + (80 - width) // 2
        offset_y = y + (60 - height) // 2

        for r, c in shape:
            px = offset_x + (c - min_c) * cell_size
            py = offset_y + (r - min_r) * cell_size

            rect = pygame.Rect(px, py, cell_size - 1, cell_size - 1)
            pygame.draw.rect(self.screen, color, rect)

            # Simple highlight
            highlight = tuple(min(comp + 40, 255) for comp in color)
            pygame.draw.line(self.screen, highlight, (px, py), (px + cell_size - 2, py))
            pygame.draw.line(self.screen, highlight, (px, py), (px, py + cell_size - 2))

    def draw_next_panel(self, next_pieces):
        """
        Draw the next pieces preview panel.

        Args:
            next_pieces: List of upcoming piece types
        """
        # Panel background
        panel_width = 100
        panel_height = 190
        pygame.draw.rect(
            self.screen, DARK_GRAY,
            (NEXT_PANEL_X, NEXT_PANEL_Y, panel_width, panel_height)
        )
        pygame.draw.rect(
            self.screen, GRAY,
            (NEXT_PANEL_X, NEXT_PANEL_Y, panel_width, panel_height), 2
        )

        # Title
        title = self.font_small.render("NEXT", True, WHITE)
        self.screen.blit(title, (NEXT_PANEL_X + 30, NEXT_PANEL_Y + 5))

        # Draw next pieces
        for i, piece_type in enumerate(next_pieces[:3]):
            self.draw_preview_piece(
                piece_type,
                NEXT_PANEL_X + 10,
                NEXT_PANEL_Y + 25 + i * 55
            )

    def draw_hold_panel(self, hold_piece_type, hold_available):
        """
        Draw the hold piece panel.

        Args:
            hold_piece_type: Type of held piece (or None)
            hold_available: Whether hold action is available
        """
        panel_width = 100
        panel_height = 80

        # Panel background (darker if hold not available)
        bg_color = DARK_GRAY if hold_available else (25, 25, 25)
        pygame.draw.rect(
            self.screen, bg_color,
            (HOLD_PANEL_X, HOLD_PANEL_Y, panel_width, panel_height)
        )

        border_color = GRAY if hold_available else (60, 60, 60)
        pygame.draw.rect(
            self.screen, border_color,
            (HOLD_PANEL_X, HOLD_PANEL_Y, panel_width, panel_height), 2
        )

        # Title
        title_color = WHITE if hold_available else GRAY
        title = self.font_small.render("HOLD", True, title_color)
        self.screen.blit(title, (HOLD_PANEL_X + 30, HOLD_PANEL_Y + 5))

        # Draw held piece
        if hold_piece_type is not None:
            self.draw_preview_piece(
                hold_piece_type,
                HOLD_PANEL_X + 10,
                HOLD_PANEL_Y + 20
            )

    def draw_score_panel(self, score, high_score, level, lines):
        """
        Draw the score and stats panel.

        Args:
            score: Current score
            high_score: High score
            level: Current level
            lines: Lines cleared
        """
        y = SCORE_PANEL_Y

        # Score
        score_label = self.font_small.render("SCORE", True, GRAY)
        self.screen.blit(score_label, (SCORE_PANEL_X, y))
        score_text = self.font_medium.render(str(score), True, WHITE)
        self.screen.blit(score_text, (SCORE_PANEL_X, y + 20))

        # High score
        y += 60
        hi_label = self.font_small.render("HIGH", True, GRAY)
        self.screen.blit(hi_label, (SCORE_PANEL_X, y))
        hi_text = self.font_medium.render(str(high_score), True, WHITE)
        self.screen.blit(hi_text, (SCORE_PANEL_X, y + 20))

        # Level
        y += 60
        level_label = self.font_small.render("LEVEL", True, GRAY)
        self.screen.blit(level_label, (SCORE_PANEL_X, y))
        level_text = self.font_medium.render(str(level), True, WHITE)
        self.screen.blit(level_text, (SCORE_PANEL_X, y + 20))

        # Lines
        y += 60
        lines_label = self.font_small.render("LINES", True, GRAY)
        self.screen.blit(lines_label, (SCORE_PANEL_X, y))
        lines_text = self.font_medium.render(str(lines), True, WHITE)
        self.screen.blit(lines_text, (SCORE_PANEL_X, y + 20))

    def draw_start_screen(self, selected_level):
        """
        Draw the start screen.

        Args:
            selected_level: Currently selected starting level
        """
        self.clear()

        # Title
        title = self.font_large.render("TETRIS", True, WHITE)
        title_rect = title.get_rect(center=(WINDOW_WIDTH // 2, 150))
        self.screen.blit(title, title_rect)

        # Draw sample pieces as decoration
        piece_types = [0, 1, 2, 3, 4, 5, 6]
        for i, pt in enumerate(piece_types):
            x = 50 + i * 60
            self.draw_preview_piece(pt, x, 200, 0.5)

        # Level selection
        level_text = self.font_medium.render(f"Level: {selected_level}", True, WHITE)
        level_rect = level_text.get_rect(center=(WINDOW_WIDTH // 2, 350))
        self.screen.blit(level_text, level_rect)

        # Instructions
        instructions = [
            "UP/DOWN to select level",
            "Press SPACE to start",
            "",
            "Controls:",
            "Arrow keys - Move",
            "UP/X - Rotate CW",
            "Z - Rotate CCW",
            "SPACE - Hard drop",
            "C - Hold piece",
            "P - Pause",
            "M - Mute"
        ]

        y = 400
        for line in instructions:
            text = self.font_small.render(line, True, LIGHT_GRAY)
            text_rect = text.get_rect(center=(WINDOW_WIDTH // 2, y))
            self.screen.blit(text, text_rect)
            y += 25

    def draw_pause_overlay(self):
        """Draw the pause screen overlay."""
        # Semi-transparent overlay
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
        overlay.fill(BLACK)
        overlay.set_alpha(180)
        self.screen.blit(overlay, (0, 0))

        # Pause text
        pause_text = self.font_large.render("PAUSED", True, WHITE)
        pause_rect = pause_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 30))
        self.screen.blit(pause_text, pause_rect)

        resume_text = self.font_small.render("Press P to resume", True, LIGHT_GRAY)
        resume_rect = resume_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20))
        self.screen.blit(resume_text, resume_rect)

    def draw_game_over_overlay(self, score, high_score, is_new_high):
        """
        Draw the game over screen overlay.

        Args:
            score: Final score
            high_score: High score
            is_new_high: Whether this is a new high score
        """
        # Semi-transparent overlay
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
        overlay.fill(BLACK)
        overlay.set_alpha(200)
        self.screen.blit(overlay, (0, 0))

        # Game over text
        go_text = self.font_large.render("GAME OVER", True, WHITE)
        go_rect = go_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 80))
        self.screen.blit(go_text, go_rect)

        # Score
        score_text = self.font_medium.render(f"Score: {score}", True, WHITE)
        score_rect = score_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 20))
        self.screen.blit(score_text, score_rect)

        # New high score indicator
        if is_new_high:
            new_text = self.font_medium.render("NEW HIGH SCORE!", True, (255, 215, 0))
            new_rect = new_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20))
            self.screen.blit(new_text, new_rect)
        else:
            hi_text = self.font_small.render(f"High Score: {high_score}", True, LIGHT_GRAY)
            hi_rect = hi_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20))
            self.screen.blit(hi_text, hi_rect)

        # Restart instruction
        restart_text = self.font_small.render("Press R to restart", True, LIGHT_GRAY)
        restart_rect = restart_text.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 70))
        self.screen.blit(restart_text, restart_rect)

    def draw_sound_indicator(self, enabled):
        """Draw sound on/off indicator."""
        text = "Sound: ON" if enabled else "Sound: OFF"
        color = WHITE if enabled else GRAY
        indicator = self.font_small.render(text, True, color)
        self.screen.blit(indicator, (BOARD_X, WINDOW_HEIGHT - 30))
