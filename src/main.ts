import './style.css';
import './ui-themes.css';
import { AuthService } from './auth';
import {
  FPS,
  MAX_CATCH_UP_FRAMES,
  STATE_GAME_OVER,
  STATE_PAUSED,
  STATE_START,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
} from './constants';
import { Game } from './game';
import { bindPlayfieldGestures, preventMobilePageZoom } from './gestures';
import { InputHandler } from './input';
import { Renderer } from './renderer';
import {
  formatEndedAt,
  formatPlayTime,
  ScoreService,
  type LeaderboardKind,
} from './scores';
import { SoundManager } from './sound';
import { applyUiTheme } from './ui';

preventMobilePageZoom();
applyUiTheme();

declare global {
  interface Window {
    __dntPreviewCelebration?: (kind: 'tetris' | 'perfect' | 'tetris_perfect') => void;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
// alpha:false + desynchronized lowers compositing latency on supporting browsers.
const ctx =
  canvas.getContext('2d', { alpha: false, desynchronized: true }) ??
  canvas.getContext('2d')!;
canvas.width = WINDOW_WIDTH;
canvas.height = WINDOW_HEIGHT;

const sound = new SoundManager();
const input = new InputHandler();
const renderer = new Renderer(ctx);
const auth = new AuthService();
const scores = new ScoreService(auth);
const game = new Game(sound);

const crt = document.querySelector<HTMLElement>('.crt')!;
const playAlert = document.querySelector<HTMLElement>('#play-alert')!;

let lastGameOverHandled = false;
let lineClearProgress: number | null = null;
let paintQueued = false;
let lastCelebrationKind: string | null = null;
let hudStatusFallback = '';

function celebrationCopy(kind: NonNullable<typeof game.celebration>['kind']): {
  status: string;
  toast: string;
} {
  if (kind === 'tetris_perfect') {
    return { status: 'PERFECT TETRIS — BOARD WIPED!', toast: 'PERFECT TETRIS' };
  }
  if (kind === 'perfect') {
    return { status: 'ALL CLEAR — EMPTY BOARD!', toast: 'ALL CLEAR' };
  }
  return { status: 'TETRIS!', toast: 'TETRIS!' };
}

function syncCelebrationAlert(): void {
  const cele = game.celebration;
  if (!cele) {
    if (lastCelebrationKind !== null) {
      lastCelebrationKind = null;
      statusLine.classList.remove('is-alert', 'alert-tetris', 'alert-perfect', 'alert-tetris_perfect');
      statusLine.textContent = hudStatusFallback || statusLine.textContent;
      playAlert.hidden = true;
      playAlert.classList.remove('is-on', 'kind-tetris', 'kind-perfect', 'kind-tetris_perfect');
      crt.classList.remove('is-celebrate', 'is-celebrate-perfect');
    }
    return;
  }

  const copy = celebrationCopy(cele.kind);
  if (lastCelebrationKind !== cele.kind) {
    lastCelebrationKind = cele.kind;
    statusLine.classList.remove('alert-tetris', 'alert-perfect', 'alert-tetris_perfect');
    statusLine.classList.add('is-alert', `alert-${cele.kind}`);
    statusLine.textContent = copy.status;

    playAlert.hidden = false;
    playAlert.textContent = copy.toast;
    playAlert.classList.remove('kind-tetris', 'kind-perfect', 'kind-tetris_perfect');
    playAlert.classList.add('is-on', `kind-${cele.kind}`);

    crt.classList.remove('is-celebrate', 'is-celebrate-perfect');
    // Retrigger CSS animation
    void crt.offsetWidth;
    crt.classList.add(
      cele.kind === 'tetris' ? 'is-celebrate' : 'is-celebrate-perfect',
    );
  }
}

function paint(): void {
  if (game.state === STATE_START) {
    renderer.drawStartScreen(
      game.selectedLevel,
      auth.displayName.toUpperCase(),
      auth.isSignedIn() ? 'CLOUD SAVE ON' : 'GUEST PLAY',
    );
  } else {
    renderer.clear();
    renderer.drawBoardBackground();
    renderer.drawBoard(game.board, lineClearProgress ?? 0);
    if (game.state === 'playing' && game.currentPiece) {
      const ghostRow = game.getGhostRow();
      if (ghostRow !== null && ghostRow > game.currentPiece.row) {
        renderer.drawGhost(game.currentPiece, ghostRow);
      }
    }
    renderer.drawPiece(game.currentPiece);
    renderer.drawHud(
      game.nextPieces,
      game.holdPieceType,
      game.holdAvailable,
      game.score,
      game.highScore,
      game.level,
      game.linesCleared,
    );
    if (game.celebration) renderer.drawCelebration(game.celebration);
    if (game.state === STATE_PAUSED) renderer.drawPauseOverlay();
    if (game.state === STATE_GAME_OVER) {
      renderer.drawGameOverOverlay(game.score, game.highScore, game.isNewHighScore);
    }
  }
  renderer.drawSoundIndicator(sound.isEnabled());
  syncCelebrationAlert();
}

/**
 * Touch paint: microtask coalesce (faster than waiting on rAF when the
 * sim loop is hitching). Same-tick multi-step moves still paint once.
 */
function schedulePaint(): void {
  if (paintQueued) return;
  paintQueued = true;
  queueMicrotask(() => {
    paintQueued = false;
    paint();
  });
}

bindPlayfieldGestures(
  crt,
  input,
  {
    unlock: () => {
      void sound.unlock();
    },
    paint: schedulePaint,
    getCol: () => game.getTouchCol(),
    getRow: () => game.getTouchRow(),
    getPieceEpoch: () => game.pieceEpoch,
    seekCol: (col) => game.touchSeekCol(col),
    seekRow: (row) => game.touchSeekRow(row),
    rotate: () => {
      game.touchRotate();
    },
    hardDrop: () => {
      game.touchHardDrop();
    },
    hold: () => {
      game.touchHold();
    },
    start: () => {
      game.touchStartFromTitle();
    },
  },
  () => game.state === STATE_START,
);

const playerLabel = document.querySelector<HTMLElement>('#player-label')!;
const bestLabel = document.querySelector<HTMLElement>('#best-label')!;
const statusLine = document.querySelector<HTMLElement>('#status-line')!;
const authBlurb = document.querySelector<HTMLElement>('#auth-blurb')!;
const leaderboardEl = document.querySelector<HTMLOListElement>('#leaderboard')!;
const boardTabs = document.querySelector<HTMLElement>('#board-tabs')!;
const authModal = document.querySelector<HTMLDialogElement>('#auth-modal')!;
const authForm = document.querySelector<HTMLFormElement>('#auth-form')!;
const authError = document.querySelector<HTMLElement>('#auth-error')!;
const authName = document.querySelector<HTMLInputElement>('#auth-name')!;
const authEmail = document.querySelector<HTMLInputElement>('#auth-email')!;
const authPassword = document.querySelector<HTMLInputElement>('#auth-password')!;
const btnSignOut = document.querySelector<HTMLButtonElement>('#btn-signout')!;
const btnAuthOpen = document.querySelector<HTMLButtonElement>('#btn-auth-open')!;
const btnAuthOpenSide = document.querySelector<HTMLButtonElement>('#btn-auth-open-side')!;
const btnProfileOpen = document.querySelector<HTMLButtonElement>('#btn-profile-open')!;
const profileModal = document.querySelector<HTMLDialogElement>('#profile-modal')!;
const profileName = document.querySelector<HTMLInputElement>('#profile-name')!;
const profileNameMsg = document.querySelector<HTMLElement>('#profile-name-msg')!;
const profileStats = document.querySelector<HTMLElement>('#profile-stats')!;
const profileLatest = document.querySelector<HTMLElement>('#profile-latest')!;
const profileAwards = document.querySelector<HTMLUListElement>('#profile-awards')!;
const profileHistory = document.querySelector<HTMLOListElement>('#profile-history')!;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLeaderboard(): void {
  if (!scores.leaderboard.length) {
    leaderboardEl.innerHTML = '<li class="empty">Waiting for challengers…</li>';
    return;
  }

  leaderboardEl.innerHTML = scores.leaderboard
    .map(
      (entry, i) => `
      <li>
        <span class="rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="name">${escapeHtml(entry.displayName)}</span>
        <span class="pts">${escapeHtml(entry.displayValue)}</span>
      </li>`,
    )
    .join('');
}

function renderProfilePanel(): void {
  const career = scores.career;
  if (!career) {
    profileStats.innerHTML = '<p class="auth-blurb">No career data yet.</p>';
    profileLatest.innerHTML = '';
    profileAwards.innerHTML = '';
    profileHistory.innerHTML = '<li class="empty">Sign in and finish a game.</li>';
    return;
  }

  profileName.value = career.displayName === 'PLAYER' ? auth.displayName : career.displayName;

  profileStats.innerHTML = [
    ['GAMES', String(career.totalGames)],
    ['LINES', String(career.totalLinesCleared)],
    ['PLAY', formatPlayTime(career.totalPlayMs)],
    ['BEST', String(career.bestScore)],
    ['BEST LN', String(career.bestLinesInGame)],
    ['AWARDS', String(career.awardsCount)],
  ]
    .map(
      ([label, value]) => `
      <div class="profile-stat">
        <span>${label}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>`,
    )
    .join('');

  // Public-safe teaser: most recent game without timestamp
  if (career.totalGames > 0) {
    profileLatest.innerHTML = `
      <div class="panel-title profile-section-title">LATEST RUN</div>
      <p class="latest-run">
        ${career.latestScore} pts · ${career.latestLines} lines · Lv ${career.latestLevel}
      </p>`;
  } else {
    profileLatest.innerHTML = '';
  }

  if (!scores.awards.length) {
    profileAwards.innerHTML = '<li class="empty">Awards unlock as you play.</li>';
  } else {
    profileAwards.innerHTML = scores.awards
      .map(
        (a) => `
        <li class="${a.earned ? 'is-earned' : 'is-locked'}" title="${escapeHtml(a.description)}">
          <span class="award-title">${escapeHtml(a.title)}</span>
          <span class="award-state">${a.earned ? 'EARNED' : 'LOCKED'}</span>
        </li>`,
      )
      .join('');
  }

  if (!scores.history.length) {
    profileHistory.innerHTML =
      '<li class="empty">No saved games yet — finish a run while signed in.</li>';
  } else {
    profileHistory.innerHTML = scores.history
      .map((run) => {
        const when = run.endedAt ? formatEndedAt(run.endedAt) : '';
        return `
        <li>
          <span class="hist-score">${run.score}</span>
          <span class="hist-meta">${run.linesCleared} ln · Lv ${run.levelReached} · ${formatPlayTime(run.durationMs)}</span>
          <span class="hist-when">${escapeHtml(when)}</span>
        </li>`;
      })
      .join('');
  }
}

const playerStat = playerLabel.closest('.stat') as HTMLElement | null;

function refreshHud(): void {
  playerLabel.textContent = auth.displayName.toUpperCase();
  bestLabel.textContent = String(scores.highScore);
  playerStat?.classList.toggle('is-clickable', auth.isSignedIn());
  if (playerStat) {
    playerStat.title = auth.isSignedIn() ? 'Open profile' : '';
  }
  hudStatusFallback = auth.isSignedIn()
    ? `${auth.message} · ${scores.statusMessage}`
    : scores.statusMessage;
  if (!game.celebration) {
    statusLine.classList.remove('is-alert', 'alert-tetris', 'alert-perfect', 'alert-tetris_perfect');
    statusLine.textContent = hudStatusFallback;
  }
  authBlurb.textContent = auth.isSignedIn()
    ? `Signed in as ${auth.displayName}. Career, history, and boards sync across devices.`
    : 'Sign in to sync career stats, awards, and every finished game.';
  btnSignOut.hidden = !auth.isSignedIn();
  btnAuthOpen.hidden = auth.isSignedIn();
  if (btnAuthOpenSide) btnAuthOpenSide.hidden = auth.isSignedIn();
  btnProfileOpen.hidden = !auth.isSignedIn();
  game.setHighScore(scores.highScore);
  renderLeaderboard();
  if (profileModal.open) renderProfilePanel();
}

async function bootstrap(): Promise<void> {
  await auth.init();
  await scores.refresh();
  refreshHud();
}

auth.onChange(() => {
  void scores.refresh().then(refreshHud);
});

void bootstrap();

if (import.meta.env.DEV) {
  window.__dntPreviewCelebration = (kind) => {
    void sound.unlock();
    if (game.state === STATE_START) game.touchStartFromTitle();
    game.previewCelebration(kind);
    schedulePaint();
  };
}

function openAuth(): void {
  authError.hidden = true;
  authError.textContent = '';
  authName.value = auth.displayName === 'PLAYER' ? '' : auth.displayName;
  authModal.showModal();
}

function closeAuth(): void {
  if (authModal.open) authModal.close();
}

btnAuthOpen.addEventListener('click', openAuth);
btnAuthOpenSide?.addEventListener('click', openAuth);
document.querySelector('#btn-auth-close')?.addEventListener('click', closeAuth);

function openProfile(): void {
  if (!auth.isSignedIn()) {
    openAuth();
    return;
  }
  profileNameMsg.hidden = true;
  profileNameMsg.textContent = '';
  renderProfilePanel();
  profileModal.showModal();
}

function closeProfile(): void {
  if (profileModal.open) profileModal.close();
}

btnProfileOpen.addEventListener('click', openProfile);
playerStat?.addEventListener('click', () => {
  if (auth.isSignedIn()) openProfile();
});
document.querySelector('#btn-profile-close')?.addEventListener('click', closeProfile);

document.querySelector('#btn-profile-save-name')?.addEventListener('click', async () => {
  profileNameMsg.hidden = true;
  const err = await auth.updateDisplayName(profileName.value);
  if (err) {
    profileNameMsg.hidden = false;
    profileNameMsg.textContent = err;
    return;
  }
  await scores.loadProfileBundle();
  refreshHud();
  profileNameMsg.hidden = false;
  profileNameMsg.classList.add('is-ok');
  profileNameMsg.textContent = 'Name saved';
  setTimeout(() => {
    profileNameMsg.hidden = true;
    profileNameMsg.classList.remove('is-ok');
  }, 1600);
});

boardTabs?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-board]');
  if (!btn?.dataset.board) return;
  const kind = btn.dataset.board as LeaderboardKind;
  for (const tab of boardTabs.querySelectorAll<HTMLButtonElement>('.board-tab')) {
    const on = tab === btn;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  void scores.setLeaderboardKind(kind).then(renderLeaderboard);
});

btnSignOut.addEventListener('click', async () => {
  closeProfile();
  await auth.signOut();
  await scores.refresh();
  refreshHud();
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  const mode = submitter?.value ?? 'signin';
  authError.hidden = true;

  const email = authEmail.value;
  const password = authPassword.value;
  const name = authName.value;

  let error: string | null = null;
  if (mode === 'signup') {
    error = await auth.signUp(email, password, name);
  } else {
    error = await auth.signIn(email, password);
    if (!error && name.trim()) {
      await auth.updateDisplayName(name);
    }
  }

  if (error) {
    authError.hidden = false;
    authError.textContent = error;
    return;
  }

  await scores.refresh();
  refreshHud();
  closeAuth();
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  void sound.unlock();
  input.handleKeyDown(e.code, e);
});

window.addEventListener('keyup', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  input.handleKeyUp(e.code);
});

document.querySelector('#btn-play')?.addEventListener('click', () => {
  void sound.unlock();
  input.trigger('start');
});
document.querySelector('#btn-level-up')?.addEventListener('click', () => {
  void sound.unlock();
  input.trigger('levelUp');
});
document.querySelector('#btn-level-down')?.addEventListener('click', () => {
  void sound.unlock();
  input.trigger('levelDown');
});
document.querySelector('#btn-pause')?.addEventListener('click', () => input.trigger('pause'));
document.querySelector('#btn-restart')?.addEventListener('click', () => input.trigger('restart'));
document.querySelector('#btn-mute')?.addEventListener('click', () => input.trigger('mute'));

const sideStack = document.querySelector<HTMLElement>('#side-stack');
const scoresToggle = document.querySelector<HTMLButtonElement>('#btn-scores-toggle');
scoresToggle?.addEventListener('click', () => {
  if (!sideStack) return;
  const open = sideStack.classList.toggle('is-open');
  scoresToggle.textContent = open ? 'CLOSE' : 'SCORES';
});
document.addEventListener('click', (e) => {
  if (!sideStack?.classList.contains('is-open')) return;
  const target = e.target as Node;
  if (sideStack.contains(target) || scoresToggle?.contains(target)) return;
  sideStack.classList.remove('is-open');
  if (scoresToggle) scoresToggle.textContent = 'SCORES';
});

let frameAccumulator = 0;
let lastTime = performance.now();

function frame(now: number): void {
  // Cap dt so a background tab / long GC pause doesn't dump a huge catch-up debt.
  const dt = Math.min(now - lastTime, (1000 / FPS) * MAX_CATCH_UP_FRAMES);
  lastTime = now;
  frameAccumulator += dt;
  const frameMs = 1000 / FPS;

  // Drop excess debt instead of spiraling: mid-game paint cost used to stack
  // multiple paints per RAF, which delayed pointer events and mushied DAS.
  if (frameAccumulator > frameMs * MAX_CATCH_UP_FRAMES) {
    frameAccumulator = frameMs * MAX_CATCH_UP_FRAMES;
  }

  let simulated = false;
  while (frameAccumulator >= frameMs) {
    frameAccumulator -= frameMs;
    simulated = true;

    const actions = input.update(now);
    if (actions.mute) sound.toggleMute();

    const wasGameOver = game.state === STATE_GAME_OVER;
    game.handleInput(actions);
    lineClearProgress = game.update();

    if (game.state === STATE_GAME_OVER && !wasGameOver && !lastGameOverHandled) {
      lastGameOverHandled = true;
      void scores.submit(game.getRunSummary()).then(() => {
        game.setHighScore(scores.highScore);
        refreshHud();
      });
    }

    if (game.state === STATE_START) {
      lastGameOverHandled = false;
    }
  }

  // One paint per animation frame — keeps the main thread free for input.
  if (simulated || paintQueued) {
    paintQueued = false;
    paint();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
