// Wedstrijdplan als één veld dat meebeweegt: veeg over het veld of sleep het oranje bolletje
// over de tijdlijn. Spelers glijden naar hun nieuwe plek; daaronder uitklapbaar het rooster per kind.
import { html, useState, useMemo, useRef, useEffect } from '../vendor/preact-htm.js';
import * as M from './match.js';
import { LINE_NAMES } from './planner.js';
import { Field, Icon, POS_COLORS, useDragSwap } from './ui.js';

const BENCH = '#DCE2EE';

export function changes(cards, i) {
  if (i === 0) return { in: [], out: [], shift: null };
  const c = cards[i], prev = cards[i - 1];
  return {
    in: Object.keys(c.pos).filter((id) => !(id in prev.pos)),
    out: Object.keys(prev.pos).filter((id) => !(id in c.pos)),
    shift: c.shift || null
  };
}

function useAnimatedF(initial, maxF) {
  const [f, setFState] = useState(initial);
  const fr = useRef(initial);
  const raf = useRef(0);
  const setF = (v, animate) => {
    const target = Math.max(0, Math.min(maxF(), v));
    cancelAnimationFrame(raf.current);
    if (!animate) { fr.current = target; setFState(target); return; }
    const from = fr.current;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 320);
      fr.current = from + (target - from) * (1 - Math.pow(1 - k, 3));
      setFState(fr.current);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  return [f, setF, () => fr.current];
}

// horizontaal vegen verandert f; pillen blijven sleepbaar als dat aan staat
function useScrub(ref, fns) {
  const cur = useRef(fns);
  cur.current = fns;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let st = null;
    const down = (e) => {
      if (cur.current.skipPills() && e.target.closest('[data-pid]')) return;
      st = { x: e.clientX, y: e.clientY, f0: cur.current.get(), active: false };
    };
    const move = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x;
      if (!st.active) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - st.y)) return;
        st.active = true;
      }
      e.preventDefault();
      cur.current.set(st.f0 - dx / 120, false);
    };
    const up = (e) => {
      if (!st) return;
      if (st.active) {
        const dx = e.clientX - st.x;
        let target = Math.round(cur.current.get());
        if (Math.abs(dx) > 30 && target === Math.round(st.f0)) target += dx < 0 ? 1 : -1;
        cur.current.set(target, true);
        el.dataset.justDragged = '1';
        setTimeout(() => { delete el.dataset.justDragged; }, 60);
      }
      st = null;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
}

export function PlanView({ match, team, editable = false, onSwap, initialIndex = 0, nowIndex = -1 }) {
  const nick = (id) => M.nickOf(team, id);
  const END = M.matchEnd(team);
  const L = M.periodLen(team);
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const maxF = () => cards.length - 1;
  const [f, setF, getF] = useAnimatedF(Math.min(initialIndex, cards.length - 1), maxF);
  const [roster, setRoster] = useState(false);
  const zone = useRef(null);
  const track = useRef(null);
  const i = Math.max(0, Math.min(cards.length - 1, Math.round(f)));
  const c = cards[i];
  const ch = changes(cards, i);
  const canEdit = editable && i === 0;
  useDragSwap(zone, canEdit, (a, b) => onSwap && onSwap(a, b));
  useScrub(zone, { get: getF, set: setF, skipPills: () => editable && Math.round(getF()) === 0 });

  const timeOf = (x) => {
    const k = Math.max(0, Math.min(cards.length - 1, Math.floor(x)));
    const a = cards[k].t, b = k + 1 < cards.length ? cards[k + 1].t : END;
    return a + (b - a) * Math.max(0, Math.min(1, x - k));
  };
  const fOfTime = (t) => {
    let k = 0;
    while (k + 1 < cards.length && cards[k + 1].t <= t) k++;
    const a = cards[k].t, b = k + 1 < cards.length ? cards[k + 1].t : END;
    return k + (b > a ? Math.min(1, (t - a) / (b - a)) : 0);
  };
  const label = (t) => {
    const p = Math.min(team.periods - 1, Math.floor(t / L));
    return M.periodLabel(team, p) + ' ' + M.fmt(t - p * L);
  };

  // slepen over de tijdlijn (en over het rooster)
  useEffect(() => {
    const els = [track.current, zone.current && zone.current.parentElement.querySelector('.rooster .grid')].filter(Boolean);
    let active = null;
    const at = (el, x) => {
      const r = (el.querySelector('.cells') || el).getBoundingClientRect();
      setF(fOfTime(Math.max(0, Math.min(1, (x - r.left) / r.width)) * END), false);
    };
    const downs = els.map((el) => { const h = (e) => { active = el; at(el, e.clientX); }; el.addEventListener('pointerdown', h); return [el, h]; });
    const move = (e) => { if (active) { e.preventDefault(); at(active, e.clientX); } };
    const up = () => { if (active) { active = null; setF(Math.round(getF()), true); } };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { downs.forEach(([el, h]) => el.removeEventListener('pointerdown', h)); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [cards, roster]);

  const swapNo = [];
  let n = 0;
  for (const cc of cards) swapNo.push(cc.kind === 'swap' ? ++n : 0);
  const title = c.kind === 'lineup' ? (c.period === 0 ? 'Start' : 'Opstelling ' + M.periodLabel(team, c.period)) : `Wissel ${swapNo[i]} van ${n}`;
  const t = timeOf(f);
  const pct = (t / END) * 100;
  const kids = match.present.filter((id) => id !== match.keeperId);
  const segs = cards.map((cc, k) => ({ a: cc.t, b: k + 1 < cards.length ? cards[k + 1].t : END, pos: cc.pos }));
  const status = i < nowIndex ? 'Gedaan' : i === nowIndex ? 'Nu' : nowIndex >= 0 ? 'Gepland' : null;

  return html`<div class="planview col" style="gap:10px">
    <div class="tl" ref=${track} aria-label="Tijdlijn">
      <span class="tl-line"></span>
      ${Array.from({ length: team.periods - 1 }, (_, p) => html`<span class="tl-break" style=${`left:${((p + 1) * L / END) * 100}%`}><b>${team.periods === 2 ? 'rust' : 'pauze'}</b></span>`)}
      ${cards.map((cc, k) => html`<span class=${'tl-dot' + (k < i ? ' past' : k === i ? ' cur' : '') + (cc.kind === 'lineup' ? ' lu' : '')} style=${`left:${(cc.t / END) * 100}%`}></span>`)}
      <span class="tl-head" style=${`left:${pct}%`}><span class="tl-time" style=${`transform:translateX(-${pct}%)`}>${label(t)}</span></span>
    </div>
    <div class="between">
      <button type="button" class="iconbtn" aria-label="Vorige" onClick=${() => setF(i - 1, true)} disabled=${i === 0}><span style="transform:rotate(180deg);display:inline-flex"><${Icon} name="chev" /></span></button>
      <div class="col" style="gap:0;align-items:center">
        <span class="h2">${title}</span>
        <span class="small">${label(c.t)}${status ? ' · ' + status : ''}</span>
      </div>
      <button type="button" class="iconbtn" aria-label="Volgende" onClick=${() => setF(i + 1, true)} disabled=${i === cards.length - 1}><${Icon} name="chev" /></button>
    </div>
    <div ref=${zone} class="scrubzone">
      <${Field} slots=${c.slots} lines=${team.lines} keeperId=${c.keeper || match.keeperId} nick=${nick} height=${'clamp(380px, 56dvh, 560px)'}
        onTap=${() => {}} neon=${ch.in} dashed=${ch.shift ? [ch.shift.id] : []} />
      <div class="benchrow">
        <span class="label">Bank</span>
        <div class="scroll">
          ${c.bench.map((id) => html`<button type="button" class=${'benchpill' + (ch.out.indexOf(id) !== -1 ? ' wasout' : '')} key=${id} data-pid=${id}>${nick(id)}${ch.out.indexOf(id) !== -1 ? html`<span class="t">eruit</span>` : ''}</button>`)}
          ${!c.bench.length && html`<span class="small">niemand</span>`}
        </div>
      </div>
    </div>
    ${i === 0
      ? html`<span class="sub">${editable ? 'Sleep een speler naar een andere plek of naar de bank om te ruilen. Het plan rekent meteen mee.' : 'Startopstelling.'}</span>`
      : c.kind === 'lineup'
        ? html`<span class="sub" style="color:var(--ink)"><span class="chg in">Erin: ${ch.in.map(nick).join(', ') || '—'}</span> <span class="chg out">Eruit: ${ch.out.map(nick).join(', ') || '—'}</span></span>`
        : html`<span class="sub" style="color:var(--ink)"><span class="chg in">↑ ${nick(c.in)}</span> erin voor <span class="chg out">↓ ${nick(c.out)}</span>${c.shift ? html`<br /><span class="chg sh">↔ ${nick(c.shift.id)}</span> schuift naar ${LINE_NAMES[c.shift.to]}` : ''}</span>`}
    <span class="small">Veeg over het veld of sleep het oranje bolletje.</span>

    <div class="rooster card" style="box-shadow:none;border:1px solid var(--line);gap:0;padding:0">
      <button type="button" class="between" style="background:none;border:none;min-height:48px;padding:0 12px;width:100%" aria-expanded=${roster ? 'true' : 'false'} onClick=${() => setRoster(!roster)}>
        <span class="h2" style="font-size:15px">Hele wedstrijd per kind</span>
        <span class=${'chev' + (roster ? ' open' : '')}><${Icon} name="chev" size=${18} /></span>
      </button>
      <div class=${'collapse' + (roster ? ' open' : '')}><div>
        <div class="grid table" style="padding:0 12px 12px;display:flex;flex-direction:column;gap:4px;touch-action:pan-y">
          ${kids.map((id) => html`<div class="r">
            <span class="n">${nick(id)}</span>
            <span class="cells" style="position:relative">
              ${segs.map((s) => html`<span style=${`flex:${Math.max(1, s.b - s.a)} 1 0;background:${s.pos[id] ? POS_COLORS[s.pos[id]] : BENCH}`}></span>`)}
              <i class="playline" style=${`left:${pct}%`}></i>
            </span>
            <span class="v num">${M.mins(segs.reduce((a, s) => a + (s.pos[id] ? s.b - s.a : 0), 0))}′</span>
          </div>`)}
          <div class="legend">
            <span><i style="background:var(--pos-A)"></i>Achter</span><span><i style="background:var(--pos-M)"></i>Midden</span>
            <span><i style="background:var(--pos-V)"></i>Voor</span><span><i style=${'background:' + BENCH}></i>Bank</span>
          </div>
        </div>
      </div></div>
    </div>
  </div>`;
}
