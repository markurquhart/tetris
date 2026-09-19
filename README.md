# Tetris Arcade (Mac + iPhone)

Web arcade cabinet port of the Python Tetris game. Email login, Postgres scores in Supabase, public leaderboard, installable as a PWA.

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
- **LOGIN / CREATE**: account scores sync across Mac & iPhone
- **HI-SCORES**: top players from the database
- iPhone: Safari → Share → Add to Home Screen

## Scripts

```bash
npm run dev      # local
npm run build    # production bundle → dist/
npm run preview  # preview dist locally
```
