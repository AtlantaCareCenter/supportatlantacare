// supportatlantacare.com/<code> → the link's destination, counting the click when a D1
// database is bound as DB (see README "Short links"). Anything that isn't a short link
// falls through to the static site.
import { CODE_RE, loadLinks, visitorId, recordClick } from './_lib/links.js';

export async function onRequestGet({ request, env, params, next, waitUntil }) {
  const code = String(params.code ?? '').toLowerCase();
  if (!CODE_RE.test(code)) return next();
  const links = await loadLinks(env, request);
  const target = links[code];
  if (typeof target !== 'string') return next();
  if (env.DB) {
    const click = (async () => recordClick(env.DB, { code, visitor: await visitorId(request), referrer: request.headers.get('referer') }))();
    waitUntil(click.catch((e) => console.error('[short-links] click not recorded:', e?.message ?? e)));
  }
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(target, request.url).toString(), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
