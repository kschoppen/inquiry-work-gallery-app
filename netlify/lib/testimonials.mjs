/** Testimonials and their consent record. A testimonial is "not for use" until its speaker signs. */
import { CONSENT, CONSENT_WORDING, T, TESTIMONIAL_BASE as BASE, TESTIMONIAL_TABLE as TABLE, T_VALUES as V } from './config.mjs';
import { createRecord, fq, getRecord, listRecords, updateRecord } from './airtable.mjs';
import { consentEmail, declinedEmail, sendMail, signedCopyEmail } from './mail.mjs';
import { randomToken } from './session.mjs';

export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const lower = (v) => String(v ?? '').trim().toLowerCase();
const excerpt = (q) => (q.length > 240 ? `${q.slice(0, 237).trimEnd()}...` : q);

/** What the ISM's list shows. `status` is never guessed: a record with no consent status reads as "Needs consent". */
export function toItem(rec) {
  const f = rec.fields;
  const status = Object.values(CONSENT).includes(f[T.consentStatus]) ? f[T.consentStatus] : CONSENT.needs;
  return {
    id: rec.id, quote: f[T.full] || f[T.excerpt] || '', name: f[T.name] || '', role: f[T.role] || '', district: f[T.district] || '',
    products: Array.isArray(f[T.product]) ? f[T.product] : [], status, signed: status === CONSENT.signed,
    sentAt: f[T.consentSentAt] || null, signedAt: f[T.consentSignedAt] || null, districtApproval: f[T.districtApproval] === true, hasEmail: !!f[T.email],
  };
}

/** The speaker-facing view of one testimonial: only what the consent page needs. */
const forSpeaker = (rec) => {
  const f = rec.fields;
  return { quote: f[T.full] || f[T.excerpt] || '', name: f[T.name] || '', role: f[T.role] || '', district: f[T.district] || '' };
};

export async function listMine(email) {
  const rows = await listRecords(BASE, TABLE, { formula: `LOWER({${T.addedBy}})=${fq(lower(email))}`, max: 300, where: (r) => lower(r.fields[T.addedBy]) === lower(email) });
  return rows.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1)).map(toItem);
}

/** One of the ISM's own testimonials, or null. */
export async function mine(id, email) {
  const rec = await getRecord(BASE, TABLE, id);
  return rec && lower(rec.fields[T.addedBy]) === lower(email) ? rec : null;
}

export async function create({ name, role, company, email, products, quote, districtApproval }, who) {
  return createRecord(BASE, TABLE, {
    [T.excerpt]: excerpt(quote), [T.full]: quote, [T.name]: name, [T.email]: email, [T.role]: role,
    [T.district]: company.name, [T.gsid]: company.gsid, ...(company.state && company.state !== company.st ? { [T.state]: company.state } : {}),
    [T.format]: [V.format], [T.source]: V.source, [T.approval]: V.approval, [T.product]: products,
    [T.whoRequested]: who.name, [T.date]: new Date().toISOString().slice(0, 10),
    [T.consentStatus]: CONSENT.needs, [T.districtApproval]: !!districtApproval, [T.addedBy]: lower(who.email),
  });
}

/** Emails the consent form. A new link is made each time, so an older email's link stops working. */
export async function sendForm(rec, who, origin) {
  const token = randomToken(32);
  const mail = consentEmail(forSpeaker(rec), who.name, `${origin}/consent/?t=${token}`);
  // Save the link first: if the save fails, no email goes out with a link that leads nowhere.
  const saved = await updateRecord(BASE, TABLE, rec.id, { [T.consentStatus]: CONSENT.waiting, [T.consentToken]: token, [T.consentSentAt]: new Date().toISOString(), [T.requestedBy]: V.byEmail });
  await sendMail({ to: rec.fields[T.email], ...mail });
  return saved;
}

/** The email as the speaker would get it, without saving or sending anything. */
export const previewForm = (draft, who, origin) => consentEmail(draft, who.name, `${origin}/consent/?t=[LINK MADE WHEN YOU SEND]`);

/**
 * Records a signature: the name typed, the time, the exact wording agreed to, and Permission to Share = Yes.
 * This is the only place that sets Permission to Share to Yes. Then emails the speaker their copy, with the ISM copied.
 */
export async function sign(rec, { signedName, quote, how }) {
  const f = rec.fields;
  const signedAt = new Date().toISOString();
  const fields = { [T.consentStatus]: CONSENT.signed, [T.consentSignedName]: signedName, [T.consentSignedAt]: signedAt, [T.consentWording]: CONSENT_WORDING, [T.permission]: V.permissionYes, [T.requestedBy]: how };
  const before = f[T.full] || '';
  if (quote && quote !== before) {
    fields[T.full] = quote; fields[T.excerpt] = excerpt(quote);
    fields[T.notes] = `${f[T.notes] ? `${f[T.notes]}\n\n` : ''}The speaker changed the wording when signing (${signedAt.slice(0, 10)}). As first written: "${before}"`;
  }
  const saved = await updateRecord(BASE, TABLE, rec.id, fields);
  let copySent = false;
  if (f[T.email]) {
    try {
      await sendMail({ to: f[T.email], cc: f[T.addedBy] || undefined, ...signedCopyEmail(forSpeaker(saved), f[T.whoRequested] || 'inquirED', signedName, signedAt) });
      copySent = true;
    } catch (e) { console.error(`signed copy not sent for ${rec.id}: ${e.message}`); }
  }
  return { saved, copySent, signedAt };
}

export async function decline(rec) {
  const saved = await updateRecord(BASE, TABLE, rec.id, { [T.consentStatus]: CONSENT.declined, [T.permission]: V.permissionNo });
  if (rec.fields[T.addedBy]) {
    try { await sendMail({ to: rec.fields[T.addedBy], ...declinedEmail(forSpeaker(rec)) }); }
    catch (e) { console.error(`decline notice not sent for ${rec.id}: ${e.message}`); }
  }
  return saved;
}

/** The testimonial a consent link points at, or null. The token's shape is checked before it goes near a formula. */
export async function byToken(token) {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return null;
  const rows = await listRecords(BASE, TABLE, { formula: `{${T.consentToken}}=${fq(token)}`, max: 2, where: (r) => r.fields[T.consentToken] === token });
  return rows.length === 1 ? rows[0] : null;
}

/** What the public consent page may know. Once signed or declined, the words are no longer shown. */
export function consentView(rec) {
  const status = rec.fields[T.consentStatus];
  const ism = rec.fields[T.whoRequested] || 'inquirED';
  if (status === CONSENT.waiting) return { state: 'open', ...forSpeaker(rec), ism, wording: CONSENT_WORDING };
  return { state: status === CONSENT.signed ? 'signed' : status === CONSENT.declined ? 'declined' : 'closed', ism };
}
export const isWaiting = (rec) => rec.fields[T.consentStatus] === CONSENT.waiting;
