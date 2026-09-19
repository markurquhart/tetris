import './style.css';
import { AuthService } from './auth';
import { FPS, STATE_GAME_OVER, STATE_PAUSED, STATE_START, WINDOW_HEIGHT, WINDOW_WIDTH } from './constants';
import { Game } from './game';
import { bindPlayfieldGestures } from './gestures';
import { InputHandler } from './input';
import { Renderer } from './renderer';
import { ScoreService } from './scores';
import { SoundManager } from './sound';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
canvas.width = WINDOW_WIDTH;
canvas.height = WINDOW_HEIGHT;

const sound = new SoundManager();
const input = new InputHandler();
const renderer = new Renderer(ctx);
const auth = new AuthService();
const scores = new ScoreService(auth);
const game = new Game(sound);

const crt = document.querySelector<HTMLElement>('.crt')!;
bindPlayfieldGestures(crt, input, () => {
  void sound.unlock();
});

const playerLabel = document.querySelector<HTMLElement>('#player-label')!;
const bestLabel = document.querySelector<HTMLElement>('#best-label')!;
const statusLine = document.querySelector<HTMLElement>('#status-line')!;
const authBlurb = document.querySelector<HTMLElement>('#auth-blurb')!;
const leaderboardEl = document.querySelector<HTMLOListElement>('#leaderboard')!;
const authModal = document.querySelector<HTMLDialogElement>('#auth-modal')!;
const authForm = document.querySelector<HTMLFormElement>('#auth-form')!;
const authError = document.querySelector<HTMLElement>('#auth-error')!;
const authName = document.querySelector<HTMLInputElement>('#auth-name')!;
const authEmail = document.querySelector<HTMLInputElement>('#auth-email')!;
const authPassword = document.querySelector<HTMLInputElement>('#auth-password')!;
const btnSignOut = document.querySelector<HTMLButtonElement>('#btn-signout')!;
const btnAuthOpen = document.querySelector<HTMLButtonElement>('#btn-auth-open')!;
const btnAuthOpenSide = document.querySelector<HTMLButtonElement>('#btn-auth-open-side')!;

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
        <span class="name">${entry.displayName}</span>
        <span class="pts">${entry.highScore}</span>
      </li>`,
    )
    .join('');
}

function refreshHud(): void {
  playerLabel.textContent = auth.displayName.toUpperCase();
  bestLabel.textContent = String(scores.highScore);
  statusLine.textContent = auth.isSignedIn()
    ? `${auth.message} · ${scores.statusMessage}`
    : scores.statusMessage;
  authBlurb.textContent = auth.isSignedIn()
    ? `Signed in as ${auth.displayName}. Scores sync to Mac and iPhone.`
    : 'Create an account to keep one high score on Mac and iPhone.';
  btnSignOut.hidden = !auth.isSignedIn();
  btnAuthOpen.hidden = auth.isSignedIn();
  if (btnAuthOpenSide) btnAuthOpenSide.hidden = auth.isSignedIn();
  game.setHighScore(scores.highScore);
  renderLeaderboard();
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

btnSignOut.addEventListener('click', async () => {
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

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  void sound.unlock();
  input.handleKeyDown(e.code);
});

window.addEventListener('keyup', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
document.querySelector('#btn-hold')?.addEventListener('click', () => input.trigger('hold'));
document.querySelector('#btn-rotate-cw')?.addEventListener('click', () => input.trigger('rotateCw'));
document.querySelector('#btn-rotate-ccw')?.addEventListener('click', () => input.trigger('rotateCcw'));
document.querySelector('#btn-hard-drop')?.addEventListener('click', () => input.trigger('hardDrop'));

function bindHold(id: string, direction: 'left' | 'right' | 'down'): void {
  const el = document.querySelector<HTMLElement>(id);
  if (!el) return;
  const start = (e: Event) => {
    e.preventDefault();
    void sound.unlock();
    el.classList.add('is-pressed');
    input.setHeld(direction, true);
  };
  const end = (e: Event) => {
    e.preventDefault();
    el.classList.remove('is-pressed');
    input.setHeld(direction, false);
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
}

bindHold('#btn-left', 'left');
bindHold('#btn-right', 'right');
bindHold('#btn-soft-drop', 'down');

let lastGameOverHandled = false;
let frameAccumulator = 0;
let lastTime = performance.now();

function frame(now: number): void {
  const dt = now - lastTime;
  lastTime = now;
  frameAccumulator += dt;
  const frameMs = 1000 / FPS;

  while (frameAccumulator >= frameMs) {
    frameAccumulator -= frameMs;

    const actions = input.update();
    if (actions.mute) sound.toggleMute();

    const wasGameOver = game.state === STATE_GAME_OVER;
    game.handleInput(actions);
    const lineClearProgress = game.update();

    if (game.state === STATE_GAME_OVER && !wasGameOver && !lastGameOverHandled) {
      lastGameOverHandled = true;
      void scores.submit(game.score).then(() => {
        game.setHighScore(scores.highScore);
        refreshHud();
      });
    }

    if (game.state === STATE_START) {
      lastGameOverHandled = false;
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
      renderer.drawNextPanel(game.nextPieces);
      renderer.drawHoldPanel(game.holdPieceType, game.holdAvailable);
      renderer.drawScorePanel(game.score, game.highScore, game.level, game.linesCleared);
      if (game.state === STATE_PAUSED) renderer.drawPauseOverlay();
      if (game.state === STATE_GAME_OVER) {
        renderer.drawGameOverOverlay(game.score, game.highScore, game.isNewHighScore);
      }
    }
    renderer.drawSoundIndicator(sound.isEnabled());
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
