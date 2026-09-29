# Architecture foundation

## Scope

The planned workflow is Manufacturer → Distributor → Pharmacy → Consumer verification. Foundation and database design are prepared. There are no business endpoints, migrated tables from this work, dashboard features, or deployed contracts. See [data model](../database/DATA_MODEL.md) and [ERD](../database/ERD.md) for the current design.

## Boundaries

```text
Frontend (React + Vite)
    │ REST requests and responses
    ▼
Backend API (Node.js + Express)
    ├── Services → Repositories → Prisma → PostgreSQL
    └── Blockchain service → Smart contract → Hardhat / local EVM
```

### Frontend

React owns presentation, interaction, and UI state. `services/api/` will contain HTTP calls. Components are grouped by common UI, dashboard, batches, shipments, audit, and verification. Pages and layouts compose them. No database client, blockchain provider, contract ABI, signing key, or authoritative business rule belongs in frontend code.

The development Vite server forwards `/api` to Express. Native browser fetch will be sufficient initially; no HTTP or UI library is necessary yet.

### Backend API

Routes will map URLs to controllers. Controllers will translate HTTP input/output, validators will check input, and services will enforce workflow rules. Repositories will isolate Prisma queries. Middleware will handle shared request behavior. `app.js` constructs Express independently of `server.js`, which owns the listening process.

`models/` is reserved for domain-level representations if needed; Prisma's schema remains the source of database models. Do not introduce a second ORM or duplicate persisted model definitions.

Configuration loads `backend/.env` through Node's built-in loader. This phase validates the port only; database and contract settings are not required to start the empty server. Secrets must stay on the server.

### PostgreSQL and Prisma

PostgreSQL will be the source of operational data and analytics queries. `prisma/schema.prisma` now defines the 11 requested core entities plus DiscrepancyUnit for a normalized missing-serial list. Prisma 7 reads the connection URL through `prisma.config.js`.

Prisma Client and the PostgreSQL adapter are installed and the client is generated. No migration or live seed was applied in the design phase. The prepared seed has real inserts and a no-write dry run. Use Prisma migrations for schema changes, include the prepared SQL checks/append-only triggers, and retain migration files in source control. Operational records, immutable event history, and blockchain submission metadata remain separate models.

### Blockchain boundary

Backend `src/blockchain/` will wrap smart-contract calls. The final contract belongs in `blockchain/contracts/`, deployment scripts in `scripts/`, tests in `test/`, and non-secret deployment metadata in `deployments/`.

Hardhat provides a disposable local EVM for development. The project config pins Solidity 0.8.28 for future contracts. No contract, deployment, signing integration, token, or wallet feature exists yet.

PostgreSQL stores operational records; blockchain stores selected important audit events. Candidate events such as a batch creation or custody change must be reviewed before implementation. Avoid recording full records or personal data on-chain. Store only approved minimal references or hashes, with transaction references in operational storage as designed later.

A database transaction and a blockchain transaction cannot be committed atomically as one transaction. The implementation design must define submission status, retries, duplicate prevention, confirmation, and reconciliation before claiming an event is recorded. This foundation does not implement or imply that guarantee. A local single-node chain demonstrates audit mechanics, not independent production trust.

## Out of scope

GPS, live maps, IoT, cryptocurrency features, NFTs, AI fraud detection, production deployment, authentication implementation, business API endpoints, live database migration/seeding, and the final contract are excluded from this design phase.

## Next design gate

Review the data-model assumptions, prepare the first migration with its SQL supplement, and test database constraints and seed reruns before implementing business APIs. Further implementation begins only after the user requests the next phase.

## Configuration references

- [Vite getting started](https://vite.dev/guide/)
- [Prisma configuration reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference) (supports JavaScript configuration)
- [Hardhat configuration](https://hardhat.org/docs/reference/configuration)
