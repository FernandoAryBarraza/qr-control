import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-browser-bundle.mjs');

/** Runs the real CLI contract behind `npm run bundle:guard` in a child process. */
function runGuard(target: string): { status: number | null; output: string } {
  try {
    const output = execFileSync('node', [SCRIPT, target], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? null,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

describe('npm run bundle:guard (spec req 15 / proposal success criterion)', () => {
  let scratchDir = '';
  let cleanBundle = '';

  beforeAll(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'qr-bundle-guard-'));
    cleanBundle = join(scratchDir, 'browser');
    await mkdir(join(cleanBundle, 'chunks'), { recursive: true });
    await writeFile(join(cleanBundle, 'main.js'), 'console.log("client only");', 'utf8');
    await writeFile(join(cleanBundle, 'chunks', 'ui.css'), 'body { color: #222; }', 'utf8');
  });

  afterAll(async () => {
    if (scratchDir !== '') await rm(scratchDir, { recursive: true, force: true });
  });

  it('passes with exit 0 on a clean browser bundle', () => {
    const result = runGuard(cleanBundle);

    expect(result.status).toBe(0);
    expect(result.output).toContain('bundle guard OK');
  });

  it('fails with exit 1 and names the file when @prisma is present', async () => {
    await writeFile(join(cleanBundle, 'leak.js'), 'import "@prisma/client";', 'utf8');

    const result = runGuard(cleanBundle);

    expect(result.status).toBe(1);
    expect(result.output).toContain('@prisma');
    expect(result.output).toContain('leak.js');
  });

  it('detects query-engine artifacts in nested directories', async () => {
    await mkdir(join(cleanBundle, 'chunks', 'deep'), { recursive: true });
    await writeFile(join(cleanBundle, 'chunks', 'deep', 'engine.js'), 'libquery_engine', 'utf8');

    const result = runGuard(cleanBundle);

    expect(result.status).toBe(1);
    expect(result.output).toContain('query-engine');
    expect(result.output).toContain('engine.js');
  });

  it('fails loudly with exit 2 when the browser bundle is missing', () => {
    const result = runGuard(join(scratchDir, 'does-not-exist'));

    expect(result.status).toBe(2);
    expect(result.output).toContain('browser bundle not found');
  });
});
