// Contact form handler. Replaces the WPForms/PHP submission that used to sit
// behind /contact-us/, keeping the same shape of notification email:
//
//   Subject   Μήνυμα από τη Φόρμα Επικοινωνίας
//   Reply-To  the visitor's address, so replying just works
//
// Configuration comes from the environment so the recipient can change without
// touching code:
//
//   RESEND_API_KEY  secret  — sending_access key scoped to the domain
//   CONTACT_TO      var     — where notifications land
//   CONTACT_FROM    var     — verified sender, e.g. "… <noreply@exploringfox.gr>"

const SUBJECT = 'Μήνυμα από τη Φόρμα Επικοινωνίας';

const LIMITS = { name: 100, email: 254, message: 5000, extra: 200 };

// Deliberately permissive: the goal is to reject obvious rubbish, not to police
// what is a valid address — that argument is unwinnable and costs real users.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readFields(data) {
  // The original markup names fields wpforms[fields][N]; the browser script
  // sends clean names. Accept both so a no-JS POST still works.
  const pick = (...keys) => {
    for (const k of keys) {
      const v = data.get ? data.get(k) : data[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  return {
    name: pick('name', 'wpforms[fields][1]'),
    email: pick('email', 'wpforms[fields][2]'),
    message: pick('message', 'wpforms[fields][3]'),
    extra: pick('extra', 'wpforms[fields][4]'),
    honeypot: pick('website', 'url_field'),
  };
}

function validate(f) {
  const errors = {};
  if (!f.name) errors.name = 'Συμπλήρωσε το όνομά σου.';
  else if (f.name.length > LIMITS.name) errors.name = 'Το όνομα είναι πολύ μεγάλο.';

  if (!f.email) errors.email = 'Συμπλήρωσε το email σου.';
  else if (f.email.length > LIMITS.email || !EMAIL_RE.test(f.email))
    errors.email = 'Το email δεν φαίνεται σωστό.';

  if (!f.message) errors.message = 'Γράψε το μήνυμά σου.';
  else if (f.message.length > LIMITS.message) errors.message = 'Το μήνυμα είναι πολύ μεγάλο.';

  if (f.extra && f.extra.length > LIMITS.extra) errors.extra = 'Το πεδίο είναι πολύ μεγάλο.';

  return errors;
}

function buildEmail(f) {
  const rows = [
    ['Όνομα', f.name],
    ['Email', f.email],
    f.extra ? ['Επιπλέον', f.extra] : null,
  ].filter(Boolean);

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1d20">
  <p style="margin:0 0 1.25rem;color:#69747f">Νέο μήνυμα από τη φόρμα επικοινωνίας του exploringfox.gr</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:1.25rem">
    ${rows.map(([k, v]) => `
    <tr>
      <td style="padding:4px 16px 4px 0;color:#69747f;vertical-align:top;white-space:nowrap">${esc(k)}</td>
      <td style="padding:4px 0"><strong>${esc(v)}</strong></td>
    </tr>`).join('')}
  </table>
  <div style="padding:16px;background:#f8f9fa;border-left:3px solid #6254e7;white-space:pre-wrap">${esc(f.message)}</div>
</div>`.trim();

  const text = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    f.message,
  ].join('\n');

  return { html, text };
}

export async function handleContact(request, env) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const contentType = request.headers.get('content-type') || '';
  const wantsJson = contentType.includes('application/json');

  let data;
  try {
    data = wantsJson ? await request.json() : await request.formData();
  } catch {
    return respond(wantsJson, { ok: false, error: 'Το αίτημα δεν διαβάστηκε.' }, 400);
  }

  const fields = readFields(data);

  // Bots fill every field they find. Humans never see this one, so anything in
  // it is automated — answer as if all is well and drop the message.
  if (fields.honeypot) {
    return respond(wantsJson, { ok: true }, 200);
  }

  const errors = validate(fields);
  if (Object.keys(errors).length) {
    return respond(wantsJson, { ok: false, errors }, 422);
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error('contact: missing RESEND_API_KEY, CONTACT_TO or CONTACT_FROM');
    return respond(wantsJson, { ok: false, error: 'Η φόρμα δεν είναι ρυθμισμένη.' }, 500);
  }

  const { html, text } = buildEmail(fields);

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: fields.email,
        subject: SUBJECT,
        html,
        text,
      }),
    });
  } catch (err) {
    console.error('contact: request to Resend failed', err);
    return respond(wantsJson, { ok: false, error: 'Δεν στάλθηκε το μήνυμα. Δοκίμασε ξανά.' }, 502);
  }

  if (!res.ok) {
    console.error('contact: Resend returned', res.status, await res.text().catch(() => ''));
    return respond(wantsJson, { ok: false, error: 'Δεν στάλθηκε το μήνυμα. Δοκίμασε ξανά.' }, 502);
  }

  return respond(wantsJson, { ok: true }, 200);
}

// A JSON caller gets JSON. A plain form POST — which only happens when
// JavaScript did not run — gets a readable page instead.
function respond(wantsJson, body, status) {
  if (wantsJson) return Response.json(body, { status });

  const ok = body.ok;
  const detail = body.errors
    ? Object.values(body.errors).join(' ')
    : body.error || '';

  const page = `<!DOCTYPE html>
<html lang="el"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${ok ? 'Ευχαριστούμε' : 'Κάτι πήγε στραβά'} &ndash; exploringfox.gr</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:2rem 1.5rem;background:#f8f9fa;color:#3b3663;text-align:center;
       font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .w{max-width:30rem}
  h1{font-size:clamp(1.3rem,5vw,1.7rem);font-weight:600;margin:0 0 .75rem}
  p{color:#69747f;line-height:1.65;margin:0 0 2rem}
  a{display:inline-block;padding:.9rem 2.25rem;border-radius:999px;background:#6254e7;
    color:#fff;font-weight:600;font-size:.95rem;text-decoration:none}
</style></head>
<body><main class="w">
  <h1>${ok ? 'Ευχαριστούμε για το μήνυμά σου' : 'Το μήνυμα δεν στάλθηκε'}</h1>
  <p>${ok ? 'Θα επικοινωνήσουμε μαζί σου σύντομα.' : esc(detail || 'Δοκίμασε ξανά σε λίγο.')}</p>
  <a href="${ok ? '/' : '/contact-us/'}">${ok ? 'Επιστροφή στην αρχική' : 'Πίσω στη φόρμα'}</a>
</main></body></html>`;

  return new Response(page, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
