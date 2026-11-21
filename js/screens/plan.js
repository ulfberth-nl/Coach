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
import { Icon, Seg, Switch, toast, useNow, useWakeLock, beep, flash, go } from '../ui.js';

export function Plan({ state }) {
  const match = currentMatch(state);
  if (!match) return html`<main class="screen"><div class="empty"><p>Er is geen wedstrijd klaargezet.</p><a class="btn primary" href="#/">Wedstrijd klaarzetten</a></div></main>`;
  const team = state.teams.find((t) => t.id === match.teamId);
  return html`<${Planner} match=${match} team=${team} />`;
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
  useWakeLock(live);
  const T = live ? M.gameTime(match, team, now) : null;
  const d = live ? M.derive(match, team, T) : null;
  const [idx, setIdx] = useState(Math.max(0, nowIndex));
  // eerlijkheid zoals hij was vóór je laatste aanpassing (om het verschil te tonen)
  const [before, setBefore] = useState(null);
  const pending = live && M.lineupPending(match, team);
  const next = live && !pending ? M.nextSwap(match, team) : null;
  const group = live && !pending ? M.nextGroup(match, team) : [];
  const countdown = next ? next.t - T : null;
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

  // wissel nu (het eerstvolgende moment), daarna terug naar het live-scherm met de ongedaan-pil
  const swapNow = () => {
    const pairs = group.map((s) => ({ out: s.out, in: s.in, shift: s.shift }));
    if (!pairs.length) return;
    mutate((m, t) => (pairs.length > 1 ? M.doSwapGroup(m, t, pairs) : M.doSwap(m, t, pairs[0].out, pairs[0].in, pairs[0].shift)));
    liveAct.next = pairs.length > 1 ? { outs: pairs.map((p) => p.out), undos: 1 } : { out: pairs[0].out, undos: 1 };
    go('/');
  };
  const later = () => { mutate((m, t) => M.delay(m, t, 60)); toast('Wissel 1 minuut later'); };

  // signaal bij de wissel, ook als je in de planner zit
  const alerted = useRef({});
  useEffect(() => {
    if (!running || !next) return;
    const key = next.t + ':' + next.out + ':' + next.in;
    if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
    if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
  }, [Math.floor(T || 0)]);

  const broken = (match.plan && match.plan.broken) || [];
  const swapNo = (t) => cards.filter((c) => c.kind === 'swap' && c.t <= t).length;
  const nick = (id) => M.nickOf(team, id);
  const el = live ? M.elapsedInPeriod(match, now) : 0;
  const nextNo = next ? swapNo(next.t) : 0;
  // meldingen boven de vaste wisselbalk
  const sticky = live && !!(next || pending);
  useEffect(() => { document.documentElement.classList.toggle('plsticky-on', sticky); return () => document.documentElement.classList.remove('plsticky-on'); }, [sticky]);

  return html`<main class=${'screen planner' + (live ? ' is-live' : '')}>
    <div class="topbar plbar">
      <a class="iconbtn" href="#/" aria-label="Terug"><${Icon} name="back" /></a>
      <span class="h2 grow">Planner</span>
      ${live && html`<span class=${'miniscore' + (running ? ' run' : '')} aria-label=${'Klok ' + M.fmt(el) + ', stand ' + d.score.us + ' tegen ' + d.score.them}>
        <i class="dot"></i><span class="ms-v">${M.fmt(Math.min(el, M.periodLen(team)))}</span><span class="sep"></span><span class="ms-v">${d.score.us}:${d.score.them}</span>
      </span>`}
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


    ${live && (next || pending) && html`<div class="plsticky">
      ${pending
        ? html`<span class="ps-txt"><b>Rust</b><span>Zet de opstelling klaar in het wedstrijdscherm.</span></span>
          <a class="btn primary" href="#/">Naar de wedstrijd</a>`
        : html`<span class=${'ps-txt' + (countdown <= 0 ? ' due' : countdown <= 60 ? ' soon' : '')}>
            <b>Wissel ${nextNo} · ${countdown > 0 ? M.fmt(countdown) : 'nu!'}</b>
            <span>${group.map((s) => nick(s.in)).join(', ')} erin${group.length === 1 ? ' voor ' + nick(group[0].out) : ''}${next.pinned ? ' · vastgezet' : ''}</span>
          </span>
          <button type="button" class="btn plain" onClick=${later} aria-label="1 minuut later">+1′</button>
          <button type="button" class="btn primary" onClick=${swapNow}>Wissel nu</button>`}
    </div>`}
  </main>`;
}

// Gevolgen onder het veld: balans per linie (zonder namen of cijfers) en eerlijkheid over de hele wedstrijd.
function Gevolgen({ match, team, card, before }) {
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
