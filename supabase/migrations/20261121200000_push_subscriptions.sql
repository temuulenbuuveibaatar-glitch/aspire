-- Aspire: Web Push subscriptions, so reminders ring while the app is closed (lib/push.ts,
-- app/api/push). One row per browser (the endpoint is unique: a browser that signs in to
-- another account moves to it). At most 5 per user, enforced by the route. The endpoint and keys
-- are a capability for that one browser only; no reminder text is stored here.
-- All access is server side with the service role: RLS on, no client policies (deny all).

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  lang text not null default 'en',
  hide_text boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id, created_at);

alter table public.push_subscriptions enable row level security;
grant all on public.push_subscriptions to service_role;
