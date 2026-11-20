-- Aspire: sign-in moved from Supabase Auth to Clerk. Clerk user ids are strings like
-- "user_2abc…", not uuids, and there is no auth.users row behind them. Supabase is the database
-- only: every read and write goes through the server with the service role. Browsers never query
-- it, so the auth.uid() policies are dropped and RLS stays ENABLED with no policies (deny all for
-- anon/authenticated; the service role bypasses RLS).
--
-- Order matters: policies that reference user_id must go before the column type can change.

-- 1. Drop the six auth.uid() policies.
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile delete" on public.profiles;
drop policy if exists "own links read" on public.bot_links;
drop policy if exists "own links delete" on public.bot_links;
drop policy if exists "own state read" on public.user_state;
drop policy if exists "own state delete" on public.user_state;

-- 2. Drop the foreign keys to auth.users (default constraint names from the init migration).
alter table public.profiles drop constraint if exists profiles_user_id_fkey;
alter table public.link_codes drop constraint if exists link_codes_user_id_fkey;
alter table public.bot_links drop constraint if exists bot_links_user_id_fkey;
alter table public.user_state drop constraint if exists user_state_user_id_fkey;
alter table public.secrets drop constraint if exists secrets_user_id_fkey;
alter table public.bot_reminders drop constraint if exists bot_reminders_user_id_fkey;
alter table public.slack_installations drop constraint if exists slack_installations_installed_by_fkey;

-- 3. uuid -> text (existing uuids are kept as their text form; primary keys and the
--    bot_links unique (platform, chat_id, user_id) constraint are rebuilt automatically).
alter table public.profiles alter column user_id type text using user_id::text;
alter table public.link_codes alter column user_id type text using user_id::text;
alter table public.bot_links alter column user_id type text using user_id::text;
alter table public.user_state alter column user_id type text using user_id::text;
alter table public.secrets alter column user_id type text using user_id::text;
alter table public.bot_reminders alter column user_id type text using user_id::text;
alter table public.slack_installations alter column installed_by type text using installed_by::text;

-- 4. RLS stays on everywhere (re-asserted; a no-op when already enabled).
alter table public.profiles enable row level security;
alter table public.link_codes enable row level security;
alter table public.bot_links enable row level security;
alter table public.user_state enable row level security;
alter table public.secrets enable row level security;
alter table public.bot_reminders enable row level security;
alter table public.slack_installations enable row level security;
