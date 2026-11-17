/**
 * Sign-in gate in front of every page, script and API call. Without a valid session, pages go to the sign-in page
 * and API calls get a 401. The functions check the session again themselves; this gate keeps the pages private.
 *
 * Open without sign-in (see `excludedPath`): the sign-in page and its API, the consent page a speaker opens from
 * an email and its API, and files that hold no data (CSS, fonts, logo, icons, manifest, the service worker).
 * JavaScript for the app stays gated.
 */
import { NEXT_COOKIE, cookie, sessionFrom } from '../lib/session.mjs';
import { sessionSecret } from '../lib/config.mjs';

// The edge runtime provides this; the local dev server sets the same shape.
declare const Netlify: { env: { get(key: string): string | undefined } };
interface Context { next(): Promise<Response> }

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  if (await sessionFrom(req, Netlify.env.get('SESSION_SECRET') || sessionSecret())) return context.next();
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return Response.json({ error: 'Sign in first' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  // Remember where they were going, so sign-in can bring them back. Same-site paths only (checked again on use).
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { location: '/signin.html', 'set-cookie': cookie(NEXT_COOKIE, next, 600, url.protocol === 'https:'), 'cache-control': 'no-store' },
  });
};

export const config = {
  path: '/*',
  excludedPath: ['/api/auth/*', '/signin.html', '/consent', '/consent/*', '/api/consent', '/css/*', '/fonts/*', '/assets/*', '/icons/*', '/manifest.json', '/sw.js'],
};
