import {storyPosition, createScrollScrub} from './showcase-scroll.js?v=743';

// Keep the review viewer's controls out of the public presentation. These
// inert nodes let the renderer share its existing status writers and bindings.
export function prepareShowcase() {
  const backstage = document.createElement('div');
  backstage.hidden = true;
  backstage.inert = true;
  backstage.setAttribute('aria-hidden', 'true');
  const placeholders = {
    'part-count':'span', 'focus-view':'button', 'model-caption':'span',
    'work-location':'span', 'reset-camera':'button', 'cockpit-view':'button',
    'selection-tag':'span', 'zoom-in':'button', 'zoom-out':'button',
    'vehicle-response':'div', 'play-explosion':'button', 'explosion-progress':'input',
    'explosion-value':'output', 'assemble-car':'button', 'work-controls':'div',
    'work-toggle':'button', 'work-replay':'button', 'work-back':'button',
    'work-progress':'input', 'work-caption':'p', 'related-parts':'p', 'ex-reduce':'button'
  };
  for (const [id, tag] of Object.entries(placeholders)) {
    if (document.getElementById(id)) continue;
    const element = document.createElement(tag);
    element.id = id;
    if (tag === 'button') element.type = 'button';
    backstage.append(element);
  }
  const timeline = document.createElement('div');
  timeline.className = 'ex-timeline';
  backstage.append(timeline);
  document.body.append(backstage);
}

export function createShowcase({reduced}) {
  const story = document.getElementById('car-story');
  const sticky = story.querySelector('.showcase-sticky');
  const hint = document.getElementById('showcase-hint');
  const announcement = document.getElementById('showcase-announcement');
  const scrub = createScrollScrub();
  let position = {phase: 0, explosion: 0, heroOpacity: 1};
  let dirty = true, onScreen = true, loaded = false, api, track = null;
  let cameraPhase = 'overview', cameraBlend = null, selection = 'all', textAnimation = null;
  let lastAnnouncement = '', lastPhase = '', loadingVariant = false;
  const markDirty = () => { dirty = true; };

  function measure() {
    if (!dirty) return;
    dirty = false;
    const box = story.getBoundingClientRect();
    position = storyPosition(window.scrollY, box.top + window.scrollY, story.offsetHeight, sticky.offsetHeight);
    story.style.setProperty('--scroll-phase', position.phase);
    story.style.setProperty('--story-progress', position.explosion);
    story.style.setProperty('--hero-opacity', selection === 'all' ? position.heroOpacity : 0);
    const output = document.getElementById('showcase-progress');
    if (output) output.textContent = `${Math.round(position.explosion * 100)}%`;
    updateHint();
  }
  function updateHint() {
    if (!hint || loadingVariant) return;
    hint.textContent = selection === 'operations' ? '选择其他部门，或返回整车' : selection !== 'all' ? '选择组别，继续观察系统' : reduced() ? '选择部门，查看赛车结构' : position.explosion >= .99 ? '选择部门，或继续向下了解车队' : '向下滚动，展开赛车';
  }
  function announce(text) {
    if (announcement && text !== lastAnnouncement) {
      announcement.textContent = text;
      lastAnnouncement = text;
    }
  }
  function select({department, group, name}) {
    selection = department;
    story.dataset.selection = group || department;
    story.dataset.mode = department === 'all' ? 'overview' : 'system';
    const info = document.getElementById('showcase-info');
    if (info) info.inert = department === 'all';
    story.style.setProperty('--hero-opacity', department === 'all' ? position.heroOpacity : 0);
    announce(department === 'all' ? '返回整车，滚动可继续展开' : `正在展示${name}`);
    updateHint();
    // Retrigger only the text entrance; the canvas rectangle never changes.
    const title = document.getElementById('selection-title');
    textAnimation?.cancel();
    if (title && !reduced()) textAnimation=title.animate([{opacity: .35, transform: 'translateY(5px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)'});
  }
  addEventListener('scroll', markDirty, {passive: true});
  addEventListener('resize', markDirty, {passive: true});
  addEventListener('pageshow', markDirty);
  document.addEventListener('introcomplete', markDirty);
  new ResizeObserver(markDirty).observe(story);
  new ResizeObserver(markDirty).observe(sticky);
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; markDirty(); }).observe(story.querySelector('.ex-stage') || sticky);
  measure();

  return {
    connect(connection) {
      api = connection;
      api.controls.disconnect();
      api.controls.enableRotate = false;
      api.controls.enableZoom = false;
      api.controls.enablePan = false;
      api.controls.domElement.style.touchAction = 'pan-y pinch-zoom';
      api.controls.domElement.style.pointerEvents = 'none';
    },
    ready() { loaded = true; track = null; markDirty(); story.dataset.ready = 'true'; },
    resize() { track = null; markDirty(); },
    visible() { return onScreen && !document.hidden && !document.body.classList.contains('intro-playing'); },
    beforeFrame(dt, phase, actual) {
      measure();
      return scrub.step({target: position.explosion, actual, phase, dt, reduced: reduced()});
    },
    afterFrame(state, dt, progress) {
      if (!api || !loaded) return;
      const {camera, controls, director, direction} = api;
      if (lastPhase !== state.phase) { story.dataset.phase = state.phase; lastPhase = state.phase; }
      if (state.phase === 'overview') {
        if (cameraPhase !== 'overview') {
          track = null;
          cameraBlend = {position: camera.position.clone(), target: controls.target.clone(), age: 0};
        }
        if (!track) track = director.explosionCameraTrack(direction);
        if (track) {
          const frame = track(progress);
          if (cameraBlend && !reduced()) {
            const u = Math.min(1, cameraBlend.age / .9), t = u * u * (3 - 2 * u);
            controls.target.lerpVectors(cameraBlend.target, frame.target, t);
            camera.position.lerpVectors(cameraBlend.position, frame.position, t);
            cameraBlend.age += dt;
            if (u === 1) cameraBlend = null;
          } else {
            camera.position.copy(frame.position); controls.target.copy(frame.target);
            cameraBlend = null;
          }
          camera.up.set(0, 0, 1); camera.zoom = 1; camera.updateProjectionMatrix();
          controls.update();
        }
      } else {
        cameraBlend = null;
      }
      cameraPhase = state.phase;
      story.dataset.displayProgress = progress.toFixed(4);
      story.dataset.scrollProgress = position.explosion.toFixed(4);
    },
    select,
    busy(active, message='正在准备电驱结构') {
      loadingVariant = active;
      story.setAttribute('aria-busy', String(active));
      if (active && hint) { hint.textContent = message; announce(message); }
      else updateHint();
    },
    error(message) { loadingVariant = true; if (hint) hint.textContent = message; announce(message); },
    motionChanged() {
      markDirty(); track = null; cameraBlend = null; textAnimation?.cancel();
      if (!api || !loaded) return;
      const {director} = api, state = director.state();
      if (reduced()) {
        director.reduce();
        // Finish an in-flight camera transition immediately for this preference.
        if (state.phase === 'transitioning') director.update(10, {explosion: position.explosion});
      } else if (state.paused) director.pause();
      updateHint();
    }
  };
}
