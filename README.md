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
src/content/singles/site.yml   phone, addresses, donate link, menu, footer text, contact form settings
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
| Contact form | Intro text beside the contact form |

The donate link, phone number and addresses live in **Site Settings** and appear everywhere
automatically (the phone number is auto-linked wherever it's typed).

### The editor — Sveltia CMS (`/admin/`)

- Zero build step; one `<script>` tag (`src/pages/admin.astro`) and one config file
  (`public/admin/config.yml`).
- Editors sign in with GitHub. Saving commits straight to the repo; Cloudflare rebuilds
  the site in ~30 seconds.
- On a laptop, open `http://localhost:8172/admin/` in Chrome/Edge and choose
  **Work with Local Repository** → pick this folder. Edits are written to disk
  and the dev server reloads.

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
5. **Contact form:** the original used a WordPress plugin to email submissions. A static site
   can't send email on its own, so the form posts to a free form service. Sign up at
   [Web3Forms](https://web3forms.com) (free, no account: enter the inbox address, get an access
   key) or [Formspree](https://formspree.io), then in **Site Settings → Contact form** set the
   form service address (`https://api.web3forms.com/submit` or the Formspree form URL) and, for
   Web3Forms, the access key. Until that's set the contact page shows the phone number instead
   of a form.

Ongoing cost: the domain registration. Everything else is on free tiers.

## Where the content came from

`../supportatlantacare-scrape/` holds the original site's rendered HTML, images, theme CSS,
screenshots and `extract.py`, which produced `src/content/`. The original home page plays a
Vimeo video (muted, looping) behind the banner; the play button opens the same video with sound.
The upcoming-events list (an empty WordPress events plugin) became a plain "Events" page.
The "Website Development by M&R Marketing" footer credit was not carried over.
Fonts: the original used Adobe Fonts Roboto Condensed; this uses the self-hosted equivalent.
