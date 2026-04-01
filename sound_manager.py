"""
Sound and music management module.
Uses procedurally generated sounds.
"""

import pygame
import numpy as np
import io


class SoundManager:
    """Manages game sounds and music."""

    def __init__(self):
        """Initialize the sound manager."""
        self.enabled = True
        self.initialized = False
        self.sounds = {}

        try:
            pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            self.initialized = True
            self._generate_sounds()
        except pygame.error:
            print("Warning: Could not initialize audio")
            self.initialized = False

    def _generate_tone(self, frequency, duration, volume=0.3, wave_type='square'):
        """
        Generate a simple tone.

        Args:
            frequency: Frequency in Hz
            duration: Duration in seconds
            volume: Volume (0.0 to 1.0)
            wave_type: 'square', 'sine', or 'triangle'

        Returns:
            pygame.mixer.Sound object
        """
        sample_rate = 44100
        n_samples = int(sample_rate * duration)
        t = np.linspace(0, duration, n_samples, False)

        if wave_type == 'square':
            wave = np.sign(np.sin(2 * np.pi * frequency * t))
        elif wave_type == 'sine':
            wave = np.sin(2 * np.pi * frequency * t)
        elif wave_type == 'triangle':
            wave = 2 * np.abs(2 * (t * frequency - np.floor(t * frequency + 0.5))) - 1
        else:
            wave = np.sin(2 * np.pi * frequency * t)

        # Apply envelope (fade in/out)
        envelope = np.ones(n_samples)
        fade_samples = int(sample_rate * 0.01)
        envelope[:fade_samples] = np.linspace(0, 1, fade_samples)
        envelope[-fade_samples:] = np.linspace(1, 0, fade_samples)

        wave = wave * envelope * volume

        # Convert to 16-bit stereo
        wave = (wave * 32767).astype(np.int16)
        stereo = np.column_stack((wave, wave))

        sound = pygame.mixer.Sound(buffer=stereo)
        return sound

    def _generate_noise_burst(self, duration, volume=0.2):
        """Generate a short noise burst."""
        sample_rate = 44100
        n_samples = int(sample_rate * duration)

        # Generate noise
        noise = np.random.uniform(-1, 1, n_samples)

        # Apply envelope
        envelope = np.exp(-np.linspace(0, 5, n_samples))
        noise = noise * envelope * volume

        # Convert to 16-bit stereo
        noise = (noise * 32767).astype(np.int16)
        stereo = np.column_stack((noise, noise))

        return pygame.mixer.Sound(buffer=stereo)

    def _generate_arpeggio(self, frequencies, note_duration, volume=0.3):
        """Generate an arpeggio (sequence of notes)."""
        sample_rate = 44100
        all_samples = []

        for freq in frequencies:
            n_samples = int(sample_rate * note_duration)
            t = np.linspace(0, note_duration, n_samples, False)
            wave = np.sign(np.sin(2 * np.pi * freq * t))

            # Envelope
            envelope = np.exp(-np.linspace(0, 3, n_samples))
            wave = wave * envelope * volume
            all_samples.extend(wave)

        samples = np.array(all_samples)
        samples = (samples * 32767).astype(np.int16)
        stereo = np.column_stack((samples, samples))

        return pygame.mixer.Sound(buffer=stereo)

    def _generate_sounds(self):
        """Generate all game sounds."""
        if not self.initialized:
            return

        try:
            # Movement sound - short blip
            self.sounds['move'] = self._generate_tone(200, 0.03, 0.15, 'square')

            # Rotation sound - slightly higher blip
            self.sounds['rotate'] = self._generate_tone(300, 0.05, 0.15, 'square')

            # Hard drop sound - descending tone
            self.sounds['hard_drop'] = self._generate_tone(150, 0.1, 0.25, 'square')

            # Lock sound - thud
            self.sounds['lock'] = self._generate_noise_burst(0.08, 0.2)

            # Single line clear
            self.sounds['line_clear'] = self._generate_arpeggio([523, 659, 784], 0.08, 0.25)

            # Tetris (4 lines) - triumphant arpeggio
            self.sounds['tetris'] = self._generate_arpeggio(
                [523, 659, 784, 1047], 0.1, 0.35
            )

            # Level up - ascending arpeggio
            self.sounds['level_up'] = self._generate_arpeggio(
                [440, 554, 659, 880], 0.12, 0.3
            )

            # Hold sound
            self.sounds['hold'] = self._generate_tone(400, 0.05, 0.15, 'triangle')

            # Game over - descending sad tones
            self.sounds['game_over'] = self._generate_arpeggio(
                [440, 349, 294, 220], 0.2, 0.3
            )

            # Menu select
            self.sounds['select'] = self._generate_tone(600, 0.08, 0.2, 'square')

        except Exception as e:
            print(f"Warning: Could not generate sounds: {e}")
            self.initialized = False

    def play(self, sound_name):
        """
        Play a sound effect.

        Args:
            sound_name: Name of the sound to play
        """
        if not self.enabled or not self.initialized:
            return

        if sound_name in self.sounds:
            try:
                self.sounds[sound_name].play()
            except pygame.error:
                pass

    def toggle_mute(self):
        """Toggle sound on/off."""
        self.enabled = not self.enabled
        return self.enabled

    def is_enabled(self):
        """Check if sound is enabled."""
        return self.enabled and self.initialized
