// Pure logic tests for short links. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortLinks, nextFreeCode, routesFile, cleanCode, cleanUrl } from '../src/lib/short-links.ts';

const quiet = () => {};

test('codes: two lowercase letters or digits, from the field or the file name', () => {
  assert.equal(cleanCode({ id: 'ab' }), 'ab');
  assert.equal(cleanCode({ id: 'xx', code: '7K' }), '7k');
  assert.equal(cleanCode({ id: 'abc', code: ' 9z ' }), '9z');
  assert.equal(cleanCode({ id: 'abc', code: 'toolong' }), undefined);
  assert.equal(cleanCode({ id: 'a' }), undefined);
  assert.equal(cleanCode({ id: 'a-' }), undefined);
  assert.equal(cleanCode({ code: 42 }), '42');
});

test('urls: https or a site path', () => {
  assert.equal(cleanUrl('https://example.org/x?y=1'), 'https://example.org/x?y=1');
  assert.equal(cleanUrl(' /events/gala/ '), '/events/gala/');
  assert.equal(cleanUrl('example.org'), undefined);
  assert.equal(cleanUrl('javascript:alert(1)'), undefined);
  assert.equal(cleanUrl('https://bad url'), undefined);
  assert.equal(cleanUrl(null), undefined);
});

test('duplicates, bad entries and page collisions are skipped with a warning', () => {
  const warnings = [];
  const links = shortLinks([
    { id: 'zz', url: '/events/', label: 'Events' },
    { id: 'ab', url: 'https://example.org/1' },
    { id: 'ab-copy', code: 'ab', url: 'https://example.org/2' },      // same code again
    { id: 'cd', url: 'not a url' },
    { id: 'bad code', url: 'https://example.org' },
    { id: 'ev', url: 'https://example.org' },                         // hides a real page
    { id: 'q1', url: 'https://example.org/q', label: 7 },
  ], ['ev', 'admin'], (m) => warnings.push(m));
  assert.deepEqual(links.map((l) => `${l.code} ${l.url} ${l.label}`), ['ab https://example.org/1 ', 'q1 https://example.org/q ', 'zz /events/ Events']);
  assert.equal(warnings.length, 4);
  assert.ok(warnings.some((w) => /already used/.test(w)) && warnings.some((w) => /already a page/.test(w)));
});

test('next free code counts from aa; _routes.json names each short code, or falls back past 95 links', () => {
  assert.equal(nextFreeCode([]), 'aa');
  assert.equal(nextFreeCode(['aa', 'ab']), 'ac');
  const all = []; for (const a of 'abcdefghijklmnopqrstuvwxyz0123456789') for (const b of 'abcdefghijklmnopqrstuvwxyz0123456789') all.push(a + b);
  assert.equal(all.length, 1296);
  assert.equal(nextFreeCode(all), undefined);
  assert.equal(nextFreeCode(all.slice(0, 1295)), '99');
  const two = [{ code: 'ab', url: 'https://example.org/1', label: '' }, { code: 'q1', url: '/events/', label: 'x' }];
  assert.deepEqual(routesFile(two, ['about'], ['robots.txt']), { version: 1, include: ['/api/*', '/ab*', '/q1*'], exclude: [] });
  const many = all.slice(0, 120).map((code) => ({ code, url: '/', label: '' }));
  const r = routesFile(many, ['about', 'events'], ['robots.txt', 'favicon.ico']);
  assert.deepEqual(r.include, ['/*']);
  assert.ok(r.exclude.includes('/about/*') && r.exclude.includes('/events') && r.exclude.includes('/robots.txt') && r.exclude.includes('/'));
  assert.ok(r.include.length + r.exclude.length <= 100, 'Cloudflare allows 100 rules');
});
