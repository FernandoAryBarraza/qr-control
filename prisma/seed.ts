// Seeds the demo dataset from src/app/core/seed-data.ts (design §9): the frontend
// fallback data becomes the persistence fixture until PR-4 decouples the client.
// IDs are deterministic (`ev-001`, `g-001`… `ph-001`… `usr-001`… `c-001`…), so the
// seed is idempotent: previously seeded rows (matched by those IDs) are replaced
// inside one transaction. Run from the repo root: `npm run db:seed`.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '../src/generated/prisma/client';
import { EVENTS, GUESTS, PHOTOS, USERS } from '../src/app/core/seed-data';
import { getPrisma } from '../src/server/data/prisma-client';

// Demo stand-in for the event duration: PaseEvent only carries a display label, so
// the seed derives start/end from it. `end` drives QR expiry (BR-09) only.
const DEMO_EVENT_DURATION_MS = 8 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  JAN: 0,
  ENE: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  ABR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  AGO: 7,
  SEP: 8,
  SET: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
  DIC: 11,
};

/** Parses `dateLabel` ('14 JUN 2025 · 20:00') into a UTC Date; dateLabel itself is dropped. */
function parseDateLabel(label: string): Date {
  const [datePart, timePart] = label.split('·').map((part) => part.trim());
  if (datePart === undefined || timePart === undefined) {
    throw new Error(`Unrecognized dateLabel: "${label}"`);
  }
  const [day, month, year] = datePart.split(' ');
  const [hours, minutes] = timePart.split(':');
  const monthIndex = month === undefined ? undefined : MONTHS[month.toUpperCase()];
  if (monthIndex === undefined) {
    throw new Error(`Unrecognized month in dateLabel: "${label}"`);
  }
  return new Date(Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes)));
}

/** Reads `provider` from the datasource block of prisma/schema.prisma (BR-18). */
export async function readSchemaProvider(): Promise<string> {
  const schema = await readFile(join(import.meta.dirname, 'schema.prisma'), 'utf8');
  const match = /datasource\s+db\s*{\s*provider\s*=\s*"([^"]+)"/.exec(schema);
  if (match === null) {
    throw new Error('No datasource provider found in prisma/schema.prisma');
  }
  return match[1];
}

const pad3 = (index: number): string => String(index + 1).padStart(3, '0');
const guestIdFor = (index: number): string => `g-${pad3(index)}`;

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // --- Build the full plan in memory first (pure mapping, design §9) -------------
  const events = EVENTS.map((event, index) => {
    const start = parseDateLabel(event.dateLabel);
    return {
      id: `ev-${pad3(index)}`,
      name: event.name,
      // Client 'done' -> server vocabulary 'finished' (spec req 11 / BR-12 gate).
      status: event.status === 'done' ? 'finished' : event.status,
      start,
      end: new Date(start.getTime() + DEMO_EVENT_DURATION_MS),
      note: event.note ?? null,
      // Counters (guests/photos/used/max/br), cd, and dateLabel are deliberately
      // NOT persisted — they are display state, recomputed client-side later.
      // Neither are the admin contact details (email/phone/since) nor the guard
      // details (post/app/last): the `User` and assignment rows carry no such
      // columns, so the client resolves them from its own display mock.
    };
  });

  const users: { id: string; name: string; role: string }[] = [];
  const assignments: { eventId: string; userId: string }[] = [];
  const userIdByName = new Map<string, string>();
  const ensureUser = (name: string, role: string): string => {
    const existing = userIdByName.get(name);
    if (existing !== undefined) return existing;
    const id = `usr-${pad3(users.length)}`;
    users.push({ id, name, role });
    userIdByName.set(name, id);
    return id;
  };

  // Role holders from the standalone USERS catalog, then per-event admin/security.
  // USERS.admin and EVENTS[0].admin are the same person — deduplicated by name.
  ensureUser(USERS.provider.name, 'provider');
  ensureUser(USERS.admin.name, 'admin');
  for (const [index, event] of EVENTS.entries()) {
    const eventId = `ev-${pad3(index)}`;
    assignments.push({ eventId, userId: ensureUser(event.admin.name, 'admin') });
    for (const guard of event.security) {
      assignments.push({ eventId, userId: ensureUser(guard.name, 'security') });
    }
  }

  // Design §9: all 14 demo guests implicitly belonged to the first (active) event.
  const guests = GUESTS.map((guest, index) => ({
    id: guestIdFor(index),
    eventId: 'ev-001',
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    table: guest.table,
    note: guest.note,
    status: guest.status,
  }));

  let companionSeq = 0;
  const companions = GUESTS.flatMap((guest, guestIndex) =>
    guest.party.map((member) => ({
      id: `c-${pad3(companionSeq++)}`,
      guestId: guestIdFor(guestIndex),
      name: member.name,
      rel: member.rel,
    })),
  );

  // All demo photos belong to ev-001; their `time` strings ('18:42') sit on that
  // event's day. `authorGuestId` stays NULL — author names are display-only and do
  // not reliably match guest records (design §3/§9, no FK failures by construction).
  const eventOneDay = parseDateLabel(EVENTS[0].dateLabel);
  const photos = PHOTOS.map((photo, index) => {
    const [hours, minutes] = photo.time.split(':').map(Number);
    const time = new Date(eventOneDay);
    time.setUTCHours(hours, minutes, 0, 0);
    return {
      id: `ph-${pad3(index)}`,
      eventId: 'ev-001',
      url: photo.url,
      bigUrl: photo.big,
      state: photo.state,
      downloaded: photo.dl,
      // Domain `size` is MB (`${size} MB` in the UI) — decimal KB keeps the
      // round-trip lossless: 3.2 MB -> 3200 KB -> /1000 -> 3.2 (repository, 1c).
      sizeKb: Math.round(photo.size * 1000),
      height: photo.h,
      time,
      authorName: photo.author,
    };
  });

  const provider = await readSchemaProvider();

  // --- Apply atomically; delete-then-insert makes re-runs idempotent ------------
  await prisma.$transaction(async (tx) => {
    // Event delete cascades guests, companions, photos, and assignments (schema FKs).
    await tx.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    // Only the deterministic SEED user IDs are deleted. This is safe only while the
    // seed is the sole data source: once later slices persist non-seed rows that
    // reference these users (e.g. AdminRequest.requestedBy with onDelete: Restrict),
    // re-seeding must handle/deny that case instead of removing the users.
    await tx.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });

    await tx.user.createMany({ data: users });
    await tx.event.createMany({ data: events });
    await tx.eventAssignment.createMany({ data: assignments });
    await tx.guest.createMany({ data: guests });
    await tx.companion.createMany({ data: companions });
    await tx.photo.createMany({ data: photos });
    await tx.systemSetting.upsert({
      where: { key: 'seed:origin' },
      update: { value: provider },
      create: { key: 'seed:origin', value: provider },
    });
  });
}

// CLI entry (`prisma db seed` -> `tsx prisma/seed.ts`) seeds the env-configured DB.
// Tests import seedDatabase() and pass the client bound to the integration harness's
// per-file temp DB (src/server/testing/integration-harness.ts).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = getPrisma();
  try {
    await seedDatabase(prisma);
    console.log('Seed complete: 3 events, 14 guests, 13 users (seed:origin stamped).');
  } finally {
    await prisma.$disconnect();
  }
}
