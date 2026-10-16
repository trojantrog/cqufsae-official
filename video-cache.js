const PREFIX = 'cqufsae-video-opaque-v1-';
const TOKEN = '__cqu_video_cache';
const MAX_ENTRIES = 12;
const MAX_BYTES = 256 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 180000;
const BOOTSTRAP_TIMEOUT = 180000;
const CONTROL_TIMEOUT = 20000;
const entries = new Map();
const pageId = crypto.randomUUID().replaceAll('-', '');
const cacheName = PREFIX + pageId;
const workerURL = new URL('./video-cache-worker.js', import.meta.url);
const ownerURL = new URL('./video-cache-owner', workerURL).href;
let clientReady;

function aborted() { return new DOMException('影片加载已取消。', 'AbortError'); }
function unavailable() { return new Error('影片读取失败，请检查连接后重试。'); }

function sourceURL(clip) {
  const source = new URL(clip?.src, location.href);
  if (source.origin === location.origin || source.username || source.password || source.search || source.hash) throw unavailable();
  const release = source.protocol === 'https:' && source.hostname === 'github.com' && !source.port && /^\/trojantrog\/cqufsae-official\/releases\/download\/[A-Za-z0-9][A-Za-z0-9._-]{1,100}\/video-[0-9a-f]{64}\.mp4$/.test(source.pathname);
  const preview = location.hostname === '127.0.0.1' && source.protocol === 'http:' && source.hostname === '127.0.0.1' && /^\/research\/753-video-final\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp4$/.test(source.pathname);
  if (!release && !preview) throw unavailable();
  if (!Number.isSafeInteger(clip.bytes) || clip.bytes < 1 || clip.bytes >= 100000000) throw unavailable();
  return source.href;
}

function ownController() {
  const controller = navigator.serviceWorker?.controller;
  return controller && new URL(controller.scriptURL).href === workerURL.href ? controller : null;
}

function waitFor(promise, signal, timeout = CONTROL_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(aborted()); };
    const timer = setTimeout(() => { cleanup(); reject(unavailable()); }, timeout);
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    signal?.addEventListener('abort', cancel, {once: true});
    if (signal?.aborted) cancel();
  });
}

async function connectClient() {
  if (!('serviceWorker' in navigator) || !('caches' in window) || !isSecureContext) throw unavailable();
  await waitFor(navigator.serviceWorker.register(workerURL.href, {scope: new URL('./', workerURL).href, updateViaCache: 'none'}), undefined, BOOTSTRAP_TIMEOUT);
  if (!ownController()) await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); };
    const changed = () => { if (ownController()) { cleanup(); resolve(); } };
    const timer = setTimeout(() => { cleanup(); reject(unavailable()); }, CONTROL_TIMEOUT);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    changed();
  });
  const controller = ownController();
  if (!controller) throw unavailable();
  await new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const cleanup = () => { clearTimeout(timer); channel.port1.close(); };
    const timer = setTimeout(() => { cleanup(); reject(unavailable()); }, CONTROL_TIMEOUT);
    channel.port1.onmessage = event => {
      cleanup(); event.data?.ok && event.data?.pageId === pageId ? resolve() : reject(unavailable());
    };
    try { controller.postMessage({type: 'cqu-video-cache-init-v1', pageId}, [channel.port2]); }
    catch { cleanup(); reject(unavailable()); }
  });
}

function ensureClient() {
  if (!clientReady) {
    const task = connectClient().finally(() => { if (clientReady === task) clientReady = null; });
    clientReady = task;
  }
  return clientReady;
}

async function hasEntry(entry) {
  if (!ownController() || !await caches.has(cacheName)) return false;
  const cache = await caches.open(cacheName);
  return !!await cache.match(ownerURL) && !!await cache.match(entry.key);
}

async function removeEntry(entry) {
  // A completed old put must never delete a later download of the same asset.
  await entry.task.catch(() => {});
  try { if (await caches.has(cacheName)) await (await caches.open(cacheName)).delete(entry.key); } catch {}
}

function createEntry(source, bytes) {
  const key = new URL(source);
  key.searchParams.set(TOKEN, pageId + '.' + crypto.randomUUID().replaceAll('-', ''));
  const entry = {source, key: key.href, bytes, refs: 0, controller: new AbortController(), task: null};
  entries.set(source, entry);
  entry.task = (async () => {
    let timeout;
    try {
      // Registration can need a network round trip on a first visit. Local
      // control handshakes keep their short deadline; media gets its own budget.
      await waitFor(ensureClient(), entry.controller.signal, BOOTSTRAP_TIMEOUT);
      if (!entry.refs || entry.controller.signal.aborted) throw aborted();
      timeout = setTimeout(() => { entry.timedOut = true; entry.controller.abort(); }, DOWNLOAD_TIMEOUT);
      const response = await fetch(source, {mode: 'no-cors', credentials: 'omit', signal: entry.controller.signal});
      if (response.type !== 'opaque') throw unavailable();
      const cache = await caches.open(cacheName);
      if (!entry.refs || entry.controller.signal.aborted) throw aborted();
      // Cache.put waits for the entire hidden response body. Its bytes and
      // status remain opaque; this does not perform a client-side SHA check.
      await cache.put(new Request(entry.key, {mode: 'no-cors', credentials: 'omit'}), response);
      if (!entry.refs || entry.controller.signal.aborted) throw aborted();
      if (!ownController() || !await cache.match(entry.key)) throw unavailable();
      return entry.key;
    } catch (error) {
      if (entries.get(source) === entry) entries.delete(source);
      if (entry.timedOut) throw new DOMException('影片加载时间较长，请检查连接后重试。', 'TimeoutError');
      throw entry.controller.signal.aborted ? aborted() : error;
    } finally { clearTimeout(timeout); }
  })();
  entry.task.catch(() => { void removeEntry(entry); });
  return entry;
}

function getEntry(source, bytes) {
  let entry = entries.get(source);
  if (entry && entry.bytes !== bytes) throw unavailable();
  if (!entry) {
    if (entries.size >= MAX_ENTRIES || [...entries.values()].reduce((sum, item) => sum + item.bytes, 0) + bytes > MAX_BYTES) throw unavailable();
    entry = createEntry(source, bytes);
  }
  return entry;
}

function releaseEntry(entry) {
  if (entry.refs > 0) entry.refs--;
  if (!entry.refs) {
    if (entries.get(entry.source) === entry) entries.delete(entry.source);
    entry.controller.abort(); void removeEntry(entry);
  }
}

/** A synchronous lease. Only its ready promise waits for registration/download. */
export function cacheVideo(clip) {
  let entry;
  try {
    const source = sourceURL(clip);
    entry = getEntry(source, clip.bytes);
  } catch (error) {
    const ready = Promise.reject(error); ready.catch(() => {});
    return {ready, release() {}};
  }
  entry.refs++;
  let released = false, rejectReady;
  const ready = new Promise((resolve, reject) => {
    rejectReady = reject;
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        await entry.task;
        if (released) throw aborted();
        const present = await hasEntry(entry);
        if (released) throw aborted();
        if (present) return entry.key;
        // Whole-origin eviction can remove an otherwise completed item. A new
        // lease repairs ownership and downloads with a new independent token.
        const old = entry;
        if (entries.get(old.source) === old) entries.delete(old.source);
        entry = getEntry(old.source, old.bytes); entry.refs++;
        releaseEntry(old);
      }
      await entry.task;
      const present = await hasEntry(entry);
      if (!released && present) return entry.key;
      throw released ? aborted() : unavailable();
    })().then(resolve, reject);
  });
  // A caller may release a lease before awaiting it. Keep the rejected result
  // observable to awaiters while preventing an unhandled rejection.
  ready.catch(() => {});
  return {ready, release() {
    if (released) return;
    released = true; rejectReady(aborted()); releaseEntry(entry);
  }};
}

globalThis.addEventListener?.('pagehide', event => {
  if (event.persisted) return;
  for (const entry of entries.values()) {
    entry.refs = 0; entry.controller.abort(); void removeEntry(entry);
  }
  entries.clear();
});
