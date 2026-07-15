import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Runs as a Cloudflare Function rather than being prerendered.
export const prerender = false;

interface Env {
  RESEND_API_KEY?: string;
  QUOTE_TO_EMAIL?: string;
  QUOTE_FROM_EMAIL?: string;
}

const secrets = env as Env;

const MAX_LEN = {
  name: 100,
  email: 254,
  service: 60,
  material: 60,
  message: 5000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const POST: APIRoute = async ({ request, redirect }) => {
  // Native form posts get a redirect; the enhanced fetch submit asks for JSON.
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;

  const fail = (status: number, error: string) =>
    wantsJson
      ? new Response(JSON.stringify({ error }), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      : redirect('/quote-error', 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'That submission was malformed.');
  }

  // Honeypot: a real person never sees this field, so anything in it is a bot.
  // Answer as though it succeeded rather than telling the bot it was caught.
  if (clean(form.get('company'), 100) !== '') {
    return wantsJson
      ? new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : redirect('/quote-sent', 303);
  }

  const name = clean(form.get('name'), MAX_LEN.name);
  const email = clean(form.get('email'), MAX_LEN.email);
  const service = clean(form.get('service'), MAX_LEN.service);
  const material = clean(form.get('material'), MAX_LEN.material);
  const message = clean(form.get('message'), MAX_LEN.message);
  const notify = form.get('notify') !== null;

  if (!name) return fail(400, 'Please tell us your name.');
  if (!EMAIL_RE.test(email)) return fail(400, 'That email address doesn’t look right.');
  if (!message) return fail(400, 'Please tell us what you need made.');

  const apiKey = secrets.RESEND_API_KEY;
  const to = secrets.QUOTE_TO_EMAIL;
  const from = secrets.QUOTE_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    // Better to fail loudly than to accept an enquiry and drop it.
    console.error('Quote form is not configured: RESEND_API_KEY / QUOTE_TO_EMAIL / QUOTE_FROM_EMAIL');
    return fail(500, 'The quote form isn’t set up yet.');
  }

  const lines = [
    `Name:     ${name}`,
    `Email:    ${email}`,
    `Service:  ${service || '—'}`,
    `Material: ${material || '—'}`,
    `Notify:   ${notify ? 'yes' : 'no'}`,
    '',
    message,
  ].join('\n');

  const html = `<pre style="font: 14px/1.6 ui-monospace, monospace; white-space: pre-wrap;">${escapeHtml(lines)}</pre>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Quote request — ${name}${service ? ` (${service})` : ''}`,
        text: lines,
        html,
      }),
    });

    if (!response.ok) {
      console.error('Resend rejected the enquiry:', response.status, await response.text());
      return fail(502, 'We couldn’t send that just now.');
    }
  } catch (error) {
    console.error('Resend request failed:', error);
    return fail(502, 'We couldn’t send that just now.');
  }

  return wantsJson
    ? new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    : redirect('/quote-sent', 303);
};
