# Windows setup guide

Use PowerShell. The current project path is `C:\Project\Pharmaceutical Supply Chain Blockchain`; replace this path only if you move the project. Commands below state their working directory.

## 1. Check Node and npm

**Directory: any.**

```powershell
node --version
npm --version
```

Use Node **24.15.0** and npm **11.12.1**, matching this foundation. `.nvmrc` and `.node-version` record Node; they do not automatically install it.

On this computer, the npm launcher tries to load a missing file in `AppData\Roaming\npm`. The bundled npm works. If you see this error, run the following in **each new PowerShell terminal** before using npm:

```powershell
function npm { & 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' @args }
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm --version
```

The function affects this PowerShell session only. It neither edits your profile nor changes the machine configuration. Alternatively, repair Node through its official Windows installer and reopen your terminal. Use the [official Node download](https://nodejs.org/en/download) if Node is missing.

## 2. Install dependencies and create local settings

**Directory: project root.**

```powershell
Set-Location 'C:\Project\Pharmaceutical Supply Chain Blockchain'
npm install
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
notepad backend/.env
```

One root install handles all three workspaces. After setup, `npm ci` can reproduce the committed lockfile. Do not run separate installs in each workspace.

Replace `CHANGE_ME` locally once you have created your PostgreSQL login below. Keep `CONTRACT_ADDRESS` empty. Do not commit `.env`. The root example lists the same variables for reference; only **backend/.env** is loaded.

## 3. Prepare PostgreSQL

PostgreSQL 18.4 was already installed and its service was running during inspection. No reinstall is needed on this machine.

**Directory: any.**

```powershell
psql --version
pg_isready -h localhost -p 5432
Get-Service '*postgres*'
```

If PostgreSQL is missing on another machine, use the [official Windows installer](https://www.postgresql.org/download/windows/), include the command-line tools and pgAdmin, choose port 5432, and record your administrator password. If `psql` is not found, add its bin directory for the current session (adjust 18 to your installed major):

```powershell
$env:Path = 'C:\Program Files\PostgreSQL\18\bin;' + $env:Path
```

Create the development role and database once. **Directory: any**, using the PostgreSQL administrator password when prompted:

```powershell
createuser -h localhost -p 5432 -U postgres --pwprompt --createdb pharma_app
createdb -h localhost -p 5432 -U postgres --owner=pharma_app pharma_supply_chain
```

`createuser` prompts for a new role password and the administrator's password. Keep the role password for your local URL. `--createdb` supports Prisma's later development shadow database; this is a local development role, not a production permission recommendation. If the role or database already exists, reuse it after checking its owner rather than dropping it.

These commands create the login and empty database only. **Prisma migrations will create application tables later; no manual CREATE TABLE statements are needed.**

**Directory: project root.** Edit the local settings:

```powershell
Set-Location 'C:\Project\Pharmaceutical Supply Chain Blockchain'
notepad backend/.env
```

Set:

```dotenv
DATABASE_URL="postgresql://pharma_app:YOUR_URL_ENCODED_PASSWORD@localhost:5432/pharma_supply_chain?schema=public"
PORT=3000
BLOCKCHAIN_RPC_URL="http://127.0.0.1:8545"
CONTRACT_ADDRESS=""
```

Replace the password placeholder; URL-encode special password characters (for example `@` becomes `%40`). Never paste a real password into tracked examples or chat.

**Directory: any.** Verify the new login using an interactive password prompt:

```powershell
psql -h localhost -p 5432 -U pharma_app -d pharma_supply_chain -W -c "SELECT current_database(), current_user;"
```

**Directory: project root.** Validate the data model and preview the seed without database writes:

```powershell
npm run db:validate
npm run db:generate
node --test backend/prisma/seed.test.js
node backend/prisma/seed.js --dry-run
```

Validation checks the Prisma schema; it does not prove a live database connection. Client generation writes only ignored local client files. **The seed now performs real inserts unless `--dry-run` is supplied. Do not run it against PostgreSQL yet.** See [DATA_MODEL.md](database/DATA_MODEL.md) and [ERD.md](database/ERD.md).

In the next user-requested phase, after confirming a dedicated local connection, prepare an initial migration for review:

```powershell
# Future phase only, from the root:
npm run db:migrate -- --name init --create-only
```

The reviewed migration must include `docs/database/CONSTRAINTS.sql` after Prisma's generated SQL. That file contains checks and append-only triggers not expressible in the Prisma schema. Do not apply only the generated tables. After SQL review, the future phase can apply and verify it:

```powershell
# Future phase only, from the root, after the SQL supplement is included:
npm run db:migrate
npm run db:generate
npm run db:seed
```

## 4. Start the frontend

**Terminal 1, directory: project root.** Apply the npm workaround from step 1 if needed.

```powershell
Set-Location 'C:\Project\Pharmaceutical Supply Chain Blockchain'
npm run dev:frontend
```

Open `http://127.0.0.1:5173`. You should see the project foundation screen, not a dashboard yet.

## 5. Start the backend

**Terminal 2, directory: project root.** Apply the npm workaround if needed.

```powershell
Set-Location 'C:\Project\Pharmaceutical Supply Chain Blockchain'
npm run dev:backend
```

Expect `Backend listening at http://127.0.0.1:3000`. A browser request to that address returns 404 because no routes have been built. Database and blockchain connections are intentionally deferred.

## 6. Start the local blockchain

**Terminal 3, directory: project root.** Apply the npm workaround if needed.

```powershell
Set-Location 'C:\Project\Pharmaceutical Supply Chain Blockchain'
npm run dev:blockchain
```

Expect an HTTP JSON-RPC server on port 8545. Hardhat prints local test accounts; they are for the disposable local chain only. There is no deployed contract yet, so leave `CONTRACT_ADDRESS` blank. Restarting the node resets this chain.

**Terminal 4, directory: any.** Optional connection check:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8545' -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

The result should be `0x7a69` (31337). Stop each server with Ctrl+C when finished.

## 7. Run the foundation checks

**Directory: project root.**

```powershell
npm run build
npm run check:backend
npm run db:validate
node --test backend/prisma/seed.test.js
node backend/prisma/seed.js --dry-run
npm run blockchain:compile
```

Hardhat has no contracts to compile yet. Compiler downloads may require internet access. See [verification results](VERIFICATION.md) for what was actually checked.

## Troubleshooting

- Use the exact root path above; the existing folder was not renamed.
- Use step 1's function for a broken npm launcher or PowerShell script restriction; it calls Node directly.
- If 5173/3000/8545 is busy, stop the other service. If you change the backend port, change the Vite `/api` proxy too.
- If PostgreSQL is stopped, start its service through Windows Services. The detected name is `postgresql-x64-18`.
- Authentication failures usually mean the URL credentials differ from the role created in step 3.
- Prisma configuration is in `backend/prisma.config.js`; the datasource URL belongs there via the environment, not in the Prisma 7 schema.
- The schema and seed are prepared, but tables require a reviewed migration including the constraint supplement. Do not use `db push` to skip those safeguards.
- Never solve TLS download errors by disabling certificate verification.
