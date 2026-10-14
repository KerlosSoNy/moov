-- Supabase Cron → notifications-dispatch Edge Function, every minute.
-- The function decides what is due (campaign times live in
-- notification_campaigns), so editing a campaign never requires touching this
-- job. A tick with nothing to do is a few cheap queries.
--
-- Requires two Vault secrets, created once per project (not in migrations, so
-- they never reach git):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notifications-dispatch', 'notifications_dispatch_url');
--   select vault.create_secret('<long random string, same as CRON_SECRET>', 'notifications_cron_secret');
-- Until they exist the job posts nowhere and logs a null-URL error in cron.job_run_details.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
    'notifications-dispatch',
    '* * * * *',
    $$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_dispatch_url'),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
    );
    $$
);

-- Delivery rows are a log; keep 90 days. Processed outbox events: 30 days.
select cron.schedule(
    'notifications-cleanup',
    '17 3 * * *',
    $$
    delete from public.notification_deliveries where created_at < now() - interval '90 days';
    delete from public.notification_events where status = 'processed' and processed_at < now() - interval '30 days';
    $$
);
