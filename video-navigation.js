import {nextExit, crossedPhase} from './video-media.js?v=753';

const clamp = value => Math.max(0, Math.min(1, value));

// All routes meet at one rendered vehicle pose. A new selection only changes
// the destination; the currently visible route is allowed to finish smoothly.
export class VideoNavigator {
  constructor(surface, manifest, {onState = () => {}, onFrame = () => {}, onError = () => {}} = {}) {
    this.surface = surface; this.manifest = manifest;
    this.onState = onState; this.onFrame = onFrame; this.onError = onError;
    this.phase = 'loading'; this.current = 'all'; this.target = 'all';
    this.scroll = 0; this.progress = 0; this.loopFrame = 0; this.selection = 0;
    this.pending = null; this.reduced = false; this.visible = true; this.frameRequest = null;
    this.exiting = null; this.recovery = null; this.reducedTask = null;
    this.playSerial = 0;
  }

  state() {
    return {phase: this.phase, current: this.current, target: this.target, progress: this.progress, loopFrame: this.loopFrame};
  }

  emit(phase = this.phase) { this.phase = phase; this.onState(this.state()); }

  async start() {
    this.overview = await this.surface.prepare(this.manifest.overview, {slot: 'overview'});
    this.unpinOverview = this.surface.pin(this.overview);
    await this.surface.buffer(this.overview);
    this.surface.show(this.overview); this.emit('overview');
    this.updateScroll(this.scroll);
  }

  select(id) {
    if (id !== 'all' && !this.manifest.systems[id]) return;
    this.target = id; ++this.selection; this.cancelPending();
    this.emit();
    this.advance().catch(this.onError);
  }

  cancelPending() {
    this.pending?.releases.forEach(release => release());
    this.pending?.destination?.release(); this.pending = null;
  }

  async advance() {
    if (this.phase === 'loading' || !this.visible) return;
    if (this.phase === 'error') { await this.retry(); return; }
    if (this.reduced) { await this.showReduced(); return; }
    if (this.phase === 'overview') {
      if (this.target === 'all') { this.updateScroll(this.scroll); return; }
      if (this.progress > .0001) { this.scrub(); return; }
      await this.enter();
    } else if (this.phase === 'loop' && this.target !== this.current && !this.pending) {
      await this.prepareExit();
    }
  }

  fail(error, recovery) {
    this.surface.stop(); this.recovery = recovery; this.emit('error'); this.onError(error);
  }

  async retry() {
    if (this.retrying) return this.retrying;
    const recover = this.recovery; this.recovery = null;
    if (recover) {
      this.retrying = (async () => {
        try { await recover(); } catch (error) { this.fail(error, recover); }
        this.retrying = null;
        if (this.phase !== 'error') await this.advance();
      })();
      return this.retrying;
    }
    else if (this.phase === 'error') { this.emit(this.current === 'all' ? 'overview' : 'still'); await this.advance(); }
    else { this.cancelPending(); await this.advance(); }
  }

  play(item, options) {
    const phase = this.phase, current = this.current, serial = ++this.playSerial;
    if (item.buffering || !this.surface.buffered(item)) {
      const valid = () => this.playSerial === serial && this.phase === phase && this.current === current && !this.reduced;
      this.surface.buffer(item, valid).then(ready => {
        if (ready && valid()) this.play(item, options);
      }).catch(error => { if (valid()) this.fail(error, () => this.play(item, options)); });
      return;
    }
    this.surface.play(item, {...options, onError: error => {
      const frame = this.surface.stats.lastFrame;
      this.fail(error, async () => { await this.surface.reload(item, frame); this.emit(phase); this.play(item, options); });
    }});
  }

  async prepareTarget(id, valid = () => true) {
    if (id === 'all') return null;
    const system = this.manifest.systems[id];
    const entry = await this.surface.prepare(system.enter, {slot: `enter-${id}`, valid});
    const unpinEntry = this.surface.pin(entry);
    let loop, unpinLoop;
    const prepared = {id, entry, loop: null, release: () => {
      unpinEntry(); unpinLoop?.();
      this.surface.discardIncomplete(entry); this.surface.discardIncomplete(loop);
    }};
    try {
      if (!valid()) return prepared;
      loop = await this.surface.prepare(system.loop, {slot: `loop-${id}`, valid});
      prepared.loop = loop; unpinLoop = this.surface.pin(loop);
      if (await this.surface.buffer(entry, valid)) await this.surface.buffer(loop, valid);
      return prepared;
    } catch (error) { prepared.release(); throw error; }
  }

  async enter() {
    const id = this.target, token = this.selection;
    const owner = {}; this.enterOwner = owner;
    this.emit('preparing');
    let prepared;
    try { prepared = await this.prepareTarget(id, () => token === this.selection && this.target === id); }
    catch (error) {
      if (this.enterOwner !== owner || this.disposed || this.reduced) return;
      this.enterOwner = null; this.emit('overview');
      if (token !== this.selection || this.target !== id) { await this.advance(); return; }
      throw error;
    }
    if (token !== this.selection || this.target !== id) {
      prepared.release();
      if (this.enterOwner === owner && !this.disposed && !this.reduced) {
        this.enterOwner = null; this.emit('overview'); await this.advance();
      }
      return;
    }
    this.enterOwner = null;
    this.prepared?.release(); this.prepared = prepared;
    this.current = id; this.emit('enter');
    this.play(prepared.entry, {
      onFrame: frame => this.onFrame(id, 'enter', frame),
      onEnd: () => this.loop(prepared), onError: this.onError
    });
  }

  async loop(prepared = this.prepared) {
    try {
      await this.surface.seek(prepared.loop, 0);
      this.emit('loop'); this.loopFrame = 0;
      this.play(prepared.loop, {loop: true,
        beforeFrame: (frame, previous) => {
          const pending = this.pending, total = this.manifest.systems[this.current].loop.frames;
          if (pending?.ready && crossedPhase(previous, frame, pending.clip.phaseFrame, total)) {
            // Take the matching boundary before drawing the next loop frame.
            // A busy display can skip a frame, but never shows a later loop pose
            // and then jumps backward to the exit's first pose.
            this.exit(pending);
          }
        }, onError: this.onError
        ,onFrame: frame => { this.loopFrame = frame; this.onFrame(this.current, 'loop', frame); }
      });
      await this.advance();
    } catch (error) { this.fail(error, () => this.loop(prepared)); }
  }

  async prepareExit() {
    const id = this.current, token = this.selection, system = this.manifest.systems[id];
    const clip = nextExit(system.exits, this.loopFrame, system.loop.frames, Math.round(this.manifest.fps * .45));
    const pending = {clip, ready: false, token, releases: []}; this.pending = pending;
    try {
      const valid = () => this.pending === pending && token === this.selection && this.phase === 'loop' && !this.disposed;
      const item = await this.surface.prepare(clip, {slot: `exit-${id}`, valid});
      pending.releases.push(this.surface.pin(item));
      if (!await this.surface.buffer(item, valid)) {
        pending.releases.forEach(release => release()); this.surface.discardIncomplete(item); return;
      }
      const destination = this.target === 'all' ? null : await this.prepareTarget(this.target, valid);
      if (this.pending !== pending || token !== this.selection || this.phase !== 'loop') {
        pending.releases.forEach(release => release()); destination?.release(); return;
      }
      pending.item = item; pending.destination = destination; pending.ready = true;
    } catch (error) {
      pending.releases.forEach(release => release());
      if (this.pending === pending && token === this.selection && !this.disposed) {
        this.pending = null; this.onError(error);
      }
    }
  }

  exit(pending) {
    this.pending = null; this.exiting = pending; this.emit('exit');
    this.play(pending.item, {
      onFrame: frame => this.onFrame(this.current, 'exit', frame, pending.clip.phaseFrame),
      onEnd: async () => {
        this.exiting = null;
        pending.releases.forEach(release => release());
        this.prepared?.release(); this.prepared = null;
        this.current = 'all'; this.progress = 0;
        if (pending.destination && pending.destination.id === this.target && !this.reduced) {
          const prepared = pending.destination; this.prepared = prepared; this.current = prepared.id;
          this.emit('enter');
          this.play(prepared.entry, {
            onFrame: frame => this.onFrame(this.current, 'enter', frame),
            onEnd: () => this.loop(prepared), onError: this.onError
          });
        } else {
          pending.destination?.release();
          this.emit('overview');
          try { await this.surface.seek(this.overview, 0); this.surface.show(this.overview); await this.advance(); }
          catch (error) { this.fail(error, async () => { await this.surface.seek(this.overview, 0); this.surface.show(this.overview); this.emit('overview'); await this.advance(); }); }
        }
      }, onError: this.onError
    });
  }

  updateScroll(progress) {
    this.scroll = clamp(progress);
    if (this.phase === 'overview') this.scrub();
  }

  scrub() {
    if (this.frameRequest != null || this.scrubBusy || !this.visible || !this.overview) return;
    let previous = performance.now();
    const step = async now => {
      this.frameRequest = null;
      if (this.phase !== 'overview' || !this.visible) return;
      this.scrubBusy = true;
      const target = this.target === 'all' ? this.scroll : 0;
      const dt = Math.min(.05, (now - previous) / 1000); previous = now;
      this.progress = this.reduced ? target : this.progress + (target - this.progress) * (1 - Math.exp(-dt * 8));
      if (Math.abs(target - this.progress) < .0008) this.progress = target;
      const frame = Math.round(this.progress * (this.manifest.overview.frames - 1));
      try {
        if (this.overview.frame !== frame) await this.surface.seek(this.overview, frame);
        if (this.phase === 'overview' && this.visible) {
          this.surface.show(this.overview, frame); this.onFrame('all', 'overview', frame); this.emit();
        }
      } catch (error) {
        this.fail(error, async () => { await this.surface.reload(this.overview, frame); this.surface.show(this.overview, frame); this.emit('overview'); });
      } finally { this.scrubBusy = false; }
      if (this.phase === 'overview' && this.visible) {
        const latest = this.target === 'all' ? this.scroll : 0;
        if (this.progress !== latest) this.frameRequest = requestAnimationFrame(step);
        else await this.advanceIfSelected();
      }
    };
    this.frameRequest = requestAnimationFrame(step);
  }

  async advanceIfSelected() { if (this.target !== 'all') await this.advance(); }

  async showReduced() {
    this.enterOwner = null;
    const token = this.selection, id = this.target;
    this.reducedTask = token;
    this.surface.stop(); this.cancelPending();
    this.exiting?.releases.forEach(release => release()); this.exiting?.destination?.release(); this.exiting = null;
    if (id === 'all') { this.current = 'all'; this.emit('overview'); this.scrub(); return; }
    this.emit('preparing');
    const item = await this.surface.prepare(this.manifest.systems[id].loop, {slot: `loop-${id}`});
    if (token !== this.selection || !this.reduced) return;
    this.reducedTask = null;
    this.surface.show(item); this.current = id; this.loopFrame = 0; this.emit('still');
    this.onFrame(id, 'loop', 0);
  }

  motion(value) {
    this.reduced = Boolean(value); ++this.selection;
    if (this.reduced) this.showReduced().catch(error => this.fail(error, () => this.showReduced()));
    else if (this.phase === 'still' || this.reducedTask != null) {
      this.reducedTask = null;
      if (this.current === 'all') { this.emit('overview'); this.advance().catch(this.onError); return; }
      const token = this.selection;
      const resume = async () => {
        const prepared = await this.prepareTarget(this.current, () => token === this.selection && !this.reduced);
        if (token !== this.selection || this.reduced) {
          prepared.release();
          if (!this.reduced) { this.emit('still'); this.motion(false); }
          return;
        }
        this.prepared?.release(); this.prepared = prepared; await this.loop(prepared);
      };
      this.emit('preparing'); resume().catch(error => this.fail(error, resume));
    } else this.advance().catch(this.onError);
  }

  visibility(value) {
    this.visible = Boolean(value); this.surface.suspend(!this.visible);
    if (this.visible) this.advance().catch(this.onError);
  }

  dispose() {
    this.disposed = true; this.enterOwner = null; ++this.selection; ++this.playSerial;
    this.visible = false; this.onError = () => {};
    cancelAnimationFrame(this.frameRequest); this.unpinOverview?.(); this.prepared?.release();
    this.pending?.releases.forEach(release => release()); this.pending?.destination?.release(); this.surface.dispose();
    this.exiting?.releases.forEach(release => release()); this.exiting?.destination?.release();
  }
}
