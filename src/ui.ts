/**
 * Local UI preview switcher.
 * Open /chooser.html then pick a look, or use ?ui=1..10
 */
export const UI_THEMES = [
  { id: 1, name: 'Void' },
  { id: 2, name: 'Handheld' },
  { id: 3, name: 'Terminal' },
  { id: 4, name: 'Scoreboard' },
  { id: 5, name: 'Paper' },
  { id: 6, name: 'Foundry' },
  { id: 7, name: 'Poster' },
  { id: 8, name: 'Glass Dock' },
  { id: 9, name: 'Workbench' },
  { id: 10, name: 'Carnival' },
] as const;

const STORAGE_KEY = 'tetris-ui';

export function applyUiTheme(): number {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = Number(params.get('ui') || '');
  const fromStore = Number(localStorage.getItem(STORAGE_KEY) || '');
  const id =
    fromQuery >= 1 && fromQuery <= 10
      ? fromQuery
      : fromStore >= 1 && fromStore <= 10
        ? fromStore
        : 7; // Poster

  localStorage.setItem(STORAGE_KEY, String(id));

  document.documentElement.dataset.ui = String(id);
  document.title = 'DEF NOT TETRIS';
  document.getElementById('ui-preview-badge')?.remove();
  return id;
}
