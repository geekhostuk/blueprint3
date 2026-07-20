// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // The custom domain. Everything else (sitemap, robots.txt, canonical/og:url
  // tags) is built from this. DNS for blueprint3.co.uk must be pointed at
  // Cloudflare and the domain added under the Pages/Worker project's Custom
  // Domains for this to resolve.
  site: 'https://blueprint3.co.uk',

  // Pages are prerendered to static HTML and served from Cloudflare's asset
  // store. Only /api/quote opts out (`export const prerender = false`) and
  // runs as a Worker.
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),

  // The site uses no sessions. Left unset, the Cloudflare adapter would add a
  // "SESSION" KV binding that then has to exist before a deploy succeeds, so
  // point it at an in-memory driver nothing ever reads.
  session: {
    driver: sessionDrivers.lruCache(),
  },

  integrations: [
    sitemap({
      // The form's confirmation pages are noindex and robots-disallowed;
      // listing them in the sitemap would contradict that.
      filter: (page) => !/\/quote-(sent|error)\/?$/.test(page),
    }),
  ],
});
