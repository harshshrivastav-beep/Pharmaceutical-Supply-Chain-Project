# Pharmaceutical supply chain ER diagram

This is the proposed PostgreSQL design, represented by `backend/prisma/schema.prisma`. No migrations have been applied in this phase. See [DATA_MODEL.md](DATA_MODEL.md) for constraints and lifecycle semantics.

```mermaid
erDiagram
    Organization ||--o{ User : employs
    Organization ||--o{ Batch : manufactures
    Organization ||--o{ MedicineUnit : last_confirmed_holder
    Organization ||--o{ Shipment : source
    Organization ||--o{ Shipment : destination
    Organization o|--o{ SupplyChainEvent : acting_organization
    Medicine ||--o{ Batch : describes
    Batch ||--o{ MedicineUnit : serializes
    Shipment ||--o{ ShipmentUnit : manifest_and_receipt
    MedicineUnit ||--o{ ShipmentUnit : travels_in
    Shipment ||--o| DiscrepancyCase : investigated_by
    User ||--o{ DiscrepancyCase : reports
    User o|--o{ DiscrepancyCase : resolves
    DiscrepancyCase ||--o{ DiscrepancyUnit : missing_at_report
    ShipmentUnit ||--o{ DiscrepancyUnit : identifies_missing_unit
    User o|--o{ SupplyChainEvent : actor
    Shipment o|--o{ SupplyChainEvent : history
    Batch o|--o{ SupplyChainEvent : history
    MedicineUnit o|--o{ SupplyChainEvent : history
    DiscrepancyCase o|--o{ SupplyChainEvent : history
    SupplyChainEvent o|--o{ SupplyChainEvent : corrects
    SupplyChainEvent ||--o{ BlockchainAudit : submission_attempts
    MedicineUnit o|--o{ VerificationLog : matched_serial
    Batch o|--o{ VerificationLog : matched_batch
    VerificationLog o|--o| SupplyChainEvent : verification_event

    Organization {
      uuid id PK
      string name
      enum type
      boolean isActive
    }
    User {
      uuid id PK
      uuid organizationId FK
      string email UK
      string fullName
      enum role
    }
    Medicine {
      uuid id PK
      string name
      string genericName
      string dosage
      string form
      string category
    }
    Batch {
      uuid id PK
      string batchNumber UK
      uuid medicineId FK
      uuid manufacturerId FK
      date manufacturingDate
      date expiryDate
      int quantity
      enum status
    }
    MedicineUnit {
      uuid id PK
      string serialNumber UK
      uuid batchId FK
      uuid currentOrganizationId FK
      enum status
    }
    Shipment {
      uuid id PK
      string shipmentNumber UK
      uuid sourceOrganizationId FK
      uuid destinationOrganizationId FK
      int expectedQuantity
      int receivedQuantity "nullable until finalized"
      enum status
      timestamptz dispatchedAt
      timestamptz receivedAt
    }
    ShipmentUnit {
      uuid shipmentId PK,FK
      uuid medicineUnitId PK,FK
      boolean isExpected
      timestamptz receivedAt "nullable if not scanned"
    }
    DiscrepancyCase {
      uuid id PK
      uuid shipmentId FK,UK
      uuid reportedById FK
      uuid resolvedById FK
      int expectedQuantity
      int receivedQuantity
      int unexpectedQuantity
      int missingQuantity
      enum status
      string resolutionNotes
      timestamptz resolvedAt
    }
    DiscrepancyUnit {
      uuid discrepancyCaseId PK,FK
      uuid shipmentId FK
      uuid medicineUnitId PK,FK
    }
    SupplyChainEvent {
      uuid id PK
      enum eventType
      enum actorType
      uuid actorUserId FK
      uuid organizationId FK
      uuid shipmentId FK
      uuid batchId FK
      uuid medicineUnitId FK
      uuid discrepancyCaseId FK
      uuid verificationLogId FK,UK
      uuid correctsEventId FK
      int expectedQuantity
      int receivedQuantity
      int missingQuantity
      timestamptz occurredAt
      timestamptz recordedAt
      int payloadVersion
      text canonicalPayload
      string eventHash UK
    }
    BlockchainAudit {
      uuid id PK
      uuid eventId FK
      int attempt
      string transactionHash
      bigint blockNumber
      string network
      bigint chainId
      string contractAddress
      enum status
      timestamptz submittedAt
      timestamptz confirmedAt
    }
    VerificationLog {
      uuid id PK
      string requestedIdentifier
      uuid medicineUnitId FK
      uuid batchId FK
      enum result
      timestamptz verifiedAt
    }
```

Nullable timestamps and optional references are detailed in the schema. `DiscrepancyUnit` has composite foreign keys to both the case's `(id, shipmentId)` and the shipment unit's `(shipmentId, medicineUnitId)`: a missing unit cannot reference a different shipment accidentally. Transaction hashes are unique per chain; submission attempts are unique per event and attempt number.

The optional verification event relationship allows insertion within one transaction; the later verification service must create exactly one matching event for each completed log. Audit queries can use `(occurredAt, id)` as a stable sort key; this is not a blockchain total-order claim.
