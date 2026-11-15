// Testpagina: drie manieren om de startopstelling te zetten en door het wisselplan te vegen.
// Gebruikt de echte rekenregels en jouw spelers (alleen lezen; er wordt niets opgeslagen).
import { html, render, useState, useMemo, useRef, useEffect } from '../vendor/preact-htm.js';
import { getState, activeTeam } from '../js/store.js';
import * as M from '../js/match.js';
import { LINE_NAMES } from '../js/planner.js';
import { Field, Seg, Icon, ToastHost, toast, POS_COLORS } from '../js/ui.js';

const team = activeTeam(getState());
const nick = (id) => M.nickOf(team, id);
const END = M.matchEnd(team);
const L = M.periodLen(team);

function pickKeeper(ids) {
  const pool = team.players.filter((p) => ids.indexOf(p.id) !== -1);
  const k = pool.find((p) => p.main === 'K') || pool.find((p) => (p.prefs || []).indexOf('K') !== -1) || pool.slice().sort((a, b) => a.kracht - b.kracht)[0];
  return k ? k.id : null;
}

function buildMatch() {
  const present = team.players.filter((p) => p.active !== false).map((p) => p.id);
  return M.createMatch(team, { present, keeperId: team.keeper ? pickKeeper(present) : null, priority: team.rules.priority });
}

// wat verandert er op kaart i t.o.v. de vorige?
function changes(cards, i) {
  const c = cards[i];
  if (i === 0) return { in: [], out: [], shift: null };
  const prev = cards[i - 1];
  return {
    in: Object.keys(c.pos).filter((id) => !(id in prev.pos)),
    out: Object.keys(prev.pos).filter((id) => !(id in c.pos)),
    shift: c.shift || null
  };
}

const timeOf = (cards, f) => {
  const i = Math.max(0, Math.min(cards.length - 1, Math.floor(f)));
  const a = cards[i].t;
  const b = i + 1 < cards.length ? cards[i + 1].t : END;
  return a + (b - a) * Math.max(0, Math.min(1, f - i));
};
const fOfTime = (cards, t) => {
  let i = 0;
  while (i + 1 < cards.length && cards[i + 1].t <= t) i++;
  const a = cards[i].t;
  const b = i + 1 < cards.length ? cards[i + 1].t : END;
  return i + (b > a ? Math.min(1, (t - a) / (b - a)) : 0);
};
const clockLabel = (t) => {
  const p = Math.min(team.periods - 1, Math.floor(t / L));
  return M.periodLabel(team, p) + ' ' + M.fmt(t - p * L);
};
const titleOf = (cards, i, swapNo) => {
  const c = cards[i];
  if (c.kind === 'lineup') return c.period === 0 ? 'Start' : 'Opstelling ' + M.periodLabel(team, c.period);
  return `Wissel ${swapNo[i]} van ${swapNo.total}`;
};

// ---------- slepen om te ruilen (vinger of muis) ----------
function useDragSwap(ref, enabled, onSwap) {
  const cb = useRef(onSwap);
  cb.current = onSwap;
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return undefined;
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
        setTimeout(() => { delete root.dataset.justDragged; }, 50);
      }
      st = null;
    };
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled]);
}

// tik-tik ruilen als alternatief voor slepen
function useTapSwap(onSwap) {
  const [sel, setSel] = useState(null);
  const tap = (id) => {
    if (!sel) setSel(id);
    else if (sel === id) setSel(null);
    else { onSwap(sel, id); setSel(null); }
  };
  return [sel, tap, () => setSel(null)];
}

// ---------- veeg-gebaar: horizontaal schuiven verandert f ----------
function useScrub(ref, { get, set, perPx, skipPills }) {
  const fns = useRef({ get, set });
  fns.current = { get, set };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let st = null;
    const down = (e) => {
      if (skipPills() && e.target.closest('[data-pid]')) return;
      st = { x: e.clientX, y: e.clientY, f0: fns.current.get(), active: false };
    };
    const move = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x;
      if (!st.active) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - st.y)) return;
        st.active = true;
      }
      e.preventDefault();
      fns.current.set(st.f0 - dx * perPx(), false);
    };
    const up = (e) => {
      if (!st) return;
      if (st.active) {
        const f = fns.current.get();
        const dx = e.clientX - st.x;
        let target = Math.round(f);
        if (Math.abs(dx) > 30 && target === Math.round(st.f0)) target += dx < 0 ? 1 : -1;
        fns.current.set(target, true);
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

// vloeiend naar een doel-f bewegen
function useAnimatedF(max) {
  const [f, setFState] = useState(0);
  const fr = useRef(0);
  const raf = useRef(0);
  const setF = (v, animate) => {
    const target = Math.max(0, Math.min(max(), v));
    cancelAnimationFrame(raf.current);
    if (!animate) { fr.current = target; setFState(target); return; }
    const from = fr.current;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 320);
      const e = 1 - Math.pow(1 - k, 3);
      fr.current = from + (target - from) * e;
      setFState(fr.current);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  return [f, setF, () => fr.current];
}

// ---------- tijdlijn met bolletjes en oranje afspeelpunt ----------
function Timeline({ cards, f, onSeek }) {
  const ref = useRef(null);
  const fRef = useRef(f);
  fRef.current = f;
  const t = timeOf(cards, f);
  const i = Math.round(f);
  const seekAt = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(fOfTime(cards, x * END), false);
  };
  useEffect(() => {
    const el = ref.current;
    let active = false;
    const down = (e) => { active = true; seekAt(e.clientX); };
    const move = (e) => { if (active) { e.preventDefault(); seekAt(e.clientX); } };
    const up = () => { if (active) { active = false; onSeek(Math.round(fRef.current), true); } };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [cards]);
  return html`<div class="tl" ref=${ref}>
    <span class="tl-line"></span>
    ${Array.from({ length: team.periods - 1 }, (_, p) => html`<span class="tl-break" style=${`left:${((p + 1) * L / END) * 100}%`}><b>rust</b></span>`)}
    ${cards.map((c, k) => html`<span class=${'tl-dot' + (k < i ? ' past' : k === i ? ' cur' : '') + (c.kind === 'lineup' ? ' lu' : '')} style=${`left:${(c.t / END) * 100}%`}></span>`)}
    <span class="tl-head" style=${`left:${(t / END) * 100}%`}><span class="tl-time" style=${`transform:translateX(-${(t / END) * 100}%)`}>${clockLabel(t)}</span></span>
  </div>`;
}

function Summary({ match, cards }) {
  const swaps = cards.filter((c) => c.kind === 'swap').length;
  const fair = match.plan.fair;
  const every = swaps ? Math.round((END / (swaps + team.periods)) / 30) / 2 : 0;
  return html`<div class="small" style="color:var(--ink);font-weight:700">
    ${swaps} wissels · ~elke ${String(every).replace('.', ',')} min · ${M.mins(fair.minPlayed)}–${M.mins(fair.maxPlayed)} min per kind · ${fair.minTurns === fair.maxTurns ? `iedereen ${fair.minTurns}×` : `${fair.minTurns}–${fair.maxTurns}×`}
  </div>`;
}

function ChangeText({ cards, i }) {
  const ch = changes(cards, i);
  const c = cards[i];
  if (i === 0) return html`<span class="sub">Sleep een speler naar een andere plek of naar de bank om te ruilen. Het plan rekent meteen mee.</span>`;
  if (c.kind === 'lineup') return html`<span class="sub" style="color:var(--ink)"><b>Erin:</b> ${ch.in.map(nick).join(', ') || '—'} · <b>Eruit:</b> ${ch.out.map(nick).join(', ') || '—'}</span>`;
  return html`<span class="sub" style="color:var(--ink)">
    <span class="chg in">↑ ${nick(c.in)}</span> erin voor <span class="chg out">↓ ${nick(c.out)}</span>
    ${c.shift ? html`<br /><span class="chg sh">↔ ${nick(c.shift.id)}</span> schuift naar ${LINE_NAMES[c.shift.to]}` : ''}
  </span>`;
}

function BenchRow({ ids, outIds = [], inIds = [], label = 'Bank' }) {
  return html`<div class="benchrow">
    <span class="label">${label}</span>
    <div class="scroll">
      ${ids.map((id) => html`<button type="button" class=${'benchpill' + (outIds.indexOf(id) !== -1 ? ' wasout' : '')} key=${id} data-pid=${id}>${nick(id)}${outIds.indexOf(id) !== -1 ? html`<span class="t">eruit</span>` : ''}</button>`)}
      ${!ids.length && html`<span class="small">niemand</span>`}
    </div>
  </div>`;
}

// ================= Optie A: één veld, veeg door de tijd =================
function OptionA({ match, cards, onSwap, swapNo }) {
  const wrap = useRef(null);
  const [f, setF, getF] = useAnimatedF(() => cards.length - 1);
  const i = Math.max(0, Math.min(cards.length - 1, Math.round(f)));
  const c = cards[i];
  const ch = changes(cards, i);
  const editable = i === 0;
  const [sel, tap] = useTapSwap(onSwap);
  useDragSwap(wrap, editable, onSwap);
  useScrub(wrap, { get: getF, set: setF, perPx: () => 1 / 120, skipPills: () => Math.round(getF()) === 0 });
  return html`<div class="col" style="gap:10px">
    <${Timeline} cards=${cards} f=${f} onSeek=${setF} />
    <div class="between">
      <button type="button" class="iconbtn" aria-label="Vorige" onClick=${() => setF(i - 1, true)} disabled=${i === 0}><span style="transform:rotate(180deg);display:inline-flex"><${Icon} name="chev" /></span></button>
      <div class="col" style="gap:0;align-items:center"><span class="h2">${titleOf(cards, i, swapNo)}</span><span class="small">${clockLabel(c.t)}</span></div>
      <button type="button" class="iconbtn" aria-label="Volgende" onClick=${() => setF(i + 1, true)} disabled=${i === cards.length - 1}><${Icon} name="chev" /></button>
    </div>
    <div ref=${wrap} class=${'scrubzone' + (editable ? ' draggable' : '')}>
      <${Field} slots=${c.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${330}
        onTap=${(id) => { if (editable && !wrap.current.dataset.justDragged) tap(id); }} selected=${editable ? sel : null}
        neon=${ch.in} dashed=${ch.shift ? [ch.shift.id] : []} />
      <${BenchRow} ids=${c.bench} outIds=${ch.out} />
    </div>
    <${ChangeText} cards=${cards} i=${i} />
    <span class="small">Veeg over het veld of sleep het oranje bolletje. ${editable ? '' : 'Ruilen kan bij Start.'}</span>
  </div>`;
}

// ================= Optie B: kaarten per moment =================
function OptionB({ match, cards, onSwap, swapNo }) {
  const strip = useRef(null);
  const first = useRef(null);
  const [f, setFState] = useState(0);
  useDragSwap(first, true, onSwap);
  const stepPx = () => {
    const el = strip.current;
    if (!el || el.children.length < 2) return 1;
    return el.children[1].offsetLeft - el.children[0].offsetLeft;
  };
  const onScroll = () => setFState(strip.current.scrollLeft / stepPx());
  const seek = (v, animate) => {
    const el = strip.current;
    el.scrollTo({ left: Math.max(0, v) * stepPx(), behavior: animate === false ? 'auto' : 'smooth' });
  };
  return html`<div class="col" style="gap:10px">
    <${Timeline} cards=${cards} f=${f} onSeek=${(v, end) => seek(end ? Math.round(v) : v, end)} />
    <div class="strip" ref=${strip} onScroll=${onScroll}>
      ${cards.map((c, k) => {
        const ch = changes(cards, k);
        const below = (id) => {
          if (ch.in.indexOf(id) !== -1 && c.kind === 'swap') return html`<span class="inpill" style="opacity:.8;text-decoration:line-through">${nick(c.out)}</span>`;
          if (ch.shift && id === ch.shift.id) return html`<span class="note">→ ${LINE_NAMES[ch.shift.to]}</span>`;
          return null;
        };
        return html`<article class=${'card plancard' + (k === Math.round(f) ? ' now' : ' future')} key=${k} ref=${k === 0 ? first : null}>
          <div class="between"><span class="h2">${titleOf(cards, k, swapNo)}</span><span class="small">${clockLabel(c.t)}</span></div>
          <div class=${k === 0 ? 'draggable' : ''}>
            <${Field} slots=${c.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${300} compact
              onTap=${() => {}} neon=${ch.in} dashed=${ch.shift ? [ch.shift.id] : []} below=${below} />
            <${BenchRow} ids=${c.bench} outIds=${ch.out} />
          </div>
          <${ChangeText} cards=${cards} i=${k} />
        </article>`;
      })}
    </div>
    <span class="small">Veeg de kaarten opzij of sleep het oranje bolletje. Op de Start-kaart kun je spelers slepen.</span>
  </div>`;
}

// ================= Optie C: rooster + veld =================
function OptionC({ match, cards, onSwap, swapNo }) {
  const grid = useRef(null);
  const fieldWrap = useRef(null);
  const [f, setF, getF] = useAnimatedF(() => cards.length - 1);
  const i = Math.max(0, Math.min(cards.length - 1, Math.round(f)));
  const c = cards[i];
  const ch = changes(cards, i);
  const editable = i === 0;
  useDragSwap(fieldWrap, editable, onSwap);
  useScrub(fieldWrap, { get: getF, set: setF, perPx: () => 1 / 120, skipPills: () => Math.round(getF()) === 0 });
  // slepen over het rooster = tijd kiezen
  useEffect(() => {
    const el = grid.current;
    let active = false;
    const at = (x) => {
      const r = el.querySelector('.cells').getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
      setF(fOfTime(cards, p * END), false);
    };
    const down = (e) => { active = true; at(e.clientX); };
    const move = (e) => { if (active) { e.preventDefault(); at(e.clientX); } };
    const up = () => { if (active) { active = false; setF(Math.floor(getF() + 0.0001), true); } };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [cards]);
  const kids = match.present.filter((id) => id !== match.keeperId);
  const t = timeOf(cards, f);
  const segs = cards.map((cc, k) => ({ a: cc.t, b: k + 1 < cards.length ? cards[k + 1].t : END, pos: cc.pos }));
  return html`<div class="col" style="gap:10px">
    <div class="between">
      <div class="col" style="gap:0"><span class="h2">${titleOf(cards, i, swapNo)}</span><span class="small">${clockLabel(c.t)}</span></div>
      <div class="row">
        <button type="button" class="iconbtn" aria-label="Vorige" onClick=${() => setF(i - 1, true)} disabled=${i === 0}><span style="transform:rotate(180deg);display:inline-flex"><${Icon} name="chev" /></span></button>
        <button type="button" class="iconbtn" aria-label="Volgende" onClick=${() => setF(i + 1, true)} disabled=${i === cards.length - 1}><${Icon} name="chev" /></button>
      </div>
    </div>
    <div ref=${fieldWrap} class=${'scrubzone' + (editable ? ' draggable' : '')}>
      <${Field} slots=${c.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${280} compact
        onTap=${() => {}} neon=${ch.in} dashed=${ch.shift ? [ch.shift.id] : []} />
      <${BenchRow} ids=${c.bench} outIds=${ch.out} />
    </div>
    <${ChangeText} cards=${cards} i=${i} />
    <div class="card table rooster" ref=${grid} style="gap:4px;touch-action:pan-y">
      <div class="r"><span class="n"></span><span class="cells axis" style="position:relative;height:18px">
        ${cards.map((cc) => html`<i class=${'tl-dot small' + (cc.kind === 'lineup' ? ' lu' : '')} style=${`left:${(cc.t / END) * 100}%`}></i>`)}
        <i class="tl-head small" style=${`left:${(t / END) * 100}%`}></i>
      </span><span class="v"></span></div>
      ${kids.map((id) => html`<div class="r">
        <span class="n">${nick(id)}</span>
        <span class="cells" style="position:relative">
          ${segs.map((s) => html`<span style=${`flex:${Math.max(1, s.b - s.a)} 1 0;background:${s.pos[id] ? POS_COLORS[s.pos[id]] : '#DCE2EE'}`}></span>`)}
          <i class="playline" style=${`left:${(t / END) * 100}%`}></i>
        </span>
        <span class="v num">${M.mins(segs.reduce((a, s) => a + (s.pos[id] ? s.b - s.a : 0), 0))}′</span>
      </div>`)}
      <span class="small">Sleep over het rooster om door de wedstrijd te gaan, of veeg over het veld.</span>
    </div>
  </div>`;
}

function App() {
  const [opt, setOpt] = useState('A');
  const [match, setMatch] = useState(buildMatch);
  const cards = useMemo(() => M.timeline(match, team).cards, [match]);
  const swapNo = useMemo(() => { const arr = []; let n = 0; for (const c of cards) arr.push(c.kind === 'swap' ? ++n : 0); arr.total = n; return arr; }, [cards]);
  const onSwap = (a, b) => {
    const copy = JSON.parse(JSON.stringify(match));
    M.swapInStartLineup(copy, team, a, b);
    setMatch(copy);
    toast(`${nick(a)} ↔ ${nick(b)} · plan opnieuw berekend`);
  };
  const props = { match, cards, onSwap, swapNo };
  return html`<main class="screen">
    <div class="topbar"><a class="iconbtn" href="../" aria-label="Naar de app"><${Icon} name="back" /></a><span class="h2">Opstelling en plan – opties</span><span style="width:44px"></span></div>
    <${Seg} label="Optie" value=${opt} onChange=${setOpt} options=${[['A', 'A · Eén veld'], ['B', 'B · Kaarten'], ['C', 'C · Rooster']]} />
    <span class="sub">${opt === 'A' ? 'Eén veld dat meebeweegt: spelers glijden naar hun nieuwe plek als je door de tijd veegt.' : opt === 'B' ? 'Elk wisselmoment is een kaart met het veld. Veeg kaart voor kaart door het plan.' : 'Veld bovenin, daaronder per kind de hele wedstrijd. Sleep over het rooster om door de tijd te gaan.'}</span>
    <section class="card" style="gap:10px">
      <div class="between"><span class="label">${team.name} · ${team.lines.A}-${team.lines.M}-${team.lines.V}${team.keeper ? ' + keeper' : ''}</span><button type="button" class="link" onClick=${() => setMatch(buildMatch())}>Herstel</button></div>
      <${Summary} match=${match} cards=${cards} />
      ${opt === 'A' ? html`<${OptionA} key=${'A'} ...${props} />` : opt === 'B' ? html`<${OptionB} key=${'B'} ...${props} />` : html`<${OptionC} key=${'C'} ...${props} />`}
    </section>
  </main>
  <${ToastHost} />`;
}

render(html`<${App} />`, document.getElementById('app'));
