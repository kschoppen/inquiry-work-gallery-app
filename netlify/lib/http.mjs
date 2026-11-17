/** Small helpers shared by the functions. */
import { sessionFrom } from './session.mjs';
import { sessionSecret } from './config.mjs';

const NO_STORE = { 'cache-control': 'no-store' };
export const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
export const fail = (status, error) => json({ error }, status);

/** The signed-in person, or null. Every private function calls this itself; the edge gate is a second lock, not the only one. */
export const whoIs = (req) => sessionFrom(req, sessionSecret());

export async function readJson(req) {
  try { const v = await req.json(); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

export const text = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const isEmail = (s) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(s) && s.length <= 254;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Wraps a handler so a thrown error becomes a plain message and a log line, never a stack trace in the response. */
export const safely = (handler) => async (req) => {
  try { return await handler(req); }
  catch (e) {
    console.error(`${new URL(req.url).pathname}: ${e?.message ?? e}`);
    return fail(e?.status && e.status < 500 ? e.status : 502, e?.publicMessage ?? 'Something went wrong reaching Airtable. Try again in a minute.');
  }
};
