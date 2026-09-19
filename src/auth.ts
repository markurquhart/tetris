import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const LOCAL_NAME_KEY = 'tetris_display_name';

export type AuthStatus = 'guest' | 'signed-in' | 'unavailable';

export class AuthService {
  user: User | null = null;
  session: Session | null = null;
  displayName = localStorage.getItem(LOCAL_NAME_KEY) ?? 'PLAYER';
  status: AuthStatus = isSupabaseConfigured ? 'guest' : 'unavailable';
  message = isSupabaseConfigured
    ? 'Sign in to sync scores across devices'
    : 'Add Supabase keys to enable login';

  private listeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  async init(): Promise<void> {
    if (!supabase) {
      this.emit();
      return;
    }

    const { data } = await supabase.auth.getSession();
    await this.applySession(data.session);

    supabase.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session);
    });
  }

  private async applySession(session: Session | null): Promise<void> {
    this.session = session;
    this.user = session?.user ?? null;

    if (!this.user) {
      this.status = isSupabaseConfigured ? 'guest' : 'unavailable';
      this.message = isSupabaseConfigured
        ? 'Playing as guest — scores stay on this device'
        : 'Add Supabase keys to enable login';
      this.emit();
      return;
    }

    this.status = 'signed-in';
    await this.loadProfile();
    this.message = `Signed in as ${this.displayName}`;
    this.emit();
  }

  private async loadProfile(): Promise<void> {
    if (!supabase || !this.user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', this.user.id)
      .maybeSingle();

    if (data?.display_name) {
      this.displayName = data.display_name;
      localStorage.setItem(LOCAL_NAME_KEY, this.displayName);
    }
  }

  async signUp(email: string, password: string, displayName: string): Promise<string | null> {
    if (!supabase) return 'Database not configured';
    const name = displayName.trim().slice(0, 24) || 'PLAYER';

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name } },
    });

    if (error) return error.message;

    if (data.user && !data.session) {
      return 'Check your email to confirm, then sign in.';
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        display_name: name,
        updated_at: new Date().toISOString(),
      });
      this.displayName = name;
      localStorage.setItem(LOCAL_NAME_KEY, name);
    }

    return null;
  }

  async signIn(email: string, password: string): Promise<string | null> {
    if (!supabase) return 'Database not configured';
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error ? error.message : null;
  }

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async updateDisplayName(name: string): Promise<string | null> {
    const cleaned = name.trim().slice(0, 24) || 'PLAYER';
    this.displayName = cleaned;
    localStorage.setItem(LOCAL_NAME_KEY, cleaned);

    if (!supabase || !this.user) return null;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: this.user.id,
        display_name: cleaned,
        updated_at: new Date().toISOString(),
      });

    return error ? error.message : null;
  }

  isSignedIn(): boolean {
    return this.status === 'signed-in' && Boolean(this.user);
  }
}
