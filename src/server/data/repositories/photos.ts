import type { EventPhoto, PhotoState } from '../../../app/core/models';
import { getPrisma } from '../prisma-client';

// Prisma Photo -> domain EventPhoto mapping (design §4, 1b handoff):
// sizeKb/1000 recovers the decimal-MB `size`; `time` renders as a UTC 'HH:mm' label;
// `seed` is not persisted and falls back to the row id; `big` falls back to `url`.
const pad2 = (value: number): string => String(value).padStart(2, '0');

export function formatPhotoTime(time: Date): string {
  return `${pad2(time.getUTCHours())}:${pad2(time.getUTCMinutes())}`;
}

export async function listPhotos(eventId: string): Promise<readonly EventPhoto[]> {
  const photos = await getPrisma().photo.findMany({ where: { eventId }, orderBy: { id: 'asc' } });
  return photos.map((photo): EventPhoto => ({
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
  }));
}
