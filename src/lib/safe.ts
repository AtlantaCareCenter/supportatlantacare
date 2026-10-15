import { getEntry } from 'astro:content';

/** Read a Site Settings / Home file; an empty or unreadable file reads as {}. */
export async function single(id: 'site' | 'home'): Promise<unknown> {
  try { return (await getEntry('singles', id))?.data ?? {}; } catch { return {}; }
}

// Site Settings and the Home page are free-form YAML edited in the CMS. These helpers
// turn whatever is in those files into a predictable shape, so a blanked field, a
// deleted list or an empty file can never crash a page.

export const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fallback;
export const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as any) : {});
export const arr = (v: unknown): any[] => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);
const num = (v: unknown, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; };
const link = (v: unknown) => { const o = obj(v); return { label: str(o.label), url: str(o.url) }; };
/** The "More buttons" list of a section: items with a label, in order. */
export const buttons = (v: unknown) => arr(obj(v).buttons).map(link).filter((b) => b.label);

export function normalizeSite(raw: unknown) {
  const s = obj(raw);
  const name = str(s.name, 'Atlanta Care Center');
  return {
    ...s,
    name,
    short_name: str(s.short_name, name),
    tagline: str(s.tagline),
    banner_title: str(s.banner_title, name),
    donate_url: str(s.donate_url),
    donate_label: str(s.donate_label, 'Donate Now'),
    footer_button_label: str(s.footer_button_label, 'Make A Donation'),
    video_url: str(s.video_url),
    phone: str(s.phone).trim(),
    address: str(s.address),
    mailing_address: str(s.mailing_address),
    map_url: str(s.map_url),
    footer_blurb: str(s.footer_blurb),
    disclaimer: str(s.disclaimer),
    gtm_id: /^GTM-[A-Z0-9]+$/i.test(str(s.gtm_id).trim()) ? str(s.gtm_id).trim() : '',
    google_site_verification: arr(s.google_site_verification).map((v) => str(obj(v).token ?? v)).filter(Boolean),
    documents: arr(s.documents).map((d) => ({ label: str(obj(d).label), file: str(obj(d).file) })).filter((d) => d.label && d.file),
    nav: arr(s.nav).map((n) => ({ ...link(n), children: arr(obj(n).children).map(link).filter((c) => c.label) })).filter((n) => n.label),
  };
}

export function normalizeHome(raw: unknown) {
  const h = obj(raw);
  const section = (k: string) => obj(h[k]);
  const hero = section('hero'), intro = section('intro'), support = section('support'),
    services = section('services'), callout = section('callout'), events = section('events');
  return {
    description: str(h.description),
    hero: { video_id: str(hero.video_id).replace(/\D/g, ''), play_label: str(hero.play_label, 'Watch the video') },
    intro: { heading: str(intro.heading), text: str(intro.text), image: str(intro.image), button_label: str(intro.button_label), button_url: str(intro.button_url), buttons: buttons(intro) },
    support: {
      image: str(support.image), heading: str(support.heading), text: str(support.text),
      links: arr(support.links).map((l) => ({ title: str(obj(l).title), icon: str(obj(l).icon), link_label: str(obj(l).link_label), link_url: str(obj(l).link_url) })).filter((l) => l.title),
    },
    services: {
      heading: str(services.heading), text: str(services.text), background_image: str(services.background_image),
      items: arr(services.items).map((i) => ({ title: str(obj(i).title), icon: str(obj(i).icon) })).filter((i) => i.title),
      button_label: str(services.button_label), button_url: str(services.button_url), buttons: buttons(services),
    },
    callout: { heading: str(callout.heading), text: str(callout.text), button_label: str(callout.button_label), button_url: str(callout.button_url), buttons: buttons(callout) },
    events: { heading: str(events.heading, 'Upcoming Events'), text: str(events.text, 'Coming Soon!'), limit: num(events.limit, 3), link_label: str(events.link_label), link_url: str(events.link_url, '/events/') },
  };
}
