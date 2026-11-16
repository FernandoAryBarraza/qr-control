import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';
import { getDatabaseUrl } from './config';

let client: PrismaClient | undefined;

// Lazy singleton (design §4). The datasource URL is validated on first USE, never at
// import time: the integration harness points DATABASE_URL at a per-file temp DB in
// beforeAll, and Prisma 7 requires a driver adapter (better-sqlite3 for SQLite;
// a Postgres switch swaps in @prisma/adapter-pg here only).
export function getPrisma(): PrismaClient {
  if (client === undefined) {
    const adapter = new PrismaBetterSqlite3({ url: getDatabaseUrl() });
    client = new PrismaClient({ adapter });
  }
  return client;
}
