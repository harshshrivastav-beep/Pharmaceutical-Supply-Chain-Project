# Database and audit data model

## Phase boundary

This phase defines the complete initial data architecture and prepares its demo seed. It does not implement API routes, authentication, frontend pages, contract calls, or smart contracts. The existing project structure is preserved. The executable schema is [schema.prisma](../../backend/prisma/schema.prisma); the relationship diagram is [ERD.md](ERD.md).

Three distinct responsibilities remain in PostgreSQL:

1. **Operational records:** organizations, users, medicines, batches, serialized units, shipment manifests/receipts, and discrepancy cases.
2. **Append-only evidence:** SupplyChainEvent, VerificationLog, and the original missing-unit list. These are historical observations, not normal editable CRUD resources.
3. **Blockchain delivery metadata:** BlockchainAudit tracks submission attempts and confirmations for selected events. It does not replace the original event or indicate success merely because a job exists.

## Entities and why they exist

| Entity | Purpose and main fields |
| --- | --- |
| Organization | A manufacturer, distributor, pharmacy, or administrative organization. Name, type, active flag, creation/update times. An ADMIN organization is administrative, not an inventory destination. |
| User | Staff identity with full name, unique normalized email, organization, role, and active flag. No password, session, token, or authentication implementation is added. Disable staff instead of deleting referenced identities. |
| Medicine | Product description: medicine name, generic name, dosage/strength, form, category. Category/form are text to avoid an unnecessary drug taxonomy. One catalog medicine can have many manufacturing batches. |
| Batch | Globally unique batch number, medicine, manufacturer, manufacturing/expiry dates, package quantity, and status. Its manufacturer must have MANUFACTURER type. Quantity means serialized packages, not tablets or milligrams. |
| MedicineUnit | One serialized package with globally unique serial, batch, status, and last confirmed organization. Its medicine and manufacturer are obtained through the batch rather than duplicated. |
| Shipment | One transport leg from source to destination, unique number, frozen manifest quantity, finalized received quantity, status, and dispatch/receipt times. A downstream distributor-to-pharmacy leg is another shipment that can reference the same units. |
| ShipmentUnit | Explicit manifest/receipt join, uniquely identified by shipment and unit. `isExpected=true` means on the manifest; `receivedAt` means actually scanned. A known off-manifest unit can be recorded with `isExpected=false` and a receipt timestamp. No duplicate scan can create a second join row for that unit in the same shipment. |
| SupplyChainEvent | Immutable historical action or observation with event type, actor context, optional business references, quantity snapshots, occurrence/recording times, canonical payload, and SHA-256 hash. Related case/verification references make dispute and public-check history traceable. |
| BlockchainAudit | One submission attempt for an event. Stores chain ID, network label, contract address, nullable transaction hash/block, status, attempt number, submission/confirmation times, and failure reason. No row is needed for an event not selected for anchoring. |
| DiscrepancyCase | One investigation per finalized shipment receipt, holding frozen observed quantities, reporter, status, resolution notes, resolver, and timestamps. No field labels any participant as a thief or assumes tampering. |
| DiscrepancyUnit | Small additional join table for the exact serialized units missing when the case was opened. Composite foreign keys prove the unit belongs to that case's shipment. This is preferable to an unvalidated array/JSON list of IDs. |
| VerificationLog | An anonymous serial lookup: normalized requested identifier, time, result, matched unit/batch when found. Unknown serials remain representable with null foreign keys. No consumer name, IP, email, device identifier, or location is stored. |

## Keys, dates, indexes, and deliberate snapshots

Internal IDs are UUIDs. Business batch/shipment/serial identifiers are globally unique, trimmed, uppercase identifiers by application convention. Emails are trimmed and lowercased before writing; the planned SQL adds a matching check. PostgreSQL's ordinary unique constraints are case-sensitive, so the future input boundary must enforce the documented normalization.

Manufacturing and expiry are date-only values (`date`). Event and operational times use `timestamptz(3)` and UTC in the application. For this demo design, a product remains within its date window through the labelled expiry date in UTC; future requirements must confirm the intended business timezone. Expiry is calculated, not a stored status that becomes stale overnight.

Operational entities have creation/update timestamps. Events use `occurredAt` and `recordedAt` with no `updatedAt`. Verification history uses `verifiedAt`. Relations use `onDelete: Restrict` and `onUpdate: Restrict` to protect references. Archive/deactivate entities where supported rather than cascading away evidence.

Unique constraints already index batch number, shipment number, serial number, email, and event hash. Additional indexes support organization/status queues, medicine/manufacturer batches, expiry review, unit transfer history, chronological event lookup by shipment/batch/unit/organization, pending blockchain attempts, open cases, and serial/batch/time verification searches. Avoid redundant indexes duplicating a unique index.

Quantity snapshots are intentional duplication: Shipment stores its frozen expected total and final receipt total; DiscrepancyCase stores the original investigation quantities; events preserve historical values. Counts must reconcile to normalized ShipmentUnit/DiscrepancyUnit rows. VerificationLog retains the matched batch for historical queries; its batch must match the selected unit. Canonical event payloads intentionally snapshot hash input so later changes to names or operational status do not change earlier evidence.

## Enums and transitions

| Enum | Values and meaning |
| --- | --- |
| OrganizationType | MANUFACTURER, DISTRIBUTOR, PHARMACY, ADMIN |
| UserRole | ADMIN, MANUFACTURER_OPERATOR, DISTRIBUTOR_OPERATOR, PHARMACY_OPERATOR; role must match organization type |
| BatchStatus | CREATED → RELEASED; QUARANTINED and RECALLED record restrictions. Expiry is derived separately. |
| UnitStatus | AVAILABLE → IN_TRANSIT → AVAILABLE at receipt; MISSING for unresolved absence; DISPENSED for pharmacy issue; QUARANTINED/RECALLED prevent normal onward movement |
| ShipmentStatus | DRAFT → DISPATCHED → RECEIVED or RECEIVED_WITH_DISCREPANCY; only DRAFT may become CANCELLED |
| DiscrepancyStatus | OPEN → UNDER_REVIEW → RESOLVED, or OPEN → RESOLVED with evidence; resolution does not erase the original shortage |
| ActorType | USER (identified staff and organization), SYSTEM (no fake user), PUBLIC (anonymous verification; no organization or user) |
| EventType | BATCH_CREATED, SHIPMENT_CREATED, SHIPMENT_DISPATCHED, SHIPMENT_RECEIVED, SHIPMENT_DISCREPANCY, SHIPMENT_TRANSFERRED, PHARMACY_RECEIVED, VERIFICATION_PERFORMED, DISPUTE_OPENED, DISPUTE_RESOLVED, EVENT_CORRECTED |
| BlockchainStatus | PENDING → SUBMITTED → CONFIRMED; FAILED captures rejection/revert/drop after reconciliation. A new attempt row is used for retries. Confirmation is a policy decision, not simply a non-null transaction hash. |
| VerificationResult | RECORD_FOUND, NOT_FOUND, EXPIRED, RECALLED, NOT_ELIGIBLE |

`SHIPMENT_TRANSFERRED` describes confirmed custody movement for a leg; `SHIPMENT_RECEIVED` describes receipt closure. `PHARMACY_RECEIVED` is a pharmacy-specific receipt observation, not an extra movement or shipment. Later analytics must not sum these different events as separate shipments. Authoritative quantities come from operational relations.

Verification uses serialized package IDs only in the initial design. An input QR code will carry that serial. Batch-only/product-catalog search is outside this public verification operation. Suggested result precedence: NOT_FOUND, RECALLED (batch or unit), EXPIRED, NOT_ELIGIBLE (unreleased/restricted/missing/in-transit or not at pharmacy), then RECORD_FOUND. Dispensed packages may still be checked by their consumer; repeated checks are legitimate. RECORD_FOUND means a record matched and its stored state passed the check; it cannot prove physical authenticity or defeat copied serials. No on-chain verification success is claimed without a confirmed matching audit.

## Receiving and the 100 → 95 example

The demo has three organizations, three staff users, two medicine descriptions, one released batch, and 100 packages `PAR-001` through `PAR-100`.

1. Manufacturer creates batch `DEMO-PAR-2026-001` and shipment `DEMO-SHP-2026-001` to the distributor. Its 100 ShipmentUnit rows all have `isExpected=true`.
2. Receipt confirms `PAR-001` through `PAR-095`: 95 rows get `receivedAt`; those units have AVAILABLE status and the distributor as current organization.
3. `PAR-096` through `PAR-100` have no receipt scan. Their status is MISSING and their last confirmed holder remains the manufacturer. **This is not a claim that they physically remain there or that the manufacturer caused the shortage.**
4. Shipment has expectedQuantity=100, receivedQuantity=95, status=RECEIVED_WITH_DISCREPANCY, and dispatch/receipt timestamps.
5. The OPEN case stores expected=100, received=95, unexpected=0, missing=5 and five DiscrepancyUnit rows. Resolver, resolution timestamp, and notes are null while unresolved.
6. Separate receipt, discrepancy, and dispute events preserve the observations and hashes. The eight seeded events include batch creation, shipment creation, dispatch, receipt, discrepancy, dispute opening, and two anonymous verifications.

A missing count is **not always `max(expected - totalReceived, 0)`**. A receipt of 95 expected units plus five unexpected units still misses five expected packages. Use:

```text
receivedExpected = count(isExpected AND receivedAt IS NOT NULL)
unexpected       = count(NOT isExpected AND receivedAt IS NOT NULL)
receivedTotal    = receivedExpected + unexpected
missing          = expected - receivedExpected
```

A known unexpected serial gets a separate off-manifest ShipmentUnit row; it must not be relabelled as expected to hide a shortage. An unrecognized serial has no valid MedicineUnit foreign key: the future receiver must reject it for inventory/custody and may record its bounded identifier as an observation in an event. It does not fabricate a product record. Unexpected known units require investigation and must not automatically acquire sellable status.

Receipt is finalized once per shipment in this initial design; scans may accumulate before closure, but receivedQuantity is null until closure. One discrepancy case summarizes that receipt, including overage or mixed mismatch. Later recovery is represented by new events and case resolution, preserving original manifest/receipt and missing-at-report snapshots. Repeated partial deliveries/returns are not implemented; new transport legs use new shipments.

## Append-only evidence and hash contract

The schema alone cannot enforce append-only writes. [CONSTRAINTS.sql](CONSTRAINTS.sql) prepares PostgreSQL checks and triggers for the first reviewed migration. It rejects UPDATE, DELETE, and TRUNCATE on SupplyChainEvent, VerificationLog, and DiscrepancyUnit, and protects original discrepancy quantities/identity. It is not applied yet. Provision a non-owner runtime database role with SELECT/INSERT only on history tables. A table owner/superuser can bypass such controls; a local database by itself is not an independently trusted audit system.

Corrections insert a new EVENT_CORRECTED event with `correctsEventId`, actor, reason and corrected observation in its payload. Never update an old event or recompute its historical hash. Old evidence remains available; queries can show its correction chain. Resolution updates the operational case status and appends DISPUTE_RESOLVED in the same transaction. Original missing IDs and quantities remain intact even if units are subsequently found.

Payload version 1 is UTF-8 JSON with recursively lexicographically sorted object keys, no whitespace, stable array order, integer quantities, explicit null references, ISO UTC timestamps with milliseconds, and no undefined values. Include event ID, type, actor type/IDs, all related IDs, quantity snapshots, both timestamps, version, and relevant details. The hash is lowercase hexadecimal SHA-256 of the **exact stored canonicalPayload bytes**. `eventSnapshot` in the demo fixture illustrates the contract and is tested; it is not an implemented API service. Sort any set-valued unit-ID list deterministically before creating new production payloads.

PostgreSQL's planned check validates hash-to-payload consistency. Before inserting, the future backend must also ensure queryable event columns equal their payload values, actor organization is valid at event time, and linked batch/unit/shipment/case references agree. Never reconstruct old payloads by joining mutable current records. Actor affiliation is an event-time snapshot, so future staff transfers must not rewrite previous events.

## Blockchain metadata boundary

Later, a contract will receive an event identifier/version and cryptographic event hash, with only minimal agreed metadata. Full medicine records, manifests, quantities, staff details, discrepancy notes, and consumer logs stay in PostgreSQL. A hash proves a match to recorded bytes, not the truth of a physical receipt.

Each BlockchainAudit belongs to exactly one SupplyChainEvent. Multiple attempts preserve retry history; `(eventId, attempt)` is unique and `(chainId, transactionHash)` is unique for non-null hashes. A local reset invalidates old confirmations and must be handled explicitly in development. Use integer chain IDs and bigint block numbers (convert bigint to decimal strings in later JSON APIs). Addresses/hashes are normalized lowercase hex.

There is no fake transaction, address, or confirmed row in the seed. A later worker may create PENDING metadata only after a real network/contract destination is configured. Persist the event and operational change atomically in PostgreSQL, then submit/reconcile separately. Never claim the database transaction and blockchain transaction are one atomic commit. Do not blindly resend on uncertain RPC timeouts; reconcile transaction status first.

## Enforcement responsibilities before APIs

| Enforcement layer | Rules |
| --- | --- |
| Prisma-generated database constraints | UUID PKs, unique identifiers, required fields, enums, foreign keys with restricted deletion, composite membership of missing units, one case per receipt |
| Prepared migration SQL | Positive/nonnegative quantities, valid dates, different shipment parties, status/timestamp consistency, case arithmetic and resolution completeness, actor requirements, hash format/hash-to-payload check, chain metadata shape, append-only protections |
| Future transactional backend rules | Manufacturer organization type; role/type compatibility; allowed manufacturer→distributor→pharmacy route; no ADMIN inventory; enough serialized units before batch release; manifest/count reconciliation; unique active shipment per unit; source matches last confirmed holder; received unit belongs to expected batch when batch-linked; verification unit/batch consistency; missing list equals original missing scans; permissions; allowed state transitions; receipt/actor/event payload consistency |

Cross-row aggregates are not enforced by Prisma's scalar schema. Before shipping business writes, use a database transaction, lock the affected unit/shipment rows (or serializable transactions with retries), and reject conflicting dispatch/receipt attempts. Atomicity alone at default isolation does not prevent concurrent double-dispatch. No API currently exists that claims to enforce these rules. Add deferred database triggers for aggregate invariants if direct database writers will be supported.

## Seed preparation and verification

The JavaScript seed uses matching Prisma Client and PostgreSQL adapter 7.10.0. `prisma-client-js` is deliberately used for JavaScript output with this installed Prisma version. The generated client is ignored by Git. All schema, seed and configuration source remains JavaScript/Prisma; no frontend or server route uses the client yet.

From the project root (use the npm workaround in SETUP.md if needed):

```powershell
npm run db:validate
npm run db:generate
node --test backend/prisma/seed.test.js
node backend/prisma/seed.js --dry-run
```

These commands do not migrate or seed a database. The dry run previews exact quantities; tests check serial membership, custody, deterministic hash snapshots, and anonymous/reference consistency.

**Do not run `npm run db:seed` until the first migration and constraint supplement have been reviewed and applied to a dedicated local development database.** This phase prepares seed data but does not load it. The seed is restricted to localhost and rejects NODE_ENV=production. It writes the entire fixture in one transaction with an advisory lock. A stable event marker makes complete reruns no-ops; existing operational changes are preserved. Identifier collisions abort rather than updating unrelated data. Demo v1 is immutable; use a new explicitly versioned seed for later demo changes, not edits to historical seeded events.

The next database phase must generate the initial migration with `--create-only`, append/review CONSTRAINTS.sql, inspect all SQL, apply it, then run the seed twice and test database-level constraints, immutability, and rollback. Never use `db push` as a shortcut that omits these checks. No manual CREATE TABLE statements are required from the user.

Current verification: schema validation, client generation, all three fixture tests, and the no-write seed preview passed. The existing local configuration also passed an authenticated read-only `SELECT 1`. No credentials were modified or exposed. A working connection is confirmed, but this does not establish that schema migrations or demo data exist. The SQL supplement and live seed remain untested against tables until the next requested phase.

## Assumptions

- Each unit is one package; batch and shipment quantities count those packages.
- Identifiers are globally unique within this student project; units are serialized before release/dispatch.
- A shipment may contain multiple batches. Event batchId is populated only when the event relates to a single batch; detailed unit lists remain in its payload.
- One finalized receipt/case per shipment; later recovery does not erase receipt history.
- The current organization is the last confirmed custodian, not live physical location.
- Public consumers have no User or Organization row; staff and administrators do.
- No admin organization/user is seeded because the requested demo involves only the three supply participants; the model supports one later.
- The demo pharmacy exists but has not yet received stock. Distributor-to-pharmacy movement is represented by the same Shipment/ShipmentUnit design and is not fabricated as completed demo history.
- No migration, live seed, API, authentication, frontend, or smart contract implementation is part of this deliverable.
