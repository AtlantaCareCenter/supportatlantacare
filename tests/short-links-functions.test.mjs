// The Cloudflare Pages Functions behind short links, run in Node against a fake D1 database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as redirect } from '../functions/[code].js';
import { onRequestGet as statsApi } from '../functions/api/stats.js';
import { visitorId, stats } from '../functions/_lib/links.js';

/** Just enough of D1 (prepare/bind/run/all/batch) to exercise the SQL we use. */
function fakeD1() {
  const rows = [];
  const stmt = (sql) => ({ sql, args: [], bind(...a) { this.args = a; return this; },
    async run() { if (/^INSERT/.test(sql)) rows.push({ code: this.args[0], at: this.args[1], visitor: this.args[2], referrer: this.args[3] }); return { success: true }; },
    async all() {
      const [week, month] = this.args;
      const by = {};
      for (const r of rows) {
        const s = by[r.code] ??= { code: r.code, clicks: 0, visitors: new Set(), last: 0, week: 0, month: 0 };
        s.clicks++; s.visitors.add(r.visitor); s.last = Math.max(s.last, r.at); if (r.at >= week) s.week++; if (r.at >= month) s.month++;
      }
      return { results: Object.values(by).map((s) => ({ code: s.code, clicks: s.clicks, unique_visitors: s.visitors.size, last: s.last, week: s.week, month: s.month })) };
    } });
  return { rows, prepare: stmt, async batch(stmts) { return stmts.map(() => ({ success: true })); } };
}
const links = { '7k': 'https://www.myegiving.com/App/Giving/eGiving-96649', ev: '/events/' };
const env = (db) => ({ DB: db, ASSETS: { fetch: async (u) => new URL(u).pathname === '/short-links.json' ? new Response(JSON.stringify(links)) : new Response('', { status: 404 }) } });
const req = (path, headers = {}) => new Request('https://supportatlantacare.com' + path, { headers: { 'cf-connecting-ip': '203.0.113.5', 'user-agent': 'TestBrowser/1', ...headers } });
const pending = [];
const ctx = (path, code, db, headers) => ({ request: req(path, headers), env: env(db), params: { code }, next: async () => new Response('static', { status: 200 }), waitUntil: (p) => pending.push(p) });

test('a known code redirects (302, uncached) and records the click; unknown paths fall through', async () => {
  const db = fakeD1();
  const res = await redirect(ctx('/7k', '7k', db));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), links['7k']);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  await Promise.all(pending.splice(0));
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].code, '7k');
  const rel = await redirect(ctx('/ev', 'ev', db, { referer: 'https://example.org/flyer' }));
  assert.equal(rel.headers.get('Location'), 'https://supportatlantacare.com/events/', 'site paths become absolute');
  await Promise.all(pending.splice(0));
  assert.equal(db.rows[1].referrer, 'https://example.org/flyer');
  for (const [path, code] of [['/zz', 'zz'], ['/about', 'about'], ['/7K', '7K']]) {
    const r = await redirect(ctx(path, code, db));
    assert.equal(r.status, code === '7K' ? 302 : 200, `${path}: ${code === '7K' ? 'codes are case-insensitive' : 'falls through to the static site'}`);
  }
});

test('without a database the redirect still works and the stats API says so', async () => {
  const res = await redirect({ ...ctx('/7k', '7k', undefined), env: { ...env(undefined), DB: undefined } });
  assert.equal(res.status, 302);
  const api = await statsApi({ env: {} });
  assert.equal(api.status, 503);
  assert.deepEqual(await api.json(), { error: 'no-database' });
});

test('stats: clicks, unique visitors, last week / month, last click', async () => {
  const db = fakeD1();
  const now = Date.now();
  const click = (code, ip, daysAgo) => db.rows.push({ code, at: now - daysAgo * 86400000, visitor: ip, referrer: null });
  click('7k', 'a', 0); click('7k', 'a', 1); click('7k', 'b', 10); click('7k', 'c', 40); click('ev', 'a', 2);
  const s = await stats(db, now);
  assert.deepEqual(s['7k'], { clicks: 4, unique: 3, week: 2, month: 3, last: now });
  assert.equal(s.ev.clicks, 1);
  const api = await statsApi({ env: { DB: db } });
  assert.equal(api.status, 200);
  assert.equal((await api.json()).links['7k'].unique, 3);
});

test('visitor id is a stable anonymous hash of ip + browser', async () => {
  const a = await visitorId(req('/7k')), b = await visitorId(req('/7k')), c = await visitorId(req('/7k', { 'user-agent': 'Other/2' }));
  assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes('203.0.113.5'));
});
