// @ts-check
import { defineConfig } from 'astro/config';
import shortLinks from './src/lib/short-links-integration';

export default defineConfig({
  site: 'https://supportatlantacare.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  integrations: [shortLinks()],
});
