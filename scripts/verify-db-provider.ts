// BR-18 verification script (design §9): `npm run db:verify` proves the active database
// provider is observable in the DATA itself and that the schema stays portable. Checks,
// in order: no database enum declarations, schema provider == DATA_PROVIDER, and
// SystemSetting["seed:origin"] == schema provider. Any mismatch fails loudly (exit 1).
// Postgres switch execution is out of scope for this change; see the dry-run doc.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '../src/generated/prisma/client';
import { DATA_PROVIDER } from '../src/server/data/config';
import { getPrisma } from '../src/server/data/prisma-client';
import { readSchemaProvider } from '../prisma/seed';

const DEFAULT_SCHEMA_PATH = join(import.meta.dirname, '..', 'prisma', 'schema.prisma');

export interface VerifyDbProviderOptions {
  /** Schema file to inspect. Defaults to the repository's prisma/schema.prisma. */
  schemaPath?: string;
  /** Client whose DATABASE_URL is verified. Defaults to the lazy singleton. */
  prisma?: PrismaClient;
}

/**
 * Asserts the portability and consistency guards BR-18 requires. Throws a
 * `db:verify FAILED` error naming the conflicting value on the first violation;
 * resolves with the verified provider otherwise.
 */
export async function verifyDbProvider(options: VerifyDbProviderOptions = {}): Promise<string> {
  const schemaPath = options.schemaPath ?? DEFAULT_SCHEMA_PATH;
  const prisma = options.prisma ?? getPrisma();

  // Portability guardrail (spec req 16, scenario 2): a Prisma `enum` block would make
  // the provider switch a schema rewrite. Match a real declaration — `enum` at the
  // start of a line — so prose in comments never trips the check.
  const schema = await readFile(schemaPath, 'utf8');
  const enumDeclaration = /^[ \t]*enum[ \t]+\w+/m.exec(schema);
  if (enumDeclaration !== null) {
    throw new Error(
      `db:verify FAILED: ${schemaPath} declares a database enum (${enumDeclaration[0].trim()}); ` +
        'status columns must stay strings (spec req 16, scenario 2).',
    );
  }

  const schemaProvider = await readSchemaProvider(schemaPath);
  if (schemaProvider !== DATA_PROVIDER) {
    throw new Error(
      `db:verify FAILED: ${schemaPath} declares provider "${schemaProvider}" but DATA_PROVIDER ` +
        `is "${DATA_PROVIDER}" (src/server/data/config.ts) — move both together.`,
    );
  }

  const marker = await prisma.systemSetting.findUnique({ where: { key: 'seed:origin' } });
  if (marker === null) {
    throw new Error(
      'db:verify FAILED: SystemSetting["seed:origin"] is missing — run `npm run db:seed`.',
    );
  }
  if (marker.value !== schemaProvider) {
    throw new Error(
      `db:verify FAILED: SystemSetting["seed:origin"] is "${marker.value}" but the schema ` +
        `declares "${schemaProvider}" — the DB was seeded under another provider; ` +
        'run `npm run db:reset && npm run db:seed`.',
    );
  }

  return schemaProvider;
}

// CLI entry (`npm run db:verify` → `tsx scripts/verify-db-provider.ts`). Tests import
// verifyDbProvider() and run the CLI through the same temp DATABASE_URL the harness
// provisions; this guard keeps the import side-effect free (same pattern as prisma/seed.ts).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let prisma: PrismaClient | undefined;
  try {
    prisma = getPrisma();
    const provider = await verifyDbProvider({ prisma });
    console.log(
      `db:verify OK: seed:origin "${provider}" matches the schema provider and ` +
        `DATA_PROVIDER "${DATA_PROVIDER}".`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}
