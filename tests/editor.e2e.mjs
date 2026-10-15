// Drives the real Sveltia editor in headless Chrome to check public/admin/editor-help.js:
// a refused save must name the missing fields, scroll to the first one and flash them.
// Needs Chrome and the network (Sveltia is loaded from unpkg, as on the live site). Not part
// of `npm test`; run it after changing the add-on or bumping Sveltia:
//     npm run test:editor          (CHROME_PATH=/path/to/chrome if it isn't /usr/bin/google-chrome)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
if (spawnSync(CHROME, ['--version']).status !== 0) { console.log(`skipped: no Chrome at ${CHROME} (set CHROME_PATH)`); process.exit(0); }
let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; } catch { console.log('skipped: run `npm i --no-save puppeteer-core` first'); process.exit(0); }

// A copy of /admin/ whose config uses Sveltia's built-in in-memory "test-repo" backend.
const config = readFileSync(join(ROOT, 'public/admin/config.yml'), 'utf8')
  .replace(/^backend:[\s\S]*?(?=^\w)/m, 'backend:\n  name: test-repo\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>editor test</title>
<link href="/config.yml" type="text/yaml" rel="cms-config-url"></head><body>
<script src="https://unpkg.com/@sveltia/cms@0/dist/sveltia-cms.js"></script><script src="/editor-help.js"></script></body></html>`;
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/config.yml') return res.writeHead(200, { 'content-type': 'text/yaml' }).end(config);
  if (path === '/editor-help.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(join(ROOT, 'public/admin/editor-help.js')));
  res.writeHead(200, { 'content-type': 'text/html' }).end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 700 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const clickText = (re) => page.evaluate((src) => {
    const r = new RegExp(src);
    const b = [...document.querySelectorAll('button')].find((b) => r.test((b.getAttribute('aria-label') || b.textContent).replace(/[⁨⁩]/g, '').trim()));
    if (b) b.click(); return !!b;
  }, re.source);
  const field = (k) => `.field[data-key-path="${k}"]`;
  const inView = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, sel);
  const className = (sel) => page.evaluate((s) => document.querySelector(s).className, sel);
  const banner = () => page.evaluate(() => document.querySelector('.acc-errors')?.innerText.replace(/\s+/g, ' ') ?? null);
  const scrollToBottom = () => page.evaluate(() => { const c = document.querySelector('.content-editor .pane[data-mode="edit"] .content'); c.scrollTop = c.scrollHeight; });

  await page.goto(base + '/', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  assert.ok(await clickText(/^Work with Test Repository$/), 'Sveltia loaded with the test backend');
  await sleep(2000);
  await page.goto(base + '/#/collections/events/new', { waitUntil: 'networkidle0' });
  await sleep(2000);
  assert.ok(await page.$('.acc-required-note'), 'required-fields note above the form');
  assert.ok(await page.$(`${field('title')} > header .required`), 'Title is marked required');

  await scrollToBottom(); await sleep(300);
  assert.equal(await inView(field('title')), false, 'first error starts off screen');
  assert.ok(await clickText(/^Save$/));
  await sleep(500);
  let t = await banner();
  assert.match(t, /2 fields need attention/, t);
  assert.match(t, /Title — This field is required\./);
  assert.match(t, /Dates — This field is required\./);
  assert.match(await className(field('title')), /acc-invalid/);
  assert.match(await className(field('title')), /acc-flash/, 'flashing');
  assert.match(await className(field('dates')), /acc-flash/, 'all of them flash');
  await sleep(900);
  assert.equal(await inView(field('title')), true, 'scrolled to the first problem');
  await sleep(1200);
  assert.doesNotMatch(await className(field('title')), /acc-flash/, 'flash stops after three pulses');

  await page.type(`${field('title')} input`, 'Bake Sale');
  await sleep(500);
  t = await banner();
  assert.match(t, /1 field needs attention/, 'banner updates as fields are fixed');
  assert.doesNotMatch(t, /Title/);
  assert.doesNotMatch(await className(field('title')), /acc-invalid/);

  await scrollToBottom();
  await page.evaluate(() => [...document.querySelectorAll('.acc-errors li button')].find((b) => b.textContent === 'Dates').click());
  await sleep(900);
  assert.equal(await inView(field('dates')), true, 'clicking a name in the banner jumps to the field');

  assert.ok(await clickText(/Add Dates/)); await sleep(400);
  await clickText(/^Save$/); await sleep(600);
  assert.match(await banner(), /Dates › Date — This field is required\./, 'a field inside a list is named with its parent');
  await clickText(/^Today$/); await sleep(600);
  assert.equal(await banner(), null, 'banner goes away once everything is fixed');

  await page.click(`${field('title')} input`, { clickCount: 3 }); await page.keyboard.press('Backspace'); await sleep(300);
  await clickText(/^Save$/); await sleep(600);
  assert.match(await banner(), /Title — This field is required\./);
  await page.click('.acc-errors .acc-close'); await sleep(300);
  assert.equal(await banner(), null, 'banner can be closed');
  await clickText(/^Save$/); await sleep(600);
  assert.equal(await banner(), null, 'stays closed for the same errors');
  assert.match(await className(field('title')), /acc-invalid/, 'the field itself stays marked');
  assert.deepEqual(errors, [], 'no script errors');
  console.log('editor add-on: all checks passed');
} finally {
  await browser.close();
  server.close();
}
