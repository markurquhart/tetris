import { avatarHue, barChart, initialsOf, lineChart, type ChartPoint } from '../charts';
import {
  formatEndedAt,
  formatPlayTime,
  type AwardInfo,
  type CareerProfile,
  type GameHistoryEntry,
} from '../scores';

export interface ProfileViewModel {
  career: CareerProfile;
  awards: AwardInfo[];
  /** Newest first. Empty for other players — game_runs is owner-only. */
  history: GameHistoryEntry[];
  isSelf: boolean;
  /** e.g. "#3 of 14 by score" — omitted when unranked. */
  rankLine?: string | null;
}

/** How many recent games the trend charts cover. */
const TREND_WINDOW = 30;

export function renderProfile(container: HTMLElement, vm: ProfileViewModel): void {
  const { career, awards, history, isSelf } = vm;
  container.replaceChildren();

  container.append(header(career, vm.rankLine ?? null, isSelf));
  container.append(kpis(career));

  if (history.length >= 2) {
    container.append(performanceSection(history));
  }

  container.append(awardsSection(awards, isSelf));

  if (isSelf) {
    container.append(historySection(history, career.bestScore));
  } else {
    container.append(
      note('Individual game timestamps are visible only to the player themselves.'),
    );
  }
}

/** Shown on /profile when nobody is signed in. */
export function renderSignedOut(container: HTMLElement, onSignIn: () => void): void {
  container.replaceChildren();

  const head = document.createElement('header');
  head.className = 'page-head';
  head.innerHTML = '<h1>Profile</h1><p class="page-sub">Track your career across devices.</p>';

  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = `
    <p>Sign in to keep your career stats, awards and every finished game —
    synced across your Mac and iPhone.</p>`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = 'Sign in or create an account';
  btn.addEventListener('click', onSignIn);
  empty.append(btn);

  container.append(head, empty);
}

export function renderMissingPlayer(container: HTMLElement): void {
  container.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = 'That player could not be found.';
  container.append(empty);
}

function header(career: CareerProfile, rankLine: string | null, isSelf: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'profile-head';

  const avatar = document.createElement('span');
  avatar.className = 'avatar avatar-lg';
  avatar.style.setProperty('--avatar-hue', String(avatarHue(career.userId || career.displayName)));
  avatar.textContent = initialsOf(career.displayName);

  const id = document.createElement('div');
  id.className = 'profile-id';

  const h1 = document.createElement('h1');
  h1.textContent = career.displayName;

  const meta: string[] = [];
  if (career.joinedAt) meta.push(`Joined ${formatJoined(career.joinedAt)}`);
  meta.push(`${career.totalGames} ${career.totalGames === 1 ? 'game' : 'games'}`);
  if (rankLine) meta.push(rankLine);

  const p = document.createElement('p');
  p.textContent = meta.join(' · ');

  id.append(h1, p);
  wrap.append(avatar, id);

  if (!isSelf) {
    const badge = document.createElement('span');
    badge.className = 'you-tag';
    badge.textContent = 'Public';
    id.append(badge);
  }

  return wrap;
}

function kpis(career: CareerProfile): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'kpi-grid';

  const items: Array<[string, string]> = [
    ['Best score', career.bestScore.toLocaleString()],
    ['Games', String(career.totalGames)],
    ['Lines cleared', career.totalLinesCleared.toLocaleString()],
    ['Time played', formatPlayTime(career.totalPlayMs)],
    ['Best single game', `${career.bestLinesInGame} lines`],
    ['Awards', String(career.awardsCount)],
  ];

  for (const [label, value] of items) {
    const cell = document.createElement('div');
    cell.className = 'kpi';
    const span = document.createElement('span');
    span.className = 'card-label';
    span.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    cell.append(span, strong);
    grid.append(cell);
  }

  return grid;
}

function performanceSection(history: GameHistoryEntry[]): HTMLElement {
  // History arrives newest-first; charts read left-to-right in time order.
  const recent = history.slice(0, TREND_WINDOW).reverse();

  const section = document.createElement('section');
  section.className = 'section';
  section.append(
    sectionHead('Performance', `Last ${recent.length} games`),
  );

  const grid = document.createElement('div');
  grid.className = 'chart-grid-2';

  const scoreBox = document.createElement('div');
  lineChart(
    scoreBox,
    recent.map<ChartPoint>((r, i) => ({
      label: `#${i + 1}`,
      value: r.score,
      detail: r.endedAt ? formatEndedAt(r.endedAt) : `Game ${i + 1}`,
    })),
    { series: 1, title: 'Score per game', format: (n) => n.toLocaleString() },
  );

  const linesBox = document.createElement('div');
  barChart(
    linesBox,
    recent.map<ChartPoint>((r, i) => ({
      label: `#${i + 1}`,
      value: r.linesCleared,
      detail: r.endedAt ? formatEndedAt(r.endedAt) : `Game ${i + 1}`,
    })),
    { series: 3, title: 'Lines per game', format: (n) => `${n} lines` },
  );

  grid.append(labelled('Score per game', scoreBox), labelled('Lines per game', linesBox));
  section.append(grid);

  const levels = levelDistribution(history);
  if (levels.length > 1) {
    const levelBox = document.createElement('div');
    barChart(levelBox, levels, {
      series: 2,
      title: 'Games by level reached',
      format: (n) => `${n} ${n === 1 ? 'game' : 'games'}`,
    });
    const wrap = document.createElement('div');
    wrap.style.marginTop = '12px';
    wrap.append(labelled('Level reached', levelBox));
    section.append(wrap);
  }

  return section;
}

function levelDistribution(history: GameHistoryEntry[]): ChartPoint[] {
  const counts = new Map<number, number>();
  for (const run of history) {
    counts.set(run.levelReached, (counts.get(run.levelReached) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, count]) => ({
      label: `L${level}`,
      value: count,
      detail: `Level ${level}`,
    }));
}

function labelled(title: string, chartBox: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  const label = document.createElement('span');
  label.className = 'card-label';
  label.textContent = title;
  label.style.marginBottom = '6px';
  wrap.append(label, chartBox);
  return wrap;
}

function awardsSection(awards: AwardInfo[], isSelf: boolean): HTMLElement {
  const section = document.createElement('section');
  section.className = 'section';

  const earned = awards.filter((a) => a.earned).length;
  section.append(sectionHead('Awards', `${earned} of ${awards.length} earned`));

  if (!awards.length) {
    section.append(note(isSelf ? 'Awards unlock as you play.' : 'No awards yet.'));
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'awards';

  // Earned first — a showcase, not a checklist.
  const ordered = [...awards].sort((a, b) => Number(b.earned) - Number(a.earned));
  for (const award of ordered) {
    const li = document.createElement('li');
    li.className = award.earned ? 'is-earned' : 'is-locked';
    li.title = award.description;

    const dot = document.createElement('span');
    dot.className = 'award-dot';
    dot.textContent = award.earned ? '★' : '·';

    const text = document.createElement('div');
    text.className = 'award-text';
    const strong = document.createElement('strong');
    strong.textContent = award.title;
    const span = document.createElement('span');
    span.textContent = award.earned ? 'Earned' : award.description;
    text.append(strong, span);

    li.append(dot, text);
    list.append(li);
  }

  section.append(list);
  return section;
}

function historySection(history: GameHistoryEntry[], bestScore: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'section';

  const head = sectionHead('Recent games', 'Timestamps visible to you only');
  section.append(head);

  if (!history.length) {
    section.append(note('No saved games yet — finish a run while signed in.'));
    return section;
  }

  const sorters: Array<[string, (a: GameHistoryEntry, b: GameHistoryEntry) => number]> = [
    ['Newest', (a, b) => (a.endedAt < b.endedAt ? 1 : -1)],
    ['Highest score', (a, b) => b.score - a.score],
    ['Most lines', (a, b) => b.linesCleared - a.linesCleared],
    ['Longest', (a, b) => b.durationMs - a.durationMs],
  ];

  const tabs = document.createElement('div');
  tabs.className = 'tabs';

  const wrap = document.createElement('div');
  wrap.className = 'history-wrap';

  let shown = 10;
  let sortIndex = 0;

  const draw = () => {
    const rows = [...history].sort(sorters[sortIndex][1]).slice(0, shown);
    wrap.replaceChildren(table(rows, bestScore));

    if (shown < history.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn-ghost btn-sm';
      more.style.cssText = 'width:100%;border:0;border-radius:0';
      more.textContent = `Show more (${history.length - shown} left)`;
      more.addEventListener('click', () => {
        shown += 20;
        draw();
      });
      wrap.append(more);
    }
  };

  sorters.forEach(([label], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab${i === 0 ? ' is-active' : ''}`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      sortIndex = i;
      for (const t of tabs.children) t.classList.remove('is-active');
      btn.classList.add('is-active');
      draw();
    });
    tabs.append(btn);
  });

  section.append(tabs, wrap);
  draw();
  return section;
}

function table(rows: GameHistoryEntry[], bestScore: number): HTMLTableElement {
  const t = document.createElement('table');
  t.className = 'history';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th scope="col">Score</th><th scope="col">Lines</th><th scope="col">Level</th><th scope="col">Time</th><th scope="col">When</th></tr>';

  const tbody = document.createElement('tbody');
  for (const run of rows) {
    const tr = document.createElement('tr');

    const score = document.createElement('td');
    score.textContent = run.score.toLocaleString();
    if (bestScore > 0 && run.score === bestScore) {
      const tag = document.createElement('span');
      tag.className = 'pb-tag';
      tag.textContent = 'PB';
      score.append(tag);
    }

    tr.append(
      score,
      cell(String(run.linesCleared)),
      cell(String(run.levelReached)),
      cell(formatPlayTime(run.durationMs)),
      cell(run.endedAt ? formatEndedAt(run.endedAt) : '—'),
    );
    tbody.append(tr);
  }

  t.append(thead, tbody);
  return t;
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function sectionHead(title: string, sub: string): HTMLElement {
  const head = document.createElement('div');
  head.className = 'section-head';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const p = document.createElement('p');
  p.textContent = sub;
  head.append(h2, p);
  return head;
}

function note(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'signed-out-note';
  p.textContent = text;
  return p;
}

function formatJoined(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}
