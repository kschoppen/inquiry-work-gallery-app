// The app no longer works offline: its pages and data sit behind sign-in, and a saved copy could be shown to
// someone who is signed out. This file stays only to clear the old app's saved copy from phones that have it,
// then it removes itself. "Add to Home Screen" does not need it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
