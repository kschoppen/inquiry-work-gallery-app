/**
 * Email from the shared inquirED mailbox, over SMTP. In mock mode nothing is sent: the email is written to
 * .mock-outbox/ and logged.
 *
 * These are plain emails on purpose: words and one link, no brand styling. A designed version has to come from
 * the brand system's email renderer (see README, "Brand system").
 */
import { CONSENT_WORDING, MAIL_FROM_DEFAULT, isMock } from './config.mjs';
import { esc } from './http.mjs';

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';
const byline = (t) => [t.name, t.role, t.district].filter(Boolean).join(', ');

/** Plain paragraphs as bare HTML, so the link is clickable in every mail app. A { href, label } block becomes a link. */
function plainHtml(subject, blocks) {
  const body = blocks.map((b) => {
    if (typeof b === 'string') return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
    if (b.href) return `<p><a href="${esc(b.href)}">${esc(b.label)}</a></p>`;
    return `<blockquote><p>${esc(b.quote).replace(/\n/g, '<br>')}</p><p>${esc(b.by)}</p></blockquote>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body>\n${body}\n</body></html>`;
}
const plainText = (blocks) => blocks.map((b) => (typeof b === 'string' ? b : b.href ? `${b.label}: ${b.href}` : `"${b.quote}"\n${b.by}`)).join('\n\n');
const email = (subject, blocks) => ({ subject, html: plainHtml(subject, blocks), text: plainText(blocks) });

/** When something was signed, in words, in US Central time. */
export const signedWhen = (iso) => `${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))} Central Time`;

/** The email asking a speaker to review and sign. `link` opens the consent page. */
export const consentEmail = (t, ismName, link) => email('May we share what you said?', [
  `Hi ${firstName(t.name)},`,
  `Thank you for talking with ${ismName}. We wrote down what you said and would like your permission to share it.`,
  { quote: t.quote, by: byline(t) },
  'The form takes about a minute. You can fix the wording there, or say no.',
  { href: link, label: 'Review and sign' },
  'Nothing is shared until you sign. Reply to this email with any questions.',
  `${ismName}\ninquirED`,
]);

/** The speaker's copy of what they signed, with the date and time. */
export const signedCopyEmail = (t, ismName, signedName, signedAt) => email('Your copy of what you signed for inquirED', [
  `Hi ${firstName(t.name)},`,
  'Thank you. Here is a copy of what you signed, for your records.',
  { quote: t.quote, by: byline(t) },
  `What you agreed to: ${CONSENT_WORDING}`,
  `Signed by ${signedName} on ${signedWhen(signedAt)}.`,
  "Changed your mind later? Reply to this email and we'll take it down.",
  `${ismName}\ninquirED`,
]);

/** Tells the ISM a speaker said no. */
export const declinedEmail = (t) => email('A speaker said no to sharing their words', [
  `${t.name || 'The speaker'} chose "No, don't share" on the consent form. The testimonial is marked Declined and must not be used.`,
  { quote: t.quote, by: byline(t) },
]);

let transport;
/** Sends one email, or in mock mode writes it to the outbox. Throws when it could not be sent. */
export async function sendMail({ to, cc, subject, html, text }) {
  const from = process.env.MAIL_FROM || MAIL_FROM_DEFAULT;
  if (isMock()) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = process.env.MOCK_OUTBOX || '.mock-outbox';
    await mkdir(dir, { recursive: true });
    const file = `${dir}/${Date.now()}-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.html`;
    await writeFile(file, `<!-- MOCK EMAIL, NOT SENT\nFrom: ${from}\nTo: ${to}${cc ? `\nCc: ${cc}` : ''}\nSubject: ${subject}\n-->\n${html}`);
    console.log(`mock email (not sent) to ${to}: "${subject}" -> ${file}`);
    return;
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { const e = new Error('SMTP is not set up'); e.publicMessage = 'Email is not set up yet, so nothing was sent.'; throw e; }
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(SMTP_PORT) || 587;
    transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  }
  await transport.sendMail({ from, to, cc, subject, html, text });
}
