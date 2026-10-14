// A throwaway copy of the site to build against nasty content, without touching the real files.
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, symlinkSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export const ROOT = join(import.meta.dirname, '..', '..');

export function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'site-fuzz-'));
  for (const f of ['src', 'public', 'astro.config.mjs', 'package.json', 'tsconfig.json']) cpSync(join(ROOT, f), join(dir, f), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  const sb = {
    dir,
    content: join(dir, 'src', 'content'),
    write(rel, text) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; },
    page(slug, text) { return sb.write(`src/content/pages/${slug}.md`, text); },
    event(slug, text) { return sb.write(`src/content/events/${slug}.md`, text); },
    read(rel) { return readFileSync(join(dir, rel), 'utf8'); },
    exists(rel) { return existsSync(join(dir, rel)); },
    remove(rel) { rmSync(join(dir, rel), { recursive: true, force: true }); },
    clear(rel) { for (const f of readdirSync(join(dir, rel))) rmSync(join(dir, rel, f), { recursive: true, force: true }); },
    html(route) { return sb.read(`dist/${route.replace(/^\//, '')}${route.endsWith('/') || route === '' ? 'index.html' : ''}`); },
    build() {
      const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'astro'), ['build'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
      const out = (r.stdout || '') + (r.stderr || '');
      return { ok: r.status === 0 && existsSync(join(dir, 'dist', 'index.html')), out };
    },
    done() { rmSync(dir, { recursive: true, force: true }); },
  };
  return sb;
}

/** Run a build and fail loudly with the build output if it broke. */
export function mustBuild(t, sb, label = '') {
  const { ok, out } = sb.build();
  if (!ok) t.diagnostic(out.split('\n').filter((l) => /error|Error|expected|received|Location|\.md|\.yml/i.test(l)).slice(0, 12).join('\n'));
  if (!ok) throw new Error(`build failed ${label}\n` + out.split('\n').filter((l) => /error|Error|Expected|received|Location|\.md|\.yml|\.astro/.test(l)).slice(0, 8).join('\n'));
  return out;
}
