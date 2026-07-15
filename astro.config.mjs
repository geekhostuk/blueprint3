// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Swap this for the custom domain once DNS is pointed at Cloudflare — it's
  // what the sitemap, robots.txt and the canonical/og:url tags are built from.
  site: 'https://blueprint3.pages.dev',

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
