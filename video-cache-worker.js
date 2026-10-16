const PREFIX = 'cqufsae-video-opaque-v1-';
const TOKEN = '__cqu_video_cache';
const OWNER = new URL('./video-cache-owner', self.location.href).href;
const ID = /^[0-9a-f]{32}$/;
let lifecycle = Promise.resolve();

function serial(job) {
  const result = lifecycle.then(job);
  lifecycle = result.catch(() => {});
  return result;
}

async function cleanOrphans(keepClient) {
  const live = new Set((await self.clients.matchAll({type: 'window', includeUncontrolled: true})).map(client => client.id));
  if (keepClient) live.add(keepClient);
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || !ID.test(name.slice(PREFIX.length))) continue;
    const cache = await caches.open(name);
    const owner = await cache.match(OWNER).then(value => value?.json()).catch(() => null);
    if (!owner || !live.has(owner.browserClientId)) await caches.delete(name);
  }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(serial(async () => {
  await cleanOrphans(); await self.clients.claim();
})));

self.addEventListener('message', event => {
  if (event.data?.type !== 'cqu-video-cache-init-v1') return;
  const pageId = event.data.pageId, browserClientId = event.source?.id;
  const task = serial(async () => {
    if (!ID.test(pageId || '') || !browserClientId) throw new Error('Invalid media client');
    const client = await self.clients.get(browserClientId);
    if (!client || client.type !== 'window' || new URL(client.url).origin !== self.location.origin) throw new Error('Invalid media client');
    const cache = await caches.open(PREFIX + pageId);
    const previous = await cache.match(OWNER).then(value => value?.json()).catch(() => null);
    if (previous && previous.browserClientId !== browserClientId) throw new Error('Media client changed');
    await cache.put(OWNER, new Response(JSON.stringify({pageId, browserClientId}), {headers: {'Content-Type': 'application/json'}}));
    await cleanOrphans(browserClientId);
    event.ports[0]?.postMessage({ok: true, pageId});
  }).catch(error => event.ports[0]?.postMessage({ok: false, reason: String(error?.message || 'Media cache unavailable')}));
  event.waitUntil(task);
});

function cacheKey(request) {
  if (request.method !== 'GET' || request.destination !== 'video' || request.mode !== 'no-cors') return null;
  const url = new URL(request.url);
  if (url.username || url.password || url.hash || [...url.searchParams.keys()].length !== 1) return null;
  const token = url.searchParams.get(TOKEN) || '';
  const [pageId, entryId, extra] = token.split('.');
  if (extra !== undefined || !ID.test(pageId || '') || !ID.test(entryId || '')) return null;
  url.search = '';
  const release = url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && /^\/trojantrog\/cqufsae-official\/releases\/download\/[A-Za-z0-9][A-Za-z0-9._-]{1,100}\/video-[0-9a-f]{64}\.mp4$/.test(url.pathname);
  const preview = self.location.hostname === '127.0.0.1' && url.protocol === 'http:' && url.hostname === '127.0.0.1' && /^\/research\/753-video-final\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp4$/.test(url.pathname);
  return release || preview ? {pageId, key: request.url} : null;
}

self.addEventListener('fetch', event => {
  const parsed = cacheKey(event.request);
  if (!parsed) return;
  event.respondWith((async () => {
    try {
      const name = PREFIX + parsed.pageId;
      if (!event.clientId || !await caches.has(name)) return Response.error();
      const client = await self.clients.get(event.clientId);
      if (!client || new URL(client.url).origin !== self.location.origin) return Response.error();
      const cache = await caches.open(name);
      const owner = await cache.match(OWNER).then(value => value?.json()).catch(() => null);
      if (owner?.pageId !== parsed.pageId || owner?.browserClientId !== event.clientId) return Response.error();
      // The response stays opaque and intact, including for native Range
      // requests. Only the tested desktop Chrome behavior is relied on.
      const cached = await cache.match(parsed.key);
      return cached?.type === 'opaque' ? cached : Response.error();
    } catch { return Response.error(); }
  })());
});
