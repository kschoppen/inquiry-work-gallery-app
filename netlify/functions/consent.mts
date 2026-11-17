/**
 * The consent page's API. No sign-in: the long random link in the speaker's email is the key.
 *   GET  /api/consent?t=<token>                      that one testimonial's words, name, role and district
 *   POST /api/consent { t, action: 'sign', quote, agree, signedName }
 *   POST /api/consent { t, action: 'decline' }
 * A link can be answered once. After that it only says the answer is in.
 */
import type { Config } from '@netlify/functions';
import { T_VALUES } from '../lib/config.mjs';
import { byToken, consentView, decline, isWaiting, sign } from '../lib/testimonials.mjs';
import { fail, json, readJson, safely, text } from '../lib/http.mjs';

const NOT_FOUND = 'This link is not valid. Ask the person who emailed you for a new one.';

export default safely(async (req: Request) => {
  if (req.method === 'GET') {
    const rec = await byToken(new URL(req.url).searchParams.get('t') ?? '');
    return rec ? json(consentView(rec)) : fail(404, NOT_FOUND);
  }
  if (req.method !== 'POST') return fail(405, 'Not allowed');
  const body = await readJson(req);
  const rec = await byToken(body?.t ?? '');
  if (!rec) return fail(404, NOT_FOUND);
  if (!isWaiting(rec)) return fail(409, 'This form has already been answered.');

  if (body.action === 'decline') { await decline(rec); return json({ state: 'declined' }); }
  if (body.action !== 'sign') return fail(400, 'Choose to sign or to say no.');
  const signedName = text(body.signedName, 200), quote = text(body.quote, 5000);
  if (body.agree !== true) return fail(400, 'Tick "I agree" to sign.');
  if (!signedName) return fail(400, 'Type your full name to sign.');
  if (!quote) return fail(400, 'Your words are empty. Add them back, or choose "No, don\'t share".');
  const done = await sign(rec, { signedName, quote, how: T_VALUES.byEmail });
  return json({ state: 'signed', copySent: done.copySent });
});

export const config: Config = { path: '/api/consent' };
