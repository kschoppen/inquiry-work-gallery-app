/**
 * Checks the app end to end in mock mode: `npm run check`. Starts the local server on its own port with fixture
 * data and asks it the questions that matter (who gets in, what is shown, what a consent link can do).
 * It never touches Google, Airtable or email.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8899, BASE = `http://localhost:${PORT}`;
const outbox = await mkdtemp(join(tmpdir(), 'iwg-outbox-'));
const server = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./dev-server.mjs', import.meta.url))], {
  env: { ...process.env, MOCK: '1', PORT: String(PORT), MOCK_OUTBOX: outbox, FAVORITES_BASE_ID: '', FAVORITES_TABLE_ID: '' }, stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok) => server.stdout.once('data', ok));

let failed = 0;
const check = (name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `  (${detail})`}`); if (!pass) failed += 1; };
const get = (path, cookie) => fetch(BASE + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (path, body, cookie) => fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const TOKEN = 'mockTOKEN0000000000000000000000000000000001';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');

try {
  // ----- The gate -----
  let r = await get('/');
  check('signed out: a page goes to sign-in', r.status === 302 && r.headers.get('location') === '/signin.html');
  r = await get('/js/app.js');
  check('signed out: the app script is not served', r.status === 302);
  for (const path of ['/api/home', '/api/work', '/api/work?gsid=GSID-MOCK-A', '/api/pdf?gsid=GSID-MOCK-A', '/api/testimonials']) {
    r = await get(path);
    check(`signed out: ${path} answers 401`, r.status === 401);
  }
  r = await post('/api/work', {});
  check('signed out: adding work answers 401', r.status === 401);
  r = await post('/api/testimonials', {});
  check('signed out: adding a testimonial answers 401', r.status === 401);
  for (const path of ['/signin.html', '/css/app.css', '/css/tokens.css', '/fonts/lato-400.woff2', '/manifest.json', '/icons/icon-192.png', '/sw.js', '/consent/', '/consent/consent.js']) {
    r = await get(path);
    check(`signed out: ${path} is open`, r.status === 200);
  }
  r = await get('/', 'iwg_session=eyJwIjoic2Vzc2lvbiJ9.forged');
  check('a forged session cookie is refused', r.status === 302);

  // ----- Sign in (mock) -----
  r = await get('/api/auth/login');
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('iwg_session='));
  check('mock sign-in sets a session', r.status === 302 && !!cookie);
  r = await get('/', cookie);
  check('signed in: the app page loads', r.status === 200);
  const home = await (await get('/api/home', cookie)).json();
  check('home: signed in as the placeholder ISM', home.me?.name === '[ISM NAME]');
  check('home: two districts assigned, six in all', home.districts.filter((d) => d.assigned).length === 2 && home.districts.length === 6);
  check('home: favorites fall back to the browser (no table set)', home.favorites === null);
  check('home: no contest question outside a contest window', home.contest === null);

  // ----- What is shown -----
  const district = await (await get('/api/work?gsid=GSID-MOCK-A', cookie)).json();
  check('district A: five cleared pieces (uncleared, face and full-name rows left out)', district.works.length === 5, `got ${district.works?.length}`);
  check('district A: a row with no Gainsight ID is found by its name', district.works.some((w) => !w.gsid));
  const gallery = await (await get('/api/work', cookie)).json();
  check('gallery: only work any district can see', gallery.works.length === 5 && gallery.works.every((w) => w.shareAcross), `got ${gallery.works?.length}`);
  const hidden = 'recWORK0000000006'; // "For Discussion" in the fixtures
  r = await get(`/api/work?id=${hidden}`, cookie);
  check('an uncleared piece reads as not found', r.status === 404);
  r = await get(`/api/pdf?id=${hidden}`, cookie);
  check('an uncleared piece cannot be made into a PDF', r.status === 404);
  r = await get('/api/pdf?id=recWORK0000000004', cookie);
  check('a piece the teacher has not agreed to share cannot be made into a PDF', r.status === 403);
  r = await get('/api/pdf?gsid=GSID-MOCK-A', cookie);
  const pdf = Buffer.from(await r.arrayBuffer());
  check('district PDF: is a PDF, with only the four pieces shared with the district', r.status === 200 && pdf.subarray(0, 5).toString() === '%PDF-' && r.headers.get('x-pieces') === '4', `pieces ${r.headers.get('x-pieces')}`);
  r = await get('/api/pdf?id=recWORK0000000001', cookie);
  check('one piece as a PDF', r.status === 200 && r.headers.get('content-type') === 'application/pdf');

  // ----- Add work -----
  const work = { teacherName: '[TEACHER NAME]', teacherEmail: 'teacher@example.com', gsid: 'GSID-MOCK-A', unit: '[UNIT NAME 1]', grades: ['2nd Grade'], description: '[DESCRIPTION]', checks: { noFaces: true, noNames: true, teacherYes: true }, photos: [JPEG] };
  r = await post('/api/work', { ...work, checks: { noFaces: true, noNames: true, teacherYes: false } }, cookie);
  check('add work: refused without all three boxes ticked', r.status === 400);
  r = await post('/api/work', { ...work, gsid: 'NOT-A-DISTRICT' }, cookie);
  check('add work: refused for a district not in the Gainsight list', r.status === 400);
  r = await post('/api/work', { ...work, photos: ['PHN2Zz48L3N2Zz4='] }, cookie);
  check('add work: refused when a photo is not a JPEG', r.status === 400);
  r = await post('/api/work', { ...work, contest: 'Any contest' }, cookie);
  const made = await r.json();
  check('add work: saved with its photo', r.status === 200 && made.photosSaved === 1);
  check('add work: no contest tag when no contest is open', made.contest === null);
  r = await get(`/api/work?id=${made.id}`, cookie);
  check('add work: the new row is not shown until a reviewer clears it', r.status === 404);
  r = await post('/api/work', { upload: made.upload, from: 1, photos: [JPEG] }, cookie);
  check('add work: more photos can follow with the upload pass', r.status === 200 && (await r.json()).photosSaved === 1);
  r = await post('/api/work', { upload: 'not-a-pass', from: 1, photos: [JPEG] }, cookie);
  check('add work: more photos refused without a real upload pass', r.status === 403);

  // ----- Testimonials and consent -----
  let list = (await (await get('/api/testimonials', cookie)).json()).items;
  check('testimonials: only the ones this ISM added', list.length === 3 && !list.some((t) => t.quote.includes('SOMEONE ELSE')));
  check('testimonials: an unsigned one is not marked signed', list.filter((t) => !t.signed).length === 2 && list.find((t) => t.status === 'Needs consent')?.signed === false);

  r = await get('/api/consent?t=wrong');
  check('consent: a malformed token is refused', r.status === 404);
  r = await get(`/api/consent?t=${'x'.repeat(43)}`);
  check('consent: a well-formed but unknown token is refused', r.status === 404);
  r = await post('/api/consent', { t: 'x'.repeat(43), action: 'sign', agree: true, signedName: 'X', quote: 'X' });
  check('consent: signing with an unknown token is refused', r.status === 404);
  r = await get(`/api/consent?t=${TOKEN}`);
  const view = await r.json();
  check('consent: works signed out, and shows only the words, name, role and district', r.status === 200 && view.state === 'open' && Object.keys(view).sort().join() === 'district,ism,name,quote,role,state,wording');
  r = await post('/api/consent', { t: TOKEN, action: 'sign', agree: false, signedName: '[SPEAKER NAME]', quote: view.quote });
  check('consent: refused without "I agree"', r.status === 400);
  r = await post('/api/consent', { t: TOKEN, action: 'sign', agree: true, signedName: '', quote: view.quote });
  check('consent: refused without a typed name', r.status === 400);
  r = await post('/api/consent', { t: TOKEN, action: 'sign', agree: true, signedName: '[SPEAKER NAME]', quote: '[QUOTE, EDITED BY THE SPEAKER]' });
  check('consent: signs', r.status === 200 && (await r.json()).state === 'signed');
  r = await post('/api/consent', { t: TOKEN, action: 'sign', agree: true, signedName: '[SPEAKER NAME]', quote: 'again' });
  check('consent: signing twice is refused', r.status === 409);
  r = await post('/api/consent', { t: TOKEN, action: 'decline' });
  check('consent: declining after signing is refused', r.status === 409);
  const after = await (await get(`/api/consent?t=${TOKEN}`)).json();
  check('consent: a used link no longer shows the words', after.state === 'signed' && !('quote' in after));
  list = (await (await get('/api/testimonials', cookie)).json()).items;
  check('consent: the ISM sees it signed, with the speaker\'s edit', list.some((t) => t.signed && t.quote === '[QUOTE, EDITED BY THE SPEAKER]'));

  const draft = { name: '[SPEAKER NAME]', role: '[ROLE]', gsid: 'GSID-MOCK-B', email: 'speaker@example.com', products: ['Inkwell'], quote: '[QUOTE]' };
  r = await post('/api/testimonials', { ...draft, consent: { way: 'here', agree: false, signedName: '[SPEAKER NAME]' } }, cookie);
  check('sign here now: refused without "I agree"', r.status === 400);
  r = await post('/api/testimonials', { ...draft, consent: { way: 'none' } }, cookie);
  let item = (await r.json()).item;
  check('save only: saved as needing consent, not signed', item.status === 'Needs consent' && item.signed === false);
  r = await post('/api/testimonials', { ...draft, consent: { way: 'here', agree: true, signedName: '[SPEAKER NAME]' } }, cookie);
  item = (await r.json()).item;
  check('sign here now: saved as signed', item.status === 'Signed' && item.signed === true);
  r = await post('/api/testimonials', { ...draft, consent: { way: 'email' } }, cookie);
  item = (await r.json()).item;
  check('email the form: saved as waiting on the speaker', item.status === 'Waiting on speaker' && item.signed === false);
  const mails = await readdir(outbox);
  const formMail = mails.map((f) => join(outbox, f)).find((f) => f.includes('may-we-share'));
  const link = formMail ? /\/consent\/\?t=([A-Za-z0-9_-]{43})/.exec(await readFile(formMail, 'utf8'))?.[1] : null;
  check('email the form: the email is written to the mock outbox with a 43-character link', !!link);
  check('email the form: the email names the ISM and quotes the speaker', !!formMail && (await readFile(formMail, 'utf8')).includes('Thank you for talking with [ISM NAME].') && (await readFile(formMail, 'utf8')).includes('[QUOTE]'));
  check('a signed copy was written to the mock outbox each time someone signed', mails.filter((f) => f.includes('your-copy')).length === 2, mails.join(', '));
  r = await post('/api/consent', { t: link, action: 'decline' });
  check('consent: the emailed link can say no', r.status === 200 && (await r.json()).state === 'declined');
  list = (await (await get('/api/testimonials', cookie)).json()).items;
  check('consent: a declined testimonial is not signed', list.some((t) => t.status === 'Declined' && !t.signed));
  r = await post('/api/testimonials', { send: 'recTESTIMONIAL004' }, cookie);
  check("the form can't be sent for someone else's testimonial", r.status === 404);

  // ----- Sign out -----
  r = await get('/api/auth/logout', cookie);
  check('sign out clears the session', r.status === 302 && r.headers.getSetCookie().some((c) => c.startsWith('iwg_session=;')));
} catch (e) {
  check(`the checks ran to the end (${e.message})`, false);
} finally {
  server.kill();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
