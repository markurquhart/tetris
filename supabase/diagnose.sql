-- Def Not Tetris — "I ran schema.sql but scores still don't show" checklist.
-- Paste into the Supabase SQL editor and read each result block top to bottom.

-- 1. Is there actually any data? If these are all 0, nothing has been recorded
--    yet and the boards are *correctly* empty — the problem is the write path
--    (record_game_run), not the read path.
select
  (select count(*) from public.profiles)                     as profiles,
  (select count(*) from public.scores)                       as scores_rows,
  (select count(*) from public.scores where high_score > 0)  as scores_above_zero,
  (select count(*) from public.game_runs)                    as game_runs,
  (select count(*) from public.user_awards)                  as awards_granted;

-- 2. Can the API roles read the tables at all? A missing grant fails with
--    "permission denied" BEFORE row-level security is consulted, so the client
--    sees an empty list. Every row below should be present.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('profiles', 'scores', 'game_runs', 'awards', 'user_awards',
                     'leaderboard', 'leaderboard_career_lines',
                     'leaderboard_play_time', 'leaderboard_awards',
                     'leaderboard_best_lines')
order by table_name, grantee, privilege_type;

-- 3. Is RLS on, and does each table have the select policy it needs?
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       coalesce(string_agg(p.polname, ', ' order by p.polname), '(none)') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('profiles', 'scores', 'game_runs', 'awards', 'user_awards')
group by c.relname, c.relrowsecurity
order by c.relname;

-- 4. Do the profile aggregate columns exist? If these are missing, the schema
--    did not actually apply and the profile panel stays blank.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('total_lines_cleared', 'total_play_ms', 'total_games',
                      'awards_count', 'best_score', 'best_lines_in_game',
                      'latest_score')
order by column_name;

-- 5. Does the end-of-run RPC exist and is it callable by signed-in users?
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('record_game_run', 'handle_new_user');

-- 6. Exactly what the anonymous leaderboard query sees. Empty here but non-zero
--    in step 1 means a grant/RLS problem, not a data problem.
set local role anon;
select p.display_name, s.high_score
from public.scores s join public.profiles p on p.id = s.user_id
where s.high_score > 0
order by s.high_score desc limit 8;
reset role;

-- 7. Force PostgREST to re-read the schema (new columns/views are invisible to
--    the API until it does).
notify pgrst, 'reload schema';
