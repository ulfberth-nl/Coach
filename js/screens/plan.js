// Planner: het grote veld met nu op de voorgrond en het volgende moment erachter. Slepen = het volgende
// moment plannen (speldje); vegen = door de momenten. Focus en eerlijkheid gelden voor deze wedstrijd; de
// gevolgen (balans per linie, speeltijd en bankbeurten) staan eronder.
import { html, useMemo, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { currentMatch } from '../store.js';
import * as M from '../match.js';
import { PlanView } from '../planview.js';
import { lineStatus } from '../planner.js';
import { WHY_TEXT } from './home.js';
import { mutate, liveAct } from './live.js';
import { GamePlan } from './gameplan.js';
import { Icon, Seg, Switch, toast, useNow, useWakeLock, beep, flash, go } from '../ui.js';
import { haptic } from '../motion.js';

// Hoe wissel je deze wedstrijd: het standaardplan (de app, volgens de teaminstellingen) of een game plan (de coach
// legt de puzzel zelf). Terug naar standaard bewaart je game plan; een game plan begin je met je bewaarde bord.
export function switchPlanMode(mode, quiet = false) {
  const back = mutate((m, t) => {
    const stash = !!(m.ownStash && (m.ownStash.pins.length || m.ownStash.periodLineups)) || !!(m.gameplan && m.gameplan.base);
    if (mode === 'eigen' && !stash && !m.started) { m.pins = []; m.periodLineups = null; m.ownSteps = null; }
    M.setPlanMode(m, t, mode, false);
    // het bord is leidend: het plan volgt weer precies wat erop staat
    if (mode === 'eigen' && m.gameplan && m.gameplan.base && !m.started) M.gpSync(m, t);
    return stash;
  });
  haptic('success');
  if (!quiet) toast(mode === 'eigen' ? (back ? 'Je game plan is terug' : 'Je maakt nu een game plan.') : 'Autopilot staat aan. Je game plan blijft bewaard.');
}

export function Plan({ state }) {
  const match = currentMatch(state);
  if (!match) return html`<main class="screen"><div class="empty"><p>Er is geen wedstrijd klaargezet.</p><a class="btn primary" href="#/">Wedstrijd klaarzetten</a></div></main>`;
  const team = state.teams.find((t) => t.id === match.teamId);
  // game plan: de coach legt de puzzel zelf op het liniebord
  if (M.isOwn(match, team)) return html`<${GamePlan} match=${match} team=${team} />`;
  return html`<${Planner} match=${match} team=${team} />`;
}

// Klein scorebord rechtsboven (klok en stand) tijdens de wedstrijd.
export function MiniScore({ match, team }) {
  const live = match.started && !match.finished;
  const running = live && match.clock.running;
  const now = useNow(running ? 1000 : 5000);
  if (!live) return null;
  const d = M.derive(match, team, M.gameTime(match, team, now));
  const el = M.elapsedInPeriod(match, now);
  return html`<span class=${'miniscore' + (running ? ' run' : '')} aria-label=${'Klok ' + M.fmt(el) + ', stand ' + d.score.us + ' tegen ' + d.score.them}>
    <i class="dot"></i><span class="ms-v">${M.fmt(Math.min(el, M.periodLen(team)))}</span><span class="sep"></span><span class="ms-v">${d.score.us}:${d.score.them}</span>
  </span>`;
}

// Vaste balk onderin tijdens de wedstrijd: het volgende moment met aftellen, +1′ en Wissel nu (de wissel zelf
// gebeurt in het live-scherm, zodat je hem ziet). Met piep en knipperen bij de wissel, en het scherm blijft aan.
export function NextBar({ match, team, cards }) {
  const live = match.started && !match.finished;
  const running = live && match.clock.running;
  const now = useNow(running ? 1000 : 5000);
  useWakeLock(live);
  const T = live ? M.gameTime(match, team, now) : null;
  const pending = live && M.lineupPending(match, team);
  const next = live && !pending ? M.nextSwap(match, team) : null;
  const group = live && !pending ? M.nextGroup(match, team) : [];
  const moves = live && !pending ? M.nextMoves(match, team) : [];
  // game plan: eerst een moment met alleen plekwissels
  const mo = live && !pending ? M.nextMovesOnly(match, team) : null;
  const moNow = !!(mo && (!next || mo.t < next.t));
  const countdown = moNow ? mo.t - T : next ? next.t - T : null;
  const alerted = useRef({});
  useEffect(() => {
    if (!running || !(next || moNow)) return;
    const key = moNow ? 'mv' + mo.t : next.t + ':' + next.out + ':' + next.in;
    if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
    if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
  }, [Math.floor(T || 0)]);
  const sticky = live && !!(next || pending || moNow);
  useEffect(() => { document.documentElement.classList.toggle('plsticky-on', sticky); return () => document.documentElement.classList.remove('plsticky-on'); }, [sticky]);
  if (!sticky) return null;
  const nick = (id) => M.nickOf(team, id);
  const nextNo = next ? cards.filter((c) => c.kind === 'swap' && c.t <= next.t).length : 0;
  const swapNow = () => {
    if (moNow) { liveAct.run = { moves: true }; go('/'); return; }
    const pairs = group.map((s) => ({ out: s.out, in: s.in, shift: s.shift }));
    if (!pairs.length) return;
    liveAct.run = { pairs };
    go('/');
  };
  const later = () => { mutate((m, t) => M.delay(m, t, 60)); toast('Wissel 1 minuut later'); };
  return html`<div class="plsticky">
    ${pending
      ? html`<span class="ps-txt"><b>Rust</b><span>Zet de opstelling klaar in het wedstrijdscherm.</span></span>
        <a class="btn primary" href="#/">Naar de wedstrijd</a>`
      : moNow ? html`<span class=${'ps-txt' + (countdown <= 0 ? ' due' : countdown <= 60 ? ' soon' : '')}>
          <b>Plekwissel · ${countdown > 0 ? M.fmt(countdown) : 'nu!'}</b>
          <span>${mo.moves.map((x) => (x.to ? nick(x.a) + ' naar ' + ({ V: 'voor', M: 'midden', A: 'achter' })[x.to] : nick(x.a) + ' ↔ ' + nick(x.b))).join(', ')}</span>
        </span>
        <button type="button" class="btn primary" onClick=${swapNow}>Doe nu</button>`
      : html`<span class=${'ps-txt' + (countdown <= 0 ? ' due' : countdown <= 60 ? ' soon' : '')}>
          <b>Wissel ${nextNo} · ${countdown > 0 ? M.fmt(countdown) : 'nu!'}</b>
          <span>${group.map((s) => nick(s.in)).join(', ')} erin${group.length === 1 ? ' voor ' + nick(group[0].out) : ''}${moves.length ? ` · ${moves.length === 1 ? '1 plekwissel' : moves.length + ' plekwissels'}` : ''}${next.pinned && !match.plan.own ? ' · vastgezet' : ''}</span>
        </span>
        <button type="button" class="btn plain" onClick=${later} aria-label="1 minuut later">+1′</button>
        <button type="button" class="btn primary" onClick=${swapNow}>Wissel nu</button>`}
  </div>`;
}

const CAP = { V: 'Voor', M: 'Midden', A: 'Achter' };
const PART = { V: 'de aanval', M: 'het middenveld', A: 'de verdediging' };
const FOCUS_OPTS = [['verdedigen', 'Verdedigen'], ['balans', 'Balans'], ['aanvallen', 'Aanvallen']];
const FAIR_OPTS = [['strenger', 'Strenger'], ['team', 'Zoals ingesteld'], ['ruimer', 'Ruimer']];
const FAIR_TXT = {
  strenger: 'Kleiner verschil in speeltijd en kortere bankbeurten. Vaker wisselen kan nodig zijn.',
  team: 'Zoals het wisselprofiel van het team.',
  ruimer: 'Meer verschil in speeltijd mag. Minder wissels, vaker de sterke ploeg.'
};

function Planner({ match, team }) {
  const { cards, nowIndex } = useMemo(() => M.timeline(match, team), [match, team]);
  const live = match.started && !match.finished;
  const running = live && match.clock.running;
  const now = useNow(running ? 1000 : live ? 5000 : 60000);
  const T = live ? M.gameTime(match, team, now) : null;
  const [idx, setIdx] = useState(Math.max(0, nowIndex));
  // eerlijkheid zoals hij was vóór je laatste aanpassing (om het verschil te tonen)
  const [before, setBefore] = useState(null);
  const stand = match.plan ? match.plan.stand : 'balans';
  const auto = !!team.rules.autoStand && match.standMode !== 'manual';
  const remember = () => setBefore({ fair: match.plan.fair, ok: match.plan.ok, key: Date.now() });
  // eerst de bediening laten bewegen (landen, blokje schuift), dan pas rekenen
  const later2 = (fn) => requestAnimationFrame(() => setTimeout(fn, 30));

  const pin = (t, pairs, no) => {
    later2(() => { remember(); mutate((m, tt) => M.pinMoment(m, tt, t, pairs)); });
    toast(`Wissel ${no} vastgezet · de rest rekent de app opnieuw`);
  };
  const unpin = (t, no) => {
    later2(() => { remember(); mutate((m, tt) => M.unpinMoment(m, tt, t)); });
    toast(`Wissel ${no} losgemaakt · de app kiest weer`);
  };
  const setFocus = (v) => later2(() => { remember(); mutate((m, tt) => M.setStand(m, tt, 'manual', v)); });
  const setAuto = (on) => later2(() => { remember(); mutate((m, tt) => M.setStand(m, tt, on ? 'auto' : 'manual', stand)); });
  const setFair = (v) => later2(() => { remember(); mutate((m, tt) => M.setFairness(m, tt, v === 'team' ? null : v)); });

  const broken = (match.plan && match.plan.broken) || [];
  const swapNo = (t) => cards.filter((c) => c.kind === 'swap' && c.t <= t).length;
  const nick = (id) => M.nickOf(team, id);

  return html`<main class=${'screen planner' + (live ? ' is-live' : '')}>
    <div class="topbar plbar">
      <a class="iconbtn" href="#/" aria-label="Terug"><${Icon} name="back" /></a>
      <span class="h2 grow">Planner</span>
      <${MiniScore} match=${match} team=${team} />
    </div>

    <section class="card plcard">
      <${PlanView} match=${match} team=${team} planner initialIndex=${Math.max(0, nowIndex)} nowIndex=${match.started ? nowIndex : -1}
        liveT=${T} onPin=${pin} onUnpin=${unpin} onIndex=${setIdx}>
        <${Gevolgen} match=${match} team=${team} card=${cards[Math.min(idx, cards.length - 1)]} before=${before} />
      </${PlanView}>
    </section>

    ${broken.length > 0 && html`<section class="card warncard" role="alert">
      <span class="h2" style="font-size:16px">Vastgezet moment kan niet meer</span>
      ${broken.map((b) => html`<div class="between" key=${'b' + b.t + b.out}>
        <span class="sub" style="color:var(--ink)">Wissel om ${M.periodLabel(team, Math.floor(b.t / M.periodLen(team)))} ${M.fmt(b.t % M.periodLen(team))}: ${nick(b.in)} voor ${nick(b.out)}</span>
        <button type="button" class="linkbtn" onClick=${() => unpin(b.t, swapNo(b.t) || '')}>Losmaken</button>
      </div>`)}
      <span class="small">Bijvoorbeeld omdat een speler rust heeft of al op het veld staat. Maak het los, dan kiest de app weer.</span>
    </section>`}

    <section class="card plset">
      <span class="label">Voor deze wedstrijd</span>
      <${Seg} label="Focus" value=${stand} options=${FOCUS_OPTS} onChange=${setFocus} />
      ${team.rules.autoStand && html`<div class="between"><span class="sub">Focus volgt de stand</span><${Switch} on=${auto} onChange=${setAuto} label="Focus volgt de stand" /></div>`}
      <${Seg} label="Eerlijkheid" value=${match.fairness || 'team'} options=${FAIR_OPTS} onChange=${setFair} />
      <span class="small">${FAIR_TXT[match.fairness || 'team']} Je teaminstelling blijft gelijk.</span>
    </section>


    <${NextBar} match=${match} team=${team} cards=${cards} />
  </main>`;
}

// Gevolgen onder het veld: balans per linie (zonder namen of cijfers) en eerlijkheid over de hele wedstrijd.
export function Gevolgen({ match, team, card, before }) {
  const plan = match.plan;
  if (!plan || !card) return null;
  const players = {};
  for (const p of team.players) players[p.id] = p;
  const st = lineStatus(card.pos, players, plan.stand || 'balans');
  const order = { V: 0, M: 1, A: 2 };
  const lines = st.slice().sort((a, b) => order[a.line] - order[b.line]);
  const light = lines.filter((l) => l.light);
  const f = plan.fair || {};
  const r = M.effRules(match, team);
  const mins = (s) => Math.round(s / 60);
  const spread = mins((f.maxPlayed || 0) - (f.minPlayed || 0));
  const b = before && before.fair;
  const delta = b ? spread - mins((b.maxPlayed || 0) - (b.minPlayed || 0)) : 0;
  const stint = (f.maxStint || 0) / 60;
  const stintTxt = stint ? (Math.round(stint * 2) / 2).toString().replace('.5', '½').replace('.', ',') + ' min' : '—';
  return html`<div class="gevolgen">
    <div class="gv-row gv-top">
      <span class="gv-k">Opstelling</span>
      <span class="gv-lines">${lines.map((l) => html`<span class=${'gv-line' + (l.light ? ' light' : '')} key=${l.line}>${CAP[l.line]}${l.light ? ' licht' : ' ✓'}</span>`)}</span>
    </div>
    <span class="small gv-sub">${light.length ? `Op dit moment is ${light.map((l) => PART[l.line]).join(' en ')} wat lichter bezet.` : 'Op dit moment is de ploeg goed in balans.'}</span>
    <div class="gv-row">
      <span class="gv-k">Speeltijd</span>
      <span class="gv-v"><b class="num">${mins(f.minPlayed || 0)}–${mins(f.maxPlayed || 0)} min</b> p.p.
        ${b && delta !== 0 && html`<span class=${'gv-delta ' + (delta > 0 ? 'up' : 'down')} key=${before.key}>${delta > 0 ? '+' : '−'}${Math.abs(delta)} min verschil</span>`}</span>
    </div>
    <div class="gv-row">
      <span class="gv-k">Naar de bank</span>
      <span class="gv-v">${f.minTurns === f.maxTurns ? `iedereen ${f.maxTurns}×` : `${f.minTurns}–${f.maxTurns}×`} · langst ${stintTxt}</span>
    </div>
    <div class=${'gv-verdict' + (plan.ok ? ' ok' : ' warn')} key=${'v' + plan.ok + (before ? before.key : '')}>
      ${plan.ok
        ? (plan.relaxed ? 'Past binnen de regels, met hooguit één beurt verschil.' : `Past binnen de regels (marge ${r.marge || 5} min).`)
        : `Let op: ${(plan.why || []).map((w) => WHY_TEXT[w]).join(', ') || 'de regels'} lukt niet helemaal.`}
    </div>
  </div>`;
}
