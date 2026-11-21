// Eén bewegingstaal voor de hele app.
// - Vaste tempo's: tik 0,1 s, klein 0,25 s, scherm 0,45 s; weggaan gaat sneller dan binnenkomen.
// - Twee veren: zacht (rustig, ±4% doorschieten) en speels (de 'jelly' van het scorebord).
// - 'Beperk beweging' van de telefoon (of 'Minder beweging' in de app) maakt alles rustig.
// - Een tikje bij tikken: iPhone via een onzichtbare iOS-schakelaar onder elke knop, Android via vibrate. Uit te zetten.
// - Eén indruk-gedrag voor alle knoppen: iets kleiner en donkerder, en veert terug bij loslaten.
// Alles draait op de telefoon zelf; er gaat niets naar buiten.

// ---------- tempo's en veren (gelijk aan de CSS-variabelen in app.css) ----------
export const T = { tap: 100, small: 250, screen: 450, outSmall: 180, outScreen: 280 };
const hasLinear = (() => { try { return CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch (e) { return false; } })();
export const SPRING = hasLinear ? {
  soft: 'linear(0, 0.065 4.2%, 0.211 8.3%, 0.387 12.5%, 0.559 16.7%, 0.708 20.8%, 0.827 25%, 0.914 29.2%, 0.974 33.3%, 1.011 37.5%, 1.03 41.7%, 1.038 45.8%, 1.038 50%, 1.033 54.2%, 1.027 58.3%, 1.02 62.5%, 1.014 66.7%, 1.008 70.8%, 1.005 75%, 1.002 79.2%, 1)',
  play: 'linear(0, 0.157 4.4%, 0.533 9.6%, 1.003 15.7%, 1.144 19.5%, 1.19 23%, 1.14 27.6%, 0.988 36.5%, 0.958 41.1%, 0.976 48.3%, 1.007 59.4%, 1)'
} : { soft: 'cubic-bezier(.3, 1.25, .5, 1)', play: 'cubic-bezier(.34, 1.56, .64, 1)' };
export const EASE_OUT = 'cubic-bezier(.2, .8, .2, 1)';
export const EASE_IN = 'cubic-bezier(.45, 0, .9, .4)';

// ---------- voorkeuren van deze telefoon (niet in de back-up, niet gedeeld) ----------
const PKEY = 'spabo-coach-device';
const DEFAULTS = { haptics: true, calm: false };
let prefs = (() => {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PKEY)) || {}) }; } catch (e) { return { ...DEFAULTS }; }
})();
const prefSubs = new Set();
export const devicePrefs = () => prefs;
export function setDevicePref(key, value) {
  prefs = { ...prefs, [key]: value };
  try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) { /* opslag geblokkeerd */ }
  applyCalm();
  applyHx();
  prefSubs.forEach((f) => f(prefs));
}
export function onDevicePrefs(fn) { prefSubs.add(fn); return () => prefSubs.delete(fn); }

// ---------- Beperk beweging ----------
const mqReduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const osReduced = () => !!(mqReduce && mqReduce.matches);
export const reduced = () => osReduced() || !!prefs.calm;
function applyCalm() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce', reduced());
}
if (mqReduce) {
  const on = () => { applyCalm(); prefSubs.forEach((f) => f(prefs)); };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', on); else if (mqReduce.addListener) mqReduce.addListener(on);
}
applyCalm();

// ---------- tikje (haptiek) ----------
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const isIOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let lastHx = -1e9;
// patronen voor Android (ms); de iPhone kent één soort tikje
const PATTERN = { tap: 8, select: 5, toggle: 10, no: [8, 45, 8], success: [10, 60, 14] };
let lastTick = 0;
let ticking = false;
// iOS 18 t/m 26.4: een schakelaar (<input switch>) geeft een tikje als hij via een label omklapt, ook vanuit code.
// Sinds iOS 26.5 alleen nog bij een echte vingertik: daarvoor dient de onzichtbare schakelaar onder elke knop (zie hieronder).
function iosTick() {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  ticking = true;
  try { label.click(); } finally { ticking = false; label.remove(); }
}
export const hapticsSupported = () => canVibrate || coarse;
export function haptic(kind = 'tap') {
  if (!prefs.haptics) return;
  const now = performance.now();
  if (now - lastTick < 35) return; // nooit twee tikjes over elkaar heen
  if (isIOS && now - lastHx < 120) return; // de vinger tikte net op de onzichtbare schakelaar: die gaf al een tikje
  lastTick = now;
  try {
    if (canVibrate) navigator.vibrate(PATTERN[kind] || PATTERN.tap);
    else if (coarse) iosTick();
  } catch (e) { /* dit toestel kan het niet */ }
}

// ---------- iPhone: onzichtbare schakelaar onder elke knop ----------
// iOS laat een webpagina alleen een tikje geven als de vinger zelf een <input switch> omzet (sinds iOS 26.5).
// Daarom ligt over elke knop een onzichtbaar label met zo'n schakelaar erin. De vinger landt op het label,
// iOS zet de schakelaar om en geeft het tikje; de klik gaat gewoon door naar de knop eronder.
const HX_HOST = 'button, a[href]';
const HX_SKIP = 'label, .no-hx';
const useHx = () => isIOS || (typeof window !== 'undefined' && window.__HX === true);
function addHx(el) {
  if (!el.matches(HX_HOST) || el.closest(HX_SKIP)) return;
  for (const c of el.children) if (c.classList.contains('hx')) return;
  const label = document.createElement('label');
  label.className = 'hx';
  label.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  el.appendChild(label);
}
function scanHx(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches(HX_HOST)) addHx(node);
  node.querySelectorAll(HX_HOST).forEach(addHx);
}
function applyHx() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('no-hx', !prefs.haptics);
}
function installHx() {
  if (!useHx()) return;
  applyHx();
  scanHx(document.body);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) scanHx(n);
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.parentElement) return;
    if (t.classList && t.classList.contains('hx')) { lastHx = performance.now(); return; }
    if (t.tagName === 'INPUT' && t.parentElement.classList.contains('hx')) {
      // tweede klik die het label doorgeeft aan de schakelaar: niet nog eens naar de knop
      e.stopPropagation();
      // een link navigeert niet meer zelf (het label neemt de klik over), dus hier
      const host = t.parentElement.parentElement;
      if (host && host.matches('a[href]')) {
        const href = host.getAttribute('href');
        if (href.charAt(0) === '#') location.hash = href; else location.href = host.href;
      }
    }
  }, true);
}

// ---------- één indruk-gedrag voor alle knoppen ----------
// Kleiner (kleine knoppen iets meer dan grote kaarten) en iets donkerder; bij loslaten veert hij terug.
// Werkt met de losse 'scale'-eigenschap, zodat bestaande animaties op 'transform' gewoon doorlopen.
const PRESSABLE = 'button, a[href], label.btn, [role="button"], [data-press]';
const NO_PRESS = '[data-press="none"], .switch, .f-thumb, .f-scrim, .seg button, .kr';
const canScale = (() => { try { return CSS.supports('scale', '1') && typeof Element.prototype.animate === 'function'; } catch (e) { return false; } })();

function pressable(target) {
  const el = target && target.closest ? target.closest(PRESSABLE) : null;
  if (!el || el.closest(NO_PRESS)) return null;
  if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}
function pressIn(el) {
  if (!canScale) return;
  const w = el.getBoundingClientRect().width || 44;
  const s = 1 - Math.min(0.08, Math.max(0.015, 7 / w));
  if (el.__press) el.__press.cancel();
  try {
    el.__press = el.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: String(s), filter: 'brightness(.92)' }],
      { duration: T.tap, easing: EASE_OUT, fill: 'forwards' });
  } catch (e) { el.__press = null; }
}
function pressOut(el) {
  const a = el.__press;
  if (!a) return;
  const cs = getComputedStyle(el);
  const from = { scale: cs.scale && cs.scale !== 'none' ? cs.scale : '1', filter: cs.filter && cs.filter !== 'none' ? cs.filter : 'brightness(1)' };
  a.cancel();
  try {
    const calm = reduced();
    const b = el.animate([from, { scale: '1', filter: 'brightness(1)' }], { duration: calm ? 120 : 520, easing: calm ? EASE_OUT : SPRING.soft });
    el.__press = b;
    b.onfinish = () => { if (el.__press === b) el.__press = null; };
  } catch (e) { el.__press = null; }
}

let cur = null;
function release(now) {
  if (!cur) return;
  const c = cur;
  cur = null;
  clearTimeout(c.timer);
  if (now) { if (c.pressed) pressOut(c.el); return; }
  if (!c.pressed) { pressIn(c.el); c.at = performance.now(); }
  // een snelle tik blijft minstens één tik-tempo ingedrukt, zodat je hem ziet
  setTimeout(() => pressOut(c.el), Math.max(0, T.tap - (performance.now() - c.at)));
}
// Laat een knop los als er iets anders begint (bijv. slepen van een speler)
export const cancelPress = () => release(true);

export function installPress() {
  if (typeof document === 'undefined' || installPress.done) return;
  installPress.done = true;
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = pressable(e.target);
    release(true);
    if (!el) return;
    // korte vertraging bij aanraken: begint het een veeg (scrollen), dan licht er niets op
    const c = { el, id: e.pointerId, x: e.clientX, y: e.clientY, pressed: false, at: 0 };
    c.timer = setTimeout(() => { if (cur === c) { c.pressed = true; c.at = performance.now(); pressIn(el); } }, e.pointerType === 'mouse' ? 0 : 45);
    cur = c;
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', (e) => {
    if (cur && e.pointerId === cur.id && Math.hypot(e.clientX - cur.x, e.clientY - cur.y) > 10) release(true);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', (e) => { if (cur && e.pointerId === cur.id) release(false); }, true);
  document.addEventListener('pointercancel', () => release(true), true);
  // iPhone: zonder touch-luisteraar komen sommige drukacties te laat binnen
  document.addEventListener('touchstart', () => {}, { passive: true });
  installHx();
  // tikje bij elke tik op een knop; onderdelen met een eigen tikje hebben data-haptic="own"
  document.addEventListener('click', (e) => {
    if (ticking) return;
    if (useHx()) return; // iPhone: het tikje komt van de onzichtbare schakelaar
    const el = e.target && e.target.closest ? e.target.closest(PRESSABLE) : null;
    if (!el || el.closest('[data-haptic]')) return;
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return;
    haptic('tap');
  }, true);
}
