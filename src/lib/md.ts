import { marked } from 'marked';
import { normalizeSite, single } from './safe';

/** Site-wide settings from src/content/singles/site.yml. Refreshed by loadSite() on every page render. */
export let site = normalizeSite(await single('site'));
let phoneRe = makePhoneRe();

function makePhoneRe(): RegExp | null {
  const digits = site.phone.replace(/\D/g, '');
  if (digits.length < 7) return null;               // blank or not a phone number: link nothing
  const escaped = site.phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?[-.]/g, '[-.]');
  return new RegExp(`(?<!tel:)${escaped}`, 'g');
}

/** Call from page frontmatter so edits to site.yml show up without restarting the dev server. */
export async function loadSite() {
  site = normalizeSite(await single('site'));
  phoneRe = makePhoneRe();
  return site;
}

/** Auto-link the clinic phone number wherever it appears as plain text. */
export function linkPhone(html: string): string {
  return phoneRe ? html.replace(phoneRe, (m) => `<a href="tel:${site.phone}">${m}</a>`) : html;
}

/** Markdown (block-level) -> HTML. Used for editable rich-text fields. */
export function md(src?: unknown): string {
  if (typeof src !== 'string' || !src) return '';
  return linkPhone(marked.parse(src, { async: false }) as string);
}

/** Markdown (inline only) -> HTML, with newlines kept as <br>. Used for headings. */
export function mdInline(src?: unknown): string {
  if (typeof src !== 'string' || !src) return '';
  return linkPhone(
    src
      .split('\n')
      .map((line) => marked.parseInline(line, { async: false }) as string)
      .join('<br>')
      .replace(/<em>/g, '<span class="decorative">')
      .replace(/<\/em>/g, '</span>'),
  );
}
