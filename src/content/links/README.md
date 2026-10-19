One file per short link, written by the editor (Short links & QR codes). The file name is the
two-character code; `url` is where it goes. The build turns these into Cloudflare redirects.

On Cloudflare, `functions/[code].js` answers `/<code>` with a redirect and counts the click
in the D1 database bound as `DB`; `/admin/links/` shows the links, their QR codes and clicks.
