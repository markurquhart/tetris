-- Tetris Arcade schema (run in Supabase SQL editor)
-- Enables email/password auth profiles + synced high scores + public leaderboard.

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'PLAYER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_len check (char_length(display_name) between 1 and 24)
);

-- Personal high scores
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

-- Auto-create profile + score row on signup
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

-- Leaderboard view
create or replace view public.leaderboard as
select
  p.display_name,
  s.high_score,
  s.updated_at
from public.scores s
join public.profiles p on p.id = s.user_id
where s.high_score > 0
order by s.high_score desc, s.updated_at asc;

alter table public.profiles enable row level security;
alter table public.scores enable row level security;

-- Profiles policies
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

-- Scores policies
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

-- Grant view access
grant select on public.leaderboard to anon, authenticated;
