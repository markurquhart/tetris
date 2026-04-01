"""
Input handling with DAS (Delayed Auto Shift) for smooth movement.
"""

import pygame
from constants import DAS_DELAY_FRAMES, DAS_REPEAT_FRAMES


class InputHandler:
    """Handles keyboard input with DAS for horizontal movement."""

    def __init__(self):
        """Initialize input handler state."""
        self.reset()

    def reset(self):
        """Reset all input state."""
        # DAS state for left/right movement
        self.left_held = False
        self.right_held = False
        self.down_held = False

        self.left_das_counter = 0
        self.right_das_counter = 0
        self.down_das_counter = 0

        # Track if initial move has been made
        self.left_initial_move = False
        self.right_initial_move = False
        self.down_initial_move = False

        # Single-press actions (consumed after reading)
        self.rotate_cw = False
        self.rotate_ccw = False
        self.hard_drop = False
        self.hold = False
        self.pause = False
        self.restart = False
        self.quit = False
        self.mute = False
        self.any_key = False

        # Level selection (for start screen)
        self.level_up = False
        self.level_down = False

    def handle_event(self, event):
        """
        Process a pygame event.

        Args:
            event: pygame event object
        """
        if event.type == pygame.KEYDOWN:
            self.any_key = True

            if event.key == pygame.K_LEFT:
                self.left_held = True
                self.left_das_counter = 0
                self.left_initial_move = False
            elif event.key == pygame.K_RIGHT:
                self.right_held = True
                self.right_das_counter = 0
                self.right_initial_move = False
            elif event.key == pygame.K_DOWN:
                self.down_held = True
                self.down_das_counter = 0
                self.down_initial_move = False
            elif event.key == pygame.K_UP or event.key == pygame.K_x:
                self.rotate_cw = True
            elif event.key == pygame.K_z:
                self.rotate_ccw = True
            elif event.key == pygame.K_SPACE:
                self.hard_drop = True
            elif event.key == pygame.K_c:
                self.hold = True
            elif event.key == pygame.K_p:
                self.pause = True
            elif event.key == pygame.K_r:
                self.restart = True
            elif event.key == pygame.K_m:
                self.mute = True
            elif event.key == pygame.K_ESCAPE:
                self.quit = True

        elif event.type == pygame.KEYUP:
            if event.key == pygame.K_LEFT:
                self.left_held = False
                self.left_das_counter = 0
                self.left_initial_move = False
            elif event.key == pygame.K_RIGHT:
                self.right_held = False
                self.right_das_counter = 0
                self.right_initial_move = False
            elif event.key == pygame.K_DOWN:
                self.down_held = False
                self.down_das_counter = 0
                self.down_initial_move = False

    def update(self):
        """
        Update DAS counters. Call once per frame.

        Returns:
            Dictionary of movement actions to take this frame
        """
        actions = {
            'move_left': False,
            'move_right': False,
            'soft_drop': False,
            'rotate_cw': self.rotate_cw,
            'rotate_ccw': self.rotate_ccw,
            'hard_drop': self.hard_drop,
            'hold': self.hold,
            'pause': self.pause,
            'restart': self.restart,
            'quit': self.quit,
            'mute': self.mute,
            'any_key': self.any_key,
        }

        # Clear single-press actions
        self.rotate_cw = False
        self.rotate_ccw = False
        self.hard_drop = False
        self.hold = False
        self.pause = False
        self.restart = False
        self.quit = False
        self.mute = False
        self.any_key = False

        # Process left movement with DAS
        if self.left_held:
            if not self.left_initial_move:
                actions['move_left'] = True
                self.left_initial_move = True
            else:
                self.left_das_counter += 1
                if self.left_das_counter >= DAS_DELAY_FRAMES:
                    # In auto-repeat phase
                    repeat_frame = self.left_das_counter - DAS_DELAY_FRAMES
                    if repeat_frame % DAS_REPEAT_FRAMES == 0:
                        actions['move_left'] = True

        # Process right movement with DAS
        if self.right_held:
            if not self.right_initial_move:
                actions['move_right'] = True
                self.right_initial_move = True
            else:
                self.right_das_counter += 1
                if self.right_das_counter >= DAS_DELAY_FRAMES:
                    repeat_frame = self.right_das_counter - DAS_DELAY_FRAMES
                    if repeat_frame % DAS_REPEAT_FRAMES == 0:
                        actions['move_right'] = True

        # Process soft drop with DAS (faster repeat)
        if self.down_held:
            if not self.down_initial_move:
                actions['soft_drop'] = True
                self.down_initial_move = True
            else:
                self.down_das_counter += 1
                # Soft drop repeats every 2 frames for fast dropping
                if self.down_das_counter % 2 == 0:
                    actions['soft_drop'] = True

        return actions

    def is_down_held(self):
        """Check if down is currently held (for soft drop points)."""
        return self.down_held
