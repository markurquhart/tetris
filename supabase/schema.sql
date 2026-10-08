-- Def Not Tetris schema (run in Supabase SQL editor)
-- Email/password auth profiles + synced scores + game history + multi-leaderboards.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users) + career aggregates
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'PLAYER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_len check (char_length(display_name) between 1 and 24)
);

alter table public.profiles add column if not exists total_lines_cleared bigint not null default 0;
alter table public.profiles add column if not exists total_play_ms bigint not null default 0;
alter table public.profiles add column if not exists total_games integer not null default 0;
alter table public.profiles add column if not exists awards_count integer not null default 0;
alter table public.profiles add column if not exists best_score integer not null default 0;
alter table public.profiles add column if not exists best_lines_in_game integer not null default 0;
alter table public.profiles add column if not exists best_level_reached integer not null default 0;
-- Public teaser for "most recent game" without exposing ended_at
alter table public.profiles add column if not exists latest_score integer not null default 0;
alter table public.profiles add column if not exists latest_lines integer not null default 0;
alter table public.profiles add column if not exists latest_level integer not null default 0;

alter table public.profiles drop constraint if exists profiles_totals_nonneg;
alter table public.profiles
  add constraint profiles_totals_nonneg check (
    total_lines_cleared >= 0
    and total_play_ms >= 0
    and total_games >= 0
    and awards_count >= 0
    and best_score >= 0
    and best_lines_in_game >= 0
    and best_level_reached >= 0
    and latest_score >= 0
    and latest_lines >= 0
    and latest_level >= 0
  );

-- Personal high scores (kept for compatibility with existing clients)
create table if not exists public.scores (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  high_score integer not null default 0 check (high_score >= 0),
  updated_at timestamptz not null default now()
);

-- Optional legacy table from earlier sync-code version (safe to keep)
create table if not exists public.tetris_scores (
  sync_code text primary key,
  display_name text not null default 'Player',
  high_score integer not null default 0 check (high_score >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Game history (every finished game; owner-only select)
-- ---------------------------------------------------------------------------
create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  lines_cleared integer not null default 0 check (lines_cleared >= 0),
  level_reached integer not null default 0 check (level_reached >= 0),
  start_level integer not null default 0 check (start_level >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  tetris_count integer not null default 0 check (tetris_count >= 0),
  perfect_clears integer not null default 0 check (perfect_clears >= 0),
  ended_at timestamptz not null default now()
);

create index if not exists game_runs_user_ended_idx
  on public.game_runs (user_id, ended_at desc);

create index if not exists game_runs_lines_idx
  on public.game_runs (lines_cleared desc, ended_at asc);

-- ---------------------------------------------------------------------------
-- Awards catalog + user grants
-- ---------------------------------------------------------------------------
create table if not exists public.awards (
  code text primary key,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.user_awards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  award_code text not null references public.awards (code) on delete cascade,
  earned_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  primary key (user_id, award_code)
);

create index if not exists user_awards_user_idx on public.user_awards (user_id);

insert into public.awards (code, title, description, sort_order) values
  ('first_game', 'First Stack', 'Finish your first game.', 10),
  ('first_tetris', 'Quad Clear', 'Clear four lines at once.', 20),
  ('first_perfect', 'All Clear', 'Empty the board with a clear.', 30),
  ('level_10', 'Level Ten', 'Reach level 10 in a single game.', 40),
  ('lines_100', 'Century', 'Clear 100 lines in one game.', 50),
  ('score_10k', 'Ten Kay', 'Score 10,000 points in one game.', 60),
  ('career_lines_1k', 'Line Grinder', 'Clear 1,000 lines across all games.', 70),
  ('games_10', 'Regular', 'Finish 10 games.', 80),
  ('play_hour', 'Marathon', 'Log one hour of total play time.', 90)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_name text;
begin
  initial_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1),
    'PLAYER'
  );
  initial_name := left(initial_name, 24);

  insert into public.profiles (id, display_name)
  values (new.id, initial_name)
  on conflict (id) do nothing;

  insert into public.scores (user_id, high_score)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic end-of-run: insert history, bump aggregates, grant awards
-- ---------------------------------------------------------------------------
create or replace function public.record_game_run(
  p_score integer,
  p_lines_cleared integer,
  p_level_reached integer,
  p_start_level integer,
  p_duration_ms integer,
  p_tetris_count integer,
  p_perfect_clears integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  run_id uuid;
  new_awards text[] := '{}';
  v_total_games integer;
  v_total_lines bigint;
  v_total_play bigint;
  v_best_score integer;
  v_best_lines integer;
  v_best_level integer;
  v_awards_count integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_score is null or p_score < 0 or p_score > 100000000 then
    raise exception 'Invalid score';
  end if;
  if p_lines_cleared is null or p_lines_cleared < 0 or p_lines_cleared > 100000 then
    raise exception 'Invalid lines';
  end if;
  if p_level_reached is null or p_level_reached < 0 or p_level_reached > 99 then
    raise exception 'Invalid level';
  end if;
  if p_start_level is null or p_start_level < 0 or p_start_level > 9 then
    raise exception 'Invalid start level';
  end if;
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 86400000 then
    raise exception 'Invalid duration';
  end if;
  if p_tetris_count is null or p_tetris_count < 0 or p_tetris_count > 100000 then
    raise exception 'Invalid tetris count';
  end if;
  if p_perfect_clears is null or p_perfect_clears < 0 or p_perfect_clears > 100000 then
    raise exception 'Invalid perfect clears';
  end if;

  insert into public.profiles (id) values (uid)
  on conflict (id) do nothing;
  insert into public.scores (user_id, high_score) values (uid, 0)
  on conflict (user_id) do nothing;

  insert into public.game_runs (
    user_id, score, lines_cleared, level_reached, start_level,
    duration_ms, tetris_count, perfect_clears
  ) values (
    uid, p_score, p_lines_cleared, p_level_reached, p_start_level,
    p_duration_ms, p_tetris_count, p_perfect_clears
  )
  returning id into run_id;

  update public.profiles p
  set
    total_games = p.total_games + 1,
    total_lines_cleared = p.total_lines_cleared + p_lines_cleared,
    total_play_ms = p.total_play_ms + p_duration_ms,
    best_score = greatest(p.best_score, p_score),
    best_lines_in_game = greatest(p.best_lines_in_game, p_lines_cleared),
    best_level_reached = greatest(p.best_level_reached, p_level_reached),
    latest_score = p_score,
    latest_lines = p_lines_cleared,
    latest_level = p_level_reached,
    updated_at = now()
  where p.id = uid
  returning
    total_games, total_lines_cleared, total_play_ms,
    best_score, best_lines_in_game, best_level_reached
  into
    v_total_games, v_total_lines, v_total_play,
    v_best_score, v_best_lines, v_best_level;

  update public.scores s
  set
    high_score = greatest(s.high_score, p_score),
    updated_at = now()
  where s.user_id = uid;

  -- Award grants (idempotent); ROW_COUNT = 1 only when newly inserted
  if v_total_games >= 1 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'first_game') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'first_game'); end if;
  end if;
  if p_tetris_count >= 1 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'first_tetris') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'first_tetris'); end if;
  end if;
  if p_perfect_clears >= 1 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'first_perfect') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'first_perfect'); end if;
  end if;
  if p_level_reached >= 10 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'level_10') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'level_10'); end if;
  end if;
  if p_lines_cleared >= 100 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'lines_100') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'lines_100'); end if;
  end if;
  if p_score >= 10000 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'score_10k') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'score_10k'); end if;
  end if;
  if v_total_lines >= 1000 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'career_lines_1k') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'career_lines_1k'); end if;
  end if;
  if v_total_games >= 10 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'games_10') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'games_10'); end if;
  end if;
  if v_total_play >= 3600000 then
    insert into public.user_awards (user_id, award_code)
    values (uid, 'play_hour') on conflict do nothing;
    if found then new_awards := array_append(new_awards, 'play_hour'); end if;
  end if;

  select count(*)::integer into v_awards_count
  from public.user_awards where user_id = uid;

  update public.profiles
  set awards_count = v_awards_count, updated_at = now()
  where id = uid;

  return jsonb_build_object(
    'run_id', run_id,
    'new_awards', to_jsonb(new_awards),
    'best_score', v_best_score,
    'total_games', v_total_games,
    'awards_count', v_awards_count
  );
end;
$$;

revoke all on function public.record_game_run(
  integer, integer, integer, integer, integer, integer, integer
) from public;
grant execute on function public.record_game_run(
  integer, integer, integer, integer, integer, integer, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard views
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard as
select
  p.display_name,
  s.high_score,
  s.updated_at
from public.scores s
join public.profiles p on p.id = s.user_id
where s.high_score > 0
order by s.high_score desc, s.updated_at asc;

create or replace view public.leaderboard_career_lines as
select
  p.display_name,
  p.total_lines_cleared as value,
  p.updated_at
from public.profiles p
where p.total_lines_cleared > 0
order by p.total_lines_cleared desc, p.updated_at asc;

create or replace view public.leaderboard_play_time as
select
  p.display_name,
  p.total_play_ms as value,
  p.updated_at
from public.profiles p
where p.total_play_ms > 0
order by p.total_play_ms desc, p.updated_at asc;

create or replace view public.leaderboard_awards as
select
  p.display_name,
  p.awards_count as value,
  p.updated_at
from public.profiles p
where p.awards_count > 0
order by p.awards_count desc, p.updated_at asc;

create or replace view public.leaderboard_best_lines as
select
  p.display_name,
  p.best_lines_in_game as value,
  p.updated_at
from public.profiles p
where p.best_lines_in_game > 0
order by p.best_lines_in_game desc, p.updated_at asc;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.game_runs enable row level security;
alter table public.awards enable row level security;
alter table public.user_awards enable row level security;

-- Profiles
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Scores
drop policy if exists "Scores are viewable by everyone" on public.scores;
create policy "Scores are viewable by everyone"
  on public.scores for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can insert own score" on public.scores;
create policy "Users can insert own score"
  on public.scores for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own score" on public.scores;
create policy "Users can update own score"
  on public.scores for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Game runs: owner select only. Inserts go through record_game_run (security definer).
drop policy if exists "Users can insert own runs" on public.game_runs;

drop policy if exists "Users can view own runs" on public.game_runs;
create policy "Users can view own runs"
  on public.game_runs for select
  to authenticated
  using (auth.uid() = user_id);

-- Awards catalog: public read
drop policy if exists "Awards are viewable by everyone" on public.awards;
create policy "Awards are viewable by everyone"
  on public.awards for select
  to anon, authenticated
  using (true);

-- User awards: public read (earned_at visible; individual run timestamps are not)
drop policy if exists "User awards are viewable by everyone" on public.user_awards;
create policy "User awards are viewable by everyone"
  on public.user_awards for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can insert own awards" on public.user_awards;
create policy "Users can insert own awards"
  on public.user_awards for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Grants
grant select on public.leaderboard to anon, authenticated;
grant select on public.leaderboard_career_lines to anon, authenticated;
grant select on public.leaderboard_play_time to anon, authenticated;
grant select on public.leaderboard_awards to anon, authenticated;
grant select on public.leaderboard_best_lines to anon, authenticated;
grant select on public.awards to anon, authenticated;
grant select on public.user_awards to anon, authenticated;
grant select on public.game_runs to authenticated;
