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

  /** True while the user is here from a password-reset email. */
  recoveryMode = false;

  private listeners = new Set<() => void>();
  private recoveryListeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Fires when a recovery link puts us in "choose a new password" mode. */
  onPasswordRecovery(cb: () => void): () => void {
    this.recoveryListeners.add(cb);
    return () => this.recoveryListeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private emitRecovery(): void {
    this.recoveryMode = true;
    for (const cb of this.recoveryListeners) cb();
  }

  async init(): Promise<void> {
    if (!supabase) {
      this.emit();
      return;
    }

    // detectSessionInUrl consumes the hash before we can read it, so sample the
    // recovery marker first — the PASSWORD_RECOVERY event can fire before the
    // listener below is attached.
    const hash = window.location.hash;
    const arrivedViaRecovery =
      hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).get('type') === 'recovery';

    const { data } = await supabase.auth.getSession();
    await this.applySession(data.session);

    supabase.auth.onAuthStateChange((event, session) => {
      void this.applySession(session).then(() => {
        if (event === 'PASSWORD_RECOVERY') this.emitRecovery();
      });
    });

    if (arrivedViaRecovery) this.emitRecovery();
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

  /**
   * Email a reset link. Always reports success — a distinct "no such account"
   * reply would let anyone probe which emails are registered.
   */
  async sendPasswordReset(email: string): Promise<string | null> {
    if (!supabase) return 'Database not configured';
    const cleaned = email.trim();
    if (!cleaned) return 'Enter your email address first';

    const { error } = await supabase.auth.resetPasswordForEmail(cleaned, {
      redirectTo: `${window.location.origin}/`,
    });

    // Rate limiting is worth surfacing; anything else stays generic.
    if (error && /rate|too many|limit/i.test(error.message)) return error.message;
    return null;
  }

  /** Finish a recovery: set the new password on the active recovery session. */
  async updatePassword(password: string): Promise<string | null> {
    if (!supabase) return 'Database not configured';
    if (password.length < 6) return 'Password must be at least 6 characters';

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return error.message;

    this.recoveryMode = false;
    // Drop the recovery token from the address bar so a refresh is a normal load.
    window.history.replaceState(null, '', window.location.pathname);
    return null;
  }

  async signOut(): Promise<void> {
    if (!supabase) return;
    this.recoveryMode = false;
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
