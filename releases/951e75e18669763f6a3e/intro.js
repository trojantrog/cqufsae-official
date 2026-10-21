(() => {
  'use strict';
  const layer = document.querySelector('#intro');
  const emblem = document.querySelector('#intro-emblem');
  const target = document.querySelector('.brand');
  const backdrop = document.querySelector('.intro-backdrop');
  const curve = document.querySelector('#intro-car-silhouette');
  const light = document.querySelector('#curve-light');
  const glint = document.querySelector('.intro-glint');
  const core = document.querySelector('#curve-core');
  const halo = document.querySelector('.intro-halo');
  const main = document.querySelector('#main-content');
  const header = document.querySelector('.site-header');
  const footer = document.querySelector('footer');
  const skipContent = document.querySelector('.skip-content');
  const skip = document.querySelector('#skip-intro');
  const replay = document.querySelector('#replay-intro');
  const reduce = document.querySelector('#reduce-motion');
  const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  // The optional time parameter is for reproducible local visual review.
  const frame = params.has('intro-frame') ? Number(params.get('intro-frame')) : null;
  const duration = 3650;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const easeFlight = (v) => v < .5 ? 8 * v ** 4 : 1 - ((-2 * v + 2) ** 4) / 2;
  const blend = (from, to, t) => `rgb(${from.map((n,i)=> Math.round(n+(to[i]-n)*t)).join(' ')})`;
  let request = 0, started = 0, playing = false, failSafe = 0, returnFocus = null;
  let box = {}, destination = {}, manualReduced = false;
  try { manualReduced = localStorage.getItem('cqufsae-reduce-motion') === '1'; } catch {}
  function measure() {
    const width = Math.min(580, Math.max(250, innerWidth * .44), innerWidth - 58);
    const height = width * 399.8246 / 1024;
    box = { width, height, x: (document.documentElement.clientWidth-width)/2, y:(innerHeight-height)/2 };
    destination = target.getBoundingClientRect();
    emblem.style.width = `${width}px`;
  }
  function paint(ms) {
    const enter = smooth(ms / 440);
    const move = easeFlight(clamp((ms - 2630) / 1020));
    const color = smooth((ms - 3240) / 410);
    const scale = (1.025 - .025 * enter) * (1 + (destination.width/box.width - 1)*move);
    const x = box.x + (destination.left-box.x)*move;
    const y = box.y + (destination.top-box.y)*move;
    emblem.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
    emblem.style.opacity = enter;
    emblem.style.setProperty('--logo-tone',blend([233,232,227],[22,23,22],color));
    const curveLight = smooth((ms-1690)/370);
    const curveRGB = [115,121,117].map((n,i)=>n+([233,232,227][i]-n)*curveLight);
    emblem.style.setProperty('--curve-tone',blend(curveRGB,[22,23,22],color));
    const reveal = smooth((ms - 3200) / 450);
    backdrop.style.opacity = 1 - reveal;
    document.documentElement.style.setProperty('--intro-canvas',blend([16,17,17],[238,241,241],reveal));
    skip.style.opacity = 1 - smooth((ms - 2500)/200);
    skip.style.pointerEvents = ms > 2500 ? 'none' : '';
    const sweep = clamp((ms - 500) / 1320);
    const point = curve.getPointAtLength(smooth(sweep) * curve.getTotalLength() * .503695);
    light.setAttribute('cx',point.x); light.setAttribute('cy',point.y);
    core.setAttribute('cx',point.x); core.setAttribute('cy',point.y);
    glint.style.opacity = (smooth(sweep/.1) * (1-smooth((sweep-.83)/.17))).toFixed(3);
    // One localized white pulse settles into red; the screen never flashes.
    const pulse = smooth((ms - 1890) / 145) * (1 - smooth((ms - 2040)/210));
    const red = smooth((ms - 2020) / 310);
    const boltBase = blend([233,232,227],[220,37,40],red);
    emblem.style.setProperty('--bolt-tone', pulse > .05 && red < .15 ? '#ffffff' : boltBase);
    halo.style.opacity = (pulse*.8).toFixed(3);
    layer.dataset.phase = ms < 500 ? 'appear' : ms < 1820 ? 'curve' : ms < 2330 ? 'lightning' : ms < 2630 ? 'hold' : 'land';
    layer.dataset.time = Math.round(ms);
  }
  function finish() {
    cancelAnimationFrame(request); clearTimeout(failSafe);
    playing = false;
    layer.hidden = true;
    document.documentElement.classList.remove('intro-pending');
    document.body.classList.remove('intro-playing');
    document.body.classList.add('intro-complete');
    [main,header,footer,skipContent].filter(Boolean).forEach(el => { el.inert = false; });
    try { sessionStorage.setItem('cqufsae-intro-v4','1'); } catch {}
    if (document.activeElement === skip && returnFocus) returnFocus.focus({preventScroll:true});
    else if (document.activeElement === skip) target.focus({preventScroll:true});
    document.dispatchEvent(new Event('introcomplete'));
  }
  function tick(now) {
    if (!playing) return;
    const time = now-started;
    if (time >= duration) { finish(); return; }
    paint(time);
    request = requestAnimationFrame(tick);
  }
  function play(userAction = false) {
    cancelAnimationFrame(request); clearTimeout(failSafe);
    if (systemReduced.matches || manualReduced) { finish(); return; }
    returnFocus = userAction ? replay : null;
    window.scrollTo({top:0,behavior:'instant'});
    document.body.classList.add('intro-playing');
    document.body.classList.remove('intro-complete');
    [main,header,footer,skipContent].filter(Boolean).forEach(el => { el.inert = true; });
    layer.hidden = false;
    document.documentElement.classList.remove('intro-pending');
    playing = true;
    measure(); paint(0);
    if (userAction) skip.focus({preventScroll:true});
    if (frame !== null && Number.isFinite(frame)) { paint(Math.min(duration-1, Math.max(0,frame))); return; }
    started = performance.now();
    request = requestAnimationFrame(tick);
    failSafe = setTimeout(finish, 5200);
  }
  function setMotion() {
    document.documentElement.classList.toggle('reduce-motion',manualReduced || systemReduced.matches);
    if (reduce) {
      reduce.setAttribute('aria-pressed',String(manualReduced || systemReduced.matches));
      reduce.textContent = manualReduced || systemReduced.matches ? '动态已减少' : '减少动态';
    }
    if ((manualReduced || systemReduced.matches) && playing) finish();
    document.dispatchEvent(new Event('motionpreference'));
  }
  skip.addEventListener('click',finish);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && playing) finish(); });
  replay?.addEventListener('click',()=>play(true));
  reduce?.addEventListener('click',()=>{
    manualReduced = !manualReduced;
    try { localStorage.setItem('cqufsae-reduce-motion',manualReduced?'1':'0'); } catch {}
    setMotion();
  });
  systemReduced.addEventListener('change',setMotion);
  window.addEventListener('resize',()=>{if(playing)measure();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && playing && frame===null)finish();});
  setMotion();
  let seen = false;
  try { seen = sessionStorage.getItem('cqufsae-intro-v4') === '1'; } catch {}
  if (!seen || params.has('intro') || frame !== null) play(); else finish();
})();
