import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL migration enforces private records, payment claims, RLS and cascade cleanup', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA shopify; SET search_path TO shopify;');
    await pg.exec(fs.readFileSync('prisma/migrations/20261105000000_mock_checkout/migration.sql', 'utf8'));
    const quote = randomUUID(), checkout = randomUUID(), first = randomUUID(), second = randomUUID();
    await pg.query('INSERT INTO "MockQuote" (id,shop,"capabilityHash",snapshot,"expiresAt") VALUES ($1,$2,$3,$4,now()+interval \'5 minutes\')', [quote, 'coco.test', 'hash', '{}']);
    await pg.query('INSERT INTO "MockCheckout" (id,reference,"quoteId",shop,"capabilityHash",snapshot,delivery,"expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval \'15 minutes\')', [checkout, 'COCO-MOCK-TEST', quote, 'coco.test', 'hash', '{}', '{}']);
    const insertAttempt = (id, sequence, status = 'pending') => pg.query('INSERT INTO "MockPaymentAttempt" (id,"checkoutId","idempotencyKey","requestHash",method,amount,currency,"expiresAt",sequence,status) VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval \'15 minutes\',$8,$9)', [id, checkout, id, 'hash', 'mmqr', '100.00', 'MMK', sequence, status]);
    await insertAttempt(first, 1);
    await assert.rejects(insertAttempt(second, 2), e => e.code === '23505' && e.message.includes('one_pending'));
    await pg.query('UPDATE "MockPaymentAttempt" SET status=$1 WHERE id=$2', ['failed', first]);
    await insertAttempt(second, 2);
    await assert.rejects(insertAttempt(randomUUID(), 2, 'failed'), e => e.code === '23505');
    await assert.rejects(pg.query('UPDATE "MockPaymentAttempt" SET environment=$1 WHERE id=$2', ['prod', first]), e => e.code === '23514');
    await pg.query('INSERT INTO "MockPaymentEvent" (id,"attemptId",status) VALUES ($1,$2,$3)', ['event-1', first, 'failed']);
    await assert.rejects(pg.query('INSERT INTO "MockPaymentEvent" (id,"attemptId",status) VALUES ($1,$2,$3)', ['event-1', first, 'failed']), e => e.code === '23505');
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`SET ROLE ${role}`);
      await assert.rejects(pg.query('SELECT * FROM shopify."MockCheckout"'), e => e.code === '42501');
      await assert.rejects(pg.query('SELECT * FROM coco_mock_provider.payments'), e => e.code === '42501');
      await pg.exec('RESET ROLE');
    }
    await pg.exec('SET ROLE coco_mock_provider_runtime');
    await pg.query('INSERT INTO coco_mock_provider.payments (attempt_id,provider_id,method,amount,currency,expires_at,instructions) VALUES ($1,$2,$3,$4,$5,now()+interval \'15 minutes\',$6)', [first, 'MOCK-TEST', 'mmqr', '100.00', 'MMK', '{}']);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM coco_mock_provider.payments')).rows[0].n, 1);
    await assert.rejects(pg.query('SELECT * FROM shopify."MockCheckout"'), e => e.code === '42501');
    await pg.exec('RESET ROLE');
    await pg.query('DELETE FROM "MockQuote" WHERE id=$1', [quote]);
    for (const name of ['MockCheckout', 'MockPaymentAttempt', 'MockPaymentEvent']) assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "${name}"`)).rows[0].n, 0);
  } finally { await pg.close(); }
});
