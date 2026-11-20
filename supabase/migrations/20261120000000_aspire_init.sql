-- Aspire v2: accounts are Supabase Auth; these tables hold only bot links, Slack installs and
-- opt-in cloud sync for users who linked a bot. All writes happen on the server (service role).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.link_codes (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.bot_links (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('telegram', 'discord', 'slack')),
  platform_user_id text not null,
  chat_id text not null,
  chat_title text,
  is_primary boolean not null default false,
  linked_at timestamptz not null default now(),
  unique (platform, chat_id, user_id)
);
create index if not exists bot_links_platform_user on public.bot_links (platform, platform_user_id);

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_refresh_token_enc text
);

create table if not exists public.bot_reminders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  at timestamptz not null,
  repeat_daily boolean not null default false,
  sent_at timestamptz
);
create index if not exists bot_reminders_due on public.bot_reminders (at) where sent_at is null;

create table if not exists public.slack_installations (
  team_id text primary key,
  bot_user_id text,
  bot_token_enc text not null,
  installed_by uuid references auth.users (id) on delete set null,
  installed_at timestamptz not null default now()
);

-- Row level security everywhere. Signed-in users may read and delete only their own rows in
-- the three tables below; every write goes through the server with the service role.
alter table public.profiles enable row level security;
alter table public.link_codes enable row level security;
alter table public.bot_links enable row level security;
alter table public.user_state enable row level security;
alter table public.secrets enable row level security;
alter table public.bot_reminders enable row level security;
alter table public.slack_installations enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile delete" on public.profiles for delete to authenticated using (user_id = (select auth.uid()));
create policy "own links read" on public.bot_links for select to authenticated using (user_id = (select auth.uid()));
create policy "own links delete" on public.bot_links for delete to authenticated using (user_id = (select auth.uid()));
create policy "own state read" on public.user_state for select to authenticated using (user_id = (select auth.uid()));
create policy "own state delete" on public.user_state for delete to authenticated using (user_id = (select auth.uid()));
-- secrets, link_codes, bot_reminders, slack_installations: no client policies at all.
