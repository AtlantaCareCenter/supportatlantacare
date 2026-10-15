// Shared by the short-link Pages Functions (functions/[code].js, functions/api/stats.js).
// Runs on Cloudflare, not in the site build. Plain ESM so it can be unit-tested in Node.

export const CODE_RE = /^[a-z0-9]{2}$/;

/** The code → URL table the build wrote to /short-links.json (src/lib/short-links-integration.ts). */
export async function loadLinks(env, request) {
  try {
    const res = await env.ASSETS.fetch(new URL('/short-links.json', request.url));
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

/** A stable, anonymous id for "unique clicks": a hash of the visitor's IP and browser. */
export async function visitorId(request, salt = '') {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const ua = request.headers.get('user-agent') || '';
  const data = new TextEncoder().encode(`${salt}|${ip}|${ua}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS clicks (code TEXT NOT NULL, at INTEGER NOT NULL, visitor TEXT NOT NULL, referrer TEXT)',
  'CREATE INDEX IF NOT EXISTS clicks_code_at ON clicks (code, at)',
];
let ready;
/** Create the table on first use, so binding an empty D1 database is all the setup there is. */
export function ensureSchema(db) {
  ready ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((e) => { ready = undefined; throw e; });
  return ready;
}

export async function recordClick(db, { code, visitor, referrer = null, at = Date.now() }) {
  await ensureSchema(db);
  await db.prepare('INSERT INTO clicks (code, at, visitor, referrer) VALUES (?1, ?2, ?3, ?4)').bind(code, at, visitor, referrer).run();
}

/** Per-code totals: { "7k": { clicks, unique, week, month, last }, ... } */
export async function stats(db, now = Date.now()) {
  await ensureSchema(db);
  const week = now - 7 * 86400000, month = now - 30 * 86400000;
  const { results } = await db.prepare(
    `SELECT code, COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS unique_visitors, MAX(at) AS last,
            SUM(CASE WHEN at >= ?1 THEN 1 ELSE 0 END) AS week, SUM(CASE WHEN at >= ?2 THEN 1 ELSE 0 END) AS month
     FROM clicks GROUP BY code`,
  ).bind(week, month).all();
  const out = {};
  for (const r of results ?? []) out[r.code] = { clicks: r.clicks, unique: r.unique_visitors, week: r.week, month: r.month, last: r.last };
  return out;
}
