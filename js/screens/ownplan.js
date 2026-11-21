// Jouw plan: een route in stappen. Aanpak (speelstijl en ritme) → per periode de opstelling en de wissels →
// rapport. Eén hoofdknop per scherm, je ziet altijd waar je bent en wat er na komt. Advies is een aparte,
// herkenbare 'slimme' laag (paars, sterretje): alleen als je erom vraagt, met een reden erbij.
import { html, useMemo, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import * as M from '../match.js';
import { Field, Icon, Neon, Seg, BenchScroll, useDragSwap, justDragged, accentFor, useNow, toast, go } from '../ui.js';
import { haptic, reduced } from '../motion.js';
import { ghostsFor } from '../planview.js';
import { mutate } from './live.js';
import { NextBar, MiniScore } from './plan.js';

const clean = (p) => ({ out: p.out, in: p.in, ...(p.shift ? { shift: { id: p.shift.id, to: p.shift.to } } : {}) });
const mergePairs = (cur, out, inn) => (cur || [])
  .filter((p) => p.out !== out && p.in !== inn && p.out !== inn && p.in !== out && !(p.shift && (p.shift.id === out || p.shift.id === inn)))
  .map(clean).concat([{ out, in: inn }]);
const posFromSlots = (slots) => { const pos = {}; for (const k in slots) if (slots[k]) pos[slots[k]] = k[0]; return pos; };
const LNAME = { A: 'achter', M: 'midden', V: 'voor' };
const mins = (s) => Math.round(s / 60);
const savePins = (match) => (match.pins || []).map((x) => ({ ...x, pairs: x.pairs.map(clean) }));
const undoPins = (prev) => ({ label: 'Ongedaan', run: () => mutate((m, t) => { m.pins = prev; M.replan(m, t); }) });
// even laten zien dat het advies 'denkt' (en de telefoon de tijd geven om te tekenen), dan rekenen
const think = (fn, ms = 380) => new Promise((res) => setTimeout(() => res(fn()), reduced() ? 0 : ms));
const periodWord = (team) => (team.periods === 4 ? 'kwart' : team.periods === 2 ? 'helft' : 'periode');

export function stepLabel(team, key) {
  if (key === 'aanpak') return 'Aanpak';
  if (key === 'rapport') return 'Rapport';
  const [kind, p] = key.split(':');
  return (kind === 'op' ? 'Opstelling ' : 'Wissels ') + M.periodLabel(team, +p);
}

export function OwnPlanner({ match, team }) {
  const steps = M.ownSteps(team);
  const live = match.started && !match.finished;
  const curP = live ? match.clock.period : 0;
  const saved = match.ownSteps && match.ownSteps.at;
  const [at, setAt] = useState(live ? 'ws:' + curP : steps.indexOf(saved) !== -1 ? saved : 'aanpak');
  const [dir, setDir] = useState(1);
  const [focusT, setFocusT] = useState(null);
  const idx = Math.max(0, steps.indexOf(at));
  const done = (match.ownSteps && match.ownSteps.done) || {};
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const goTo = (key, t = null) => {
    if (key === at && t == null) return;
    setDir(steps.indexOf(key) >= idx ? 1 : -1);
    setAt(key);
    setFocusT(t);
    mutate((m) => M.markStep(m, null, key));
    haptic('select');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
  };
  const next = () => {
    mutate((m) => M.markStep(m, at, steps[idx + 1] || at));
    if (idx + 1 < steps.length) goTo(steps[idx + 1]);
    else { haptic('success'); go('/'); }
  };
  const prev = () => { if (idx > 0) goTo(steps[idx - 1]); };
  const p = at.indexOf(':') !== -1 ? +at.split(':')[1] : null;
  const body = at === 'aanpak' ? html`<${AanpakStep} match=${match} team=${team} />`
    : at === 'rapport' ? html`<${ReportStep} match=${match} team=${team} goTo=${goTo} />`
    : at.slice(0, 2) === 'op' ? html`<${LineupStep} match=${match} team=${team} p=${p} />`
    : html`<${SwapStep} match=${match} team=${team} p=${p} focusT=${focusT} key=${'ws' + p + ':' + (focusT || '')} />`;
  return html`<main class=${'screen planner own oroute' + (live ? ' is-live' : '')}>
    <div class="topbar plbar">
      <a class="iconbtn" href="#/" aria-label="Terug naar de wedstrijd"><${Icon} name="back" /></a>
      <span class="h2 grow">Jouw plan</span>
      <${MiniScore} match=${match} team=${team} />
    </div>
    <nav class="rt-prog" aria-label="Voortgang">
      <div class="rt-bar">
        ${steps.map((k, i) => html`<button type="button" key=${k} class=${'rt-seg' + (i < idx || done[k] ? ' done' : '') + (k === at ? ' cur' : '') + (k === 'rapport' ? ' end' : '') + (k.slice(0, 2) === 'op' ? ' gap' : '')}
          aria-label=${'Stap ' + (i + 1) + ': ' + stepLabel(team, k)} aria-current=${k === at ? 'step' : null} onClick=${() => goTo(k)}><i></i></button>`)}
      </div>
      <div class="rt-legend"><span class="num">Stap ${idx + 1} van ${steps.length}</span><span key=${at}>${idx + 1 < steps.length ? html`Daarna: <b>${stepLabel(team, steps[idx + 1]).toLowerCase()}</b>` : html`<b>Laatste stap</b>`}</span></div>
    </nav>
    <div class=${'rt-step ' + (dir > 0 ? 'fwd' : 'back')} key=${at}>${body}</div>
    ${!live && html`<div class="rt-foot">
      ${idx > 0 ? html`<button type="button" class="btn plain" onClick=${prev}>Vorige</button>` : html`<a class="btn plain" href="#/">Later</a>`}
      <button type="button" class="btn primary grow rt-next" onClick=${next} key=${'n' + at}>
        ${idx + 1 < steps.length ? html`<span class="rn-txt"><small>Volgende</small><span>${stepLabel(team, steps[idx + 1])}</span></span><${Icon} name="chev" size=${18} />` : html`<span>Klaar</span><${Icon} name="check" size=${18} />`}
      </button>
    </div>`}
    ${live && html`<${NextBar} match=${match} team=${team} cards=${cards} />`}
  </main>`;
}

// ---------- slimme laag (advies): herkenbaar aan het sterretje en de paarse rand ----------
function AiMark({ size = 18 }) {
  return html`<span class="ai-mark" aria-hidden="true"><${Icon} name="spark" size=${size} /></span>`;
}
function AiButton({ onClick, children, busy, small, done }) {
  return html`<button type="button" class=${'ai-btn' + (busy ? ' busy' : '') + (small ? ' small' : '') + (done ? ' done' : '')} onClick=${onClick} aria-busy=${busy ? 'true' : 'false'}>
    <span class="ai-btn-in">${done ? html`<${Icon} name="check" size=${18} />` : html`<${AiMark} size=${17} />`}<span>${busy ? 'Denkt vooruit…' : children}</span></span>
  </button>`;
}

// ---------- stap 1: aanpak ----------
const STYLES = {
  sterk: { title: 'Sterkste opstelling', tag: 'Oudere teams', icon: 'shield',
    text: 'Iedereen speelt in zijn kracht: op zijn dominante plek, anders op een voorkeursplek. Je wisselt vooral binnen de linies. Sterkere spelers staan iets langer, binnen je marge.' },
  balans: { title: 'Gebalanceerd', tag: 'Jongere teams', icon: 'team',
    text: 'Eerlijke speeltijd gaat voor. De app let op voorkeursplekken en mengt sterk en minder sterk, zodat de ploeg de hele wedstrijd even sterk is.' }
};

function AanpakStep({ match, team }) {
  const style = M.planStyle(match, team);
  const info = M.squadInfo(match, team);
  const L = M.periodLen(team);
  const moments = M.naturalMoments(L, 0).map((t) => M.fmt(t));
  const [ro, setRo] = useState(null);
  const sig = style + '|' + JSON.stringify(match.lines || null) + '|' + match.keeperId + '|' + ((match.events[0] || {}).bench || []).length;
  // vooruit rekenen gebeurt na het tekenen; tot dan glinsteren de keuzes
  useEffect(() => { setRo(null); const id = setTimeout(() => setRo(M.rhythmOptions(match, team, style)), reduced() ? 0 : 120); return () => clearTimeout(id); }, [sig]);
  const k = match.planRhythm || (ro && ro.recommended) || null;
  const setStyle = (s) => { haptic('select'); mutate((m) => { m.planStyle = s; }); };
  const setK = (v) => { haptic('select'); mutate((m) => { m.planRhythm = v; }); };
  const r = M.effRules(match, team);
  const maxB = r.maxBenchOn ? r.maxBench : null;
  const opts = ro ? ro.opts.filter((o) => o.k <= 4 || o.k === info.bench) : [];
  return html`<section class="rt-intro">
    <h1 class="rt-h">Jouw aanpak</h1>
    <p class="rt-sub">Twee keuzes. Daarna maak je het plan per ${periodWord(team)}, met advies als je dat wilt.</p>
    <div class="rt-ctx">
      <span class="chip num"><${Icon} name="clock" size=${15} />${team.periods} × ${Math.round(L / 60)} min</span>
      <span class="chip num">${info.n} veldspelers · ${info.F} op het veld · ${info.bench} op de bank</span>
      <a class="rt-link" href="#/team">Wijzig bij Team</a>
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
    <p class="rt-note"><${AiMark} size=${14} />Het advies volgt deze keuze: bij de opstelling, bij elke wissel en in het rapport.</p>
  </section>

  ${info.bench > 0 ? html`<section class="card rt-q" style="--q:1">
    <span class="rt-qn"><b>2</b>Hoeveel wissels per moment?</span>
    <p class="rt-note">Logische momenten per ${periodWord(team)}: <b class="num">${moments.join(' · ')}</b> (25, 50 en 75%). Je kunt altijd een ander moment kiezen.</p>
    ${!ro && html`<div class="rt-skel" aria-label="De app rekent vooruit"><i></i><i></i><i></i></div>`}
    ${ro && opts.map((o, i) => {
      const rec = o.k === ro.recommended;
      const over = maxB && o.maxStretch > maxB * 60 + 1;
      return html`<button type="button" key=${o.k} class=${'rt-choice rhythm' + (k === o.k ? ' on' : '')} style=${'--i:' + i} aria-pressed=${k === o.k ? 'true' : 'false'} onClick=${() => setK(o.k)}>
        <span class="rc-num num">${o.k}</span>
        <span class="rc-body">
          <span class="rc-top"><b>${o.k === info.bench && o.k > 1 ? 'Hele bank tegelijk' : o.k === 1 ? '1 wissel per moment' : o.k + ' wissels per moment'}</b>${rec && html`<span class="rc-tag ai"><${AiMark} size=${12} />Aanbevolen</span>`}</span>
          <span class="rc-stats num">
            <span>speeltijd <b>${mins(o.minPlayed)}–${mins(o.maxPlayed)}</b> min</span>
            <span class=${over ? 'warn' : ''}>max <b>${mins(o.maxStretch)}</b> min aan de kant</span>
          </span>
          ${over && html`<span class="rc-warn">Langer dan je regel van ${maxB} min.</span>`}
        </span>
        <span class="rc-check" aria-hidden="true"><${Icon} name="check" size=${16} /></span>
      </button>`;
    })}
  </section>` : html`<section class="card rt-q"><p class="rt-note">Er zit niemand op de bank, dus er hoeft niet gewisseld te worden.</p></section>`}`;
}

// ---------- stap: opstelling per periode ----------
function LineupStep({ match, team, p }) {
  const nick0 = (id) => M.nickOf(team, id);
  const nick = (id) => (String(id).slice(0, 6) === 'empty:' ? '+' : nick0(id));
  const accent = accentFor(team);
  const players = useMemo(() => { const o = {}; for (const x of team.players) o[x.id] = x; return o; }, [team]);
  const L = M.periodLen(team);
  const live = match.started && !match.finished;
  const curP = live ? match.clock.period : 0;
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const lines = M.linesOf(match, team);
  const planned = !!(match.periodLineups && match.periodLineups[p]);
  const editable = !match.finished && (p === 0 ? !match.started : !(live && p <= curP));
  // de 1e periode begint leeg: lege plekken, iedereen op de bank (tot je kiest of zelf neerzet)
  const blank = p === 0 && editable && !planned && !(match.ownSteps && match.ownSteps.done && match.ownSteps.done['op:0']);
  const keys = useMemo(() => { const ks = []; for (const l of ['V', 'M', 'A']) for (let i = 0; i < (lines[l] || 0); i++) ks.push(l + i); return ks; }, [JSON.stringify(lines)]);
  const everyone = useMemo(() => Object.keys(cards[0].pos).concat(cards[0].bench), [cards]);
  const [draft, setDraft] = useState(() => { const d = {}; for (const k of keys) d[k] = null; return d; });
  const [advStyle, setAdvStyle] = useState(M.planStyle(match, team));
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null); // laatst toegepast advies
  const [flash, setFlash] = useState([]);

  const endPrev = p > 0 ? (() => { let b = cards[0]; for (const c of cards) { if (c.t < p * L) b = c; else break; } return b; })() : null;
  const startPrev = p > 0 ? (() => { let b = cards[0]; for (const c of cards) { if (c.t <= (p - 1) * L) b = c; else break; } return b; })() : null;
  const luCard = cards.find((c) => c.kind === 'lineup' && c.period === p);
  const lu = p === 0 ? cards[0] : luCard || endPrev;
  const slotKey = (s) => (s ? Object.keys(s).sort().map((k) => k + '=' + (s[k] || '')).join() : '');
  const isAdv = !blank && last && slotKey(last.slots) === slotKey(lu.slots);
  const which = p === 0 ? null : !planned ? 'eind' : slotKey(lu.slots) === slotKey(startPrev && startPrev.slots) ? 'start' : null;

  const draftSlots = {};
  for (const k of keys) draftSlots[k] = draft[k] || 'empty:' + k;
  const fieldSlots = blank ? draftSlots : lu.slots;
  const benchIds = blank ? everyone.filter((id) => !Object.values(draft).includes(id)) : lu.bench;
  const shownPos = blank ? posFromSlots(draft) : lu.pos;

  const commit = (slots, msg) => {
    mutate((m, t) => M.setPeriodLineup(m, t, p, { pos: posFromSlots(slots), bench: everyone.filter((id) => !Object.values(slots).includes(id)), slots: { ...slots } }));
    if (msg) toast(msg);
  };
  const showChange = (before, after) => {
    const ch = Object.keys(after).filter((k) => after[k] && (!before || before[k] !== after[k])).map((k) => after[k]);
    setFlash(ch);
    setTimeout(() => setFlash([]), 1800);
  };
  const advise = async (s = advStyle) => {
    if (busy) return;
    setBusy(true);
    haptic('select');
    const a = await think(() => M.ownAdviseLineup(match, team, p, s));
    setBusy(false);
    setLast({ slots: a.slots, style: s });
    showChange(blank ? null : lu.slots, a.slots);
    commit(a.slots);
    haptic('success');
  };
  const pickStyle = (s) => { setAdvStyle(s); if (isAdv || blank) advise(s); };
  const useStart = () => { haptic('select'); if (startPrev) { showChange(lu.slots, startPrev.slots); commit(startPrev.slots); } };
  const useEnd = () => { haptic('select'); showChange(lu.slots, endPrev.slots); mutate((m, t) => M.clearPeriodLineup(m, t, p)); };

  // zelf neerzetten (lege start): tik een bankspeler = op zijn beste vrije plek; tik op het veld = terug naar de bank
  const bestFree = (id, d) => {
    const free = keys.filter((k) => !d[k]);
    if (!free.length) return null;
    return free.slice().sort((a, b) => M.FIT[M.fitOf(players[id], b[0])] - M.FIT[M.fitOf(players[id], a[0])])[0];
  };
  const finishDraft = (d) => { setDraft(d); if (keys.every((x) => d[x])) { commit(d, 'Opstelling staat'); haptic('success'); } };
  const placeDraft = (id, key) => {
    const d = { ...draft };
    for (const k in d) if (d[k] === id) d[k] = null;
    const k = key || bestFree(id, d);
    if (!k) return;
    d[k] = id;
    haptic('select');
    finishDraft(d);
  };
  const zone = useRef(null);
  const onDrop = (a, b) => {
    if (blank) {
      if (b.slice(0, 6) === 'empty:') { placeDraft(a, b.slice(6)); return; }
      const ka = keys.find((k) => draft[k] === a), kb = keys.find((k) => draft[k] === b);
      const d = { ...draft };
      if (ka && kb) { d[ka] = b; d[kb] = a; } else if (kb && !ka) { d[kb] = a; } else return;
      finishDraft(d);
      return;
    }
    if (b.slice(0, 5) === 'line:' || b.slice(0, 5) === 'zone:' || b.slice(0, 6) === 'empty:') return;
    const nx = M.swapInLineup({ pos: lu.pos, bench: lu.bench, slots: lu.slots }, a, b);
    commit(nx.slots);
  };
  const hint = (a, b) => {
    if (b.slice(0, 5) === 'line:' || b.slice(0, 5) === 'zone:') return null;
    if (b.slice(0, 6) === 'empty:') { const l = b[6]; const f = M.fitOf(players[a], l); return nick(a) + ' ' + LNAME[l] + (f === 'buiten' ? ' · buiten zijn kracht' : f === 'dominant' ? ' · sterkste plek' : ''); }
    const aF = a in shownPos, bF = b in shownPos;
    if (aF === bF) return aF ? 'Ruil met ' + nick(b) : null;
    return aF ? nick(b) + ' begint' : 'Begint voor ' + nick(b);
  };
  useDragSwap(zone, editable, onDrop, hint);
  const tapField = (id) => {
    if (justDragged(zone) || !editable || !blank || String(id).slice(0, 6) === 'empty:') return;
    const d = { ...draft }; for (const k in d) if (d[k] === id) d[k] = null; setDraft(d); haptic('toggle');
  };
  const tapBench = (id) => { if (justDragged(zone) || !editable || !blank) return; placeDraft(id); };

  // gevolgen: linies, in hun kracht, wie het minst speelde
  const placed = Object.keys(shownPos);
  const fitN = placed.filter((id) => M.inKracht(players[id], shownPos[id])).length;
  const st = useMemo(() => (p > 0 ? M.planStateAt(match, team, p * L, false) : null), [match, team, p]);
  const least = st ? benchIds.concat(placed).filter((id) => st.played[id] != null).sort((a, b) => st.played[a] - st.played[b])[0] : null;
  const lineSt = placed.length === keys.length ? M.lineStatusOf(match, team, shownPos) : null;
  // impact: zo pakt de hele wedstrijd uit, en zo met advies (na het tekenen uitgerekend)
  const [cmp, setCmp] = useState(null);
  const posKey = JSON.stringify(shownPos);
  useEffect(() => {
    setCmp(null);
    if (p === 0 || !editable) return undefined;
    const id = setTimeout(() => setCmp(M.ownCompareLineup(match, team, p, shownPos)), reduced() ? 0 : 250);
    return () => clearTimeout(id);
  }, [posKey, p, match.pins]);
  const better = cmp && (cmp.adv.maxPlayed - cmp.adv.minPlayed + 90 < cmp.cur.maxPlayed - cmp.cur.minPlayed || cmp.adv.maxStretch + 90 < cmp.cur.maxStretch);

  return html`<section class="rt-intro">
    <h1 class="rt-h">${p === 0 ? 'Startopstelling' : 'Opstelling'} ${M.periodLabel(team, p)}</h1>
    <p class="rt-sub">${!editable ? (live && p === curP && M.lineupPending(match, team) ? 'Het is rust: kies de opstelling in het wedstrijdscherm.' : 'Deze periode is al begonnen.')
      : p === 0 ? (blank ? 'Wie begint waar? Laat de app een voorstel doen, of tik spelers op hun plek.' : 'Sleep spelers om te ruilen.')
      : 'In de rust begint iedereen opnieuw. Kies hoe je begint, of sleep zelf.'}</p>
  </section>
  ${editable && p > 0 && html`<div class="rt-begin" role="group" aria-label="Begin met">
    <button type="button" class=${'chip' + (which === 'start' ? ' on' : '')} aria-pressed=${which === 'start' ? 'true' : 'false'} onClick=${useStart}>Als start ${M.periodLabel(team, p - 1)}</button>
    <button type="button" class=${'chip' + (which === 'eind' ? ' on' : '')} aria-pressed=${which === 'eind' ? 'true' : 'false'} onClick=${useEnd}>Als eind ${M.periodLabel(team, p - 1)}</button>
  </div>`}
  ${editable && html`<div class=${'ai-card' + (busy ? ' thinking' : '') + (isAdv ? ' applied' : '') + (blank && !busy ? ' nudge' : '')}>
    <div class="ai-head"><${AiMark} /><b>Advies</b>
      <div class="ai-seg"><${Seg} label="Soort advies" small value=${advStyle} onChange=${pickStyle} options=${[['sterk', 'Sterk starten'], ['balans', 'Gebalanceerd']]} /></div>
    </div>
    ${better && !isAdv && html`<p class="ai-impact num"><span>Zo: speeltijd <b>${mins(cmp.cur.minPlayed)}–${mins(cmp.cur.maxPlayed)}</b> min</span><span class="good"><${AiMark} size=${13} />Met advies: <b>${mins(cmp.adv.minPlayed)}–${mins(cmp.adv.maxPlayed)}</b> min</span></p>`}
    <p class="ai-text" key=${advStyle}>${advStyle === 'sterk'
      ? (p === 0 ? 'De sterkste ploeg begint, iedereen op zijn dominante plek of anders een voorkeursplek.' : 'Sterk beginnen na de rust, iedereen in zijn kracht. De speeltijd blijft binnen je marge.')
      : (p === 0 ? 'Sterk en minder sterk gemengd, iedereen op een plek die past. Zo blijft de ploeg de hele wedstrijd even sterk.' : 'Wie het minst speelde begint, op een plek die past. De app kijkt vooruit naar de rest van de wedstrijd.')}</p>
    <${AiButton} onClick=${() => advise()} busy=${busy} done=${isAdv}>${isAdv ? 'Toegepast' : 'Stel opstelling voor'}</${AiButton}>
  </div>`}
  <div ref=${zone} class=${'scrubzone rt-field' + (blank ? ' blank' : '')}>
    <div class="fieldbox">
      <${Field} slots=${fieldSlots} lines=${lu.lines || lines} keeperId=${lu.keeper || match.keeperId} nick=${nick} height="clamp(380px, 56dvh, 560px)" onTap=${tapField} accent=${accent}
        dashed=${blank ? keys.filter((k) => !draft[k]).map((k) => 'empty:' + k) : []} neon=${flash} animate=${true} />
    </div>
    <div class="benchrow">
      <span class="label">Bank</span>
      <${BenchScroll}>
        ${benchIds.map((id) => { const ac = accent(id); return html`<button type="button" class=${'benchpill' + (ac ? ' acc' : '')} style=${ac ? '--acc:' + ac : ''} key=${id} data-pid=${id} onClick=${() => tapBench(id)}>${nick(id)}${st && st.played[id] != null ? html`<span class="t">${mins(st.played[id])}′</span>` : ''}</button>`; })}
        ${!benchIds.length && html`<span class="small">niemand</span>`}
      </${BenchScroll}>
    </div>
  </div>
  <div class="rt-status" aria-live="polite">
    ${blank && placed.length < keys.length ? html`<span><b class="num">${placed.length} van ${keys.length}</b> plekken gevuld</span>`
      : html`${lineSt && lineSt.map((x) => html`<span key=${x.line} class=${x.light ? 'light' : 'ok'}>${x.name[0].toUpperCase() + x.name.slice(1)} ${x.light ? 'licht' : '✓'}</span>`)}
        <span class=${fitN === placed.length ? 'ok' : 'light'}>In hun kracht <b class="num">${fitN}/${placed.length}</b></span>
        ${least && html`<span>Minst gespeeld: ${nick(least)} (${mins(st.played[least])} min)${least in shownPos ? ', begint' : ''}</span>`}
        ${cmp && html`<span class=${cmp.cur.maxPlayed - cmp.cur.minPlayed > 4 * 60 ? 'light' : 'ok'}>Hele wedstrijd: ${mins(cmp.cur.minPlayed)}–${mins(cmp.cur.maxPlayed)} min</span>`}`}
  </div>`;
}

// ---------- stap: wissels per periode ----------
function SwapStep({ match, team, p, focusT }) {
  const nick = (id) => M.nickOf(team, id);
  const accent = accentFor(team);
  const L = M.periodLen(team);
  const P = team.periods;
  const pL = p * L, pEnd = (p + 1) * L;
  const live = match.started && !match.finished;
  const running = live && match.clock.running;
  const now = useNow(running ? 1000 : 5000);
  const T = live ? M.gameTime(match, team, now) : 0;
  const curP = live ? match.clock.period : 0;
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const natural = M.naturalMoments(L, p);
  const lo = live && p === curP ? Math.max(pL + 30, Math.ceil((T + 10) / 30) * 30) : pL + 30;
  const hi = pEnd - 30;
  const periodDone = match.finished || (live && (p < curP || lo > hi));
  const moments = cards.filter((c) => c.kind === 'swap' && c.t > pL && c.t < pEnd);
  const planned = moments.filter((c) => !c.past);
  const marks = Array.from(new Set(natural.filter((x) => x >= lo).concat(planned.map((c) => c.t)))).sort((a, b) => a - b);
  const firstT = focusT && focusT > pL && focusT < pEnd ? Math.max(lo, Math.min(hi, focusT)) : (marks[0] || Math.min(hi, lo));
  const [t, setT] = useState(firstT);
  const [pick, setPick] = useState(null); // { out } of { in } na een tik: kandidaten
  const [cands, setCands] = useState(null);
  const [busy, setBusy] = useState(null); // 'fill' | 'suggest' | 'pick'
  const [prop, setProp] = useState(null); // voorstel voor dit moment
  useEffect(() => { if (!periodDone && (t < lo || t > hi)) setT(marks.find((x) => x >= lo) || lo); }, [lo, hi]);
  const reset = () => { setPick(null); setCands(null); setProp(null); };

  const baseCard = (() => { let b = cards[0]; for (const c of cards) { if (c.t < t) b = c; else break; } return b; })();
  const mom = cards.find((c) => c.kind === 'swap' && c.t === t && !c.past);
  const lines = baseCard.lines || M.linesOf(match, team);
  const editable = !periodDone && t >= lo && t <= hi;
  const label = (tt) => M.fmt(tt - pL);
  const state = useMemo(() => M.planStateAt(match, team, t, false), [match, team, t]);
  const sinceOf = (id) => Math.max(0, t - (state.since[id] || 0));

  const pinAt = (pairs, msg) => {
    const prev = savePins(match);
    mutate((m, tt) => M.pinMoment(m, tt, t, pairs, 'terug'));
    haptic('success');
    toast(msg, undoPins(prev));
  };
  const planPair = (out, inn) => { reset(); pinAt(mergePairs(mom && mom.pairs, out, inn), `${nick(inn)} erin voor ${nick(out)} · ${label(t)}`); };
  const removeMoment = () => {
    const prev = savePins(match);
    mutate((m, tt) => M.unpinMoment(m, tt, t));
    haptic('toggle');
    toast('Wissel ' + label(t) + ' verwijderd', undoPins(prev));
  };
  const shiftMoment = (d) => {
    const to = t + d;
    if (to < lo || to > hi || moments.some((c) => c.t === to)) { haptic('no'); return; }
    mutate((m, tt) => M.moveMoment(m, tt, t, to));
    setT(to); haptic('select');
  };
  // advies na een tik: drie kandidaten met een reden
  const ask = async (sel) => {
    const who = sel.out || sel.in;
    const ex = mom ? mom.pairs.flatMap((q) => [q.out, q.in, q.shift && q.shift.id]).filter(Boolean) : [];
    if (ex.indexOf(who) !== -1) { toast(nick(who) + ' wisselt al op dit moment'); haptic('no'); return; }
    setPick(sel); setProp(null); setCands(null); setBusy('pick');
    const c = await think(() => M.ownCandidates(match, team, t, { out: sel.out || null, inn: sel.in || null, exclude: ex }), 320);
    setBusy(null); setCands(c);
  };
  const suggest = async () => {
    reset(); setBusy('suggest'); haptic('select');
    const r = await think(() => M.ownSuggestAt(match, team, t));
    setBusy(null);
    if (!r.pairs.length) { toast('Op dit moment hoeft niemand te wisselen'); return; }
    setProp(r);
  };
  const fill = async () => {
    reset(); setBusy('fill'); haptic('select');
    const prev = savePins(match);
    const n = await think(() => mutate((m, tt) => M.ownAutoFill(m, tt, p)), 450);
    setBusy(null);
    haptic(n ? 'success' : 'no');
    toast(n ? `${n} ${n === 1 ? 'wissel' : 'wissels'} gepland in de ${M.periodLabel(team, p)}` : 'Niets aan te vullen in deze periode', n ? undoPins(prev) : undefined);
  };

  // slepen: bank op veld = wissel op dit moment
  const zone = useRef(null);
  const drop = (a, b) => {
    const aF = a in baseCard.pos, bF = b in baseCard.pos;
    if (aF === bF || b.slice(0, 5) === 'line:') return;
    planPair(aF ? a : b, aF ? b : a);
  };
  const hint = (a, b) => {
    if (b.slice(0, 5) === 'line:' || b.slice(0, 5) === 'zone:') return null;
    const aF = a in baseCard.pos, bF = b in baseCard.pos;
    if (aF === bF) return null;
    return `${nick(aF ? b : a)} erin voor ${nick(aF ? a : b)} · ${label(t)}`;
  };
  useDragSwap(zone, editable && !prop, drop, hint);
  const tapField = (id) => { if (justDragged(zone) || !editable || prop) return; haptic('select'); if (pick && pick.in) { planPair(id, pick.in); return; } if (pick && pick.out === id) { reset(); return; } ask({ out: id }); };
  const tapBench = (id) => { if (justDragged(zone) || !editable || prop) return; haptic('select'); if (pick && pick.out) { planPair(pick.out, id); return; } if (pick && pick.in === id) { reset(); return; } ask({ in: id }); };

  // tijdlijn: tik of sleep; klikt vast op de logische en geplande momenten
  const track = useRef(null);
  const geo = useRef({});
  geo.current = { lo, hi, marks, t };
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let on = false;
    const at = (x) => {
      const g = geo.current;
      const r = el.getBoundingClientRect();
      const raw = pL + Math.max(0, Math.min(1, (x - r.left) / r.width)) * L;
      let best = null, bd = 40;
      for (const mt of g.marks) { const d = Math.abs(mt - raw); if (d <= bd) { bd = d; best = mt; } }
      const v = Math.max(g.lo, Math.min(g.hi, best != null ? best : Math.round(raw / 30) * 30));
      if (v !== g.t) { setT(v); reset(); haptic('select'); }
    };
    const down = (e) => { on = true; at(e.clientX); };
    const move = (e) => { if (on) { e.preventDefault(); at(e.clientX); } };
    const up = () => { on = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [periodDone]);
  const pct = (tt) => ((tt - pL) / L) * 100;
  const openNatural = natural.filter((x) => x >= lo && !planned.some((c) => Math.abs(c.t - x) < 60));

  // gevolgen tot het eind van de periode
  const endSt = useMemo(() => M.planStateAt(match, team, pEnd, false), [match, team, p]);
  const playedVals = Object.keys(endSt.pos).concat(endSt.bench).map((id) => endSt.played[id] || 0);
  const nPairs = planned.reduce((a, c) => a + (c.pairs ? c.pairs.length : 1), 0);

  const ghosts = mom && !prop ? ghostsFor({ ...mom, pinned: false }, baseCard.pos, nick) : null;
  const fieldSlots = prop ? M.slotsAfter(baseCard.slots, prop.pairs) : baseCard.slots;
  const benchIds = prop ? baseCard.bench.filter((id) => !prop.pairs.some((q) => q.in === id)).concat(prop.pairs.map((q) => q.out)) : baseCard.bench;
  const momIns = mom && !prop ? mom.pairs.map((q) => q.in) : [];
  const momOuts = mom && !prop ? mom.pairs.map((q) => q.out) : [];
  const propIns = prop ? prop.pairs.map((q) => q.in) : [];
  const propOuts = prop ? prop.pairs.map((q) => q.out) : [];
  const endLabel = p + 1 < P ? 'rust' : 'einde';

  return html`<section class="rt-intro">
    <h1 class="rt-h">Wissels ${M.periodLabel(team, p)}</h1>
    <p class="rt-sub">${periodDone ? 'Deze periode is gespeeld.' : 'Kies een moment en sleep een bankspeler op wie eruit gaat. Of tik een speler voor advies.'}</p>
  </section>
  ${!periodDone && html`<section class="card rt-tlcard">
    <div class="rt-tlends num"><span>0:00 start</span><span>${M.fmt(L)} ${endLabel}</span></div>
    <div class="rt-tl" ref=${track} aria-label="Tijdlijn van de periode">
      <span class="rt-line"></span>
      ${live && p === curP && html`<span class="rt-past" style=${`width:${pct(Math.min(pEnd, T))}%`}></span><span class="rt-now" style=${`left:${pct(Math.min(pEnd, T))}%`}></span>`}
      ${moments.filter((c) => c.past).map((c) => html`<span key=${'p' + c.t} class="rt-mk past" style=${`left:${pct(c.t)}%`}></span>`)}
      ${marks.map((mt, i) => { const c = planned.find((x) => x.t === mt); const n = c ? (c.pairs ? c.pairs.length : 1) : 0; return html`<span key=${'m' + mt} style=${`left:${pct(mt)}%;--i:${i}`} class=${'rt-mk' + (n ? ' full' : ' open') + (mt === t ? ' cur' : '') + (!planned.length ? ' breathe' : '')}>${n ? html`<b class="num">${n}</b>` : html`<${Icon} name="plus" size=${12} />`}</span>`; })}
      ${marks.indexOf(t) === -1 && html`<span class="rt-mk cur free" style=${`left:${pct(t)}%`}></span>`}
      ${marks.map((mt) => html`<span key=${'l' + mt} class=${'rt-mt num' + (mt === t ? ' cur' : '')} style=${`left:${pct(mt)}%`}>${label(mt)}</span>`)}
      ${marks.indexOf(t) === -1 && html`<span class="rt-mt num cur" style=${`left:${pct(t)}%`}>${label(t)}</span>`}
    </div>
    <p class="rt-tlhint">Tik ergens op de lijn voor een ander moment.</p>
    ${openNatural.length > 0 && html`<div class=${'ai-card slim' + (busy === 'fill' ? ' thinking' : '') + (!planned.length && !busy ? ' nudge' : '')}>
      <div class="ai-head"><${AiMark} /><b>Vul deze ${periodWord(team)} in</b></div>
      <p class="ai-text">${M.planRhythm(match, team)} per moment op ${openNatural.map(label).join(', ')}. De app kijkt vooruit naar de rest van de wedstrijd.</p>
      <${AiButton} onClick=${fill} busy=${busy === 'fill'} small=${true}>Vul in</${AiButton}>
    </div>`}
  </section>`}

  ${!periodDone && html`<section class="rt-moment" key=${'mo' + t}>
    <div class="rt-mhead">
      <span class="rt-mt-big num">${label(t)}</span>
      <span class="rt-mstate">${mom ? `${mom.pairs.length} ${mom.pairs.length === 1 ? 'wissel' : 'wissels'} gepland` : prop ? 'Voorstel' : 'Nog niets gepland'}</span>
      ${mom && !prop && html`<span class="rt-mact">
        <button type="button" class="chip" aria-label="30 seconden eerder" onClick=${() => shiftMoment(-30)}>−0:30</button>
        <button type="button" class="chip" aria-label="30 seconden later" onClick=${() => shiftMoment(30)}>+0:30</button>
        <button type="button" class="iconbtn" aria-label="Wissel verwijderen" onClick=${removeMoment}><${Icon} name="x" size=${18} /></button>
      </span>`}
    </div>
    ${mom && !prop && html`<${StoryLines} st=${M.swapStory(baseCard.slots, lines, mom.pairs)} nick=${nick} />`}
    ${!mom && !prop && !pick && editable && html`<${AiButton} onClick=${suggest} busy=${busy === 'suggest'} small=${true}>Stel wissels voor op ${label(t)}</${AiButton}>`}
    ${prop && html`<div class="ai-card result">
      <div class="ai-head"><${AiMark} /><b>Voorstel voor ${label(t)}</b></div>
      <${StoryLines} st=${M.swapStory(baseCard.slots, lines, prop.pairs)} nick=${nick} />
      <p class="ai-text">Zo komt de hele wedstrijd uit op <b class="num">${mins(prop.final.minPlayed)}–${mins(prop.final.maxPlayed)} min</b> speeltijd en hooguit <b class="num">${mins(prop.final.maxStretch)} min</b> aan de kant.</p>
      <div class="ai-act"><button type="button" class="btn plain" onClick=${reset}>Annuleer</button><button type="button" class="btn primary grow" onClick=${() => { const pr = prop.pairs.map(clean); const base = mom ? mom.pairs.map(clean) : []; reset(); pinAt(base.concat(pr), 'Voorstel overgenomen · ' + label(t)); }}><${Icon} name="check" size=${18} />Neem over</button></div>
    </div>`}
    ${pick && html`<div class=${'ai-card result' + (busy === 'pick' ? ' thinking' : '')}>
      <div class="ai-head"><${AiMark} /><b>${pick.out ? `Wie erin voor ${nick(pick.out)}?` : `Voor wie gaat ${nick(pick.in)} erin?`}</b>
        <button type="button" class="iconbtn ai-x" aria-label="Sluiten" onClick=${reset}><${Icon} name="x" size=${18} /></button></div>
      ${busy === 'pick' && html`<div class="rt-skel"><i></i><i></i><i></i></div>`}
      ${cands && !cands.length && html`<p class="ai-text">${mom && baseCard.bench.every((id) => mom.pairs.some((q) => q.in === id)) ? 'Op dit moment wisselt de hele bank al. Kies een ander moment, of haal eerst een wissel weg.' : 'Geen goede kandidaat op dit moment.'}</p>`}
      ${cands && cands.map((c, i) => { const who = pick.out ? c.in : c.out; return html`<button type="button" key=${who} class="ai-cand" style=${'--i:' + i} onClick=${() => planPair(c.out, c.in)}>
        <span class="ac-name"><b>${nick(who)}</b>${i === 0 && html`<span class="rc-tag ai">Beste keus</span>`}</span>
        <span class="ac-why">${c.why.map((w) => html`<span class=${w.good ? '' : 'warn'}>${w.txt}</span>`)}${c.shift && html`<span>↔ ${nick(c.shift.id)} schuift door</span>`}</span>
        <span class="ac-plus"><${Icon} name="plus" size=${18} /></span>
      </button>`; })}
      ${cands && html`<p class="ai-foot">Of sleep zelf een speler.</p>`}
    </div>`}
  </section>`}

  ${!periodDone && html`<div ref=${zone} class=${'scrubzone rt-field' + (prop ? ' previewing' : '')}>
    <div class="fieldbox">
      <${Field} slots=${fieldSlots} lines=${lines} keeperId=${baseCard.keeper || match.keeperId} nick=${nick} height="clamp(380px, 56dvh, 560px)" onTap=${tapField} accent=${accent}
        neon=${prop ? propIns : momOuts} selected=${pick && pick.out ? pick.out : null} ghosts=${ghosts} animate=${!!prop}
        dashed=${prop ? prop.pairs.filter((q) => q.shift).map((q) => q.shift.id) : []} />
    </div>
    <div class="benchrow">
      <span class="label">Bank</span>
      <${BenchScroll}>
        ${benchIds.map((id) => {
          const ac = accent(id);
          const goes = momIns.indexOf(id) !== -1;
          const wo = propOuts.indexOf(id) !== -1;
          const w = mins(sinceOf(id));
          const pill = html`<button type="button" class=${'benchpill' + (ac ? ' acc' : '') + (pick && pick.in === id ? ' sel' : '') + (wo ? ' wasout' : '') + (!goes && !wo && w >= 6 ? ' waits' : '')} style=${ac ? '--acc:' + ac : ''} key=${id} data-pid=${id} onClick=${() => tapBench(id)}>${nick(id)}<span class="t">${goes ? 'erin' : wo ? 'eruit' : 'zit ' + w + '′'}</span></button>`;
          return goes ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
        })}
        ${!benchIds.length && html`<span class="small">niemand</span>`}
      </${BenchScroll}>
    </div>
  </div>`}

  <div class="rt-status" aria-live="polite">
    <span>Tot ${p + 1 < P ? 'de rust' : 'het einde'}: speeltijd <b class="num">${mins(Math.min(...playedVals))}–${mins(Math.max(...playedVals))} min</b></span>
    <span><b class="num">${nPairs}</b> ${nPairs === 1 ? 'wissel' : 'wissels'} gepland</span>
  </div>`;
}

function StoryLines({ st, nick }) {
  return html`<div class="nc-lines">${st.map((x, i) => html`<div class="nc-line" key=${x.in + x.out} style=${'--i:' + i}>
    <span class="nc-main"><span class="chg in">↑ ${nick(x.in)}</span> erin voor <span class="chg out">↓ ${nick(x.out)}</span></span>
    <span class="nc-sub">${x.shift
      ? html`<span class="chg sh">↔ ${nick(x.shift)}</span> ${x.shiftPos ? x.shiftPos.naar : 'schuift door'}${x.inPos ? html`<span class="nc-dim"> · ${nick(x.in)} ${x.inPos.op}</span>` : ''}`
      : x.inPos ? html`${nick(x.in)} ${x.inPos.op}` : ''}</span>
  </div>`)}</div>`;
}

// ---------- laatste stap: rapport ----------
function ReportStep({ match, team, goTo }) {
  const nick = (id) => M.nickOf(team, id);
  const rep = useMemo(() => M.ownReport(match, team), [match, team]);
  const { cards } = useMemo(() => M.timeline(match, team), [match, team]);
  const style = M.planStyle(match, team);
  const k = rep.kpi;
  const L = M.periodLen(team);
  const END = team.periods * L;
  const [open, setOpen] = useState(null);
  const when = (t) => { const q = Math.min(team.periods - 1, Math.floor(t / L)); return M.periodLabel(team, q) + ' ' + M.fmt(t - q * L); };
  const title = rep.verdict === 'goed' ? (style === 'sterk' ? 'Sterk en eerlijk' : 'Eerlijk en in balans') : rep.verdict === 'kracht' ? 'Eerlijk, niet iedereen in zijn kracht' : 'Nog niet eerlijk verdeeld';
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
  // rooster: per kind een rij over de wedstrijd, kleur = linie, leeg = aan de kant
  const order = rep.ids.slice().sort((a, b) => rep.played[b] - rep.played[a]);
  const maxPlayed = Math.max(1, ...order.map((x) => rep.played[x]));
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
  const toggle = (k2) => { haptic('toggle'); setOpen(open === k2 ? null : k2); };
  return html`<section class=${'rt-verdict ' + rep.verdict}>
    <span class="rv-ico"><${Icon} name=${rep.verdict === 'let' ? 'warn' : 'check'} size=${22} /></span>
    <div><b>${title}</b>
    <p>Iedereen speelt ${mins(k.time.min)}–${mins(k.time.max)} min en zit hooguit ${mins(k.bench.max)} min aaneen aan de kant. ${Math.round(k.kracht.pct * 100)}% van de speeltijd staan kinderen in hun kracht.</p></div>
  </section>
  <section class="rt-kpis">
    ${tiles.map((x, i) => html`<div key=${x.key} class=${'rt-kpi' + (x.ok === false ? ' bad' : x.ok ? ' good' : '')} style=${'--i:' + i}>
      <span class="rk-l">${x.label}</span>
      <span class="rk-v num"><b>${x.val}</b>${x.unit && html`<small>${x.unit}</small>`}</span>
      <span class="rk-s">${x.ok ? '✓ ' : ''}${x.sub}</span>
    </div>`)}
  </section>
  ${rep.insights.length > 0 && html`<section class="card rt-ins">
    <span class="rt-qn">Om naar te kijken</span>
    ${rep.insights.map((x, i) => html`<button type="button" key=${i} class="rt-insrow" style=${'--i:' + i} onClick=${() => goTo(x.step, x.t != null ? x.t : x.from)}>
      <span class="ri-ico"><${Icon} name=${icon[x.kind] || 'eye'} size=${18} /></span><span class="ri-txt">${insightText(x)}</span><span class="rt-go">Ga naar<${Icon} name="chev" size=${14} /></span>
    </button>`)}
  </section>`}
  <section class="card rt-deep">
    <button type="button" class="rt-dh" aria-expanded=${open === 'rooster' ? 'true' : 'false'} onClick=${() => toggle('rooster')}><span>Rooster per kind</span><${Icon} name="chev" size=${16} /></button>
    <div class=${'rt-dbody' + (open === 'rooster' ? ' open' : '')}><div>
      ${order.map((id) => html`<div class="rt-row" key=${id}><span class="rr-n">${nick(id)}</span><span class="rr-bar">
        ${segsOf(id).map((s) => html`<i class=${s.line ? 'l' + s.line : 'off'} style=${`flex:${s.t1 - s.t}` + (s.t > 0 && s.t % L === 0 ? ';margin-left:3px' : '')}></i>`)}
      </span><span class="rr-m num">${mins(rep.played[id])}′</span></div>`)}
      <div class="rt-legend2"><span><i class="lV"></i>voor</span><span><i class="lM"></i>midden</span><span><i class="lA"></i>achter</span><span><i class="off"></i>aan de kant</span></div>
    </div></div>
    <button type="button" class="rt-dh" aria-expanded=${open === 'tijd' ? 'true' : 'false'} onClick=${() => toggle('tijd')}><span>Speeltijd per kind</span><${Icon} name="chev" size=${16} /></button>
    <div class=${'rt-dbody' + (open === 'tijd' ? ' open' : '')}><div>
      ${order.map((id) => html`<div class="rt-row" key=${id}><span class="rr-n">${nick(id)}</span>
        <span class="rr-tbar"><i style=${`width:${(rep.played[id] / maxPlayed) * 100}%`} class=${rep.outSec[id] >= 60 ? 'part' : ''}></i></span><span class="rr-m num">${mins(rep.played[id])}′</span></div>`)}
      <p class="rt-note">Van meest naar minst.${rep.ids.some((id) => rep.outSec[id] >= 60) ? ' Gestreept: speelt ook buiten zijn kracht.' : ''}</p>
    </div></div>
  </section>`;
}
