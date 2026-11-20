#!/usr/bin/env node
/**
 * Browser bundle guard (spec req 15 / proposal success criterion).
 *
 * Fails when a Prisma runtime artifact leaks into the prerendered client
 * bundle. Exit codes: 0 = clean, 1 = forbidden match, 2 = missing bundle dir.
 * Usage: node scripts/verify-browser-bundle.mjs [distBrowserDir]
 *        npm run bundle:guard
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const FORBIDDEN = [
  ['@prisma', /@prisma/i],
  ['query-engine', /query[-_]?engine/i],
  ['query_compiler', /query_compiler/i],
  ['better-sqlite3', /better-sqlite3/i],
  ['PrismaClient', /prismaclient/i],
];

const SCANNABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.map', '.json']);

const target = resolve(process.cwd(), process.argv[2] ?? 'dist/qr_control/browser');

if (!existsSync(target) || !statSync(target).isDirectory()) {
  console.error(`bundle guard: browser bundle not found: ${target}`);
  process.exit(2);
}

const findings = [];
let scanned = 0;

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    if (dot < 0 || !SCANNABLE_EXTENSIONS.has(entry.name.slice(dot))) continue;

    scanned += 1;
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const [label, pattern] of FORBIDDEN) {
        if (pattern.test(line)) findings.push(`${relative(target, path)}:${index + 1} ${label}`);
      }
    });
  }
}

scan(target);

if (findings.length > 0) {
  console.error(`bundle guard: ${findings.length} forbidden artifact(s) in ${target}:`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`bundle guard OK: ${scanned} files scanned in ${target}`);
