// "Try to break the site" through the content files, the only thing editors can touch.
// Each test writes nasty content into a throwaway copy of the site and builds it.
// Run with: node --test tests/   (about 2 seconds per scenario)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, mustBuild } from './lib/sandbox.mjs';
import yaml from 'js-yaml';

const scenario = (name, fn) => test(name, { timeout: 120000 }, async (t) => {
  const sb = sandbox();
  try { await fn(t, sb); } finally { sb.done(); }
});

const NASTY_MARKDOWN = `
Unclosed **bold and *italic
<script>alert('hi')</script>
<div style="color:red">raw html
---
## heading with <b>html</b> & ampersand < less
{{ not_a_template }} <% nope %> \${js}
\`\`\`
code fence never closed
| broken | table
[link without url]() ![img]()
Line with emoji 🎉 and “smart quotes” and tabs\t\there
${'very long line '.repeat(400)}
`;

// ---------------------------------------------------------------- the clinic (ordinary carelessness)
scenario('baseline content builds', (t, sb) => { mustBuild(t, sb); });

scenario('page with every optional field blank, null or missing', (t, sb) => {
  sb.page('blank', `---\ntitle: Blank page\nheading: null\ndescription: ''\norder: null\nsections: null\n---\n`);
  sb.page('blank2', `---\ntitle: Blank page two\n---\n`);
  sb.page('blank3', `---\ntitle: Blank page three\nsections:\n- _template: text\n  body: null\n  center: null\n  anchor: ''\n  columns: null\n  button_label: null\n  button_url: ''\n- _template: two_column\n  left: null\n  right: ''\n  style: null\n- _template: help_columns\n  items: null\n- _template: help_columns\n  items:\n  - title: ''\n    icon: null\n  - {}\n- _template: callout\n  heading: ''\n- _template: events_list\n  heading: null\n  empty_text: null\n  show_past: null\n- _template: contact_details\n  intro: null\n  note: ''\n---\n`);
  mustBuild(t, sb);
  assert.ok(sb.exists('dist/blank/index.html') && sb.exists('dist/blank3/index.html'));
});

scenario('numbers typed as text, booleans typed as words', (t, sb) => {
  sb.page('typed', `---\ntitle: Typed\norder: "3"\nsections:\n- _template: text\n  body: hi\n  columns: "3"\n  center: "yes"\n- _template: events_list\n  show_past: "true"\n---\n`);
  sb.write('src/content/singles/home.yml', sb.read('src/content/singles/home.yml').replace('link_url: /events/', 'link_url: /events/\n  limit: "2"'));
  mustBuild(t, sb);
});

scenario('site settings with lists emptied and the phone number missing or odd', (t, sb) => {
  const site = yaml.load(sb.read('src/content/singles/site.yml'));
  Object.assign(site, { nav: null, documents: [], phone: '', mailing_address: null, google_site_verification: null, gtm_id: '' });
  sb.write('src/content/singles/site.yml', yaml.dump(site));
  mustBuild(t, sb, '(empty phone)');
  const home = sb.html('/');
  assert.ok(!/<a href="tel:"><\/a>/.test(home), 'empty phone must not sprinkle empty links everywhere');
  assert.ok(!home.includes('googletagmanager'), 'blank GTM id turns the tag off');
  sb.write('src/content/singles/site.yml', yaml.dump({ ...site, phone: '(404) 870-0788 ext. 2' }));
  mustBuild(t, sb, '(phone with parentheses)');
  assert.ok(sb.html('/about/').includes('tel:(404) 870-0788 ext. 2'), 'odd phone still linked');
  sb.write('src/content/singles/site.yml', 'name: Only a name\n');
  mustBuild(t, sb, '(site settings almost empty)');
  sb.write('src/content/singles/site.yml', '');
  mustBuild(t, sb, '(site settings file empty)');
});

scenario('home page with sections emptied or removed', (t, sb) => {
  sb.write('src/content/singles/home.yml', `description: ''\nhero:\n  video_id: ''\nintro:\n  heading: ''\nsupport:\n  links: null\nservices:\n  items: []\ncallout:\n  heading: ''\nevents: null\n`);
  mustBuild(t, sb, '(gutted home)');
  sb.write('src/content/singles/home.yml', `title: nothing here\n`);
  mustBuild(t, sb, '(home with no sections at all)');
});

scenario('events the way people actually enter them', (t, sb) => {
  sb.event('plain', `---\ntitle: Bake Sale\ndates:\n  - date: 2027-03-02\n    start_time: 10am\n---\nCookies.\n`);                       // unquoted date, lowercase time
  sb.event('nodates', `---\ntitle: No dates yet\nstatus: published\n---\n`);
  sb.event('nulldates', `---\ntitle: Null dates\ndates: null\nrepeat: null\n---\n`);
  sb.event('emptyrow', `---\ntitle: Empty row\ndates:\n  - {}\n  - date: null\n  - date: ''\n    start_time: null\n---\n`);
  sb.event('badstatus', `---\ntitle: Typo status\nstatus: pubished\ndates:\n  - date: 2027-03-02\n---\n`);
  sb.event('garbage', `---\ntitle: Garbage\nstatus: published\npublish_on: soon\nremove_after: never\ndates:\n  - date: next tuesday\n  - date: 2027-02-30\n  - date: 2027-03-02\nrepeat:\n  rule: sometimes\n  every: -2\n  until: whenever\n---\n`);
  sb.event('oldweekly', `---\ntitle: Old weekly\nstatus: published\ndates:\n  - date: 2015-06-05\nrepeat:\n  rule: weekly\n---\n`);
  sb.event('notitle', `---\nstatus: published\ndates:\n  - date: 2027-03-02\n---\nAn event with no title.\n`);
  mustBuild(t, sb);
  const list = sb.html('/events/');
  assert.ok(list.includes('Bake Sale') && list.includes('Garbage') && list.includes('Old weekly'), 'valid parts of messy events still list');
  assert.ok(!list.includes('Typo status'), 'unknown status is hidden');
  assert.ok(!list.includes('No dates yet'), 'dateless event is not listed');
  assert.ok(sb.exists('dist/events/notitle/index.html'), 'titleless event still gets a page');
});

// ---------------------------------------------------------------- the jackass (deliberate mischief)
scenario('markdown and titles full of html, template syntax and junk', (t, sb) => {
  sb.page('junk', `---\ntitle: "<script>alert(1)</script> & \\"quotes\\" {{x}}"\nheading: "'; DROP TABLE pages; --"\ndescription: "${'x'.repeat(5000)}"\nsections:\n- _template: text\n  body: |\n${NASTY_MARKDOWN.split('\n').map((l) => '    ' + l).join('\n')}\n- _template: callout\n  heading: |\n    [a](javascript:alert(1)) <img src=x onerror=alert(1)>\n    **bold *nested** italic*\n---\n${NASTY_MARKDOWN}\n`);
  sb.event('junk', `---\ntitle: "{{ title }} <b>bold</b>"\nstatus: published\ndates:\n  - date: 2027-03-02\n    start_time: "<script>x</script>"\nlocation: "<marquee>here</marquee>"\nrepeat:\n  rule: weekly\n  summary: "<img src=x onerror=alert(1)>"\n---\n${NASTY_MARKDOWN}\n`);
  mustBuild(t, sb);
  const page = sb.html('/junk/');
  assert.ok(!page.includes('<script>alert(1)</script></title>'), 'title is escaped in <title>');
  const ev = sb.html('/events/junk/');
  assert.ok(!ev.includes('<script>x</script>'), 'event fields are escaped');
});

scenario('pages that collide with built-in routes or each other', (t, sb) => {
  sb.page('admin', `---\ntitle: I am the admin page now\n---\n`);
  sb.page('index', `---\ntitle: I am the home page now\n---\n`);
  sb.page('404', `---\ntitle: Not found page\n---\n`);
  sb.page('events', `---\ntitle: Events replaced\n---\n`);          // overwrites the real events page
  sb.event('index', `---\ntitle: Event called index\nstatus: published\ndates:\n  - date: 2027-03-02\n---\n`);
  sb.event('events', `---\ntitle: Event called events\nstatus: published\ndates:\n  - date: 2027-03-02\n---\n`);
  mustBuild(t, sb);
  assert.ok(sb.html('/admin/').includes('sveltia-cms'), 'the editor page still wins at /admin/');
  assert.ok(sb.html('/').includes('video-hero'), 'the real home page still wins at /');
});

scenario('weird slugs and file names', (t, sb) => {
  sb.page('UPPER Case & Spaces', `---\ntitle: Odd name\n---\n`);
  sb.page('émilie-café', `---\ntitle: Accents\n---\n`);
  sb.page('a/b/c/deep', `---\ntitle: Deep\n---\n`);
  sb.page('.hidden', `---\ntitle: Hidden\n---\n`);
  sb.write('src/content/pages/notes.txt', 'not markdown');
  sb.write('src/content/events/README.md', '# readme without frontmatter\n');
  sb.event('frontmatter-only', `---\ntitle: FM only\n---`);
  mustBuild(t, sb);
});

scenario('links and images pointing nowhere', (t, sb) => {
  sb.page('broken', `---\ntitle: Broken links\nsections:\n- _template: two_column\n  left_image: /images/does-not-exist.png\n  right: "[x](/nowhere/) ![y](/images/nope.jpg)"\n  button_label: Go\n  button_url: ''\n- _template: help_columns\n  items:\n  - title: A\n    icon: ''\n    link_label: Go\n    link_url: null\n---\n`);
  sb.write('src/content/singles/home.yml', sb.read('src/content/singles/home.yml').replace('image: /images/home-header-image.jpg', 'image: /images/missing.jpg'));
  mustBuild(t, sb);
});

// ---------------------------------------------------------------- the monkey (random destruction)
scenario('every page deleted', (t, sb) => {
  sb.clear('src/content/pages');
  mustBuild(t, sb);
  assert.ok(sb.html('/').includes('Hope-Filled'), 'home still builds with no pages');
});

scenario('every event deleted, then the events folder itself', (t, sb) => {
  sb.clear('src/content/events');
  mustBuild(t, sb, '(empty events folder)');
  assert.ok(sb.html('/events/').includes('no events planned'), 'empty state shows');
  sb.remove('src/content/events');
  mustBuild(t, sb, '(no events folder)');
});

scenario('a file saved half-way: broken frontmatter', (t, sb) => {
  sb.page('half', `---\ntitle: Half\nsections:\n- _template: text\n  body: "unterminated\n---\n`);
  const { ok } = sb.build();
  t.diagnostic(ok ? 'build tolerated the broken file' : 'build fails on a syntactically broken file (the editor never writes one; accepted)');
});

scenario('hundreds of events and pages', (t, sb) => {
  for (let i = 0; i < 300; i++) sb.event(`ev-${i}`, `---\ntitle: Event ${i}\nstatus: published\ndates:\n  - date: 2027-0${1 + (i % 9)}-1${i % 9}\nrepeat:\n  rule: ${['none', 'weekly', 'monthly_weekday'][i % 3]}\n---\nbody ${i}\n`);
  for (let i = 0; i < 100; i++) sb.page(`p-${i}`, `---\ntitle: Page ${i}\nsections:\n- _template: events_list\n  show_past: true\n---\n`);
  const started = Date.now();
  mustBuild(t, sb);
  t.diagnostic(`built 400 extra pages in ${((Date.now() - started) / 1000).toFixed(1)}s`);
});

scenario('unknown, mangled and duplicated section types', (t, sb) => {
  sb.page('mangled', `---\ntitle: Mangled\nsections:\n- _template: banana\n  body: hi\n- just a string\n- 42\n- null\n- []\n- _template: text\n- _template: text\n  body: survives\n---\n`);
  sb.page('scalar', `---\ntitle: Sections is text\nsections: hello\n---\n`);
  sb.page('nofm', `No frontmatter at all, just words.\n`);
  sb.page('listfm', `---\n- a\n- b\n---\n`);
  const out = mustBuild(t, sb);
  assert.ok(sb.html('/mangled/').includes('survives'), 'good sections survive next to bad ones');
  assert.ok(/skipped page section/.test(out), 'skipped sections are reported in the build log');
});

scenario('events list section placed on several pages and home limit nonsense', (t, sb) => {
  sb.page('a', `---\ntitle: A\nsections:\n- _template: events_list\n- _template: events_list\n  show_past: yes\n---\n`);
  const home = yaml.load(sb.read('src/content/singles/home.yml'));
  for (const limit of [0, -1, 'lots', 999]) {
    sb.write('src/content/singles/home.yml', yaml.dump({ ...home, events: { ...home.events, limit } }));
    mustBuild(t, sb, `(limit=${limit})`);
  }
});

// ---------------------------------------------------------------- private site: nothing is indexable
scenario('every page, the robots.txt and the headers file tell search engines to stay away', (t, sb) => {
  sb.event('open', `---\ntitle: Open house\nstatus: published\ndates:\n  - date: 2027-03-02\nlocation: 1801 Peachtree St. Suite 225, Atlanta, GA 30309\n---\n`);
  mustBuild(t, sb);
  for (const route of ['/', '/about/', '/events/', '/events/open/', '/admin/']) {
    const html = sb.html(route);
    const tags = html.match(/<meta name="robots"[^>]*>/g) ?? [];
    assert.equal(tags.length, 1, `${route} has exactly one robots meta tag: ${tags.join(' ')}`);
    assert.match(tags[0], /noindex/); assert.match(tags[0], /nofollow/);
  }
  assert.match(sb.read('dist/404.html'), /<meta name="robots" content="noindex, nofollow/);
  const robots = sb.read('dist/robots.txt');
  assert.match(robots, /^User-agent: \*$/m); assert.match(robots, /^Disallow: \/$/m);
  assert.doesNotMatch(robots, /Sitemap:/, 'a private site advertises no sitemap');
  assert.ok(!sb.exists('dist/sitemap-index.xml') && !sb.exists('dist/sitemap-0.xml'), 'no sitemap is generated');
  assert.match(sb.read('dist/_headers'), /^\/\*\n\s+X-Robots-Tag: noindex, nofollow/m, 'X-Robots-Tag header for every file (PDFs, images)');
  assert.match(sb.read('dist/humans.txt'), /\/\* TEAM \*\//);
  // the event's location is a clickable Google Maps link
  const page = sb.html('/events/open/');
  assert.match(page, /<a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&(amp;)?query=1801%20Peachtree%20St\.%20Suite%20225%2C%20Atlanta%2C%20GA%2030309" target="_blank" rel="noopener">1801 Peachtree St\. Suite 225, Atlanta, GA 30309<\/a>/);
  assert.match(sb.html('/events/'), /maps\/search\/\?api=1&(amp;)?query=1801%20Peachtree/, 'listing links it too');
  assert.ok(sb.exists('dist/admin/editor-help.js'), 'editor add-on ships with the site');
});

// ---------------------------------------------------------------- "/admin" after any page url opens that page in the editor
scenario('every page and event gets an /admin/ shortcut into the editor', (t, sb) => {
  sb.event('open', `---\ntitle: Open house\nstatus: published\ndates:\n  - date: 2027-03-02\n---\n`);
  sb.page('deep/nested/thing', `---\ntitle: Deep\n---\n`);   // no editor collection covers this folder... except "pages" does
  mustBuild(t, sb);
  const target = (route) => sb.html(route + 'admin/').match(/<meta http-equiv="refresh" content="0; url=([^"]+)"/)?.[1];
  assert.equal(target('/about/'), '/admin/#/collections/pages/entries/about');
  assert.equal(target('/how-to-help/'), '/admin/#/collections/pages/entries/how-to-help');
  assert.equal(target('/how-to-help/individuals/'), '/admin/#/collections/how-to-help/entries/individuals', 'sub-folder collection wins over the parent');
  assert.equal(target('/events/'), '/admin/#/collections/pages/entries/events', 'the Events page itself');
  assert.equal(target('/events/open/'), '/admin/#/collections/events/entries/open');
  assert.equal(target('/deep/nested/thing/'), '/admin/#/collections/pages/entries/deep/nested/thing');
  const html = sb.html('/about/admin/');
  assert.match(html, /const url = "\/admin\/#\/collections\/pages\/entries\/about";\s*location\.replace\(url\)/, 'script redirect too, for browsers that ignore meta refresh');
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(sb.html('/admin/'), /sveltia-cms\.js/, 'the editor itself is still at /admin/');
});
