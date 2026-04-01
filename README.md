# Tetris

## What this is

A desktop Tetris clone written in **Python**, rendered with **Pygame**. It aims for NES-style feel (scoring, gravity, level progression) while adding modern conveniences: SRS rotation with wall kicks, hold, a ghost piece, a three-piece preview, and high scores saved locally in `highscore.txt`. Audio is generated in code (no external sound assets required).

**Stack:** Python 3.8+, [Pygame](https://www.pygame.org/) (window, input, graphics, audio), NumPy (procedural sound synthesis in `sound_manager.py`).

## Features

- All 7 classic tetrominoes with authentic colors
- SRS (Super Rotation System) with wall kicks
- Ghost piece showing landing position
- Hold piece functionality
- Next piece preview (3 pieces)
- NES-style scoring system
- Level progression with increasing speed
- High score persistence
- DAS (Delayed Auto Shift) for smooth movement
- Sound effects and background music
- Pause, restart, and mute controls

## Installation

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)

### Setup

1. Clone or download this repository and open a terminal in the project root (the folder that contains `main.py`).

2. Create and activate a virtual environment:

```bash
python3 -m venv venv
```

```bash
# macOS / Linux
source venv/bin/activate
```

```powershell
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
```

```bat
# Windows (Command Prompt)
venv\Scripts\activate.bat
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## How to run

With the virtual environment activated and your shell in the project root:

```bash
python main.py
```

On some systems the interpreter is `python3` instead of `python`:

```bash
python3 main.py
```

The window title should be **Tetris**. Quit with **ESC** or by closing the window.

## Controls

| Key | Action |
|-----|--------|
| ← / → | Move piece left/right |
| ↓ | Soft drop (accelerated fall) |
| ↑ / X | Rotate clockwise |
| Z | Rotate counter-clockwise |
| Space | Hard drop (instant drop) |
| C | Hold piece |
| P | Pause/Unpause |
| R | Restart game |
| M | Mute/Unmute audio |
| ESC | Quit game |

## Scoring

| Action | Points |
|--------|--------|
| Single (1 line) | 40 × (level + 1) |
| Double (2 lines) | 100 × (level + 1) |
| Triple (3 lines) | 300 × (level + 1) |
| Tetris (4 lines) | 1200 × (level + 1) |
| Soft drop | 1 point per cell |
| Hard drop | 2 points per cell |

## Level System

- Start at Level 0 (selectable 0-9 on start screen)
- Level increases every 10 lines cleared
- Speed increases with each level
- Maximum speed reached at Level 29

## Project Structure

```
├── main.py           # Entry point
├── constants.py      # Game constants and colors
├── tetromino.py      # Tetromino definitions and rotation
├── board.py          # Game board logic
├── game.py           # Main game logic
├── renderer.py       # All rendering code
├── input_handler.py  # Input handling with DAS
├── sound_manager.py  # Audio management
├── high_score.py     # High score persistence
├── requirements.txt  # Python dependencies
├── .gitignore        # Git ignore rules (e.g. venv, highscore.txt)
└── README.md         # This file
```

## License

This project is for educational purposes.
