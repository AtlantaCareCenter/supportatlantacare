import { marked } from 'marked';
import { getEntry } from 'astro:content';

/** Site-wide settings from src/content/singles/site.yml. Refreshed by loadSite() on every page render. */
export let site: any = (await getEntry('singles', 'site'))!.data;
let phoneRe = makePhoneRe();

function makePhoneRe() {
  return new RegExp(`(?<!tel:)${site.phone.replace(/[-.]/g, '[-.]')}`, 'g');
}

/** Call from page frontmatter so edits to site.yml show up without restarting the dev server. */
export async function loadSite() {
  site = (await getEntry('singles', 'site'))!.data;
  phoneRe = makePhoneRe();
  return site;
}

/** Auto-link the clinic phone number wherever it appears as plain text. */
export function linkPhone(html: string): string {
  return html.replace(phoneRe, (m) => `<a href="tel:${site.phone}">${m}</a>`);
}

/** Markdown (block-level) -> HTML. Used for editable rich-text fields. */
export function md(src?: string | null): string {
  if (!src) return '';
  return linkPhone(marked.parse(src, { async: false }) as string);
}

/** Markdown (inline only) -> HTML, with newlines kept as <br>. Used for headings. */
export function mdInline(src?: string | null): string {
  if (!src) return '';
  return linkPhone(
    src
      .split('\n')
      .map((line) => marked.parseInline(line, { async: false }) as string)
      .join('<br>')
      .replace(/<em>/g, '<span class="decorative">')
      .replace(/<\/em>/g, '</span>'),
  );
}
