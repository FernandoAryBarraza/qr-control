#!/usr/bin/env node
/**
 * Prototype visual-parity harness.
 *
 * Renders the production build (`dist/qr_control/browser`) in real Chromium
 * and asserts computed CSS against the prototype (`QR_Z_Open/style.css`).
 *
 * Visual parity is not unit-testable in jsdom (computed styles / breakpoints
 * need a real layout engine), so this script is the executable RED/GREEN
 * signal for the `prototype-styling-tailwind` change. Unit tests
 * (`ng test --watch=false`) stay as non-regression guards.
 *
 * Usage:
 *   node scripts/verify-parity.mjs [--slice s1|s2|s3|all] [--base-url URL] [--json]
 *
 * - Non-destructive: only reads `dist/` and launches a local browser.
 * - Chromium is discovered from `CHROME_BIN`, `PLAYWRIGHT_CHROMIUM`, or the
 *   Playwright cache (`~/.cache/ms-playwright`).
 * - `--base-url` reuses an already-running server; otherwise a throwaway
 *   static server is started on an ephemeral port.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const browserDist = path.join(repoRoot, 'dist', 'qr_control', 'browser');

const args = process.argv.slice(2);
const getFlag = (name) => args.includes(name);
const getOpt = (name, fallback = undefined) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

const slice = (getOpt('--slice', 'all') || 'all').toLowerCase();
const baseUrlOverride = getOpt('--base-url');
const jsonOut = getFlag('--json');

// ---------------------------------------------------------------------------
// Environment discovery
// ---------------------------------------------------------------------------
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [];
  if (process.env.PLAYWRIGHT_CORE) candidates.push(process.env.PLAYWRIGHT_CORE);
  candidates.push(path.join(repoRoot, 'node_modules', 'playwright-core'));
  candidates.push(path.join(repoRoot, 'node_modules', 'playwright'));
  // npx cache (used when playwright is invoked ad-hoc)
  const npxDir = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npxDir)) {
    for (const entry of fs.readdirSync(npxDir)) {
      candidates.push(path.join(npxDir, entry, 'node_modules', 'playwright-core'));
      candidates.push(path.join(npxDir, entry, 'node_modules', 'playwright'));
    }
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'package.json'))) {
        const mod = require(c);
        if (mod.chromium) return mod;
      }
    } catch {
      /* keep looking */
    }
  }
  try {
    const mod = require('playwright-core');
    if (mod.chromium) return mod;
  } catch {
    /* ignore */
  }
  throw new Error(
    'playwright-core not found. Install it or set PLAYWRIGHT_CORE=/path/to/playwright-core.',
  );
}

function resolveChromium() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN))
    return process.env.CHROME_BIN;
  if (process.env.PLAYWRIGHT_CHROMIUM && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM;
  }
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(cache)) {
    const dirs = fs.readdirSync(cache).sort().reverse();
    for (const d of dirs) {
      for (const rel of [
        ['chrome-linux64', 'chrome'],
        ['chrome-linux', 'chrome'],
        ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
      ]) {
        const p = path.join(cache, d, ...rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium not found. Set CHROME_BIN or install the Playwright browser cache.');
}

// ---------------------------------------------------------------------------
// Static server for the build output
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function startStaticServer(root) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------------
// Contrast helpers (WCAG 2.x)
// ---------------------------------------------------------------------------
function parseColor(value) {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  throw new Error(`unparsable color: ${value}`);
}
function composite(fg, bg) {
  const [r, g, b, a] = fg;
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a), 1];
}
function relativeLuminance([r, g, b]) {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Assertion plumbing
// ---------------------------------------------------------------------------
const results = [];
function check(sliceId, label, pass, detail) {
  results.push({ slice: sliceId, label, pass: !!pass, detail });
}
function eq(sliceId, label, actual, expected) {
  check(
    sliceId,
    label,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}
function trackCount(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!baseUrlOverride && !fs.existsSync(path.join(browserDist, 'index.html'))) {
    throw new Error(`Build output not found at ${browserDist}. Run "ng build" first.`);
  }

  const { chromium } = resolvePlaywright();
  const executablePath = resolveChromium();

  let server = null;
  let baseUrl = baseUrlOverride;
  if (!baseUrl) {
    const started = await startStaticServer(browserDist);
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
  }

  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const wantS1 = slice === 'all' || slice === 's1';
  const wantS2 = slice === 'all' || slice === 's2';
  const wantS3 = slice === 'all' || slice === 's3';

  try {
    // ---------------- S1: Tailwind SSR-safe integration ----------------
    if (wantS1) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const consoleErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });
      page.on('pageerror', (e) => consoleErrors.push(String(e)));

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stat-row', { timeout: 15000 });
      await page.waitForTimeout(300);

      const roles = await page.evaluate(() => ({
        admin: document.querySelectorAll('#view-admin').length,
        provider: document.querySelectorAll('#view-provider').length,
      }));
      eq('S1', 'exactly one #view-admin at load', roles.admin, 1);
      eq('S1', 'zero #view-provider at load', roles.provider, 0);

      const hydrationErrors = consoleErrors.filter((t) => /NG05\d\d/.test(t));
      check(
        'S1',
        'no NG05xx hydration errors',
        hydrationErrors.length === 0,
        hydrationErrors.join(' | ') || 'none',
      );

      const tailwind = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="stylesheet"]');
        if (!link) return { present: false, css: '' };
        const css = await (await fetch(link.href)).text();
        return {
          present:
            css.includes('--default-transition-duration') ||
            css.includes('@layer theme,base,components,utilities'),
          css,
        };
      });
      check(
        'S1',
        'Tailwind v4 CSS is generated (theme/base/utilities)',
        tailwind.present,
        tailwind.present ? 'tailwind layers present' : 'no tailwind signature in emitted CSS',
      );
      check(
        'S1',
        'no unresolved @import "tailwindcss"',
        !/@import\s*["']tailwindcss["']/.test(tailwind.css),
        'emitted CSS must not contain the raw tailwind import',
      );

      // Focus-visible smoke (design S3 AXE item: focus visible preserved).
      // No axe-core dependency exists in this project; this targeted check
      // guards the WCAG AA focus requirement the Tailwind preflight could break.
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: 'BODY', outlineStyle: 'none' };
        const s = getComputedStyle(el);
        return { tag: el.tagName, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
      });
      check(
        'S1',
        'focus-visible outline preserved (WCAG AA focus)',
        focus.outlineStyle === 'solid' && parseFloat(focus.outlineWidth) >= 2,
        `${focus.tag} outline-style=${focus.outlineStyle} width=${focus.outlineWidth}`,
      );
      await page.close();
    }

    // ---------------- S2: tokens + ruled row + photos ----------------
    if (wantS2) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stat-row', { timeout: 15000 });
      await page.waitForTimeout(300);

      const css = await page.evaluate(() => {
        const gv = (name) =>
          getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const q = (s) => document.querySelector(s);
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const stats = [...document.querySelectorAll('app-metrics-section .stat')];
        const dark = q('app-metrics-section .stat.dark');
        const darkFill = q('app-metrics-section .stat.dark .stat-fill');
        const row = q('app-metrics-section .stat-row');
        const flag = q('app-photo-cloud .pending-flag');
        const panel = q('app-photo-cloud .panel');
        const flagCs = cs(flag);
        const panelCs = cs(panel);
        return {
          tokens: {
            accent: gv('--accent'),
            amber: gv('--amber'),
            creamLine: gv('--cream-line'),
            line2: gv('--line2'),
            paper: gv('--paper'),
          },
          row: cs(row)
            ? {
                topWidth: cs(row).borderTopWidth,
                topColor: cs(row).borderTopColor,
                bottomWidth: cs(row).borderBottomWidth,
                bottomColor: cs(row).borderBottomColor,
              }
            : null,
          firstStat: cs(stats[0])
            ? {
                borderLeftWidth: cs(stats[0]).borderLeftWidth,
                borderTopWidth: cs(stats[0]).borderTopWidth,
                borderRadius: cs(stats[0]).borderRadius,
              }
            : null,
          secondStat: cs(stats[1])
            ? {
                borderLeftWidth: cs(stats[1]).borderLeftWidth,
                borderLeftColor: cs(stats[1]).borderLeftColor,
                borderTopWidth: cs(stats[1]).borderTopWidth,
              }
            : null,
          dark: cs(dark)
            ? {
                backgroundColor: cs(dark).backgroundColor,
                borderRadius: cs(dark).borderRadius,
                borderTopWidth: cs(dark).borderTopWidth,
              }
            : null,
          darkFillBg: cs(darkFill) ? cs(darkFill).backgroundColor : null,
          flag: flagCs
            ? { color: flagCs.color, text: flag?.textContent.trim(), bg: panelCs.backgroundColor }
            : null,
          panel: panelCs
            ? {
                borderTopWidth: panelCs.borderTopWidth,
                borderRadius: panelCs.borderRadius,
                backgroundColor: panelCs.backgroundColor,
                paddingTop: panelCs.paddingTop,
                marginTop: panelCs.marginTop,
              }
            : null,
          paperBg: getComputedStyle(document.body).backgroundColor,
        };
      });

      // Tokens. Prototype fidelity by default; where the prototype value fails
      // WCAG AA, the accessible value is kept and the deviation is named.
      const t = css.tokens;
      const ink = [27, 22, 17, 1];
      const onPaper = (hex) => contrastRatio(parseColor(hex), parseColor(t.paper));
      const protoAccent = onPaper('#C6431D');
      const protoAmber = onPaper('#A9750C');
      const protoAccentFailsText = protoAccent < 4.5;
      const protoAmberFailsText = protoAmber < 4.5;

      if (protoAccentFailsText) {
        eq('S2', '--accent keeps accessible value (EXC_ACCENT_COLOR)', t.accent, '#C23F19');
      } else {
        eq('S2', '--accent adopts prototype value', t.accent, '#C6431D');
      }
      if (protoAmberFailsText) {
        eq('S2', '--amber keeps accessible value (EXC_AMBER_COLOR)', t.amber, '#956100');
      } else {
        eq('S2', '--amber adopts prototype value', t.amber, '#A9750C');
      }
      eq('S2', '--line2 matches prototype', t.line2, 'rgba(27, 22, 17, .32)');
      eq(
        'S2',
        '--cream-line keeps .36 (EXC_CREAM_LINE_ALPHA_36)',
        t.creamLine,
        'rgba(243, 239, 230, .36)',
      );

      // AA text contrast of the effective accent/amber as small text on paper.
      check(
        'S2',
        '--accent text contrast on paper >= 4.5:1',
        onPaper(t.accent) >= 4.5,
        `${onPaper(t.accent).toFixed(3)}:1 (prototype #C6431D = ${protoAccent.toFixed(3)}:1)`,
      );
      check(
        'S2',
        '--amber text contrast on paper >= 4.5:1',
        onPaper(t.amber) >= 4.5,
        `${onPaper(t.amber).toFixed(3)}:1 (prototype #A9750C = ${protoAmber.toFixed(3)}:1)`,
      );

      // Ruled stat row.
      eq('S2', '.stat-row border-top 1px', css.row?.topWidth, '1px');
      eq('S2', '.stat-row border-top color = ink', css.row?.topColor, 'rgb(27, 22, 17)');
      eq('S2', '.stat-row border-bottom 1px', css.row?.bottomWidth, '1px');
      eq('S2', '.stat-row border-bottom color = ink', css.row?.bottomColor, 'rgb(27, 22, 17)');

      // First cell: no left border, no radius, no full card border.
      eq('S2', 'first .stat has no left border', css.firstStat?.borderLeftWidth, '0px');
      eq('S2', 'first .stat has no radius', css.firstStat?.borderRadius, '0px');
      eq('S2', 'first .stat has no top card border', css.firstStat?.borderTopWidth, '0px');

      // Adjacent cells: left divider = var(--line) (not ink), no top card border.
      eq('S2', 'second .stat left divider 1px', css.secondStat?.borderLeftWidth, '1px');
      eq(
        'S2',
        'second .stat left divider = var(--line)',
        css.secondStat?.borderLeftColor,
        'rgba(27, 22, 17, 0.14)',
      );
      eq('S2', 'second .stat has no top card border', css.secondStat?.borderTopWidth, '0px');

      // Dark variant keeps ink fill, 3px radius, accent fill, no border.
      eq('S2', '.stat.dark background = ink', css.dark?.backgroundColor, 'rgb(27, 22, 17)');
      eq('S2', '.stat.dark radius 3px', css.dark?.borderRadius, '3px');
      eq('S2', '.stat.dark no border', css.dark?.borderTopWidth, '0px');
      const accentRgb = `rgb(${parseColor(t.accent).slice(0, 3).join(', ')})`;
      eq('S2', '.stat.dark .stat-fill uses --accent', css.darkFillBg, accentRgb);

      // Photos: pending-flag accent + AA, panel minimal.
      check('S2', '.pending-flag has text', (css.flag?.text || '').length > 0, css.flag?.text);
      eq('S2', '.pending-flag uses --accent', css.flag?.color, accentRgb);
      if (css.flag) {
        const flagRatio = contrastRatio(parseColor(css.flag.color), parseColor(t.paper));
        check(
          'S2',
          '.pending-flag contrast on paper >= 4.5:1',
          flagRatio >= 4.5,
          `${flagRatio.toFixed(3)}:1`,
        );
      }
      eq('S2', '.panel has no ink border', css.panel?.borderTopWidth, '0px');
      eq('S2', '.panel has no radius', css.panel?.borderRadius, '0px');
      eq('S2', '.panel has no heavy padding', css.panel?.paddingTop, '0px');
      eq('S2', '.panel background transparent', css.panel?.backgroundColor, 'rgba(0, 0, 0, 0)');
      eq('S2', '.panel margin-top 56px (prototype)', css.panel?.marginTop, '56px');
      void ink;
      await page.close();
    }

    // ---------------- S3: global responsive parity ----------------
    if (wantS3) {
      // 1180px — provider view
      const page1180 = await browser.newPage({ viewport: { width: 1180, height: 900 } });
      await page1180.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page1180.waitForSelector('#role-provider', { timeout: 15000 });
      await page1180.click('#role-provider');
      await page1180.waitForSelector('#view-provider .pv-body', { timeout: 15000 });
      await page1180.waitForTimeout(300);
      const p1180 = await page1180.evaluate(() => {
        const cs = (s) => {
          const el = document.querySelector(s);
          return el ? getComputedStyle(el) : null;
        };
        return {
          pvBody: cs('#view-provider .pv-body')?.gridTemplateColumns,
          scanCol: cs('#view-provider .scan-col')?.position,
          erHead: cs('#view-provider .er-head')?.gridTemplateColumns,
          erFacts: cs('#view-provider .er-facts')?.display,
        };
      });
      eq('S3', '@1180 .pv-body single column', trackCount(p1180.pvBody || ''), 1);
      eq('S3', '@1180 .scan-col static', p1180.scanCol, 'static');
      eq('S3', '@1180 .er-head 4 tracks', trackCount(p1180.erHead || ''), 4);
      eq('S3', '@1180 .er-facts hidden', p1180.erFacts, 'none');
      await page1180.close();

      // 1180px — provider expanded detail (er-detail / dcolb)
      const page1180d = await browser.newPage({ viewport: { width: 1180, height: 900 } });
      await page1180d.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page1180d.waitForSelector('#role-provider', { timeout: 15000 });
      await page1180d.click('#role-provider');
      await page1180d.waitForSelector('#view-provider .er-head', { timeout: 15000 });
      await page1180d.click('#view-provider .er-head');
      await page1180d.waitForSelector('#view-provider .er-detail', { timeout: 15000 });
      await page1180d.waitForTimeout(200);
      const p1180d = await page1180d.evaluate(() => {
        const cs = (s) => {
          const el = document.querySelector(s);
          return el ? getComputedStyle(el) : null;
        };
        return {
          erDetail: cs('#view-provider .er-detail')?.gridTemplateColumns,
        };
      });
      eq('S3', '@1180 .er-detail 3 tracks', trackCount(p1180d.erDetail || ''), 3);
      await page1180d.close();

      // 920px — admin view
      const page920 = await browser.newPage({ viewport: { width: 920, height: 900 } });
      await page920.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page920.waitForSelector('.stat-row', { timeout: 15000 });
      // expand first guest row so .gd exists
      await page920.click('tr[app-guest-row] .gname-btn');
      await page920.waitForSelector('.gd', { timeout: 15000 });
      await page920.waitForTimeout(300);
      const p920 = await page920.evaluate(() => {
        const cs = (s) => {
          const el = document.querySelector(s);
          return el ? getComputedStyle(el) : null;
        };
        const stats = [...document.querySelectorAll('app-metrics-section .stat')];
        return {
          heroDir: cs('app-event-hero .event-hero')?.flexDirection,
          heroAlign: cs('app-event-hero .event-hero')?.alignItems,
          titleSize: cs('app-event-hero .event-title')?.fontSize,
          rowWrap: cs('app-metrics-section .stat-row')?.flexWrap,
          statBasis: stats[0] ? getComputedStyle(stats[0]).flexBasis : null,
          firstStatPadLeft: stats[0] ? getComputedStyle(stats[0]).paddingLeft : null,
          darkBasis: cs('app-metrics-section .stat.dark')?.flexBasis,
          gd: cs('.gd')?.gridTemplateColumns,
          gdCols: [...document.querySelectorAll('.gd-col')].slice(0, 2).map((el) => {
            const s = getComputedStyle(el);
            return { left: s.borderLeftWidth, top: s.borderTopWidth };
          }),
          topbarWrap: cs('.topbar')?.flexWrap,
          roleOrder: cs('.role-switch')?.order,
          roleWidth: cs('.role-switch')?.width,
          roleBtnGrow: cs('.role-switch button')?.flexGrow,
        };
      });
      eq('S3', '@920 .event-hero column', p920.heroDir, 'column');
      eq('S3', '@920 .event-hero align flex-start', p920.heroAlign, 'flex-start');
      eq('S3', '@920 .event-title 42px', p920.titleSize, '42px');
      eq('S3', '@920 .stat-row wraps', p920.rowWrap, 'wrap');
      eq('S3', '@920 .stat basis 46%', p920.statBasis, '46%');
      eq('S3', '@920 .stat:first-child padding-left 20px', p920.firstStatPadLeft, '20px');
      eq('S3', '@920 .stat.dark basis 100%', p920.darkBasis, '100%');
      eq('S3', '@920 .gd single column', trackCount(p920.gd || ''), 1);
      eq('S3', '@920 .gd-col no left border', p920.gdCols?.[1]?.left, '0px');
      eq('S3', '@920 .gd-col:first-child no top divider', p920.gdCols?.[0]?.top, '0px');
      eq('S3', '@920 .gd-col top divider', p920.gdCols?.[1]?.top, '1px');
      eq('S3', '@920 .topbar wraps', p920.topbarWrap, 'wrap');
      eq('S3', '@920 .role-switch order 3', p920.roleOrder, '3');
      check(
        'S3',
        '@920 .role-switch width 100%',
        parseFloat(p920.roleWidth || '0') > 300,
        p920.roleWidth,
      );
      eq('S3', '@920 .role-switch button flex-grow 1', p920.roleBtnGrow, '1');
      await page920.close();

      // 920px — ticket modal (global .ticket/.t-left must be reconciled)
      const page920t = await browser.newPage({ viewport: { width: 920, height: 900 } });
      await page920t.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page920t.waitForSelector('tr[app-guest-row] .ibtn[title="Ver pases QR"]', {
        timeout: 15000,
      });
      await page920t.click('tr[app-guest-row] .ibtn[title="Ver pases QR"]');
      await page920t.waitForSelector('.ticket', { timeout: 15000 });
      await page920t.waitForTimeout(200);
      const p920t = await page920t.evaluate(() => {
        const cs = (s) => {
          const el = document.querySelector(s);
          return el ? getComputedStyle(el) : null;
        };
        return {
          ticket: cs('.ticket')?.gridTemplateColumns,
          tLeftRight: cs('.t-left')?.borderRightWidth,
          tLeftBottom: cs('.t-left')?.borderBottomWidth,
        };
      });
      eq('S3', '@920 .ticket single column', trackCount(p920t.ticket || ''), 1);
      eq('S3', '@920 .t-left no right border', p920t.tLeftRight, '0px');
      eq('S3', '@920 .t-left bottom divider', p920t.tLeftBottom, '1px');
      await page920t.close();
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  if (jsonOut) {
    console.log(JSON.stringify({ slice, results, failed: failed.length }, null, 2));
  } else {
    let current = null;
    for (const r of results) {
      if (r.slice !== current) {
        current = r.slice;
        console.log(`\n=== ${current} ===`);
      }
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label}${r.pass ? '' : `  -> ${r.detail}`}`);
    }
    console.log(
      `\n${results.length - failed.length}/${results.length} checks passed` +
        (failed.length ? ` — ${failed.length} FAILED` : ' — all green'),
    );
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`parity harness error: ${err.message}`);
  process.exit(2);
});
