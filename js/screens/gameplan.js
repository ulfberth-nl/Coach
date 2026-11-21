// Game plan: de coach legt de wisselpuzzel zelf op een liniebord. Rijen zijn de linies (voor, midden, achter),
// de keeper en de bank; kolommen de blokken van een periode. Vier stappen: Opzet → Startopstelling → Wissels →
// Controle. Alleen de planning: tijdens de wedstrijd voert het live-scherm het plan precies zo uit.
import { html, useMemo, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as M from '../match.js';
import { fitOf } from '../ownplanner.js';
import { Icon, Sheet, Field, Portal, toast, go as goHash, accentFor, useDragSwap, BenchScroll } from '../ui.js';
import { haptic, reduced } from '../motion.js';
import { mutate } from './live.js';
import { NextBar, MiniScore } from './plan.js';

const STEPS = [['opzet', 'Opzet'], ['start', 'Start'], ['wissels', 'Wissels'], ['controle', 'Controle']];
const KEYS = STEPS.map((s) => s[0]);
const TITLE = { opzet: 'Opzet', start: 'Startopstelling', wissels: 'Wissels per blok', controle: 'Controle' };
const LNAME = { A: 'achter', M: 'midden', V: 'voor' };
const LTO = { A: 'achter', M: 'het midden', V: 'voor' };
const LCAP = { V: 'Voor', M: 'Mid', A: 'Achter', B: 'Bank', K: 'Keeper' };
const mins = (s) => Math.round(s / 60);
const halfMin = (s) => String(Math.round(s / 30) / 2).replace('.5', '½').replace('.', ',');
// even laten zien dat de app 'denkt' (en de telefoon de tijd geven om te tekenen), dan rekenen
const think = (fn, ms = 420) => new Promise((res) => setTimeout(() => res(fn()), reduced() ? 0 : ms));
const snap = (gp) => JSON.parse(JSON.stringify(gp));
const restore = (prev) => ({ label: 'Ongedaan', run: () => mutate((m, t) => { m.gameplan = prev; M.gpSync(m, t); }) });
const breakWord = (team) => (team.periods === 2 ? 'rust' : 'pauze');
const plural = (n, one, more) => (n === 1 ? one : more);

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

// Getal dat even optelt naar zijn waarde (dashboard).
function Num({ v, dur = 700 }) {
  const [x, setX] = useState(reduced() ? v : 0);
  useEffect(() => {
    if (reduced()) { setX(v); return undefined; }
    let raf = 0; const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3); setX(Math.round(v * e)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return html`${x}`;
}

export function GamePlan({ match, team }) {
  const live = match.started && !match.finished;
  const gp = match.gameplan;
  const saved = match.ownSteps && match.ownSteps.at;
  const [at, setAt] = useState(live ? 'wissels' : KEYS.indexOf(saved) !== -1 ? saved : gp && gp.base ? 'wissels' : 'opzet');
  const [dir, setDir] = useState(1);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);
  const total0 = team.periods * ((gp && gp.n) || 4);
  const [begin, setBegin] = useState(total0 >= 12 ? 'voorzet' : 'leeg');
  const [pickN, setPickN] = useState(null);
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
  const goTo = (key, f = null, mark = null) => {
    setDir(KEYS.indexOf(key) >= idx ? 1 : -1);
    setAt(key);
    setFocus(f);
    mutate((m) => { const d = (m.ownSteps && m.ownSteps.done) || {}; m.ownSteps = { done: { ...d, ...(mark ? { [mark]: true } : {}) }, at: key }; });
    haptic('select');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
  };
  // Opzet → beginnen: leeg (naar de startopstelling) of met een voorzet van de app (naar de wissels)
  const startBoard = async (n) => {
    if (gp && gp.base) { goTo('start', null, 'opzet'); return; }
    if (begin === 'voorzet') {
      setBusy(true);
      await think(() => mutate((m, t) => { M.gpEnsure(m, t, n); M.gpFill(m, t); }), 900);
      setBusy(false);
      haptic('success');
      toast('✦ Voorzet staat klaar. Pas aan wat je wilt.');
      mutate((m) => { m.ownSteps = { done: { opzet: true, start: true }, at: 'wissels' }; });
      setDir(1); setAt('wissels'); setFocus(null);
      return;
    }
    mutate((m, t) => { M.gpEnsure(m, t, n); M.gpSync(m, t); });
    goTo('start', null, 'opzet');
  };
  const next = () => {
    if (at === 'opzet') return startBoard(gp ? gp.n : pickN || 4);
    if (at === 'controle') { mutate((m) => { m.ownSteps = { done: { ...done, controle: true }, at: 'controle' }; }); haptic('success'); goHash('/'); return undefined; }
    goTo(KEYS[idx + 1], null, at);
    return undefined;
  };
  const prev = () => { if (idx > 0) goTo(KEYS[idx - 1]); };
  const voorzetNext = at === 'opzet' && !(gp && gp.base) && begin === 'voorzet';
  const nextLabel = at === 'opzet' ? (voorzetNext ? 'Maak de voorzet' : 'Startopstelling') : at === 'controle' ? null : TITLE[KEYS[idx + 1]];

  let body;
  if (live && !gp) body = html`<section class="card gp-empty"><b>Er is geen game plan gemaakt</b><span class="sub">De wissels volgen wat er live gebeurt.</span></section>`;
  else if (at === 'opzet') body = html`<${Opzet} match=${match} team=${team} begin=${begin} setBegin=${setBegin} pickN=${pickN} setPickN=${setPickN} />`;
  else if (at === 'controle') body = html`<${Controle} match=${match} team=${team} goTo=${(b, id) => goTo('wissels', { b, id })} />`;
  else if (!gp) body = html`<section class="card gp-empty"><b>Eerst de opzet</b><span class="sub">Kies hoe je speelt en hoeveel blokken per periode.</span><button type="button" class="btn primary" onClick=${() => goTo('opzet')}>Naar de opzet</button></section>`;
  else body = html`<${Board} match=${match} team=${team} mode=${at} wide=${wide} readOnly=${live || match.finished} focus=${focus} key=${at + (focus ? ':' + focus.b + ':' + (focus.id || '') : '')}
    toStart=${() => goTo('start')} />`;

  // stappen: een voortgangsbalk in vier delen met de naam eronder; tik = naar die stap
  const steps = !live && html`<nav class=${'gp-prog' + (wide && board ? ' slim' : '')} aria-label="Stappen van het game plan">
    ${STEPS.map(([k, label], i) => {
      const isDone = (i < idx || done[k]) && k !== at;
      return html`<button type="button" key=${k} class=${'gq' + (isDone ? ' done' : '') + (i < idx ? ' past' : '') + (k === at ? ' cur' : '')}
        aria-current=${k === at ? 'step' : null} aria-label=${'Stap ' + (i + 1) + ': ' + label} onClick=${() => k !== at && goTo(k)}>
        <span class="gq-bar"><i></i></span>
        <span class="gq-l">${isDone ? html`<${Icon} name="check" size=${12} />` : html`<b class="num">${i + 1}</b>`}<span>${label}</span></span>
      </button>`;
    })}
  </nav>`;
  const nextBtn = (small) => html`<button type="button" class=${'btn primary ' + (small ? 'gp-hnext' : 'grow gp-next') + (voorzetNext ? ' ai-go' : '') + (busy ? ' busy' : '')} onClick=${next} disabled=${busy} key=${'n' + at + begin}>
    ${busy ? html`<span class="gp-thinking"><${AiMark} size=${18} /><span>De app denkt vooruit…</span></span>` : nextLabel ? html`<span class="rn-txt"><small>${voorzetNext ? '✦ Begin' : 'Volgende'}</small><span>${nextLabel}</span></span><${Icon} name="chev" size=${18} />` : html`<span>Klaar</span><${Icon} name="check" size=${18} />`}
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

// ---------- slimme laag (de app denkt mee): sterretje, kleurverloop paars-blauw-groen ----------
function AiMark({ size = 18 }) {
  return html`<span class="ai-mark" aria-hidden="true"><${Icon} name="spark" size=${size} /></span>`;
}
function AiNote({ title = 'Advies', children, action = null }) {
  return html`<div class="ai-note"><span class="ai-note-ico"><${AiMark} size=${16} /></span>
    <div class="ai-note-b"><b class="ai-grad">${title}</b><span>${children}</span>${action}</div></div>`;
}

// ---------- stap 1: opzet ----------
const STYLES = {
  sterk: { title: 'Sterkste opstelling', tag: 'Oudere teams', icon: 'shield', text: 'Iedereen in zijn kracht. Uit positie valt oranje op.' },
  balans: { title: 'Gebalanceerd', tag: 'Jongere teams', icon: 'team', text: 'Eerlijke speeltijd, afwisselen mag. Uit positie staat rustig grijs.' }
};

function Opzet({ match, team, begin, setBegin, pickN, setPickN }) {
  const gp = match.gameplan;
  const style = M.planStyle(match, team);
  const info = M.squadInfo(match, team);
  const L = M.periodLen(team);
  const [rec, setRec] = useState(null);
  const touched = useRef(false);
  const sig = style + '|' + JSON.stringify(match.lines || null) + '|' + match.keeperId + '|' + info.n;
  // vooruit rekenen gebeurt na het tekenen; tot dan glinsteren de keuzes
  useEffect(() => { setRec(null); const id = setTimeout(() => setRec(M.gpRecommend(match, team, style)), reduced() ? 0 : 140); return () => clearTimeout(id); }, [sig]);
  const n = gp ? gp.n : pickN || (rec && rec.recommended) || 4;
  const total = team.periods * n;
  const many = total >= 12;
  // veel blokken: met een voorzet beginnen is dan prettiger (zolang de coach zelf nog niet koos)
  useEffect(() => { if (!touched.current && !(gp && gp.base)) setBegin(many ? 'voorzet' : 'leeg'); }, [many]);
  const setStyle = (s) => { haptic('select'); mutate((m) => { m.planStyle = s; }); };
  const setN = (v) => {
    haptic('select');
    if (gp) mutate((m, t) => { M.gpEnsure(m, t, v); M.gpSync(m, t); });
    else setPickN(v);
  };
  const r = M.effRules(match, team);
  const maxB = r.maxBenchOn ? r.maxBench : null;
  const o = rec && rec.opts.find((x) => x.n === n);
  const recO = rec && rec.opts.find((x) => x.n === rec.recommended);
  const blocks = M.gpBlocks(match, team, n).filter((b) => b.p === 0);
  const st = gp && gp.base ? M.gpStats(match, team) : null;
  const full = st ? st.blocks.filter((b) => b.ok).length : 0;
  const pw = M.periodWord(team);
  const per = Math.max(1, Math.min(5, team.rules.perMoment || 1));
  const startOver = () => {
    const prev = snap(gp);
    mutate((m, t) => M.gpClear(m, t));
    touched.current = false;
    setBegin(many ? 'voorzet' : 'leeg');
    toast('Het bord is leeg', restore(prev));
  };
  const pickBegin = (k) => { touched.current = true; haptic('select'); setBegin(k); };
  return html`<section class="oz-hero">
    <h1 class="oz-h">Hoe pak je deze wedstrijd aan?</h1>
    <div class="oz-ctx">
      <span><${Icon} name="clock" size=${14} /><b class="num">${team.periods} × ${Math.round(L / 60)}</b>min</span>
      <span><${Icon} name="team" size=${14} /><b class="num">${info.n}</b>veldspelers</span>
      <span><b class="num">${info.F}</b>in het veld · <b class="num">${info.bench}</b>op de bank</span>
    </div>
  </section>

  <section class="oz-q" style="--q:0">
    <header class="oz-qh"><span class="oz-n">1</span><span>Speelstijl</span></header>
    <div class="oz-duo" role="radiogroup" aria-label="Speelstijl">
      ${['sterk', 'balans'].map((s) => html`<button type="button" key=${s} role="radio" class=${'oz-card' + (style === s ? ' on' : '')} aria-checked=${style === s ? 'true' : 'false'} onClick=${() => setStyle(s)}>
        <span class="oz-card-top"><span class="oz-ico"><${Icon} name=${STYLES[s].icon} size=${20} /></span><span class="oz-check" aria-hidden="true"><${Icon} name="check" size=${14} /></span></span>
        <span class="oz-tag">${STYLES[s].tag}</span>
        <b class="oz-t">${STYLES[s].title}</b>
        <span class="oz-d">${STYLES[s].text}</span>
      </button>`)}
    </div>
  </section>

  <section class="oz-q" style="--q:1">
    <header class="oz-qh"><span class="oz-n">2</span><span>Blokken per ${pw}</span></header>
    <div class="oz-period" aria-hidden="true">
      <div class="oz-bar">${blocks.map((b, i) => html`<span key=${n + ':' + b.b} style=${'flex:' + b.len + ';--i:' + i}><i></i><small class="num">${M.fmt(b.t)}</small></span>`)}</div>
    </div>
    <div class="oz-ns" role="radiogroup" aria-label="Blokken per periode">
      ${M.GP_SIZES.map((v) => html`<button type="button" key=${v} role="radio" aria-checked=${n === v ? 'true' : 'false'} class=${'oz-nb' + (n === v ? ' on' : '') + (rec && rec.recommended === v ? ' rec' : '')} onClick=${() => setN(v)}>
        <b class="num">${v}</b><small>${rec && rec.recommended === v ? '✦ advies' : halfMin(L / v) + '′'}</small>
      </button>`)}
    </div>
    ${!rec && html`<div class="rt-skel" aria-label="De app rekent vooruit"><i></i></div>`}
    ${o && html`<div class="oz-stats" key=${'s' + n}>
      <span><small>Per blok</small><b class="num">${halfMin(L / n)}′</b></span>
      <span><small>Speeltijd</small><b class="num">${mins(o.minPlayed)}–${mins(o.maxPlayed)}′</b></span>
      <span class=${maxB && o.maxStretch > maxB * 60 + 1 ? 'warn' : ''}><small>Max kant</small><b class="num">${mins(o.maxStretch)}′</b></span>
      <span><small>Per grens</small><b class="num">${info.bench}×</b></span>
    </div>`}
    ${rec && recO && html`<${AiNote} title=${'Advies: ' + rec.recommended + ' blokken per ' + pw} action=${rec.recommended !== n ? html`<button type="button" class="ai-apply" onClick=${() => setN(rec.recommended)}>Neem advies over</button>` : null}>
      ${info.n} veldspelers en ${info.F} in het veld: ${info.bench} op de bank. Per blokgrens wisselt de hele bank, ${info.bench} tegelijk${per < info.bench ? ` (je standaardplan wisselt ${per} per moment)` : ''}. Zo speelt iedereen ${mins(recO.minPlayed)}–${mins(recO.maxPlayed)} min${maxB ? ` en zit niemand langer dan ${mins(recO.maxStretch)} min aan de kant (regel ${maxB})` : ''}. De ${breakWord(team)} is een extra wisselmoment.
    </${AiNote}>`}
  </section>

  <section class="oz-q" style="--q:2">
    <header class="oz-qh"><span class="oz-n">3</span><span>${gp && gp.base ? 'Je bord' : 'Hoe begin je?'}</span></header>
    ${gp && gp.base
      ? html`<div class="oz-have"><span><b class="num">${full}</b> van ${st.blocks.length} blokken vol · speeltijd <b class="num">${mins(st.min)}–${mins(st.max)} min</b></span>
          <button type="button" class="linkbtn" onClick=${startOver}>Opnieuw, leeg</button></div>`
      : html`<div class="oz-begin">
          <button type="button" class=${'oz-card ai-tile' + (begin === 'voorzet' ? ' on' : '')} aria-pressed=${begin === 'voorzet' ? 'true' : 'false'} onClick=${() => pickBegin('voorzet')}>
            <span class="ai-aurora" aria-hidden="true"></span><span class="ai-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="oz-card-top"><span class="oz-ico ai"><${Icon} name="spark" size=${20} /></span>${many ? html`<span class="ai-pill">✦ Aanrader</span>` : html`<span class="oz-check" aria-hidden="true"><${Icon} name="check" size=${14} /></span>`}</span>
            <b class="oz-t ai-grad">Voorzet van de app</b>
            <span class="oz-d">De app vult alle ${total} blokken, eerlijk en vooruit gedacht. Jij schuift daarna.</span>
          </button>
          <button type="button" class=${'oz-card plain' + (begin === 'leeg' ? ' on' : '')} aria-pressed=${begin === 'leeg' ? 'true' : 'false'} onClick=${() => pickBegin('leeg')}>
            <span class="oz-card-top"><span class="oz-ico"><${Icon} name="edit" size=${20} /></span><span class="oz-check" aria-hidden="true"><${Icon} name="check" size=${14} /></span></span>
            <b class="oz-t">Leeg bord</b>
            <span class="oz-d">Jij zet de start neer, die loopt door tot het eind. Daarna wissel je per blok.</span>
          </button>
        </div>
        ${many && html`<${AiNote} title="Tip">${total} blokken is veel puzzelwerk. Begin met een voorzet en schuif daarna: tik een speler en je ziet hem over de hele wedstrijd.</${AiNote}>`}`}
  </section>`;
}

// ---------- het liniebord ----------
const FILTERS = [['alle', 'Alle'], ['V', 'Voor'], ['M', 'Midden'], ['A', 'Achter'], ['nog', 'Nog spelen']];
const FIT_TXT = { dominant: 'sterkste plek', voorkeur: 'voorkeur', buiten: 'buiten kracht' };
const fitGlyph = (f) => (f === 'dominant' ? '★' : f === 'voorkeur' ? '☆' : f === 'buiten' ? '✕' : '');
const good = (f) => f === 'dominant' || f === 'voorkeur';

function Board({ match, team, mode, wide, readOnly, focus, toStart }) {
  const gp = match.gameplan;
  const L = M.periodLen(team);
  const blocks = M.gpBlocks(match, team, gp.n);
  const stats = useMemo(() => M.gpStats(match, team), [match, team]);
  const base = M.gpBaseLines(match, team);
  const LN = ['V', 'M', 'A'].filter((l) => (base[l] || 0) > 0);
  const F = LN.reduce((a, l) => a + base[l], 0);
  const players = useMemo(() => { const o = {}; for (const p of team.players) o[p.id] = p; return o; }, [team]);
  const ids = M.gpFieldIds(match);
  const style = M.planStyle(match, team);
  const nick = (id) => M.nickOf(team, id);
  const start = mode === 'start';
  const livePeriod = match.started ? Math.min(team.periods - 1, match.clock.period) : 0;
  const [p, setP] = useState(focus && blocks[focus.b] ? blocks[focus.b].p : livePeriod);
  // gekozen speler: licht op in alle blokken, de rest wordt rustig; tik in elk blok waar hij moet spelen
  const [sel, setSel] = useState(focus && focus.id ? focus.id : null);
  const [slot, setSlot] = useState(null);
  const [filter, setFilter] = useState('alle');
  // een blok op het veld (tik op de kop); de gevolgen van je laatste wijziging; gratis verbeteringen
  const [fieldB, setFieldB] = useState(null);
  const [impact, setImpact] = useState(null);
  const [impOpen, setImpOpen] = useState(false);
  const [winsOpen, setWinsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState([]);
  const [need, setNeed] = useState(null);
  const [pulse, setPulse] = useState(focus ? { b: focus.b, k: 1 } : null);
  useEffect(() => { if (!pulse) return undefined; const t = setTimeout(() => setPulse(null), 1400); return () => clearTimeout(t); }, [pulse && pulse.k]);
  const shown = start ? [blocks[0]] : wide ? blocks : blocks.filter((b) => b.p === p);
  const posOf = (b) => (gp.grid[b] || {});
  const prevOf = (b) => (b > 0 ? gp.grid[b - 1] || null : null);
  const tb = stats.targetBlocks;
  const lowKid = (id) => tb > 0 && stats.kids[id].blocks < Math.floor(tb + 1e-9);

  // een zet op het bord: wie (de gekozen speler) en waarheen (speler, lege plek, linie of bank) in één blok
  const combine = (pos, who, key) => {
    const lw = pos[who] || 'B';
    if (key.slice(0, 2) === 'p:') {
      const x = key.slice(2);
      if (x === who) return null;
      const lx = pos[x] || 'B';
      if (lw === lx) return null;
      const np = { ...pos };
      if (lw !== 'B' && lx !== 'B') { np[who] = lx; np[x] = lw; return { pos: np, kind: 'move' }; }
      if (lw !== 'B') { delete np[who]; np[x] = lw; return { pos: np, kind: 'swap' }; }
      delete np[x]; np[who] = lx; return { pos: np, kind: 'swap' };
    }
    const lane = key.slice(2);
    if (lane === 'B') { if (lw === 'B') return null; const np = { ...pos }; delete np[who]; return { pos: np, kind: 'bench' }; }
    if (lane === lw) return null;
    if (key.slice(0, 2) === 'e:') return { pos: { ...pos, [who]: lane }, kind: 'place' };
    // ＋ een extra plek: de coach mag iedereen overal zetten (de teaminstellingen zijn regels voor de app zelf).
    // Vanaf de bank staat er dan één te veel in het veld: daarna tik je wie eruit gaat.
    return { pos: { ...pos, [who]: lane }, kind: lw === 'B' ? 'extra' : 'form' };
  };
  const apply = (b, res) => {
    const before = snap(gp);
    const was = posOf(b);
    const touched = [...new Set([...Object.keys(was), ...Object.keys(res.pos)])].filter((id) => was[id] !== res.pos[id]);
    const based = mutate((m, t) => {
      const was = m.gameplan.base;
      M.gpSetBlock(m, t, b, res.pos, 'coach');
      return !was && m.gameplan.base;
    });
    setHist((h) => h.concat([before]).slice(-30));
    setPulse({ b, k: Date.now() });
    // startopstelling: na het neerzetten is de speler klaar; bij de wissels blijft hij gekozen voor het volgende blok
    if (start) setSel(null);
    haptic(res.kind === 'move' || res.kind === 'form' ? 'select' : 'success');
    if (based) toast('Startopstelling staat. Die geldt nu voor de hele wedstrijd; wissel verder per blok.');
    else if (res.kind === 'form') toast(`Opstelling ${M.formationText(M.gpCount(res.pos))} in dit blok`);
    setNeed(res.kind === 'extra' ? { b } : null);
    // na een wijziging bij de wissels: één regel met het belangrijkste gevolg (tik = gevolgen en oplossingen)
    if (!start && gp.base) setImpact({ b, before: stats, ids: touched, k: Date.now() });
  };
  const undo = () => {
    if (!hist.length) return;
    const h = hist.slice(); const prev = h.pop(); setHist(h);
    mutate((m, t) => { m.gameplan = prev; M.gpSync(m, t); });
    setImpact(null);
    haptic('select');
  };
  const choose = (id) => { haptic('select'); setSlot(null); setSel(sel === id ? null : id); };
  const tapChip = (b, id) => {
    if (readOnly) { choose(id); return; }
    // één te veel in het veld: wie je nu tikt in dat blok, gaat naar de bank
    if (need && need.b === b && posOf(b)[id] && id !== sel) {
      const np = { ...posOf(b) }; delete np[id];
      apply(b, { pos: np, kind: 'bench' });
      return;
    }
    if (need) setNeed(null);
    if (slot) {
      const sb = slot.b, sl = slot.lane;
      setSlot(null);
      if (sb === b) { const r = combine(posOf(b), id, 'e:' + sl); if (r) { apply(b, r); if (!start) setSel(id); return; } }
    }
    if (!sel || sel === id) { choose(id); return; }
    const r = combine(posOf(b), sel, 'p:' + id);
    if (r) apply(b, r); else choose(id);
  };
  const tapEmpty = (b, lane) => {
    if (readOnly) return;
    if (sel) { const r = combine(posOf(b), sel, 'e:' + lane); if (r) apply(b, r); return; }
    haptic('select');
    setSlot(slot && slot.b === b && slot.lane === lane ? null : { b, lane });
  };
  const tapAdd = (b, lane) => { if (!sel || readOnly) return; const r = combine(posOf(b), sel, 'l:' + lane); if (r) apply(b, r); };
  const tapBench = (b) => { if (!sel || readOnly) return; const r = combine(posOf(b), sel, 'e:B'); if (r) apply(b, r); };
  const lastDrag = useRef(0);
  const root = useRef(null);
  useBoardDrag(root, !readOnly, (b, from, to) => {
    lastDrag.current = Date.now();
    const r = combine(posOf(b), from.slice(2), to);
    setSlot(null);
    if (r) { apply(b, r); if (!start) setSel(from.slice(2)); }
  });
  const fresh = () => Date.now() - lastDrag.current > 350;

  // wie licht op en wie wordt rustig: eerst de gekozen speler, dan een gekozen lege plek, dan het filter
  const look = (b, id) => {
    if (sel) return sel === id ? 'sel' : 'dim';
    if (slot && slot.b === b) return good(fitOf(players[id], slot.lane)) ? 'hl' : 'dim';
    if (slot) return 'dim';
    if (filter === 'alle') return '';
    if (filter === 'nog') return lowKid(id) ? 'hl' : 'dim';
    return good(fitOf(players[id], filter)) ? 'hl' : 'dim';
  };

  const chip = (bl, id, lane) => {
    const prev = prevOf(bl.b);
    const f = lane !== 'B' ? fitOf(players[id], lane) : null;
    const was = prev ? prev[id] || 'B' : null;
    const chg = prev && gp.grid[bl.b] ? (was === 'B' && lane !== 'B' ? 'in' : was !== 'B' && lane === 'B' ? 'out' : was !== lane ? 'mv' : '') : '';
    const lk = need && need.b === bl.b && lane !== 'B' && id !== sel ? 'outpick' : look(bl.b, id);
    const main = players[id] && players[id].main && players[id].main !== 'K' ? players[id].main : null;
    return html`<button type="button" key=${id} class=${'gc ' + lk + (chg ? ' c-' + chg : '') + (f === 'buiten' ? ' x-' + style : '') + (lk === 'sel' && f ? ' f-' + f : '')}
      data-key=${'p:' + id} data-b=${bl.b} onClick=${() => fresh() && tapChip(bl.b, id)}
      aria-label=${nick(id) + (lane === 'B' ? ', bank' : ', ' + LNAME[lane]) + (f && f !== 'neutraal' ? ', ' + FIT_TXT[f] : '') + (lk === 'sel' ? ', gekozen' : '')}
      aria-pressed=${lk === 'sel' ? 'true' : 'false'}>
      ${chg && html`<span class="gc-c" aria-hidden="true">${chg === 'in' ? '↑' : chg === 'out' ? '↓' : '↔'}</span>`}
      ${lane === 'B' && main && html`<i class="gc-dot" style=${'background:var(--pos-' + main + ')'} aria-hidden="true"></i>`}
      <span class="gc-n">${nick(id)}</span>
      ${lane !== 'B' && f && f !== 'neutraal' && html`<span class=${'gc-f ' + f} aria-hidden="true">${fitGlyph(f)}</span>`}
    </button>`;
  };
  const cell = (bl, lane) => {
    const pos = posOf(bl.b);
    const inLane = lane === 'B' ? ids.filter((id) => !(id in pos)) : ids.filter((id) => pos[id] === lane);
    const cnt = M.gpCount(pos);
    const placed = LN.reduce((a, l) => a + cnt[l], 0);
    // lege plekken: tot de basisverdeling, zolang het blok nog niet vol is
    const free = lane === 'B' ? 0 : Math.max(0, Math.min((base[lane] || 0) - inLane.length, F - placed));
    const sw = sel ? pos[sel] || 'B' : null;
    const canAdd = !readOnly && sel && lane !== 'B' && sw !== lane && !(need && need.b === bl.b);
    const benchDrop = !readOnly && lane === 'B' && sel && sw && sw !== 'B';
    const slotHere = slot && slot.b === bl.b;
    return html`<div class=${'gl gl-' + lane + (pulse && pulse.b === bl.b ? ' pulse' : '') + (bl.i === 0 && bl.p > 0 && !start ? ' seam' : '')} key=${lane + bl.b}
      data-key=${lane === 'B' ? 'e:B' : null} data-b=${lane === 'B' ? bl.b : null} onClick=${lane === 'B' ? (e) => { if (e.target === e.currentTarget || e.target.closest('.gl-drop')) tapBench(bl.b); } : null}>
      ${inLane.map((id) => chip(bl, id, lane))}
      ${Array.from({ length: free }, (_, k) => html`<button type="button" key=${'e' + k} class=${'gc empty' + (slotHere && slot.lane === lane ? ' sel' : sel ? ' target' : '')}
        data-key=${'e:' + lane} data-b=${bl.b} onClick=${() => fresh() && tapEmpty(bl.b, lane)} aria-label=${'Lege plek ' + LNAME[lane]}>
        <span class="gc-n">${start && !inLane.length && k === 0 ? 'Zet hier ' + LNAME[lane] : '+'}</span></button>`)}
      ${canAdd && html`<button type="button" class="gl-add" data-key=${'l:' + lane} data-b=${bl.b} onClick=${() => fresh() && tapAdd(bl.b, lane)}
        aria-label=${nick(sel) + ' naar ' + LTO[lane] + ': andere opstelling'} title="Andere opstelling"><${Icon} name="plus" size=${13} /></button>`}
      ${benchDrop && html`<span class="gl-drop">↓ bank</span>`}
      ${lane === 'B' && !inLane.length && !benchDrop && html`<span class="gl-none">iedereen speelt</span>`}
    </div>`;
  };
  const head = (bl) => {
    const s = stats.blocks[bl.b];
    const pos = posOf(bl.b);
    const placed = Object.keys(pos).length;
    const rel = bl.t - bl.p * L;
    const cnt = M.gpCount(pos);
    const form = s.ok && LN.some((l) => cnt[l] !== base[l]) ? M.formationText(cnt) : null;
    return html`<button type="button" key=${'h' + bl.b} class=${'gh' + (s.ok ? ' ok' : '') + (pulse && pulse.b === bl.b ? ' pulse' : '') + (bl.i === 0 && bl.p > 0 && !start ? ' seam' : '')}
      onClick=${() => { if (!start) { haptic('select'); setFieldB(bl.b); } }} aria-label=${`Blok ${bl.i + 1}, ${M.periodLabel(team, bl.p)} vanaf ${M.fmt(rel)}: bekijk op het veld`}>
      <span class="gh-t num">${start ? 'Aftrap' : wide && bl.i === 0 ? M.periodLabel(team, bl.p) : M.fmt(rel)}</span>
      <span class="gh-s">
        ${s.src === 'ai' && html`<span class="gh-ai" title="Ingevuld door de app"><${Icon} name="spark" size=${11} /></span>`}
        ${!s.ok ? (placed > F ? html`<span class="gh-over num">+${placed - F}</span>` : html`<span class="gh-open num">${placed}/${F}</span>`)
          : form ? html`<span class="gh-form num">${form}</span>`
          : bl.i === 0 && bl.p > 0 ? html`<span class="gh-rust">${breakWord(team)}</span>`
          : bl.b === 0 ? html`<${Icon} name="check" size=${12} />`
          : s.swaps || s.moves ? html`<span class="num">${s.swaps ? '⇅' + s.swaps : ''}${s.moves ? ' ↔' + s.moves : ''}</span>` : html`<span class="gh-same">=</span>`}
      </span>
    </button>`;
  };
  const lab = (lane) => {
    const f = sel && lane !== 'B' && lane !== 'K' ? fitOf(players[sel], lane) : null;
    return html`<span class=${'gb-lab gb-lab-' + lane + (f && f !== 'neutraal' ? ' fit-' + f : '')} key=${'lab' + lane}>
      ${f && f !== 'neutraal' && html`<i class=${'gb-fit ' + f} title=${FIT_TXT[f]}>${fitGlyph(f)}</i>`}<span>${LCAP[lane]}</span></span>`;
  };

  const fill = async () => {
    const prev = snap(gp);
    setBusy(true);
    const n = await think(() => mutate((m, t) => M.gpFill(m, t)), 700);
    setBusy(false);
    haptic('success');
    if (n) setHist((h) => h.concat([prev]).slice(-30));
    toast(n ? `✦ ${n} ${plural(n, 'blok', 'blokken')} ingevuld. Jouw blokken bleven staan.` : 'Alles is al door jou ingevuld.', n ? restore(prev) : undefined);
  };
  const keeper = match.keeperId;
  const allOk = stats.blocks.every((b) => b.ok);
  const cols = shown.length;
  const grid = html`<div class=${'gb' + (start ? ' gb-start' : '') + (sel ? ' selecting' : '') + (cols > 10 ? ' dense' : '')} ref=${root} style=${'--cols:' + cols}>
    <span class="gb-corner"></span>
    ${shown.map(head)}
    ${LN.map((lane) => html`${lab(lane)}${shown.map((bl) => cell(bl, lane))}`)}
    ${keeper && html`${lab('K')}<button type="button" class="gk-row" style=${'grid-column: 2 / span ' + cols} onClick=${() => toast('De keeper kies je bij het voorbereiden. Keeper per periode komt later.')}>
      <span class="kbadge">K</span><b>${nick(keeper)}</b><span>${start ? 'keept' : 'keept de hele wedstrijd'}</span></button>`}
    ${lab('B')}${shown.map((bl) => cell(bl, 'B'))}
  </div>`;

  const sk = sel ? stats.kids[sel] : null;
  const wins = useMemo(() => (readOnly || start || !gp.base ? [] : M.gpPureWins(match, team, 9)), [match, team, readOnly, start]);
  const calmStyle = style !== 'sterk';
  const pushHist = (prev) => setHist((h) => h.concat([prev]).slice(-30));
  const impEl = (float) => impact && !start && gp.base && html`<${ImpactLine} match=${match} team=${team} impact=${impact} stats=${stats} float=${float} onOpen=${() => { haptic('select'); setImpOpen(true); }} />`;
  const rules = M.effRules(match, team);
  const benchRule = rules.maxBenchOn ? (rules.maxBench || 10) * 60 : null;
  const mainOf = (id) => (players[id] && players[id].main && players[id].main !== 'K' ? players[id].main : null);
  const kidLvl = (id) => { const k = stats.kids[id]; return !gp.base || tb <= 0 ? '' : k.blocks < Math.floor(tb + 1e-9) ? 'low' : k.blocks > Math.ceil(tb - 1e-9) ? 'high' : 'ok'; };
  const needBl = need ? blocks[need.b] : null;
  const hint = needBl ? `Eén te veel in het veld (${M.periodLabel(team, needBl.p)} ${M.fmt(needBl.t - needBl.p * L)}): tik wie eruit gaat.`
    : start
    ? (gp.base ? 'Pas de startopstelling aan; de wissels per blok blijven zoals ze zijn.' : 'Tik een speler op de bank en dan een plek (of sleep hem). Is de opstelling vol, dan loopt die door tot het eind.')
    : readOnly ? null
    : sel ? `Tik in een blok waar ${nick(sel)} speelt: op wie eruit gaat, iemand om mee te ruilen, een lege plek, de bank, of ＋ voor een extra plek.`
    : slot ? 'Kies wie hier past: groen omrand speelt hier in zijn kracht.'
    : gp.base && !stats.blocks.some((x) => x.swaps || x.moves) ? 'Tik een speler: je ziet hem over de hele wedstrijd. Tik dan in elk blok waar hij moet spelen.' : null;

  return html`<section class="gp-board">
    ${start && html`<div class="gp-sh"><h1 class="rt-h">Startopstelling</h1>
      ${hist.length > 0 && !readOnly && html`<button type="button" class="gp-undo" onClick=${undo} aria-label="Ongedaan maken"><${Icon} name="undo" size=${18} /></button>`}</div>`}
    ${!start && !gp.base && html`<div class="card gp-empty"><b>Eerst de startopstelling</b><span class="sub">Die loopt door tot het eind; daarna wissel je per blok.</span>
      <button type="button" class="btn primary" onClick=${toStart}>Naar de startopstelling</button></div>`}
    ${!start && gp.base && html`<div class="gp-sum">
      <span class="gs-k"><small>Speeltijd</small><b class="num">${mins(stats.min)}–${mins(stats.max)}′</b></span>
      <span class="gs-k"><small>Doel p.p.</small><b class="num">${String(Math.round(tb * 10) / 10).replace('.', ',')}</b><small>blokken</small></span>
      <span class="gs-k"><small>Langst kant</small><b class="num">${mins(stats.maxBench)}′</b></span>
      ${!readOnly && html`<button type="button" class=${'ai-btn small' + (busy ? ' busy' : '')} onClick=${fill} disabled=${busy}>
        <span class="ai-btn-in"><${AiMark} size=${15} /><span>${busy ? 'Denkt…' : 'Vul aan'}</span></span></button>`}
      ${wide && !readOnly && html`<button type="button" class="gp-undo" onClick=${undo} disabled=${!hist.length} aria-label="Ongedaan maken"><${Icon} name="undo" size=${18} /></button>`}
    </div>`}
    ${wins.length > 0 && html`<button type="button" class=${'gp-win' + (calmStyle ? ' calm' : '')} onClick=${() => { haptic('select'); setWinsOpen(true); }}>
      <${AiMark} size=${15} /><span>${calmStyle ? `${wins.length} ${plural(wins.length, 'linieruil', 'linieruilen')} in hun kracht` : `✦ ${wins.length} gratis ${plural(wins.length, 'verbetering', 'verbeteringen')}`}</span><${Icon} name="chev" size=${14} /></button>`}
    ${!start && gp.base && !wide && html`<div class="gp-tools">
      ${html`<div class="gm-ps">${Array.from({ length: team.periods }, (_, q) => html`<button type="button" key=${q} class=${'gm-p' + (q === p ? ' on' : '')} onClick=${() => { haptic('select'); setP(q); setSlot(null); }}
        aria-label=${M.periodLabel(team, q)} aria-pressed=${q === p ? 'true' : 'false'}>
        <span class="gm-l">${M.periodLabel(team, q)}</span>
        <span class="gm-bs">${stats.blocks.filter((b) => b.p === q).map((b) => html`<i key=${b.b} class=${(b.ok ? 'ok' : b.empty ? '' : 'half') + (sel && gp.grid[b.b] && sel in gp.grid[b.b] ? ' me' : '')}></i>`)}</span>
      </button>`)}</div>`}
      ${!readOnly && html`<button type="button" class="gp-undo" onClick=${undo} disabled=${!hist.length} aria-label="Ongedaan maken"><${Icon} name="undo" size=${18} /></button>`}
    </div>`}
    ${!start && gp.base && !wide && html`<span class="gm-rot"><${Icon} name="rotate" size=${14} />Draai je telefoon voor de hele wedstrijd</span>`}
    ${(start || gp.base) && html`<div class=${'gp-work' + (wide ? ' wide' : '')}>
      ${!start && html`<div class="gp-filters" role="toolbar" aria-label="Filter">
        ${FILTERS.map(([k, label]) => html`<button type="button" key=${k} class=${'gf' + (filter === k && !sel ? ' on' : '')} aria-pressed=${filter === k ? 'true' : 'false'}
          onClick=${() => { haptic('select'); setFilter(k); setSel(null); setSlot(null); setNeed(null); }}>${k !== 'alle' && k !== 'nog' && html`<i style=${'background:var(--pos-' + k + ')'}></i>`}${label}</button>`)}
      </div>`}
      <div class="gp-gridwrap">${grid}</div>
    </div>`}
    ${!sel && fieldB == null && impEl(false)}
    ${hint && html`<p class="gp-hint" key=${hint}>${hint}</p>`}
    ${(start || gp.base) && html`<div class="gp-strip" aria-label="Speeltijd per kind">
      ${ids.map((id) => {
        const k = stats.kids[id];
        const lvl = kidLvl(id);
        return html`<button type="button" key=${id} class=${'gk ' + lvl + (sel === id ? ' on' : '')} onClick=${() => choose(id)} aria-pressed=${sel === id ? 'true' : 'false'}>
          <span class="gk-n">${nick(id)}</span><span class="gk-v num"><b>${k.blocks}</b>/${blocks.length}</span><span class="gk-m num">${mins(k.sec)}′</span>
        </button>`;
      })}
    </div>`}
    ${sel && fieldB == null && impact && html`<${Portal}>${impEl(true)}</${Portal}>`}
    ${sel && fieldB == null && html`<${Portal}><div class=${'gp-selbar' + (wide ? ' wide' : '') + (match.started && !match.finished ? ' live' : '')} role="status" key=${'sb' + sel}>
      <span class="gsb-av" style=${mainOf(sel) ? '--pc:var(--pos-' + mainOf(sel) + ')' : ''}>${nick(sel).slice(0, 1)}</span>
      <span class="gsb-t">
        <span class="gsb-top"><b>${nick(sel)}</b><span class=${'gsb-lvl ' + kidLvl(sel)}>${sk.blocks}/${blocks.length} blokken · ${mins(sk.sec)}′${tb > 0 ? ` (doel ${mins(stats.target)}′)` : ''}</span></span>
        <span class="gsb-strip" aria-label="Waar hij per blok speelt">${blocks.map((bl) => { const l = gp.grid[bl.b] && gp.grid[bl.b][sel]; return html`<i key=${bl.b} class=${(l ? 'l' + l : 'off') + (bl.i === 0 && bl.p > 0 ? ' seam' : '')}></i>`; })}</span>
        <span class="gsb-fit">
          ${LN.map((l) => [l, fitOf(players[sel], l)]).filter((x) => x[1] === 'dominant' || x[1] === 'voorkeur').map(([l, f]) => html`<i key=${l} class=${f}>${fitGlyph(f)} ${LNAME[l]}</i>`)}
          ${sk.maxRun > 0 && html`<i class=${benchRule && sk.maxRun > benchRule + 1 ? 'warn' : 'info'}>langst kant ${mins(sk.maxRun)}′</i>`}
          ${sk.out >= 60 && html`<i class="warn">${mins(sk.out)}′ buiten kracht</i>`}
        </span>
      </span>
      <button type="button" class="gsb-x" onClick=${() => { setSel(null); setNeed(null); haptic('select'); }} aria-label="Klaar met deze speler"><${Icon} name="x" size=${18} /></button>
    </div></${Portal}>`}
    ${!start && allOk && gp.base && !readOnly && !sel && stats.blocks.some((x) => x.swaps || x.moves) && html`<p class="gp-ok"><${Icon} name="check" size=${15} />Alle blokken zijn vol. Kijk bij Controle hoe het plan uitpakt.</p>`}
    ${fieldB != null && html`<${BlockField} match=${match} team=${team} b=${fieldB} setB=${setFieldB} combine=${combine} apply=${apply} undo=${undo} canUndo=${hist.length > 0}
      sel=${sel} setSel=${setSel} need=${need} readOnly=${readOnly} impactEl=${impEl(false)} onClose=${() => { haptic('select'); setFieldB(null); setP(blocks[fieldB].p); }} />`}
    ${impOpen && impact && html`<${ImpactSheet} match=${match} team=${team} impact=${impact} onClose=${() => { setImpOpen(false); setImpact(null); }} onApplied=${pushHist} />`}
    ${winsOpen && html`<${WinsSheet} match=${match} team=${team} onClose=${() => setWinsOpen(false)} onApplied=${pushHist} />`}
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
      if (s.ghost && s.over) cb.current(+s.b, s.key, s.over.key);
      clear();
    };
    const tm = (e) => { if (st && st.ghost) e.preventDefault(); };
    const ctxm = (e) => { if (st) e.preventDefault(); };
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', clear);
    root.addEventListener('touchmove', tm, { passive: false });
    root.addEventListener('contextmenu', ctxm);
    return () => {
      clear();
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', clear);
      root.removeEventListener('touchmove', tm);
      root.removeEventListener('contextmenu', ctxm);
    };
  }, [enabled, ref.current]);
}

// ---------- oplossingen: tekst, gevolgen en kaart (controle, impact na een wijziging, gratis verbeteringen) ----------
const blockAt0 = (team, bl) => `${M.periodLabel(team, bl.p)} ${M.fmt(bl.t - bl.p * M.periodLen(team))}`;
function fixLabel(team, f) {
  const nick = (id) => M.nickOf(team, id);
  const end = f.bs && f.bs.length > 1 ? M.fmt(f.blockEnd.t1 - f.blockEnd.p * M.periodLen(team)) : null;
  const at = !end ? blockAt0(team, f.block) : f.blockEnd.p === f.block.p ? `${blockAt0(team, f.block)}–${end}` : `${blockAt0(team, f.block)} t/m ${M.periodLabel(team, f.blockEnd.p)} ${end}`;
  if (f.what.kind === 'swap') return `${at}: ${nick(f.what.in)} erin voor ${nick(f.what.out)}`;
  return `${at}: ${nick(f.what.a)} naar ${LNAME[f.pos[f.what.a]]}, ${nick(f.what.b)} naar ${LNAME[f.pos[f.what.b]]}`;
}
function fixImpact(team, f, x) {
  const nick = (id) => M.nickOf(team, id);
  const cls = (better) => (better ? 'up' : 'down');
  const out = [];
  // linieruil zonder cijfers (gratis verbetering): wat het voor de twee spelers betekent
  if (!f.after) {
    const pl = {}; for (const p of team.players) pl[p.id] = p;
    for (const id of [f.what.a, f.what.b]) {
      const was = fitOf(pl[id], f.pos[id === f.what.a ? f.what.b : f.what.a]), now = fitOf(pl[id], f.pos[id]);
      if (was !== now) out.push({ t: `${nick(id)}: ${FIT_TXT[was] || 'gewoon'} → ${FIT_TXT[now] || 'gewoon'}`, cls: cls(M.FIT[now] > M.FIT[was]) });
    }
    out.push({ t: f.bs && f.bs.length > 1 ? `${f.bs.length} blokken · minuten blijven gelijk` : 'minuten blijven gelijk', cls: '' });
    return out;
  }
  const a = f.before, z = f.after;
  // eerst wat het voor dit punt doet
  const ka = x && a.kids[x.id], kz = x && z.kids[x.id];
  if (ka && kz && x.kind === 'bench') out.push({ t: `${nick(x.id)} langst kant ${halfMin(ka.maxRun)}′ → ${halfMin(kz.maxRun)}′`, cls: cls(kz.maxRun < ka.maxRun) });
  if (ka && kz && x.kind === 'time') out.push({ t: `${nick(x.id)} ${mins(ka.sec)}′ → ${mins(kz.sec)}′`, cls: cls(kz.sec > ka.sec) });
  if (ka && kz && x.kind === 'kracht') out.push({ t: `${nick(x.id)} buiten kracht ${mins(ka.out)}′ → ${mins(kz.out)}′`, cls: cls(kz.out < ka.out) });
  if (mins(z.maxBench) !== mins(a.maxBench)) out.push({ t: `langst kant ${mins(a.maxBench)}′ → ${mins(z.maxBench)}′`, cls: cls(z.maxBench < a.maxBench) });
  if (mins(z.min) !== mins(a.min) || mins(z.max) !== mins(a.max)) out.push({ t: `speeltijd ${mins(a.min)}–${mins(a.max)}′ → ${mins(z.min)}–${mins(z.max)}′`, cls: cls(z.max - z.min < a.max - a.min) });
  const k0 = Math.round(f.beforeKracht * 100), k1 = Math.round(f.kracht * 100);
  if (k0 !== k1) out.push({ t: `in hun kracht ${k0}% → ${k1}%`, cls: cls(k1 > k0) });
  if (f.what.kind === 'swap') out.push({ t: `${nick(f.what.in)} +${halfMin(f.block.len)}′ · ${nick(f.what.out)} −${halfMin(f.block.len)}′`, cls: '' });
  return out;
}
// Eén oplossing als kaart. Pure winst (niets slechter, iets beter) krijgt een AI-rand en een glinstering;
// bij Gebalanceerd rustiger, omdat afwisselen daar ook ontwikkeling kan zijn.
function FixCard({ team, f, x = null, n, calm, onDo }) {
  return html`<button type="button" class=${'gd-fix' + (f.pure ? ' pure' + (calm ? ' calm' : '') : '')} onClick=${onDo}>
    <span class="gf-n">${f.pure && !calm ? html`<${Icon} name="spark" size=${13} />` : n}</span>
    <span class="gf-b">${f.pure && html`<span class="gf-pure">${calm ? 'Geen nadelen' : '✦ Pure winst'}</span>`}<b>${fixLabel(team, f)}</b>
      <span class="gf-i">${fixImpact(team, f, x).map((c, k) => html`<i key=${k} class=${c.cls}>${c.t}</i>`)}</span></span>
    <span class="gf-go">Doe</span>
  </button>`;
}
const applyFixWith = (match, team, f, onApplied) => {
  const prev = snap(match.gameplan);
  mutate((m, t) => M.gpApplyFix(m, t, f));
  if (onApplied) onApplied(prev);
  haptic('success');
  toast('Aangepast: ' + fixLabel(team, f), restore(prev));
};

// Wat een wijziging doet, in één regel (onderin): het belangrijkste gevolg, of een rustig ✓.
function impactOf(match, team, before, st) {
  const nick = (id) => M.nickOf(team, id);
  const c = M.gpCompare(match, team, before, st);
  const ids = Object.keys(st.kids).filter((id) => before.kids[id]);
  if (c.worse.indexOf('bench') !== -1) {
    const who = ids.slice().sort((a, b) => (st.kids[b].maxRun - before.kids[b].maxRun) - (st.kids[a].maxRun - before.kids[a].maxRun))[0];
    return { c, cls: 'warn', t: `${nick(who)} nu ${mins(st.kids[who].maxRun)}′ aaneen aan de kant` };
  }
  if (c.worse.indexOf('time') !== -1) return { c, cls: 'warn', t: `Speeltijd nu ${mins(st.min)}–${mins(st.max)}′ (was ${mins(before.min)}–${mins(before.max)}′)` };
  if (c.worse.indexOf('kracht') !== -1) return { c, cls: 'warn', t: `In hun kracht ${Math.round(c.ka * 100)}% → ${Math.round(c.kb * 100)}%` };
  if (c.further.length) { const id = c.further[0]; return { c, cls: 'info', t: `${nick(id)} nu ${mins(st.kids[id].sec)}′ (doel ${mins(st.target)}′)` }; }
  if (c.outMore.length) { const id = c.outMore[0]; return { c, cls: 'info', t: `${nick(id)} speelt vaker buiten zijn kracht` }; }
  if (c.better.length) {
    const b0 = c.better[0];
    const t = b0 === 'time' ? `speeltijd ${mins(before.min)}–${mins(before.max)}′ → ${mins(st.min)}–${mins(st.max)}′` : b0 === 'bench' ? `langst kant ${mins(before.maxBench)}′ → ${mins(st.maxBench)}′` : `in hun kracht ${Math.round(c.ka * 100)}% → ${Math.round(c.kb * 100)}%`;
    return { c, cls: 'good', t: `✓ Beter: ${t}` };
  }
  return { c, cls: 'ok', t: '✓ Niets is slechter geworden' };
}
function ImpactLine({ match, team, impact, stats, float = false, onOpen }) {
  const im = impactOf(match, team, impact.before, stats);
  return html`<button type="button" class=${'gp-imp ' + im.cls + (float ? ' float' : '')} key=${'imp' + impact.k} onClick=${onOpen}>
    <span class="gp-imp-t">${im.t}</span><span class="gp-imp-more">${im.cls === 'warn' || im.cls === 'info' ? 'Oplossen' : 'Gevolgen'}<${Icon} name="chev" size=${13} /></span>
  </button>`;
}

// Gevolgen van je wijziging: voor en na, en hooguit drie oplossingen die jouw blok laten staan.
function ImpactSheet({ match, team, impact, onClose, onApplied }) {
  const nick = (id) => M.nickOf(team, id);
  const st = useMemo(() => M.gpStats(match, team), [match, team]);
  const a = impact.before;
  const c = M.gpCompare(match, team, a, st);
  const blocks = M.gpBlocks(match, team, match.gameplan.n);
  const bl = blocks[impact.b];
  const calm = M.planStyle(match, team) !== 'sterk';
  const [fixes, setFixes] = useState(null);
  useEffect(() => {
    const ids = Object.keys(st.kids);
    const worst = ids.slice().sort((x, y) => st.kids[y].maxRun - st.kids[x].maxRun)[0];
    const focus = [...new Set([...(impact.ids || []), ...c.further, ...c.outMore, worst])];
    const t = setTimeout(() => setFixes(M.gpImprove(match, team, { lock: [impact.b], focus, max: 3 })), reduced() ? 0 : 240);
    return () => clearTimeout(t);
  }, [match]);
  const row = (label, x, y, better) => html`<div class=${'gi-row' + (x === y ? '' : better ? ' up' : ' down')}><span>${label}</span><b class="num">${x}${x !== y ? html` → ${y}` : ''}</b></div>`;
  const kids = Object.keys(st.kids).filter((id) => a.kids[id] && Math.abs(st.kids[id].sec - a.kids[id].sec) >= 30);
  return html`<${Sheet} onClose=${onClose} label="Gevolgen van je wijziging">
    <div class="col" style="gap:2px"><span class="h2" style="font-size:22px">Gevolgen van je wijziging</span>
      <span class="sub">${blockAt0(team, bl)} · jouw blok blijft zoals je het zette</span></div>
    <div class=${'gi-verdict ' + (c.worse.length ? 'warn' : 'ok')}>${c.worse.length ? 'Er wordt iets slechter. Hieronder wat je kunt doen.' : c.pure ? '✓ Alleen winst.' : '✓ Niets is slechter geworden.'}</div>
    <div class="gi-rows">
      ${row('Speeltijd', `${mins(a.min)}–${mins(a.max)}′`, `${mins(st.min)}–${mins(st.max)}′`, st.max - st.min < a.max - a.min)}
      ${row('Langst aan de kant', `${mins(a.maxBench)}′`, `${mins(st.maxBench)}′`, st.maxBench < a.maxBench)}
      ${row('In hun kracht', `${Math.round(c.ka * 100)}%`, `${Math.round(c.kb * 100)}%`, c.kb > c.ka)}
      ${kids.length > 0 && html`<div class="gi-kids">${kids.map((id) => html`<span key=${id} class=${st.kids[id].sec > a.kids[id].sec ? 'up' : 'down'}>${nick(id)} ${st.kids[id].sec > a.kids[id].sec ? '+' : '−'}${halfMin(Math.abs(st.kids[id].sec - a.kids[id].sec))}′</span>`)}</div>`}
    </div>
    <div class="gd-fixes">
      ${fixes == null ? html`<p class="gd-nofix gi-think"><${AiMark} size=${15} /> De app zoekt een betere zet…</p>`
        : fixes.length ? fixes.map((f, j) => html`<${FixCard} key=${j} team=${team} f=${f} n=${j + 1} calm=${calm} onDo=${() => { applyFixWith(match, team, f, onApplied); onClose(); }} />`)
        : html`<p class="gd-nofix">Geen betere zet gevonden zonder jouw blok te veranderen.</p>`}
    </div>
    <button type="button" class="btn primary" onClick=${onClose}>OK, terug naar het bord</button>
  </${Sheet}>`;
}

// Gratis verbeteringen: linieruilen binnen een blok waarbij niemand minder in zijn kracht speelt.
function WinsSheet({ match, team, onClose, onApplied }) {
  const wins = useMemo(() => M.gpPureWins(match, team, 3), [match, team]);
  const calm = M.planStyle(match, team) !== 'sterk';
  useEffect(() => { if (!wins.length) onClose(); }, [wins.length]);
  return html`<${Sheet} onClose=${onClose} label="Gratis verbeteringen">
    <div class="col" style="gap:2px"><span class="h2" style="font-size:22px">${calm ? 'Linieruilen in hun kracht' : '✦ Gratis verbeteringen'}</span>
      <span class="sub">Twee spelers in hetzelfde blok ruilen van linie: geen van beiden speelt minder in zijn kracht en de minuten blijven gelijk.${calm ? ' Bij Gebalanceerd mag afwisselen ook; kies zelf.' : ''}</span></div>
    <div class="gd-fixes">${wins.map((f, j) => html`<${FixCard} key=${f.key || f.b + f.what.a + f.what.b} team=${team} f=${f} n=${j + 1} calm=${calm} onDo=${() => applyFixWith(match, team, f, onApplied)} />`)}</div>
    <button type="button" class="btn plain" onClick=${onClose}>Klaar</button>
  </${Sheet}>`;
}

// Een blok op het veld. Schuiven zoals live: bank op veld = wissel, veld op veld = ruilen van linie, naar een
// lege plek (+) = andere opstelling. Een wijziging geldt alleen voor dit blok. Veeg over het veld naar het blok
// ervoor of erna; de gekozen speler blijft gekozen. Zelfde ongedaan-knop als het bord.
function BlockField({ match, team, b, setB, combine, apply, undo, canUndo, sel, setSel, need, readOnly, impactEl, onClose }) {
  const gp = match.gameplan;
  const blocks = M.gpBlocks(match, team, gp.n);
  const bl = blocks[b];
  const L = M.periodLen(team);
  const nick = (id) => M.nickOf(team, id);
  const players = useMemo(() => { const o = {}; for (const p of team.players) o[p.id] = p; return o; }, [team]);
  const ids = M.gpFieldIds(match);
  const base = M.gpBaseLines(match, team);
  const F = ['V', 'M', 'A'].reduce((x, l) => x + (base[l] || 0), 0);
  const stats = useMemo(() => M.gpStats(match, team), [match, team]);
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const pos = gp.grid[b] || {};
  const ok = M.gpComplete(match, team, pos);
  const prev = b > 0 && gp.grid[b - 1] ? gp.grid[b - 1] : null;
  const cnt = M.gpCount(pos);
  const placed = Object.keys(pos).length;
  const view = useMemo(() => {
    const lines = ok ? { V: cnt.V, M: cnt.M, A: cnt.A } : { V: Math.max(base.V || 0, cnt.V), M: Math.max(base.M || 0, cnt.M), A: Math.max(base.A || 0, cnt.A) };
    if (ok) {
      // zoals het plan het neerzet (met links en rechts, die blijven staan tussen de blokken)
      const c = cards.filter((x) => x.t <= bl.t + 0.5).pop();
      if (c && Object.keys(c.pos).length === placed && Object.keys(pos).every((id) => c.pos[id] === pos[id])) return { slots: c.slots, lines: c.lines || lines };
    }
    return { slots: M.makeSlots(pos, lines, players), lines };
  }, [match, team, b]);
  const bench = ids.filter((id) => !(id in pos));
  const chg = (id) => { if (!prev || !gp.grid[b]) return ''; const was = prev[id] || 'B', now = pos[id] || 'B'; return was === now ? '' : was === 'B' ? 'in' : now === 'B' ? 'out' : 'mv'; };
  const tb = stats.targetBlocks;
  const lvl = (id) => { const k = stats.kids[id]; return tb <= 0 ? '' : k.blocks < Math.floor(tb + 1e-9) ? 'low' : k.blocks > Math.ceil(tb - 1e-9) ? 'high' : 'ok'; };

  // de punten van dit blok: vol of niet, wie hier te lang aan de kant zit, wie buiten zijn kracht speelt
  const rules = M.effRules(match, team);
  const rule = rules.maxBenchOn ? (rules.maxBench || 10) * 60 : null;
  const pts = [];
  if (!ok) pts.push({ cls: 'warn', t: placed < F ? `Nog ${F - placed} ${plural(F - placed, 'plek', 'plekken')} vrij: sleep een bankspeler op een plek` : placed > F ? 'Eén te veel in het veld: tik wie eruit gaat' : 'Elke linie heeft minstens één speler nodig' });
  if (rule && gp.grid[b]) {
    for (const id of bench) {
      let run = 0;
      for (let k = b; k >= 0; k--) { const g = gp.grid[k]; if (!g) continue; if (id in g) break; run += blocks[k].len; }
      if (run > rule + 1) pts.push({ cls: 'warn', t: `${nick(id)} zit hier al ${mins(run)}′ aan de kant` });
    }
  }
  const outK = Object.keys(pos).filter((id) => fitOf(players[id], pos[id]) === 'buiten');
  if (outK.length) pts.push({ cls: 'info', t: `${outK.map(nick).join(', ').replace(/, ([^,]*)$/, ' en $1')} ${outK.length === 1 ? 'speelt' : 'spelen'} buiten ${outK.length === 1 ? 'zijn' : 'hun'} kracht` });
  if (!pts.length) pts.push({ cls: 'ok', t: '✓ Dit blok klopt' });

  // slepen zoals live; de doelen volgen dezelfde regels als het bord
  const zone = useRef(null);
  const keyOf = (x) => (x.slice(0, 5) === 'line:' ? 'l:' + x.split(':')[1] : 'p:' + x);
  const tryDrop = (a, x) => {
    const lane = x.slice(0, 5) === 'line:' ? x.split(':')[1] : null;
    // een lege plek in een blok dat nog niet vol is: gewoon neerzetten
    if (lane && !(a in pos) && placed < F) return combine(pos, a, 'e:' + lane);
    return combine(pos, a, keyOf(x));
  };
  const hint = (a, x) => {
    const r = tryDrop(a, x);
    if (!r) return null;
    const lane = x.slice(0, 5) === 'line:' ? x.split(':')[1] : null;
    if (lane) return r.kind === 'place' ? `${nick(a)} naar ${LTO[lane]}` : r.kind === 'extra' ? `Extra plek ${LTO[lane]} · daarna wie eruit` : `Naar ${LTO[lane]} · ${M.formationText(M.gpCount(r.pos))}`;
    if (r.kind === 'move') return `Ruil van linie met ${nick(x)}`;
    return a in pos ? `${nick(x)} erin` : `Erin voor ${nick(x)}`;
  };
  useDragSwap(zone, !readOnly, (a, x) => { const r = tryDrop(a, x); if (r) { apply(b, r); setSel(x.slice(0, 5) === 'line:' || !(a in pos) ? a : sel); } }, hint, { benchSlots: true });
  // vegen over het veld: naar het blok ervoor of erna
  useEffect(() => {
    const el = zone.current;
    if (!el) return undefined;
    let st = null;
    const down = (e) => { if (e.target.closest('[data-pid], .keeperspot, .benchrow, button')) return; st = { x: e.clientX, y: e.clientY }; };
    const up = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y; st = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      go(dx < 0 ? 1 : -1);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', () => { st = null; });
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); };
  }, [b]);
  // toetsenbord: Esc = terug naar de tabel, pijltjes = blok ervoor of erna
  useEffect(() => {
    const key = (e) => {
      if (document.querySelector('.sheet-backdrop')) return;
      if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [b]);
  const [dir, setDir] = useState(0);
  const go = (d) => { const n = b + d; if (n < 0 || n >= blocks.length) { haptic('no'); return; } haptic('select'); setDir(d); setB(n); };
  const tapField = (id) => {
    if (readOnly) return;
    if (need && need.b === b && id !== sel) { const np = { ...pos }; delete np[id]; apply(b, { pos: np, kind: 'bench' }); return; }
    haptic('select'); setSel(sel === id ? null : id);
  };
  const below = (id) => {
    const c = chg(id), f = fitOf(players[id], pos[id]);
    if (!c && (f === 'neutraal' || !f)) return null;
    return html`<span class="bf-tag">${c === 'in' ? html`<i class="in">erin</i>` : c === 'mv' ? html`<i class="mv">was ${LNAME[prev[id]]}</i>` : ''}${f && f !== 'neutraal' && html`<i class=${'fit ' + f}>${fitGlyph(f)}</i>`}</span>`;
  };
  const rel = bl.t - bl.p * L, rel1 = bl.t1 - bl.p * L;
  const sk = sel ? stats.kids[sel] : null;
  return html`<${Portal}><div class="bfv" role="dialog" aria-label="Blok op het veld">
    <div class="bfv-top">
      <button type="button" class="iconbtn" onClick=${onClose} aria-label="Terug naar de tabel"><${Icon} name="back" /></button>
      <button type="button" class="bfv-arr" onClick=${() => go(-1)} disabled=${b === 0} aria-label="Blok ervoor"><${Icon} name="chev" size=${18} /></button>
      <div class=${'bfv-t' + (dir ? (dir > 0 ? ' fwd' : ' back') : '')} key=${'t' + b}>
        <b>${M.periodLabel(team, bl.p)} · <span class="num">${M.fmt(rel)}–${M.fmt(rel1)}</span></b>
        <small>Game plan · alleen dit blok</small>
      </div>
      <button type="button" class="bfv-arr next" onClick=${() => go(1)} disabled=${b === blocks.length - 1} aria-label="Blok erna"><${Icon} name="chev" size=${18} /></button>
      ${!readOnly && html`<button type="button" class="gp-undo" onClick=${undo} disabled=${!canUndo} aria-label="Ongedaan maken"><${Icon} name="undo" size=${18} /></button>`}
    </div>
    <div class="bfv-dots" role="tablist" aria-label="Blokken">${blocks.map((x) => { const s = stats.blocks[x.b]; return html`<button type="button" key=${x.b} role="tab" aria-selected=${x.b === b ? 'true' : 'false'}
      class=${'bfd' + (x.b === b ? ' on' : '') + (s.ok ? ' ok' : s.empty ? '' : ' half') + (x.i === 0 && x.p > 0 ? ' seam' : '') + (sel && gp.grid[x.b] && sel in gp.grid[x.b] ? ' me' : '')}
      onClick=${() => { if (x.b !== b) { setDir(x.b > b ? 1 : -1); haptic('select'); setB(x.b); } }} aria-label=${blockAt0(team, x)}><i></i></button>`; })}</div>
    <div class="bfv-pts" key=${'p' + b}>${pts.slice(0, 2).map((x, k) => html`<span key=${k} class=${'bfp ' + x.cls}>${x.t}</span>`)}</div>
    ${sel && sk && html`<div class="bfv-sel"><span class="gsb-av">${nick(sel).slice(0, 1)}</span><b>${nick(sel)}</b>
      <span class=${'gsb-lvl ' + lvl(sel)}>${sk.blocks}/${blocks.length} blokken · ${mins(sk.sec)}′</span>
      <span class="gsb-strip">${blocks.map((x) => { const l = gp.grid[x.b] && gp.grid[x.b][sel]; return html`<i key=${x.b} class=${(l ? 'l' + l : 'off') + (x.b === b ? ' now' : '') + (x.i === 0 && x.p > 0 ? ' seam' : '')}></i>`; })}</span>
      <button type="button" class="gsb-x" onClick=${() => { haptic('select'); setSel(null); }} aria-label="Klaar met deze speler"><${Icon} name="x" size=${16} /></button></div>`}
    <div class="bfv-zone" ref=${zone}>
      <div class="bfv-field">
        <${Field} slots=${view.slots} lines=${view.lines} keeperId=${match.keeperId} nick=${nick} height="100%"
          onTap=${tapField} onKeeper=${() => toast('De keeper kies je bij het voorbereiden. Keeper per periode komt later.')}
          selected=${sel && sel in pos ? sel : null} muted=${sel && sel in pos ? Object.keys(pos).filter((x) => x !== sel) : need && need.b === b ? [] : []}
          dashed=${need && need.b === b ? Object.keys(pos).filter((x) => x !== sel) : []}
          below=${below} accent=${accentFor(team)} formable=${!readOnly} />
      </div>
      <div class="benchrow">
        <span class="label">Bank</span>
        <${BenchScroll}>
          ${bench.map((id) => html`<button type="button" key=${id} data-pid=${id} class=${'benchpill' + (sel === id ? ' bf-on' : '') + (chg(id) === 'out' ? ' wasout' : '')}
            onClick=${() => { if (!readOnly) { haptic('select'); setSel(sel === id ? null : id); } }}>${nick(id)}<span class=${'t ' + lvl(id)}>${chg(id) === 'out' ? 'eruit' : `${stats.kids[id].blocks}/${blocks.length}`}</span></button>`)}
          ${!bench.length && html`<span class="small">iedereen speelt</span>`}
        </${BenchScroll}>
      </div>
    </div>
    ${impactEl}
    <p class="bfv-hint">${readOnly ? 'Alleen bekijken tijdens de wedstrijd.' : 'Sleep op het veld om dit blok aan te passen. Veeg opzij voor het blok ervoor of erna.'}</p>
  </div></${Portal}>`;
}

// ---------- rooster per kind (voor het standaardplan én in de controle) ----------
export function Rooster({ match, team, cards: given, onKid = null }) {
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
    ${order.map((id, k) => html`<button type="button" class="rt-row" key=${id} style=${'--i:' + k} onClick=${onKid ? () => onKid(id) : null} disabled=${!onKid}><span class="rr-n">${nick(id)}</span><span class="rr-bar">
      ${segsOf(id).map((s) => html`<i class=${s.line ? 'l' + s.line : 'off'} style=${`flex:${s.t1 - s.t}` + (s.t > 0 && s.t % L === 0 ? ';margin-left:3px' : '')}></i>`)}
    </span><span class="rr-m num">${mins(played[id])}′</span></button>`)}
    <div class="rt-legend2"><span><i class="lV"></i>voor</span><span><i class="lM"></i>midden</span><span><i class="lA"></i>achter</span><span><i class="off"></i>aan de kant</span></div>
  </div>`;
}

// Drie ringen zoals een activiteitenmeter: eerlijk, aan de kant en in hun kracht.
function Rings({ vals }) {
  const R = [46, 35, 24];
  return html`<svg class="gr-rings" viewBox="0 0 112 112" aria-hidden="true">
    ${vals.map((x, i) => {
      const r = R[i]; const C = 2 * Math.PI * r;
      return html`<g key=${i}>
        <circle cx="56" cy="56" r=${r} class="gr-track" style=${'stroke:' + x.color} />
        <circle cx="56" cy="56" r=${r} class="gr-arc" transform="rotate(-90 56 56)"
          style=${`stroke:${x.color};stroke-dasharray:${C.toFixed(1)};--c:${C.toFixed(1)};--off:${(C * (1 - Math.max(0.02, Math.min(1, x.v)))).toFixed(1)};animation-delay:${150 + i * 140}ms`} />
      </g>`;
    })}
  </svg>`;
}

// ---------- laatste stap: controle (dashboard) ----------
function Controle({ match, team, goTo }) {
  const nick = (id) => M.nickOf(team, id);
  const gp = match.gameplan;
  const rep = useMemo(() => M.ownReport(match, team), [match, team]);
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const stats = useMemo(() => (gp ? M.gpStats(match, team) : null), [match, team]);
  const style = M.planStyle(match, team);
  const k = rep.kpi;
  const L = M.periodLen(team);
  const END = team.periods * L;
  const [open, setOpen] = useState(null);
  const blocks = gp ? M.gpBlocks(match, team, gp.n) : [];
  const blockAt = (t) => { const x = blocks.filter((b) => b.t <= (t || 0)).pop(); return x ? x.b : 0; };
  const when = (t) => { const q = Math.min(team.periods - 1, Math.floor(t / L)); return M.periodLabel(team, q) + ' ' + M.fmt(t - q * L); };
  const open0 = stats ? stats.blocks.filter((b) => !b.ok) : [];
  const ids = rep.ids;
  const played = rep.played;
  // minuten per linie per kind (voor de grafiek)
  const perLine = useMemo(() => {
    const o = {};
    for (const id of ids) o[id] = { V: 0, M: 0, A: 0 };
    cards.forEach((c, i) => { const t1 = i + 1 < cards.length ? cards[i + 1].t : END; for (const id in c.pos) if (o[id]) o[id][c.pos[id]] += Math.max(0, t1 - c.t); });
    return o;
  }, [cards]);
  const byPlay = ids.slice().sort((a, b) => played[b] - played[a]);
  const lo = byPlay[byPlay.length - 1], hi = byPlay[0];
  const longBench = stats && k.bench.rule ? ids.filter((id) => stats.kids[id] && stats.kids[id].maxRun > k.bench.rule + 1) : [];
  const names = (list) => list.slice(0, 3).map(nick).join(', ').replace(/, ([^,]*)$/, ' en $1') + (list.length > 3 ? ' e.a.' : '');
  // de conclusie, met wat er precies speelt
  const reasons = [];
  if (open0.length) reasons.push(`${open0.length} ${plural(open0.length, 'blok is', 'blokken zijn')} nog niet vol; daar wordt niet gewisseld.`);
  if (!k.time.ok) reasons.push(`Het verschil in speeltijd is ${mins(k.time.spread)} min (marge ${mins(k.time.marge)}): ${nick(lo)} speelt ${mins(played[lo])} min, ${nick(hi)} ${mins(played[hi])} min.`);
  if (!k.bench.ok) {
    const who = longBench.length ? longBench : [k.bench.who];
    reasons.push(`${names(who)} ${who.length === 1 ? 'zit' : 'zitten'} tot ${mins(k.bench.max)} min aaneen aan de kant (regel ${mins(k.bench.rule)}).`);
  }
  if (k.kracht.pct < 0.9) reasons.push(`${100 - Math.round(k.kracht.pct * 100)}% van de speeltijd staan kinderen buiten hun kracht.`);
  const ok = !open0.length && k.time.ok && k.bench.ok;
  const title = open0.length ? 'Nog niet af' : !k.time.ok ? 'Speeltijd nog niet eerlijk' : !k.bench.ok ? 'Iemand zit te lang aan de kant'
    : k.kracht.pct < 0.9 ? 'Eerlijk, niet iedereen in zijn kracht' : style === 'sterk' ? 'Sterk en eerlijk' : 'Eerlijk en in balans';
  const sub = reasons.length ? reasons.join(' ') : `Iedereen speelt ${mins(k.time.min)}–${mins(k.time.max)} min en zit hooguit ${mins(k.bench.max)} min aaneen aan de kant.`;
  const rings = [
    { v: k.time.spread <= k.time.marge ? 1 : k.time.marge / Math.max(1, k.time.spread), color: '#4ADE80', label: 'Eerlijk', val: `${mins(k.time.min)}–${mins(k.time.max)}′` },
    { v: !k.bench.rule ? 1 : k.bench.max <= k.bench.rule ? 1 : k.bench.rule / k.bench.max, color: '#38BDF8', label: 'Aan de kant', val: `max ${mins(k.bench.max)}′` },
    { v: k.kracht.pct, color: '#C4B5FD', label: 'In hun kracht', val: `${Math.round(k.kracht.pct * 100)}%` }
  ];
  const tiles = [
    { key: 'tijd', icon: 'team', label: 'Speeltijd', a: mins(k.time.min), b: mins(k.time.max), unit: 'min', chip: k.time.ok ? `✓ verschil ${mins(k.time.spread)} · marge ${mins(k.time.marge)}` : `${mins(k.time.spread - k.time.marge)} min te veel verschil`, ok: k.time.ok },
    { key: 'kant', icon: 'clock', label: 'Langst aan de kant', a: mins(k.bench.max), unit: 'min', chip: !k.bench.rule ? 'geen regel' : k.bench.ok ? `✓ regel ${mins(k.bench.rule)} min` : `${mins(k.bench.max - k.bench.rule)} min te lang`, ok: k.bench.rule ? k.bench.ok : null },
    { key: 'wissels', icon: 'swaparrows', label: 'Wissels', a: k.swaps.n, unit: '', chip: `op ${k.swaps.moments} momenten`, ok: null },
    { key: 'kracht', icon: 'shield', label: 'In hun kracht', a: Math.round(k.kracht.pct * 100), unit: '%', chip: k.kracht.pct >= 0.9 ? '✓ dominant of voorkeur' : 'te vaak buiten kracht', ok: k.kracht.pct >= 0.9 }
  ];
  const insightText = (x) => x.kind === 'bench' ? html`<b>${nick(x.id)}</b> zit ${mins(x.sec)} min aaneen aan de kant, vanaf ${when(x.from)}.`
    : x.kind === 'time' ? html`<b>${nick(x.id)}</b> speelt het minst: ${mins(x.sec)} min.`
    : x.kind === 'kracht' ? html`<b>${nick(x.id)}</b> speelt ${mins(x.sec)} min buiten zijn kracht (${LNAME[x.line]}).`
    : html`<b>${LNAME[x.line][0].toUpperCase() + LNAME[x.line].slice(1)}</b> is lichter bezet vanaf ${when(x.t)}.`;
  const icon = { bench: 'clock', time: 'team', kracht: 'shield', lines: 'swaparrows' };
  const toggle = (k2) => { haptic('toggle'); setOpen(open === k2 ? null : k2); };
  // oplossingen per punt: hooguit drie, elk met wat het doet met de cijfers
  // (speelt iemand het minst en zit hij ook het langst aan de kant, dan staan de oplossingen bij dat laatste)
  const fixes = useMemo(() => rep.insights.map((x) => (gp && gp.base && x.id && !(x.kind === 'time' && rep.insights.some((y) => y.kind === 'bench' && y.id === x.id)) ? M.gpFixes(match, team, x) : [])), [match, team]);
  const sameAbove = (x) => x.kind === 'time' && rep.insights.some((y) => y.kind === 'bench' && y.id === x.id);
  const calm = style !== 'sterk';
  const fillOpen = () => {
    const prev = snap(gp);
    const n = mutate((m, t) => M.gpFill(m, t));
    haptic('success');
    toast(`✦ ${n} ${plural(n, 'blok', 'blokken')} ingevuld`, restore(prev));
  };
  // grafiek: speeltijd per kind, per linie gekleurd, met de doelband (gemiddeld ± halve marge)
  const avg = ids.reduce((a, id) => a + played[id], 0) / Math.max(1, ids.length);
  const band = [Math.max(0, avg - k.time.marge / 2), avg + k.time.marge / 2];
  const scale = Math.max(band[1], ...ids.map((id) => played[id])) * 1.04 || 1;
  // wisselmomenten als tijdlijn
  const moments = cards.slice(1).map((c, i) => {
    const prev = cards[i];
    if (c.kind === 'lineup') {
      const ins = Object.keys(c.pos).filter((id) => !(id in prev.pos));
      const outs = Object.keys(prev.pos).filter((id) => !(id in c.pos));
      return { t: c.t, rest: true, ins, outs, period: c.period, form: c.lines ? M.formationText(c.lines) : null };
    }
    return { t: c.t, pairs: c.pairs || [], moves: c.moves || [], form: (c.moves || []).some((x) => x.to) && c.lines ? M.formationText(c.lines) : null };
  });

  return html`<section class=${'gd-hero ' + (ok ? 'good' : 'warn')}>
    <span class="gd-aurora" aria-hidden="true"></span>
    <div class="gd-top">
      <${Rings} vals=${rings} />
      <div class="gd-txt">
        <span class="gd-eyebrow">${ok ? '✓ Klaar om te spelen' : '! Nog even naar kijken'}</span>
        <b class="gd-title">${title}</b>
      </div>
    </div>
    <p class="gd-sub">${sub}</p>
    <div class="gd-legend">${rings.map((x) => html`<span key=${x.label}><i style=${'background:' + x.color}></i>${x.label}<b class="num">${x.val}</b></span>`)}</div>
  </section>

  <section class="gd-kpis">
    ${tiles.map((x, i) => html`<div key=${x.key} class=${'gd-kpi' + (x.ok === false ? ' bad' : x.ok ? ' good' : '')} style=${'--i:' + i}>
      <span class="gdk-top"><span class="gdk-ico"><${Icon} name=${x.icon} size=${16} /></span><span class="gdk-l">${x.label}</span></span>
      <span class="gdk-v num"><b><${Num} v=${x.a} />${x.b != null ? html`–<${Num} v=${x.b} />` : ''}</b>${x.unit && html`<small>${x.unit}</small>`}</span>
      <span class="gdk-chip">${x.chip}</span>
    </div>`)}
  </section>

  ${(open0.length > 0 || rep.insights.length > 0) && html`<section class="gd-card gd-ins">
    <header class="gd-h"><${AiMark} size=${16} /><b class="ai-grad">Om naar te kijken</b><span class="gd-hs">met oplossingen</span></header>
    ${open0.length > 0 && html`<div class="gd-issue">
      <div class="gd-it"><span class="ri-ico"><${Icon} name="edit" size=${18} /></span><span class="ri-txt"><b>${open0.length} ${plural(open0.length, 'blok is', 'blokken zijn')} nog niet vol</b>, bijvoorbeeld ${M.periodLabel(team, open0[0].p)} blok ${open0[0].i + 1}. Daar wordt niet gewisseld.</span></div>
      <div class="gd-fixes">
        <button type="button" class="gd-fix" onClick=${fillOpen}><span class="gf-n">1</span><span class="gf-b"><b>✦ Laat de app ze invullen</b><span class="gf-i">Jouw blokken blijven staan; de app vult de rest eerlijk aan.</span></span><span class="gf-go">Doe</span></button>
      </div>
      <button type="button" class="gd-totable" onClick=${() => goTo(open0[0].b, null)}>Zelf invullen in de tabel<${Icon} name="chev" size=${14} /></button>
    </div>`}
    ${rep.insights.map((x, i) => {
      const fx = fixes[i] || [];
      return html`<div class="gd-issue" key=${'is' + i} style=${'--i:' + (i + 1)}>
        <div class="gd-it"><span class=${'ri-ico ' + x.kind}><${Icon} name=${icon[x.kind] || 'eye'} size=${18} /></span><span class="ri-txt">${insightText(x)}</span></div>
        ${fx.length > 0 && html`<div class="gd-fixes">${fx.map((f, j) => html`<${FixCard} key=${j} team=${team} f=${f} x=${x} n=${j + 1} calm=${calm} onDo=${() => applyFixWith(match, team, f)} />`)}</div>`}
        ${!fx.length && html`<p class="gd-nofix">${sameAbove(x) ? 'De oplossingen hierboven helpen hier ook.' : 'Hier kan de app niet met één aanpassing iets beters vinden.'}</p>`}
        <button type="button" class="gd-totable" onClick=${() => goTo(blockAt(x.kind === 'bench' ? x.from + 1 : x.t), x.id || null)}>${x.id ? 'Bekijk ' + nick(x.id) + ' in de tabel' : 'Bekijk in de tabel'}<${Icon} name="chev" size=${14} /></button>
      </div>`;
    })}
  </section>`}

  <section class="gd-card">
    <header class="gd-h"><b>Speeltijd per kind</b><span class="gd-hs">tik een kind om het te volgen</span></header>
    <div class="gd-chart">
      <span class="gd-band" style=${`--a:${band[0] / scale};--w:${(band[1] - band[0]) / scale}`}></span>
      ${byPlay.map((id, i) => html`<button type="button" class="gd-row" key=${id} style=${'--i:' + i} onClick=${() => goTo(0, id)}>
        <span class="gd-n">${nick(id)}</span>
        <span class="gd-bar">${['V', 'M', 'A'].map((l) => (perLine[id][l] > 0 ? html`<i key=${l} class=${'l' + l} style=${'width:' + (perLine[id][l] / scale) * 100 + '%'}></i>` : null))}</span>
        <span class=${'gd-m num' + (played[id] < band[0] - 30 || played[id] > band[1] + 30 ? ' off' : '')}>${mins(played[id])}′</span>
      </button>`)}
    </div>
    <div class="rt-legend2"><span><i class="lV"></i>voor</span><span><i class="lM"></i>midden</span><span><i class="lA"></i>achter</span><span><i class="gd-bandkey"></i>doel ± marge</span></div>
  </section>

  <section class="gd-card">
    <header class="gd-h"><b>Wisselmomenten</b><span class="gd-hs">${k.swaps.n} wissels · ${k.swaps.moments} momenten</span></header>
    <ol class="gd-tl">
      ${moments.map((mo, i) => {
        const b = blockAt(mo.t);
        return mo.rest
          ? html`<li class="gd-tlrest" key=${'r' + i}><span class="gd-tlrest-l">${M.periodLabel(team, mo.period)} · nieuwe opstelling${mo.form ? ' ' + mo.form : ''}</span>
              ${(mo.ins.length > 0 || mo.outs.length > 0) && html`<span class="gd-chips">${mo.ins.map((id) => html`<span class="gd-c in" key=${'i' + id}>↑ ${nick(id)}</span>`)}${mo.outs.map((id) => html`<span class="gd-c out" key=${'o' + id}>↓ ${nick(id)}</span>`)}</span>`}</li>`
          : html`<li key=${'m' + i} style=${'--i:' + i}><button type="button" class="gd-tlm" onClick=${() => goTo(b, null)}>
              <span class="gd-tlt num">${M.fmt(mo.t - Math.floor(mo.t / L) * L)}</span>
              <span class="gd-chips">
                ${mo.pairs.map((s) => html`<span class="gd-pair" key=${s.in}><span class="gd-c in">↑ ${nick(s.in)}</span><span class="gd-c out">↓ ${nick(s.out)}</span></span>`)}
                ${mo.moves.map((x) => (x.to ? html`<span class="gd-c sh" key=${'v' + x.a}>↔ ${nick(x.a)} naar ${LNAME[x.to]}</span>` : html`<span class="gd-c sh" key=${'v' + x.a}>↔ ${nick(x.a)} · ${nick(x.b)}</span>`))}
                ${mo.form && html`<span class="gd-c form">${mo.form}</span>`}
              </span>
            </button></li>`;
      })}
      ${!moments.length && html`<li class="gd-tlrest"><span class="gd-tlrest-l">Geen wissels gepland.</span></li>`}
    </ol>
  </section>

  <section class="gd-card gd-deep">
    <button type="button" class="rt-dh" aria-expanded=${open === 'rooster' ? 'true' : 'false'} onClick=${() => toggle('rooster')}><span>Rooster per kind</span><${Icon} name="chev" size=${16} /></button>
    <div class=${'rt-dbody' + (open === 'rooster' ? ' open' : '')}><div><${Rooster} match=${match} team=${team} cards=${cards} onKid=${(id) => goTo(0, id)} /></div></div>
  </section>`;
}
