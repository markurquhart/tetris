/**
 * Minimal History-API router.
 *
 * vercel.json already rewrites every non-asset path to index.html, so real
 * paths work without a hash. Routes are matched in declaration order; `:param`
 * captures one segment.
 */

export interface RouteMatch {
  name: string;
  path: string;
  params: Record<string, string>;
}

interface RouteDef {
  name: string;
  pattern: string;
  segments: string[];
}

export class Router {
  private routes: RouteDef[] = [];
  private fallback = '/play';
  private listeners = new Set<(m: RouteMatch) => void>();
  private current: RouteMatch | null = null;

  add(name: string, pattern: string): this {
    this.routes.push({ name, pattern, segments: split(pattern) });
    return this;
  }

  setFallback(path: string): this {
    this.fallback = path;
    return this;
  }

  onChange(cb: (m: RouteMatch) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getCurrent(): RouteMatch | null {
    return this.current;
  }

  /** Programmatic navigation. `replace` avoids stacking history entries. */
  navigate(path: string, options: { replace?: boolean } = {}): void {
    const target = normalise(path);
    if (this.current?.path === target) return;
    if (options.replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    this.resolve();
  }

  start(): void {
    window.addEventListener('popstate', () => this.resolve());

    // Intercept same-origin link clicks so nav never does a full page load.
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      this.navigate(url.pathname);
    });

    this.resolve();
  }

  private resolve(): void {
    const path = normalise(window.location.pathname);
    const match = this.match(path);

    if (!match) {
      window.history.replaceState(null, '', this.fallback);
      const fallbackMatch = this.match(normalise(this.fallback));
      if (fallbackMatch) this.emit(fallbackMatch);
      return;
    }

    this.emit(match);
  }

  private emit(match: RouteMatch): void {
    this.current = match;
    for (const cb of this.listeners) cb(match);
  }

  private match(path: string): RouteMatch | null {
    const parts = split(path);
    for (const route of this.routes) {
      const params = matchSegments(route.segments, parts);
      if (params) return { name: route.name, path, params };
    }
    return null;
  }
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function matchSegments(
  pattern: string[],
  parts: string[],
): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i];
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(parts[i]);
    } else if (seg !== parts[i]) {
      return null;
    }
  }
  return params;
}
