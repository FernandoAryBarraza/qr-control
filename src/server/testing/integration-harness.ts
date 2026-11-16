import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApiApp } from '../api/app';
import { getPrisma } from '../data/prisma-client';

// Integration harness (design §8): each test FILE gets its own temp SQLite DB.
// 1. mkdtemp dir, 2. DATABASE_URL -> file:<dir>/test.db, 3. `prisma migrate deploy`
// (verifies the real migrations apply cleanly), 4. API on app.listen(0), exercised
// with global fetch. afterAll: $disconnect + rm -rf. beforeEach: FK-safe reset.

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

let server: Server | undefined;
let baseUrl = '';
let tempDir = '';

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'qr-int-'));
  process.env['DATABASE_URL'] = `file:${join(tempDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'pipe',
  });

  const app = createApiApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  if (server === undefined) throw new Error('Integration server failed to start');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Integration server is not listening on a TCP port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await getPrisma().$disconnect();
  if (server !== undefined) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await rm(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
});

/** Fetch against the harness API on its ephemeral port. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, baseUrl), init);
}

/** Truncate every table in FK-safe order (children before parents). */
export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  await prisma.checkIn.deleteMany();
  await prisma.qrToken.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.companion.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.adminRequest.deleteMany();
  await prisma.eventAssignment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSetting.deleteMany();
}
