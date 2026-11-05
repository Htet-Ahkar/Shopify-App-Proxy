-- CreateTable
CREATE TABLE "MockQuote" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "capabilityHash" TEXT NOT NULL,
    "customerId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockCheckout" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "capabilityHash" TEXT NOT NULL,
    "customerId" TEXT,
    "snapshot" JSONB NOT NULL,
    "delivery" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockPaymentAttempt" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'simulation',
    "initializationStatus" TEXT NOT NULL DEFAULT 'initializing',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerId" TEXT,
    "instructions" JSONB,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockPaymentEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockQuote_createdAt_idx" ON "MockQuote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MockCheckout_reference_key" ON "MockCheckout"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "MockCheckout_quoteId_key" ON "MockCheckout"("quoteId");

-- CreateIndex
CREATE INDEX "MockCheckout_status_createdAt_idx" ON "MockCheckout"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MockPaymentAttempt_idempotencyKey_key" ON "MockPaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MockPaymentAttempt_providerId_key" ON "MockPaymentAttempt"("providerId");

-- CreateIndex
CREATE INDEX "MockPaymentAttempt_checkoutId_createdAt_idx" ON "MockPaymentAttempt"("checkoutId", "createdAt");

-- CreateIndex
CREATE INDEX "MockPaymentAttempt_status_createdAt_idx" ON "MockPaymentAttempt"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "MockCheckout" ADD CONSTRAINT "MockCheckout_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "MockQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "MockCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockPaymentEvent" ADD CONSTRAINT "MockPaymentEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "MockPaymentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "MockCheckout" ADD CONSTRAINT "MockCheckout_status_check" CHECK (status IN ('pending','succeeded'));
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_status_check" CHECK (status IN ('pending','succeeded','failed','cancelled','expired'));
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_initialization_check" CHECK ("initializationStatus" IN ('initializing','ready','reconciliation_required'));
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_method_check" CHECK (method IN ('kbzpay','mmqr'));
ALTER TABLE "MockPaymentAttempt" ADD CONSTRAINT "MockPaymentAttempt_environment_check" CHECK (environment = 'simulation');
CREATE UNIQUE INDEX "MockPaymentAttempt_one_pending" ON "MockPaymentAttempt" ("checkoutId") WHERE status = 'pending';

ALTER TABLE "MockQuote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MockCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MockPaymentAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MockPaymentEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MockQuote", "MockCheckout", "MockPaymentAttempt", "MockPaymentEvent" FROM PUBLIC, anon, authenticated;

CREATE SCHEMA coco_mock_provider;
REVOKE ALL ON SCHEMA coco_mock_provider FROM PUBLIC, anon, authenticated;
CREATE TABLE coco_mock_provider.payments (
  attempt_id uuid PRIMARY KEY,
  provider_id text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('kbzpay','mmqr')),
  amount text NOT NULL CHECK (amount ~ '^[0-9]{1,12}\.[0-9]{2}$'),
  currency text NOT NULL CHECK (currency = 'MMK'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','cancelled','expired')),
  instructions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  scheduled_at timestamptz
);
CREATE INDEX mock_provider_due ON coco_mock_provider.payments (expires_at) WHERE status = 'pending';
CREATE INDEX mock_provider_scheduled ON coco_mock_provider.payments (scheduled_at) WHERE status = 'pending';
CREATE INDEX mock_provider_retention ON coco_mock_provider.payments (created_at);
CREATE TABLE coco_mock_provider.outbox (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mock_provider_outbox_due ON coco_mock_provider.outbox (next_at) WHERE delivered_at IS NULL;
CREATE INDEX mock_provider_outbox_retention ON coco_mock_provider.outbox (created_at);
ALTER TABLE coco_mock_provider.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coco_mock_provider.outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA coco_mock_provider FROM PUBLIC, anon, authenticated;

ALTER TABLE "MockPaymentAttempt" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "MockPaymentAttempt_checkoutId_sequence_key" ON "MockPaymentAttempt" ("checkoutId", "sequence");

ALTER TABLE "MockPaymentAttempt" ADD COLUMN "nextReconcileAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "MockPaymentAttempt_status_nextReconcileAt_idx" ON "MockPaymentAttempt" (status, "nextReconcileAt");
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coco_mock_provider_runtime') THEN
    CREATE ROLE coco_mock_provider_runtime NOLOGIN;
  END IF;
END
$roles$;
GRANT USAGE ON SCHEMA coco_mock_provider TO coco_mock_provider_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA coco_mock_provider TO coco_mock_provider_runtime;
CREATE POLICY mock_provider_service ON coco_mock_provider.payments TO coco_mock_provider_runtime USING (true) WITH CHECK (true);
CREATE POLICY mock_outbox_service ON coco_mock_provider.outbox TO coco_mock_provider_runtime USING (true) WITH CHECK (true);
