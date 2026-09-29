import { createHash } from 'node:crypto';

// Stable demo identifiers make collision detection and safe reruns possible.
export function demoId(label) {
  const hex = createHash('sha256').update(`pharma-demo-v1:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Version 1: recursively sorted object keys; array order preserved; ISO UTC strings;
// no undefined, floating-point quantities, BigInt, or Date objects in payloads.
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  if (value === undefined || typeof value === 'bigint' || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new Error('Unsupported audit payload value');
  }
  return JSON.stringify(value);
}

export function eventSnapshot(label, fields, details = {}) {
  const event = {
    id: demoId(`event:${label}`), eventType: fields.eventType, actorType: fields.actorType ?? 'USER',
    actorUserId: null, organizationId: null, shipmentId: null, batchId: null,
    medicineUnitId: null, discrepancyCaseId: null, verificationLogId: null, correctsEventId: null,
    expectedQuantity: null, receivedQuantity: null, missingQuantity: null,
    payloadVersion: 1, ...fields, recordedAt: fields.occurredAt,
  };
  const canonicalPayload = canonicalize({ ...event, details });
  return { ...event, canonicalPayload, eventHash: createHash('sha256').update(canonicalPayload, 'utf8').digest('hex') };
}

export function buildDemoData() {
  const at = (day, hour = '09') => `2026-09-${day}T${hour}:00:00.000Z`;
  const manufacturerId = demoId('manufacturer');
  const distributorId = demoId('distributor');
  const pharmacyId = demoId('pharmacy');
  const manufacturerUserId = demoId('manufacturer-user');
  const distributorUserId = demoId('distributor-user');
  const batchId = demoId('batch');
  const shipmentId = demoId('shipment');
  const discrepancyCaseId = demoId('case');
  const organizations = [
    { id: manufacturerId, name: 'Demo Meridian Pharma', type: 'MANUFACTURER' },
    { id: distributorId, name: 'Demo Central Distribution', type: 'DISTRIBUTOR' },
    { id: pharmacyId, name: 'Demo Community Pharmacy', type: 'PHARMACY' },
  ].map((org) => ({ ...org, createdAt: at('19'), updatedAt: at('19') }));
  const users = organizations.map((org) => ({
    id: demoId(`${org.type.toLowerCase()}-user`), organizationId: org.id,
    fullName: `Demo ${org.type.toLowerCase()} operator`,
    email: `${org.type.toLowerCase()}@pharma-demo.example`, role: `${org.type}_OPERATOR`,
    createdAt: at('19'), updatedAt: at('19'),
  }));
  const medicines = [
    { id: demoId('paracetamol'), name: 'Demo Paracetamol 500', genericName: 'Paracetamol', dosage: '500 mg', form: 'Tablet', category: 'Analgesic' },
    { id: demoId('cetirizine'), name: 'Demo Cetirizine 10', genericName: 'Cetirizine', dosage: '10 mg', form: 'Tablet', category: 'Antihistamine' },
  ].map((medicine) => ({ ...medicine, createdAt: at('19'), updatedAt: at('19') }));
  const batch = {
    id: batchId, batchNumber: 'DEMO-PAR-2026-001', medicineId: medicines[0].id, manufacturerId,
    manufacturingDate: '2026-09-01T00:00:00.000Z', expiryDate: '2028-08-31T00:00:00.000Z',
    quantity: 100, status: 'RELEASED', createdAt: at('20'), updatedAt: at('20'),
  };
  const units = Array.from({ length: 100 }, (_, index) => ({
    id: demoId(`unit:${index + 1}`), serialNumber: `PAR-${String(index + 1).padStart(3, '0')}`,
    batchId, status: index < 95 ? 'AVAILABLE' : 'MISSING',
    currentOrganizationId: index < 95 ? distributorId : manufacturerId,
    createdAt: at('20'), updatedAt: at('22'),
  }));
  const shipment = {
    id: shipmentId, shipmentNumber: 'DEMO-SHP-2026-001', sourceOrganizationId: manufacturerId,
    destinationOrganizationId: distributorId, expectedQuantity: 100, receivedQuantity: 95,
    status: 'RECEIVED_WITH_DISCREPANCY', dispatchedAt: at('21'), receivedAt: at('22'),
    createdAt: at('20', '10'), updatedAt: at('22'),
  };
  const shipmentUnits = units.map((unit, index) => ({
    shipmentId, medicineUnitId: unit.id, isExpected: true,
    receivedAt: index < 95 ? at('22') : null, createdAt: at('20', '10'),
  }));
  const discrepancy = {
    id: discrepancyCaseId, shipmentId, expectedQuantity: 100, receivedQuantity: 95,
    unexpectedQuantity: 0, missingQuantity: 5, reportedById: distributorUserId,
    status: 'OPEN', createdAt: at('22', '10'), updatedAt: at('22', '10'),
  };
  const missingUnits = units.slice(95).map((unit) => ({ discrepancyCaseId, shipmentId, medicineUnitId: unit.id }));
  const verificationLogs = [
    { id: demoId('verification:known'), requestedIdentifier: 'PAR-001', verifiedAt: at('23'), result: 'NOT_ELIGIBLE', medicineUnitId: units[0].id, batchId },
    { id: demoId('verification:unknown'), requestedIdentifier: 'DEMO-UNKNOWN-001', verifiedAt: at('23', '10'), result: 'NOT_FOUND', medicineUnitId: null, batchId: null },
  ];
  const manufacturerActor = { actorUserId: manufacturerUserId, organizationId: manufacturerId };
  const receiverActor = { actorUserId: distributorUserId, organizationId: distributorId };
  const receipt = { ...receiverActor, shipmentId, batchId, expectedQuantity: 100, receivedQuantity: 95, missingQuantity: 5 };
  const events = [
    eventSnapshot('batch', { ...manufacturerActor, eventType: 'BATCH_CREATED', batchId, expectedQuantity: 100, occurredAt: at('20') }, { batchNumber: batch.batchNumber, serialNumbers: units.map((unit) => unit.serialNumber) }),
    eventSnapshot('shipment', { ...manufacturerActor, eventType: 'SHIPMENT_CREATED', shipmentId, batchId, expectedQuantity: 100, occurredAt: at('20', '10') }, { sourceOrganizationId: manufacturerId, destinationOrganizationId: distributorId, expectedUnitIds: units.map((unit) => unit.id) }),
    eventSnapshot('dispatch', { ...manufacturerActor, eventType: 'SHIPMENT_DISPATCHED', shipmentId, batchId, expectedQuantity: 100, occurredAt: at('21') }),
    eventSnapshot('receipt', { ...receipt, eventType: 'SHIPMENT_RECEIVED', occurredAt: at('22') }, { receivedUnitIds: units.slice(0, 95).map((unit) => unit.id) }),
    eventSnapshot('discrepancy', { ...receipt, eventType: 'SHIPMENT_DISCREPANCY', discrepancyCaseId, occurredAt: at('22', '10') }, { missingUnitIds: units.slice(95).map((unit) => unit.id), unexpectedUnitIds: [], observation: 'Five manifest units were not scanned at receipt; cause undetermined.' }),
    eventSnapshot('dispute', { ...receipt, eventType: 'DISPUTE_OPENED', discrepancyCaseId, occurredAt: at('22', '11') }, { observation: 'Receipt discrepancy opened for investigation. No attribution of fault.' }),
    ...verificationLogs.map((log, index) => eventSnapshot(`verification:${index}`, {
      eventType: 'VERIFICATION_PERFORMED', actorType: 'PUBLIC', verificationLogId: log.id,
      batchId: log.batchId, medicineUnitId: log.medicineUnitId, occurredAt: log.verifiedAt,
    }, { requestedIdentifier: log.requestedIdentifier, result: log.result })),
  ];
  return { organizations, users, medicines, batch, units, shipment, shipmentUnits, discrepancy, missingUnits, verificationLogs, events };
}
