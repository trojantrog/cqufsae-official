import {cacheVideo} from './video-cache.js';

function mediaEvent(video, name, timeout = 25000, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, done); video.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`Media unavailable (${video.error?.code || 'network'})`)); };
    const abort = () => { cleanup(); reject(new DOMException('Media preparation canceled', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Media ${name} timeout`)); }, timeout);
    if (signal?.aborted) { abort(); return; }
    video.addEventListener(name, done, {once: true});
    video.addEventListener('error', fail, {once: true});
    signal?.addEventListener('abort', abort, {once: true});
  });
}

async function whenWanted(promise, wanted) {
  if (!wanted()) return false;
  let timer;
  try { return await Promise.race([promise.then(() => true), new Promise(resolve => {
    timer = setInterval(() => { if (!wanted()) resolve(false); }, 100);
  })]); } finally { clearInterval(timer); }
}

// A single retained canvas is the visible surface. Decoder changes never clear it.
// Each new clip is decoded before it is allowed to replace the current picture.
export class VideoSurface {
  constructor(canvas, {fps = 60, width = 1920, height = 1080, onError = () => {}} = {}) {
    this.canvas = canvas;
    canvas.width = width; canvas.height = height;
    this.context = canvas.getContext('2d', {alpha: false, desynchronized: true});
    this.context.fillStyle = '#eef1f1'; this.context.fillRect(0, 0, width, height);
    this.fps = fps; this.onError = onError;
    this.pool = new Map(); this.serial = 0; this.active = null; this.suspended = false; this.disposed = false;
    this.stats = {painted: 0, switches: 0, lastFrame: 0, lastTime: 0, dropped: 0};
    this.host = document.createElement('div');
    this.host.className = 'video-decoders'; this.host.inert = true; this.host.setAttribute('aria-hidden', 'true');
    document.body.append(this.host);
  }

  async poster(src) {
    if (!src) return;
    const image = new Image(); image.src = src;
    await image.decode();
    if (!this.stats.painted) {
      this.context.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
      this.posterReady = true;
    }
  }

  async prepare(clip, {frame = 0, slot = '', valid = () => true} = {}) {
    if (!clip?.src) throw new Error('Missing media clip');
    const key = `${clip.src}#${slot}`;
    let item = this.pool.get(key);
    if (!item) {
      const video = document.createElement('video');
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
      video.preload = 'auto'; video.disablePictureInPicture = true;
      video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
      video.width = 2; video.height = 2; this.host.append(video);
      item = {key, clip, video, touched: performance.now(), ready: false, pin: 0, borrowing: 0, controller: new AbortController()};
      this.pool.set(key, item);
      item.loading = (async () => {
        let source = clip.src;
        // Large native-video caches may discard bytes while buffered still
        // reports their historical range. Keep large same-origin films in one
        // bounded Blob so playback and reverse seeking never re-fetch frames.
        const sameOrigin = new URL(source, location.href).origin === location.origin;
        if (sameOrigin && (clip.resident || clip.bytes >= 20 * 1024 * 1024)) {
          const response = await fetch(source, {signal: item.controller.signal});
          if (!response.ok) throw new Error(`Media unavailable (${response.status})`);
          const blob = await response.blob();
          if (blob.size !== clip.bytes) throw new Error('Incomplete media download');
          item.objectURL = URL.createObjectURL(blob); source = item.objectURL;
        } else if (!sameOrigin) {
          item.cachedLease = cacheVideo(clip);
          source = await item.cachedLease.ready;
        }
        const loaded = mediaEvent(video, 'loadeddata', 25000, item.controller.signal); video.src = source; video.load(); await loaded;
        item.ready = true;
        return item;
      })().catch(error => {
        if (this.pool.get(key) === item) this.pool.delete(key);
        video.removeAttribute('src'); video.load(); video.remove();
        if (item.objectURL) URL.revokeObjectURL(item.objectURL);
        item.cachedLease?.release();
        throw error;
      });
    }
    item.touched = performance.now();
    item.borrowing = (item.borrowing || 0) + 1;
    try {
      if (!await whenWanted(item.loading, () => !this.disposed && valid())) return item;
      // Storage can be evicted independently of a retained native decoder.
      // Revalidate its lease before reusing a clip; unchanged cached sources
      // share the same download and never reload the video.
      if (item.cachedLease && item !== this.active?.item && !await this.refreshCache(item, valid)) return item;
      if (item.buffering) await this.buffer(item, valid);
      if (!this.disposed && valid() && item !== this.active?.item) await this.seek(item, frame);
      return item;
    } finally {
      // The awaiting caller pins or displays the result in its continuation.
      // Keep this lease through that microtask handoff, including concurrent
      // seeks, before it becomes an ordinary cache candidate.
      setTimeout(() => { item.borrowing--; if (!this.disposed && valid()) this.trim(); else this.discardIncomplete(item); }, 0);
    }
  }

  async refreshCache(item, valid) {
    const wanted = () => !this.disposed && valid() && this.pool.get(item.key) === item && item !== this.active?.item;
    while (item.cacheRefresh) if (!await whenWanted(item.cacheRefresh, wanted)) return false;
    if (!wanted()) return false;
    const task = (async () => {
      const lease = cacheVideo(item.clip);
      let adopted = false;
      try {
        if (!await whenWanted(lease.ready, wanted)) return false;
        const source = await lease.ready;
        if (!wanted()) return false;
        if (source !== item.video.getAttribute('src')) {
          item.cachedLease.release(); item.cachedLease = lease; adopted = true;
          const loaded = mediaEvent(item.video, 'loadeddata', 25000, item.controller.signal);
          item.video.src = source; item.video.load(); await loaded;
        }
        return wanted();
      } catch (error) {
        if (adopted && item.cachedLease === lease && this.pool.get(item.key) === item) {
          this.pool.delete(item.key); item.controller.abort();
          item.video.pause(); item.video.removeAttribute('src'); item.video.load(); item.video.remove();
          lease.release();
        }
        throw error;
      } finally { if (!adopted) lease.release(); }
    })();
    item.cacheRefresh = task;
    try { return await task; } finally { if (item.cacheRefresh === task) item.cacheRefresh = null; }
  }

  async seek(item, frame) {
    const {video, clip} = item;
    video.pause();
    const wantedFrame = Math.max(0, Math.min(clip.frames - 1, Math.round(frame)));
    // currentTime is rounded to microseconds by some decoders. Seek just
    // inside the desired frame so a fractional boundary cannot select its
    // predecessor (for example 142/60 becoming 2.366666).
    const time = wantedFrame / this.fps + (wantedFrame ? .001 : 0);
    if (Math.floor(video.currentTime * this.fps + .00001) !== wantedFrame || video.readyState < 2) {
      let callback, timer;
      const decoded = 'requestVideoFrameCallback' in video ? new Promise((resolve, reject) => {
        const presented = (_, metadata) => {
          if (Math.round(metadata.mediaTime * this.fps) === wantedFrame) resolve();
          else callback = video.requestVideoFrameCallback(presented);
        };
        callback = video.requestVideoFrameCallback(presented);
        timer = setTimeout(() => reject(new Error('Requested video frame was not presented')), 25000);
      }) : null;
      // A seek can finish before its decoded image reaches the compositor.
      // Keep the visible canvas until the requested PTS is actually available.
      decoded?.catch(() => {});
      try {
        const sought = mediaEvent(video, 'seeked', 25000, item.controller?.signal); video.currentTime = time; await sought;
        if (Math.floor(video.currentTime * this.fps + .00001) !== wantedFrame) throw new Error('Media server did not permit the requested frame');
        if (decoded) await decoded;
        else await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      } finally {
        clearTimeout(timer);
        if (callback != null) video.cancelVideoFrameCallback(callback);
      }
    }
    if (video.readyState < 2) await mediaEvent(video, 'loadeddata', 25000, item.controller?.signal);
    if (Math.floor(video.currentTime * this.fps + .00001) !== wantedFrame) throw new Error('Media server did not permit the requested frame');
    item.frame = wantedFrame;
    return item;
  }

  buffered(item) {
    const ranges = item.video.buffered, end = item.clip.frames / this.fps;
    let covered = 0;
    for (let index = 0; index < ranges.length; index++) {
      if (ranges.start(index) > covered + .002) break;
      covered = Math.max(covered, ranges.end(index));
    }
    return covered >= end - .5 / this.fps;
  }

  async buffer(item, valid = () => true) {
    const wanted = () => !this.disposed && valid();
    if (!wanted()) return false;
    if (!item.buffering && this.buffered(item)) return true;
    const consumer = {valid: wanted};
    let job = item.buffering;
    if (!job) {
      job = {consumers: new Set()}; item.buffering = job;
      job.consumers.add(consumer);
      item.borrowing = (item.borrowing || 0) + 1;
      job.promise = this.fillBuffer(item, () => [...job.consumers].some(owner => owner.valid())).finally(() => {
        if (item.buffering === job) item.buffering = null;
        item.borrowing--;
        setTimeout(() => this.discardIncomplete(item), 0);
      });
      job.promise.catch(() => {});
    } else job.consumers.add(consumer);
    let timer;
    try {
      return await Promise.race([job.promise, new Promise(resolve => {
        timer = setInterval(() => { if (!wanted()) resolve(false); }, 100);
      })]);
    } finally { clearInterval(timer); job.consumers.delete(consumer); }
  }

  async fillBuffer(item, valid) {
    const video = item.video;
    // These short films must be ready before a visible transition starts.
    // loadeddata only guarantees the first image, not uninterrupted playback.
    const started = performance.now();
    const restoreFrame = item === this.active?.item ? this.stats.lastFrame : item.frame || 0;
    let lastProgress = started, previous = 0, warming = false;
    video.preload = 'auto';
    try {
      while (valid() && !this.buffered(item)) {
        if (video.error) throw new Error(`Media unavailable (${video.error.code})`);
        const covered = [...Array(video.buffered.length)].reduce((sum, _, i) => sum + video.buffered.end(i) - video.buffered.start(i), 0);
        const now = performance.now();
        if (covered > previous + .001) { previous = covered; lastProgress = now; }
        if (now - started > 180000 || now - lastProgress > 30000) throw new Error('Media buffering timeout');
        // preload is a browser hint. If it deliberately suspends an incomplete
        // hidden clip, muted warm playback can request the remaining data.
        // The retained visible canvas is never replaced during this step.
        if (!warming && !this.suspended && video.networkState === 1 && now - lastProgress > 1200 && (item !== this.active?.item || this.active?.resumeBuffering)) {
          warming = true;
          video.loop = false; video.playbackRate = 1;
          video.play().catch(() => {});
        }
        if (warming && this.suspended && !video.paused) video.pause();
        else if (warming && !this.suspended && video.paused && !video.ended) video.play().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      if (warming) video.pause();
    }
    if (!valid()) return false;
    if (warming) await this.seek(item, restoreFrame);
    return true;
  }

  discardIncomplete(item) {
    if (!item || item.pin || item.borrowing || item === this.active?.item || this.buffered(item)) return;
    if (this.pool.get(item.key) !== item) return;
    this.pool.delete(item.key);
    item.controller?.abort();
    item.video.pause(); item.video.removeAttribute('src'); item.video.load(); item.video.remove();
    if (item.objectURL) URL.revokeObjectURL(item.objectURL);
    item.cachedLease?.release();
  }

  paint(item, frame) {
    if (item.video.readyState < 2) return false;
    this.context.drawImage(item.video, 0, 0, this.canvas.width, this.canvas.height);
    this.stats.painted++; this.stats.lastFrame = frame; this.stats.lastTime = performance.now();
    return true;
  }

  stop() {
    ++this.serial;
    const current = this.active;
    if (current) {
      current.item.video.pause();
      if (current.callback != null) {
        if (current.native) current.item.video.cancelVideoFrameCallback(current.callback);
        else cancelAnimationFrame(current.callback);
      }
      current.item.video.removeEventListener('ended', current.ended);
      current.item.video.removeEventListener('error', current.failed);
      current.item.video.removeEventListener('waiting', current.waiting);
      current.item.video.removeEventListener('playing', current.resumed);
      clearTimeout(current.stallTimer);
    }
    this.active = null;
  }

  show(item, frame = item.frame || 0) {
    this.stop(); this.paint(item, frame);
    item.touched = performance.now();
    this.trim();
  }

  play(item, {loop = false, beforeFrame = () => {}, onFrame = () => {}, onEnd = () => {}, onError = this.onError} = {}) {
    this.stop();
    const {video, clip} = item, token = this.serial;
    video.loop = loop;
    const active = {item, onFrame, onEnd, onError, callback: null, native: 'requestVideoFrameCallback' in video, ended: null};
    this.active = active; this.stats.switches++;
    this.trim();
    const frameOf = time => Math.min(clip.frames - 1, Math.max(0, Math.round(time * this.fps)));
    const paint = (time, metadata) => {
      if (token !== this.serial || this.suspended) return;
      const frame = frameOf(metadata?.mediaTime ?? video.currentTime);
      if (metadata?.presentedFrames != null) {
        if (active.presented != null) this.stats.dropped += Math.max(0, metadata.presentedFrames - active.presented - 1);
        active.presented = metadata.presentedFrames;
      }
      if (frame !== active.lastFrame) {
        beforeFrame(frame, active.lastFrame);
        if (token !== this.serial) return;
        this.paint(item, frame); active.lastFrame = frame;
        onFrame(frame, metadata?.mediaTime ?? video.currentTime);
      }
      if (token !== this.serial || this.suspended) return;
      active.callback = active.native ? video.requestVideoFrameCallback(paint) : requestAnimationFrame(paint);
    };
    active.ended = () => {
      if (token !== this.serial) return;
      this.paint(item, clip.frames - 1);
      onFrame(clip.frames - 1, (clip.frames - 1) / this.fps);
      if (token === this.serial) { this.stop(); onEnd(); }
    };
    video.addEventListener('ended', active.ended);
    active.failed = () => { if (token === this.serial) onError(new Error(`Media playback interrupted (${video.error?.code || 'network'})`)); };
    active.resumed = () => clearTimeout(active.stallTimer);
    active.waiting = () => {
      clearTimeout(active.stallTimer);
      if (!this.suspended) active.stallTimer = setTimeout(() => { if (token === this.serial && !this.suspended) active.failed(); }, 12000);
    };
    video.addEventListener('error', active.failed);
    video.addEventListener('waiting', active.waiting);
    video.addEventListener('playing', active.resumed);
    this.paint(item, frameOf(video.currentTime));
    active.lastFrame = frameOf(video.currentTime);
    onFrame(active.lastFrame, video.currentTime);
    active.tick = paint;
    if (!this.suspended) {
      active.callback = active.native ? video.requestVideoFrameCallback(paint) : requestAnimationFrame(paint);
      video.play().catch(error => { if (token === this.serial) onError(error); });
    }
  }

  suspend(value) {
    value = Boolean(value);
    if (value === this.suspended) return;
    this.suspended = value;
    const active = this.active;
    if (!active) return;
    const video = active.item.video;
    if (value) {
      video.pause();
      clearTimeout(active.stallTimer);
      if (active.native) video.cancelVideoFrameCallback(active.callback);
      else cancelAnimationFrame(active.callback);
    } else {
      const valid = () => this.active === active && !this.suspended && !this.disposed;
      const resume = () => {
        if (!valid()) return;
        active.callback = active.native ? video.requestVideoFrameCallback(active.tick) : requestAnimationFrame(active.tick);
        video.play().catch(error => { if (valid()) active.onError(error); });
      };
      if (active.item.buffering || !this.buffered(active.item)) {
        active.resumeBuffering = true;
        this.buffer(active.item, valid).then(ready => {
          active.resumeBuffering = false; if (ready) resume();
        }).catch(error => { active.resumeBuffering = false; if (valid()) active.onError(error); });
      } else resume();
    }
  }

  pin(item) {
    item.pin++; let released = false;
    return () => { if (!released) { released = true; item.pin = Math.max(0, item.pin - 1); } };
  }

  async reload(item, frame) {
    this.stop();
    let source;
    if (item.cachedLease) {
      item.cachedLease.release();
      item.cachedLease = cacheVideo(item.clip);
      source = await item.cachedLease.ready;
    }
    const loaded = mediaEvent(item.video, 'loadeddata', 25000, item.controller?.signal);
    if (source) item.video.src = source;
    item.video.load(); await loaded; await this.seek(item, frame);
    return item;
  }

  trim(keep = 8) {
    const unused = [...this.pool.values()].filter(item => item.ready && !item.pin && !item.borrowing && item !== this.active?.item).sort((a, b) => a.touched - b.touched);
    while (this.pool.size > keep && unused.length) {
      const item = unused.shift(); this.pool.delete(item.key);
      item.controller?.abort();
      item.video.pause(); item.video.removeAttribute('src'); item.video.load(); item.video.remove();
      if (item.objectURL) URL.revokeObjectURL(item.objectURL);
      item.cachedLease?.release();
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    for (const item of this.pool.values()) {
      item.controller?.abort(); item.video.removeAttribute('src'); item.video.load();
      if (item.objectURL) URL.revokeObjectURL(item.objectURL);
      item.cachedLease?.release();
    }
    this.pool.clear(); this.host.remove();
  }
}

export const nextExit = (exits, frame, total, lead = 6) => {
  if (!exits?.length) throw new Error('No continuous return clip');
  return exits.reduce((best, candidate) => {
    const distance = (candidate.phaseFrame - frame + total) % total;
    const wait = distance < lead ? distance + total : distance;
    return !best || wait < best.wait ? {clip: candidate, wait} : best;
  }, null).clip;
};

export function crossedPhase(previous, current, phase, total) {
  if (previous == null) return false;
  const travelled = (current - previous + total) % total;
  const distance = (phase - previous + total) % total;
  return distance > 0 && distance <= travelled;
}
