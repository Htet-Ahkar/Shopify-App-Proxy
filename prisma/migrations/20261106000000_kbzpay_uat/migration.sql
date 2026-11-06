-- Additive only: legacy records have no gateway identity and retain their history.
ALTER TABLE "MockPaymentAttempt"
  ADD COLUMN "merchantOrderId" TEXT,
  ADD COLUMN "gatewayTransactionId" TEXT,
  ADD COLUMN gateway JSONB;
CREATE UNIQUE INDEX "MockPaymentAttempt_merchantOrderId_key" ON "MockPaymentAttempt"("merchantOrderId");
ALTER TABLE "MockPaymentAttempt" DROP CONSTRAINT "MockPaymentAttempt_environment_check";
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_environment_check"
  CHECK (environment IN ('simulation', 'uat'));
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_gateway_check"
  CHECK ((gateway IS NULL AND "merchantOrderId" IS NULL AND environment = 'simulation') OR
    (gateway IS NOT NULL AND jsonb_typeof(gateway) = 'object' AND "merchantOrderId" IS NOT NULL AND "merchantOrderId" ~ '^COCO_[a-f0-9]{32}$' AND
      gateway->>'mode' IS NOT NULL AND gateway->>'mode' = environment));
