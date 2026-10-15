// Where a content file is edited: maps a file under src/content/ to its entry in the
// editor (Sveltia CMS at /admin/), using the collections declared in public/admin/config.yml.
// Lets every page carry a "<page url>admin/" shortcut that opens that page in the editor.
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

type Collection = { name: string; folder?: string };

let collections: Collection[] | undefined;
function folderCollections(): Collection[] {
  if (!collections) {
    let list: unknown = [];
    try { list = (yaml.load(readFileSync('public/admin/config.yml', 'utf8')) as any)?.collections; } catch { /* no config: no shortcuts */ }
    collections = (Array.isArray(list) ? list : [])
      .filter((c: any) => c && typeof c.name === 'string' && typeof c.folder === 'string')
      .map((c: any) => ({ name: c.name, folder: c.folder.replace(/^\.?\//, '').replace(/\/+$/, '') + '/' }))
      .sort((a, b) => b.folder!.length - a.folder!.length);  // deepest folder first: src/content/pages/how-to-help/ beats src/content/pages/
  }
  return collections;
}

/** The editor URL for a content file (e.g. "src/content/pages/about.md"), or undefined if no collection covers it. */
export function editorUrl(filePath: unknown): string | undefined {
  if (typeof filePath !== 'string') return undefined;
  const path = filePath.replace(/^\.?\//, '');
  const c = folderCollections().find((c) => path.startsWith(c.folder!));
  if (!c) return undefined;
  const slug = path.slice(c.folder!.length).replace(/\.[^./]+$/, '');
  return `/admin/#/collections/${c.name}/entries/${slug}`;
}
