// Gedeelde bouwstenen voor de schermen.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';

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
let toastState = null;
const toastSubs = new Set();
let toastTimer = null;
export function toast(text, action) {
  toastState = { text, action, key: Date.now() };
  toastSubs.forEach((f) => f(toastState));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastState = null; toastSubs.forEach((f) => f(null)); }, action ? 5000 : 2600);
}
export function dismissToast() {
  if (!toastState) return;
  toastState = null;
  clearTimeout(toastTimer);
  toastSubs.forEach((f) => f(null));
}
export function ToastHost() {
  const [t, setT] = useState(toastState);
  useEffect(() => { toastSubs.add(setT); return () => toastSubs.delete(setT); }, []);
  if (!t) return null;
  return html`<div class="toast" role="status">
    <span>${t.text}</span>
    ${t.action && html`<button type="button" onClick=${() => { t.action.run(); toastState = null; setT(null); }}>${t.action.label}</button>`}
  </div>`;
}

// ---------- signaal bij een wisselmoment: piep + flits (+ trillen waar dat kan) ----------
let audio = null;
export function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { audio = null; }
}
export function beep(times = 1, freq = 880) {
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

export function Pill({ name, neon, kind = '', title }) {
  const p = html`<span class=${'pill ' + kind} title=${title || name}>${name}</span>`;
  return neon ? html`<${Neon}>${p}</${Neon}>` : p;
}

export function KeeperPill({ name }) {
  return html`<span class="pill keeper"><span class="k">K</span>${name}</span>`;
}

export function Switch({ on, onChange, label }) {
  return html`<button type="button" class="switch" role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${label} onClick=${() => onChange(!on)}></button>`;
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

export function Seg({ value, options, onChange, label, small }) {
  const i = options.findIndex(([v]) => v === value);
  return html`<div class=${'seg' + (small || options.length > 3 ? ' small' : '')} role="group" aria-label=${label} style=${`--n:${options.length};--i:${Math.max(0, i)}`}>
    ${i !== -1 && html`<span class="seg-ind" aria-hidden="true"></span>`}
    ${options.map(([v, l]) => html`<button type="button" aria-pressed=${value === v ? 'true' : 'false'} onClick=${() => onChange(v)}>${l}</button>`)}
  </div>`;
}

export function Stepper({ value, min = 0, max = 99, step = 1, onChange, suffix = '', label }) {
  return html`<div class="stepper" role="group" aria-label=${label}>
    <button type="button" aria-label="Minder" disabled=${value <= min} onClick=${() => onChange(Math.max(min, value - step))}>−</button>
    <span class="num">${value}${suffix}</span>
    <button type="button" aria-label="Meer" disabled=${value >= max} onClick=${() => onChange(Math.min(max, value + step))}>+</button>
  </div>`;
}

export function Sheet({ onClose, children, label }) {
  const [closing, setClosing] = useState(false);
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 220); };
  useEffect(() => { dismissToast(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class=${'sheet-backdrop' + (closing ? ' closing' : '')} onClick=${(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${label}>
      <span class="handle"></span>
      ${children}
    </div>
  </div>`;
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
    field: 'M4 4h16v16H4zM4 12h16M12 4v16',
    chart: 'M5 20V10M12 20V4M19 20v-7',
    team: 'M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6M3 20a6 6 0 0112 0M15 14a6 6 0 016 6',
    lock: 'M6 11h12v9H6zM9 11V8a3 3 0 016 0v3',
    x: 'M6 6l12 12M18 6L6 18',
    chev: 'M9 6l6 6-6 6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2'
  };
  const filled = name === 'play' || name === 'pause';
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill=${filled ? 'currentColor' : 'none'} stroke=${filled ? 'none' : 'currentColor'} stroke-width=${name === 'more' ? 3.6 : 2.2} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${paths[name]} /></svg>`;
}

// ---------- het veld ----------
// slots: { V0: id, M0: id, A0: id, ... }  aanval boven, eigen doel (keeper) onder
export function Field({ slots, lines, keeperId, nick, onTap, onKeeper, neon = [], dashed = [], muted = [], selected = null, sub, below, height = 330, compact = false }) {
  const rows = ['V', 'M', 'A'].filter((l) => (lines[l] || 0) > 0);
  const tops = { 3: ['5%', '30%', '56%'], 2: ['14%', '50%'], 1: ['40%'] }[rows.length] || [];
  const dense = Object.values(lines).some((n) => n >= 4);
  const pillKind = (id) => (dashed.indexOf(id) !== -1 ? 'dashed' : '') + (muted.indexOf(id) !== -1 ? ' muted' : '') + (selected === id ? ' orange' : '');
  const pillStyle = dense || compact ? 'max-width:74px;font-size:12px;padding:5px 8px' : '';
  const spot = (id, left, top, key) => {
    const name = id ? nick(id) : '—';
    const isNeon = id && neon.indexOf(id) !== -1;
    const pill = html`<span class=${'pill ' + pillKind(id)} style=${pillStyle}>${name}</span>`;
    return html`<button type="button" class="spot" key=${id || key} data-pid=${id || ''} style=${`left:${left};top:${top}`} disabled=${!onTap || !id} onClick=${() => onTap && id && onTap(id)} aria-label=${name}>
      ${isNeon ? html`<${Neon}>${pill}</${Neon}>` : pill}
      ${sub && id && sub(id) ? html`<span class="time">${sub(id)}</span>` : null}
      ${below && id ? below(id) : null}
    </button>`;
  };
  return html`<div class="field" style=${`height:${typeof height === 'number' ? height + 'px' : height}`}>
    <span class="lines"></span>
    <span class="arc top"></span>
    <span class="arc bottom"></span>
    ${rows.flatMap((l, r) => {
      const n = lines[l];
      return Array.from({ length: n }, (_, i) => spot(slots[l + i], `${((i + 1) / (n + 1)) * 100}%`, tops[r], l + i));
    })}
    ${keeperId && html`<button type="button" class="spot keeperspot" key=${'k' + keeperId} style="left:50%;bottom:16px;top:auto" disabled=${!onKeeper} onClick=${() => onKeeper && onKeeper(keeperId)} aria-label=${'Keeper ' + nick(keeperId)}><${KeeperPill} name=${nick(keeperId)} /></button>`}
  </div>`;
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
export function useDragSwap(ref, enabled, onSwap) {
  const cb = useRef(onSwap);
  cb.current = onSwap;
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return undefined;
    root.classList.add('draggable');
    let st = null;
    const down = (e) => {
      const el = e.target.closest('[data-pid]');
      if (!el || !el.dataset.pid || !root.contains(el)) return;
      st = { id: el.dataset.pid, x: e.clientX, y: e.clientY, el, ghost: null, over: null };
    };
    const move = (e) => {
      if (!st) return;
      if (!st.ghost) {
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 8) return;
        const src = st.el.querySelector('.pill') || st.el;
        const g = src.cloneNode(true);
        g.classList.add('drag-ghost');
        document.body.appendChild(g);
        st.ghost = g;
        st.el.classList.add('drag-src');
      }
      e.preventDefault();
      st.ghost.style.left = e.clientX + 'px';
      st.ghost.style.top = e.clientY + 'px';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const t = under && under.closest('[data-pid]');
      const over = t && root.contains(t) && t.dataset.pid && t.dataset.pid !== st.id ? t : null;
      if (over !== st.over) {
        if (st.over) st.over.classList.remove('drop-target');
        if (over) over.classList.add('drop-target');
        st.over = over;
      }
    };
    const up = () => {
      if (!st) return;
      if (st.ghost) {
        st.ghost.remove();
        st.el.classList.remove('drag-src');
        if (st.over) { st.over.classList.remove('drop-target'); cb.current(st.id, st.over.dataset.pid); }
        root.dataset.justDragged = '1';
        setTimeout(() => { delete root.dataset.justDragged; }, 60);
      }
      st = null;
    };
    // iPhone: tijdens slepen nooit de pagina laten scrollen
    const noScroll = (e) => { if (st) e.preventDefault(); };
    root.addEventListener('touchmove', noScroll, { passive: false });
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      root.removeEventListener('touchmove', noScroll);
      root.classList.remove('draggable');
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled]);
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

export function OppBadge({ name, size = 64 }) {
  const short = (name || '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
  return html`<svg width=${size} height=${size} viewBox="0 0 64 64" role="img" aria-label=${name || 'Tegenstander'}>
    <path d="M32 3 L57 12 V30 C57 45 46 56 32 61 C18 56 7 45 7 30 V12 Z" fill="#6B7280" />
    <path d="M32 9 L51 16 V30 C51 42 43 51 32 55 C21 51 13 42 13 30 V16 Z" fill="#9CA3AF" />
    <text x="32" y="39" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="18" fill="#fff">${short}</text>
  </svg>`;
}
