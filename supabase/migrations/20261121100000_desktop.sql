-- Aspire Desktop: a helper app on the person's computer, paired with a one-time code, runs
-- jobs (open an app or a link, type text, save a file, fill a form) only after the person
-- types "y" in its window. Only hashes of codes and device tokens are stored. Jobs expire
-- after 5 minutes; their payload is cleared once they finish, and for expired jobs by the
-- purge job below (also when the device polls or anyone queues a job). Rows are deleted after
-- 24 hours. All access is server side.

create table if not exists public.desktop_codes (
  code_hash text primary key,
  user_id text not null,
  expires_at timestamptz not null
);
create index if not exists desktop_codes_user on public.desktop_codes (user_id);

create table if not exists public.desktop_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists desktop_devices_user on public.desktop_devices (user_id);

create table if not exists public.desktop_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  device_id uuid not null references public.desktop_devices (id) on delete cascade,
  kind text not null check (kind in ('open_app', 'open_url', 'type_text', 'save_file', 'fill_form')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'done', 'denied', 'failed', 'expired')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists desktop_jobs_device_status on public.desktop_jobs (device_id, status, created_at);
create index if not exists desktop_jobs_user on public.desktop_jobs (user_id, created_at);
-- Cleanup of every user's old jobs (lib/desktop.ts enqueueDesktopJob).
create index if not exists desktop_jobs_created on public.desktop_jobs (created_at);

-- Row level security on, no client policies: browsers and helpers only reach these through
-- the server routes (service role).
alter table public.desktop_codes enable row level security;
alter table public.desktop_devices enable row level security;
alter table public.desktop_jobs enable row level security;

grant all on public.desktop_codes to service_role;
grant all on public.desktop_devices to service_role;
grant all on public.desktop_jobs to service_role;

-- Retention that does not wait for app traffic: every 10 minutes, expire jobs not allowed within
-- 5 minutes (clearing their payload: typed text, file content), delete rows older than 24 hours
-- and expired pairing codes. The same housekeeping in lib/desktop.ts stays as a backstop.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'aspire-desktop-purge') then
    perform cron.unschedule('aspire-desktop-purge');
  end if;
end
$$;

select cron.schedule(
  'aspire-desktop-purge',
  '*/10 * * * *',
  $job$
  update public.desktop_jobs
    set status = 'expired', payload = '{}'::jsonb, updated_at = now()
    where status in ('queued', 'sent') and created_at < now() - interval '5 minutes';
  delete from public.desktop_jobs where created_at < now() - interval '24 hours';
  delete from public.desktop_codes where expires_at < now();
  $job$
);
