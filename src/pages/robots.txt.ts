import type { APIRoute } from 'astro';

// Generated rather than kept in public/ so the sitemap URL always follows
// `site` in astro.config.mjs instead of drifting when the domain changes.
export const GET: APIRoute = ({ site }) => {
  const body = `User-agent: *
Allow: /

# The form's confirmation pages carry no content worth indexing; they're also
# marked noindex in their own <head>.
Disallow: /quote-sent
Disallow: /quote-error

Sitemap: ${new URL('sitemap-index.xml', site)}
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
