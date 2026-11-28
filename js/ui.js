// Gedeelde bouwstenen voor de schermen.
import { html, render, useEffect, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';
import { getState, update } from './store.js';
import { haptic, reduced, cancelPress, T, EASE_OUT, EASE_IN, SPRING, audioCtx, unlockAudio } from './motion.js';
import { findClub, searchClubs, withClub, clubColors, clubAbbr, colorKey, splitTeam, norm } from './clubs.js';

export const POS_COLORS = { K: 'var(--pos-K)', A: 'var(--pos-A)', M: 'var(--pos-M)', V: 'var(--pos-V)' };
export const POS_NAMES = { K: 'Keeper', A: 'Achter', M: 'Midden', V: 'Voor' };
export const STANDS = [['verdedigen', 'Verdedigen'], ['balans', 'Balans'], ['aanvallen', 'Aanvallen']];

export const go = (path) => { location.hash = path; };

// ---------- tijd ----------
export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

// ---------- melding onderin ----------
// Komt verend binnen, gaat zacht weg, en is weg te vegen (opzij of omlaag).
let toastState = null;
const toastSubs = new Set();
let toastTimer = null;
const emit = () => toastSubs.forEach((f) => f(toastState));
// app-informatie: staat er een nieuwe versie klaar (de service worker is al bijgewerkt)?
export const appInfo = { updateReady: false };

export function toast(text, action) {
  toastState = { text, action, key: Date.now(), leaving: false };
  emit();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dismissToast(), action ? 5000 : 2600);
}
export function dismissToast(instant) {
  if (!toastState) return;
  clearTimeout(toastTimer);
  if (instant || reduced()) { toastState = null; emit(); return; }
  if (toastState.leaving) return;
  const k = toastState.key;
  toastState = { ...toastState, leaving: true };
  emit();
  toastTimer = setTimeout(() => { if (toastState && toastState.key === k) { toastState = null; emit(); } }, T.outSmall + 40);
}
export function ToastHost() {
  const [t, setT] = useState(toastState);
  const ref = useRef(null);
  const st = useRef(null);
  useEffect(() => { toastSubs.add(setT); return () => toastSubs.delete(setT); }, []);
  if (!t) return null;
  // vegen: volgt de vinger, ver genoeg (of snel) = weg, anders veert hij terug
  const down = (e) => {
    if (e.target.closest('button')) return;
    st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, at: performance.now() };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ }
  };
  const move = (e) => {
    const s = st.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = Math.max(0, e.clientY - s.y);
    if (!s.on && Math.hypot(dx, dy) < 6) return;
    s.on = true;
    s.dx = dx; s.dy = dy;
    ref.current.style.translate = `${dx}px ${dy}px`;
    ref.current.style.opacity = String(Math.max(0.2, 1 - Math.max(Math.abs(dx), dy * 1.5) / 220));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s || !s.on) return;
    const el = ref.current;
    const fast = (Math.abs(s.dx) + s.dy) / Math.max(1, performance.now() - s.at) > 0.5;
    if (Math.abs(s.dx) > 70 || s.dy > 40 || fast) {
      const to = Math.abs(s.dx) >= s.dy ? `${s.dx > 0 ? 420 : -420}px ${s.dy}px` : `${s.dx}px 160px`;
      try { el.animate([{ translate: el.style.translate || '0px 0px', opacity: el.style.opacity || '1' }, { translate: to, opacity: 0 }], { duration: T.outSmall, easing: EASE_IN, fill: 'forwards' }); } catch (x) { /* oud toestel */ }
      setTimeout(() => dismissToast(true), T.outSmall);
    } else {
      el.style.translate = '';
      el.style.opacity = '';
    }
  };
  return html`<div ref=${ref} class=${'toast' + (t.leaving ? ' leaving' : '')} role="status" key=${t.key}
    onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
    <span>${t.text}</span>
    ${t.action && html`<button type="button" onClick=${() => { t.action.run(); dismissToast(true); }}>${t.action.label}</button>`}
  </div>`;
}

// ---------- signaal bij een wisselmoment: piep + flits (+ trillen waar dat kan) ----------
export { unlockAudio };
export function beep(times = 1, freq = 880) {
  const audio = audioCtx();
  if (!audio) return;
  try {
    const t0 = audio.currentTime + 0.02;
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const s = t0 + i * 0.28;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(s);
      o.stop(s + 0.22);
    }
  } catch (e) { /* geen geluid mogelijk */ }
}
let flashSubs = new Set();
export function flash() {
  flashSubs.forEach((f) => f(Date.now()));
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* niet op iPhone */ }
}
export function FlashHost() {
  const [k, setK] = useState(0);
  useEffect(() => { flashSubs.add(setK); return () => flashSubs.delete(setK); }, []);
  return k ? html`<div class="flash" key=${k} onAnimationEnd=${() => setK(0)}></div>` : null;
}

// ---------- scherm aan houden tijdens de wedstrijd ----------
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const req = async () => {
      try {
        if (!stopped && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch (e) { /* niet toegestaan */ }
    };
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) lock.release().catch(() => {});
    };
  }, [active]);
}

// ---------- kleine componenten ----------
export function Neon({ children, box, cls = '' }) {
  return html`<span class=${'neon ' + (box ? 'box ' : '') + cls}><span class="glow"></span><span class="ring"></span><span class="in">${children}</span></span>`;
}

// Rollende cijfers: elk teken schuift verend omhoog als het verandert (omlaag als het getal kleiner wordt)
function RollSlot({ c, dir }) {
  const r = useRef(null);
  if (!r.current) r.current = { cur: c, prev: null, n: 0, at: 0, dir: null };
  const s = r.current;
  if (c !== s.cur) { s.prev = s.cur; s.cur = c; s.n++; s.at = Date.now(); s.dir = dir; }
  const showOut = s.prev != null && Date.now() - s.at < 420;
  const dn = s.dir === 'down' ? ' dn' : '';
  return html`<span class=${'rslot' + (c === ':' ? ' colon' : '')}>
    ${showOut ? html`<i key=${'o' + s.n} class=${'out' + dn}>${s.prev}</i>` : null}
    <i key=${'i' + s.n} class=${s.n ? 'in' + dn : ''}>${c}</i>
  </span>`;
}
export function Roll({ text, cls = '', dir }) {
  const chars = [...String(text)];
  return html`<span class=${'roll ' + cls} aria-label=${String(text)}>${chars.map((c, k) => html`<${RollSlot} key=${chars.length - k} c=${c} dir=${dir} />`)}</span>`;
}

export function Pill({ name, neon, kind = '', title }) {
  const p = html`<span class=${'pill ' + kind} title=${title || name}>${name}</span>`;
  return neon ? html`<${Neon}>${p}</${Neon}>` : p;
}

export function KeeperPill({ name }) {
  return html`<span class="pill keeper"><span class="k">K</span>${name}</span>`;
}

// Schakelaar: het bolletje rekt uit als je drukt, schiet verend over en geeft een tikje
export function Switch({ on, onChange, label, disabled = false }) {
  const [held, setHeld] = useState(false);
  const [flip, setFlip] = useState(0);
  const tm = useRef(0);
  const press = (e) => {
    if (e.button > 0 || e.currentTarget.matches(':disabled')) return;
    clearTimeout(tm.current);
    tm.current = setTimeout(() => setHeld(true), e.pointerType === 'mouse' ? 0 : 45);
  };
  const lift = () => { clearTimeout(tm.current); setHeld(false); };
  return html`<button type="button" class=${'switch' + (held ? ' held' : '') + (flip ? (flip % 2 ? ' fa' : ' fb') : '')} role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${label} data-haptic="own" disabled=${disabled}
    onPointerDown=${press} onPointerUp=${lift} onPointerCancel=${lift} onPointerLeave=${lift}
    onClick=${() => { lift(); setFlip((f) => f + 1); onChange(!on); haptic('toggle'); }}><i class="sw-knob" aria-hidden="true"></i></button>`;
}

export function Setting({ title, sub, children }) {
  return html`<div class="setting">
    <div class="col" style="gap:1px">
      <span class="t">${title}</span>
      ${sub && html`<span class="small">${sub}</span>`}
    </div>
    ${children}
  </div>`;
}

// Keuzebalk: het blokje vloeit naar de nieuwe keuze (rekt even uit in de looprichting); vegen kan ook.
// Tijdens vegen tekent de app niets opnieuw: de positie gaat rechtstreeks naar het blokje (elk beeldje),
// zodat het de vinger soepel volgt, ook als de telefoon druk is.
export function Seg({ value, options, onChange, label, small }) {
  const i = options.findIndex(([v]) => v === value);
  const n = options.length;
  const root = useRef(null);
  const ind = useRef(null);
  const prev = useRef(i);
  const skip = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  const [dragOn, setDragOn] = useState(false);
  const dragging = useRef(false);
  const place = (pos) => { if (root.current) root.current.style.setProperty('--i', String(pos)); };
  const mark = (k) => { if (root.current) root.current.querySelectorAll(':scope > button').forEach((b, j) => b.classList.toggle('on', j === k)); };
  // iPhone: tijdens vegen nooit de pagina laten meeschuiven
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const block = (e) => { if (dragging.current) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  // positie van het blokje volgt de waarde (niet tijdens vegen)
  useLayoutEffect(() => {
    if (!dragging.current) { place(Math.max(0, i)); mark(i); }
    const p = prev.current;
    prev.current = i;
    const el = ind.current;
    if (!el || p === i || p < 0 || i < 0 || reduced() || typeof el.animate !== 'function') return;
    const d = Math.abs(i - p);
    el.style.transformOrigin = i > p ? '0 50%' : '100% 50%';
    try { el.animate([{ scale: '1 1' }, { scale: `${(1 + Math.min(0.6, 0.3 * d)).toFixed(2)} .88`, offset: 0.32 }, { scale: '1 1' }], { duration: T.screen + 60, easing: EASE_OUT }); } catch (e) { /* oud toestel */ }
  });
  const down = (e) => {
    if (e.button > 0 || n < 2 || root.current.querySelector('button:disabled')) return;
    // maten één keer vastleggen; daarna telt alleen hoe ver de vinger is geschoven
    const r = root.current.getBoundingClientRect();
    const step = (r.width - 8 - (n - 1) * 4) / n + 4;
    const startPos = Math.max(0, Math.min(n - 1, (e.clientX - r.left - 4 - (step - 4) / 2) / step));
    const s = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, hover: i, shown: i, raf: 0, pos: startPos };
    const frame = () => {
      s.raf = 0;
      if (!dragging.current) return;
      place(s.pos.toFixed(3));
      if (s.shown !== s.hover) { s.shown = s.hover; mark(s.hover); }
    };
    const move = (ev) => {
      if (ev.pointerId !== s.id) return;
      if (!s.on) {
        const dx = Math.abs(ev.clientX - s.x), dy = Math.abs(ev.clientY - s.y);
        if (dy > 10 && dy > dx) { stop(); return; }
        if (dx < 8) return;
        s.on = true;
        dragging.current = true;
        setDragOn(true);
      }
      s.pos = Math.max(0, Math.min(n - 1, startPos + (ev.clientX - s.x) / step));
      const hover = Math.round(s.pos);
      if (hover !== s.hover) { s.hover = hover; haptic('select'); }
      if (!s.raf) s.raf = requestAnimationFrame(frame);
    };
    const up = (ev) => {
      if (ev.pointerId !== s.id) return;
      const was = s.on;
      stop(was ? s.hover : i);
      if (!was) return;
      skip.current = true;
      setTimeout(() => { skip.current = false; }, 0);
      prev.current = s.hover;
      if (s.hover !== i) cb.current(options[s.hover][0]);
    };
    const stop = (target = i) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (s.raf) cancelAnimationFrame(s.raf);
      if (dragging.current) {
        dragging.current = false;
        setDragOn(false);
        place(Math.max(0, target));
        mark(target);
      }
    };
    const cancel = () => stop(i);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  const tap = (v, k) => {
    if (skip.current) return;
    // tik op de al gekozen keuze: het blokje veert even in
    if (k === i && ind.current && !reduced() && typeof ind.current.animate === 'function') {
      try { ind.current.animate([{ scale: '1' }, { scale: '.94' }, { scale: '1' }], { duration: T.small + 100, easing: EASE_OUT }); } catch (e) { /* oud toestel */ }
    }
    cb.current(v);
  };
  return html`<div ref=${root} class=${'seg' + (small || n > 3 ? ' small' : '') + (dragOn ? ' dragging' : '')} role="group" aria-label=${label} style=${'--n:' + n} onPointerDown=${down}>
    ${(i !== -1 || dragOn) && html`<span class="seg-ind" ref=${ind} aria-hidden="true"></span>`}
    ${options.map(([v, l], k) => html`<button type="button" aria-pressed=${value === v ? 'true' : 'false'} onClick=${() => tap(v, k)}>${l}</button>`)}
  </div>`;
}

// +/−: getal rolt mee, vasthouden herhaalt steeds sneller, aan de grens schudt het getal 'nee'
export function Stepper({ value, min = 0, max = 99, step = 1, onChange, suffix = '', label }) {
  const v = useRef(value);
  v.current = value;
  const cb = useRef(onChange);
  cb.current = onChange;
  const last = useRef(value);
  const dir = useRef(null);
  if (value !== last.current) { dir.current = value > last.current ? 'up' : 'down'; last.current = value; }
  const [shake, setShake] = useState(0);
  const hold = useRef(null);
  const bump = (d, repeat) => {
    const cur = v.current;
    const nx = Math.max(min, Math.min(max, cur + d * step));
    if (nx === cur) { setShake((x) => x + 1); haptic('no'); return false; }
    v.current = nx;
    cb.current(nx);
    haptic(repeat ? 'select' : 'tap');
    return true;
  };
  const clear = (forget) => {
    const h = hold.current;
    if (!h) return;
    clearTimeout(h.t);
    if (forget) hold.current = null;
    else setTimeout(() => { if (hold.current === h) hold.current = null; }, 400);
  };
  const down = (d) => (e) => {
    if (e.button > 0 || e.currentTarget.matches(':disabled')) return;
    clear(true);
    const h = { rep: false, t: 0 };
    hold.current = h;
    let delay = 170;
    const go = () => {
      if (hold.current !== h) return;
      h.rep = true;
      if (!bump(d, true)) return;
      delay = Math.max(55, delay * 0.86);
      h.t = setTimeout(go, delay);
    };
    h.t = setTimeout(go, 420);
  };
  const click = (d) => () => {
    const h = hold.current;
    hold.current = null;
    if (h) clearTimeout(h.t);
    if (h && h.rep) return;
    bump(d, false);
  };
  const btn = (d, txt, aria, lim) => html`<button type="button" aria-label=${aria} class=${lim ? 'lim' : ''} aria-disabled=${lim ? 'true' : undefined}
    onPointerDown=${down(d)} onPointerUp=${() => clear(false)} onPointerLeave=${() => clear(false)} onPointerCancel=${() => clear(true)}
    onContextMenu=${(e) => e.preventDefault()} onClick=${click(d)}>${txt}</button>`;
  return html`<div class="stepper" role="group" aria-label=${label} data-haptic="own">
    ${btn(-1, '−', 'Minder', value <= min)}
    <span class=${'num st-val' + (shake ? (shake % 2 ? ' no-a' : ' no-b') : '')}><${Roll} text=${String(value)} dir=${dir.current} />${suffix ? html`<span class="st-suf">${suffix}</span>` : null}</span>
    ${btn(1, '+', 'Meer', value >= max)}
  </div>`;
}

// Soepel open- en dichtklappen; dicht gaat sneller dan open
export function Reveal({ open, children, cls = '' }) {
  return html`<div class=${'collapse' + (open ? ' open' : '') + (cls ? ' ' + cls : '')} inert=${!open} aria-hidden=${open ? undefined : 'true'}><div>${children}</div></div>`;
}

// Venster buiten het scherm (eigen laag in <body>), zodat het scherm erachter naar achteren kan wijken.
export function Portal({ children }) {
  const host = useRef(null);
  if (!host.current && typeof document !== 'undefined') { host.current = document.createElement('div'); host.current.className = 'portal'; }
  useLayoutEffect(() => {
    document.body.appendChild(host.current);
    return () => { render(null, host.current); host.current.remove(); };
  }, []);
  useLayoutEffect(() => { render(children, host.current); });
  return null;
}

// zolang er een venster open is, wijkt het scherm erachter een stukje naar achteren
let openSheets = 0;
function recede(on) {
  openSheets = Math.max(0, openSheets + (on ? 1 : -1));
  const root = document.documentElement;
  if (openSheets && on) root.style.setProperty('--sy', window.scrollY + 'px');
  root.classList.toggle('sheet-open', openSheets > 0);
}

const NO_SHEET_DRAG = 'input, textarea, select, .kr, .seg, [data-pid], .tl, .scrubzone, .no-sheet-drag';

export function Sheet({ onClose, children, label, x = false, footer = null, onDismiss = null }) {
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const back = useRef(null);
  const sheet = useRef(null);
  const cb = useRef(onClose);
  cb.current = onClose;
  const dis = useRef(onDismiss);
  dis.current = onDismiss;
  // sluiten: vanaf waar het venster nu is (ook halverwege een veeg) naar beneden, sneller dan het binnenkwam.
  // user = weggetikt, omlaag geveegd of Esc: een venster met invoer beslist dan zelf (bewaren, of tegenhouden)
  const close = (user = false) => {
    if (done.current) return;
    if (user && dis.current && dis.current() === false) {
      const sh = sheet.current, bk = back.current;
      haptic('no');
      if (sh) { sh.style.translate = ''; try { sh.animate([{ translate: '0 0' }, { translate: '0 10px' }, { translate: '0 0' }], { duration: 260, easing: 'ease-out' }); } catch (e) { /* oud toestel */ } }
      if (bk) bk.style.opacity = '';
      return;
    }
    done.current = true;
    setClosing(true);
    recede(false);
    const sh = sheet.current, bk = back.current;
    const calm = reduced() || !sh || typeof sh.animate !== 'function';
    const h = sh ? sh.offsetHeight : 400;
    const cur = sh ? parseFloat(getComputedStyle(sh).translate.split(' ')[1] || '0') || 0 : 0;
    const dur = calm ? 0 : Math.round(Math.max(150, T.outScreen * (1 - Math.min(0.7, cur / h))));
    if (!calm) {
      try {
        sh.animate([{ translate: `0 ${cur}px` }, { translate: `0 ${h + 24}px` }], { duration: dur, easing: EASE_IN, fill: 'forwards' });
        bk.animate([{ opacity: getComputedStyle(bk).opacity }, { opacity: 0 }], { duration: dur, easing: 'linear', fill: 'forwards' });
      } catch (e) { /* oud toestel */ }
    }
    setTimeout(() => cb.current(), Math.max(0, dur - 10));
  };
  useEffect(() => { dismissToast(); recede(true); return () => { if (!done.current) recede(false); }; }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // vinger-volgend sluiten: trek het venster omlaag (bovenaan of aan het handvat); ver genoeg of snel = dicht
  useEffect(() => {
    const sh = sheet.current, bk = back.current;
    if (!sh) return undefined;
    let d = null;
    const down = (e) => {
      if (e.button > 0 || done.current || e.target.closest(NO_SHEET_DRAG)) return;
      const top = sh.getBoundingClientRect().top;
      const grip = e.clientY - top < 34;
      if (sh.scrollTop > 2 && !grip) return;
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, y1: 0, pts: [[performance.now(), e.clientY]] };
    };
    const move = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y, dx = e.clientX - d.x;
      if (!d.on) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > dy) { d = null; return; }
        if (dy < -6) { d = null; return; }
        if (dy < 8) return;
        d.on = true;
        cancelPress();
        sh.classList.add('dragging');
      }
      // omhoog trekken mag een klein beetje (met weerstand)
      d.y1 = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
      d.pts.push([performance.now(), e.clientY]);
      if (d.pts.length > 6) d.pts.shift();
      sh.style.translate = `0 ${d.y1}px`;
      bk.style.opacity = String(1 - Math.min(1, Math.max(0, d.y1) / sh.offsetHeight) * 0.85);
    };
    const up = () => {
      if (!d) return;
      const x = d;
      d = null;
      if (!x.on) return;
      sh.classList.remove('dragging');
      const [t0, y0] = x.pts[0], [t1, y1] = x.pts[x.pts.length - 1];
      const v = (y1 - y0) / Math.max(1, t1 - t0);
      if (x.y1 > sh.offsetHeight * 0.3 || (v > 0.55 && x.y1 > 20)) { close(true); return; }
      sh.style.translate = '';
      bk.style.opacity = '';
    };
    const block = (e) => { if (d && d.on) e.preventDefault(); };
    sh.addEventListener('pointerdown', down);
    sh.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // Wordt de inhoud groter of kleiner (andere weergave, speler openklappen), dan verloopt de hoogte vloeiend
    // in plaats van in één keer. ResizeObserver meldt vóór het tekenen, dus het oude formaat blijft eerst staan.
    let lastH = null, hAnim = null;
    const ro = typeof ResizeObserver === 'function' && typeof sh.animate === 'function' ? new ResizeObserver(() => {
      if (hAnim) return;
      const h1 = sh.getBoundingClientRect().height;
      const h0 = lastH;
      lastH = h1;
      if (h0 == null || Math.abs(h1 - h0) < 3 || reduced() || done.current || sh.classList.contains('dragging')) return;
      const keepOv = sh.style.overflowY;
      sh.style.overflowY = 'hidden';
      hAnim = sh.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 440, easing: 'cubic-bezier(.32,.72,0,1)' });
      const end = () => { hAnim = null; sh.style.overflowY = keepOv; lastH = sh.getBoundingClientRect().height; };
      hAnim.onfinish = end; hAnim.oncancel = end;
    }) : null;
    if (ro) ro.observe(sh);
    return () => {
      if (ro) ro.disconnect();
      if (hAnim) hAnim.cancel();
      sh.removeEventListener('pointerdown', down);
      sh.removeEventListener('touchmove', block);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  return html`<${Portal}><div ref=${back} class=${'sheet-backdrop' + (closing ? ' closing' : '')} onClick=${(e) => { if (e.target === e.currentTarget) close(true); }}>
    <div ref=${sheet} class=${'sheet' + (footer ? ' has-foot' : '')} role="dialog" aria-modal="true" aria-label=${label}>
      <span class="handle"></span>
      ${x && html`<button type="button" class="sheet-x" aria-label="Sluiten" onClick=${() => close(true)}><${Icon} name="x" size=${20} /></button>`}
      ${children}
      ${footer && html`<div class="sheet-foot">${typeof footer === 'function' ? footer(close) : footer}</div>`}
    </div>
  </div></${Portal}>`;
}

export function Confirm({ title, text, yes, no = 'Annuleren', danger, onYes, onClose }) {
  return html`<${Sheet} onClose=${onClose} label=${title}>
    <h2 class="h2" style="font-size:20px">${title}</h2>
    ${text && html`<p class="sub" style="margin:0">${text}</p>`}
    <button type="button" class=${'btn block ' + (danger ? 'danger' : 'primary')} onClick=${() => { onYes(); onClose(); }}>${yes}</button>
    <button type="button" class="btn block plain" onClick=${onClose}>${no}</button>
  </${Sheet}>`;
}

export function Icon({ name, size = 22 }) {
  const paths = {
    back: 'M15 18l-6-6 6-6',
    play: 'M8 5v14l11-7z',
    pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
    swap: 'M7 4v13M7 4L3 8M7 4l4 4M17 20V7M17 20l-4-4M17 20l4-4',
    ball: 'M12 3a9 9 0 100 18 9 9 0 000-18z',
    plus: 'M12 5v14M5 12h14',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.6v.2',
    field: 'M5 2.5h14v19H5zM5 12h14M8 2.5a4 4 0 0 0 8 0M8 21.5a4 4 0 0 1 8 0',
    chart: 'M5 20V10M12 20V4M19 20v-7',
    team: 'M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6M3 20a6 6 0 0112 0M15 14a6 6 0 016 6',
    lock: 'M6 11h12v9H6zM9 11V8a3 3 0 016 0v3',
    x: 'M6 6l12 12M18 6L6 18',
    chev: 'M9 6l6 6-6 6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    copy: 'M9 9h11v12H9zM5 15V3h11',
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
    clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
    up2: 'M7 12l5-5 5 5M7 18l5-5 5 5',
    down2: 'M7 6l5 5 5-5M7 12l5 5 5-5',
    even: 'M6 9.5h12M6 14.5h12',
    pin: 'M9 3.5h6l-1 5.5 3.5 3.5h-11L10 9zM12 12.5V21',
    story: 'M5 7h14M5 12h14M5 17h9',
    swaparrows: 'M19.5 11A7.5 7.5 0 0 0 6.2 6.6L4.5 8.3M4.5 3.8v4.5H9M4.5 13a7.5 7.5 0 0 0 13.3 4.4l1.7-1.7M19.5 20.2v-4.5H15',
    eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.3a2.7 2.7 0 100 5.4 2.7 2.7 0 000-5.4z',
    check: 'M5 12.5l4.5 4.5L19 7',
    reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 3.5v4.2h4.2',
    glove: 'M8.5 21v-6.8L6 11.6a1.5 1.5 0 0 1 2.2-2l1.1 1.1V5.4a1.3 1.3 0 0 1 2.6 0v4.3V4.3a1.3 1.3 0 0 1 2.6 0v5.4V5.4a1.3 1.3 0 0 1 2.6 0v4.6V7.6a1.3 1.3 0 0 1 2.6 0V14a6.5 6.5 0 0 1-3 5.5V21z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    spark: 'M12 3.5l1.9 5.2 5.6 1.8-5.6 1.8L12 17.5l-1.9-5.2-5.6-1.8 5.6-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    shield: 'M12 3l7 3v5.2c0 4.3-2.9 8-7 9.8-4.1-1.8-7-5.5-7-9.8V6z',
    warn: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.3',
    rotate: 'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5zM3 9.5a9 9 0 0 1 2-4M21 14.5a9 9 0 0 1-2 4M1.8 7.2 3 9.6l2.3-1.1M22.2 16.8 21 14.4l-2.3 1.1'
  };
  const filled = name === 'play' || name === 'pause';
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill=${filled ? 'currentColor' : 'none'} stroke=${filled ? 'none' : 'currentColor'} stroke-width=${name === 'more' ? 3.6 : 2.2} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${paths[name]} /></svg>`;
}

// ---------- het veld ----------
// slots: { V0: id, M0: id, A0: id, ... }  aanval boven, eigen doel (keeper) onder
// spelers die net op een nieuwe plek zijn neergezet door te slepen: de pil landt pas als de zwevende versie er is
const landing = {};
const LANE_NAMES = { V: 'voor', M: 'midden', A: 'achter' };

export function Field({ slots, lines, keeperId, nick, onTap, onKeeper, onEmpty = null, emptyHot = false, neon = [], marked = [], dashed = [], muted = [], selected = null, sub, below, height = 330, compact = false, picking = false, hot = null, hotKey = 0, ghosts = null, animate = false, accent = null, badges = null, cheer = null, formable = false, keeperDrag = false, deco = null }) {
  // bij slepen (formable) blijft ook een lege linie zichtbaar, zodat je er iemand naartoe kunt slepen
  lines = { V: lines.V || 0, M: lines.M || 0, A: lines.A || 0 };
  const rows = ['V', 'M', 'A'].filter((l) => lines[l] > 0 || formable);
  // linies gelijk verdeeld tussen de bovenrand en de keeper (middelpunten in %)
  const START = 5, END = 78;
  const tops = rows.map((_, r) => `${START + ((r + 0.5) * (END - START)) / rows.length}%`);
  const where = (k) => { const l = k[0], i = +k.slice(1), r = rows.indexOf(l); return r === -1 ? null : { left: `${((i + 1) / (lines[l] + 1)) * 100}%`, top: tops[r] }; };
  // wissel: wie eruit gaat zakt weg richting bank, wie erin komt stapt vanaf zijn zweefplek in; doorschuivers glijden
  const sk = JSON.stringify(slots);
  const mem = useRef(null);
  const lk = JSON.stringify(lines);
  if (!mem.current) mem.current = { sk, slots, enters: {}, exits: [], ever: {}, lk, reform: 0 };
  // andere opstelling: iedereen schuift vlot naar zijn nieuwe plek
  if (mem.current.lk !== lk) { mem.current.lk = lk; mem.current.reform = Date.now(); }
  if (mem.current.sk !== sk) {
    if (animate) {
      const p = mem.current.slots || {};
      const nowIds = new Set(Object.values(slots).filter(Boolean));
      const prevIds = new Set(Object.values(p).filter(Boolean));
      const t = Date.now();
      let n = 0;
      for (const k of Object.keys(p)) {
        const id = p[k];
        if (!id || nowIds.has(id)) continue;
        const w = where(k);
        if (w) mem.current.exits.push({ id, name: nick(id), ...w, t, i: n++ });
      }
      n = 0;
      for (const k of Object.keys(slots)) {
        const id = slots[k];
        if (id && !prevIds.has(id)) { mem.current.enters[id] = { t, i: n++ }; mem.current.ever[id] = 1; }
      }
    }
    mem.current.sk = sk; mem.current.slots = slots;
  }
  const now = Date.now();
  mem.current.exits = mem.current.exits.filter((x) => now - x.t < 1900);
  for (const id in mem.current.enters) if (now - mem.current.enters[id].t > 2500) delete mem.current.enters[id];
  const enterOf = (id) => { const e = mem.current.enters[id]; return e && now - e.t < 1700 ? e : null; };
  const total = rows.reduce((a, l) => a + lines[l], 0);
  const widest = Math.max(1, ...rows.map((l) => lines[l]));
  let size = total <= 6 ? 'l' : total <= 8 ? 'm' : total <= 10 ? 's' : 'xs';
  if (compact && (size === 'l' || size === 'm')) size = 's';
  const maxPx = { l: 116, m: 92, s: 76, xs: 66 }[size];
  const pillKind = (id) => (dashed.indexOf(id) !== -1 ? 'dashed' : '') + (muted.indexOf(id) !== -1 ? ' muted' : '') + (marked.indexOf(id) !== -1 ? ' marked' : '') + (selected === id ? ' orange' : '');
  const pillStyle = `max-width:min(${maxPx}px, calc(${(100 / (widest + 1)).toFixed(2)}cqw - 6px))`;
  const accStyle = (id) => { const c = accent && id ? accent(id) : null; return c ? `;--acc:${c}` : ''; };
  const goalMark = (id, keeper) => (hot && hot === id
    ? html`<span class="ripple" aria-hidden="true"></span><span class="ripple r2" aria-hidden="true"></span><span class="goalburst">+1</span>`
    : keeper && badges && badges[id] ? html`<span class="gbadge" aria-label=${badges[id] + ' doelpunt' + (badges[id] > 1 ? 'en' : '')}>${badges[id]}</span>` : null);
  const goalDot = (id) => (badges && badges[id] && hot !== id ? html`<b class="tgoal" aria-label=${badges[id] + ' doelpunt' + (badges[id] > 1 ? 'en' : '')}>${badges[id]}</b>` : null);
  const spot = (id, left, top, key) => {
    const name = id ? nick(id) : '—';
    const isNeon = id && neon.indexOf(id) !== -1;
    const en = id ? enterOf(id) : null;
    const g = ghosts && id ? ghosts[id] : null;
    const right = parseFloat(left) > 50;
    const acc = accStyle(id);
    // lege plek die je kunt aantikken (game plan: eerst een speler kiezen, dan hier neerzetten)
    if (!id && onEmpty) {
      return html`<button type="button" class=${'spot empty' + (emptyHot ? ' hot' : '')} key=${'em' + key} data-pid=${'empty:' + key} data-line=${key[0]} data-ci=${key.slice(1)}
        style=${`left:${left};top:${top};--ci:${key.slice(1)}`} onClick=${() => onEmpty(key)} aria-label=${'Lege plek ' + LANE_NAMES[key[0]]}>
        <span class="sp-in"><span class="pill empty" style=${pillStyle}>+</span></span></button>`;
    }
    const pill = html`<span class=${'pill ' + pillKind(id) + (acc ? ' acc' : '')} style=${pillStyle + acc}>${name}</span>`;
    const ghost = g ? html`<span class=${'ghost ' + g.kind + (g.hot ? ' hot' : '') + (right ? ' right' : '')} aria-hidden="true"><b>${g.name}${g.dir ? html`<small>${g.dir}</small>` : ''}</b></span>` : null;
    // 'e' blijft staan zodat de binnenkom-animatie niet terugvalt op de pop-animatie
    const cls = 'spot' + (hot && hot === id ? ' scored' : '') + (id && mem.current.ever[id] ? ' e' : '') + (right ? ' from-left' : '') + (g ? ' has-ghost' : '') + (id && landing[id] && now - landing[id] < 900 ? ' landing' : '');
    return html`<button type="button" class=${cls} key=${(id || key) + (hot === id ? ':' + hotKey : '')} data-pid=${id || ''} data-line=${key[0]} data-ci=${key.slice(1)}
      style=${`left:${left};top:${top};--ci:${key.slice(1)}` + (en ? `;--d:${(0.3 + en.i * 0.18).toFixed(2)}s` : '')} disabled=${!onTap || !id} onClick=${() => onTap && id && onTap(id)} aria-label=${name}>
      ${goalMark(id)}
      ${ghost}
      <span class=${'sp-in' + (en ? ' entering' : '')}>
        ${isNeon && !picking && !en ? html`<${Neon}>${pill}</${Neon}>` : pill}
        ${sub && id && sub(id) ? html`<span class="time">${goalDot(id)}${sub(id)}</span>` : null}
        ${below && id ? below(id) : null}
      </span>
    </button>`;
  };
  const cheerCls = cheer ? ' cheer-' + cheer.line + (cheer.n % 2 ? ' ca' : ' cb') : '';
  const reform = now - mem.current.reform < 1400;
  const band = (END - START) / rows.length;
  return html`<div class=${'field sz-' + size + (picking ? ' picking' : '') + cheerCls + (reform ? ' reform' : '')} style=${`height:${typeof height === 'number' ? height + 'px' : height}`}>
    <span class="lines"></span>
    <span class="arc top"></span>
    <span class="arc bottom"></span>
    ${deco}
    ${formable && rows.map((l, r) => html`<span class="lane" key=${'ln' + l} data-l=${l} style=${`top:${(START + r * band).toFixed(2)}%;height:${band.toFixed(2)}%;--r:${r}`} aria-hidden="true"><b>${LANE_NAMES[l]}</b></span>`)}
    ${formable && rows.filter((l) => !lines[l]).map((l) => html`<span class="lane-empty" key=${'le' + l} style=${`top:${tops[rows.indexOf(l)]}`} aria-hidden="true">${LANE_NAMES[l][0].toUpperCase() + LANE_NAMES[l].slice(1)} leeg · sleep hierheen</span>`)}
    ${formable && rows.flatMap((l, r) => Array.from({ length: lines[l] + 1 }, (_, k) => html`<span class="addslot" key=${'ad' + l + k + ':' + lines[l]} data-pid=${'line:' + l + ':' + k} data-l=${l}
      style=${`left:${(((k + 0.5) / (lines[l] + 1)) * 100).toFixed(2)}%;top:${tops[r]};--k:${k};--r:${r}`} aria-hidden="true"></span>`))}
    ${mem.current.exits.map((x) => html`<span class="spot exitspot" key=${'x' + x.id + x.t} style=${`left:${x.left};top:${x.top};--d:${(x.i * 0.18).toFixed(2)}s`} aria-hidden="true"><span class="pill" style=${pillStyle}>${x.name}</span></span>`)}
    ${rows.flatMap((l, r) => {
      const n = lines[l];
      return Array.from({ length: n }, (_, i) => spot(slots[l + i], `${((i + 1) / (n + 1)) * 100}%`, tops[r], l + i));
    })}
    ${keeperId && html`<button type="button" class=${'spot keeperspot' + (hot && hot === keeperId ? ' scored' : '')} key=${'k' + keeperId + (hot === keeperId ? ':' + hotKey : '')} style="left:50%;bottom:16px;top:auto" disabled=${!onKeeper && !keeperDrag} data-pid=${keeperDrag ? keeperId : undefined} onClick=${() => onKeeper && onKeeper(keeperId)} aria-label=${'Keeper ' + nick(keeperId)}>${goalMark(keeperId, true)}<${KeeperPill} name=${nick(keeperId)} /></button>`}
  </div>`;
}

// kleur van de dominante rol (zelfde kleuren als bij de speler), voor een accent links in de pil
export function accentFor(team) {
  const byId = {};
  for (const p of team.players) byId[p.id] = p;
  return (id) => { const p = byId[id]; return p && p.main ? POS_COLORS[p.main] : null; };
}

export function PosBar({ parts }) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return html`<div class="posbar"></div>`;
  return html`<div class="posbar" role="img" aria-label=${parts.filter((p) => p.v > 0).map((p) => POS_NAMES[p.k] + ' ' + Math.round((p.v / total) * 100) + '%').join(', ')}>
    ${parts.filter((p) => p.v > 0).map((p) => html`<span style=${`flex:${p.v} 1 0;background:${POS_COLORS[p.k]}`}></span>`)}
  </div>`;
}

export const KRACHT_BG = 'linear-gradient(90deg, #1F3C88, #2B57C9 72%, #F5A524)';

// ---------- slepen om te ruilen (vinger of muis) ----------
// Elementen met data-pid binnen de container kunnen op elkaar worden gesleept.
// Zo voelt het op een telefoon goed:
// - wat je sleept zweeft boven je vinger (je vinger verbergt het niet);
// - het dichtstbijzijnde doel binnen een ruime straal 'pakt' de speler (geen precies mikken);
// - boven de zwevende speler staat wat er gaat gebeuren ('Speler 8 erin', 'Ruil met …');
// - bij loslaten vliegt de speler naar het doel, of terug als er geen doel is.
// hint(a, b) geeft die tekst, of null als b geen geldig doel is.
const MAGNET = 78;
export function useDragSwap(ref, enabled, onSwap, hint, opts = {}) {
  const cb = useRef(onSwap);
  cb.current = onSwap;
  const hb = useRef(hint);
  hb.current = hint;
  // benchSlots: ook een bankspeler mag op een lege plek (+) landen (game plan: blok invullen of een extra plek)
  const ob = useRef(opts);
  ob.current = opts;
  // het sleepvlak kan opnieuw getekend worden (een nieuw element, bijv. na een focuswissel op het eiland):
  // dan de luisteraars op het nieuwe element zetten, anders reageert er niets meer
  const [el, setEl] = useState(null);
  useLayoutEffect(() => { if (ref.current !== el) setEl(ref.current); });
  useEffect(() => {
    const root = el;
    if (!root || !enabled) return undefined;
    root.classList.add('draggable');
    let st = null;
    let raf = 0;
    const centre = (el) => { const p = el.querySelector('.pill') || el; const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const isSlot = (id) => id.slice(0, 5) === 'line:';
    const down = (e) => {
      if (e.button > 0) return;
      // een vorige sleep die nooit netjes eindigde (iPhone: geen loslaat-signaal): eerst opruimen
      if (st) abort();
      const el = e.target.closest('[data-pid]');
      // lege plekken en vakken (zone:…) zijn alleen een doel, je pakt ze niet op
      if (!el || !el.dataset.pid || isSlot(el.dataset.pid) || el.dataset.pid.slice(0, 5) === 'zone:' || el.dataset.pid.slice(0, 6) === 'empty:' || !root.contains(el)) return;
      const sc = el.closest('.benchrow .scroll');
      st = { id: el.dataset.pid, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, el, ghost: null, tip: null, over: null, targets: [], scroller: sc && sc.classList.contains('ovf') ? sc : null, dirty: false };
    };
    // doelen opnieuw opmeten (de bank kan tijdens het slepen scrollen)
    const measure = () => {
      for (const t of st.targets) Object.assign(t, centre(t.el));
      st.dirty = false;
    };
    const begin = () => {
      cancelPress();
      const src = st.el.querySelector('.pill');
      let g;
      if (src) { g = src.cloneNode(true); g.querySelectorAll('.hx').forEach((n) => n.remove()); }
      else {
        // tegels zonder pil (bank bij Zelf plannen): maak er een echte spelerspil van om mee te slepen
        g = document.createElement('span');
        g.className = 'pill' + (st.el.classList.contains('acc') ? ' acc' : '');
        const ac = st.el.style.getPropertyValue('--acc'); if (ac) g.style.setProperty('--acc', ac);
        g.textContent = ((st.el.querySelector('.bb-nm, .nm') || st.el).textContent || '').trim();
      }
      g.classList.add('drag-ghost');
      document.body.appendChild(g);
      const tip = document.createElement('div');
      tip.className = 'drag-tip';
      document.body.appendChild(tip);
      st.ghost = g;
      st.tip = tip;
      st.from = centre(st.el);
      st.el.classList.add('drag-src');
      const onField = !!st.el.closest('.field');
      const slotsToo = onField || !!ob.current.benchSlots;
      root.classList.add('dragging');
      if (slotsToo) { root.classList.add('drag-field'); root.dataset.dragLine = onField ? st.el.dataset.line || '' : ''; }
      // alle mogelijke doelen: spelers, en (voor veldspelers) de lege plekken waarmee je de opstelling verandert
      st.targets = [...root.querySelectorAll('[data-pid]')].filter((t) => t.dataset.pid && t.dataset.pid !== st.id).map((t) => {
        const slot = isSlot(t.dataset.pid);
        const label = slot && !slotsToo ? null : hb.current ? hb.current(st.id, t.dataset.pid) : '';
        if (label === null) { if (slot) t.classList.add('off'); return null; }
        return { el: t, id: t.dataset.pid, label, slot, line: slot ? t.dataset.l : null, k: slot ? +t.dataset.pid.split(':')[2] : 0, ...centre(t) };
      }).filter(Boolean);
      if (!reduced()) { try { g.animate([{ scale: '1' }, { scale: '1.15' }], { duration: T.small, easing: SPRING.play }); } catch (x) { /* oud toestel */ } }
      haptic('select');
    };
    // buren in de linie schuiven een stukje opzij om ruimte te maken voor de nieuwe plek
    const nudge = (t) => {
      root.querySelectorAll('.spot.nudge').forEach((n) => { n.classList.remove('nudge'); n.style.removeProperty('--nx'); });
      if (t && t.slot) {
        root.dataset.aimLine = t.line;
        root.querySelectorAll(`.field .spot[data-line="${t.line}"]`).forEach((n) => {
          const i = +(n.style.getPropertyValue('--ci') || 0);
          n.classList.add('nudge');
          n.style.setProperty('--nx', (i < t.k ? -12 : 12) + 'px');
        });
      } else delete root.dataset.aimLine;
    };
    const aim = () => {
      if (st.dirty) measure();
      // mikpunt net boven het contactpunt van de vinger; dichtstbijzijnde doel binnen de straal
      const ax = st.px, ay = st.py - 8;
      let best = null, bd = MAGNET;
      for (const t of st.targets) { const dd = Math.hypot(t.x - ax, t.y - ay); if (dd < bd) { bd = dd; best = t; } }
      if (best !== st.over) {
        if (st.over) st.over.el.classList.remove('drop-target');
        if (best) { best.el.classList.add('drop-target'); haptic('select'); }
        st.tip.textContent = best ? best.label : '';
        st.tip.classList.toggle('on', !!(best && best.label));
        st.tip.classList.toggle('form', !!(best && best.slot));
        st.ghost.classList.toggle('locked', !!best);
        nudge(best);
        st.over = best;
      }
    };
    // het scherm zelf: bij de boven- of onderrand vanzelf meescrollen (groot veld in de planner)
    const pageScroller = () => {
      for (let n = root.parentElement; n && n !== document.body; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
      }
      const se = document.scrollingElement;
      return se && se.scrollHeight > se.clientHeight + 2 ? se : null;
    };
    // bij de rand van een lange bank: vanzelf doorscrollen zodat je iedereen bereikt
    const edgeScroll = () => {
      raf = 0;
      if (!st || !st.ghost) return;
      const ps = st.ps === undefined ? (st.ps = pageScroller()) : st.ps;
      if (ps) {
        const top = ps === document.scrollingElement ? 0 : ps.getBoundingClientRect().top;
        const bottom = ps === document.scrollingElement ? window.innerHeight : ps.getBoundingClientRect().bottom;
        const EDGE = 70;
        let vy = 0;
        if (st.py < top + EDGE && ps.scrollTop > 0) vy = -Math.ceil(((top + EDGE - st.py) / EDGE) * 12);
        else if (st.py > bottom - EDGE && ps.scrollTop + ps.clientHeight < ps.scrollHeight - 1) vy = Math.ceil(((st.py - (bottom - EDGE)) / EDGE) * 12);
        if (vy) { ps.scrollTop += vy; st.dirty = true; aim(); raf = requestAnimationFrame(edgeScroll); return; }
      }
      let v = 0;
      for (const sc of root.querySelectorAll('.benchrow .scroll.ovf')) {
        const r = sc.getBoundingClientRect();
        if (st.py < r.top - 24 || st.py > r.bottom + 24) continue;
        const EDGE = 48;
        if (st.px < r.left + EDGE && sc.scrollLeft > 0) v = -Math.ceil(((r.left + EDGE - st.px) / EDGE) * 9);
        else if (st.px > r.right - EDGE && sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 1) v = Math.ceil(((st.px - (r.right - EDGE)) / EDGE) * 9);
        if (v) { sc.scrollLeft += v; st.dirty = true; aim(); break; }
      }
      if (v) raf = requestAnimationFrame(edgeScroll);
    };
    const move = (e) => {
      if (!st) return;
      st.px = e.clientX; st.py = e.clientY;
      if (!st.ghost) {
        const dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (Math.hypot(dx, dy) < 8) return;
        // op een lange bank: opzij vegen = scrollen, omhoog = slepen
        if (st.scroller && Math.abs(dx) > Math.abs(dy)) { st = null; return; }
        begin();
      }
      e.preventDefault();
      st.ghost.style.left = e.clientX + 'px';
      st.ghost.style.top = e.clientY + 'px';
      st.tip.style.left = e.clientX + 'px';
      st.tip.style.top = e.clientY + 'px';
      aim();
      if (!raf) raf = requestAnimationFrame(edgeScroll);
    };
    const fly = (g, tip, to, ok, land) => {
      tip.remove();
      if (reduced() || typeof g.animate !== 'function') { g.remove(); return; }
      const r = g.getBoundingClientRect();
      const dx = to.x - (r.left + r.width / 2), dy = to.y - (r.top + r.height / 2);
      try {
        const a = land
          // nieuwe plek: de zwevende pil zakt precies op zijn plek en geeft het stokje dan door aan de echte
          ? g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy - 6}px) scale(.88)`, opacity: 1, offset: 0.78 }, { transform: `translate(${dx}px, ${dy - 6}px) scale(.88)`, opacity: 0 }],
            { duration: T.screen, easing: EASE_OUT, fill: 'forwards' })
          : g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${ok ? 0.8 : 0.9})`, opacity: ok ? 0.2 : 0 }],
            { duration: ok ? T.small : T.outScreen, easing: ok ? EASE_OUT : 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
        a.onfinish = () => g.remove();
      } catch (x) { g.remove(); }
    };
    const clear = () => {
      root.classList.remove('dragging', 'drag-field');
      delete root.dataset.dragLine;
      nudge(null);
      root.querySelectorAll('.addslot.off').forEach((n) => n.classList.remove('off'));
    };
    // sleep afbreken zonder iets te doen: zwever en markeringen weg, alles terug zoals het was
    const abort = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (st && st.ghost) {
        st.ghost.remove(); if (st.tip) st.tip.remove();
        if (st.el) st.el.classList.remove('drag-src');
        if (st.over) st.over.el.classList.remove('drop-target');
        clear();
      }
      root.querySelectorAll('.drag-src, .drop-target').forEach((n) => n.classList.remove('drag-src', 'drop-target'));
      st = null;
    };
    const cancel = () => abort();
    const hide = () => { if (document.hidden) abort(); };
    const up = () => {
      if (!st) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (st.ghost) {
        st.el.classList.remove('drag-src');
        const over = st.over;
        if (over) over.el.classList.remove('drop-target');
        clear();
        let to = over || st.from;
        if (over && over.slot) {
          landing[st.id] = Date.now();
          // precies waar de pil straks staat: plek k van de (één langere) linie, op de hoogte van de pil
          const field = over.el.closest('.field');
          const fr = field.getBoundingClientRect(), sr = st.el.getBoundingClientRect();
          const n = field.querySelectorAll(`.spot[data-line="${over.line}"]`).length;
          to = { x: fr.left + (fr.width * (over.k + 1)) / (n + 2), y: over.y + (st.from.y - (sr.top + sr.height / 2)) };
        }
        fly(st.ghost, st.tip, to, !!over, !!(over && over.slot));
        if (over) cb.current(st.id, over.id);
        root.dataset.justDragged = '1';
        setTimeout(() => { delete root.dataset.justDragged; }, 60);
      }
      st = null;
    };
    const rescroll = () => { if (st && st.ghost) st.dirty = true; };
    // iPhone: tijdens het slepen nooit de pagina laten scrollen (daarvoor wel, zodat de bank kan scrollen)
    const noScroll = (e) => { if (st && st.ghost) e.preventDefault(); };
    root.addEventListener('touchmove', noScroll, { passive: false });
    root.addEventListener('pointerdown', down);
    root.addEventListener('scroll', rescroll, true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    // afgebroken door het toestel (bijv. een systeemgebaar): niet laten vallen, gewoon terug
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hide);
    return () => {
      abort();
      root.removeEventListener('touchmove', noScroll);
      root.classList.remove('draggable');
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hide);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('scroll', rescroll, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [enabled, el]);
}

// Bankrij die opzij scrollt als hij te vol is: zachte randen, vastklikken per speler, en wie er
// straks in moet schuift vanzelf in beeld.
export function BenchScroll({ focus = null, children }) {
  const ref = useRef(null);
  const upd = () => {
    const el = ref.current;
    if (!el) return;
    const ovf = el.scrollWidth > el.clientWidth + 2;
    el.classList.toggle('ovf', ovf);
    el.classList.toggle('at-start', !ovf || el.scrollLeft < 4);
    el.classList.toggle('at-end', !ovf || el.scrollLeft + el.clientWidth > el.scrollWidth - 4);
  };
  useLayoutEffect(upd);
  // spelers die op de bank van plek veranderen glijden naar hun nieuwe plek (FLIP). Gemeten binnen de bank zelf,
  // zodat een veeg over het veld (dat even meeschuift) geen grote sprong geeft; nieuwe spelers komen zacht in beeld.
  const at = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const now = {};
    const first = at.current === null;
    // de plek in de layout (offsetLeft), niet de getekende plek: zo herstart een lopende animatie niet bij elke
    // nieuwe tekening tijdens het vegen (dan bleef een speler 'hangen' onder een andere)
    for (const n of el.querySelectorAll('[data-pid]')) {
      const w = n.closest('.neon') || n;
      const x = w.offsetLeft;
      now[n.dataset.pid] = x;
      if (first || reduced() || typeof n.animate !== 'function') continue;
      const was = at.current[n.dataset.pid];
      try {
        if (was != null && Math.abs(was - x) > 1) {
          const d = Math.max(-64, Math.min(64, was - x));
          w.animate([{ translate: `${d}px 0` }, { translate: '0 0' }], { duration: T.small + 80, easing: SPRING.soft });
        }
      } catch (e) { /* oud toestel */ }
    }
    at.current = now;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', upd, { passive: true });
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(upd); ro.observe(el); }
    return () => { el.removeEventListener('scroll', upd); if (ro) ro.disconnect(); };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !focus || !el.classList.contains('ovf')) return;
    const p = el.querySelector(`[data-pid="${focus}"]`);
    if (!p) return;
    const r = p.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (r.left >= b.left + 8 && r.right <= b.right - 8) return;
    const left = el.scrollLeft + (r.left + r.width / 2) - (b.left + b.width / 2);
    try { el.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' }); } catch (x) { el.scrollLeft = left; }
  }, [focus]);
  return html`<div class="scroll" ref=${ref}>${children}</div>`;
}
export const justDragged = (ref) => !!(ref.current && ref.current.dataset.justDragged);

// ---------- logo's ----------
export function TeamBadge({ team, size = 64 }) {
  if (team.logo) return html`<img src=${team.logo} alt=${team.name} width=${size} height=${size} style=${`width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;background:#fff`} />`;
  const short = (team.short || team.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).slice(0, 4).toUpperCase();
  return html`<svg width=${size} height=${size} viewBox="0 0 64 64" role="img" aria-label=${team.name}>
    <circle cx="32" cy="32" r="31" fill="#1F3C88" />
    <circle cx="32" cy="32" r="25" fill="none" stroke="#F5A524" stroke-width="5" />
    <text x="32" y="38" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size=${short.length > 2 ? 15 : 19} fill="#fff">${short}</text>
  </svg>`;
}

// Fantasieschild in de clubkleuren van de tegenstander (of neutraal als die onbekend zijn)
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
};
const isLight = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 200; };
let shieldSeq = 0;
export function OppBadge({ name, size = 64, colors }) {
  const ref = useRef(null);
  if (!ref.current) ref.current = 'sh' + (++shieldSeq);
  const cols = colors || (name ? clubColors(name, getState().clubColors) : null);
  const short = name ? clubAbbr(name) : '?';
  const fs = short.length >= 4 ? 14 : short.length === 3 ? 17 : 20;
  const OUT = 'M32 3 L57 12 V30 C57 45 46 56 32 61 C18 56 7 45 7 30 V12 Z';
  const IN = 'M32 9 L51 16 V30 C51 42 43 51 32 55 C21 51 13 42 13 30 V16 Z';
  if (!cols) {
    return html`<svg width=${size} height=${size} viewBox="0 0 64 64" role="img" aria-label=${name || 'Tegenstander'}>
      <path d=${OUT} fill="#6B7280" /><path d=${IN} fill="#9CA3AF" />
      <text x="32" y="39" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size=${fs} fill="#fff">${short}</text>
    </svg>`;
  }
  const [c0, c1 = c0, c2] = cols;
  const rim = c2 || (isLight(c0) ? shade(c1, 0.75) : shade(c0, 0.62));
  return html`<svg width=${size} height=${size} viewBox="0 0 64 64" role="img" aria-label=${name || 'Tegenstander'}>
    <defs><clipPath id=${ref.current}><path d=${IN} /></clipPath></defs>
    <path d=${OUT} fill=${rim} />
    <g clip-path=${`url(#${ref.current})`}>
      <rect x="0" y="0" width="32" height="64" fill=${c0} /><rect x="32" y="0" width="32" height="64" fill=${c1} />
    </g>
    <path d=${IN} fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1" />
    <text x="32" y="39" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size=${fs} fill="#fff" stroke="#111827" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">${short}</text>
  </svg>`;
}

// Invoer tegenstander met clubsuggesties (naam, afkorting of plaats)
export function OpponentInput({ id, value, onChange, placeholder = 'Bijv. Laren JO9-2' }) {
  const [focus, setFocus] = useState(false);
  const ref = useRef(null);
  const { base, suffix } = splitTeam(value);
  const exact = findClub(value);
  const done = exact && norm(base) === norm(exact.n) && (suffix || /\s$/.test(value));
  const list = focus && !done ? searchClubs(value) : [];
  return html`<div class="oppinput">
    <input id=${id} ref=${ref} class="input" value=${value} placeholder=${placeholder} autocomplete="off" autocorrect="off" spellcheck="false"
      onInput=${(e) => onChange(e.target.value)} onFocus=${() => setFocus(true)} onBlur=${() => setTimeout(() => setFocus(false), 120)} />
    ${list.length > 0 && html`<div class="suggest" role="listbox">
      ${list.map((c) => html`<button type="button" role="option" onPointerDown=${(e) => e.preventDefault()} onClick=${() => { onChange(withClub(value, c)); if (ref.current) ref.current.focus(); }}>
        <${OppBadge} name=${c.n} size=${30} />
        <span class="col" style="gap:0;min-width:0"><b>${c.n}</b><span class="small">${c.f !== c.n ? c.f + ' · ' : ''}${c.t}</span></span>
      </button>`)}
    </div>`}
  </div>`;
}

// Kleuren van het schild zelf kiezen (onthouden per club op deze telefoon)
export function ShieldColors({ name }) {
  const key = name ? colorKey(name) : '';
  if (!key) return null;
  const own = (getState().clubColors || {})[key];
  const club = findClub(name);
  const cols = own || (club && club.c) || ['#6B7280', '#9CA3AF'];
  const set = (i, v) => update((d) => {
    d.clubColors = d.clubColors || {};
    const cur = (d.clubColors[key] || cols).slice(0, 2);
    cur[i] = v;
    d.clubColors[key] = cur;
  });
  const reset = () => update((d) => { if (d.clubColors) delete d.clubColors[key]; });
  return html`<div class="shieldrow">
    <${OppBadge} name=${name} size=${40} />
    <span class="col grow" style="gap:0;min-width:0"><span style="font-weight:800">Schild</span>
      <span class="small">${own ? 'eigen kleuren' : club && club.c ? 'clubkleuren' : 'kleuren onbekend · kies ze zelf'}</span></span>
    <input type="color" class="swatch" aria-label="Kleur 1" value=${cols[0]} onInput=${(e) => set(0, e.target.value)} />
    <input type="color" class="swatch" aria-label="Kleur 2" value=${cols[1] || cols[0]} onInput=${(e) => set(1, e.target.value)} />
    ${own && html`<button type="button" class="link" onClick=${reset}>Standaard</button>`}
  </div>`;
}

// Wat de coach roept bij een wissel: wie eruit, en per speler dat erin komt of van plek verandert één regel
// met waar hij aan het eind staat (uit M.callStory). Zelfde taal in de lade van het live-scherm en in de planner.
export function CallStory({ call, nick }) {
  if (!call || (!call.out.length && !call.tell.length)) return null;
  return html`<div class="call">
    ${call.out.length > 0 && html`<span class="call-k">Roep eruit</span>
      <span class="call-out">${call.out.map((id) => html`<span class="chg out" key=${id}>↓ ${nick(id)}</span>`)}</span>`}
    ${call.tell.length > 0 && html`<span class="call-k">Zeg tegen</span>
      <span class="call-list">${call.tell.map((x) => html`<span class="call-row" key=${x.id}>
        <span class=${'chg ' + (x.in ? 'in' : 'sh')}>${x.in ? '↑' : '↔'} ${nick(x.id)}</span>
        <span class="call-do">${x.in ? html`erin · <b>${x.pos ? x.pos.kort : 'op de vrije plek'}</b>` : html`${x.pos ? x.pos.naar : 'schuift door'}`}</span>
      </span>`)}</span>`}
  </div>`;
}
