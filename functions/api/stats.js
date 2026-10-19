// Click counts for /admin/links/. Public numbers (how often a public link was used), no secrets.
import { stats } from '../_lib/links.js';

export async function onRequestGet({ env }) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!env.DB) return new Response(JSON.stringify({ error: 'no-database' }), { status: 503, headers });
  try {
    return new Response(JSON.stringify({ links: await stats(env.DB), at: Date.now() }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'query-failed', message: String(e?.message ?? e) }), { status: 500, headers });
  }
}
