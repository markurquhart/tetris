#!/usr/bin/env python3
"""
Tetris - A classic Tetris game implementation.

A faithful recreation of the original 1989 Nintendo Tetris with
modern features like SRS rotation, hold piece, and ghost piece.
"""

import pygame
import sys

from constants import (
    WINDOW_WIDTH, WINDOW_HEIGHT, FPS,
    STATE_START, STATE_PLAYING, STATE_PAUSED, STATE_GAME_OVER, STATE_LINE_CLEAR
)
from game import Game
from renderer import Renderer
from input_handler import InputHandler
from sound_manager import SoundManager
from high_score import load_high_score, save_high_score


def main():
    """Main entry point."""
    # Initialize Pygame
    pygame.init()

    # Set up display
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("Tetris")

    # Try to set icon (creates a simple colored square)
    try:
        icon = pygame.Surface((32, 32))
        icon.fill((0, 255, 255))  # Cyan (I-piece color)
        pygame.display.set_icon(icon)
    except Exception:
        pass

    # Create clock for FPS control
    clock = pygame.time.Clock()

    # Initialize components
    sound_manager = SoundManager()
    renderer = Renderer(screen)
    input_handler = InputHandler()
    game = Game(sound_manager)

    # Load high score
    game.set_high_score(load_high_score())

    # Main game loop
    running = True
    while running:
        # Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            else:
                input_handler.handle_event(event)

        # Get input actions
        actions = input_handler.update()

        # Handle quit
        if actions['quit']:
            running = False
            continue

        # Handle mute toggle
        if actions['mute']:
            sound_manager.toggle_mute()

        # Update game
        game.handle_input(actions)
        line_clear_progress = game.update()

        # Render
        renderer.clear()

        if game.state == STATE_START:
            renderer.draw_start_screen(game.selected_level)
        else:
            # Draw game elements
            renderer.draw_board_background()
            renderer.draw_board(game.board, line_clear_progress or 0)

            # Draw ghost piece (only during playing state)
            if game.state == STATE_PLAYING and game.current_piece:
                ghost_row = game.get_ghost_row()
                if ghost_row is not None and ghost_row > game.current_piece.row:
                    renderer.draw_ghost(game.current_piece, ghost_row)

            # Draw current piece
            if game.current_piece:
                renderer.draw_piece(game.current_piece)

            # Draw UI panels
            renderer.draw_next_panel(game.next_pieces)
            renderer.draw_hold_panel(game.hold_piece_type, game.hold_available)
            renderer.draw_score_panel(
                game.score,
                game.high_score,
                game.level,
                game.lines_cleared
            )

            # Draw overlays
            if game.state == STATE_PAUSED:
                renderer.draw_pause_overlay()
            elif game.state == STATE_GAME_OVER:
                renderer.draw_game_over_overlay(
                    game.score,
                    game.high_score,
                    game.is_new_high_score
                )

        # Draw sound indicator
        renderer.draw_sound_indicator(sound_manager.is_enabled())

        # Update display
        pygame.display.flip()

        # Maintain FPS
        clock.tick(FPS)

    # Save high score before exiting
    save_high_score(game.high_score)

    # Cleanup
    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
