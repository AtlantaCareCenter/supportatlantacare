// Astro integration: after the build, write the files the short-link Pages Functions need:
//   dist/short-links.json  code → URL table read by functions/[code].js
//   dist/_routes.json      which paths run a Function (just the short codes and the stats
//                          API, so ordinary page views never spend a Function invocation)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { AstroIntegration } from 'astro';
import { shortLinks, routesFile, type RawLink } from './short-links';

const LINKS_DIR = 'src/content/links';

/** The short link files as saved by the editor (frontmatter only; the body is unused). */
export function readLinkFiles(dir = LINKS_DIR): RawLink[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.md$/i.test(f) && !/^readme/i.test(f)).map((f) => {
    const id = f.replace(/\.md$/i, '');
    try {
      const text = readFileSync(join(dir, f), 'utf8');
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const data = fm ? yaml.load(fm[1]) : {};
      return { id, ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}) } as RawLink;
    } catch { return { id }; }
  });
}

/** Everything at the top level of the built site, so a short link never hides a page or file. */
function topLevel(dist: string): { dirs: string[]; files: string[] } {
  try {
    const entries = readdirSync(dist, { withFileTypes: true });
    return { dirs: entries.filter((d) => d.isDirectory()).map((d) => d.name), files: entries.filter((d) => d.isFile()).map((d) => d.name) };
  } catch { return { dirs: [], files: [] }; }
}

export default function shortLinkRedirects(): AstroIntegration {
  return {
    name: 'short-links',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const { dirs, files } = topLevel(dist);
        const links = shortLinks(readLinkFiles(), dirs, (m) => logger.warn(m));
        writeFileSync(join(dist, 'short-links.json'), JSON.stringify(Object.fromEntries(links.map((l) => [l.code, l.url]))));
        writeFileSync(join(dist, '_routes.json'), JSON.stringify(routesFile(links, dirs, files), null, 1));
        logger.info(`${links.length} short link${links.length === 1 ? '' : 's'} → short-links.json, _routes.json`);
      },
    },
  };
}
