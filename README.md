# Pharmaceutical Supply Chain Analytics Dashboard

A project foundation for tracing pharmaceutical products through Manufacturer → Distributor → Pharmacy → Consumer verification, with analytics and a blockchain-based audit trail.

**Current phase: database architecture prepared.** The Prisma schema defines 12 entities, including a normalized missing-unit join. The demo seed is prepared for 100 expected / 95 received units. No migrations or live seed have been applied in this phase. Frontend remains a placeholder; application API routes, authentication, and smart contracts remain unimplemented. The existing structure is preserved.

See [ERD](docs/database/ERD.md), [data model](docs/database/DATA_MODEL.md), and [prepared migration constraints](docs/database/CONSTRAINTS.sql).

## Architecture

```text
React frontend → Express REST API → Prisma → PostgreSQL (operational data)
                       └→ Backend blockchain service → Smart contract → Local EVM
```

The frontend will only present information and call the API. Business rules, database access, and blockchain communication belong in the backend. PostgreSQL will store operational records; the blockchain will record selected important audit events, not full operational records or sensitive data. See [architecture](docs/architecture/ARCHITECTURE.md).

## Stack and prerequisites

- Node.js 24.15.0 (use Node 24 consistently); npm 11.12.1.
- React 19.3.0, Vite 8.3.1, React Vite plugin 6.1.1.
- Express 5.2.1 and Prisma CLI 7.10.0 with PostgreSQL.
- Hardhat 3.18.0; Solidity compiler target 0.8.28.
- PostgreSQL 18.4 was detected locally; a database and development login must be configured.

Dependencies are pinned, with a root lockfile and npm workspaces. Prisma Client and its PostgreSQL adapter are installed at 7.10.0 for the database seed. No UI framework, wallet SDK, or contract interaction library is installed.

## Folder structure

```text
Pharmaceutical Supply Chain Blockchain/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/{common,dashboard,batches,shipments,audit,verification}/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/api/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── constants/
│   │   ├── styles/global.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── prisma/{schema.prisma,seed.js}
│   ├── src/
│   │   ├── config/env.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middleware/
│   │   ├── validators/
│   │   ├── models/
│   │   ├── blockchain/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── prisma.config.js
│   ├── .env.example
│   └── package.json
├── blockchain/
│   ├── contracts/
│   ├── scripts/
│   ├── test/
│   ├── deployments/
│   ├── hardhat.config.js
│   └── package.json
├── docs/
│   ├── architecture/ARCHITECTURE.md
│   ├── database/
│   ├── blockchain/
│   ├── screenshots/
│   └── SETUP.md
├── .env.example
├── .gitignore
├── .nvmrc
├── .node-version
├── README.md
├── package.json
└── package-lock.json
```

Empty planned folders contain `.gitkeep` so Git can preserve them. The existing root folder name is unchanged.

## Install and configure

Run from the project root in PowerShell:

```powershell
npm install
Copy-Item backend/.env.example backend/.env
notepad backend/.env
```

Copy the example only if `backend/.env` does not already exist. Set `DATABASE_URL` in **`backend/.env`** using your local PostgreSQL credentials. The root `.env.example` is a reference; root `.env` is not loaded. Never put database credentials or private keys in frontend files or `VITE_*` variables.

| Variable | Location | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` | PostgreSQL connection URL, including database name |
| `PORT` | `backend/.env` | Backend HTTP port, default 3000 |
| `BLOCKCHAIN_RPC_URL` | `backend/.env` | Local EVM URL, default `http://127.0.0.1:8545` |
| `CONTRACT_ADDRESS` | `backend/.env` | Empty until a later contract deployment |

Node's built-in environment loader is used; no dotenv dependency is needed. Backend startup does not connect to a database or blockchain in this phase.

**This machine has a broken npm launcher.** See the session-only workaround in [Windows setup](docs/SETUP.md#1-check-node-and-npm) before running the commands above.

## Start development

Open three terminals at the root and run one command in each:

```powershell
npm run dev:frontend
```

Open `http://127.0.0.1:5173`.

```powershell
npm run dev:backend
```

The backend listens on `http://127.0.0.1:3000`. `GET /` intentionally returns **404** because there are no application endpoints yet.

```powershell
npm run dev:blockchain
```

Hardhat serves local JSON-RPC at `http://127.0.0.1:8545`, chain ID 31337. Its displayed accounts are disposable local test accounts. Local chain state resets when the node is restarted. Stop each process with Ctrl+C.

Vite proxies future `/api` requests to port 3000. If you change `PORT`, update the development proxy in `frontend/vite.config.js`. Production hosting and routing are deferred.

## Database setup

Create a PostgreSQL development login and empty `pharma_supply_chain` database following [SETUP.md](docs/SETUP.md#3-prepare-postgresql). You do not need to manually create tables.

```powershell
npm run db:validate
npm run db:generate
node backend/prisma/seed.js --dry-run
```

Validation and client generation do not connect to or modify PostgreSQL. The seed now contains real demo inserts; dry-run mode previews them without writes. **Do not run `db:migrate` or `db:seed` yet.** The next phase must review an initial migration including `docs/database/CONSTRAINTS.sql`, then apply it and test the seed. Prisma will create tables; do not manually create them.

## Verification commands

From the root:

```powershell
npm run build
npm run check:backend
npm run db:validate
node --test backend/prisma/seed.test.js
node backend/prisma/seed.js --dry-run
npm run blockchain:compile
```

With no contracts, the final command only checks the Hardhat build setup; it is not a contract test. Verification results and limitations are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Troubleshooting

- **npm MODULE_NOT_FOUND or npm.ps1 failure:** use the workaround in SETUP.md. Reinstalling/repairing Node later can restore its normal launcher.
- **Port already in use:** stop the process using 5173, 3000, or 8545. Vite uses a strict port so it will not silently switch.
- **Backend browser shows Cannot GET /:** expected; application routes are out of scope for this phase.
- **Database authentication/connection error:** check the PostgreSQL service, database name, login, password, and URL in `backend/.env`. Percent-encode special characters in URL passwords.
- **Missing DATABASE_URL:** put it in `backend/.env`, not the root or frontend. The future database commands require a real URL.
- **Missing generated Prisma client:** run `npm run db:generate` after installing dependencies or changing the schema.
- **Seed reports missing tables:** do not bypass migration review. Include the prepared constraints/append-only triggers in the first migration before running the live seed.
- **Prisma shadow database permission error later:** the local development login needs `CREATEDB`, or a separately configured shadow database. Never use a production database as a shadow database.
- **Install/download failure:** check access to npm and compiler download services, then retry. Do not disable TLS verification.

## Next phase

Review the ERD and data-model assumptions, then prepare and apply the first migration with the SQL constraint supplement in a local development database. Test seed reruns, rollback, foreign keys, and audit immutability before API implementation. GPS, maps, IoT, cryptocurrency, NFTs, and AI fraud detection are outside scope.
