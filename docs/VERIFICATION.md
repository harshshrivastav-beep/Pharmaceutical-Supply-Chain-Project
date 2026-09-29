# Foundation verification

## Database architecture phase update

The foundation results below are historical. The current database phase replaces the placeholder schema/seed and adds ERD.md, DATA_MODEL.md, and a prepared CONSTRAINTS.sql supplement.

- Prisma schema with 12 models and 10 enums: validated and formatted successfully.
- Matching Prisma Client and PostgreSQL adapter 7.10.0: installed; client generation succeeded.
- Existing `backend/.env` connection: authenticated successfully using read-only `SELECT 1`; no credentials were printed or changed.
- Three Node tests passed: exact receipt/missing serial reconciliation and custody; stable canonical payloads with matching/tamper-sensitive hashes; event actor/reference and anonymous verification consistency.
- Seed dry run: 3 organizations, 3 users, 2 medicines, 1 batch, 100 units, 1 shipment, 100 expected / 95 received / 5 missing, 8 events, 2 verification logs, 0 invented blockchain transactions, and 0 database writes.
- Backend syntax checks passed. Existing frontend and blockchain source was not changed.
- No migration or live seed was run. SQL constraints/triggers are prepared but **not installed or database-tested**. Live seed execution, repeated seed idempotency, database constraints, immutability, and transactional rollback must be tested in the next migration phase.
- The install still reports the four pre-existing high-severity dependency entries in Prisma tooling. No forced dependency downgrade was applied.

## Historical foundation results

Verified on 29 September 2026 in the existing Windows project directory.

## Inspection

- The root initially contained only empty `frontend/` and `backend/` directories, including the recursive hidden-file inspection. No existing code or dependencies were replaced.
- Node 24.15.0 and bundled npm 11.12.1 were detected. The default PowerShell npm launcher points to a missing global npm file; setup used the bundled npm CLI directly. SETUP.md provides the session-only workaround.
- PostgreSQL command-line tools report 18.4. Service `postgresql-x64-18` was running and port 5432 was accepting connections.

## Passed

| Check | Result |
| --- | --- |
| Root workspace installation | 271 packages installed; root lockfile generated |
| Direct dependency tree | All three workspaces resolve without missing/invalid dependencies |
| Frontend production build | Vite build completed |
| Frontend development server | Started on 5173; HTML and transformed App.jsx returned HTTP 200 |
| Backend syntax | App, server, config, Prisma config, and seed passed Node syntax checks |
| Backend development server | Started on 3000; HTTP 404 at `/` as expected with no routes |
| Prisma configuration | JavaScript config loaded; PostgreSQL placeholder schema validated |
| Prisma seed | Configured seed ran successfully; explicitly wrote no data |
| Hardhat local node | Started on 8545; `eth_chainId` returned `0x7a69` (31337) |
| Hardhat build setup | Downloaded Solidity 0.8.28 compilers; completed with “No contracts to compile” |
| Production dependency audit | Zero reported vulnerabilities |

Hardhat initially hit a sandbox-only Windows user-profile lookup error (`uv_os_get_passwd`). Re-running with approved access outside the sandbox succeeded for both the node and compiler. No source workaround or system setting change was needed.

## Remaining limitations

- No PostgreSQL credentials were provided. No application database/login was created, no authenticated connection was tested, and no migrations were applied. Follow SETUP.md to configure these locally.
- No business models, Prisma Client generator, runtime database adapter, or database queries exist. `db:generate` and `db:migrate` are future-phase commands, not completed checks.
- The frontend was checked through its development HTTP responses and production build; no browser interaction test was performed.
- No contracts exist, so compiler setup success is not evidence of compiled or tested contract behavior.
- A full npm audit reported **four high-severity dependency entries**: `deepmerge-ts`, `@prisma/config`, `mysql2`, and `prisma`. These derive from Prisma development tooling. The report includes recursive-merge exhaustion and MySQL protocol advisories; this project uses PostgreSQL and accepts no user-supplied Prisma configuration. This context does not eliminate the findings. The registry's proposed force fix changes Prisma to 6.19.3, which would require a deliberate compatibility review. No forced downgrade or unverified dependency override was applied. Revisit an upstream fix before deployment.
- No deployment or production-readiness claim is made.

## Installed direct versions

| Tool | Version |
| --- | --- |
| Node.js | 24.15.0 (detected) |
| npm | 11.12.1 (bundled, detected) |
| PostgreSQL tools/server service | 18.4 tools; running PostgreSQL 18 service |
| React / React DOM | 19.3.0 |
| Vite | 8.3.1 |
| @vitejs/plugin-react | 6.1.1 |
| Express | 5.2.1 |
| Prisma CLI | 7.10.0 |
| Hardhat | 3.18.0 |
| Solidity compiler target | 0.8.28 |

The requested phase ends here. Next: review the operational model and API/audit boundaries before implementing application features.
