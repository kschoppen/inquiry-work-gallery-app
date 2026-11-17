/**
 * Local server for reviewing the app: `npm run dev` (mock mode), then open http://localhost:8888.
 * Serves public/, sends /api/* to the same function handlers Netlify runs, and puts the same sign-in gate in front.
 * Plain Node, no Netlify CLI. It never deploys anything.
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(root, 'public');
const PORT = Number(process.env.PORT) || 8888;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// The edge runtime's env reader, for the gate.
globalThis.Netlify = { env: { get: (k) => process.env[k] } };

/** The [[headers]] blocks from netlify.toml, so a header that would break a page shows up here first. */
async function tomlHeaders() {
  const toml = await readFile(join(root, 'netlify.toml'), 'utf8');
  const rules = [];
  for (const block of toml.split('[[headers]]').slice(1)) {
    const path = /for\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const values = {};
    for (const m of block.split('[headers.values]')[1]?.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"((?:[^"\\]|\\.)*)"/gm) ?? []) values[m[1]] = m[2];
    if (path) rules.push({ path, values });
  }
  return rules;
}
const glob = (pattern, path) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(path);

const routes = [];
for (const file of await readdir(join(root, 'netlify/functions'))) {
  const mod = await import(join(root, 'netlify/functions', file));
  for (const path of [mod.config.path].flat()) routes.push({ path, handler: mod.default });
}
const gate = await import(join(root, 'netlify/edge-functions/gate.ts'));
const headerRules = await tomlHeaders();

async function staticFile(pathname) {
  let file = normalize(join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return new Response('Not found', { status: 404 });
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { /* falls through to 404 */ }
  try { return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' } }); }
  catch { return new Response('Not found', { status: 404 }); }
}

async function handle(req) {
  const { pathname } = new URL(req.url);
  const serve = async () => {
    const route = routes.find((r) => r.path === pathname);
    return route ? route.handler(req) : pathname.startsWith('/api/') ? Response.json({ error: 'Not found' }, { status: 404 }) : staticFile(pathname);
  };
  const open = gate.config.excludedPath.some((p) => glob(p, pathname));
  const res = open ? await serve() : await gate.default(req, { next: serve });
  const headers = new Headers(res.headers);
  for (const rule of headerRules) if (glob(rule.path, pathname)) for (const [k, v] of Object.entries(rule.values)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

createServer(async (nodeReq, nodeRes) => {
  try {
    const chunks = [];
    for await (const c of nodeReq) chunks.push(c);
    const body = Buffer.concat(chunks);
    const req = new Request(`http://${nodeReq.headers.host}${nodeReq.url}`, { method: nodeReq.method, headers: nodeReq.headers, body: body.length ? body : undefined });
    const res = await handle(req);
    const out = {};
    res.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = res.headers.getSetCookie();
    if (cookies.length) out['set-cookie'] = cookies;
    nodeRes.writeHead(res.status, out);
    nodeRes.end(Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    console.error(e);
    nodeRes.writeHead(500).end('Server error');
  }
}).listen(PORT, () => console.log(`Inquiry Work Gallery on http://localhost:${PORT}${process.env.MOCK === '1' ? ' (mock mode: placeholder data, no Google, no Airtable, no email)' : ''}`));
