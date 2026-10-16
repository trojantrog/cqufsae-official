import {VideoSurface} from './video-media.js?v=753';
import {VideoNavigator} from './video-navigation.js?v=753';
import {departments, groups} from './video-catalog.js?v=753';
import {storyPosition} from './showcase-scroll.js?v=743';

const $ = selector => document.querySelector(selector);
const story = $('#car-story'), host = $('#vehicle-canvas'), loading = $('#model-loading');
const hint = $('#showcase-hint'), announcement = $('#showcase-announcement');
const reducedSystem = matchMedia('(prefers-reduced-motion: reduce)');
const telemetry = new Map();
const labels = new Map();
let navigator, surface, manifest, selection = {department: 'all', group: null, variant: 'c41'};
let onScreen = true, initialized = false, failure = false, measureRequest = null;

const reduced = () => {
  try { return reducedSystem.matches || localStorage.getItem('cqufsae-reduce-motion') === '1'; }
  catch { return reducedSystem.matches; }
};

function clipId() {
  const {department, group, variant} = selection;
  if (department === 'power') return !group ? `${variant}-power` : group === 'transmission' ? `${variant}-transmission` : group;
  return group || department;
}

function updateSelection() {
  const {department, group, variant} = selection;
  const data = group ? groups[group] : departments[department];
  story.dataset.selection = group || department;
  story.dataset.mode = department === 'all' ? 'overview' : 'system';
  $('#showcase-info').inert = department === 'all';
  $('#selection-title').textContent = data.name;
  $('#selection-copy').textContent = data.copy;
  host.setAttribute('aria-label', department === 'all' ? 'C41 赛车结构，滚动展开，选择部门查看系统演示' : `${data.name}工作演示`);
  document.querySelectorAll('[data-department]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.department === department)));
  document.querySelectorAll('[data-power]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.power === variant)));
  $('#power-variants').hidden = department !== 'power';
  $('#return-overview').hidden = department === 'all';
  $('#showcase-progress').hidden = department !== 'all';
  const container = $('#group-buttons');
  const visibleGroups = departments[department].groups.filter(id => department !== 'power' || id === 'transmission' || (variant === 'c41' ? id === 'engine' : ['ecu', 'battery', 'wiring'].includes(id)));
  if (container.dataset.groups !== visibleGroups.join(',')) {
    container.replaceChildren(); container.dataset.groups = visibleGroups.join(',');
    for (const id of visibleGroups) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.group = id;
      button.textContent = groups[id].name;
      button.addEventListener('click', () => select({department: groups[id].department, group: id}));
      container.append(button);
    }
  }
  container.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(group === button.dataset.group)));
  announcement.textContent = department === 'all' ? '返回整车，滚动可继续展开' : `正在展示${data.name}`;
}

function updateHint(state = navigator?.state()) {
  if (failure) return;
  if (!state || state.phase === 'loading') { hint.textContent = '正在准备整车视图'; return; }
  story.setAttribute('aria-busy', String(state.phase === 'preparing' || state.target !== state.current));
  if (state.phase === 'preparing' || (state.phase === 'loop' && state.target !== state.current)) hint.textContent = '正在准备所选系统';
  else if (selection.department === 'operations') hint.textContent = '选择其他部门，或返回整车';
  else if (selection.department !== 'all') hint.textContent = reduced() ? '选择组别，查看赛车结构' : '选择组别，继续观察系统';
  else hint.textContent = navigator?.scroll >= .99 ? '选择部门，或继续向下了解车队' : '向下滚动，展开赛车';
  if (state.current === state.target && ['overview', 'loop', 'still'].includes(state.phase)) {
    const message = state.current === 'all' ? '整车视图已就绪，滚动可继续展开' : `正在展示${$('#selection-title').textContent}`;
    if (announcement.textContent !== message) announcement.textContent = message;
  }
}

async function loadTelemetry(id) {
  if (!manifest || id === 'all' || telemetry.has(id)) return;
  const system = manifest.systems[id];
  if (!system) return;
  if (system.telemetry) { telemetry.set(id, system.telemetry); return; }
  if (!system.telemetrySrc) return;
  telemetry.set(id, null);
  try {
    const response = await fetch(system.telemetrySrc);
    if (!response.ok) throw new Error('Telemetry unavailable');
    telemetry.set(id, await response.json());
  } catch { telemetry.delete(id); }
}

function select(next) {
  selection = {...selection, group: null, ...next};
  updateSelection();
  if (failure) { failure = false; $('#video-retry').hidden = true; }
  const id = clipId(); loadTelemetry(id);
  navigator?.select(id); updateHint();
}

function error(error) {
  failure = true; loading.hidden = true;
  const retained = surface && (surface.stats.painted || surface.posterReady);
  $('#model-fallback').hidden = Boolean(retained);
  hint.textContent = retained ? '动画加载暂时中断，当前画面已保留。请检查连接后重试。' : '动画暂未加载，请检查连接后重试。';
  announcement.textContent = hint.textContent;
  $('#video-retry').hidden = false; story.setAttribute('aria-busy', 'false');
  console.error('Presentation media could not be loaded', error);
}

function measure() {
  measureRequest = null;
  const box = story.getBoundingClientRect(), sticky = $('.showcase-sticky');
  const position = storyPosition(scrollY, box.top + scrollY, story.offsetHeight, sticky.offsetHeight);
  story.style.setProperty('--story-progress', position.explosion);
  $('#showcase-progress').textContent = `${Math.round(position.explosion * 100)}%`;
  navigator?.updateScroll(manifest?.overview.axis === 'scrollPhase' ? position.phase : position.explosion); updateHint();
  if (manifest) {
    const box = host.getBoundingClientRect(), scale = Math.min(box.width / manifest.width, box.height / manifest.height);
    const width = manifest.width * scale, height = manifest.height * scale, layer = $('#work-labels');
    layer.style.width = `${width}px`; layer.style.height = `${height}px`;
    layer.style.left = `${(box.width - width) / 2}px`; layer.style.top = `${(box.height - height) / 2}px`;
  }
}

function requestMeasure() { if (measureRequest == null) measureRequest = requestAnimationFrame(measure); }
function visibility() { navigator?.visibility(onScreen && !document.hidden && !document.body.classList.contains('intro-playing')); }

function frame(id, phase, index, exitPhase) {
  const readout = $('#condition-readout');
  const data = telemetry.get(id);
  const series = phase === 'exit' ? data?.exits?.[String(exitPhase)] : data?.[phase];
  const sample = Array.isArray(series) ? series[index] : null;
  readout.hidden = !sample || id === 'operations' || phase === 'overview';
  if (sample) {
    $('#condition-stage').textContent = sample.stage || '';
    $('#condition-speed').value = sample.speed || 0;
    $('#condition-brake').value = sample.brake || 0;
  }
  const legend = $('#flow-legend'), stress = (sample?.legend?.mode || (id === 'frame' ? 'stress' : 'flow')) === 'stress';
  legend.hidden = sample?.legend ? sample.legend.opacity < .02 : !['structure', 'body', 'frame'].includes(id) || phase !== 'loop';
  legend.style.opacity = String(sample?.legend?.opacity ?? 1);
  legend.dataset.mode = stress ? 'stress' : 'flow';
  legend.querySelector(':scope > span').textContent = stress ? '相对应力' : '相对流速';
  legend.querySelector('small').textContent = stress ? '载荷响应' : '流向示意';
  legend.querySelector('i').style.background = stress ? 'linear-gradient(90deg,#2458d4,#16bace 28%,#64c778 48%,#f0d74f 68%,#ec8a35 84%,#cf3933)' : '';
  const retained = new Set();
  for (const item of sample?.labels || []) {
    const key = item.id || item.text; retained.add(key);
    let node = labels.get(key);
    if (!node) { node = document.createElement('span'); $('#work-labels').append(node); labels.set(key, node); }
    node.textContent = item.text; node.style.left = `${item.x * 100}%`; node.style.top = `${item.y * 100}%`;
    node.style.opacity = String(item.opacity ?? 1); node.hidden = (item.opacity ?? 1) <= .00001;
  }
  for (const [key, node] of labels) if (!retained.has(key)) { node.remove(); labels.delete(key); }
}

function resolveManifest(data, url) {
  if (data.fps !== 60 || !data.overview?.src || !data.systems) throw new Error('Invalid presentation manifest');
  const resolve = clip => {
    if (!clip?.src || !Number.isInteger(clip.frames) || clip.frames < 2) throw new Error('Invalid media sequence');
    return {...clip, src: new URL(clip.src, url).href, poster: clip.poster ? new URL(clip.poster, url).href : null};
  };
  return {...data, overview: resolve(data.overview), anchor: {...data.anchor, poster: data.anchor?.poster ? new URL(data.anchor.poster, url).href : null},
    systems: Object.fromEntries(Object.entries(data.systems).map(([id, system]) => [id, {...system, enter: resolve(system.enter), loop: resolve(system.loop), exits: system.exits.map(resolve), telemetrySrc: system.telemetrySrc ? new URL(system.telemetrySrc, url).href : null}]))};
}

async function init() {
  failure = false; $('#video-retry').hidden = true; $('#model-fallback').hidden = true;
  try {
    if (initialized) { await navigator.retry(); return; }
    if (navigator) navigator.dispose();
    else surface?.dispose();
    navigator = null; surface = null;
    loading.hidden = false;
    const params = new URLSearchParams(location.search);
    const locationOverride = params.has('review') ? params.get('media') : null;
    const manifestURL = new URL(locationOverride || './media/manifest-753.json', location.href);
    const response = await fetch(manifestURL);
    if (!response.ok) throw new Error(`Presentation manifest ${response.status}`);
    manifest = resolveManifest(await response.json(), manifestURL);
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); host.replaceChildren(canvas);
    surface = new VideoSurface(canvas, {...manifest, onError: error});
    if (manifest.overview.poster || manifest.anchor?.poster) surface.poster(manifest.overview.poster || manifest.anchor.poster).catch(() => {});
    navigator = new VideoNavigator(surface, manifest, {onState(state) {
      story.dataset.phase = state.phase; story.dataset.displayProgress = state.progress.toFixed(4); updateHint(state);
    }, onFrame: frame, onError: error});
    navigator.reduced = reduced(); visibility();
    await navigator.start(); initialized = true; loading.hidden = true; story.dataset.ready = 'true';
    measure();
    if (clipId() !== 'all') navigator.select(clipId());
    if (params.has('review')) Object.defineProperty(window, '__videoReview', {configurable: true, value: {state: () => ({...navigator.state(), media: {...surface.stats}, decoders: surface.pool.size, reduced: navigator.reduced}), get navigator() { return navigator; }, get surface() { return surface; }}});
  } catch (problem) { error(problem); }
}

document.documentElement.dataset.presentation = 'video';
const retry = document.createElement('button'); retry.type = 'button'; retry.id = 'video-retry'; retry.textContent = '重新加载'; retry.hidden = true;
$('.showcase-hint-line').append(retry);
retry.addEventListener('click', init);
document.querySelectorAll('[data-department]').forEach(button => button.addEventListener('click', () => select({department: button.dataset.department})));
document.querySelectorAll('[data-power]').forEach(button => button.addEventListener('click', () => select({department: 'power', variant: button.dataset.power})));
$('#return-overview').addEventListener('click', () => select({department: 'all'}));
$('#retry-model').addEventListener('click', init);
$('#model-fallback').hidden = true;
addEventListener('scroll', requestMeasure, {passive: true}); addEventListener('resize', requestMeasure, {passive: true});
addEventListener('pageshow', requestMeasure);
document.addEventListener('introcomplete', () => { visibility(); requestMeasure(); });
document.addEventListener('visibilitychange', visibility);
document.addEventListener('motionpreference', () => { navigator?.motion(reduced()); updateHint(); });
reducedSystem.addEventListener('change', () => navigator?.motion(reduced()));
new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting && entry.intersectionRatio > .1; visibility(); }, {threshold: [0, .1]}).observe($('.showcase-sticky'));
new MutationObserver(visibility).observe(document.body, {attributes: true, attributeFilter: ['class']});
new ResizeObserver(requestMeasure).observe(story);
addEventListener('pagehide', () => navigator?.visibility(false));
addEventListener('pageshow', visibility);
updateSelection(); init();
