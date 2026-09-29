-- DESIGN ARTIFACT ONLY: not applied and not an executable migration yet.
-- Append to the first Prisma-generated migration after reviewing DATA_MODEL.md.
-- Keep these constraints in migrations; Prisma schema alone cannot express them.

ALTER TABLE "Batch" ADD CONSTRAINT "batch_dates_quantity_check"
  CHECK ("quantity" > 0 AND "expiryDate" > "manufacturingDate");

ALTER TABLE "User" ADD CONSTRAINT "user_email_normalized_check"
  CHECK ("email" = lower(btrim("email")) AND length("email") > 3);

ALTER TABLE "Shipment" ADD CONSTRAINT "shipment_quantities_check"
  CHECK ("expectedQuantity" > 0 AND ("receivedQuantity" IS NULL OR "receivedQuantity" >= 0)
    AND "sourceOrganizationId" <> "destinationOrganizationId");
ALTER TABLE "Shipment" ADD CONSTRAINT "shipment_lifecycle_check" CHECK (
  ("status" IN ('DRAFT', 'CANCELLED') AND "dispatchedAt" IS NULL AND "receivedAt" IS NULL AND "receivedQuantity" IS NULL)
  OR ("status" = 'DISPATCHED' AND "dispatchedAt" IS NOT NULL AND "receivedAt" IS NULL AND "receivedQuantity" IS NULL)
  OR ("status" IN ('RECEIVED', 'RECEIVED_WITH_DISCREPANCY') AND "dispatchedAt" IS NOT NULL
      AND "receivedAt" IS NOT NULL AND "receivedAt" >= "dispatchedAt" AND "receivedQuantity" IS NOT NULL)
);
ALTER TABLE "Shipment" ADD CONSTRAINT "shipment_clean_receipt_check"
  CHECK ("status" <> 'RECEIVED' OR "receivedQuantity" = "expectedQuantity");

ALTER TABLE "ShipmentUnit" ADD CONSTRAINT "unexpected_unit_received_check"
  CHECK ("isExpected" OR "receivedAt" IS NOT NULL);

ALTER TABLE "DiscrepancyCase" ADD CONSTRAINT "case_quantities_check" CHECK (
  "expectedQuantity" > 0 AND "receivedQuantity" >= 0 AND "missingQuantity" >= 0
  AND "unexpectedQuantity" >= 0 AND "unexpectedQuantity" <= "receivedQuantity"
  AND "missingQuantity" = "expectedQuantity" - ("receivedQuantity" - "unexpectedQuantity")
  AND ("missingQuantity" > 0 OR "unexpectedQuantity" > 0)
);
ALTER TABLE "DiscrepancyCase" ADD CONSTRAINT "case_resolution_check" CHECK (
  ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolvedAt" >= "createdAt"
    AND "resolvedById" IS NOT NULL AND "resolutionNotes" IS NOT NULL AND length(btrim("resolutionNotes")) > 0)
  OR ("status" <> 'RESOLVED' AND "resolvedAt" IS NULL AND "resolvedById" IS NULL AND "resolutionNotes" IS NULL)
);

ALTER TABLE "SupplyChainEvent" ADD CONSTRAINT "event_actor_check" CHECK (
  ("actorType" = 'USER' AND "actorUserId" IS NOT NULL AND "organizationId" IS NOT NULL)
  OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL)
  OR ("actorType" = 'PUBLIC' AND "actorUserId" IS NULL AND "organizationId" IS NULL AND "eventType" = 'VERIFICATION_PERFORMED')
);
ALTER TABLE "SupplyChainEvent" ADD CONSTRAINT "event_quantities_check" CHECK (
  ("expectedQuantity" IS NULL OR "expectedQuantity" >= 0)
  AND ("receivedQuantity" IS NULL OR "receivedQuantity" >= 0)
  AND ("missingQuantity" IS NULL OR "missingQuantity" >= 0)
);
ALTER TABLE "SupplyChainEvent" ADD CONSTRAINT "event_correction_check" CHECK (
  ("eventType" = 'EVENT_CORRECTED' AND "correctsEventId" IS NOT NULL AND "correctsEventId" <> "id")
  OR ("eventType" <> 'EVENT_CORRECTED' AND "correctsEventId" IS NULL)
);
ALTER TABLE "SupplyChainEvent" ADD CONSTRAINT "event_hash_check" CHECK (
  "payloadVersion" = 1 AND "eventHash" ~ '^[0-9a-f]{64}$'
  AND "eventHash" = encode(sha256(convert_to("canonicalPayload", 'UTF8')), 'hex')
  AND jsonb_typeof("canonicalPayload"::jsonb) = 'object'
  AND "recordedAt" >= "occurredAt"
);

ALTER TABLE "BlockchainAudit" ADD CONSTRAINT "blockchain_metadata_check" CHECK (
  "attempt" > 0 AND "chainId" > 0 AND ("blockNumber" IS NULL OR "blockNumber" >= 0)
  AND "contractAddress" ~ '^0x[0-9a-f]{40}$'
  AND ("transactionHash" IS NULL OR "transactionHash" ~ '^0x[0-9a-f]{64}$')
  AND ("status" NOT IN ('SUBMITTED', 'CONFIRMED') OR ("transactionHash" IS NOT NULL AND "submittedAt" IS NOT NULL))
  AND ("status" <> 'CONFIRMED' OR ("blockNumber" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "confirmedAt" >= "submittedAt"))
  AND ("status" <> 'PENDING' OR ("transactionHash" IS NULL AND "blockNumber" IS NULL AND "submittedAt" IS NULL AND "confirmedAt" IS NULL))
  AND ("status" <> 'FAILED' OR ("failureReason" IS NOT NULL AND length(btrim("failureReason")) > 0))
);
ALTER TABLE "VerificationLog" ADD CONSTRAINT "verification_reference_check" CHECK (
  ("result" = 'NOT_FOUND' AND "medicineUnitId" IS NULL AND "batchId" IS NULL)
  OR ("result" <> 'NOT_FOUND' AND "medicineUnitId" IS NOT NULL AND "batchId" IS NOT NULL)
);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; record a new event instead', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER supply_chain_event_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "SupplyChainEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER verification_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "VerificationLog"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER discrepancy_unit_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "DiscrepancyUnit"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();

CREATE FUNCTION preserve_discrepancy_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."shipmentId", NEW."expectedQuantity", NEW."receivedQuantity", NEW."unexpectedQuantity", NEW."missingQuantity", NEW."reportedById", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id", OLD."shipmentId", OLD."expectedQuantity", OLD."receivedQuantity", OLD."unexpectedQuantity", OLD."missingQuantity", OLD."reportedById", OLD."createdAt") THEN
    RAISE EXCEPTION 'Original discrepancy evidence cannot be rewritten; append a correction event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER discrepancy_snapshot_immutable BEFORE UPDATE ON "DiscrepancyCase"
  FOR EACH ROW EXECUTE FUNCTION preserve_discrepancy_snapshot();

-- Before API implementation, provision a separate non-owner runtime role:
-- grant SELECT, INSERT only on SupplyChainEvent, VerificationLog, DiscrepancyUnit;
-- never grant TRUNCATE, table ownership, or the ability to disable triggers.
-- Add deferred reconciliation/type checks described in DATA_MODEL.md as needed.
