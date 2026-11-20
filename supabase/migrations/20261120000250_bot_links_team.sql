-- Aspire: Slack links remember their workspace, so the bot can DM the person later (cloud
-- reminders need the workspace's bot token, which is looked up by team_id).
alter table public.bot_links add column if not exists team_id text;

-- The cron route and sync look reminders up per person.
create index if not exists bot_reminders_user on public.bot_reminders (user_id);
