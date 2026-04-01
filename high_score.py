"""
High score persistence module.
"""

import os
from constants import HIGH_SCORE_FILE


def get_high_score_path():
    """Get the path to the high score file."""
    # Store in same directory as the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, HIGH_SCORE_FILE)


def load_high_score():
    """
    Load the high score from file.

    Returns:
        Integer high score, or 0 if no file exists
    """
    path = get_high_score_path()
    try:
        with open(path, 'r') as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return 0


def save_high_score(score):
    """
    Save a new high score to file.

    Args:
        score: Integer score to save
    """
    path = get_high_score_path()
    try:
        with open(path, 'w') as f:
            f.write(str(score))
    except IOError:
        pass  # Silently fail if we can't write
