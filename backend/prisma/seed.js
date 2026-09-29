import { env } from '../src/config/env.js';
import { buildDemoData } from './demo-data.js';

const data = buildDemoData();

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ organizations: data.organizations.length, users: data.users.length,
      medicines: data.medicines.length, batches: 1, units: data.units.length, shipments: 1,
      expected: data.shipment.expectedQuantity, received: data.shipment.receivedQuantity,
      missingSerials: data.units.slice(95).map((unit) => unit.serialNumber),
      auditEvents: data.events.length, verificationLogs: data.verificationLogs.length,
      blockchainTransactions: 0, databaseWrites: false }, null, 2));
    return;
  }
  if (!env.databaseUrl) throw new Error('DATABASE_URL is required in backend/.env.');
  const url = new URL(env.databaseUrl);
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('This demo seed is restricted to a local development database.');
  }
  const { PrismaClient } = await import('../src/generated/prisma/index.js');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000 }) });
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize concurrent executions of this seed; every insertion is atomic.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(73190521)::text`;
      const marker = await tx.supplyChainEvent.findUnique({ where: { id: data.events[0].id } });
      if (marker) {
        if (marker.eventHash !== data.events[0].eventHash) throw new Error('Demo version collision; existing data was not changed.');
        console.log('Demo v1 already loaded; preserved existing operational data and audit history.');
        return;
      }
      await tx.organization.createMany({ data: data.organizations });
      await tx.user.createMany({ data: data.users });
      await tx.medicine.createMany({ data: data.medicines });
      await tx.batch.create({ data: data.batch });
      await tx.medicineUnit.createMany({ data: data.units });
      await tx.shipment.create({ data: data.shipment });
      await tx.shipmentUnit.createMany({ data: data.shipmentUnits });
      await tx.discrepancyCase.create({ data: data.discrepancy });
      await tx.discrepancyUnit.createMany({ data: data.missingUnits });
      await tx.verificationLog.createMany({ data: data.verificationLogs });
      await tx.supplyChainEvent.createMany({ data: data.events });
      console.log('Demo loaded: 100 expected, 95 received, 5 missing; no blockchain transactions invented.');
    }, { timeout: 30000 });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Prisma connection errors may contain connection details; do not print them.
  console.error('Demo seed failed. Verify the local DATABASE_URL, reviewed migrations, and unique demo identifiers. No partial seed transaction is retained.');
  console.error(`Error category: ${error.code ?? error.name}`);
  process.exitCode = 1;
});
