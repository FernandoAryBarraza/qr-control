import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { EVENTS, GUESTS, PHOTOS } from '../../app/core/seed-data';
import { STORAGE_FIXTURES, storageFixture } from '../../app/core/event-display';
// Side-effect import: registers the harness hooks BEFORE this file's hooks. They
// provision a per-file temp SQLite DB (mkdtemp + `prisma migrate deploy`) and reset
// it before every test, so the spec never touches the developer's `dev.db` (design
// §8). `getPrisma()` below is the same lazy singleton the harness binds to that DB.
import '../testing/integration-harness';
import { getPrisma } from './prisma-client';

// Seed replay assertions (tasks 1b.2/1b.4, design §9): the seed imports the demo
// records from src/app/core/seed-data.ts with deterministic IDs, maps them onto the
// Prisma models, and stamps the BR-18 provider origin marker. The provider string is
// read from schema.prisma INDEPENDENTLY of the seed code, so the equality assertion
// would catch a drift between marker and datasource.
const SCHEMA_PATH = join(import.meta.dirname, '..', '..', '..', 'prisma', 'schema.prisma');

async function schemaProvider(): Promise<string> {
  const schema = await readFile(SCHEMA_PATH, 'utf8');
  const match = /datasource\s+db\s*{\s*provider\s*=\s*"([^"]+)"/.exec(schema);
  if (match === null) throw new Error('No datasource provider found in schema.prisma');
  return match[1];
}

function pad3(index: number): string {
  return String(index + 1).padStart(3, '0');
}

describe('seedDatabase', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('seeds 3 events with deterministic IDs, derived datetimes, and server statuses', async () => {
    const events = await getPrisma().event.findMany({ orderBy: { id: 'asc' } });

    expect(events).toHaveLength(EVENTS.length);
    expect(events.map((e) => e.id)).toEqual(['ev-001', 'ev-002', 'ev-003']);

    // '14 JUN 2025 · 20:00' parsed as UTC; dateLabel itself is dropped (design §9).
    const gala = events[0];
    expect(gala.name).toBe('Gala Aniversario Valdemar');
    expect(gala.status).toBe('active');
    expect(gala.start.toISOString()).toBe('2025-06-14T20:00:00.000Z');
    expect(gala.end.getTime()).toBeGreaterThan(gala.start.getTime());

    // Client 'done' maps to the server-side 'finished' vocabulary (spec req 11).
    expect(events[2].status).toBe('finished');
  });

  it('seeds all 14 guests scoped to ev-001 with their fields intact', async () => {
    const guests = await getPrisma().guest.findMany({ orderBy: { id: 'asc' } });

    expect(guests).toHaveLength(GUESTS.length);
    expect(guests.every((g) => g.eventId === 'ev-001')).toBe(true);

    const first = guests[0];
    expect(first.id).toBe('g-001');
    expect(first.name).toBe(GUESTS[0].name);
    expect(first.email).toBe(GUESTS[0].email);
    expect(first.status).toBe(GUESTS[0].status);
    expect(first.table).toBe(GUESTS[0].table);
    expect(first.active).toBe(true);
  });

  it('seeds one companion row per party member', async () => {
    const companions = await getPrisma().companion.findMany({ orderBy: { id: 'asc' } });
    const expectedCount = GUESTS.reduce((total, g) => total + g.party.length, 0);

    expect(companions).toHaveLength(expectedCount);

    const luciaParty = await getPrisma().companion.findMany({ where: { guestId: 'g-001' } });
    expect(luciaParty.map((c) => ({ name: c.name, rel: c.rel }))).toEqual(
      GUESTS[0].party.map((p) => ({ name: p.name, rel: p.rel })),
    );
    expect(luciaParty.every((c) => c.active)).toBe(true);
  });

  it('seeds 14 photos as metadata + URL only, with authorName and no author FK', async () => {
    const photos = await getPrisma().photo.findMany({ orderBy: { id: 'asc' } });

    expect(photos).toHaveLength(PHOTOS.length);
    expect(photos.every((p) => p.eventId === 'ev-001')).toBe(true);
    expect(photos.every((p) => p.authorName.length > 0)).toBe(true);
    // Design §3: author names don't all match guest records — the FK stays NULL.
    expect(photos.every((p) => p.authorGuestId === null)).toBe(true);

    const first = photos[0];
    expect(first.id).toBe('ph-001');
    expect(first.url).toBe(PHOTOS[0].url);
    expect(first.bigUrl).toBe(PHOTOS[0].big);
    expect(first.state).toBe(PHOTOS[0].state);
    expect(first.downloaded).toBe(PHOTOS[0].dl);
    // Domain `size` is MB (`${size} MB` in the UI) — stored as decimal KB for a
    // lossless round-trip (3.2 MB -> 3200 KB -> /1000 -> 3.2).
    expect(first.sizeKb).toBe(Math.round(PHOTOS[0].size * 1000));
    expect(first.height).toBe(PHOTOS[0].h);
    expect(first.time.toISOString()).toBe('2025-06-14T18:42:00.000Z');
  });

  it('seeds users and assignments for every event admin and security guard', async () => {
    const prisma = getPrisma();
    const users = await prisma.user.findMany();
    const assignments = await prisma.eventAssignment.findMany();

    // 1 provider + 3 event admins + 9 security guards (USERS.admin and the first
    // event's admin are the same person — deduplicated by name).
    expect(users).toHaveLength(
      1 + EVENTS.length + EVENTS.reduce((t, e) => t + e.security.length, 0),
    );
    expect(users.filter((u) => u.role === 'provider')).toHaveLength(1);
    expect(assignments).toHaveLength(
      EVENTS.length + EVENTS.reduce((t, e) => t + e.security.length, 0),
    );

    for (const [index, event] of EVENTS.entries()) {
      const eventId = `ev-${pad3(index)}`;
      const admin = users.find((u) => u.name === event.admin.name);
      expect(admin?.role).toBe('admin');
      const adminAssignment = assignments.find(
        (a) => a.eventId === eventId && a.userId === admin?.id,
      );
      expect(adminAssignment).toBeDefined();

      for (const guard of event.security) {
        const user = users.find((u) => u.name === guard.name);
        expect(user?.role).toBe('security');
        const assignment = assignments.find((a) => a.eventId === eventId && a.userId === user?.id);
        expect(assignment).toBeDefined();
      }
    }
  });

  it('binds every seeded event to the storage figures of the very same event', async () => {
    const events = await getPrisma().event.findMany({ orderBy: { id: 'asc' } });

    // The client resolves the storage counters through an alias
    // (`src/app/core/event-display.ts`), because the seed derives the row id
    // from the event ORDER (`ev-001`, `ev-002`, …). The REAL seeded ids are
    // checked here: another id scheme would leave the client without figures,
    // and another order would put one event's numbers on another.
    for (const event of events) {
      const seed = EVENTS.find((candidate) => candidate.name === event.name);
      expect(seed, `unknown seeded event ${event.name}`).toBeDefined();
      expect(storageFixture(event.id)).toEqual(STORAGE_FIXTURES[seed!.id]);
    }
  });

  it('stamps SystemSetting seed:origin with the schema datasource provider', async () => {
    const marker = await getPrisma().systemSetting.findUnique({ where: { key: 'seed:origin' } });

    expect(marker).not.toBeNull();
    expect(marker?.value).toBe(await schemaProvider());
  });

  it('is idempotent — re-running the seed duplicates nothing', async () => {
    await seedDatabase(getPrisma());

    const prisma = getPrisma();
    const [events, guests, companions, photos, users, assignments] = await Promise.all([
      prisma.event.count(),
      prisma.guest.count(),
      prisma.companion.count(),
      prisma.photo.count(),
      prisma.user.count(),
      prisma.eventAssignment.count(),
    ]);

    expect([events, guests, companions, photos, users, assignments]).toEqual([
      EVENTS.length,
      GUESTS.length,
      GUESTS.reduce((total, g) => total + g.party.length, 0),
      PHOTOS.length,
      1 + EVENTS.length + EVENTS.reduce((t, e) => t + e.security.length, 0),
      EVENTS.length + EVENTS.reduce((t, e) => t + e.security.length, 0),
    ]);
    const marianas = await prisma.user.findMany({ where: { name: 'Mariana Solórzano' } });
    expect(marianas).toHaveLength(1);
  });
});
