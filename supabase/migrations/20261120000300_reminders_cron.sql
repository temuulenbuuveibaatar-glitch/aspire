-- Aspire: cloud reminders for linked users. Every minute pg_cron asks the app (via pg_net) to
-- deliver due bot_reminders: POST <site>/api/cron/reminders with header x-cron-secret.
--
-- No secret is in this file. Before (or after) applying it, store the values in Supabase Vault
-- once, from the SQL editor or execute_sql (never commit them):
--
--   select vault.create_secret('<the CRON_SECRET value from Vercel>', 'cron_secret');
--   select vault.create_secret('https://<NEXT_PUBLIC_SITE_URL host>', 'site_url');  -- optional
--
-- To rotate: select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new>');
-- The job reads both at run time, so rotating needs no reschedule. Without `cron_secret` the
-- job does nothing; without `site_url` it calls the production site below.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Re-runnable: replace the job if it already exists.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'aspire-reminders') then
    perform cron.unschedule('aspire-reminders');
  end if;
end
$$;

select cron.schedule(
  'aspire-reminders',
  '* * * * *',
  $job$
  select net.http_post(
    url := rtrim(
      coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'site_url' limit 1),
        'https://aspire-mn.vercel.app'
      ),
      '/'
    ) || '/api/cron/reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
  $job$
);
