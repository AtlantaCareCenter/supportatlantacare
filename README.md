# Support Atlanta Care Center — website

A static rebuild of [supportatlantacare.com](https://supportatlantacare.com), the donor-facing
sister site of [atlantacare.com](https://github.com/acklenx/atlantacare). Same approach: anyone
can edit it from a browser, no developer, (almost) no hosting bill.

- **Site:** [Astro](https://astro.build) → plain HTML/CSS. 9 pages, ~1 second build.
- **Content:** Markdown + YAML files in `src/content/`. That *is* the database.
- **Hosting:** Cloudflare Pages (free) with the source on GitHub (free).
- **Editing:** a form-based editor at `/admin/` ([Sveltia CMS](https://github.com/sveltia/sveltia-cms))
  that reads and writes the content files.

```
src/content/singles/site.yml   phone, addresses, donate link, menu, footer text
src/content/singles/home.yml   the home page (video banner, sections)
src/content/pages/*.md         every other page (folders = URL paths)
public/images/                 photos and icons
public/docs/                   the privacy policy and terms PDFs
```

## Run it locally

```bash
npm install
npm run dev            # site at http://localhost:8172, editor at /admin/
```

## How editing works

Every page is made of a small set of blocks the editor understands:

| Block | What it is |
|---|---|
| Call to action | Centered heading over the rose watermark, optional red button. A `[link](url)` in the heading becomes the red underlined line. |
| Text block | Rich text, optionally centered, with an optional red button under it |
| Two columns | Two side-by-side columns; each is text *or* an image; optional grey background |
| Icon columns | Individuals / Businesses / Churches icons with buttons |
| Contact details | Intro text beside a panel with the phone number and addresses from Site Settings |
| Events list | Upcoming events from the Events collection, optionally past events too |

The donate link, phone number and addresses live in **Site Settings** and appear everywhere
automatically (the phone number is auto-linked wherever it's typed).

### Events

Events are their own thing in the editor (**Events** in the left column), one entry per event.
The Events page and the home page's "Upcoming Events" block list them automatically; when
there are none, each shows its own "Coming Soon" wording instead.

- **New event:** Events → New Event, fill in the form, Save. Fastest is to open an old one and
  choose **Duplicate** from the menu, then change the title and dates.
- **Dates:** one row per day. An event on three days is one event with three dates.
- **Repeats:** enter the first date, then under Repeats pick weekly, monthly on the same
  weekday ("first Friday"), monthly on the same date, or yearly. The site works out the next
  dates and writes "The first Friday of every month" unless you type your own wording.
  Set "Until" to stop at some point; leave it blank to run indefinitely.
- **Status:** *Published* shows it; *Draft* hides it but builds a preview page at
  `/events/<name>/` with a yellow banner, so it can be checked on the real site before
  publishing; *Archived* hides it and keeps it in the editor for later.
- **Go live on / Remove after:** blank means live as soon as it's published and taken down
  the day after its last date. Set them to schedule it or keep it up longer.
- **Past events:** off by default. Turn on "Show past events" on the Events page's list
  section to add a Past Events list; archived and draft events never appear there.
- **Location:** whatever is typed (a venue name, a street address, or both) becomes a
  Google Maps link on the site.

Two example events are included as drafts to duplicate from.

### The editor — Sveltia CMS (`/admin/`)

- Zero build step; one `<script>` tag (`src/pages/admin.astro`) and one config file
  (`public/admin/config.yml`).
- Editors sign in with GitHub. Saving commits straight to the repo; Cloudflare rebuilds
  the site in ~30 seconds.
- On a laptop, open `http://localhost:8172/admin/` in Chrome/Edge and choose
  **Work with Local Repository** → pick this folder. Edits are written to disk
  and the dev server reloads.
- Required fields are marked `*`. If Save is refused because something is missing or
  invalid, a banner at the top names each field (click one to jump to it), the page scrolls
  to the first one and every one of them flashes red until it's fixed. That is
  `public/admin/editor-help.js`, a small add-on that only watches the editor's own
  "This field is required" notes, so a Sveltia update can't break it.

## Tests: nothing an editor saves can break the build

```bash
npm test     # about 30 seconds
```

`tests/content.test.mjs` copies the site to a temp folder, writes the kinds of content a
careless, mischievous or random editor could save (blank and deleted fields, wrong types,
broken markdown, HTML and script tags, colliding page names, everything deleted, hundreds
of events), and builds each. `tests/events.test.mjs` checks event scheduling and repeats.
The content schema is deliberately forgiving: bad values are ignored and a section it can't
understand is skipped with a `[content] skipped ...` warning in the Cloudflare build log,
instead of failing the deploy. Run the tests before merging any code change.

## Private: not for search engines

This site is for supporters we send the link to, so it asks search engines to stay away in
three places (the tests check all of them): a `noindex, nofollow` robots meta tag on every
page (`src/layouts/Base.astro` and `src/pages/admin.astro`), `public/robots.txt`
(`Disallow: /`), and an `X-Robots-Tag` response header on every file including the PDFs
(`public/_headers`, read by Cloudflare Pages). There is deliberately no sitemap. The public
atlantacare.com site is the opposite: indexable, with a sitemap.

## Going live (Cloudflare Pages + GitHub)

1. The source lives at [acklenx/supportatlantacare](https://github.com/acklenx/supportatlantacare) (`main`).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add the custom domain `supportatlantacare.com` (and `www.supportatlantacare.com`) in
   Pages → Custom domains. This needs the domain's DNS on Cloudflare — check who controls it
   before cutover.
4. **Editor sign-in:** the site reuses the `sveltia-cms-auth` Worker already deployed for
   atlantacare.com (`base_url` in `public/admin/config.yml`). In that Worker's settings add
   `supportatlantacare.com` to the `ALLOWED_DOMAINS` variable (comma-separated). Editors need
   a GitHub account with write access to this repo — the same shared account works for both sites.

Ongoing cost: the domain registration. Everything else is on free tiers.

## Where the content came from

`../supportatlantacare-scrape/` holds the original site's rendered HTML, images, theme CSS,
screenshots and `extract.py`, which produced `src/content/`. The original home page plays a
Vimeo video (muted, looping) behind the banner; the play button opens the same video with sound.
The WordPress events plugin became the Events collection described above.
The contact form (a WordPress plugin that emailed submissions) was dropped: a static site can't
send email without a third-party form service, and none of the free ones are private enough.
The contact page shows the phone number and addresses instead.
The "Website Development by M&R Marketing" footer credit was not carried over.
Fonts: the original used Adobe Fonts Roboto Condensed; this uses the self-hosted equivalent.
