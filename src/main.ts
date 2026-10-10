import './style.css';
import { AuthService } from './auth';
import { avatarHue, initialsOf } from './charts';
import {
  FPS,
  MAX_CATCH_UP_FRAMES,
  PIECE_COLORS,
  STATE_GAME_OVER,
  STATE_PAUSED,
  STATE_PLAYING,
  STATE_START,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
} from './constants';
import { Game } from './game';
import { bindPlayfieldGestures, preventMobilePageZoom } from './gestures';
import { InputHandler } from './input';
import { drawPiecePreview, Renderer } from './renderer';
import { Router } from './router';
import { formatPlayTime, ScoreService, type LeaderboardKind } from './scores';
import { SoundManager } from './sound';
import {
  renderMissingPlayer,
  renderProfile,
  renderSignedOut,
} from './views/profile';

preventMobilePageZoom();

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

// ── Services ──────────────────────────────────────────────────────────────

const canvas = $<HTMLCanvasElement>('#game');
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
const router = new Router();

// ── Elements ──────────────────────────────────────────────────────────────

const outletEl = $('#outlet');
const bannerEl = $('#app-banner');

const views: Record<string, HTMLElement> = {
  play: $('#view-play'),
  leaderboards: $('#view-leaderboards'),
  profile: $('#view-profile'),
  player: $('#view-player'),
  settings: $('#view-settings'),
};

const playfield = $('#playfield');
const overlayStart = $('#overlay-start');
const overlayPaused = $('#overlay-paused');
const overlayGameOver = $('#overlay-gameover');
const playAlert = $('#play-alert');
const startGreeting = $('#start-greeting');
const startLevelEl = $('#start-level');
const finalStats = $('#final-stats');
const gameOverNote = $('#gameover-note');

const hudScore = $('#hud-score');
const hudLevel = $('#hud-level');
const hudLines = $('#hud-lines');
const hudBest = $('#hud-best');

const nextCanvases = [
  $<HTMLCanvasElement>('#next-0'),
  $<HTMLCanvasElement>('#next-1'),
  $<HTMLCanvasElement>('#next-2'),
];
const holdCanvas = $<HTMLCanvasElement>('#hold-piece');

const btnAuthOpen = $<HTMLButtonElement>('#btn-auth-open');
const btnAccount = $<HTMLButtonElement>('#btn-account');
const accountMenu = $('#account-menu');
const accountAvatar = $('#account-avatar');
const accountName = $('#account-name');

const authModal = $<HTMLDialogElement>('#auth-modal');
const authForm = $<HTMLFormElement>('#auth-form');
const authError = $('#auth-error');
const authNotice = $('#auth-notice');
const authName = $<HTMLInputElement>('#auth-name');
const authEmail = $<HTMLInputElement>('#auth-email');
const authPassword = $<HTMLInputElement>('#auth-password');
const btnForgot = $<HTMLButtonElement>('#btn-forgot');

const passwordModal = $<HTMLDialogElement>('#password-modal');
const passwordForm = $<HTMLFormElement>('#password-form');
const passwordNew = $<HTMLInputElement>('#password-new');
const passwordConfirm = $<HTMLInputElement>('#password-confirm');
const passwordError = $('#password-error');
const passwordHint = $('#password-hint');
const btnPasswordCancel = $<HTMLButtonElement>('#btn-password-close');

const boardTabs = $('#board-tabs');
const boardSummary = $('#board-summary');
const leaderboardEl = $<HTMLOListElement>('#leaderboard');
const youCard = $('#you-card');
const youRankValue = $('#you-rank-value');
const youRankDelta = $('#you-rank-delta');
const youMeta = $('#you-meta');

const profileBody = $('#profile-body');
const playerBody = $('#player-body');
const profileName = $<HTMLInputElement>('#profile-name');
const profileNameMsg = $('#profile-name-msg');
const settingsAccount = $('#settings-account');
const settingsSignedOut = $('#settings-signed-out');
const btnSoundToggle = $<HTMLButtonElement>('#btn-sound-toggle');
const btnMute = $<HTMLButtonElement>('#btn-mute');

// ── Routing ───────────────────────────────────────────────────────────────

router
  .add('play', '/play')
  .add('leaderboards', '/leaderboards')
  .add('leaderboardsBoard', '/leaderboards/:board')
  .add('profile', '/profile')
  .add('player', '/u/:id')
  .add('settings', '/settings')
  .add('root', '/')
  .setFallback('/play');

const VALID_BOARDS: LeaderboardKind[] = ['score', 'lines', 'time', 'awards', 'bestLines'];

function showView(name: keyof typeof views): void {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  outletEl.scrollTop = 0;
  window.scrollTo(0, 0);
}

function markNav(active: string): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-nav]')) {
    link.classList.toggle('is-active', link.dataset.nav === active);
    if (link.dataset.nav === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

router.onChange((match) => {
  closeAccountMenu();

  if (match.name === 'root') {
    router.navigate('/play', { replace: true });
    return;
  }

  // Leaving the game mid-run shouldn't keep gravity ticking out of sight.
  if (match.name !== 'play' && game.state === STATE_PLAYING) {
    game.state = STATE_PAUSED;
    syncOverlays();
  }

  switch (match.name) {
    case 'play':
      showView('play');
      markNav('play');
      document.title = 'Play · Def Not Tetris';
      break;

    case 'leaderboards':
      router.navigate(`/leaderboards/${scores.leaderboardKind}`, { replace: true });
      return;

    case 'leaderboardsBoard': {
      const board = match.params.board as LeaderboardKind;
      if (!VALID_BOARDS.includes(board)) {
        router.navigate('/leaderboards/score', { replace: true });
        return;
      }
      showView('leaderboards');
      markNav('leaderboards');
      document.title = 'Leaderboards · Def Not Tetris';
      void openBoard(board);
      break;
    }

    case 'profile':
      showView('profile');
      markNav('profile');
      document.title = 'Profile · Def Not Tetris';
      void openOwnProfile();
      break;

    case 'player':
      showView('player');
      markNav('');
      document.title = 'Player · Def Not Tetris';
      void openPlayerProfile(match.params.id);
      break;

    case 'settings':
      showView('settings');
      markNav('settings');
      document.title = 'Settings · Def Not Tetris';
      syncSettings();
      break;
  }
});

// ── Leaderboards ──────────────────────────────────────────────────────────

const BOARD_COPY: Record<LeaderboardKind, string> = {
  score: 'Highest single-game score.',
  lines: 'Total lines cleared across every game.',
  time: 'Total time spent playing.',
  awards: 'Awards earned.',
  bestLines: 'Most lines cleared in one game.',
};

async function openBoard(kind: LeaderboardKind): Promise<void> {
  for (const tab of boardTabs.querySelectorAll<HTMLAnchorElement>('[data-board]')) {
    const on = tab.dataset.board === kind;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  }

  boardSummary.textContent = BOARD_COPY[kind];
  if (scores.leaderboardKind !== kind || !scores.leaderboard.length) {
    await scores.setLeaderboardKind(kind);
  }
  renderLeaderboard();
}

function renderLeaderboard(): void {
  leaderboardEl.replaceChildren();

  if (!scores.leaderboard.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = scores.lastError
      ? `Board unavailable — ${scores.lastError}`
      : 'No ranked players yet. Finish a game to claim the top spot.';
    leaderboardEl.append(li);
    youCard.hidden = true;
    return;
  }

  scores.leaderboard.forEach((entry, i) => {
    const li = document.createElement('li');
    li.classList.toggle('is-self', entry.isSelf);

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(i + 1).padStart(2, '0');

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.style.setProperty('--avatar-hue', String(avatarHue(entry.userId || entry.displayName)));
    avatar.textContent = initialsOf(entry.displayName);

    const name = document.createElement(entry.userId ? 'a' : 'span');
    name.className = 'name';
    name.textContent = entry.displayName;
    if (entry.userId && name instanceof HTMLAnchorElement) {
      name.href = entry.isSelf ? '/profile' : `/u/${entry.userId}`;
    }
    if (entry.isSelf) {
      const tag = document.createElement('span');
      tag.className = 'you-tag';
      tag.textContent = 'You';
      name.append(tag);
    }

    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = entry.displayValue;

    li.append(rank, avatar, name, pts);
    leaderboardEl.append(li);
  });

  const rank = scores.myRank();
  if (rank === null) {
    youCard.hidden = true;
    return;
  }

  youCard.hidden = false;
  youRankValue.textContent = `#${rank}`;
  youMeta.textContent = `of ${scores.leaderboardTotal} ranked ${
    scores.leaderboardTotal === 1 ? 'player' : 'players'
  }`;

  const delta = scores.consumeRankDelta();
  youRankDelta.hidden = delta === null;
  if (delta !== null) {
    const up = delta > 0;
    youRankDelta.className = `delta ${up ? 'is-up' : 'is-down'}`;
    youRankDelta.textContent = `${up ? '▲' : '▼'}${Math.abs(delta)} since your last visit`;
  }
}

// ── Profile ───────────────────────────────────────────────────────────────

function rankLine(): string | null {
  const rank = scores.myRank();
  if (rank === null) return null;
  return `#${rank} of ${scores.leaderboardTotal} by ${scores.leaderboardKind === 'score' ? 'score' : scores.leaderboardKind}`;
}

async function openOwnProfile(): Promise<void> {
  if (!auth.isSignedIn()) {
    renderSignedOut(profileBody, openAuth);
    return;
  }

  if (!scores.career) await scores.loadProfileBundle();
  const career = scores.career;
  if (!career) {
    renderSignedOut(profileBody, openAuth);
    return;
  }

  renderProfile(profileBody, {
    career,
    awards: scores.awards,
    history: scores.history,
    isSelf: true,
    rankLine: rankLine(),
  });
}

async function openPlayerProfile(userId: string): Promise<void> {
  playerBody.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Loading player…';
  playerBody.append(loading);

  if (auth.user?.id === userId) {
    router.navigate('/profile', { replace: true });
    return;
  }

  const data = await scores.loadPublicProfile(userId);
  if (!data) {
    renderMissingPlayer(playerBody);
    return;
  }

  document.title = `${data.career.displayName} · Def Not Tetris`;
  renderProfile(playerBody, {
    career: data.career,
    awards: data.awards,
    history: [],
    isSelf: false,
  });
}

// ── Settings ──────────────────────────────────────────────────────────────

function syncSettings(): void {
  const signedIn = auth.isSignedIn();
  settingsAccount.hidden = !signedIn;
  settingsSignedOut.hidden = signedIn;
  profileName.value = auth.displayName === 'PLAYER' ? '' : auth.displayName;
  syncSoundButtons();
}

function syncSoundButtons(): void {
  const on = sound.isEnabled();
  btnSoundToggle.textContent = on ? 'On' : 'Off';
  btnSoundToggle.setAttribute('aria-pressed', String(on));
  btnMute.textContent = on ? 'Sound on' : 'Sound off';
  btnMute.setAttribute('aria-pressed', String(on));
}

// ── Account chrome ────────────────────────────────────────────────────────

function refreshAccount(): void {
  const signedIn = auth.isSignedIn();
  btnAuthOpen.hidden = signedIn;
  btnAccount.hidden = !signedIn;

  if (signedIn) {
    accountName.textContent = auth.displayName;
    accountAvatar.textContent = initialsOf(auth.displayName);
    accountAvatar.style.setProperty(
      '--avatar-hue',
      String(avatarHue(auth.user?.id ?? auth.displayName)),
    );
  }

  hudBest.textContent = scores.highScore.toLocaleString();
  game.setHighScore(scores.highScore);

  bannerEl.hidden = !scores.lastError;
  if (scores.lastError) bannerEl.textContent = `Database error — ${scores.lastError}`;

  startGreeting.textContent = signedIn
    ? `Signed in as ${auth.displayName}. Every finished game is saved.`
    : 'Playing as a guest — sign in to save your career.';
}

function closeAccountMenu(): void {
  accountMenu.hidden = true;
  btnAccount.setAttribute('aria-expanded', 'false');
}

btnAccount.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = accountMenu.hidden;
  accountMenu.hidden = !open;
  btnAccount.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (e) => {
  if (accountMenu.hidden) return;
  if (accountMenu.contains(e.target as Node)) return;
  closeAccountMenu();
});

// ── Game HUD (DOM, not canvas) ────────────────────────────────────────────

let lastHudKey = '';
let lastPreviewKey = '';

function syncHud(): void {
  const key = `${game.score}|${game.level}|${game.linesCleared}`;
  if (key !== lastHudKey) {
    lastHudKey = key;
    hudScore.textContent = game.score.toLocaleString();
    hudLevel.textContent = String(game.level);
    hudLines.textContent = String(game.linesCleared);
  }

  const previewKey = `${game.nextPieces.join(',')}|${game.holdPieceType}|${game.holdAvailable}`;
  if (previewKey !== lastPreviewKey) {
    lastPreviewKey = previewKey;
    nextCanvases.forEach((c, i) => {
      const type = game.nextPieces[i];
      drawPiecePreview(c, type ?? null, type !== undefined ? PIECE_COLORS[type] : null);
    });
    drawPiecePreview(
      holdCanvas,
      game.holdPieceType,
      game.holdPieceType !== null ? PIECE_COLORS[game.holdPieceType] : null,
      !game.holdAvailable,
    );
  }
}

let lastState = '';

function syncOverlays(): void {
  if (game.state === lastState) return;
  lastState = game.state;

  document.body.classList.toggle('is-playing', game.state === STATE_PLAYING);
  overlayStart.hidden = game.state !== STATE_START;
  overlayPaused.hidden = game.state !== STATE_PAUSED;
  overlayGameOver.hidden = game.state !== STATE_GAME_OVER;

  if (game.state === STATE_START) startLevelEl.textContent = String(game.selectedLevel);

  if (game.state === STATE_GAME_OVER) {
    finalStats.replaceChildren();
    const items: Array<[string, string]> = [
      ['Score', game.score.toLocaleString()],
      ['Lines', String(game.linesCleared)],
      ['Level', String(game.level)],
    ];
    for (const [label, value] of items) {
      const cell = document.createElement('div');
      cell.className = 'final-stat';
      const strong = document.createElement('strong');
      strong.textContent = value;
      const span = document.createElement('span');
      span.textContent = label;
      cell.append(strong, span);
      finalStats.append(cell);
    }
    gameOverNote.hidden = !game.isNewHighScore;
    if (game.isNewHighScore) gameOverNote.textContent = 'New personal best!';
  }
}

let lastCelebrationKind: string | null = null;

function syncCelebration(): void {
  const cele = game.celebration;
  if (!cele) {
    if (lastCelebrationKind !== null) {
      lastCelebrationKind = null;
      playAlert.hidden = true;
      playAlert.className = 'toast';
    }
    return;
  }
  if (lastCelebrationKind === cele.kind) return;

  lastCelebrationKind = cele.kind;
  playAlert.hidden = false;
  playAlert.textContent =
    cele.kind === 'tetris_perfect'
      ? 'Perfect Tetris'
      : cele.kind === 'perfect'
        ? 'All clear'
        : 'Tetris';
  playAlert.className = `toast is-on kind-${cele.kind}`;
}

let lineClearProgress: number | null = null;
let paintQueued = false;

function paint(): void {
  renderer.drawBoardBackground();
  renderer.drawBoard(game.board, lineClearProgress ?? 0);
  if (game.state === STATE_PLAYING && game.currentPiece) {
    const ghostRow = game.getGhostRow();
    if (ghostRow !== null && ghostRow > game.currentPiece.row) {
      renderer.drawGhost(game.currentPiece, ghostRow);
    }
  }
  renderer.drawPiece(game.currentPiece);

  syncHud();
  syncOverlays();
  syncCelebration();
}

/** Touch paint: microtask coalesce beats waiting on rAF when the sim hitches. */
function schedulePaint(): void {
  if (paintQueued) return;
  paintQueued = true;
  queueMicrotask(() => {
    paintQueued = false;
    paint();
  });
}

// ── Gestures & controls ───────────────────────────────────────────────────

bindPlayfieldGestures(
  playfield,
  input,
  {
    unlock: () => void sound.unlock(),
    paint: schedulePaint,
    getCol: () => game.getTouchCol(),
    getRow: () => game.getTouchRow(),
    getPieceEpoch: () => game.pieceEpoch,
    seekCol: (col) => game.touchSeekCol(col),
    seekRow: (row) => game.touchSeekRow(row),
    rotate: () => game.touchRotate(),
    hardDrop: () => game.touchHardDrop(),
    hold: () => game.touchHold(),
    start: () => game.touchStartFromTitle(),
  },
  () => game.state === STATE_START,
);

$('#btn-play').addEventListener('click', () => {
  void sound.unlock();
  input.trigger('start');
});
$('#btn-again').addEventListener('click', () => {
  void sound.unlock();
  game.state = STATE_START;
  syncOverlays();
});
$('#btn-resume').addEventListener('click', () => input.trigger('pause'));
$('#btn-level-up').addEventListener('click', () => input.trigger('levelUp'));
$('#btn-level-down').addEventListener('click', () => input.trigger('levelDown'));
$('#btn-pause').addEventListener('click', () => input.trigger('pause'));
$('#btn-restart').addEventListener('click', () => input.trigger('restart'));
btnMute.addEventListener('click', () => input.trigger('mute'));
btnSoundToggle.addEventListener('click', () => {
  sound.toggleMute();
  syncSoundButtons();
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // Only the play screen owns the arrow keys.
  if (router.getCurrent()?.name !== 'play') return;

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

// ── Auth ──────────────────────────────────────────────────────────────────

function openAuth(): void {
  authError.hidden = true;
  authNotice.hidden = true;
  authName.value = auth.displayName === 'PLAYER' ? '' : auth.displayName;
  if (!authModal.open) authModal.showModal();
}

function closeAuth(): void {
  if (authModal.open) authModal.close();
}

btnAuthOpen.addEventListener('click', openAuth);
$('#btn-auth-close').addEventListener('click', closeAuth);

/**
 * Recovery is a one-way door: the only exits are "set a password" or "sign
 * out". A voluntary change from Settings is an ordinary cancellable dialog.
 */
let passwordFlow: 'recovery' | 'voluntary' = 'voluntary';

function openPasswordReset(flow: 'recovery' | 'voluntary'): void {
  passwordFlow = flow;
  passwordError.hidden = true;
  passwordNew.value = '';
  passwordConfirm.value = '';

  const recovery = flow === 'recovery';
  passwordHint.textContent = recovery
    ? 'Set a new password to finish resetting your account. You will sign in again afterwards.'
    : 'Choose a new password for your account.';
  btnPasswordCancel.textContent = recovery ? 'Cancel & sign out' : 'Cancel';

  closeAuth();
  if (!passwordModal.open) passwordModal.showModal();
}

// A recovery link necessarily establishes a session — that is what authorises
// updateUser(). It must not be usable as a back door into the app.
passwordModal.addEventListener('cancel', (e) => {
  if (passwordFlow === 'recovery') e.preventDefault();
});

async function abandonRecovery(): Promise<void> {
  passwordFlow = 'voluntary';
  if (passwordModal.open) passwordModal.close();
  await auth.signOut();
  await scores.refresh();
  refreshAccount();
}

auth.onPasswordRecovery(() => openPasswordReset('recovery'));

btnForgot.addEventListener('click', async () => {
  authError.hidden = true;
  authNotice.hidden = true;
  btnForgot.disabled = true;
  const err = await auth.sendPasswordReset(authEmail.value);
  btnForgot.disabled = false;

  if (err) {
    authError.hidden = false;
    authError.textContent = err;
    return;
  }
  authNotice.hidden = false;
  authNotice.textContent = `If an account exists for ${authEmail.value.trim()}, a reset link is on its way.`;
});

$('#btn-change-password').addEventListener('click', () => openPasswordReset('voluntary'));

btnPasswordCancel.addEventListener('click', () => {
  if (passwordFlow === 'recovery') {
    void abandonRecovery();
    return;
  }
  if (passwordModal.open) passwordModal.close();
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordError.hidden = true;

  if (passwordNew.value !== passwordConfirm.value) {
    passwordError.hidden = false;
    passwordError.textContent = 'Passwords do not match';
    return;
  }

  const err = await auth.updatePassword(passwordNew.value);
  if (err) {
    passwordError.hidden = false;
    passwordError.textContent = err;
    return;
  }

  const wasRecovery = passwordFlow === 'recovery';
  passwordFlow = 'voluntary';
  passwordNew.value = '';
  passwordConfirm.value = '';
  passwordModal.close();

  await scores.refresh();
  refreshAccount();

  if (wasRecovery) {
    // Don't let the emailed link double as a login.
    await auth.signOut();
    await scores.refresh();
    refreshAccount();
    openAuth();
    authNotice.hidden = false;
    authNotice.textContent = 'Password updated — sign in with your new password.';
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  const mode = submitter?.value ?? 'signin';
  authError.hidden = true;

  const error =
    mode === 'signup'
      ? await auth.signUp(authEmail.value, authPassword.value, authName.value)
      : await auth.signIn(authEmail.value, authPassword.value);

  if (error) {
    authError.hidden = false;
    authError.textContent = error;
    return;
  }

  if (mode === 'signin' && authName.value.trim()) {
    await auth.updateDisplayName(authName.value);
  }

  await scores.refresh();
  refreshAccount();
  closeAuth();
  rerenderCurrent();
});

async function doSignOut(): Promise<void> {
  closeAccountMenu();
  await auth.signOut();
  await scores.refresh();
  refreshAccount();
  rerenderCurrent();
}

$('#btn-signout').addEventListener('click', () => void doSignOut());
$('#btn-signout-settings').addEventListener('click', () => void doSignOut());

$('#btn-profile-save-name').addEventListener('click', async () => {
  profileNameMsg.hidden = true;
  const err = await auth.updateDisplayName(profileName.value);
  if (err) {
    profileNameMsg.hidden = false;
    profileNameMsg.className = 'field-msg is-error';
    profileNameMsg.textContent = err;
    return;
  }
  await scores.loadProfileBundle();
  refreshAccount();
  profileNameMsg.hidden = false;
  profileNameMsg.className = 'field-msg is-ok';
  profileNameMsg.textContent = 'Name saved';
});

/** Re-render whichever data-backed view is on screen after an auth change. */
function rerenderCurrent(): void {
  const name = router.getCurrent()?.name;
  if (name === 'profile') void openOwnProfile();
  else if (name === 'leaderboardsBoard') renderLeaderboard();
  else if (name === 'settings') syncSettings();
}

// ── Boot ──────────────────────────────────────────────────────────────────

auth.onChange(() => {
  void scores.refresh().then(() => {
    refreshAccount();
    rerenderCurrent();
  });
});

async function bootstrap(): Promise<void> {
  // Route and paint first. Network comes second: if Supabase is slow, blocked
  // or unreachable, the game must still be playable rather than a blank page.
  syncSoundButtons();
  refreshAccount();
  router.start();

  await auth.init();
  await scores.refresh();
  refreshAccount();
  rerenderCurrent();
}

void bootstrap();

// ── Loop ──────────────────────────────────────────────────────────────────

let lastGameOverHandled = false;
let frameAccumulator = 0;
let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min(now - lastTime, (1000 / FPS) * MAX_CATCH_UP_FRAMES);
  lastTime = now;
  frameAccumulator += dt;
  const frameMs = 1000 / FPS;

  if (frameAccumulator > frameMs * MAX_CATCH_UP_FRAMES) {
    frameAccumulator = frameMs * MAX_CATCH_UP_FRAMES;
  }

  const onPlay = router.getCurrent()?.name === 'play';
  let simulated = false;

  while (frameAccumulator >= frameMs) {
    frameAccumulator -= frameMs;
    if (!onPlay) continue; // Other routes don't advance the game.
    simulated = true;

    const actions = input.update(now);
    if (actions.mute) {
      sound.toggleMute();
      syncSoundButtons();
    }

    const wasGameOver = game.state === STATE_GAME_OVER;
    game.handleInput(actions);
    lineClearProgress = game.update();

    if (game.state === STATE_START) {
      startLevelEl.textContent = String(game.selectedLevel);
      lastGameOverHandled = false;
    }

    if (game.state === STATE_GAME_OVER && !wasGameOver && !lastGameOverHandled) {
      lastGameOverHandled = true;
      void scores.submit(game.getRunSummary()).then(() => {
        refreshAccount();
        if (auth.isSignedIn()) void scores.loadProfileBundle();
      });
    }
  }

  if (onPlay && (simulated || paintQueued)) {
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

if (import.meta.env.DEV) {
  (window as unknown as { __dnt: unknown }).__dnt = { game, renderer, paint, input, sound, scores, router, auth, renderProfile, profileBody, renderLeaderboard };
}

export { formatPlayTime };
