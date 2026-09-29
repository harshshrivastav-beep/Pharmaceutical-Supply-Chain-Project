import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildDemoData, canonicalize, eventSnapshot } from './demo-data.js';

test('receipt reconciles exact serials, quantities, and last confirmed custody', () => {
  const d = buildDemoData();
  assert.equal(new Set(d.units.map((u) => u.serialNumber)).size, 100);
  assert.equal(d.batch.quantity, d.units.length);
  assert.equal(d.shipmentUnits.filter((u) => u.isExpected).length, d.shipment.expectedQuantity);
  assert.equal(d.shipmentUnits.filter((u) => u.receivedAt).length, d.shipment.receivedQuantity);
  const missing = d.shipmentUnits.filter((u) => u.isExpected && !u.receivedAt);
  assert.equal(missing.length, d.discrepancy.missingQuantity);
  assert.deepEqual(missing.map((u) => u.medicineUnitId), d.missingUnits.map((u) => u.medicineUnitId));
  assert.deepEqual(d.units.slice(95).map((u) => u.serialNumber), ['PAR-096', 'PAR-097', 'PAR-098', 'PAR-099', 'PAR-100']);
  for (const unit of d.units) {
    assert.equal(unit.currentOrganizationId, unit.status === 'MISSING' ? d.shipment.sourceOrganizationId : d.shipment.destinationOrganizationId);
  }
});

test('audit snapshots are deterministic and change hashes when evidence changes', () => {
  const d = buildDemoData();
  assert.deepEqual(d, buildDemoData());
  for (const event of d.events) {
    assert.equal(event.eventHash, createHash('sha256').update(event.canonicalPayload).digest('hex'));
    const { canonicalPayload, eventHash, ...columns } = event;
    const { details, ...snapshot } = JSON.parse(canonicalPayload);
    assert.deepEqual(snapshot, columns);
    assert.equal(canonicalize(JSON.parse(canonicalPayload)), canonicalPayload);
  }
  const fields = { eventType: 'SHIPMENT_RECEIVED', occurredAt: '2026-09-22T09:00:00.000Z', receivedQuantity: 95 };
  assert.notEqual(eventSnapshot('test', fields).eventHash, eventSnapshot('test', { ...fields, receivedQuantity: 94 }).eventHash);
  assert.equal(canonicalize({ b: 2, a: 1 }), canonicalize({ a: 1, b: 2 }));
});

test('event actors and references exist; public verification has no fabricated identity', () => {
  const d = buildDemoData();
  for (const event of d.events) {
    if (event.actorType === 'USER') {
      const actor = d.users.find((u) => u.id === event.actorUserId);
      assert.ok(actor);
      assert.equal(actor.organizationId, event.organizationId);
    } else {
      assert.equal(event.actorUserId, null);
      assert.equal(event.organizationId, null);
    }
    if (event.shipmentId) assert.equal(event.shipmentId, d.shipment.id);
    if (event.batchId) assert.equal(event.batchId, d.batch.id);
    if (event.medicineUnitId) assert.ok(d.units.some((u) => u.id === event.medicineUnitId));
    if (event.verificationLogId) assert.ok(d.verificationLogs.some((v) => v.id === event.verificationLogId));
  }
  const unknown = d.verificationLogs.find((v) => v.result === 'NOT_FOUND');
  assert.equal(unknown.batchId, null);
  assert.equal(unknown.medicineUnitId, null);
});
