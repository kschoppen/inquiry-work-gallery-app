/**
 * Testimonials, for the signed-in ISM.
 *   GET  /api/testimonials                       the ones they added, with consent status
 *   POST /api/testimonials { ...fields, consent } add one. consent.way: 'none' (save only), 'email' (save and email
 *                                                 the form), 'here' (the speaker ticks and types their name now)
 *   POST /api/testimonials { preview: true, ... } the consent email as it would read; saves and sends nothing
 *   POST /api/testimonials { send: 'rec...' }     email the form (again) for one they added
 */
import type { Config } from '@netlify/functions';
import { CONSENT, T, TESTIMONIAL_PRODUCTS, T_VALUES } from '../lib/config.mjs';
import { companyByGsid } from '../lib/companies.mjs';
import { create, listMine, mine, previewForm, sendForm, sign, toItem } from '../lib/testimonials.mjs';
import { fail, isEmail, json, readJson, safely, text, whoIs } from '../lib/http.mjs';

export default safely(async (req: Request) => {
  const who = await whoIs(req);
  if (!who) return fail(401, 'Sign in first');
  const origin = new URL(req.url).origin;

  if (req.method === 'GET') return json({ items: await listMine(who.email) });
  if (req.method !== 'POST') return fail(405, 'Not allowed');
  const body = await readJson(req);
  if (!body) return fail(400, 'Nothing was sent.');

  if (body.send) {
    const rec = await mine(text(body.send, 20), who.email);
    if (!rec) return fail(404, 'That testimonial is not one of yours.');
    if (rec.fields[T.consentStatus] === CONSENT.signed || rec.fields[T.consentStatus] === CONSENT.declined) return fail(409, 'The speaker has already answered.');
    if (!isEmail(String(rec.fields[T.email] ?? ''))) return fail(400, 'There is no speaker email on this testimonial.');
    return json({ item: toItem(await sendForm(rec, who, origin)) });
  }

  const name = text(body.name, 200), role = text(body.role, 200), email = text(body.email, 254).toLowerCase(), quote = text(body.quote, 5000);
  const products = Array.isArray(body.products) ? body.products.filter((p: unknown) => TESTIMONIAL_PRODUCTS.includes(p as string)) : [];
  const company = await companyByGsid(text(body.gsid, 100));

  if (body.preview) {
    const mail = previewForm({ quote: quote || '[THEIR WORDS]', name: name || '[SPEAKER NAME]', role, district: company?.name ?? '' }, who, origin);
    return json({ subject: mail.subject, text: mail.text, from: process.env.MAIL_FROM || 'inquirED <learn@inquired.com>', to: email || '[SPEAKER EMAIL]' });
  }

  const way = body.consent?.way === 'email' || body.consent?.way === 'here' ? body.consent.way : 'none';
  if (!name) return fail(400, 'Add the speaker name.');
  if (!company) return fail(400, 'Pick the district from the list.');
  if (!isEmail(email)) return fail(400, 'Add the speaker email. It is where their copy goes.');
  if (!products.length) return fail(400, 'Pick at least one product.');
  if (!quote) return fail(400, 'Add their words.');
  const signedName = text(body.consent?.signedName, 200);
  if (way === 'here' && (body.consent?.agree !== true || !signedName)) return fail(400, 'To sign now, the speaker ticks "I agree" and types their full name.');

  let rec = await create({ name, role, company, email, products, quote, districtApproval: body.districtApproval === true }, who);
  console.log(`testimonial added by ${who.email}: ${rec.id} (consent: ${way})`);
  let note = '';
  if (way === 'email') {
    try { rec = await sendForm(rec, who, origin); }
    catch (e: any) { console.error(`consent form not sent for ${rec.id}: ${e.message}`); note = 'Saved, but the email did not go. Send it again from the list.'; }
  }
  if (way === 'here') {
    const done = await sign(rec, { signedName, quote, how: T_VALUES.inPerson });
    rec = done.saved;
    if (!done.copySent) note = 'Signed and saved, but the copy was not emailed to the speaker.';
  }
  return json({ item: toItem(rec), note });
});

export const config: Config = { path: '/api/testimonials' };
