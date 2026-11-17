/**
 * The only file that talks to Airtable. In mock mode the same calls read and write an in-memory copy of the
 * fixture tables (mock-data.mjs), so everything above this file runs the same code either way.
 *
 * `byId: true` reads and writes fields by field ID (student work base). Without it, fields go by name (testimonials).
 * `formula` narrows what Airtable returns; `where` is the same test in JavaScript and is always applied to the
 * result, so a formula that drifts from the code can only return too little, never too much.
 */
import { isMock } from './config.mjs';
import { mockTables } from './mock-data.mjs';

const API = 'https://api.airtable.com/v0';
const CONTENT = 'https://content.airtable.com/v0';

class AirtableError extends Error {
  constructor(status, detail) { super(`Airtable ${status}: ${detail}`); this.status = 502; this.airtableStatus = status; }
}

function token() {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) { const e = new Error('AIRTABLE_TOKEN is not set'); e.publicMessage = 'The app is not connected to Airtable yet.'; throw e; }
  return t;
}

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!res.ok) throw new AirtableError(res.status, (await res.text()).slice(0, 300));
  return res.json();
}

/** A string safe to put inside single quotes in an Airtable formula. */
export const fq = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const clone = (v) => JSON.parse(JSON.stringify(v));
let mockId = 0;

/** All matching records, following Airtable's pages up to `max` records. */
export async function listRecords(base, table, { formula, where, byId = false, max = 1000, sort } = {}) {
  let records = [];
  if (isMock()) {
    records = clone(mockTables()[table] ?? []);
    if (sort) records.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
  } else {
    let offset;
    do {
      const q = new URLSearchParams({ pageSize: '100' });
      if (byId) q.set('returnFieldsByFieldId', 'true');
      if (formula) q.set('filterByFormula', formula);
      if (sort) { q.set('sort[0][field]', sort.field); q.set('sort[0][direction]', sort.direction ?? 'desc'); }
      if (offset) q.set('offset', offset);
      const page = await call(`${API}/${base}/${table}?${q}`);
      records.push(...page.records);
      offset = page.offset;
    } while (offset && records.length < max);
  }
  if (where) records = records.filter(where);
  return records.slice(0, max);
}

export async function getRecord(base, table, id, { byId = false } = {}) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  if (isMock()) { const r = (mockTables()[table] ?? []).find((x) => x.id === id); return r ? clone(r) : null; }
  try { return await call(`${API}/${base}/${table}/${id}${byId ? '?returnFieldsByFieldId=true' : ''}`); }
  catch (e) { if (e.airtableStatus === 404) return null; throw e; }
}

export async function createRecord(base, table, fields, { byId = false } = {}) {
  if (isMock()) {
    const rec = { id: `recMOCK${String(++mockId).padStart(10, '0')}`, createdTime: new Date().toISOString(), fields: clone(fields) };
    (mockTables()[table] ??= []).unshift(rec);
    return clone(rec);
  }
  return call(`${API}/${base}/${table}`, { method: 'POST', body: JSON.stringify({ fields, returnFieldsByFieldId: byId }) });
}

export async function updateRecord(base, table, id, fields, { byId = false } = {}) {
  if (isMock()) {
    const rec = (mockTables()[table] ?? []).find((x) => x.id === id);
    if (!rec) throw new AirtableError(404, 'no such record');
    Object.assign(rec.fields, clone(fields));
    return clone(rec);
  }
  return call(`${API}/${base}/${table}/${id}`, { method: 'PATCH', body: JSON.stringify({ fields, returnFieldsByFieldId: byId }) });
}

export async function deleteRecord(base, table, id) {
  if (isMock()) { const t = mockTables()[table] ?? []; const i = t.findIndex((x) => x.id === id); if (i >= 0) t.splice(i, 1); return; }
  await call(`${API}/${base}/${table}/${id}`, { method: 'DELETE' });
}

/** Adds one file to an attachment field. `file` is base64. Airtable takes up to 5 MB a file this way. */
export async function uploadAttachment(base, recordId, field, { contentType, filename, file }) {
  if (isMock()) {
    const rec = Object.values(mockTables()).flat().find((x) => x.id === recordId);
    if (!rec) throw new AirtableError(404, 'no such record');
    (rec.fields[field] ??= []).push({ id: `attMOCK${++mockId}`, filename, type: contentType, size: Math.floor(file.length * 0.75) });
    return;
  }
  await call(`${CONTENT}/${base}/${recordId}/${field}/uploadAttachment`, { method: 'POST', body: JSON.stringify({ contentType, filename, file }) });
}

/** The choices of a single-select field, from the base's schema. The token needs the schema.bases:read scope. */
export async function selectChoices(base, table, fieldId) {
  if (isMock()) return clone(mockTables().__choices?.[fieldId] ?? []);
  const meta = await call(`${API}/meta/bases/${base}/tables`);
  const field = meta.tables?.find((t) => t.id === table)?.fields?.find((f) => f.id === fieldId);
  return (field?.options?.choices ?? []).map((c) => c.name);
}

/** Remembers a slow read for a few minutes while a function instance stays warm. Never used for anything a person just changed. */
const kept = new Map();
export async function remember(key, seconds, load) {
  const hit = kept.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await load();
  kept.set(key, { value, until: Date.now() + seconds * 1000 });
  return value;
}
