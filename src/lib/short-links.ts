// Short links: supportatlantacare.com/<code> → any URL, for QR codes and print.
// Codes are two lowercase letters or digits (1296 of them) so the QR code stays small.
// Editors create them in the CMS ("Short links & QR codes"); the build turns them into a
// Cloudflare `_redirects` file (src/lib/short-links-integration.ts) and lists them with
// their QR codes at /admin/links/.

export type ShortLink = { code: string; url: string; label: string };
export type RawLink = { id?: string; code?: unknown; url?: unknown; label?: unknown };

export const CODE_RE = /^[a-z0-9]{2}$/;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A usable code from whatever was saved: the code field, else the file name. */
export function cleanCode(raw: RawLink): string | undefined {
  for (const v of [raw.code, raw.id]) {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : typeof v === 'number' ? String(v) : '';
    if (CODE_RE.test(s)) return s;
  }
  return undefined;
}

/** An absolute http(s) URL or a site path; anything else is unusable. */
export function cleanUrl(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^\/[^\s]*$/.test(s)) return s;
  return undefined;
}

/**
 * The links that will work, in code order. Bad codes, bad URLs, duplicate codes and codes
 * that would hide a real page (e.g. a page at /ab/) are skipped with a warning, never a
 * failed build. `taken` is the set of first path segments the site already uses.
 */
export function shortLinks(raws: RawLink[], taken: Iterable<string> = [], warn: (msg: string) => void = console.warn): ShortLink[] {
  const reserved = new Set([...taken].map((s) => s.toLowerCase()));
  const out = new Map<string, ShortLink>();
  const sorted = [...raws].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')));
  for (const raw of sorted) {
    const where = `short link "${raw.id ?? raw.code ?? '?'}"`;
    const code = cleanCode(raw);
    if (!code) { warn(`[short-links] skipped ${where}: the code must be exactly two lowercase letters or digits`); continue; }
    const url = cleanUrl(raw.url);
    if (!url) { warn(`[short-links] skipped ${where}: the link must start with https:// or /`); continue; }
    if (reserved.has(code)) { warn(`[short-links] skipped ${where}: /${code}/ is already a page on the site`); continue; }
    if (out.has(code)) { warn(`[short-links] skipped ${where}: code ${code} is already used by another short link`); continue; }
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    out.set(code, { code, url, label });
  }
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** The first unused code, counting aa, ab, … a9, ba, …; undefined when all 1296 are taken. */
export function nextFreeCode(used: Iterable<string>): string | undefined {
  const taken = new Set(used);
  for (const a of ALPHABET) for (const b of ALPHABET) if (!taken.has(a + b)) return a + b;
  return undefined;
}

/**
 * Cloudflare Pages `_routes.json`: which paths are handled by the Functions in /functions.
 * Up to ~95 links each get their own rule (so nothing else ever invokes a Function); past
 * that, everything goes through the Functions except the site's own folders and files.
 * (https://developers.cloudflare.com/pages/functions/routing/#create-a-_routesjson-file, 100 rules max)
 */
export function routesFile(links: ShortLink[], siteDirs: string[] = [], siteFiles: string[] = []) {
  const api = ['/api/*'];
  if (links.length + api.length <= 95) return { version: 1, include: [...api, ...links.map((l) => `/${l.code}*`)], exclude: [] };
  const exclude = ['/', ...siteDirs.map((d) => `/${d}/*`), ...siteDirs.map((d) => `/${d}`), ...siteFiles.map((f) => `/${f}`)].slice(0, 98);
  return { version: 1, include: ['/*'], exclude };
}
