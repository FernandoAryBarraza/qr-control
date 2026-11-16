import { randomUUID } from 'node:crypto';
import type { EventPhoto, PhotoState } from '../../../app/core/models';
import type { Photo } from '../../../generated/prisma/client';
import { getPrisma } from '../prisma-client';

// Prisma Photo -> domain EventPhoto mapping (design §4, 1b handoff):
// sizeKb/1000 recovers the decimal-MB `size`; `time` renders as a UTC 'HH:mm' label;
// `seed` is not persisted and falls back to the row id; `big` falls back to `url`.
const pad2 = (value: number): string => String(value).padStart(2, '0');

export function formatPhotoTime(time: Date): string {
  return `${pad2(time.getUTCHours())}:${pad2(time.getUTCMinutes())}`;
}

function toPhoto(photo: Photo): EventPhoto {
  return {
    id: photo.id,
    seed: photo.id,
    author: photo.authorName,
    state: photo.state as PhotoState,
    dl: photo.downloaded,
    size: (photo.sizeKb ?? 0) / 1000,
    h: photo.height ?? 0,
    time: formatPhotoTime(photo.time),
    url: photo.url,
    big: photo.bigUrl ?? photo.url,
    active: photo.active,
  };
}

export async function listPhotos(eventId: string): Promise<readonly EventPhoto[]> {
  const photos = await getPrisma().photo.findMany({ where: { eventId }, orderBy: { id: 'asc' } });
  return photos.map(toPhoto);
}

/** Write contract for POST /api/events/:id/photos. The event comes from the URL. */
export interface PhotoWriteInput {
  readonly url: string;
  readonly author: string;
  readonly state: PhotoState;
  readonly dl: boolean;
  /** Decimal MB (domain units) — converted to the stored int4 `sizeKb` column. */
  readonly size: number | null;
  readonly h: number | null;
  readonly big: string | null;
}

/**
 * Write contract for PATCH /api/photos/:id (state/active/dl — BR-13, no delete).
 * `dl` maps to the `downloaded` column; it was POST-only until PR-2b completed
 * the contract so `toggleDownload` could persist.
 */
export interface PhotoPatchInput {
  readonly state?: PhotoState;
  readonly active?: boolean;
  readonly dl?: boolean;
}

export async function createPhoto(eventId: string, input: PhotoWriteInput): Promise<EventPhoto> {
  const photo = await getPrisma().photo.create({
    data: {
      // Explicit field-by-field construction: client-supplied ids, `eventId`,
      // `active` and `authorGuestId` (deferred, design §11) can never be mass-assigned.
      id: `ph-${randomUUID()}`,
      eventId,
      url: input.url,
      bigUrl: input.big,
      state: input.state,
      downloaded: input.dl,
      sizeKb: input.size === null ? null : Math.round(input.size * 1000),
      height: input.h,
      time: new Date(), // BR-16 timestamp — server-generated, never client-supplied
      authorName: input.author,
    },
  });
  return toPhoto(photo);
}

/** The row's own eventId: object-level authorization is never read from the client. */
export async function photoEventId(id: string): Promise<string | null> {
  const photo = await getPrisma().photo.findUnique({
    where: { id },
    select: { eventId: true },
  });
  return photo === null ? null : photo.eventId;
}

export async function updatePhoto(id: string, patch: PhotoPatchInput): Promise<EventPhoto> {
  const photo = await getPrisma().photo.update({
    where: { id },
    data: {
      ...(patch.state === undefined ? {} : { state: patch.state }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      ...(patch.dl === undefined ? {} : { downloaded: patch.dl }),
    },
  });
  return toPhoto(photo);
}
