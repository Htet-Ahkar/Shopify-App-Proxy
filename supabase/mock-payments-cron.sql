-- Run only in the isolated preview database after configuring pg_cron, pg_net,
-- and Vault. These Vault entries contain the full app-host sweep URL and bearer
-- secret. Provision them privately; never insert actual credentials in this file.
-- Optional local expiry only. No provider dispatch, callbacks, reconciliation, or deletion.
SELECT cron.schedule(
  'coco-mock-payment-reconciliation',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'coco_mock_sweep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'coco_mock_sweep_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
-- Rollback: SELECT cron.unschedule('coco-mock-payment-reconciliation');
