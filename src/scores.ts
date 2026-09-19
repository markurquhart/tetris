import type { AuthService } from './auth';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const LOCAL_HIGH_KEY = 'tetris_local_high';

export type ScoreStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error';

export interface LeaderboardEntry {
  displayName: string;
  highScore: number;
}

export class ScoreService {
  highScore = Number(localStorage.getItem(LOCAL_HIGH_KEY) ?? '0') || 0;
  status: ScoreStatus = 'local';
  statusMessage = 'Local high score';
  leaderboard: LeaderboardEntry[] = [];
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
    await this.fetchLeaderboard();

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

    await this.fetchLeaderboard();
    return this.highScore;
  }

  async submit(score: number): Promise<number> {
    this.persistLocal(score);

    if (!supabase || !this.auth.isSignedIn() || !this.auth.user) {
      this.status = 'local';
      this.statusMessage = 'Saved locally — sign in to sync';
      return this.highScore;
    }

    this.status = 'syncing';
    this.statusMessage = 'Saving score…';

    try {
      const { data, error } = await supabase
        .from('scores')
        .select('high_score')
        .eq('user_id', this.auth.user.id)
        .maybeSingle();

      if (error) throw error;

      const remote = data?.high_score ?? 0;
      const next = Math.max(remote, this.highScore, score);
      this.highScore = next;
      localStorage.setItem(LOCAL_HIGH_KEY, String(next));

      const { error: upsertError } = await supabase.from('scores').upsert({
        user_id: this.auth.user.id,
        high_score: next,
        updated_at: new Date().toISOString(),
      });

      if (upsertError) throw upsertError;

      this.status = 'synced';
      this.statusMessage = next > remote ? 'New personal best synced!' : 'Score synced';
      await this.fetchLeaderboard();
    } catch {
      this.status = 'error';
      this.statusMessage = 'Could not sync — kept locally';
    }

    return this.highScore;
  }

  async fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!supabase || !isSupabaseConfigured) {
      this.leaderboard = [];
      return this.leaderboard;
    }

    try {
      const { data, error } = await supabase
        .from('scores')
        .select('high_score, profiles(display_name)')
        .gt('high_score', 0)
        .order('high_score', { ascending: false })
        .limit(8);

      if (error) throw error;

      this.leaderboard = (data ?? []).map((row) => {
        const profile = row.profiles as { display_name?: string } | { display_name?: string }[] | null;
        const name = Array.isArray(profile)
          ? profile[0]?.display_name
          : profile?.display_name;
        return {
          displayName: (name ?? 'PLAYER').toUpperCase(),
          highScore: row.high_score ?? 0,
        };
      });
    } catch {
      // Keep previous leaderboard on failure
    }

    return this.leaderboard;
  }
}
