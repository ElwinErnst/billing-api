import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac } from 'crypto';
import { ForbiddenException } from '@nestjs/common';

import { verifyMercadoPagoSignature } from './mercadopago-signature';

const SECRET = 'test-webhook-secret';
const TS = '1700000000';
const REQUEST_ID = 'req-123';
const DATA_ID = 'PAY-ABC';

function signatureHeader(
  dataId: string,
  requestId: string,
  ts: string,
  secret = SECRET,
): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

test('accepts a valid signature', () => {
  assert.doesNotThrow(() =>
    verifyMercadoPagoSignature(
      {
        dataId: DATA_ID,
        requestId: REQUEST_ID,
        signature: signatureHeader(DATA_ID, REQUEST_ID, TS),
      },
      SECRET,
    ),
  );
});

test('rejects a forged signature computed with the wrong secret', () => {
  const forged = signatureHeader(DATA_ID, REQUEST_ID, TS, 'attacker-secret');
  assert.throws(
    () =>
      verifyMercadoPagoSignature(
        { dataId: DATA_ID, requestId: REQUEST_ID, signature: forged },
        SECRET,
      ),
    ForbiddenException,
  );
});

test('rejects a captured signature replayed against a different payment id', () => {
  const captured = signatureHeader(DATA_ID, REQUEST_ID, TS);
  assert.throws(
    () =>
      verifyMercadoPagoSignature(
        { dataId: 'PAY-OTHER', requestId: REQUEST_ID, signature: captured },
        SECRET,
      ),
    ForbiddenException,
  );
});

test('rejects when signature, requestId, or dataId is missing', () => {
  const good = signatureHeader(DATA_ID, REQUEST_ID, TS);
  const partials = [
    { dataId: DATA_ID, requestId: REQUEST_ID }, // no signature
    { dataId: DATA_ID, signature: good }, // no requestId
    { requestId: REQUEST_ID, signature: good }, // no dataId
  ];
  for (const partial of partials) {
    assert.throws(
      () => verifyMercadoPagoSignature(partial, SECRET),
      ForbiddenException,
    );
  }
});

test('rejects a malformed signature header (no ts/v1)', () => {
  assert.throws(
    () =>
      verifyMercadoPagoSignature(
        { dataId: DATA_ID, requestId: REQUEST_ID, signature: 'garbage' },
        SECRET,
      ),
    ForbiddenException,
  );
});

test('rejects a v1 of a different length without crashing', () => {
  assert.throws(
    () =>
      verifyMercadoPagoSignature(
        { dataId: DATA_ID, requestId: REQUEST_ID, signature: `ts=${TS},v1=deadbeef` },
        SECRET,
      ),
    ForbiddenException,
  );
});

test('treats the payload id case-insensitively (MP lowercases it in the manifest)', () => {
  const sig = signatureHeader(DATA_ID, REQUEST_ID, TS);
  assert.doesNotThrow(() =>
    verifyMercadoPagoSignature(
      { dataId: DATA_ID.toUpperCase(), requestId: REQUEST_ID, signature: sig },
      SECRET,
    ),
  );
});
