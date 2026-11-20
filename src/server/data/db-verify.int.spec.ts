import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSchemaProvider, seedDatabase } from '../../../prisma/seed';
// Side-effect import: registers the harness hooks BEFORE this file's hooks. They
// provision a per-file temp SQLite DB (mkdtemp + `prisma migrate deploy`) and reset
// it before every test, so `npm run db:verify` below runs against the same temp DB
// through the inherited DATABASE_URL (design §8).
import '../testing/integration-harness';
import { getPrisma } from './prisma-client';
import { verifyDbProvider } from '../../../scripts/verify-db-provider';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'prisma', 'schema.prisma');

// Runs the real CLI contract (`npm run db:verify` → `tsx scripts/verify-db-provider.ts`)
// in a child process, inheriting the harness's temp DATABASE_URL. The exit code is the
// observable the npm script promises: 0 on consistency, 1 on any drift.
function runDbVerify(): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('npm', ['run', 'db:verify'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? null,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

describe('db:verify (BR-18 / spec req 16)', () => {
  let scratchDir = '';

  beforeAll(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'qr-db-verify-'));
  });

  afterAll(async () => {
    if (scratchDir !== '') await rm(scratchDir, { recursive: true, force: true });
  });

  // Writes a schema variant outside the workspace so the checks can be driven at a
  // fixture instead of mutating the real prisma/schema.prisma.
  async function writeSchema(name: string, contents: string): Promise<string> {
    const path = join(scratchDir, name);
    await writeFile(path, contents, 'utf8');
    return path;
  }

  it('passes on a seeded database: seed:origin equals the schema provider', async () => {
    await seedDatabase(getPrisma());

    await expect(verifyDbProvider()).resolves.toBe(await readSchemaProvider());
  });

  it('fails loudly when the seed:origin marker is missing', async () => {
    await expect(verifyDbProvider()).rejects.toThrow('SystemSetting["seed:origin"] is missing');
  });

  it('fails loudly when the marker was stamped by a different provider', async () => {
    await seedDatabase(getPrisma());
    await getPrisma().systemSetting.update({
      where: { key: 'seed:origin' },
      data: { value: 'postgresql' },
    });

    await expect(verifyDbProvider()).rejects.toThrow('seed:origin"] is "postgresql"');
  });

  it('fails loudly when the schema provider drifts from DATA_PROVIDER', async () => {
    const path = await writeSchema(
      'drift.prisma',
      'datasource db {\n  provider = "postgresql"\n}\n',
    );

    await expect(verifyDbProvider({ schemaPath: path })).rejects.toThrow('DATA_PROVIDER');
  });

  // Spec req 16, scenario 2: a Prisma `enum` block would make the provider switch a
  // schema rewrite, so `db:verify` must refuse it. The comment mentioning the word
  // must NOT trip the check (grep-style assertion, not a naive `includes`).
  it('fails loudly when the schema declares a database enum', async () => {
    await seedDatabase(getPrisma());
    const path = await writeSchema(
      'with-enum.prisma',
      '// no enum declarations are allowed in this file\n' +
        'datasource db {\n  provider = "sqlite"\n}\n' +
        'enum Role {\n  ADMIN\n}\n',
    );

    await expect(verifyDbProvider({ schemaPath: path })).rejects.toThrow(/enum/);
  });

  // The inverse: a schema whose prose merely mentions enums must still pass, so the
  // guard has to match a real declaration, not any occurrence of the word.
  it('does not trip on a comment that merely mentions enums', async () => {
    await seedDatabase(getPrisma());
    const path = await writeSchema(
      'comment-only.prisma',
      '// status columns stay strings; no enum declarations here\n' +
        'datasource db {\n  provider = "sqlite"\n}\n',
    );

    await expect(verifyDbProvider({ schemaPath: path })).resolves.toBe('sqlite');
  });

  it('`npm run db:verify` exits 0 on the seeded database', async () => {
    await seedDatabase(getPrisma());

    const result = runDbVerify();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('db:verify OK');
  });

  it('`npm run db:verify` exits 1 with the mismatch on stderr when the marker drifted', async () => {
    await seedDatabase(getPrisma());
    await getPrisma().systemSetting.update({
      where: { key: 'seed:origin' },
      data: { value: 'postgresql' },
    });

    const result = runDbVerify();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('seed:origin');
    expect(result.stderr).toContain('postgresql');
  });
});
