# Tetris Arcade (Mac + iPhone)

Web arcade cabinet port of the Python Tetris game. Email login, Postgres career stats + game history in Supabase, multi-leaderboards, installable as a PWA.

**Production domain:** [def-not-tetris.com](https://def-not-tetris.com)

## Setup

```bash
cd tetris-web
npm install
cp .env.example .env
```

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. **SQL Editor** → run [`supabase/schema.sql`](./supabase/schema.sql)
3. **Authentication → Providers** → enable Email
4. For personal use, under **Authentication → Settings**, you can disable **Confirm email** so signup signs you in immediately
5. Copy Project URL + anon key into `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

6. In Supabase → **Authentication → URL Configuration**, add:
   - Site URL: `https://def-not-tetris.com`
   - Redirect URLs: `https://def-not-tetris.com/**` and `http://localhost:5173/**`

   Password reset uses these too — the emailed link bounces off Supabase back to
   the Site URL, so a reset link will fail if the origin isn't listed here.

7. **Authentication → Email Templates → Reset Password** must be enabled (it is
   by default). The default template's `{{ .ConfirmationURL }}` is all the app
   needs; it returns with `type=recovery` and the app prompts for a new password.

### 2. Run locally

```bash
npm run dev
```

## Deploy to Vercel (def-not-tetris.com)

Future pushes to `main` auto-deploy. One-time setup:

1. Put this folder on GitHub (new repo, e.g. `def-not-tetris`).
2. [vercel.com/new](https://vercel.com/new) → Import that repo.
3. Framework: **Vite** (or leave auto). Root directory: repo root.
4. Environment variables (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.
6. **Project → Settings → Domains** → add `def-not-tetris.com` and `www.def-not-tetris.com`.
7. At your domain registrar, point DNS as Vercel shows (usually):
   - `A` `@` → `76.76.21.21`
   - or their nameservers / CNAME for `www`

After that: `git push origin main` → live on the domain in about a minute.

## Play

- **Guest**: play locally anytime
- **LOGIN / CREATE**: email/password — career, awards, and every finished game sync across Mac & iPhone
- **PROFILE**: career totals, awards, recent games (timestamps for you only)
- **BOARDS**: Score · Career lines · Play time · Awards · Best single-game lines
- iPhone: Safari → Share → Add to Home Screen

- **Forgot password**: LOGIN → *Forgot your password?* emails a reset link. The
  link returns to the site and prompts for a new password.
- **Change password**: PROFILE → CHANGE PASSWORD while signed in.

After pulling schema changes, re-run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor (idempotent).

## Troubleshooting: boards or profile stay empty

The app now prints the actual Postgres error in the status line under the title
(and to the browser console as `[scores] …`) instead of silently showing an
empty board. If it still looks empty with no error, run
[`supabase/diagnose.sql`](./supabase/diagnose.sql) in the SQL editor — it checks,
in order: whether any rows exist, whether `anon`/`authenticated` have table
grants, whether RLS policies are present, whether the profile aggregate columns
applied, whether `record_game_run` is callable, and what an anonymous client
actually sees. It finishes with `notify pgrst, 'reload schema'`, which is needed
because PostgREST caches the schema and will keep serving the old shape after a
migration until told otherwise.

## Scripts

```bash
npm run dev      # local
npm run build    # production bundle → dist/
npm run preview  # preview dist locally
```
