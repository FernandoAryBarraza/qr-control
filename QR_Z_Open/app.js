
/* =================================================================
   PASE — demo funcional en un solo archivo
   ================================================================= */
(function () {
    'use strict';

    /* ---------- Utilidades ---------- */
    const $ = s => document.querySelector(s);
    const $$ = s => [...document.querySelectorAll(s)];
    const refreshIcons = () => { if (window.lucide) lucide.createIcons(); };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const gb = n => n.toFixed(1);
    const nowTime = () => new Date().toLocaleTimeString('es-MX', { hour12: false });

    function toast(msg, type = 'ink', icon = 'check') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<i data-lucide="${icon}"></i><span>${esc(msg)}</span>`;
        $('#toasts').appendChild(t);
        refreshIcons();
        setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3400);
    }

    function countUp(el, to, dec = 0, dur = 900) {
        const from = parseFloat(el.dataset.v || '0');
        const t0 = performance.now();
        (function step(t) {
            const p = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - p, 3);
            el.textContent = (from + (to - from) * e).toFixed(dec);
            if (p < 1) requestAnimationFrame(step); else el.dataset.v = to;
        })(t0);
    }

    /* ---------- Datos: invitados ---------- */
    const GUESTS = [
        {
            id: 'P-001', name: 'Lucía Ferreyra', email: 'lucia.ferreyra@gmail.com', phone: '+52 646 112 88 40', status: 'confirmed', table: 3,
            party: [{ name: 'Martín Ferreyra', rel: 'Pareja' }, { name: 'Elena Duarte', rel: 'Madre' }], note: 'Menú vegetariano para 2 pases. Llega directo a la cena.'
        },
        {
            id: 'P-002', name: 'Andrés Cué Valdemar', email: 'andres.cue@valdemar.mx', phone: '+52 646 155 21 07', status: 'confirmed', table: 1,
            party: [{ name: 'Jimena Cué', rel: 'Esposa' }, { name: 'Sofía Cué', rel: 'Hija' }, { name: 'Tomás Cué', rel: 'Hijo' }], note: 'Anfitrión. Acceso a área privada del jardín.'
        },
        {
            id: 'P-003', name: 'Regina Ortiz Mena', email: 'r.ortiz@outlook.com', phone: '+52 646 204 55 91', status: 'confirmed', table: 5,
            party: [{ name: 'Diego Ortiz', rel: 'Hermano' }], note: '—'
        },
        {
            id: 'P-004', name: 'Hernán Salas', email: 'hsalas@proton.me', phone: '+52 646 188 30 12', status: 'sent', table: 6,
            party: [{ name: 'Ana Laura Salas', rel: 'Esposa' }, { name: 'Río Salas', rel: 'Hijo' }], note: 'Alergia a mariscos: avisar a banquete.'
        },
        {
            id: 'P-005', name: 'Camila Bastón', email: 'camibast@gmail.com', phone: '+52 646 133 76 25', status: 'confirmed', table: 4,
            party: [], note: '—'
        },
        {
            id: 'P-006', name: 'Rodrigo Mendiola', email: 'rmendiola@grupomex.mx', phone: '+52 646 171 44 83', status: 'sent', table: 7,
            party: [{ name: 'Sofía Mendiola', rel: 'Esposa' }], note: '—'
        },
        {
            id: 'P-007', name: 'Fernanda Lascuraín', email: 'f.lascu@icloud.com', phone: '+52 646 209 90 34', status: 'confirmed', table: 2,
            party: [{ name: 'Pablo Lascuraín', rel: 'Esposo' }, { name: 'Mateo Lascuraín', rel: 'Hijo' }, { name: 'Julia Lascuraín', rel: 'Hija' }, { name: 'Rosario Mendieta', rel: 'Suegra' }], note: 'Familia completa: 5 pases. Trona para Julia.'
        },
        {
            id: 'P-008', name: 'Emilio Vargas', email: 'evargas@corpomx.io', phone: '+52 646 146 62 58', status: 'confirmed', table: 6,
            party: [{ name: 'Andrea Solís', rel: 'Pareja' }, { name: 'Bruno Vargas', rel: 'Hijo' }], note: '—'
        },
        {
            id: 'P-009', name: 'Ximena Acha', email: 'xacha@uni.mx', phone: '+52 646 127 19 66', status: 'sent', table: 8,
            party: [], note: '—'
        },
        {
            id: 'P-010', name: 'Nicolás Wirz', email: 'nico.wirz@gmail.com', phone: '+52 646 155 88 02', status: 'planned', table: 9,
            party: [{ name: 'Clara Wirz', rel: 'Esposa' }, { name: 'Emma Wirz', rel: 'Hija' }], note: 'Enviar invitación con mapa de acceso.'
        },
        {
            id: 'P-011', name: 'Alejandra Pinal', email: 'ale.pinal@correo.mx', phone: '+52 646 163 27 47', status: 'planned', table: 9,
            party: [{ name: 'Jorge Pinal', rel: 'Acompañante' }], note: '—'
        },
        {
            id: 'P-012', name: 'Bruno Cadenas', email: 'bcadenas@mail.com', phone: '+52 646 182 51 90', status: 'confirmed', table: 5,
            party: [{ name: 'Vicky Lara', rel: 'Pareja' }], note: '—'
        },
        {
            id: 'P-013', name: 'Irene Sáenz', email: 'irene.saenz@correo.mx', phone: '+52 646 190 63 21', status: 'declined', table: 0,
            party: [], note: 'Declinó por viaje de trabajo.'
        },
        {
            id: 'P-014', name: 'Óscar Márquez', email: 'oscar.mqz@gmail.com', phone: '+52 646 138 40 79', status: 'planned', table: 9,
            party: [], note: '—'
        },
    ];

    /* ---------- Datos: fotos ---------- */
    const PHOTO_DEFS = [
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
    const PHOTOS = PHOTO_DEFS.map((d, i) => ({
        id: 'f' + (i + 1), seed: 'pase-gala-' + (i + 1), author: d.a, state: d.s, dl: d.dl,
        size: d.sz, h: d.h, time: d.t,
        url: `https://picsum.photos/seed/pase-gala-${i + 1}/640/${d.h}.jpg`,
        big: `https://picsum.photos/seed/pase-gala-${i + 1}/1200/${Math.round(d.h * 1.875)}.jpg`,
    }));

    /* ---------- Datos: eventos del proveedor ---------- */
    const EVENTS = [
        {
            id: 'ev1', status: 'active', name: 'Gala Aniversario Valdemar', dateLabel: '14 JUN 2025 · 20:00', cd: null,
            guests: 218, photos: 96, used: 12.4, max: 50, br: { FOTOS: 11.6, 'VÍDEOS': 0.6, 'OTROS': 0.2 },
            admin: { name: 'Mariana Solórzano', email: 'mariana.solorzana@valdemar.mx', phone: '+52 646 118 44 20', since: 'Cliente desde 2023' },
            security: [
                { name: 'Josué Andrade', post: 'ESCÁNER — PUERTA A', app: 'online', last: '20:41' },
                { name: 'Paola Reyes', post: 'ESCÁNER — PUERTA B', app: 'online', last: '20:38' },
                { name: 'Iván Cortés', post: 'ESCÁNER — JARDÍN', app: 'online', last: '20:29' },
                { name: 'Miguel Ángel Ruiz', post: 'RESERVA — MEDITERRÁNEO', app: 'idle', last: null },
            ]
        },
        {
            id: 'ev2', status: 'upcoming', name: 'Boda Hernández · Riva', dateLabel: '26 JUL 2025 · 17:00', cd: 'EN 42 DÍAS',
            guests: 140, photos: 12, used: 0.8, max: 30, br: { FOTOS: 0.5, 'VÍDEOS': 0.2, 'OTROS': 0.1 },
            admin: { name: 'Diego Riva', email: 'diego@hernandezriva.wed', phone: '+52 55 4021 77 15', since: 'Cliente nuevo · 2025' },
            security: [
                { name: 'Sara Lima', post: 'ASIGNADA — RECEPCIÓN', app: 'idle', last: null },
                { name: 'Marco Toledano', post: 'ASIGNADO — SALÓN', app: 'none', last: null },
            ]
        },
        {
            id: 'ev3', status: 'done', name: 'Convención Nébula Tech', dateLabel: '02 MAY 2025 · 09:00', cd: null,
            guests: 412, photos: 1204, used: 38.2, max: 50, br: { FOTOS: 34.9, 'VÍDEOS': 3.0, 'OTROS': 0.3 },
            note: 'Archivado · la nube se libera el 02 AGO 2025',
            admin: { name: 'Carla Ibáñez', email: 'c.ibanez@nebulatech.io', phone: '+52 81 2233 90 04', since: 'Cliente desde 2021' },
            security: [
                { name: 'Raúl Prado', post: 'ESCÁNER — ACCESO PRINCIPAL', app: 'archived', last: '—' },
                { name: 'Ana Sofía Cruz', post: 'ESCÁNER — TERRAZA', app: 'archived', last: '—' },
                { name: 'Leo Márquez', post: 'ESCÁNER — ESTACIONAMIENTO', app: 'archived', last: '—' },
            ]
        },
    ];

    /* ---------- Estado global ---------- */
    const state = {
        role: 'admin',
        guestFilter: 'all', guestQuery: '',
        photoFilter: 'pending',
        expandedGuests: new Set(),
        expandedEvents: new Set(),
        eventFilter: 'all',
        feedPaused: false,
        ticket: { guestId: null, idx: 0 },
        lbList: [], lbIdx: 0,
        filter: 'all',
    };
    const APP_STATES = {
        online: { label: 'EN LÍNEA', cls: 'online' },
        idle: { label: 'SIN ACTIVAR', cls: 'idle' },
        none: { label: 'SIN INSTALAR', cls: 'none' },
        archived: { label: 'ARCHIVADA', cls: 'archived' },
    };
    const passPool = [];
    GUESTS.filter(g => g.status === 'confirmed').forEach(g => {
        passPool.push({ code: g.id, name: g.name });
        g.party.forEach((p, i) => passPool.push({ code: `${g.id}·A${i + 1}`, name: p.name }));
    });
    const GATES = ['PUERTA A', 'PUERTA B', 'JARDÍN'];

    /* ---------- Reloj ---------- */
    function tickClock() {
        const n = new Date();
        const d = n.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(/\./g, '');
        $('#clock').textContent = `${d} · ${n.toLocaleTimeString('es-MX', { hour12: false })}`;
    }
    tickClock(); setInterval(tickClock, 1000);

    /* ---------- Usuario según rol ---------- */
    function renderUser() {
        const u = state.role === 'admin'
            ? { ini: 'MS', name: 'Mariana Solórzano', role: 'ADMIN DEL EVENTO' }
            : { ini: 'NE', name: 'Nébula Events', role: 'PROVEEDOR DEL SERVICIO' };
        $('#userChip').innerHTML = `<div class="uav">${u.ini}</div>
    <div><div class="uname">${u.name}</div><div class="urole mono">${u.role}</div></div>`;
    }

    /* ---------- Conmutador de rol ---------- */
    function switchRole(role) {
        if (state.role === role) return;
        state.role = role;
        const sw = $('#roleSwitch');
        sw.dataset.role = role;
        sw.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.role === role));
        renderUser();
        const admin = $('#view-admin'), prov = $('#view-provider');
        admin.hidden = role !== 'admin'; prov.hidden = role !== 'provider';
        const shown = role === 'admin' ? admin : prov;
        shown.classList.remove('enter'); void shown.offsetWidth; shown.classList.add('enter');
        refreshIcons();
        if (role === 'provider') renderProvider();
    }

    /* =================================================================
       VISTA ADMINISTRADOR
       ================================================================= */
    function metrics() {
        const g = GUESTS;
        const planned = g.length;
        const invited = g.filter(x => x.status !== 'planned').length;
        const confirmed = g.filter(x => x.status === 'confirmed').length;
        const declined = g.filter(x => x.status === 'declined').length;
        const sentPend = invited - confirmed - declined;
        const comp = g.filter(x => x.status === 'confirmed').reduce((a, x) => a + x.party.length, 0);
        const compPrev = g.reduce((a, x) => a + x.party.length, 0);
        const passes = confirmed + comp;
        const potential = g.reduce((a, x) => a + 1 + x.party.length, 0);
        return { planned, invited, confirmed, declined, sentPend, comp, compPrev, passes, potential };
    }

    function setSeg(id, ratio) { $(id).style.width = (ratio * 100).toFixed(2) + '%'; }
    function setBar(id, ratio) { $(id).style.width = Math.min(100, ratio * 100).toFixed(1) + '%'; }

    function renderMetrics() {
        const m = metrics();
        setSeg('#segConf', m.confirmed / m.planned);
        setSeg('#segSent', m.sentPend / m.planned);
        setSeg('#segUnsent', (m.planned - m.invited) / m.planned);
        setSeg('#segDec', m.declined / m.planned);
        countUp($('#stPlanned'), m.planned);
        countUp($('#stInvited'), m.invited);
        countUp($('#stConfirmed'), m.confirmed);
        countUp($('#stComp'), m.comp);
        countUp($('#stPasses'), m.passes);
        setBar('#sbPlanned', 1);
        setBar('#sbInvited', m.invited / m.planned);
        setBar('#sbConfirmed', m.confirmed / m.planned);
        setBar('#sbComp', m.comp / Math.max(1, m.compPrev));
        setBar('#sbPasses', m.passes / m.potential);
        $('#ssInvited').textContent = Math.round(m.invited / m.planned * 100) + '% DE LA LISTA';
        $('#ssConfirmed').textContent = Math.round(m.confirmed / m.planned * 100) + '% DE LA LISTA';
        $('#ssComp').textContent = `DE ${m.compPrev} PREVISTOS · C/U CON QR PROPIO`;
        $('#ssPasses').textContent = `TITULARES + ACOMPAÑANTES · CAP. ${m.potential}`;
        $('#metricsUpd').textContent = 'ACTUALIZADO ' + nowTime();
        renderGuestFilters();
    }

    function renderGuestFilters() {
        const m = metrics();
        const defs = [
            ['all', 'TODOS', GUESTS.length],
            ['confirmed', 'CONFIRMADOS', m.confirmed],
            ['sent', 'ENVIADOS', m.sentPend],
            ['planned', 'POR INVITAR', m.planned - m.invited],
            ['declined', 'DECLINÓ', m.declined],
        ];
        $('#guestFilters').innerHTML = defs.map(([k, l, n]) =>
            `<button type="button" class="${state.guestFilter === k ? 'active' : ''}" data-action="gfilter" data-id="${k}">${l}<sup>${n}</sup></button>`
        ).join('');
    }

    function pillHTML(st) {
        const map = {
            confirmed: ['ok', 'CONFIRMADO'], sent: ['warn', 'ENVIADO'],
            planned: ['off', 'POR INVITAR'], declined: ['bad', 'DECLINÓ'],
        };
        const [cls, label] = map[st];
        return `<span class="pill ${cls}"><span class="dot"></span><span>${label}</span></span>`;
    }

    function partyChips(g) {
        if (!g.party.length) return `<span class="gsub mono">SIN ACOMPAÑANTES</span>`;
        const chips = g.party.slice(0, 3).map(p => `<span class="chipini" title="${esc(p.name)}">${initials(p.name)}</span>`).join('');
        const more = g.party.length > 3 ? `<span class="chipmore">+${g.party.length - 3}</span>` : '';
        return chips + more;
    }

    function rowActions(g) {
        if (g.status === 'planned')
            return `<button type="button" class="btn sm" data-action="send-invite" data-id="${g.id}"><i data-lucide="send"></i>Enviar invitación</button>`;
        if (g.status === 'sent')
            return `<button type="button" class="btn sm" data-action="confirm-guest" data-id="${g.id}"><i data-lucide="check"></i>Confirmar</button>`;
        if (g.status === 'confirmed')
            return `<button type="button" class="ibtn" data-action="show-qr" data-id="${g.id}" title="Ver pases QR"><i data-lucide="qr-code"></i></button>`;
        return `<span class="gsub mono">—</span>`;
    }

    function detailHTML(g) {
        const party = g.party.length ? g.party.map((p, i) => `
    <div class="pl-item">
      <span class="pl-name">${esc(p.name)}</span>
      <span class="pl-rel mono">${esc(p.rel.toUpperCase())}</span>
      ${g.status === 'confirmed'
                ? `<button type="button" class="ibtn" data-action="show-qr-pass" data-id="${g.id}" data-idx="${i + 1}" title="QR de ${esc(p.name)}"><i data-lucide="qr-code"></i></button>`
                : `<span class="pl-rel mono">QR AL CONFIRMAR</span>`}
    </div>`).join('')
            : `<div class="note-txt" style="color:var(--soft)">Sin acompañantes registrados.</div>`;
        return `<tr class="gdetail"><td colspan="7"><div class="gd">
    <div class="gd-col">
      <div class="dcol-label">ACOMPAÑANTES · ${g.party.length} · RECIBEN QR DE ACCESO PROPIO</div>
      ${party}
    </div>
    <div class="gd-col">
      <div class="dcol-label">NOTA DEL ADMINISTRADOR</div>
      <div class="note-txt">${esc(g.note || '—')}</div>
      <div class="dcol-label" style="margin-top:20px">TELÉFONO</div>
      <div class="note-txt mono" style="font-size:13px">${esc(g.phone)}</div>
    </div>
  </div></td></tr>`;
    }

    function renderGuests() {
        const q = state.guestQuery.trim().toLowerCase();
        let list = GUESTS.filter(g =>
            (state.guestFilter === 'all' || g.status === state.guestFilter) &&
            (!q || g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
        );
        $('#guestCount').textContent = `  (${list.length})`;
        if (!list.length) {
            $('#guestRows').innerHTML = `<tr class="empty-row"><td colspan="7">Ningún invitado coincide con la búsqueda.</td></tr>`;
            return;
        }
        $('#guestRows').innerHTML = list.map(g => {
            const open = state.expandedGuests.has(g.id);
            return `<tr class="grow">
      <td class="gcode mono">${g.id}</td>
      <td><div class="gname" data-action="toggle-guest" data-id="${g.id}">${esc(g.name)}</div>
          <div class="gsub mono">${g.table ? `MESA ${g.table}` : 'SIN MESA'}</div></td>
      <td><div class="gmail">${esc(g.email)}</div><div class="gsub mono">${esc(g.phone)}</div></td>
      <td><div class="party-chips">${partyChips(g)}</div></td>
      <td>${pillHTML(g.status)}</td>
      <td class="ta-r"><div class="row-actions">${rowActions(g)}</div></td>
      <td class="ta-r"><button type="button" class="chev ${open ? 'open' : ''}" data-action="toggle-guest" data-id="${g.id}" title="Detalle"><i data-lucide="chevron-down"></i></button></td>
    </tr>${open ? detailHTML(g) : ''}`;
        }).join('');
        refreshIcons();
    }

    /* ---------- Fotos ---------- */
    function capFlagsHTML(p) {
        if (p.state !== 'approved') return '';
        return `<span class="webflag"><i data-lucide="eye"></i>EN WEB</span>
    <button type="button" class="ibt ${p.dl ? 'on' : ''}" data-action="toggle-dl" data-id="${p.id}"
      title="${p.dl ? 'Descarga habilitada' : 'Habilitar descarga'}"><i data-lucide="download"></i></button>`;
    }
    function pactionsHTML(p) {
        return `${p.state !== 'approved'
            ? `<button type="button" class="pbtn ok" data-action="approve-photo" data-id="${p.id}" title="Aprobar y publicar"><i data-lucide="check"></i></button>` : ''}
    ${p.state !== 'rejected'
                ? `<button type="button" class="pbtn bad" data-action="reject-photo" data-id="${p.id}" title="Rechazar"><i data-lucide="x"></i></button>` : ''}`;
    }
    function filteredPhotos() {
        return PHOTOS.filter(p => state.photoFilter === 'all' || p.state === state.photoFilter);
    }
    function renderPhotos() {
        const list = filteredPhotos();
        const grid = $('#photoGrid');
        if (!list.length) {
            grid.innerHTML = `<div class="wp-empty" style="column-span:all">No hay fotos en esta bandeja por ahora.</div>`;
        } else {
            grid.innerHTML = list.map(p => `
      <figure class="photo st-${p.state}" data-id="${p.id}">
        <div class="photo-media" data-action="open-lightbox" data-id="${p.id}">
          <img src="${p.url}" alt="Foto subida por ${esc(p.author)}" loading="lazy">
          <div class="pactions">${pactionsHTML(p)}</div>
          ${p.state === 'pending' ? `<span class="pbadge">REVISAR</span>` : ''}
          ${p.state === 'rejected' ? `<span class="stamp rej">RECHAZADA</span>` : ''}
        </div>
        <figcaption class="pcap">
          <span class="pcap-txt">${esc(p.author.toUpperCase())} · ${p.time} · ${p.size} MB</span>
          <span class="pcap-flags">${capFlagsHTML(p)}</span>
        </figcaption>
      </figure>`).join('');
        }
        renderPhotoFilters(); updatePendingFlag(); refreshIcons();
    }
    function renderPhotoFilters() {
        const n = s => PHOTOS.filter(p => p.state === s).length;
        const defs = [
            ['pending', 'POR REVISAR', n('pending')],
            ['approved', 'EN WEB', n('approved')],
            ['rejected', 'RECHAZADAS', n('rejected')],
            ['all', 'TODAS', PHOTOS.length],
        ];
        $('#photoFilters').innerHTML = defs.map(([k, l, c]) =>
            `<button type="button" class="${state.photoFilter === k ? 'active' : ''}" data-action="pfilter" data-id="${k}">${l}<sup>${c}</sup></button>`
        ).join('');
    }
    function updatePendingFlag() {
        const n = PHOTOS.filter(p => p.state === 'pending').length;
        const el = $('#pendingFlag');
        if (n) { el.className = 'pending-flag'; el.innerHTML = `<span class="dot"></span>${n} PENDIENTES DE REVISIÓN`; }
        else { el.className = 'pending-flag ok'; el.innerHTML = `<span class="dot"></span>FOTOTECA AL DÍA`; }
    }
    function refreshPhotoCard(p) {
        const fig = $(`.photo[data-id="${p.id}"]`); if (!fig) return;
        fig.className = `photo st-${p.state}`;
        const media = fig.querySelector('.photo-media');
        media.querySelector('.pbadge')?.remove();
        media.querySelector('.stamp')?.remove();
        media.querySelector('.pactions').innerHTML = pactionsHTML(p);
        const st = document.createElement('span');
        st.className = `stamp ${p.state === 'approved' ? 'ok' : 'rej'} anim`;
        st.textContent = p.state === 'approved' ? 'EN WEB' : 'RECHAZADA';
        media.appendChild(st);
        fig.querySelector('.pcap-flags').innerHTML = capFlagsHTML(p);
        refreshIcons();
    }
    function setPhotoState(id, st) {
        const p = PHOTOS.find(x => x.id === id); if (!p || p.state === st) return;
        p.state = st;
        refreshPhotoCard(p); renderPhotoFilters(); updatePendingFlag();
        toast(st === 'approved'
            ? `Foto de ${p.author} aprobada — visible en la web del evento`
            : `Foto de ${p.author} rechazada — oculta para invitados`,
            st === 'approved' ? 'ok' : 'warn', st === 'approved' ? 'badge-check' : 'circle-slash');
    }
    function toggleDl(id) {
        const p = PHOTOS.find(x => x.id === id); if (!p) return;
        p.dl = !p.dl;
        refreshPhotoCard(p);
        if (state.lbList.length) renderLightbox();
        toast(p.dl ? 'Descarga habilitada para los invitados' : 'Descarga deshabilitada — solo vista en web',
            p.dl ? 'ok' : 'warn', 'download');
    }

    /* ---------- Lightbox ---------- */
    function openLightbox(id) {
        state.lbList = filteredPhotos().map(p => p.id);
        state.lbIdx = Math.max(0, state.lbList.indexOf(id));
        renderLightbox();
    }
    function renderLightbox() {
        const p = PHOTOS.find(x => x.id === state.lbList[state.lbIdx]); if (!p) return;
        const stLabel = { pending: 'PENDIENTE', approved: 'APROBADA · EN WEB', rejected: 'RECHAZADA' }[p.state];
        let ov = $('#modals').querySelector('.lightbox-ov');
        if (!ov) {
            ov = document.createElement('div');
            ov.className = 'overlay dark lightbox-ov';
            $('#modals').appendChild(ov);
        }
        ov.innerHTML = `
    <div class="lightbox">
      <img src="${p.big}" alt="Foto de ${esc(p.author)}">
      <div class="lb-bar">
        <span class="lb-meta">${esc(p.author.toUpperCase())} · ${p.time} · ${p.size} MB · ${stLabel}</span>
        <div class="lb-actions">
          ${p.state !== 'approved' ? `<button type="button" class="pbtn ok" data-action="approve-photo" data-id="${p.id}" title="Aprobar"><i data-lucide="check"></i></button>` : ''}
          ${p.state !== 'rejected' ? `<button type="button" class="pbtn bad" data-action="reject-photo" data-id="${p.id}" title="Rechazar"><i data-lucide="x"></i></button>` : ''}
          <button type="button" class="ibt ${p.dl ? 'on' : ''}" data-action="toggle-dl" data-id="${p.id}" title="Descargable"><i data-lucide="download"></i></button>
        </div>
      </div>
    </div>
    <button type="button" class="lb-nav lb-prev" data-action="lb-prev" title="Anterior"><i data-lucide="arrow-left"></i></button>
    <button type="button" class="lb-nav lb-next" data-action="lb-next" title="Siguiente"><i data-lucide="arrow-right"></i></button>
    <button type="button" class="lb-close" data-action="lb-close" title="Cerrar"><i data-lucide="x"></i></button>`;
        refreshIcons();
    }
    function closeLightbox() {
        $('#modals').querySelector('.lightbox-ov')?.remove();
    }
    function lbMove(d) {
        const n = state.lbList.length; if (!n) return;
        state.lbIdx = (state.lbIdx + d + n) % n;
        renderLightbox();
    }

    /* ---------- QR (librería local vía CDN, con respaldo) ---------- */
    function drawQR(canvas, text, px = 480) {
        const dark = '#1B1611', light = '#FFFFFF', quiet = 3;
        try {
            const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
            const n = qr.getModuleCount();
            const cell = Math.floor(px / (n + quiet * 2)), real = cell * (n + quiet * 2);
            canvas.width = canvas.height = real;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = light; ctx.fillRect(0, 0, real, real);
            ctx.fillStyle = dark;
            for (let r = 0; r < n; r++)for (let c = 0; c < n; c++)
                if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
        } catch (e) {
            /* Resaldo: patrón determinista si el CDN no está disponible */
            const n = 29, cell = Math.floor(px / (n + quiet * 2)), real = cell * (n + quiet * 2);
            canvas.width = canvas.height = real;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = light; ctx.fillRect(0, 0, real, real); ctx.fillStyle = dark;
            let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
            const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) / 4294967295); };
            for (let r = 0; r < n; r++)for (let c = 0; c < n; c++) if (rnd() > 0.5) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
            const fin = (x, y) => { for (let r = 0; r < 7; r++)for (let c = 0; c < 7; c++) { const e = r === 0 || r === 6 || c === 0 || c === 6, i = r > 1 && r < 5 && c > 1 && c < 5; if (e || i) ctx.fillRect((x + c + quiet) * cell, (y + r + quiet) * cell, cell, cell); } };
            ctx.fillStyle = light; ctx.fillRect((quiet) * cell, (quiet) * cell, 7 * cell, 7 * cell);
            ctx.fillRect((quiet + n - 7) * cell, (quiet) * cell, 7 * cell, 7 * cell);
            ctx.fillRect((quiet) * cell, (quiet + n - 7) * cell, 7 * cell, 7 * cell);
            ctx.fillStyle = dark; fin(0, 0); fin(n - 7, 0); fin(0, n - 7);
        }
    }
    function passOf(g, idx) {
        if (idx === 0) return { code: g.id, name: g.name };
        const p = g.party[idx - 1];
        return { code: `${g.id}·A${idx}`, name: p ? p.name : 'Acompañante' };
    }
    function downloadQR() {
        const g = GUESTS.find(x => x.id === state.ticket.guestId); if (!g) return;
        const canvas = $('#qrCanvas'); if (!canvas) return;
        const a = document.createElement('a');
        a.download = `pase-${passOf(g, state.ticket.idx).code.replace(/[^A-Z0-9\-]/gi, '')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        toast(`Pase ${passOf(g, state.ticket.idx).code} descargado`, 'ok', 'download');
    }
    function renderTicketModal(ov) {
        const g = GUESTS.find(x => x.id === state.ticket.guestId);
        const sel = passOf(g, state.ticket.idx);
        ov.querySelector('.modal').innerHTML = `
    <div class="m-head">
      <span class="m-title">PASES DE ACCESO · ${esc(g.name.toUpperCase())}</span>
      <button type="button" class="ibtn" data-close><i data-lucide="x"></i></button>
    </div>
    <div class="ticket">
      <div class="t-left">
        <div class="sec-label">GALA ANIVERSARIO VALDEMAR</div>
        <div class="t-name">${esc(sel.name)}</div>
        <div class="t-sub">SÁB 14 JUN 2025 · 20:00 H<br>HACIENDA LA MERCED · VALLE DE GUADALUPE</div>
        <div class="t-passes">
          <button type="button" class="tpass ${state.ticket.idx === 0 ? 'sel' : ''}" data-action="sel-pass" data-idx="0">
            <span class="nm">Titular</span><span>${g.id}</span></button>
          ${g.party.map((p, i) => `
            <button type="button" class="tpass ${state.ticket.idx === i + 1 ? 'sel' : ''}" data-action="sel-pass" data-idx="${i + 1}">
              <span class="nm">${esc(p.name)}</span><span>${g.id}·A${i + 1}</span></button>`).join('')}
        </div>
        <div class="t-code">CODE · ${esc(sel.code)}</div>
      </div>
      <div class="t-right">
        <div class="t-qrbox"><canvas id="qrCanvas"></canvas></div>
        <button type="button" class="btn sm" data-action="download-qr"><i data-lucide="download"></i>Descargar PNG</button>
      </div>
    </div>`;
        drawQR(ov.querySelector('#qrCanvas'), `PASE|GALA-VALDEMAR-XII|${sel.code}|${sel.name.toUpperCase()}`);
        refreshIcons();
    }
    function showQR(guestId, idx = 0) {
        state.ticket = { guestId, idx };
        const ov = openModal('', { wide: true, cls: 'ticket-ov' });
        renderTicketModal(ov);
    }

    /* ---------- Sistema de modales genérico ---------- */
    function openModal(html, { wide = false } = {}) {
        const ov = document.createElement('div');
        ov.className = 'overlay';
        ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
        $('#modals').appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => ov.remove()));
        refreshIcons();
        return ov;
    }
    function publicWebModal() {
        const approved = PHOTOS.filter(p => p.state === 'approved');
        const ov = openModal('', { wide: true });
        ov.querySelector('.modal').innerHTML = `
    <div class="m-head">
      <span class="m-title">VISTA PÚBLICA · WEB DEL EVENTO PARA INVITADOS</span>
      <button type="button" class="ibtn" data-close><i data-lucide="x"></i></button>
    </div>
    <div class="wp-head">
      <span class="sec-label">GALERÍA OFICIAL</span>
      <h3>Gala <em style="font-style:italic;color:var(--accent)">Aniversario</em> Valdemar</h3>
      <div class="sub">SÁB 14 JUN 2025 · HACIENDA LA MERCED · SOLO LAS FOTOS APROBADAS POR EL ADMINISTRADOR APARECEN AQUÍ.<br>
      ${approved.filter(p => p.dl).length} FOTOS PERMITEN DESCARGA PARA LOS INVITADOS.</div>
    </div>
    ${approved.length
                ? `<div class="wp-grid">${approved.map(p => `
          <div class="wp-item">
            <img src="${p.url}" alt="Foto de ${esc(p.author)}" loading="lazy">
            <span class="wtag">${esc(p.author.toUpperCase())}</span>
            ${p.dl
                        ? `<button type="button" class="ibt on wbtn" data-action="web-download" data-id="${p.id}" title="Descargar"><i data-lucide="download"></i></button>`
                        : `<span class="wtag" style="left:auto;right:8px">SOLO VISTA</span>`}
          </div>`).join('')}</div>`
                : `<div class="wp-empty">Aún no hay fotos aprobadas. Aprueba fotografías en el panel para publicarlas aquí.</div>`}`;
    }

    /* =================================================================
       VISTA PROVEEDOR
       ================================================================= */
    function renderProvider() {
        renderKPIs(); renderEventFilters(); renderEvents();
    }
    function renderKPIs() {
        const online = EVENTS.reduce((a, e) => a + e.security.filter(s => s.app === 'online').length, 0);
        const guards = EVENTS.reduce((a, e) => a + e.security.length, 0);
        const used = EVENTS.reduce((a, e) => a + e.used, 0);
        const max = EVENTS.reduce((a, e) => a + e.max, 0);
        $('#kpiRow').innerHTML = `
    <div class="kpi"><div class="kpi-label">EVENTOS ACTIVOS</div>
      <div class="kpi-num">${EVENTS.filter(e => e.status === 'active').length}</div>
      <div class="kpi-sub">LECTURA DE QR EN OPERACIÓN</div></div>
    <div class="kpi"><div class="kpi-label">PRÓXIMOS</div>
      <div class="kpi-num">${EVENTS.filter(e => e.status === 'upcoming').length}</div>
      <div class="kpi-sub">EN PREPARACIÓN CON EL ADMIN</div></div>
    <div class="kpi"><div class="kpi-label">ESCÁNERES EN LÍNEA</div>
      <div class="kpi-num">${online}<span class="unit">/ ${guards}</span></div>
      <div class="kpi-sub">APP DE SEGURIDAD SINCRONIZADA</div></div>
    <div class="kpi" style="flex-grow:1.3"><div class="kpi-label">ALMACENAMIENTO EN NUBE</div>
      <div class="kpi-num">${gb(used)}<span class="unit">GB</span></div>
      <div class="kpi-sub">DE ${max} GB CONTRATADOS · <b>${Math.round(used / max * 100)}% EN USO</b></div></div>`;
    }
    function renderEventFilters() {
        const defs = [['all', 'TODOS', EVENTS.length], ['active', 'ACTIVOS', EVENTS.filter(e => e.status === 'active').length],
        ['upcoming', 'PRÓXIMOS', EVENTS.filter(e => e.status === 'upcoming').length], ['done', 'FINALIZADOS', EVENTS.filter(e => e.status === 'done').length]];
        $('#eventFilters').innerHTML = defs.map(([k, l, n]) =>
            `<button type="button" class="${state.eventFilter === k ? 'active' : ''}" data-action="efilter" data-id="${k}">${l} · ${n}</button>`).join('');
    }
    function barCls(e) { const r = e.used / e.max; return r > 0.85 ? 'bad' : (r > 0.65 ? 'warn' : ''); }
    function renderEvents() {
        const list = EVENTS.filter(e => state.eventFilter === 'all' || e.status === state.eventFilter);
        $('#eventList').innerHTML = list.map(e => {
            const open = state.expandedEvents.has(e.id);
            const online = e.security.filter(s => s.app === 'online').length;
            const stMap = { active: ['st-active', 'ACTIVO'], upcoming: ['st-upcoming', 'PRÓXIMO'], done: ['st-done', 'FINALIZADO'] };
            const [stCls, stTxt] = stMap[e.status];
            return `<article class="event-row">
      <button type="button" class="er-head" data-action="toggle-event" data-id="${e.id}">
        <span class="er-status ${stCls}"><span class="dot"></span>${stTxt}</span>
        <span class="er-name">${esc(e.name)}${e.cd ? `<span class="er-cd">${e.cd}</span>` : ''}</span>
        <span class="er-facts mono">${e.dateLabel} · ${e.guests} INVITADOS · ${e.photos} FOTOS</span>
        <span class="er-storage">
          <span class="mono">${gb(e.used)} / ${e.max} GB</span>
          <span class="er-bar ${barCls(e)}"><span style="width:${Math.min(100, e.used / e.max * 100)}%"></span></span>
        </span>
        <span class="er-chev chev ${open ? 'open' : ''}"><i data-lucide="chevron-down"></i></span>
      </button>
      ${open ? `<div class="er-detail">
        <div class="dcolb">
          <div class="dcol-label">ADMINISTRADOR DEL EVENTO</div>
          <div class="adm-name">${esc(e.admin.name)}</div>
          <div class="adm-line mono">${esc(e.admin.email)}</div>
          <div class="adm-line mono">${esc(e.admin.phone)}</div>
          <div class="adm-since">${esc(e.admin.since)}</div>
          <button type="button" class="btn sm" data-action="contact-admin" data-id="${e.id}"><i data-lucide="message-square"></i>Enviar mensaje</button>
        </div>
        <div class="dcolb">
          <div class="dcol-label">SEGURIDAD CON APP ESCÁNER · ${online}/${e.security.length} EN LÍNEA</div>
          ${e.security.map(s => {
                const a = APP_STATES[s.app];
                const extra = s.app === 'online' ? ` · ${s.last}` : '';
                return `<div class="sec-item">
              <div><div class="sec-name">${esc(s.name)}</div><div class="sec-post mono">${esc(s.post)}</div></div>
              <span class="app-state ${a.cls}">${a.label}${extra}</span>
            </div>`;
            }).join('')}
        </div>
        <div class="dcolb">
          <div class="dcol-label">ALMACENAMIENTO OCUPADO POR INVITADOS</div>
          <div class="sto-num">${gb(e.used)}<span class="unit"> GB</span><span class="sto-max mono">/ ${e.max} GB</span></div>
          <span class="er-bar big ${barCls(e)}"><span style="width:${Math.min(100, e.used / e.max * 100)}%"></span></span>
          ${Object.entries(e.br).map(([k, v]) => `<div class="bd-row"><span>${k}</span><span>${gb(v)} GB</span></div>`).join('')}
          ${e.note ? `<div class="sto-note">${esc(e.note)}</div>` : ''}
          <button type="button" class="btn sm" data-action="upgrade-storage" data-id="${e.id}" style="margin-top:12px"><i data-lucide="hard-drive"></i>Ampliar plan</button>
        </div>
      </div>` : ''}
    </article>`;
        }).join('');
        refreshIcons();
    }

    /* ---------- Feed de escáneres (simulación local) ---------- */
    function feedTick() {
        if (state.feedPaused || $('#view-provider').hidden || !passPool.length) return;
        const p = passPool[Math.floor(Math.random() * passPool.length)];
        const gate = GATES[Math.floor(Math.random() * GATES.length)];
        const r = Math.random();
        const [res, cls] = r < 0.86 ? ['VÁLIDO', 'fx-ok'] : (r < 0.96 ? ['RE-INGRESO', 'fx-warn'] : ['PASE DUPLICADO', 'fx-bad']);
        const feed = $('#feedList');
        const el = document.createElement('div');
        el.className = `feed-item ${cls}`;
        el.innerHTML = `<span class="ft">${nowTime()}</span>
    <div><span class="fcode">${esc(p.code)}</span><span class="fname">${esc(p.name)}</span>
    <span class="fgate">${gate}</span></div>
    <span class="fres">${res}</span>`;
        feed.prepend(el);
        while (feed.children.length > 30) feed.lastChild.remove();
    }
    setInterval(feedTick, 3600);
    function seedFeed() { for (let i = 0; i < 6; i++) feedTick(); }

    /* ---------- Modales del proveedor ---------- */
    function contactModal(ev) {
        const ov = openModal(`
    <div class="m-head">
      <span class="m-title">MENSAJE PARA ${esc(ev.admin.name.toUpperCase())}</span>
      <button type="button" class="ibtn" data-close><i data-lucide="x"></i></button>
    </div>
    <div class="m-body">
      <div class="adm-line mono" style="margin-bottom:14px">PARA · ${esc(ev.admin.email)} · ${esc(ev.name.toUpperCase())}</div>
      <textarea class="msg-area" id="msgTxt" placeholder="Escribe un mensaje para la administradora del evento…"></textarea>
      <div class="m-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button type="button" class="btn solid" data-action="send-admin-msg" data-id="${ev.id}"><i data-lucide="send"></i>Enviar</button>
      </div>
    </div>`);
        setTimeout(() => ov.querySelector('#msgTxt')?.focus(), 60);
    }
    function storageModal(ev) {
        const plans = [[50, 12], [100, 22], [200, 40]];
        const ov = openModal(`
    <div class="m-head">
      <span class="m-title">PLAN DE ALMACENAMIENTO · ${esc(ev.name.toUpperCase())}</span>
      <button type="button" class="ibtn" data-close><i data-lucide="x"></i></button>
    </div>
    <div class="m-body">
      <div class="adm-line mono" style="margin-bottom:16px">USO ACTUAL · ${gb(ev.used)} GB DE ${ev.max} GB</div>
      ${plans.map(([n, pr]) => `
        <label class="plan ${ev.max === n ? 'sel' : ''}">
          <input type="radio" name="plan" value="${n}" ${ev.max === n ? 'checked' : ''}>
          <span class="pnum">${n}</span><span class="psub">GB de nube<br>para fotos de invitados</span>
          <span class="price mono">USD ${pr}/MES</span>
        </label>`).join('')}
      <div class="m-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button type="button" class="btn solid" data-action="apply-plan" data-id="${ev.id}"><i data-lucide="check"></i>Aplicar plan</button>
      </div>
    </div>`);
        ov.querySelectorAll('.plan input').forEach(inp => {
            inp.addEventListener('change', () => {
                ov.querySelectorAll('.plan').forEach(l => l.classList.remove('sel'));
                inp.closest('.plan').classList.add('sel');
            });
        });
    }

    /* ---------- Web: descarga de foto pública ---------- */
    function webDownload(id) {
        const p = PHOTOS.find(x => x.id === id); if (!p) return;
        const a = document.createElement('a');
        a.href = p.big; a.download = `gala-valdemar-${p.id}.jpg`; a.target = '_blank';
        a.click();
        toast('Descarga iniciada — foto aprobada y descargable', 'ok', 'download');
    }

    /* =================================================================
       DELEGACIÓN DE EVENTOS
       ================================================================= */
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const a = t.dataset.action, id = t.dataset.id;

        switch (a) {
            /* roles */
            case 'switch-role': switchRole(t.dataset.role); break;

            /* invitados */
            case 'gfilter': state.guestFilter = id; renderGuestFilters(); renderGuests(); break;
            case 'toggle-guest': {
                state.expandedGuests.has(id) ? state.expandedGuests.delete(id) : state.expandedGuests.add(id);
                renderGuests(); break;
            }
            case 'send-invite': {
                const g = GUESTS.find(x => x.id === id);
                g.status = 'sent';
                renderGuests(); renderMetrics();
                toast(`Invitación enviada por email a ${g.name}`, 'ok', 'mail');
                break;
            }
            case 'confirm-guest': {
                const g = GUESTS.find(x => x.id === id);
                g.status = 'confirmed';
                passPool.push({ code: g.id, name: g.name });
                g.party.forEach((p, i) => passPool.push({ code: `${g.id}·A${i + 1}`, name: p.name }));
                renderGuests(); renderMetrics();
                toast(`${g.name} confirmó — ${1 + g.party.length} pases QR emitidos`, 'ok', 'badge-check');
                break;
            }
            case 'show-qr': showQR(id, 0); break;
            case 'show-qr-pass': showQR(id, parseInt(t.dataset.idx, 10)); break;
            case 'sel-pass': state.ticket.idx = parseInt(t.dataset.idx, 10);
                renderTicketModal(t.closest('.overlay')); break;
            case 'download-qr': downloadQR(); break;

            /* fotos */
            case 'pfilter': state.photoFilter = id; renderPhotos(); break;
            case 'approve-photo': setPhotoState(id, 'approved');
                if ($('#modals .lightbox-ov')) renderLightbox(); break;
            case 'reject-photo': setPhotoState(id, 'rejected');
                if ($('#modals .lightbox-ov')) renderLightbox(); break;
            case 'toggle-dl': toggleDl(id); break;
            case 'open-lightbox': openLightbox(id); break;
            case 'lb-prev': lbMove(-1); break;
            case 'lb-next': lbMove(1); break;
            case 'lb-close': closeLightbox(); break;
            case 'web-download': webDownload(id); break;

            /* cabecera del evento */
            case 'open-web': publicWebModal(); break;
            case 'share': {
                const url = 'https://pase.evt/gala-valdemar-xii';
                (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
                    .then(() => toast('Enlace de la web copiado al portapapeles', 'ok', 'link'))
                    .catch(() => toast('Enlace: ' + url, 'ok', 'link'));
                break;
            }

            /* proveedor */
            case 'efilter': state.eventFilter = id; renderEventFilters(); renderEvents(); break;
            case 'toggle-event':
                state.expandedEvents.has(id) ? state.expandedEvents.delete(id) : state.expandedEvents.add(id);
                renderEvents(); break;
            case 'contact-admin': contactModal(EVENTS.find(x => x.id === id)); break;
            case 'send-admin-msg': {
                const ov = t.closest('.overlay');
                const ev = EVENTS.find(x => x.id === id);
                ov.remove();
                toast(`Mensaje enviado a ${ev.admin.email}`, 'ok', 'mail-check');
                break;
            }
            case 'upgrade-storage': storageModal(EVENTS.find(x => x.id === id)); break;
            case 'apply-plan': {
                const ov = t.closest('.overlay');
                const sel = ov.querySelector('input[name="plan"]:checked');
                const ev = EVENTS.find(x => x.id === id);
                ev.max = parseInt(sel.value, 10);
                ov.remove();
                renderProvider();
                toast(`Plan ampliado a ${ev.max} GB para ${ev.name}`, 'ok', 'hard-drive');
                break;
            }
            case 'feed-toggle': {
                state.feedPaused = !state.feedPaused;
                $('#feedToggle').innerHTML = `<i data-lucide="${state.feedPaused ? 'play' : 'pause'}"></i>`;
                $('#feedToggle').title = state.feedPaused ? 'Reanudar feed' : 'Pausar feed';
                refreshIcons();
                break;
            }
            case 'new-event':
                toast('El alta de evento se conecta al módulo de contratación', 'warn', 'plus');
                break;
        }
    });

    /* búsqueda de invitados */
    $('#guestSearch').addEventListener('input', e => {
        state.guestQuery = e.target.value;
        renderGuests();
    });

    /* teclado: cerrar lightbox / navegar */
    document.addEventListener('keydown', e => {
        const lb = $('#modals .lightbox-ov');
        if (lb) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') lbMove(-1);
            if (e.key === 'ArrowRight') lbMove(1);
            return;
        }
        if (e.key === 'Escape') {
            const ovs = $$('#modals .overlay');
            if (ovs.length) ovs[ovs.length - 1].remove();
        }
    });

    /* ---------- Arranque ---------- */
    renderUser();
    renderMetrics();
    renderGuests();
    renderPhotos();
    refreshIcons();
    seedFeed();
})();