/**
 * POST /api/favorites { gsid, on }: star or unstar a district. Only used once the favorites table exists
 * (FAVORITES_BASE_ID and FAVORITES_TABLE_ID); until then the browser keeps the stars itself and never calls this.
 */
import type { Config } from '@netlify/functions';
import { companyByGsid, setFavorite } from '../lib/companies.mjs';
import { fail, json, readJson, safely, text, whoIs } from '../lib/http.mjs';

export default safely(async (req: Request) => {
  const who = await whoIs(req);
  if (!who) return fail(401, 'Sign in first');
  if (req.method !== 'POST') return fail(405, 'Not allowed');
  const body = await readJson(req);
  const company = await companyByGsid(text(body?.gsid, 100));
  if (!company) return fail(400, 'That district is not in the Gainsight list.');
  const stored = await setFavorite(who.email, company, body?.on === true);
  return stored ? json({ ok: true }) : fail(409, 'Favorites are kept on this phone for now.');
});

export const config: Config = { path: '/api/favorites' };
