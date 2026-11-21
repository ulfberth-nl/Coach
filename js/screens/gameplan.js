// Game plan: de coach legt de wisselpuzzel zelf op een liniebord. Rijen zijn de linies (voor, midden, achter)
// en de bank, kolommen de blokken van een periode. Vier stappen: Opzet → Startopstelling → Wissels → Controle.
// Alleen de planning: tijdens de wedstrijd voert het live-scherm het plan precies zo uit.
import { html, useMemo, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as M from '../match.js';
import { fitOf } from '../ownplanner.js';
import { Icon, Sheet, toast, go } from '../ui.js';
import { haptic, reduced } from '../motion.js';
import { mutate } from './live.js';
import { NextBar, MiniScore } from './plan.js';

const STEPS = [['opzet', 'Opzet'], ['start', 'Start'], ['wissels', 'Wissels'], ['controle', 'Controle']];
const KEYS = STEPS.map((s) => s[0]);
const TITLE = { opzet: 'Opzet', start: 'Startopstelling', wissels: 'Wissels per blok', controle: 'Controle' };
const LNAME = { A: 'achter', M: 'midden', V: 'voor' };
const LCAP = { V: 'Voor', M: 'Midden', A: 'Achter', B: 'Bank' };
const mins = (s) => Math.round(s / 60);
const halfMin = (s) => String(Math.round(s / 30) / 2).replace('.5', '½').replace('.', ',');
// even laten zien dat de app 'denkt' (en de telefoon de tijd geven om te tekenen), dan rekenen
const think = (fn, ms = 380) => new Promise((res) => setTimeout(() => res(fn()), reduced() ? 0 : ms));
const snap = (gp) => JSON.parse(JSON.stringify(gp));
const restore = (prev) => ({ label: 'Ongedaan', run: () => mutate((m, t) => { m.gameplan = prev; M.gpSync(m, t); }) });

// Liggend en breed genoeg: het hele bord in één keer.
function useWide() {
  const q = '(orientation: landscape) and (min-width: 600px)';
  const mq = typeof matchMedia === 'function' ? matchMedia(q) : null;
  const [w, setW] = useState(() => !!(mq && mq.matches));
  useEffect(() => {
    if (!mq) return undefined;
    const f = () => setW(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', f) : mq.removeListener(f));
  }, []);
  return w;
}

export function GamePlan({ match, team }) {
  const live = match.started && !match.finished;
  const gp = match.gameplan;
  const saved = match.ownSteps && match.ownSteps.at;
  const [at, setAt] = useState(live ? 'wissels' : KEYS.indexOf(saved) !== -1 ? saved : gp && gp.base ? 'wissels' : 'opzet');
  const [dir, setDir] = useState(1);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [begin, setBegin] = useState('leeg');
  const wide = useWide();
  const idx = KEYS.indexOf(at);
  const done = (match.ownSteps && match.ownSteps.done) || {};
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const board = at === 'start' || at === 'wissels';
  // liggend: het hele bord, de app mag dan breder dan een telefoonkolom
  useEffect(() => {
    document.documentElement.classList.toggle('gp-wide', wide && board);
    return () => document.documentElement.classList.remove('gp-wide');
  }, [wide, board]);
  const goTo = (key, b = null, mark = null) => {
    setDir(KEYS.indexOf(key) >= idx ? 1 : -1);
    setAt(key);
    setFocus(b);
    mutate((m) => { const d = (m.ownSteps && m.ownSteps.done) || {}; m.ownSteps = { done: { ...d, ...(mark ? { [mark]: true } : {}) }, at: key }; });
    haptic('select');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
  };
  // Opzet → beginnen: leeg (naar de startopstelling) of met een voorzet van de app (naar de wissels)
  const startBoard = async (n) => {
    if (gp && gp.base) { goTo('start', null, 'opzet'); return; }
    if (begin === 'voorzet') {
      setBusy(true);
      await think(() => mutate((m, t) => { M.gpEnsure(m, t, n); M.gpFill(m, t); }));
      setBusy(false);
      haptic('success');
      toast('Voorzet staat klaar. Pas aan wat je wilt.');
      mutate((m) => { m.ownSteps = { done: { opzet: true, start: true }, at: 'wissels' }; });
      setDir(1); setAt('wissels'); setFocus(null);
      return;
    }
    mutate((m, t) => { M.gpEnsure(m, t, n); M.gpSync(m, t); });
    goTo('start', null, 'opzet');
  };
  const [pickN, setPickN] = useState(null);
  const next = () => {
    if (at === 'opzet') return startBoard(gp ? gp.n : pickN || 4);
    if (at === 'controle') { mutate((m) => { m.ownSteps = { done: { ...done, controle: true }, at: 'controle' }; }); haptic('success'); go('/'); return undefined; }
    goTo(KEYS[idx + 1], null, at);
    return undefined;
  };
  const prev = () => { if (idx > 0) goTo(KEYS[idx - 1]); };
  const nextLabel = at === 'opzet'
    ? (gp && gp.base ? 'Startopstelling' : begin === 'voorzet' ? 'Maak de voorzet' : 'Startopstelling')
    : at === 'controle' ? null : TITLE[KEYS[idx + 1]];

  let body;
  if (live && !gp) body = html`<section class="card gp-empty"><b>Er is geen game plan gemaakt</b><span class="sub">De wissels volgen wat er live gebeurt.</span></section>`;
  else if (at === 'opzet') body = html`<${Opzet} match=${match} team=${team} begin=${begin} setBegin=${setBegin} pickN=${pickN} setPickN=${setPickN} />`;
  else if (at === 'controle') body = html`<${Controle} match=${match} team=${team} goTo=${(b) => goTo('wissels', b)} />`;
  else if (!gp) body = html`<section class="card gp-empty"><b>Eerst de opzet</b><span class="sub">Kies hoe je speelt en hoeveel blokken per periode.</span><button type="button" class="btn primary" onClick=${() => goTo('opzet')}>Naar de opzet</button></section>`;
  else body = html`<${Board} match=${match} team=${team} mode=${at} wide=${wide} readOnly=${live || match.finished} focus=${focus} key=${at + (focus == null ? '' : ':' + focus)}
    toStart=${() => goTo('start')} />`;

  const steps = !live && html`<nav class="gp-steps" aria-label="Stappen van het game plan">
    ${STEPS.map(([k, label], i) => html`<button type="button" key=${k} class=${'gs' + (i < idx || done[k] ? ' done' : '') + (k === at ? ' cur' : '')}
      aria-current=${k === at ? 'step' : null} onClick=${() => k !== at && goTo(k)}>
      <span class="gs-n">${(i < idx || done[k]) && k !== at ? html`<${Icon} name="check" size=${13} />` : i + 1}</span><span class="gs-l">${label}</span>
    </button>${i < STEPS.length - 1 && html`<i class=${'gs-bar' + (i < idx ? ' on' : '')} aria-hidden="true"></i>`}`)}
  </nav>`;
  const nextBtn = (small) => html`<button type="button" class=${'btn primary ' + (small ? 'gp-hnext' : 'grow gp-next')} onClick=${next} disabled=${busy} key=${'n' + at}>
    ${busy ? html`<span>Denkt vooruit…</span>` : nextLabel ? html`<span class="rn-txt"><small>${at === 'opzet' && !(gp && gp.base) && begin === 'voorzet' ? 'Begin' : 'Volgende'}</small><span>${nextLabel}</span></span><${Icon} name="chev" size=${18} />` : html`<span>Klaar</span><${Icon} name="check" size=${18} />`}
  </button>`;

  return html`<main class=${'screen planner gplan' + (live ? ' is-live' : '') + (wide && board ? ' wide' : '')}>
    <div class="topbar plbar">
      <a class="iconbtn" href="#/" aria-label="Terug naar de wedstrijd"><${Icon} name="back" /></a>
      <span class="h2 grow">Game plan</span>
      ${wide && board && steps}
      ${wide && board && !live && nextBtn(true)}
      <${MiniScore} match=${match} team=${team} />
    </div>
    ${!(wide && board) && steps}
    ${live && gp && html`<p class="gp-livenote">Dit is je plan. Wisselen doe je in het live-scherm; daar volgt <b>Wissel nu</b> dit plan precies.</p>`}
    <div class=${'gp-step ' + (dir > 0 ? 'fwd' : 'back')} key=${at}>${body}</div>
    ${!live && !(wide && board) && html`<div class="rt-foot">
      ${idx > 0 ? html`<button type="button" class="btn plain" onClick=${prev}>Vorige</button>` : html`<a class="btn plain" href="#/">Later</a>`}
      ${nextBtn(false)}
    </div>`}
    ${live && html`<${NextBar} match=${match} team=${team} cards=${cards} />`}
  </main>`;
}

// ---------- slimme laag (de app denkt mee): herkenbaar aan het sterretje ----------
function AiMark({ size = 18 }) {
  return html`<span class="ai-mark" aria-hidden="true"><${Icon} name="spark" size=${size} /></span>`;
}

// ---------- stap 1: opzet ----------
const STYLES = {
  sterk: { title: 'Sterkste opstelling', tag: 'Oudere teams', icon: 'shield',
    text: 'Iedereen zoveel mogelijk in zijn kracht: op zijn dominante plek, anders op een voorkeursplek. Uit positie spelen valt op het bord oranje op.' },
  balans: { title: 'Gebalanceerd', tag: 'Jongere teams', icon: 'team',
    text: 'Eerlijke speeltijd gaat voor, en afwisselen van plek mag: dat is ook ontwikkeling. Uit positie spelen staat er rustig grijs bij.' }
};

function Opzet({ match, team, begin, setBegin, pickN, setPickN }) {
  const gp = match.gameplan;
  const style = M.planStyle(match, team);
  const info = M.squadInfo(match, team);
  const L = M.periodLen(team);
  const [rec, setRec] = useState(null);
  const sig = style + '|' + JSON.stringify(match.lines || null) + '|' + match.keeperId + '|' + info.n;
  // vooruit rekenen gebeurt na het tekenen; tot dan glinsteren de keuzes
  useEffect(() => { setRec(null); const id = setTimeout(() => setRec(M.gpRecommend(match, team, style)), reduced() ? 0 : 140); return () => clearTimeout(id); }, [sig]);
  const n = gp ? gp.n : pickN || (rec && rec.recommended) || 4;
  const setStyle = (s) => { haptic('select'); mutate((m) => { m.planStyle = s; }); };
  const setN = (v) => {
    haptic('select');
    if (gp) mutate((m, t) => { M.gpEnsure(m, t, v); M.gpSync(m, t); });
    else setPickN(v);
  };
  const r = M.effRules(match, team);
  const maxB = r.maxBenchOn ? r.maxBench : null;
  const o = rec && rec.opts.find((x) => x.n === n);
  const blocks = M.gpBlocks(match, team, n).filter((b) => b.p === 0);
  const st = gp && gp.base ? M.gpStats(match, team) : null;
  const full = st ? st.blocks.filter((b) => b.ok).length : 0;
  const pw = M.periodWord(team);
  const startOver = () => {
    const prev = snap(gp);
    mutate((m, t) => M.gpClear(m, t));
    setBegin('leeg');
    toast('Het bord is leeg', restore(prev));
  };
  return html`<section class="rt-intro">
    <h1 class="rt-h">Opzet</h1>
    <p class="rt-sub">Drie keuzes. Daarna leg je de puzzel: eerst de startopstelling, dan de wissels per blok.</p>
    <div class="rt-ctx">
      <span class="chip num"><${Icon} name="clock" size=${15} />${team.periods} × ${Math.round(L / 60)} min</span>
      <span class="chip num">${info.n} veldspelers · ${info.F} op het veld · ${info.bench} op de bank</span>
    </div>
  </section>

  <section class="card rt-q" style="--q:0">
    <span class="rt-qn"><b>1</b>Hoe wil je spelen?</span>
    ${['sterk', 'balans'].map((s, i) => html`<button type="button" key=${s} class=${'rt-choice' + (style === s ? ' on' : '')} style=${'--i:' + i} aria-pressed=${style === s ? 'true' : 'false'} onClick=${() => setStyle(s)}>
      <span class="rc-ico"><${Icon} name=${STYLES[s].icon} size=${22} /></span>
      <span class="rc-body">
        <span class="rc-top"><b>${STYLES[s].title}</b><span class="rc-tag">${STYLES[s].tag}</span></span>
        <span class="rc-more"><span>${STYLES[s].text}</span></span>
      </span>
      <span class="rc-check" aria-hidden="true"><${Icon} name="check" size=${16} /></span>
    </button>`)}
  </section>

  <section class="card rt-q" style="--q:1">
    <span class="rt-qn"><b>2</b>In hoeveel blokken deel je een ${pw}?</span>
    <p class="rt-note">Gelijke blokken. Tussen twee blokken kun je wisselen; de rust is een gratis wisselmoment.</p>
    <div class="gp-ns" role="radiogroup" aria-label="Blokken per periode">
      ${M.GP_SIZES.map((v) => html`<button type="button" key=${v} role="radio" aria-checked=${n === v ? 'true' : 'false'} class=${'gp-n' + (n === v ? ' on' : '') + (rec && rec.recommended === v ? ' rec' : '')} onClick=${() => setN(v)}>
        <b class="num">${v}</b><small>${rec && rec.recommended === v ? html`<${AiMark} size=${11} />advies` : halfMin(L / v) + ' min'}</small>
      </button>`)}
    </div>
    <div class="gp-ruler" aria-hidden="true">
      ${blocks.map((b) => html`<span key=${b.b} style=${'flex:' + b.len}><i></i><small class="num">${M.fmt(b.t)}</small></span>`)}
    </div>
    ${!rec && html`<div class="rt-skel" aria-label="De app rekent vooruit"><i></i></div>`}
    ${o && html`<div class=${'gp-cons' + (o.ok ? '' : ' warn')}>
      <span>Elk blok <b class="num">± ${halfMin(L / n)} min</b></span>
      <span>Speeltijd <b class="num">${mins(o.minPlayed)}–${mins(o.maxPlayed)} min</b></span>
      <span>Max aan de kant <b class="num">${mins(o.maxStretch)} min</b>${maxB && o.maxStretch > maxB * 60 + 1 ? ` (regel ${maxB})` : ''}</span>
    </div>`}
    ${rec && html`<p class="rt-note"><${AiMark} size=${14} />Advies ${rec.recommended} blokken: zo kan iedereen eerlijk spelen${maxB ? ` en zit niemand langer dan ${maxB} min aan de kant` : ''}.</p>`}
  </section>

  <section class="card rt-q" style="--q:2">
    <span class="rt-qn"><b>3</b>${gp && gp.base ? 'Je bord' : 'Hoe begin je?'}</span>
    ${gp && gp.base
      ? html`<div class="gp-have"><span><b class="num">${full}</b> van ${st.blocks.length} blokken vol · speeltijd <b class="num">${mins(st.min)}–${mins(st.max)} min</b></span>
          <button type="button" class="linkbtn" onClick=${startOver}>Opnieuw, leeg</button></div>`
      : html`${[['leeg', 'Leeg bord', 'Je zet zelf de startopstelling neer. Die loopt door tot het eind; daarna wissel je per blok.', 'edit'],
          ['voorzet', 'Voorzet van de app', 'De app vult alle blokken, eerlijk en vooruit gedacht. Jij past aan wat je anders wilt.', 'spark']].map(([k, t, txt, ic], i) => html`<button type="button" key=${k}
          class=${'rt-choice' + (begin === k ? ' on' : '') + (k === 'voorzet' ? ' ai' : '')} style=${'--i:' + i} aria-pressed=${begin === k ? 'true' : 'false'} onClick=${() => { haptic('select'); setBegin(k); }}>
          <span class="rc-ico"><${Icon} name=${ic} size=${22} /></span>
          <span class="rc-body"><span class="rc-top"><b>${t}</b></span><span class="rc-more"><span>${txt}</span></span></span>
          <span class="rc-check" aria-hidden="true"><${Icon} name="check" size=${16} /></span>
        </button>`)}`}
  </section>`;
}

// ---------- het liniebord ----------
const FILTERS = [['alle', 'Alle'], ['V', 'Voor'], ['M', 'Midden'], ['A', 'Achter'], ['nog', 'Nog spelen']];
const FIT_TAG = { dominant: '★ sterkste plek', voorkeur: '☆ voorkeur', buiten: '✕ buiten kracht' };
const fitGlyph = (f) => (f === 'dominant' ? '★' : f === 'voorkeur' ? '☆' : f === 'buiten' ? '✕' : '');
const good = (f) => f === 'dominant' || f === 'voorkeur';

function Board({ match, team, mode, wide, readOnly, focus, toStart }) {
  const gp = match.gameplan;
  const L = M.periodLen(team);
  const blocks = M.gpBlocks(match, team, gp.n);
  const stats = useMemo(() => M.gpStats(match, team), [match, team]);
  const lines = M.linesOf(match, team);
  const LN = ['V', 'M', 'A'].filter((l) => (lines[l] || 0) > 0);
  const F = LN.reduce((a, l) => a + lines[l], 0);
  const players = useMemo(() => { const o = {}; for (const p of team.players) o[p.id] = p; return o; }, [team]);
  const ids = M.gpFieldIds(match);
  const style = M.planStyle(match, team);
  const nick = (id) => M.nickOf(team, id);
  const start = mode === 'start';
  const livePeriod = match.started ? Math.min(team.periods - 1, match.clock.period) : 0;
  const [p, setP] = useState(focus != null ? blocks[focus].p : livePeriod);
  const [pick, setPick] = useState(null);
  const [filter, setFilter] = useState('alle');
  const [follow, setFollow] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(focus);
  useEffect(() => { if (flash == null) return undefined; const t = setTimeout(() => setFlash(null), 1600); return () => clearTimeout(t); }, []);
  const shown = start ? [blocks[0]] : wide ? blocks : blocks.filter((b) => b.p === p);
  const posOf = (b) => (gp.grid[b] || {});
  const prevOf = (b) => (b > 0 ? gp.grid[b - 1] || null : null);
  const tb = stats.targetBlocks;
  const lowKid = (id) => tb > 0 && stats.kids[id].blocks < Math.floor(tb + 1e-9);

  // een zet op het bord: tik-tik of slepen geven allebei (blok, van, naar)
  const combine = (pos, a, c) => {
    const pa = a.slice(0, 2) === 'p:' ? a.slice(2) : null, pc = c.slice(0, 2) === 'p:' ? c.slice(2) : null;
    const la = pa ? pos[pa] || 'B' : a.slice(2), lc = pc ? pos[pc] || 'B' : c.slice(2);
    if (!pa && !pc) return null;
    if (pa && pc) {
      if (la === lc) return null;
      const np = { ...pos };
      if (la !== 'B' && lc !== 'B') { np[pa] = lc; np[pc] = la; return { pos: np, kind: 'move' }; }
      if (la !== 'B') { delete np[pa]; np[pc] = la; return { pos: np, kind: 'swap' }; }
      delete np[pc]; np[pa] = lc; return { pos: np, kind: 'swap' };
    }
    const who = pa || pc, slot = pa ? lc : la, from = pa ? la : lc;
    if (slot === from) return null;
    const np = { ...pos };
    if (slot === 'B') { if (from === 'B') return null; delete np[who]; return { pos: np, kind: 'bench' }; }
    np[who] = slot;
    return { pos: np, kind: 'place' };
  };
  const apply = (b, res) => {
    const based = mutate((m, t) => {
      const was = m.gameplan.base;
      M.gpSetBlock(m, t, b, res.pos, 'coach');
      return !was && m.gameplan.base;
    });
    haptic(res.kind === 'move' ? 'select' : 'success');
    if (based) toast('Startopstelling staat. Die geldt nu voor de hele wedstrijd; wissel verder per blok.');
  };
  const act = (b, key) => {
    if (readOnly) return;
    if (!pick || pick.b !== b) {
      if (key === 'e:B') return;
      setPick({ b, key }); haptic('select'); return;
    }
    if (pick.key === key) { setPick(null); return; }
    const res = combine(posOf(b), pick.key, key);
    if (!res) { if (key === 'e:B') { setPick(null); return; } setPick({ b, key }); haptic('select'); return; }
    setPick(null);
    apply(b, res);
  };
  const lastDrag = useRef(0);
  const root = useRef(null);
  useBoardDrag(root, !readOnly, (b, from, to) => {
    lastDrag.current = Date.now();
    const res = combine(posOf(b), from, to);
    setPick(null);
    if (res) apply(b, res);
  });
  const tap = (b, key) => { if (Date.now() - lastDrag.current < 350) return; act(b, key); };
  // kies een kind om het over de hele wedstrijd te volgen
  const tapKid = (id) => { haptic('select'); setFollow(follow === id ? null : id); setPick(null); };

  // wie licht op en wie dimt: eerst wat je net koos, dan het gevolgde kind, dan het filter
  const look = (b, id, lane) => {
    if (pick && pick.b === b) {
      if (pick.key === 'p:' + id) return 'sel';
      if (pick.key.slice(0, 2) === 'e:') return good(fitOf(players[id], pick.key.slice(2))) ? 'hl' : 'dim';
      const pid = pick.key.slice(2);
      const pl = posOf(b)[pid] || 'B';
      return pl === lane ? '' : 'target';
    }
    if (follow) return follow === id ? 'hl' : 'dim';
    if (filter === 'alle') return '';
    if (filter === 'nog') return lowKid(id) ? 'hl' : 'dim';
    return good(fitOf(players[id], filter)) ? 'hl' : 'dim';
  };
  const laneFit = (b, lane) => {
    if (!pick || pick.b !== b || pick.key.slice(0, 2) !== 'p:' || lane === 'B') return null;
    const pid = pick.key.slice(2);
    if ((posOf(b)[pid] || 'B') === lane) return null;
    return fitOf(players[pid], lane);
  };

  const chip = (bl, id, lane) => {
    const prev = prevOf(bl.b);
    const pos = posOf(bl.b);
    const f = lane !== 'B' ? fitOf(players[id], lane) : null;
    const was = prev ? prev[id] || 'B' : null;
    const chg = prev && gp.grid[bl.b] ? (was === 'B' && lane !== 'B' ? 'in' : was !== 'B' && lane === 'B' ? 'out' : was !== lane ? 'mv' : '') : '';
    const lk = look(bl.b, id, lane);
    const main = players[id] && players[id].main && players[id].main !== 'K' ? players[id].main : null;
    return html`<button type="button" key=${id} class=${'gc ' + lk + (chg ? ' c-' + chg : '') + (f === 'buiten' ? ' x-' + style : '')}
      data-key=${'p:' + id} data-b=${bl.b} onClick=${() => tap(bl.b, 'p:' + id)}
      aria-label=${nick(id) + (lane === 'B' ? ', bank' : ', ' + LNAME[lane]) + (f && f !== 'neutraal' ? ', ' + FIT_TAG[f].slice(2) : '') + (lk === 'sel' ? ', gekozen' : '')}
      aria-pressed=${lk === 'sel' ? 'true' : 'false'}>
      ${chg && html`<span class="gc-c" aria-hidden="true">${chg === 'in' ? '↑' : chg === 'out' ? '↓' : '↔'}</span>`}
      <span class="gc-n">${nick(id)}</span>
      ${lane === 'B' ? main && html`<i class="gc-dot" style=${'background:var(--pos-' + main + ')'} aria-hidden="true"></i>` : f && f !== 'neutraal' && html`<span class=${'gc-f ' + f} aria-hidden="true">${fitGlyph(f)}</span>`}
    </button>`;
  };
  const cell = (bl, lane) => {
    const pos = posOf(bl.b);
    const inLane = lane === 'B' ? ids.filter((id) => !(id in pos)) : ids.filter((id) => pos[id] === lane);
    const free = lane === 'B' ? 0 : Math.max(0, (lines[lane] || 0) - inLane.length);
    const lf = laneFit(bl.b, lane);
    const picked = pick && pick.b === bl.b;
    const benchDrop = lane === 'B' && picked && pick.key.slice(0, 2) === 'p:' && (pos[pick.key.slice(2)]);
    return html`<div class=${'gl gl-' + lane + (lf ? ' fit-' + lf : '') + (picked ? ' colsel' : '') + (flash === bl.b ? ' flash' : '') + (bl.i === 0 && bl.p > 0 && !start ? ' seam' : '')} key=${lane + bl.b}
      data-key=${lane === 'B' ? 'e:B' : null} data-b=${lane === 'B' ? bl.b : null} onClick=${lane === 'B' ? (e) => { if (e.target === e.currentTarget) tap(bl.b, 'e:B'); } : null}>
      ${lf && lf !== 'neutraal' && html`<span class=${'gl-fit ' + lf}>${FIT_TAG[lf]}</span>`}
      ${inLane.map((id) => chip(bl, id, lane))}
      ${Array.from({ length: free }, (_, k) => html`<button type="button" key=${'e' + k} class=${'gc empty' + (picked && pick.key === 'e:' + lane ? ' sel' : picked ? ' target' : '')}
        data-key=${'e:' + lane} data-b=${bl.b} onClick=${() => tap(bl.b, 'e:' + lane)} aria-label=${'Lege plek ' + LNAME[lane]}>
        <span class="gc-n">${start && !inLane.length && k === 0 ? 'Zet hier ' + LNAME[lane] : '+'}</span></button>`)}
      ${benchDrop && html`<span class="gl-drop">naar de bank</span>`}
      ${lane === 'B' && !inLane.length && !benchDrop && html`<span class="gl-none">iedereen speelt</span>`}
    </div>`;
  };
  const head = (bl) => {
    const s = stats.blocks[bl.b];
    const placed = Object.keys(posOf(bl.b)).length;
    const rel = bl.t - bl.p * L;
    return html`<button type="button" key=${'h' + bl.b} class=${'gh' + (s.ok ? ' ok' : '') + (pick && pick.b === bl.b ? ' colsel' : '') + (bl.i === 0 && bl.p > 0 && !start ? ' seam' : '')}
      onClick=${() => { if (!start) { haptic('select'); setMenu(bl.b); } }} aria-label=${`Blok ${bl.i + 1}, ${M.periodLabel(team, bl.p)} vanaf ${M.fmt(rel)}`}>
      <span class="gh-t num">${start ? 'Aftrap' : wide && bl.i === 0 ? M.periodLabel(team, bl.p) : M.fmt(rel)}</span>
      <span class="gh-s">
        ${s.src === 'ai' && html`<span class="gh-ai" title="Ingevuld door de app"><${Icon} name="spark" size=${11} /></span>`}
        ${!s.ok ? html`<span class="gh-open num">${placed}/${F}</span>`
          : bl.i === 0 && bl.p > 0 ? html`<span class="gh-rust">rust</span>`
          : bl.b === 0 ? html`<${Icon} name="check" size=${12} />`
          : s.swaps || s.moves ? html`<span class="num">${s.swaps ? '⇅' + s.swaps : ''}${s.moves ? ' ↔' + s.moves : ''}</span>` : html`<span class="gh-same">=</span>`}
      </span>
    </button>`;
  };

  const fill = async () => {
    const prev = snap(gp);
    setBusy(true);
    const n = await think(() => mutate((m, t) => M.gpFill(m, t)));
    setBusy(false);
    haptic('success');
    toast(n ? `✦ ${n} ${n === 1 ? 'blok' : 'blokken'} ingevuld. Jouw blokken bleven staan.` : 'Alles is al door jou ingevuld.', n ? restore(prev) : undefined);
  };
  const keeper = match.keeperId;
  const allOk = stats.blocks.every((b) => b.ok);
  const cols = shown.length;
  const grid = html`<div class=${'gb' + (start ? ' gb-start' : '') + (pick ? ' picking' : '')} ref=${root} style=${'--cols:' + cols}>
    <span class="gb-corner"></span>
    ${shown.map(head)}
    ${LN.concat(['B']).map((lane) => html`
      <span class=${'gb-lab gb-lab-' + lane} key=${'lab' + lane}><span>${LCAP[lane]}</span></span>
      ${shown.map((bl) => cell(bl, lane))}`)}
  </div>`;

  const hint = start
    ? (gp.base ? 'Pas de startopstelling aan; de wissels per blok blijven zoals ze zijn.' : 'Tik een speler op de bank en dan een plek (of sleep hem). Is de opstelling vol, dan loopt die door tot het eind.')
    : readOnly ? null : !pick && gp.base && !stats.blocks.some((x) => x.swaps || x.moves || x.i === 0 && x.p > 0 && x.src === 'coach') ? 'Wissel in een blok: tik een bankspeler en dan wie eruit gaat. Of laat de app aanvullen.' : pick ? (pick.key.slice(0, 2) === 'e:' ? 'Kies wie hier past: groen omrand speelt hier in zijn kracht.'
      : posOf(pick.b)[pick.key.slice(2)] ? 'Tik een bankspeler om te wisselen, iemand in een andere linie om te ruilen, of de bank.'
      : 'Tik wie eruit gaat. Bij elke linie zie je of hij daar in zijn kracht speelt.') : null;

  return html`<section class="gp-board">
    ${start && html`<div class="gp-sh"><h1 class="rt-h">Startopstelling</h1>
      ${keeper && html`<span class="chip gp-keeper"><span class="kbadge">K</span>${nick(keeper)}</span>`}</div>`}
    ${!start && !gp.base && html`<div class="card gp-empty"><b>Eerst de startopstelling</b><span class="sub">Die loopt door tot het eind; daarna wissel je per blok.</span>
      <button type="button" class="btn primary" onClick=${toStart}>Naar de startopstelling</button></div>`}
    ${!start && gp.base && html`<div class="gp-sum">
      <span class="gs-k"><small>Speeltijd</small><b class="num">${mins(stats.min)}–${mins(stats.max)}′</b></span>
      <span class="gs-k"><small>Doel p.p.</small><b class="num">${String(Math.round(tb * 10) / 10).replace('.', ',')}</b><small>blokken</small></span>
      <span class="gs-k"><small>Langst kant</small><b class="num">${mins(stats.maxBench)}′</b></span>
      ${!readOnly && html`<button type="button" class=${'ai-btn small' + (busy ? ' busy' : '')} onClick=${fill} disabled=${busy}>
        <span class="ai-btn-in"><${AiMark} size=${15} /><span>${busy ? 'Denkt…' : 'Vul aan'}</span></span></button>`}
    </div>`}
    ${!start && gp.base && !wide && html`<div class="gp-map">
      <div class="gm-ps">${Array.from({ length: team.periods }, (_, q) => html`<button type="button" key=${q} class=${'gm-p' + (q === p ? ' on' : '')} onClick=${() => { haptic('select'); setP(q); setPick(null); }}
        aria-label=${M.periodLabel(team, q)} aria-pressed=${q === p ? 'true' : 'false'}>
        <span class="gm-l">${M.periodLabel(team, q)}</span>
        <span class="gm-bs">${stats.blocks.filter((b) => b.p === q).map((b) => html`<i key=${b.b} class=${b.ok ? 'ok' : b.empty ? '' : 'half'}></i>`)}</span>
      </button>`)}</div>
      <span class="gm-rot"><${Icon} name="rotate" size=${14} />Draai voor de hele wedstrijd</span>
    </div>`}
    ${(start || gp.base) && html`<div class=${'gp-work' + (wide ? ' wide' : '')}>
      ${!start && html`<div class="gp-filters" role="toolbar" aria-label="Filter">
        ${FILTERS.map(([k, label]) => html`<button type="button" key=${k} class=${'gf' + (filter === k ? ' on' : '')} aria-pressed=${filter === k ? 'true' : 'false'}
          onClick=${() => { haptic('select'); setFilter(k); setFollow(null); setPick(null); }}>${k !== 'alle' && k !== 'nog' && html`<i style=${'background:var(--pos-' + k + ')'}></i>`}${label}</button>`)}
      </div>`}
      <div class="gp-gridwrap">${grid}</div>
    </div>`}
    ${hint && html`<p class="gp-hint" key=${hint}>${hint}</p>`}
    ${(start || gp.base) && html`<div class="gp-strip" aria-label="Speeltijd per kind">
      ${ids.map((id) => {
        const k = stats.kids[id];
        const lvl = !gp.base || tb <= 0 ? '' : k.blocks < Math.floor(tb + 1e-9) ? 'low' : k.blocks > Math.ceil(tb - 1e-9) ? 'high' : 'ok';
        return html`<button type="button" key=${id} class=${'gk ' + lvl + (follow === id ? ' on' : '')} onClick=${() => tapKid(id)} aria-pressed=${follow === id ? 'true' : 'false'}>
          <span class="gk-n">${nick(id)}</span><span class="gk-v num"><b>${k.blocks}</b>/${blocks.length}</span><span class="gk-m num">${mins(k.sec)}′</span>
        </button>`;
      })}
    </div>`}
    ${!start && allOk && gp.base && !readOnly && stats.blocks.some((x) => x.swaps || x.moves) && html`<p class="gp-ok"><${Icon} name="check" size=${15} />Alle blokken zijn vol. Kijk bij Controle hoe het plan uitpakt.</p>`}
    ${menu != null && html`<${BlockSheet} match=${match} team=${team} b=${menu} readOnly=${readOnly} onClose=${() => setMenu(null)} />`}
  </section>`;
}

// Slepen op het bord: pak een speler en laat hem los op een plek in hetzelfde blok. Met de muis meteen,
// met de vinger na een korte druk (zodat je de pagina nog gewoon kunt scrollen).
function useBoardDrag(ref, enabled, onDrop) {
  const cb = useRef(onDrop);
  cb.current = onDrop;
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return undefined;
    let st = null;
    const clear = () => {
      if (!st) return;
      clearTimeout(st.timer);
      if (st.ghost) st.ghost.remove();
      if (st.over) st.over.el.classList.remove('drop');
      if (st.el) st.el.classList.remove('dragsrc');
      root.classList.remove('dragging');
      st = null;
    };
    const begin = () => {
      const r = st.el.getBoundingClientRect();
      const g = st.el.cloneNode(true);
      g.className = st.el.className + ' gp-ghost';
      g.style.width = r.width + 'px';
      g.style.height = r.height + 'px';
      document.body.appendChild(g);
      st.ghost = g;
      st.el.classList.add('dragsrc');
      root.classList.add('dragging');
      st.targets = [...root.querySelectorAll('[data-key][data-b="' + st.b + '"]')].filter((t) => t !== st.el).map((t) => {
        const q = t.getBoundingClientRect();
        return { el: t, key: t.dataset.key, x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height };
      });
      haptic('select');
      place();
    };
    const place = () => {
      st.ghost.style.left = st.px + 'px';
      st.ghost.style.top = st.py + 'px';
      let best = null, bd = 64;
      for (const t of st.targets) {
        // binnen het vak telt altijd; anders de dichtstbijzijnde binnen de straal
        const inside = Math.abs(st.px - t.x) <= t.w / 2 && Math.abs(st.py - t.y) <= t.h / 2;
        const d = inside ? 0 : Math.hypot(t.x - st.px, t.y - st.py);
        if (d < bd || (inside && t.key.slice(0, 2) === 'p:')) { bd = d; best = t; }
      }
      if (best !== st.over) {
        if (st.over) st.over.el.classList.remove('drop');
        if (best) { best.el.classList.add('drop'); haptic('select'); }
        st.over = best;
      }
    };
    const down = (e) => {
      if (e.button > 0) return;
      const el = e.target.closest('.gc[data-key^="p:"]');
      if (!el || !root.contains(el)) return;
      st = { el, key: el.dataset.key, b: el.dataset.b, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, touch: e.pointerType !== 'mouse', armed: e.pointerType === 'mouse', ghost: null, over: null };
      if (st.touch) st.timer = setTimeout(() => { if (st) { st.armed = true; begin(); } }, 220);
    };
    const move = (e) => {
      if (!st) return;
      st.px = e.clientX; st.py = e.clientY;
      if (!st.ghost) {
        const d = Math.hypot(e.clientX - st.x, e.clientY - st.y);
        if (st.touch && !st.armed) { if (d > 8) clear(); return; }
        if (d < 6) return;
        begin();
      }
      e.preventDefault();
      place();
    };
    const up = () => {
      if (!st) return;
      const s = st;
      if (s.ghost && s.over) cb.current(s.b === undefined ? null : +s.b, s.key, s.over.key);
      clear();
    };
    // vinger: na het oppakken nooit de pagina laten meeschuiven
    const tm = (e) => { if (st && st.ghost) e.preventDefault(); };
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', clear);
    root.addEventListener('touchmove', tm, { passive: false });
    root.addEventListener('contextmenu', (e) => { if (st) e.preventDefault(); });
    return () => {
      clear();
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', clear);
      root.removeEventListener('touchmove', tm);
    };
  }, [enabled, ref.current]);
}

// Een blok: welke wissels er naar dit blok toe gebeuren, en doortrekken of leegmaken.
function BlockSheet({ match, team, b, readOnly, onClose }) {
  const gp = match.gameplan;
  const blocks = M.gpBlocks(match, team, gp.n);
  const bl = blocks[b];
  const L = M.periodLen(team);
  const nick = (id) => M.nickOf(team, id);
  const pos = gp.grid[b];
  const prev = b > 0 ? gp.grid[b - 1] : null;
  const ok = M.gpComplete(match, team, pos);
  const d = prev && pos && ok && M.gpComplete(match, team, prev) && bl.i > 0 ? M.gpDiff(prev, pos) : null;
  const lastInP = bl.i === gp.n - 1;
  const last = b === blocks.length - 1;
  const pl = M.periodLabel(team, bl.p);
  const extend = (toEnd) => {
    const was = snap(gp);
    const n = mutate((m, t) => M.gpExtend(m, t, b, toEnd));
    haptic('success');
    toast(`Doorgetrokken naar ${n} ${n === 1 ? 'blok' : 'blokken'}`, restore(was));
    onClose();
  };
  const empty = () => {
    const was = snap(gp);
    mutate((m, t) => { m.gameplan.grid[b] = null; m.gameplan.src[b] = null; M.gpSync(m, t); });
    toast('Blok leeggemaakt', restore(was));
    onClose();
  };
  return html`<${Sheet} onClose=${onClose} label="Blok">
    <div class="col" style="gap:2px">
      <span class="h2" style="font-size:22px">${pl} · blok ${bl.i + 1}</span>
      <span class="sub num">${M.fmt(bl.t - bl.p * L)}–${M.fmt(bl.t1 - bl.p * L)} · ${halfMin(bl.len)} min${gp.src[b] === 'ai' ? ' · ✦ ingevuld door de app' : ''}</span>
    </div>
    <div class="card gp-bs">
      <span class="label">${bl.b === 0 ? 'Aftrap' : bl.i === 0 ? 'Rust' : 'Naar dit blok'}</span>
      ${!ok ? html`<span class="sub">Nog niet vol. Een blok dat niet vol is, telt als ongewijzigd: dan wordt er niet gewisseld.</span>`
        : bl.b === 0 ? html`<span class="sub">De startopstelling.</span>`
        : bl.i === 0 ? html`<span class="sub">Nieuwe opstelling in de rust. Wisselen is hier vrij.</span>`
        : d && (d.pairs.length || d.moves.length) ? html`<div class="nc-lines">
            ${d.pairs.map((x) => html`<div class="nc-line" key=${x.in}><span class="nc-main"><span class="chg in">↑ ${nick(x.in)}</span> erin voor <span class="chg out">↓ ${nick(x.out)}</span></span>
              <span class="nc-sub">${x.shift ? html`<span class="chg sh">↔ ${nick(x.shift.id)}</span> schuift naar ${LNAME[x.shift.to]} · ${nick(x.in)} ${LNAME[pos[x.in]]}` : `${nick(x.in)} ${LNAME[pos[x.in]]}`}</span></div>`)}
            ${d.moves.map((x) => html`<div class="nc-line" key=${'m' + x.a}><span class="nc-main"><span class="chg sh">↔ ${nick(x.a)}</span> en <span class="chg sh">${nick(x.b)}</span> ruilen van linie</span>
              <span class="nc-sub">${nick(x.a)} naar ${LNAME[pos[x.a]]} · ${nick(x.b)} naar ${LNAME[pos[x.b]]}</span></div>`)}
          </div>`
        : html`<span class="sub">Geen wissel: hetzelfde als het blok ervoor.</span>`}
    </div>
    ${!readOnly && html`<div class="col" style="gap:8px">
      <button type="button" class="choice" disabled=${!ok || lastInP} onClick=${() => extend(false)}>
        <span class="col" style="gap:1px"><b>Doortrekken tot eind ${pl}</b><span class="sub">De volgende blokken van deze ${M.periodWord(team)} worden gelijk aan dit blok.</span></span></button>
      <button type="button" class="choice" disabled=${!ok || last} onClick=${() => extend(true)}>
        <span class="col" style="gap:1px"><b>Doortrekken tot eind wedstrijd</b><span class="sub">Alle blokken hierna worden gelijk aan dit blok.</span></span></button>
      ${b > 0 && html`<button type="button" class="choice" disabled=${!pos} onClick=${empty}>
        <span class="col" style="gap:1px"><b>Blok leegmaken</b><span class="sub">Begin dit blok opnieuw.</span></span></button>`}
    </div>`}
  </${Sheet}>`;
}

// ---------- rooster per kind (voor het standaardplan én in de controle) ----------
export function Rooster({ match, team, cards: given }) {
  const nick = (id) => M.nickOf(team, id);
  const cards = given || M.timeline(match, team).cards;
  const L = M.periodLen(team);
  const END = team.periods * L;
  if (!cards.length) return null;
  const ids = Object.keys(cards[0].pos).concat(cards[0].bench);
  const played = {};
  for (const id of ids) played[id] = 0;
  cards.forEach((c, i) => { const t1 = i + 1 < cards.length ? cards[i + 1].t : END; for (const id in c.pos) if (id in played) played[id] += Math.max(0, t1 - c.t); });
  const order = ids.slice().sort((a, b) => played[b] - played[a]);
  // aaneengesloten stukken op dezelfde plek samenvoegen (de rust blijft een naad)
  const segsOf = (id) => {
    const out = [];
    cards.forEach((c, i) => {
      const s = { t: c.t, t1: i + 1 < cards.length ? cards[i + 1].t : END, line: c.pos[id] || null };
      if (s.t1 <= s.t) return;
      const last = out[out.length - 1];
      if (last && last.line === s.line && s.t % L !== 0) last.t1 = s.t1; else out.push(s);
    });
    return out;
  };
  return html`<div class="rooster">
    ${order.map((id) => html`<div class="rt-row" key=${id}><span class="rr-n">${nick(id)}</span><span class="rr-bar">
      ${segsOf(id).map((s) => html`<i class=${s.line ? 'l' + s.line : 'off'} style=${`flex:${s.t1 - s.t}` + (s.t > 0 && s.t % L === 0 ? ';margin-left:3px' : '')}></i>`)}
    </span><span class="rr-m num">${mins(played[id])}′</span></div>`)}
    <div class="rt-legend2"><span><i class="lV"></i>voor</span><span><i class="lM"></i>midden</span><span><i class="lA"></i>achter</span><span><i class="off"></i>aan de kant</span></div>
  </div>`;
}

// ---------- laatste stap: controle ----------
function Controle({ match, team, goTo }) {
  const nick = (id) => M.nickOf(team, id);
  const gp = match.gameplan;
  const rep = useMemo(() => M.ownReport(match, team), [match, team]);
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const stats = useMemo(() => (gp ? M.gpStats(match, team) : null), [match, team]);
  const style = M.planStyle(match, team);
  const k = rep.kpi;
  const L = M.periodLen(team);
  const [open, setOpen] = useState(null);
  const blocks = gp ? M.gpBlocks(match, team, gp.n) : [];
  const blockAt = (t) => { const x = blocks.filter((b) => b.t <= t).pop(); return x ? x.b : 0; };
  const when = (t) => { const q = Math.min(team.periods - 1, Math.floor(t / L)); return M.periodLabel(team, q) + ' ' + M.fmt(t - q * L); };
  const open0 = stats ? stats.blocks.filter((b) => !b.ok) : [];
  const title = open0.length ? 'Nog niet af' : rep.verdict === 'goed' ? (style === 'sterk' ? 'Sterk en eerlijk' : 'Eerlijk en in balans') : rep.verdict === 'kracht' ? 'Eerlijk, niet iedereen in zijn kracht'
    : k.time.ok && !k.bench.ok ? 'Eerlijke speeltijd, maar lang aan de kant' : 'Nog niet eerlijk verdeeld';
  const verdict = open0.length ? 'let' : rep.verdict;
  const tiles = [
    { key: 'tijd', label: 'Speeltijd', val: `${mins(k.time.min)}–${mins(k.time.max)}`, unit: 'min', sub: `verschil ${mins(k.time.spread)} · marge ${mins(k.time.marge)}`, ok: k.time.ok },
    { key: 'kant', label: 'Langst aan de kant', val: `${mins(k.bench.max)}`, unit: 'min', sub: k.bench.rule ? `regel ${mins(k.bench.rule)} min` : 'geen regel', ok: k.bench.ok },
    { key: 'wissels', label: 'Wissels', val: `${k.swaps.n}`, unit: '', sub: `op ${k.swaps.moments} momenten`, ok: null },
    { key: 'kracht', label: 'In hun kracht', val: `${Math.round(k.kracht.pct * 100)}`, unit: '%', sub: 'dominant of voorkeur', ok: k.kracht.pct >= 0.9 }
  ];
  const insightText = (x) => x.kind === 'bench' ? `${nick(x.id)} zit ${mins(x.sec)} min aaneen aan de kant, vanaf ${when(x.from)}.`
    : x.kind === 'time' ? `${nick(x.id)} speelt het minst: ${mins(x.sec)} min.`
    : x.kind === 'kracht' ? `${nick(x.id)} speelt ${mins(x.sec)} min buiten zijn kracht (${LNAME[x.line]}).`
    : `${LNAME[x.line][0].toUpperCase() + LNAME[x.line].slice(1)} is lichter bezet vanaf ${when(x.t)}.`;
  const icon = { bench: 'clock', time: 'team', kracht: 'shield', lines: 'swaparrows' };
  const toggle = (k2) => { haptic('toggle'); setOpen(open === k2 ? null : k2); };
  return html`<section class=${'rt-verdict ' + verdict}>
    <span class="rv-ico"><${Icon} name=${verdict === 'let' ? 'warn' : 'check'} size=${22} /></span>
    <div><b>${title}</b>
    <p>${open0.length ? `${open0.length} ${open0.length === 1 ? 'blok is' : 'blokken zijn'} nog niet vol. Zo'n blok telt als ongewijzigd: dan wordt er niet gewisseld. ` : ''}Iedereen speelt ${mins(k.time.min)}–${mins(k.time.max)} min en zit hooguit ${mins(k.bench.max)} min aaneen aan de kant. ${Math.round(k.kracht.pct * 100)}% van de speeltijd staan kinderen in hun kracht.</p></div>
  </section>
  <section class="rt-kpis">
    ${tiles.map((x, i) => html`<div key=${x.key} class=${'rt-kpi' + (x.ok === false ? ' bad' : x.ok ? ' good' : '')} style=${'--i:' + i}>
      <span class="rk-l">${x.label}</span>
      <span class="rk-v num"><b>${x.val}</b>${x.unit && html`<small>${x.unit}</small>`}</span>
      <span class="rk-s">${x.ok ? '✓ ' : ''}${x.sub}</span>
    </div>`)}
  </section>
  ${(open0.length > 0 || rep.insights.length > 0) && html`<section class="card rt-ins">
    <span class="rt-qn">Om naar te kijken</span>
    ${open0.length > 0 && html`<button type="button" class="rt-insrow" onClick=${() => goTo(open0[0].b)}>
      <span class="ri-ico"><${Icon} name="edit" size=${18} /></span><span class="ri-txt">${M.periodLabel(team, open0[0].p)}, blok ${open0[0].i + 1} is nog niet vol.</span><span class="rt-go">Ga naar<${Icon} name="chev" size=${14} /></span>
    </button>`}
    ${rep.insights.map((x, i) => html`<button type="button" key=${i} class="rt-insrow" style=${'--i:' + (i + 1)} onClick=${() => goTo(blockAt(x.t != null ? x.t : x.from))}>
      <span class="ri-ico"><${Icon} name=${icon[x.kind] || 'eye'} size=${18} /></span><span class="ri-txt">${insightText(x)}</span><span class="rt-go">Ga naar<${Icon} name="chev" size=${14} /></span>
    </button>`)}
  </section>`}
  <section class="card rt-deep">
    <button type="button" class="rt-dh" aria-expanded=${open === 'rooster' ? 'true' : 'false'} onClick=${() => toggle('rooster')}><span>Rooster per kind</span><${Icon} name="chev" size=${16} /></button>
    <div class=${'rt-dbody' + (open === 'rooster' ? ' open' : '')}><div><${Rooster} match=${match} team=${team} cards=${cards} /></div></div>
    <button type="button" class="rt-dh" aria-expanded=${open === 'wissels' ? 'true' : 'false'} onClick=${() => toggle('wissels')}><span>Alle wissels op een rij</span><${Icon} name="chev" size=${16} /></button>
    <div class=${'rt-dbody' + (open === 'wissels' ? ' open' : '')}><div class="gp-moments">
      ${cards.slice(1).map((c, i) => html`<div class="gp-mo" key=${c.t + ':' + i}>
        <span class="gp-mt num">${when(c.t)}</span>
        ${c.kind === 'lineup' ? html`<span class="sub">Rust: nieuwe opstelling</span>`
          : html`<span class="gp-ml">${(c.pairs || []).map((s) => html`<span key=${s.in}><span class="chg in">↑ ${nick(s.in)}</span> voor <span class="chg out">↓ ${nick(s.out)}</span></span>`)}
            ${(c.moves || []).map((mv) => html`<span key=${'m' + mv.a}><span class="chg sh">↔ ${nick(mv.a)}</span> en ${nick(mv.b)}</span>`)}</span>`}
      </div>`)}
    </div></div>
  </section>`;
}
