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

// Attachment limits. Resend accepts up to ~40MB per message; we stay well
// under that (base64 inflates payloads by a third) and cap the count so a
// single enquiry can't balloon the Worker's request.
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// btoa needs a binary string; build it in chunks so a large file doesn't blow
// the argument limit of String.fromCharCode(...).
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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

  if (!name) return fail(400, 'Please tell us your name.');
  if (!EMAIL_RE.test(email)) return fail(400, 'That email address doesn’t look right.');
  if (!message) return fail(400, 'Please tell us what you need made.');

  // Attachments are optional. Files arrive as File entries; strings (an empty
  // field when nothing is picked) are ignored.
  const files = form.getAll('attachments').filter((f): f is File => typeof f !== 'string' && f.size > 0);

  if (files.length > MAX_FILES) {
    return fail(400, `Please attach no more than ${MAX_FILES} files.`);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return fail(400, `“${file.name}” is too large. Each file must be under 10MB.`);
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return fail(400, 'Those attachments are too large. Please keep the total under 20MB.');
  }

  const attachments = await Promise.all(
    files.map(async (file) => ({
      filename: file.name || 'attachment',
      content: toBase64(new Uint8Array(await file.arrayBuffer())),
    }))
  );

  const apiKey = secrets.RESEND_API_KEY;
  const to = secrets.QUOTE_TO_EMAIL;
  const from = secrets.QUOTE_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    // Better to fail loudly than to accept an enquiry and drop it.
    console.error('Quote form is not configured: RESEND_API_KEY / QUOTE_TO_EMAIL / QUOTE_FROM_EMAIL');
    return fail(500, 'The quote form isn’t set up yet.');
  }

  const lines = [
    `Name:        ${name}`,
    `Email:       ${email}`,
    `Service:     ${service || '—'}`,
    `Material:    ${material || '—'}`,
    `Attachments: ${files.length ? files.map((f) => f.name).join(', ') : 'none'}`,
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
        ...(attachments.length ? { attachments } : {}),
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
