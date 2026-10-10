import type { AuthService } from './auth';
import type { GameRunSummary } from './game';
import { isSupabaseConfigured, supabase, supabaseHost } from './supabaseClient';

const LOCAL_HIGH_KEY = 'tetris_local_high';
/** Remembers each board's rank between visits so we can show a delta. */
const LOCAL_RANK_KEY = 'tetris_last_ranks';

/** Full board, not a top-8 teaser — the leaderboards page is a real page now. */
const LEADERBOARD_LIMIT = 100;
/** Enough runs to plot a trend; the history table paginates client-side. */
const HISTORY_LIMIT = 200;

export type ScoreStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error';

export type LeaderboardKind = 'score' | 'lines' | 'time' | 'awards' | 'bestLines';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  value: number;
  /** Formatted for display (score digits, duration, etc.) */
  displayValue: string;
  /** True for the signed-in player's own row. */
  isSelf: boolean;
}

export interface CareerProfile {
  userId: string;
  displayName: string;
  joinedAt: string;
  totalLinesCleared: number;
  totalPlayMs: number;
  totalGames: number;
  awardsCount: number;
  bestScore: number;
  bestLinesInGame: number;
  bestLevelReached: number;
  latestScore: number;
  latestLines: number;
  latestLevel: number;
}

export interface GameHistoryEntry {
  id: string;
  score: number;
  linesCleared: number;
  levelReached: number;
  startLevel: number;
  durationMs: number;
  tetrisCount: number;
  perfectClears: number;
  /** ISO timestamp — only present for the signed-in owner. */
  endedAt: string;
}

export interface AwardInfo {
  code: string;
  title: string;
  description: string;
  earned: boolean;
  earnedAt: string | null;
}

/**
 * Every board reads a dedicated view exposing (display_name, value).
 *
 * `score` used to query the `scores` table with a PostgREST embed
 * (`profiles(display_name)`), which silently returns nothing whenever the
 * schema cache can't resolve the scores→profiles foreign key (PGRST200). The
 * `leaderboard` view does that join in Postgres, so there is no relationship
 * for PostgREST to infer.
 */
const LEADERBOARD_VIEWS: Record<
  LeaderboardKind,
  { view: string; format: (n: number) => string }
> = {
  score: { view: 'leaderboard', format: (n) => String(n) },
  lines: { view: 'leaderboard_career_lines', format: (n) => String(n) },
  time: { view: 'leaderboard_play_time', format: formatPlayTime },
  awards: { view: 'leaderboard_awards', format: (n) => String(n) },
  bestLines: { view: 'leaderboard_best_lines', format: (n) => String(n) },
};

export function formatPlayTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatEndedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function emptyCareer(displayName: string, userId = ''): CareerProfile {
  return {
    userId,
    displayName,
    joinedAt: '',
    totalLinesCleared: 0,
    totalPlayMs: 0,
    totalGames: 0,
    awardsCount: 0,
    bestScore: 0,
    bestLinesInGame: 0,
    bestLevelReached: 0,
    latestScore: 0,
    latestLines: 0,
    latestLevel: 0,
  };
}

export class ScoreService {
  highScore = Number(localStorage.getItem(LOCAL_HIGH_KEY) ?? '0') || 0;
  status: ScoreStatus = 'local';
  statusMessage = 'Local high score';
  leaderboardKind: LeaderboardKind = 'score';
  leaderboard: LeaderboardEntry[] = [];
  career: CareerProfile | null = null;
  history: GameHistoryEntry[] = [];
  awards: AwardInfo[] = [];
  lastNewAwards: string[] = [];
  /** Most recent Supabase failure, surfaced in the HUD instead of swallowed. */
  lastError: string | null = null;
  /** Total ranked players on the active board (not just the page shown). */
  leaderboardTotal = 0;
  private auth: AuthService;

  constructor(auth: AuthService) {
    this.auth = auth;
  }

  private persistLocal(score: number): void {
    this.highScore = Math.max(this.highScore, score);
    localStorage.setItem(LOCAL_HIGH_KEY, String(this.highScore));
  }

  async refresh(): Promise<number> {
    this.persistLocal(this.highScore);
    await Promise.all([this.fetchLeaderboard(), this.loadProfileBundle()]);

    if (!supabase || !this.auth.isSignedIn() || !this.auth.user) {
      this.status = 'local';
      this.statusMessage = this.auth.isSignedIn()
        ? 'Signed in'
        : 'Guest mode — sign in to sync';
      return this.highScore;
    }

    this.status = 'syncing';
    this.statusMessage = 'Loading cloud score…';

    try {
      const { data, error } = await supabase
        .from('scores')
        .select('high_score')
        .eq('user_id', this.auth.user.id)
        .maybeSingle();

      if (error) throw error;

      const remote = data?.high_score ?? 0;
      const next = Math.max(remote, this.highScore);
      this.highScore = next;
      localStorage.setItem(LOCAL_HIGH_KEY, String(next));

      if (!data) {
        await supabase.from('scores').upsert({
          user_id: this.auth.user.id,
          high_score: next,
          updated_at: new Date().toISOString(),
        });
      } else if (next > remote) {
        await supabase
          .from('scores')
          .update({ high_score: next, updated_at: new Date().toISOString() })
          .eq('user_id', this.auth.user.id);
      }

      this.status = 'synced';
      this.statusMessage = 'Score synced to your account';
    } catch {
      this.status = 'offline';
      this.statusMessage = 'Offline — using local high score';
    }

    await Promise.all([this.fetchLeaderboard(), this.loadProfileBundle()]);
    return this.highScore;
  }

  /** Submit a finished run: high score + (if signed in) history/career via RPC. */
  async submit(run: GameRunSummary): Promise<number> {
    this.persistLocal(run.score);
    this.lastNewAwards = [];

    if (!supabase || !this.auth.isSignedIn() || !this.auth.user) {
      this.status = 'local';
      this.statusMessage = 'Saved locally — sign in to sync';
      return this.highScore;
    }

    this.status = 'syncing';
    this.statusMessage = 'Saving run…';

    try {
      const { data, error } = await supabase.rpc('record_game_run', {
        p_score: run.score,
        p_lines_cleared: run.linesCleared,
        p_level_reached: run.levelReached,
        p_start_level: run.startLevel,
        p_duration_ms: run.durationMs,
        p_tetris_count: run.tetrisCount,
        p_perfect_clears: run.perfectClears,
      });

      if (error) throw error;

      const payload = data as {
        best_score?: number;
        new_awards?: string[];
      } | null;

      const best = payload?.best_score ?? run.score;
      this.highScore = Math.max(this.highScore, best, run.score);
      localStorage.setItem(LOCAL_HIGH_KEY, String(this.highScore));
      this.lastNewAwards = Array.isArray(payload?.new_awards) ? payload!.new_awards! : [];

      const isBest = run.score >= this.highScore;
      this.status = 'synced';
      this.statusMessage =
        this.lastNewAwards.length > 0
          ? `Run saved · ${this.lastNewAwards.length} new award${this.lastNewAwards.length > 1 ? 's' : ''}!`
          : isBest
            ? 'Run saved · personal best synced!'
            : 'Run saved to your account';

      await Promise.all([this.fetchLeaderboard(), this.loadProfileBundle()]);
    } catch {
      // Fallback: keep legacy high-score upsert if RPC missing / offline
      try {
        const { data, error } = await supabase
          .from('scores')
          .select('high_score')
          .eq('user_id', this.auth.user.id)
          .maybeSingle();
        if (error) throw error;
        const remote = data?.high_score ?? 0;
        const next = Math.max(remote, this.highScore, run.score);
        this.highScore = next;
        localStorage.setItem(LOCAL_HIGH_KEY, String(next));
        const { error: upsertError } = await supabase.from('scores').upsert({
          user_id: this.auth.user.id,
          high_score: next,
          updated_at: new Date().toISOString(),
        });
        if (upsertError) throw upsertError;
        this.status = 'synced';
        this.statusMessage = 'Score synced (run history pending schema update)';
        await this.fetchLeaderboard();
      } catch {
        this.status = 'error';
        this.statusMessage = 'Could not sync — kept locally';
      }
    }

    return this.highScore;
  }

  async setLeaderboardKind(kind: LeaderboardKind): Promise<void> {
    this.leaderboardKind = kind;
    await this.fetchLeaderboard();
  }

  async fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!supabase || !isSupabaseConfigured) {
      this.leaderboard = [];
      return this.leaderboard;
    }

    const meta = LEADERBOARD_VIEWS[this.leaderboardKind];

    try {
      // The views carry their own ORDER BY, but PostgREST wraps them in an
      // outer query with LIMIT — without an explicit order that returns an
      // arbitrary 8 rows rather than the top 8.
      const selfId = this.auth.user?.id ?? '';
      const { data, error, count } = await supabase
        .from(meta.view)
        .select('display_name, value, user_id', { count: 'exact' })
        .order('value', { ascending: false })
        .limit(LEADERBOARD_LIMIT);

      if (error) throw error;

      this.leaderboardTotal = count ?? (data ?? []).length;
      this.leaderboard = (data ?? []).map((row) => {
        const value = Number(row.value) || 0;
        const userId = String(row.user_id ?? '');
        return {
          userId,
          displayName: String(row.display_name ?? 'PLAYER').toUpperCase(),
          value,
          displayValue: meta.format(value),
          isSelf: Boolean(selfId) && userId === selfId,
        };
      });
      this.lastError = null;
    } catch (err) {
      // Keep the previous leaderboard, but don't hide *why* it is stale —
      // a silent catch here is indistinguishable from "nobody has played yet".
      this.lastError = describeError(err);
      console.warn('[scores] leaderboard fetch failed:', err);
    }

    return this.leaderboard;
  }

  /** 1-based position of the signed-in player on the active board. */
  myRank(): number | null {
    const i = this.leaderboard.findIndex((e) => e.isSelf);
    return i === -1 ? null : i + 1;
  }

  /**
   * Change in rank since the last time this board was viewed (positive = moved
   * up). Reads and then rewrites the stored snapshot, so it is meaningful once
   * per visit — honest about being "since you last looked", not all-time.
   */
  consumeRankDelta(): number | null {
    const rank = this.myRank();
    if (rank === null) return null;

    let store: Record<string, number> = {};
    try {
      store = JSON.parse(localStorage.getItem(LOCAL_RANK_KEY) ?? '{}') as Record<string, number>;
    } catch {
      store = {};
    }

    const previous = store[this.leaderboardKind];
    store[this.leaderboardKind] = rank;
    try {
      localStorage.setItem(LOCAL_RANK_KEY, JSON.stringify(store));
    } catch {
      // Private mode / blocked storage: a missing delta is not worth failing on.
    }

    if (typeof previous !== 'number' || previous === rank) return null;
    return previous - rank;
  }

  /**
   * Another player's public card. Deliberately excludes game_runs: RLS makes it
   * owner-only, and per-run timestamps are the thing we promised not to expose.
   */
  async loadPublicProfile(
    userId: string,
  ): Promise<{ career: CareerProfile; awards: AwardInfo[] } | null> {
    if (!supabase) return null;

    try {
      const [profileRes, awardsRes, earnedRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, display_name, created_at, total_lines_cleared, total_play_ms, total_games, awards_count, best_score, best_lines_in_game, best_level_reached, latest_score, latest_lines, latest_level',
          )
          .eq('id', userId)
          .maybeSingle(),
        supabase.from('awards').select('code, title, description, sort_order').order('sort_order'),
        supabase.from('user_awards').select('award_code, earned_at').eq('user_id', userId),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (!profileRes.data) return null;

      const p = profileRes.data;
      const career: CareerProfile = {
        userId: String(p.id),
        displayName: p.display_name ?? 'PLAYER',
        joinedAt: String(p.created_at ?? ''),
        totalLinesCleared: Number(p.total_lines_cleared) || 0,
        totalPlayMs: Number(p.total_play_ms) || 0,
        totalGames: Number(p.total_games) || 0,
        awardsCount: Number(p.awards_count) || 0,
        bestScore: Number(p.best_score) || 0,
        bestLinesInGame: Number(p.best_lines_in_game) || 0,
        bestLevelReached: Number(p.best_level_reached) || 0,
        latestScore: Number(p.latest_score) || 0,
        latestLines: Number(p.latest_lines) || 0,
        latestLevel: Number(p.latest_level) || 0,
      };

      const earned = new Set((earnedRes.data ?? []).map((r) => r.award_code));
      const awards: AwardInfo[] = (awardsRes.data ?? []).map((row) => ({
        code: row.code,
        title: row.title,
        description: row.description ?? '',
        earned: earned.has(row.code),
        earnedAt: null,
      }));

      return { career, awards };
    } catch (err) {
      this.lastError = describeError(err);
      console.warn('[scores] public profile failed:', err);
      return null;
    }
  }

  async loadProfileBundle(): Promise<void> {
    if (!supabase || !this.auth.isSignedIn() || !this.auth.user) {
      this.career = null;
      this.history = [];
      this.awards = [];
      return;
    }

    const uid = this.auth.user.id;

    try {
      const [profileRes, runsRes, awardsRes, earnedRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, display_name, created_at, total_lines_cleared, total_play_ms, total_games, awards_count, best_score, best_lines_in_game, best_level_reached, latest_score, latest_lines, latest_level',
          )
          .eq('id', uid)
          .maybeSingle(),
        supabase
          .from('game_runs')
          .select(
            'id, score, lines_cleared, level_reached, start_level, duration_ms, tetris_count, perfect_clears, ended_at',
          )
          .eq('user_id', uid)
          .order('ended_at', { ascending: false })
          .limit(HISTORY_LIMIT),
        supabase.from('awards').select('code, title, description, sort_order').order('sort_order'),
        supabase.from('user_awards').select('award_code, earned_at').eq('user_id', uid),
      ]);

      // Each of these can fail independently (missing grant, un-migrated view,
      // stale PostgREST cache). Report the first failure instead of silently
      // rendering an empty profile.
      const failure = [profileRes, runsRes, awardsRes, earnedRes].find((r) => r.error);
      if (failure?.error) {
        this.lastError = describeError(failure.error);
        console.warn('[scores] profile bundle partial failure:', failure.error);
      } else {
        this.lastError = null;
      }

      if (profileRes.data) {
        const p = profileRes.data;
        this.career = {
          userId: String(p.id ?? uid),
          displayName: p.display_name ?? this.auth.displayName,
          joinedAt: String(p.created_at ?? ''),
          totalLinesCleared: Number(p.total_lines_cleared) || 0,
          totalPlayMs: Number(p.total_play_ms) || 0,
          totalGames: Number(p.total_games) || 0,
          awardsCount: Number(p.awards_count) || 0,
          bestScore: Number(p.best_score) || 0,
          bestLinesInGame: Number(p.best_lines_in_game) || 0,
          bestLevelReached: Number(p.best_level_reached) || 0,
          latestScore: Number(p.latest_score) || 0,
          latestLines: Number(p.latest_lines) || 0,
          latestLevel: Number(p.latest_level) || 0,
        };
        if (this.career.bestScore > this.highScore) {
          this.highScore = this.career.bestScore;
          localStorage.setItem(LOCAL_HIGH_KEY, String(this.highScore));
        }
      } else {
        this.career = emptyCareer(this.auth.displayName);
      }

      this.history = (runsRes.data ?? []).map((row) => ({
        id: row.id,
        score: row.score ?? 0,
        linesCleared: row.lines_cleared ?? 0,
        levelReached: row.level_reached ?? 0,
        startLevel: row.start_level ?? 0,
        durationMs: row.duration_ms ?? 0,
        tetrisCount: row.tetris_count ?? 0,
        perfectClears: row.perfect_clears ?? 0,
        endedAt: row.ended_at ?? '',
      }));

      const earnedMap = new Map<string, string>();
      for (const row of earnedRes.data ?? []) {
        earnedMap.set(row.award_code, row.earned_at);
      }

      this.awards = (awardsRes.data ?? []).map((row) => ({
        code: row.code,
        title: row.title,
        description: row.description ?? '',
        earned: earnedMap.has(row.code),
        earnedAt: earnedMap.get(row.code) ?? null,
      }));
    } catch (err) {
      // Profile columns / tables may not exist until schema.sql is re-run
      this.lastError = describeError(err);
      console.warn('[scores] profile bundle failed:', err);
      this.career = this.career ?? emptyCareer(this.auth.displayName);
    }
  }
}

/** Postgres/PostgREST errors carry the useful detail in code + hint. */
function describeError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { message?: string; code?: string; hint?: string; details?: string };

  // supabase-js surfaces an unreachable host as a bare "TypeError: Failed to
  // fetch", which tells the reader nothing. Name the host and the likely cause.
  const message = e.message ?? 'Unknown error';
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return `can't reach ${supabaseHost ?? 'the database'} — check VITE_SUPABASE_URL in .env, and that you are online`;
  }

  const code = e.code ? ` [${e.code}]` : '';
  return `${message}${code}${e.hint ? ` — ${e.hint}` : ''}`;
}

