/** The Gainsight company list (districts), favorites, and the contest window. */
import { readFile } from 'node:fs/promises';
import { COMPANY, COMPANY_TABLE, FAVORITE, PEOPLE, PEOPLE_EMAIL_NAME, PEOPLE_TABLE, STATES, WORK, WORK_BASE, WORK_TABLE, favoritesTable } from './config.mjs';
import { createRecord, deleteRecord, fq, listRecords, remember, selectChoices } from './airtable.mjs';

/** Every district: { gsid, name, st, state, csm }. Kept for ten minutes per warm function; the list changes rarely. */
export const allCompanies = () => remember('companies', 600, async () => {
  const rows = await listRecords(WORK_BASE, COMPANY_TABLE, { byId: true, max: 2000 });
  return rows
    .map((r) => ({
      gsid: String(r.fields[COMPANY.gsid] ?? '').trim(), name: String(r.fields[COMPANY.name] ?? '').trim(),
      st: String(r.fields[COMPANY.state] ?? '').trim().toUpperCase(), csm: String(r.fields[COMPANY.csm] ?? '').trim().toLowerCase(),
    }))
    .filter((c) => c.gsid && c.name)
    .map((c) => ({ ...c, state: STATES[c.st] ?? c.st }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

export const companyByGsid = async (gsid) => (await allCompanies()).find((c) => c.gsid === gsid) ?? null;

/** Unit names, from the Unit field's choices. An empty list means the schema could not be read (token scope). */
export const unitChoices = () => remember('units', 3600, () => selectChoices(WORK_BASE, WORK_TABLE, WORK.unit)).catch((e) => { console.error(`units: ${e.message}`); return []; });

/** The inquirED People record for an email, to link as Internal Submitter. Null when the person is not in the table. */
export async function personRecordId(email) {
  const rows = await listRecords(WORK_BASE, PEOPLE_TABLE, {
    byId: true, max: 5, formula: `LOWER({${PEOPLE_EMAIL_NAME}})=${fq(email.toLowerCase())}`,
    where: (r) => String(r.fields[PEOPLE.email] ?? '').toLowerCase() === email.toLowerCase(),
  });
  return rows[0]?.id ?? null;
}

// ---------- Favorites ----------
// The favorites table does not exist yet. Until FAVORITES_BASE_ID and FAVORITES_TABLE_ID are set, the server
// answers `null` and the browser keeps the stars in its own localStorage (so they stay on that one phone).
const favKey = (email, gsid) => `${email.toLowerCase()}|${gsid}`;

export async function favoriteGsids(email) {
  const fav = favoritesTable();
  if (!fav) return null;
  const rows = await listRecords(fav.base, fav.table, {
    formula: `LOWER({${FAVORITE.email}})=${fq(email.toLowerCase())}`, max: 500,
    where: (r) => String(r.fields[FAVORITE.email] ?? '').toLowerCase() === email.toLowerCase(),
  });
  return rows.map((r) => String(r.fields[FAVORITE.gsid] ?? '')).filter(Boolean);
}

export async function setFavorite(email, company, on) {
  const fav = favoritesTable();
  if (!fav) return false;
  const key = favKey(email, company.gsid);
  const rows = await listRecords(fav.base, fav.table, { formula: `{${FAVORITE.key}}=${fq(key)}`, max: 10, where: (r) => r.fields[FAVORITE.key] === key });
  if (on && !rows.length) await createRecord(fav.base, fav.table, { [FAVORITE.key]: key, [FAVORITE.email]: email.toLowerCase(), [FAVORITE.gsid]: company.gsid, [FAVORITE.name]: company.name });
  if (!on) for (const r of rows) await deleteRecord(fav.base, fav.table, r.id);
  return true;
}

// ---------- Contests ----------
/** contests.json at the repo root. Read from disk so it can change without touching code. */
async function contests() {
  const candidates = [new URL('../../contests.json', import.meta.url), `${process.cwd()}/contests.json`];
  for (const c of candidates) {
    try { const list = JSON.parse(await readFile(c, 'utf8')); if (Array.isArray(list)) return list; } catch { /* try the next place */ }
  }
  return [];
}

/** The contest open today (dates in US Central time, both ends included), or null. */
export async function openContest(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now); // YYYY-MM-DD
  const ok = (c) => c && typeof c.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.opens ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(c.closes ?? '') && /^fld[A-Za-z0-9]{14}$/.test(c.tagFieldId ?? '') && typeof c.tagValue === 'string';
  return (await contests()).find((c) => ok(c) && c.opens <= today && today <= c.closes) ?? null;
}
