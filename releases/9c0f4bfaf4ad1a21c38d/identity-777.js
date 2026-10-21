const root = document.documentElement;
const story = document.querySelector('#car-story');
const departmentNav = document.querySelector('.department-buttons');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => {
  try { return preference.matches || localStorage.getItem('cqufsae-reduce-motion') === '1'; }
  catch { return preference.matches; }
};
function syncMotion() { root.dataset.uiMotion = reduced() ? 'reduced' : 'full'; }
syncMotion();
preference.addEventListener('change', syncMotion);
document.addEventListener('motionpreference', syncMotion);
addEventListener('storage', syncMotion);

const indicator = document.createElement('span');
indicator.className = 'department-indicator';
indicator.setAttribute('aria-hidden', 'true');
departmentNav?.append(indicator);
let pendingIndicator = 0;
function updateIdentity() {
  pendingIndicator = 0;
  const selected = departmentNav?.querySelector('[aria-pressed="true"]');
  if (!selected) return;
  const parent = departmentNav.getBoundingClientRect(), box = selected.getBoundingClientRect();
  departmentNav.style.setProperty('--indicator-left', `${box.left - parent.left + 8}px`);
  departmentNav.style.setProperty('--indicator-width', `${Math.max(0, box.width - 16)}px`);
  const mark = selected.querySelector('img');
  const destination = document.querySelector('.system-emblem img');
  if (destination && mark && destination.getAttribute('src') !== mark.getAttribute('src')) {
    destination.src = mark.getAttribute('src');
  }
}
function requestIdentity() { if (!pendingIndicator) pendingIndicator = requestAnimationFrame(updateIdentity); }
if (departmentNav) {
  new MutationObserver(requestIdentity).observe(departmentNav, {subtree: true, attributes: true, attributeFilter: ['aria-pressed']});
  new ResizeObserver(requestIdentity).observe(departmentNav);
}
addEventListener('pageshow', requestIdentity);
document.fonts.ready.then(requestIdentity);
requestIdentity();

const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
let currentSection = '', pendingNav = 0;
function updateNavigation() {
  pendingNav = 0;
  const line = innerHeight * .36;
  const join = document.querySelector('#join')?.getBoundingClientRect();
  const platform = document.querySelector('#platform')?.getBoundingClientRect();
  const engineering = document.querySelector('#engineering')?.getBoundingClientRect();
  const next = platform?.top <= line ? '#platform' : join?.top <= line ? '#join' : engineering?.top <= line ? '#engineering' : '#cars';
  if (next === currentSection) return;
  currentSection = next;
  for (const link of links) {
    if (link.getAttribute('href') === next) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
function requestNavigation() { if (!pendingNav) pendingNav = requestAnimationFrame(updateNavigation); }
addEventListener('scroll', requestNavigation, {passive: true});
addEventListener('resize', requestNavigation, {passive: true});
addEventListener('pageshow', requestNavigation);
requestNavigation();

// Native details remains operable with JavaScript disabled. Animate its content only.
for (const details of document.querySelectorAll('.department')) {
  let entrance = null;
  details.addEventListener('toggle', () => {
    entrance?.cancel();
    if (details.open && !reduced()) entrance = details.querySelector('.department-content')?.animate(
      [{opacity: 0, transform: 'translateY(-8px)'}, {opacity: 1, transform: 'translateY(0)'}],
      {duration: 320, easing: 'cubic-bezier(.22,.75,.25,1)'}
    );
    requestNavigation();
  });
}

const copy = document.querySelector('#copy-email');
const status = document.querySelector('#email-copy-status');
let copiedTimer;
copy?.addEventListener('click', async () => {
  const address = 'cqufsae@cqu.edu.cn';
  let copied = false;
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(address); copied = true; } } catch {}
  if (!copied) {
    const helper = document.createElement('textarea');
    helper.className = 'copy-helper'; helper.value = address; helper.readOnly = true;
    document.body.append(helper); helper.select();
    try { copied = document.execCommand('copy'); } catch {}
    helper.remove(); copy.focus({preventScroll: true});
  }
  clearTimeout(copiedTimer);
  status.textContent = copied ? '邮箱已复制。请在邮件中附上填写完成的报名表。' : '请选中上方邮箱地址后复制。';
  copy.dataset.copied = String(copied);
  copy.querySelector('span').textContent = copied ? '已复制' : '复制邮箱';
  if (copied) copiedTimer = setTimeout(() => {
    copy.dataset.copied = 'false'; copy.querySelector('span').textContent = '复制邮箱';
  }, 2600);
});
