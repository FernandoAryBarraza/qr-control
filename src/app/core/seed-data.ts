import type {
  AppStateDef,
  AppStateKey,
  EventPhoto,
  Guest,
  PaseEvent,
  PaseUser,
  PhotoState,
  Role,
  StoragePlan,
} from './models';

/**
 * Verbatim transcription of the prototype's hard-coded dataset
 * (`QR_Z_Open/app.js:38-154, 169-180, 717, 809`). Nothing here is
 * random and nothing here is persisted — the prototype has no
 * storage at all, so every reload replays this exact snapshot.
 */

/* ---------- Datos: invitados ---------- */
export const GUESTS: readonly Guest[] = [
  {
    id: 'P-001',
    name: 'Lucía Ferreyra',
    email: 'lucia.ferreyra@gmail.com',
    phone: '+52 646 112 88 40',
    status: 'confirmed',
    table: 3,
    party: [
      { name: 'Martín Ferreyra', rel: 'Pareja' },
      { name: 'Elena Duarte', rel: 'Madre' },
    ],
    note: 'Menú vegetariano para 2 pases. Llega directo a la cena.',
  },
  {
    id: 'P-002',
    name: 'Andrés Cué Valdemar',
    email: 'andres.cue@valdemar.mx',
    phone: '+52 646 155 21 07',
    status: 'confirmed',
    table: 1,
    party: [
      { name: 'Jimena Cué', rel: 'Esposa' },
      { name: 'Sofía Cué', rel: 'Hija' },
      { name: 'Tomás Cué', rel: 'Hijo' },
    ],
    note: 'Anfitrión. Acceso a área privada del jardín.',
  },
  {
    id: 'P-003',
    name: 'Regina Ortiz Mena',
    email: 'r.ortiz@outlook.com',
    phone: '+52 646 204 55 91',
    status: 'confirmed',
    table: 5,
    party: [{ name: 'Diego Ortiz', rel: 'Hermano' }],
    note: '—',
  },
  {
    id: 'P-004',
    name: 'Hernán Salas',
    email: 'hsalas@proton.me',
    phone: '+52 646 188 30 12',
    status: 'sent',
    table: 6,
    party: [
      { name: 'Ana Laura Salas', rel: 'Esposa' },
      { name: 'Río Salas', rel: 'Hijo' },
    ],
    note: 'Alergia a mariscos: avisar a banquete.',
  },
  {
    id: 'P-005',
    name: 'Camila Bastón',
    email: 'camibast@gmail.com',
    phone: '+52 646 133 76 25',
    status: 'confirmed',
    table: 4,
    party: [],
    note: '—',
  },
  {
    id: 'P-006',
    name: 'Rodrigo Mendiola',
    email: 'rmendiola@grupomex.mx',
    phone: '+52 646 171 44 83',
    status: 'sent',
    table: 7,
    party: [{ name: 'Sofía Mendiola', rel: 'Esposa' }],
    note: '—',
  },
  {
    id: 'P-007',
    name: 'Fernanda Lascuraín',
    email: 'f.lascu@icloud.com',
    phone: '+52 646 209 90 34',
    status: 'confirmed',
    table: 2,
    party: [
      { name: 'Pablo Lascuraín', rel: 'Esposo' },
      { name: 'Mateo Lascuraín', rel: 'Hijo' },
      { name: 'Julia Lascuraín', rel: 'Hija' },
      { name: 'Rosario Mendieta', rel: 'Suegra' },
    ],
    note: 'Familia completa: 5 pases. Trona para Julia.',
  },
  {
    id: 'P-008',
    name: 'Emilio Vargas',
    email: 'evargas@corpomx.io',
    phone: '+52 646 146 62 58',
    status: 'confirmed',
    table: 6,
    party: [
      { name: 'Andrea Solís', rel: 'Pareja' },
      { name: 'Bruno Vargas', rel: 'Hijo' },
    ],
    note: '—',
  },
  {
    id: 'P-009',
    name: 'Ximena Acha',
    email: 'xacha@uni.mx',
    phone: '+52 646 127 19 66',
    status: 'sent',
    table: 8,
    party: [],
    note: '—',
  },
  {
    id: 'P-010',
    name: 'Nicolás Wirz',
    email: 'nico.wirz@gmail.com',
    phone: '+52 646 155 88 02',
    status: 'planned',
    table: 9,
    party: [
      { name: 'Clara Wirz', rel: 'Esposa' },
      { name: 'Emma Wirz', rel: 'Hija' },
    ],
    note: 'Enviar invitación con mapa de acceso.',
  },
  {
    id: 'P-011',
    name: 'Alejandra Pinal',
    email: 'ale.pinal@correo.mx',
    phone: '+52 646 163 27 47',
    status: 'planned',
    table: 9,
    party: [{ name: 'Jorge Pinal', rel: 'Acompañante' }],
    note: '—',
  },
  {
    id: 'P-012',
    name: 'Bruno Cadenas',
    email: 'bcadenas@mail.com',
    phone: '+52 646 182 51 90',
    status: 'confirmed',
    table: 5,
    party: [{ name: 'Vicky Lara', rel: 'Pareja' }],
    note: '—',
  },
  {
    id: 'P-013',
    name: 'Irene Sáenz',
    email: 'irene.saenz@correo.mx',
    phone: '+52 646 190 63 21',
    status: 'declined',
    table: 0,
    party: [],
    note: 'Declinó por viaje de trabajo.',
  },
  {
    id: 'P-014',
    name: 'Óscar Márquez',
    email: 'oscar.mqz@gmail.com',
    phone: '+52 646 138 40 79',
    status: 'planned',
    table: 9,
    party: [],
    note: '—',
  },
];

/* ---------- Datos: fotos ---------- */
interface PhotoDef {
  readonly a: string;
  readonly s: PhotoState;
  readonly dl: boolean;
  readonly sz: number;
  readonly h: number;
  readonly t: string;
}

const PHOTO_DEFS: readonly PhotoDef[] = [
  { a: 'Lucía Ferreyra', s: 'approved', dl: true, sz: 3.2, h: 460, t: '18:42' },
  { a: 'Martín Ferreyra', s: 'approved', dl: true, sz: 4.8, h: 800, t: '19:05' },
  { a: 'Andrés Cué Valdemar', s: 'approved', dl: false, sz: 2.6, h: 640, t: '19:11' },
  { a: 'Jimena Cué', s: 'approved', dl: true, sz: 5.1, h: 520, t: '19:26' },
  { a: 'Regina Ortiz', s: 'pending', dl: false, sz: 2.2, h: 860, t: '19:40' },
  { a: 'Diego Ortiz', s: 'rejected', dl: false, sz: 3.9, h: 720, t: '19:44' },
  { a: 'Camila Bastón', s: 'approved', dl: true, sz: 2.9, h: 560, t: '19:58' },
  { a: 'Fernanda Lascuraín', s: 'approved', dl: false, sz: 4.4, h: 900, t: '20:02' },
  { a: 'Pablo Lascuraín', s: 'pending', dl: false, sz: 3.1, h: 480, t: '20:15' },
  { a: 'Emilio Vargas', s: 'approved', dl: true, sz: 2.4, h: 700, t: '20:21' },
  { a: 'Andrea Solís', s: 'rejected', dl: false, sz: 5.6, h: 620, t: '20:33' },
  { a: 'Bruno Cadenas', s: 'pending', dl: false, sz: 2.8, h: 820, t: '20:47' },
  { a: 'Vicky Lara', s: 'rejected', dl: false, sz: 3.4, h: 540, t: '20:51' },
  { a: 'Elena Duarte', s: 'approved', dl: true, sz: 4.1, h: 760, t: '21:02' },
];

export const PHOTOS: readonly EventPhoto[] = PHOTO_DEFS.map((d, i) => ({
  id: 'f' + (i + 1),
  seed: 'pase-gala-' + (i + 1),
  author: d.a,
  state: d.s,
  dl: d.dl,
  size: d.sz,
  h: d.h,
  time: d.t,
  url: `https://picsum.photos/seed/pase-gala-${i + 1}/640/${d.h}.jpg`,
  big: `https://picsum.photos/seed/pase-gala-${i + 1}/1200/${Math.round(d.h * 1.875)}.jpg`,
}));

/* ---------- Datos: eventos del proveedor ---------- */
/**
 * The storage counters (used/max/br) are NOT here: they are a client-side
 * display mock and live in `storage-display.ts`, which is their only copy.
 */
export const EVENTS: readonly PaseEvent[] = [
  {
    id: 'ev1',
    status: 'active',
    name: 'Gala Aniversario Valdemar',
    dateLabel: '14 JUN 2025 · 20:00',
    cd: null,
    guests: 218,
    photos: 96,
    admin: {
      name: 'Mariana Solórzano',
      email: 'mariana.solorzana@valdemar.mx',
      phone: '+52 646 118 44 20',
      since: 'Cliente desde 2023',
    },
    security: [
      { name: 'Josué Andrade', post: 'ESCÁNER — PUERTA A', app: 'online', last: '20:41' },
      { name: 'Paola Reyes', post: 'ESCÁNER — PUERTA B', app: 'online', last: '20:38' },
      { name: 'Iván Cortés', post: 'ESCÁNER — JARDÍN', app: 'online', last: '20:29' },
      { name: 'Miguel Ángel Ruiz', post: 'RESERVA — MEDITERRÁNEO', app: 'idle', last: null },
    ],
  },
  {
    id: 'ev2',
    status: 'upcoming',
    name: 'Boda Hernández · Riva',
    dateLabel: '26 JUL 2025 · 17:00',
    cd: 'EN 42 DÍAS',
    guests: 140,
    photos: 12,
    admin: {
      name: 'Diego Riva',
      email: 'diego@hernandezriva.wed',
      phone: '+52 55 4021 77 15',
      since: 'Cliente nuevo · 2025',
    },
    security: [
      { name: 'Sara Lima', post: 'ASIGNADA — RECEPCIÓN', app: 'idle', last: null },
      { name: 'Marco Toledano', post: 'ASIGNADO — SALÓN', app: 'none', last: null },
    ],
  },
  {
    id: 'ev3',
    status: 'done',
    name: 'Convención Nébula Tech',
    dateLabel: '02 MAY 2025 · 09:00',
    cd: null,
    guests: 412,
    photos: 1204,
    note: 'Archivado · la nube se libera el 02 AGO 2025',
    admin: {
      name: 'Carla Ibáñez',
      email: 'c.ibanez@nebulatech.io',
      phone: '+52 81 2233 90 04',
      since: 'Cliente desde 2021',
    },
    security: [
      { name: 'Raúl Prado', post: 'ESCÁNER — ACCESO PRINCIPAL', app: 'archived', last: '—' },
      { name: 'Ana Sofía Cruz', post: 'ESCÁNER — TERRAZA', app: 'archived', last: '—' },
      { name: 'Leo Márquez', post: 'ESCÁNER — ESTACIONAMIENTO', app: 'archived', last: '—' },
    ],
  },
];

/* ---------- Estado y catálogos ---------- */
export const APP_STATES: Record<AppStateKey, AppStateDef> = {
  online: { label: 'EN LÍNEA', cls: 'online' },
  idle: { label: 'SIN ACTIVAR', cls: 'idle' },
  none: { label: 'SIN INSTALAR', cls: 'none' },
  archived: { label: 'ARCHIVADA', cls: 'archived' },
};

export const GATES: readonly string[] = ['PUERTA A', 'PUERTA B', 'JARDÍN'];

export const STORAGE_PLANS: readonly StoragePlan[] = [
  { gb: 50, price: 12 },
  { gb: 100, price: 22 },
  { gb: 200, price: 40 },
];

export const PUBLIC_WEB_URL = 'https://pase.evt/gala-valdemar-xii';

export const USERS: Record<Role, PaseUser> = {
  admin: { ini: 'MS', name: 'Mariana Solórzano', role: 'ADMIN DEL EVENTO' },
  provider: { ini: 'NE', name: 'Nébula Events', role: 'PROVEEDOR DEL SERVICIO' },
};
