// Eén Wedstrijd-scherm: voorbereiden → live → afgelopen. Past op één scherm, zonder scrollen.
import { html, useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch, getState } from '../store.js';
import * as M from '../match.js';
import { PlanView } from '../planview.js';
import { keeperCounts, suggestKeeper, WHY_TEXT } from './home.js';
import { nextScheduled, todayISO } from './seizoen.js';
import { matchRules, PROFILES, profileOf } from '../profiles.js';
import { compute } from '../compute.js';
import { PlayTimeSheet } from '../playtime.js';
import { scheduleRefresh } from '../refresh.js';
import { viewTransition, haptic, reduced, T as TEMPO, devicePrefs, setDevicePref } from '../motion.js';
import { switchPlanMode } from './plan.js';
import { APP_VERSION } from './team.js';
import { Rooster } from './gameplan.js';
import { mutate, undoAction, liveAct, SwapSheet, GroupSwapSheet, BenchSheet, GoalSheet, JoinSheet, KeeperSheet } from './live.js';
import { POS_COLORS, Field, Neon, Roll, Sheet, Reveal, CallStory, Confirm, Seg, Stepper, Icon, accentFor, TeamBadge, OppBadge, OpponentInput, ShieldColors, useNow, useWakeLock, useDragSwap, justDragged, BenchScroll, beep, flash, unlockAudio, toast, go, Portal } from '../ui.js';

// slepen in de startopstelling: twee spelers ruilen, of een speler naar een lege plek in een andere linie
// (dan verandert de opstelling voor deze wedstrijd). Het plan rekent daarna opnieuw.
export function conceptDrop(mut, team, a, b) {
  // keeper slepen: wie op de keeper landt (of de keeper op wie hij landt) keept; de oude keeper neemt zijn plek
  const kid = mut((m) => m.keeperId);
  if (kid && (a === kid || b === kid)) {
    const who = a === kid ? b : a;
    if (who.slice(0, 5) === 'line:') return;
    mut((m, d) => conceptKeeper(d, who));
    toast(`${M.nickOf(team, who)} keept · ${M.nickOf(team, kid)} neemt zijn plek · plan opnieuw berekend`);
    return;
  }
  if (b.slice(0, 5) === 'line:') {
    const [, to, at] = b.split(':');
    const lines = mut((m, d) => M.changeFormation(m, d.teams.find((t) => t.id === m.teamId), a, to, +at));
    if (lines) toast(`Opstelling ${M.formationText(lines)} · plan opnieuw berekend`);
    return;
  }
  mut((m, d) => M.swapInStartLineup(m, d.teams.find((t) => t.id === m.teamId), a, b));
  toast(`${M.nickOf(team, a)} ↔ ${M.nickOf(team, b)} · plan opnieuw berekend`);
}

// Keeper wisselen bij het voorbereiden door te slepen. De opstelling blijft zoals hij is: de oude keeper neemt de
// plek van de nieuwe keeper (op het veld of op de bank).
export function conceptKeeper(d, who) {
  const i = d.matches.findIndex((x) => x.id === d.currentMatchId);
  if (i === -1) return;
  const m = d.matches[i];
  const old = m.keeperId;
  if (!old || who === old || m.present.indexOf(who) === -1) return;
  const ev = m.events[0];
  const pos = { ...ev.pos }, bench = ev.bench.slice(), slots = { ...(ev.slots || {}) };
  if (who in pos) {
    pos[old] = pos[who]; delete pos[who];
    for (const k in slots) if (slots[k] === who) slots[k] = old;
  } else {
    const j = bench.indexOf(who);
    if (j !== -1) bench[j] = old; else bench.push(old);
  }
  rebuildConcept(d, { keeperId: who });
  const n = d.matches[i];
  const t = d.teams.find((x) => x.id === n.teamId);
  if (n.keeperId !== who) return;
  n.events[0] = { ...n.events[0], pos, bench, slots };
  M.replan(n, t);
  n.setup = { ...(n.setup || {}), keeper: true };
}

// ---------- concept-wedstrijd (nog niet begonnen) ----------
export function newConcept(d) {
  const t = activeTeam(d);
  const present = t.players.filter((p) => p.active !== false).map((p) => p.id);
  const keeperId = t.keeper ? suggestKeeper(t, present, keeperCounts(d, t)) : null;
  d.matches = d.matches.filter((x) => x.started || x.id !== d.currentMatchId);
  const e = nextScheduled(t, d.matches);
  const plan = scheduleSelection(t, e, present, keeperId);
  // het wisselprofiel rekent opnieuw uit met wie er deze wedstrijd is
  const m = M.createMatch(t, { present: plan.present, keeperId: plan.keeperId, priority: t.rules.priority, rules: matchRules(t, plan.present, plan.keeperId) });
  m.setup = { present: false, keeper: !t.keeper || !!(e && e.keeperId), opponent: false };
  if (e) { applySchedule(m, e); m.setup.opponent = true; }
  d.matches.push(m);
  d.currentMatchId = m.id;
  scheduleRefresh();
}

// afmeldingen en geplande keeper uit het programma
function scheduleSelection(t, e, present, keeperId) {
  if (!e) return { present, keeperId };
  const p = present.filter((id) => (e.absent || []).indexOf(id) === -1);
  const k = t.keeper && e.keeperId && p.indexOf(e.keeperId) !== -1 ? e.keeperId : (p.indexOf(keeperId) !== -1 ? keeperId : null);
  return { present: p, keeperId: k };
}

// programma-wedstrijd kiezen voor de klaargezette wedstrijd (incl. afmeldingen en keeper)
export function useScheduleInConcept(d, e) {
  const m = d.matches.find((x) => x.id === d.currentMatchId);
  if (!m || m.started) return;
  const t = d.teams.find((x) => x.id === m.teamId);
  const active = t.players.filter((p) => p.active !== false).map((p) => p.id);
  const sel = scheduleSelection(t, e, active, m.keeperId);
  rebuildConcept(d, { present: sel.present, keeperId: sel.keeperId || m.keeperId });
  const n = d.matches.find((x) => x.id === d.currentMatchId);
  applySchedule(n, e);
  n.setup = { ...(n.setup || {}), opponent: true, keeper: n.setup && n.setup.keeper ? true : !!e.keeperId };
}

// gegevens uit het programma overnemen
export function applySchedule(m, e) {
  Object.assign(m, { scheduleId: e.id, opponent: e.opponent || '', date: e.date, time: e.time || '', meet: e.meet || '', field: e.field || '', home: e.home !== false, season: e.season || null });
}

export function rebuildConcept(d, changes = {}) {
  const i = d.matches.findIndex((x) => x.id === d.currentMatchId);
  if (i === -1) return;
  const m = d.matches[i];
  const t = d.teams.find((x) => x.id === m.teamId);
  const present = changes.present || m.present;
  let keeperId = 'keeperId' in changes ? changes.keeperId : m.keeperId;
  if (!t.keeper) keeperId = null;
  else if (present.indexOf(keeperId) === -1) keeperId = suggestKeeper(t, present, keeperCounts(d, t));
  // eigen opstelling (gesleept) blijft staan, behalve als de coach om een nieuw voorstel vraagt
  const lines = changes.resetLines ? null : m.lines || null;
  const keep = changes.resetLines ? { planMode: m.planMode } : { pins: m.pins, fairness: m.fairness, standMode: m.standMode, manualStand: m.manualStand, planMode: m.planMode, periodLineups: m.periodLineups, ownStash: m.ownStash, planStyle: m.planStyle, planRhythm: m.planRhythm, ownSteps: m.ownSteps, gameplan: m.gameplan, breakLineups: m.breakLineups };
  const n = M.createMatch(t, { present, keeperId, priority: changes.priority || m.priority, opponent: m.opponent, date: m.date, lines, rules: matchRules(t, present, keeperId), ...keep });
  n.id = m.id;
  n.setup = m.setup || { present: false, keeper: false, opponent: false };
  for (const k of ['scheduleId', 'time', 'meet', 'field', 'home', 'season']) if (m[k] !== undefined) n[k] = m[k];
  d.matches[i] = n;
  // gekozen basisopstelling: opnieuw toepassen met wie er nu is (bij zelf plannen is het bord de baas)
  if (!changes.resetLines && m.baseId && !M.isOwn(n, t)) {
    const b = (t.bases || []).find((x) => x.id === m.baseId);
    if (b) M.applyBase(n, t, b);
  }
  // het profiel rekent op de achtergrond na met wie er is; wijkt dat af, dan volgt het plan vanzelf
  scheduleRefresh();
}

// programma: nog niet gespeelde wedstrijden vanaf een paar dagen terug, op datum
function upcomingFor(team, matches) {
  const from = new Date(Date.now() - 3 * 864e5).toLocaleDateString('sv-SE');
  const played = new Set(matches.filter((m) => m.finished && m.scheduleId).map((m) => m.scheduleId));
  return (team.schedule || []).filter((e) => e.date >= from && !played.has(e.id)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
// dichtst bij vandaag (vandaag zelf wint, bij gelijke afstand de komende)
function closestEntry(list) {
  const today = new Date(todayISO() + 'T12:00:00').getTime();
  let best = null, bd = Infinity;
  for (const e of list) {
    const diff = new Date(e.date + 'T12:00:00').getTime() - today;
    const d = Math.abs(diff) + (diff < 0 ? 1 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const mutateConcept = (fn) => { let r; update((d) => { const m = d.matches.find((x) => x.id === d.currentMatchId); if (m) r = fn(m, d); }); return r; };
const dateLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

export function Wedstrijd({ state }) {
  const team = activeTeam(state);
  const match = currentMatch(state);
  const stale = !match || (!match.started && match.teamId !== team.id);
  useEffect(() => { if (stale) update((d) => newConcept(d)); }, [stale]);
  // later toegevoegde programma-wedstrijd automatisch voorstellen als er nog niets is ingevuld
  const auto = !stale && !match.started && !match.scheduleId && !(match.setup && match.setup.opponent) ? nextScheduled(team, state.matches) : null;
  useEffect(() => {
    if (auto) update((d) => useScheduleInConcept(d, auto));
  }, [auto && auto.id]);
  if (stale) return html`<main class="matchscreen"></main>`;
  const mteam = state.teams.find((t) => t.id === match.teamId) || team;
  if (match.finished) return html`<${DoneView} match=${match} team=${mteam} />`;
  if (!match.started) return html`<${PrepView} state=${state} match=${match} team=${mteam} key=${'prep' + match.id} />`;
  return html`<${LiveView} match=${match} team=${mteam} key=${'live' + match.id} />`;
}

function Affiche({ match, team, onClick, children, todo = false }) {
  return html`<header class="mhead">
    <button type="button" class=${'affiche' + (todo ? ' todo' : '')} onClick=${onClick} aria-label="Wedstrijdgegevens">
      <${TeamBadge} team=${team} size=${32} />
      <span class="col grow" style="gap:0;min-width:0">
        <span class="aff-title">${match.opponent ? 'tegen ' + match.opponent : todo ? 'Tegen wie speel je?' : 'Tegenstander?'}</span>
        <span class="aff-sub">${dateLabel(match.date)}${match.time ? ' · ' + match.time : ''}${match.field ? ' · ' + match.field : ''}${match.home === false ? ' · uit' : ''}</span>
      </span>
      <${OppBadge} name=${match.opponent} size=${32} />
    </button>
    ${children}
  </header>`;
}

const LNAME_LIVE = { V: 'voor', M: 'het midden', A: 'achter' };

// ================= voorbereiden =================
// het laatst getoonde plan (per wedstrijd), zodat de rekenanimatie ook komt als je terugkomt na een andere instelling
let seenPlan = { id: null, sig: null };
function PrepView({ state, match, team }) {
  const [sheet, setSheet] = useState(null);
  // uitleg over de twee manieren van wisselen: eerst de modus die nu aan staat, dan (tik) de andere
  const [tour, setTour] = useState(0);
  const counts = useMemo(() => keeperCounts(state, team), [state.matches, team.id]);
  const setup = match.setup || {};
  const F = team.lines.A + team.lines.M + team.lines.V;
  const field = match.present.filter((id) => id !== match.keeperId);
  const tooFew = field.length < F || (team.keeper && !match.keeperId);
  const plan = match.plan;
  const swaps = plan ? new Set(plan.steps.filter((s) => s.type === 'swap').map((s) => s.t)).size : 0;
  const perMoment = Math.max(1, Math.min(5, team.rules.perMoment || 1));
  const emptyGp = M.isOwn(match, team) && !(match.gameplan && match.gameplan.base);
  const todo = [!setup.present && 'wie er is', team.keeper && !setup.keeper && 'de keeper', !setup.opponent && 'de tegenstander'].filter(Boolean);
  const gp = match.gameplan;
  const gpSt = useMemo(() => (M.isOwn(match, team) && gp && gp.base ? M.gpStats(match, team) : null), [match, team]);
  // klaar voor de aftrap: spelers, keeper en tegenstander bevestigd; bij Zelf plannen ook een vol en eerlijk game plan
  const ready = !tooFew && !todo.length &&
    (!M.isOwn(match, team) || (gpSt && gp.base && gpSt.blocks.every((b) => b.ok) && gpSt.max - gpSt.min <= (M.effRules(match, team).marge || 5) * 60 + 30));
  // Autopilot rekent door: verandert het plan (spelers aangemeld, keeper, profiel, focus), dan loopt de knop vol,
  // schuiven de spelers even heen en weer en glanst het resultaat. Mensen vertrouwen een uitkomst meer als ze het
  // werk zien. Na eigen sleepwerk op het veld alleen de knop, niet de spelers.
  const sig = plan && !M.isOwn(match, team) && !match.started ? JSON.stringify([(match.events[0] || {}).pos, plan.steps.map((s) => (s.type === 'swap' ? [s.t, s.out, s.in] : [s.t, Object.keys(s.pos || {}).sort().join()]))]) : null;
  const [think, setThink] = useState(null);
  const thinkRef = useRef(null);
  thinkRef.current = think;
  const manual = useRef(0);
  useEffect(() => {
    if (!sig) return;
    const prev = seenPlan.id === match.id ? seenPlan.sig : null;
    seenPlan = { id: match.id, sig };
    // rekent hij al (bijv. na een tik op Autopilot), dan loopt die animatie gewoon door
    if (!prev || prev === sig || (thinkRef.current && thinkRef.current.phase === 'run')) return;
    setThink({ k: Date.now(), phase: 'run', shuffle: Date.now() - manual.current > 1200 });
  }, [sig]);
  // tik op Autopilot (ook als hij al aan staat): de app rekent het plan opnieuw door in de rekendraad. Alles wat je
  // vastzette blijft staan (speldjes, gesleepte startopstelling, rust-opstelling, basis); bij dezelfde invoer is de
  // uitkomst hetzelfde, maar het is een frisse controle.
  const replay = () => {
    setThink({ k: Date.now(), phase: 'run', shuffle: true });
    const st = getState();
    const m0 = st.matches.find((x) => x.id === st.currentMatchId);
    const t0 = m0 && st.teams.find((x) => x.id === m0.teamId);
    if (!m0 || !t0 || m0.started || M.isOwn(m0, t0)) return;
    const strip = (m) => JSON.stringify({ ...m, plan: null });
    const before = strip(m0);
    compute('replan', { match: JSON.parse(JSON.stringify(m0)), team: t0 }).then((plan) => {
      if (!plan) return;
      update((d) => { const m = d.matches.find((x) => x.id === m0.id); if (m && !m.started && strip(m) === before) m.plan = plan; });
    }).catch(() => {});
  };
  useEffect(() => {
    if (!think) return undefined;
    const tm = setTimeout(() => setThink(think.phase === 'run' ? { ...think, phase: 'done' } : null), think.phase === 'run' ? 1500 : 1400);
    return () => clearTimeout(tm);
  }, [think && think.k, think && think.phase]);
  const byHand = () => { manual.current = Date.now(); };
  // aftrap: het veld en het affiche gaan vloeiend over in het live-scherm, het scorebord valt erin
  const start = () => {
    unlockAudio();
    viewTransition('start', () => mutateConcept((m) => M.startClock(m)));
  };
  return html`<main class="matchscreen with-dock">
    <${Affiche} match=${match} team=${team} todo=${!setup.opponent} onClick=${() => setSheet('opp')}>
      <button type="button" class="iconbtn" aria-label="Menu" onClick=${() => setSheet('menu')}><${Icon} name="more" size=${22} /></button>
    </${Affiche}>
    <div class=${'setuprow' + (think && !M.isOwn(match, team) ? ' pt-open' : '')}>
      <${SquadBar} match=${match} team=${team} onOpen=${setSheet} />
      ${!tooFew && (plan || gpSt) && html`<${PlayBtn} match=${match} team=${team} think=${think} st=${gpSt} own=${M.isOwn(match, team)} onOpen=${() => setSheet('speeltijd')} />`}
    </div>
    ${tooFew
      ? html`<div class="card" style="flex:1 1 auto;justify-content:center;text-align:center"><span class="h2">Te weinig spelers</span><span class="sub">Je hebt ${F} veldspelers nodig${team.keeper ? ' plus een keeper' : ''}. Tik op "spelers".</span></div>`
      : html`
        <${ModeSwitch} match=${match} team=${team} swaps=${swaps} perMoment=${perMoment} st=${gpSt} onTour=${() => setTour(1)} onSheet=${setSheet} think=${think} onReplay=${replay} />
        <div class="grow-field"><${PlanView} match=${match} team=${team} compact editable=${!M.isOwn(match, team)} thinking=${think && (think.phase === 'done' || think.shuffle) ? think.phase : null}
          onLocked=${M.isOwn(match, team) ? () => toast('Je plant zelf: spelers verplaats je in je game plan.', { label: 'Open', run: () => go('/plan') }) : null}
          onTour=${() => { haptic('select'); setTour(1); }}
          onSwap=${(a, b) => { byHand(); conceptDrop(mutateConcept, team, a, b); mutateConcept((m) => { m.setup = { ...(m.setup || {}), base: true }; }); }}
          onPinHere=${(t, pairs, no, moves, kind) => {
            byHand();
            mutateConcept((m, d) => M.pinMoment(m, d.teams.find((x) => x.id === m.teamId), t, pairs, 'terug', moves));
            toast(kind === 'form' ? `Andere opstelling vanaf wissel ${no}. Tik het speldje om los te maken.` : kind ? `Plekwissel bij wissel ${no} vastgezet. Tik het speldje om los te maken.` : `Wissel ${no} vastgezet. Tik het speldje om los te maken.`);
          }}
          onUnpin=${M.isOwn(match, team) ? null : (t, no) => {
            byHand();
            const prev = JSON.parse(JSON.stringify(match.pins || []));
            const prevB = match.breakLineups ? JSON.parse(JSON.stringify(match.breakLineups)) : null;
            const teamOf = (m, d) => d.teams.find((x) => x.id === m.teamId);
            mutateConcept((m, d) => M.unpinMoment(m, teamOf(m, d), t));
            const L = M.periodLen(team);
            toast(no ? `Speldje bij wissel ${no} weg · de app rekent opnieuw` : `Opstelling ${M.periodLabel(team, Math.round(t / L))} weer van de app`, { label: 'Ongedaan', run: () => mutateConcept((m, d) => { m.pins = prev; m.breakLineups = prevB; M.replan(m, teamOf(m, d)); }) });
          }}
          onBreakSwap=${M.isOwn(match, team) ? null : (p, t, lu) => {
            byHand();
            mutateConcept((m, d) => M.setBreakLineup(m, d.teams.find((x) => x.id === m.teamId), p, lu));
            toast(`Opstelling ${M.periodLabel(team, p)} vastgezet. Tik het speldje om los te maken.`);
          }} /></div>`}
    <div class="prepdock">
      <button type="button" class=${'btn primary startbtn' + (ready ? ' ready' : '')} disabled=${tooFew} onClick=${() => (emptyGp ? setSheet('gpleeg') : todo.length ? setSheet('confirm') : start())}>
        <${Icon} name="play" size=${20} /><span class="sb-t"><b>Start</b><small>${ready ? 'klaar voor de aftrap' : 'tik bij de aftrap'}</small></span>
      </button>
      <a class="dockbtn" href="#/seizoen"><${Icon} name="chart" size=${20} /><span>Seizoen</span></a>
      <a class="dockbtn" href="#/team"><${Icon} name="team" size=${20} /><span>Team</span></a>
    </div>

    ${sheet === 'players' && html`<${SquadSheet} match=${match} team=${team} counts=${counts} onClose=${() => setSheet(null)} />`}
    ${sheet === 'base' && html`<${BaseSheet} match=${match} team=${team} onClose=${() => setSheet(null)} />`}
    ${sheet === 'speeltijd' && html`<${PlayTimeSheet} match=${match} team=${team} onClose=${() => setSheet(null)} onOpenPlan=${() => { setSheet(null); go('/plan'); }} />`}
    ${sheet === 'opp' && html`<${OpponentSheet} match=${match} upcoming=${upcomingFor(team, state.matches)} onClose=${() => setSheet(null)} />`}
    ${sheet === 'menu' && html`<${GameMenu} match=${match} team=${team} onClose=${() => setSheet(null)} onSheet=${setSheet} />`}
    ${tour > 0 && html`<${ModeTour} match=${match} team=${team} step=${tour} setStep=${setTour} />`}
    ${sheet === 'confirm' && html`<${Confirm} title="Toch starten?" text=${'Nog niet bevestigd: ' + todo.join(', ') + '.'} yes="Start" onYes=${start} onClose=${() => setSheet(null)} />`}
    ${sheet === 'gpleeg' && html`<${Confirm} title="Je game plan is nog leeg" text="Er staan nog geen wissels gepland. Maak eerst je game plan, of kies Autopilot." yes="Toch starten" onYes=${start} onClose=${() => setSheet(null)} />`}
  </main>`;
}

// Uitleg over de twee manieren van wisselen, als lichte laag over het scherm. Kaart 1: de manier die nu aan staat
// (met wat je hier kunt). Tik ergens: kaart 2, de andere manier en hoe je overstapt. Nog een tik: dicht.
const MODES = {
  app: {
    name: 'Autopilot', ai: true,
    what: 'De app maakt het plan uit je teaminstellingen: wie wanneer wisselt, eerlijk verdeeld en op de goede plek. Tijdens de wedstrijd rekent hij mee met wat er gebeurt.',
    how: ['Sleep hier spelers: bij de start pas je de opstelling aan.', 'Sleep bij een later moment en je zet dat moment vast (speldje); de app rekent de rest opnieuw.', 'Live schuif je de ring om te wisselen; de app past zich aan.'],
  },
  eigen: {
    name: 'Zelf plannen', ai: false,
    what: 'Jij bepaalt per blok wie waar speelt, op je game plan (een tabel of het veld). De app rekent de gevolgen uit en geeft tips, maar verandert zelf niets.',
    how: ['Op dit scherm bekijk je het plan; aanpassen doe je in je game plan.', 'Live voert de app precies jouw plan uit.'],
  },
};
function ModeTour({ match, team, step, setStep }) {
  const own = M.isOwn(match, team);
  const cur = own ? 'eigen' : 'app';
  const key = step === 1 ? cur : cur === 'app' ? 'eigen' : 'app';
  const md = MODES[key];
  const active = key === cur;
  const close = () => setStep(0);
  const next = () => { haptic('select'); if (step === 1) setStep(2); else close(); };
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const switchTo = () => {
    close();
    if (key === 'app') { switchPlanMode('app', true); toast('Autopilot staat aan. Je game plan blijft bewaard.', { label: 'Ongedaan', run: () => switchPlanMode('eigen', true) }); }
    else { switchPlanMode('eigen', true); go('/plan'); }
  };
  return html`<${Portal}><div class="mtour" role="dialog" aria-modal="true" aria-label=${'Uitleg ' + md.name} onClick=${next}>
    <div class=${'mt-card' + (md.ai ? ' ai' : '')} key=${key}>
      <div class="mt-top">
        <span class=${'pc-ico' + (md.ai ? ' ai' : '')}><${Icon} name=${md.ai ? 'spark' : 'edit'} size=${18} /></span>
        <b class=${'mt-name' + (md.ai ? ' ai-grad' : '')}>${md.name}</b>
        ${active ? html`<span class="mt-on"><${Icon} name="check" size=${12} />Nu actief</span>` : html`<span class="mt-off">De andere manier</span>`}
        <button type="button" class="mt-x" aria-label="Sluiten" onClick=${(e) => { e.stopPropagation(); close(); }}><${Icon} name="x" size=${16} /></button>
      </div>
      <p class="mt-what">${md.what}</p>
      <ul class="mt-how">${md.how.map((t, k) => html`<li key=${k}>${t}</li>`)}</ul>
      <div class="mt-acts" onClick=${(e) => e.stopPropagation()}>
        ${active && key === 'eigen' && html`<button type="button" class="btn primary block" onClick=${() => { close(); go('/plan'); }}>Open game plan</button>`}
        ${!active && html`<button type="button" class=${'btn block ' + (key === 'app' ? 'primary' : 'plain')} onClick=${switchTo}>${key === 'app' ? 'Overstappen naar Autopilot' : 'Ga zelf plannen'}</button>
          <span class="mt-note">${key === 'app' ? 'Je game plan blijft bewaard; je kunt altijd terug.' : 'Autopilot blijft beschikbaar; je kunt altijd terug.'}</span>`}
        ${active && own && html`<button type="button" class="btn plain block" onClick=${() => setStep(2)}>Liever slepen? Bekijk Autopilot</button>`}
      </div>
    </div>
    <span class="mt-tap">${step === 1 ? 'Tik voor de andere manier ›' : 'Tik om te sluiten'}</span>
  </div></${Portal}>`;
}

function OpponentSheet({ match, upcoming = [], onClose }) {
  const [opp, setOpp] = useState(match.opponent || '');
  const [date, setDate] = useState(match.date);
  const [time, setTime] = useState(match.time || '');
  const [fieldNo, setFieldNo] = useState(match.field || '');
  const save = () => {
    update((d) => {
      const m = d.matches.find((x) => x.id === match.id);
      if (m.scheduleId && (opp.trim() !== m.opponent || date !== m.date)) delete m.scheduleId;
      m.opponent = opp.trim(); m.date = date; m.time = time; m.field = fieldNo.trim();
      if (m.setup) m.setup = { ...m.setup, opponent: !!m.opponent };
    });
    onClose();
  };
  const choose = (e) => {
    update((d) => useScheduleInConcept(d, e));
    onClose();
  };
  const [listOpen, setListOpen] = useState(false);
  const [more, setMore] = useState(false);
  const current = upcoming.find((e) => e.id === match.scheduleId) || closestEntry(upcoming);
  const entryLine = (e) => `${dateLabel(e.date)}${e.time ? ' · ' + e.time : ''}${e.home === false ? ' · uit' : ' · thuis'}${e.field ? ' · ' + e.field : ''}`;
  return html`<${Sheet} onClose=${save} label="Wedstrijdgegevens">
    <span class="h2" style="font-size:22px">Wedstrijd</span>
    ${upcoming.length > 0 && current && html`<div class="col">
      <span class="label">Uit het programma</span>
      <button type="button" class="progsel" aria-expanded=${listOpen ? 'true' : 'false'} onClick=${() => setListOpen(!listOpen)}>
        <${OppBadge} name=${current.opponent} size=${36} />
        <span class="col grow" style="gap:1px;min-width:0"><span class="pr-name">${current.opponent || 'Tegenstander'}${match.scheduleId === current.id ? html` <span class="tag advies">gekozen</span>` : ''}</span>
          <span class="pr-meta">${entryLine(current)}</span></span>
        <span class=${'chev' + (listOpen ? ' open' : '')} style="transform:rotate(90deg)"><${Icon} name="chev" size=${18} /></span>
      </button>
      <div class=${'collapse' + (listOpen ? ' open' : '')}><div>
        <div class="plist">
          ${(more ? upcoming : upcoming.slice(0, 4)).map((e) => html`<button type="button" key=${e.id} class=${'prow2' + (match.scheduleId === e.id ? ' on' : '')} onClick=${() => choose(e)}>
            <${OppBadge} name=${e.opponent} size=${30} />
            <span class="col grow" style="gap:1px;min-width:0"><span class="pr-name">${e.opponent || 'Tegenstander'}</span><span class="pr-meta">${entryLine(e)}</span></span>
            ${match.scheduleId === e.id && html`<span class="pr-check" aria-hidden="true">✓</span>`}
          </button>`)}
          ${upcoming.length > 4 && html`<button type="button" class="morebtn" onClick=${() => setMore(!more)}>${more ? 'Minder tonen' : `Laat meer zien… (${upcoming.length - 4})`}</button>`}
        </div>
      </div></div>
      <span class="label" style="margin-top:6px">Of zelf invullen</span>
    </div>`}
    <div class="col"><label class="label" for="o-opp">Tegenstander</label><${OpponentInput} id="o-opp" value=${opp} onChange=${setOpp} /></div>
    ${opp.trim() && html`<${ShieldColors} name=${opp} />`}
    <div class="row">
      <div class="col grow"><label class="label" for="o-date">Datum</label><input id="o-date" type="date" class="input" value=${date} onInput=${(e) => setDate(e.target.value)} onChange=${(e) => setDate(e.target.value)} /></div>
      <div class="col" style="width:110px"><label class="label" for="o-time">Tijd</label><input id="o-time" type="time" class="input" value=${time} onInput=${(e) => setTime(e.target.value)} onChange=${(e) => setTime(e.target.value)} /></div>
    </div>
    <div class="col"><label class="label" for="o-field">Veld</label><input id="o-field" class="input" value=${fieldNo} placeholder="Bijv. 3" onInput=${(e) => setFieldNo(e.target.value)} /></div>
    <button type="button" class="btn primary block" onClick=${save}>Klaar</button>
  </${Sheet}>`;
}

// ================= live =================
// ---------- focus van de opstelling: verticale rail langs het veld ----------
// Boven = aanvallen, midden = balans, onder = verdedigen (zoals het veld: aanval boven, eigen doel onder).
const FOCUS = [['aanvallen', 'Aanvallen', 'up2'], ['balans', 'Balans', 'even'], ['verdedigen', 'Verdedigen', 'down2']];
const FOCUS_TXT = { aanvallen: 'Meer kracht voorin', balans: 'Kracht gelijk verdeeld', verdedigen: 'Meer kracht achterin' };
function FocusRail({ stand, auto, canAuto, onSet, onAuto }) {
  const [open, setOpen] = useState(false);
  // stop waar de duim nu boven hangt tijdens het slepen (null = niet aan het slepen)
  const [hk, setHk] = useState(null);
  const track = useRef(null);
  const st = useRef(null);
  const idx = Math.max(0, FOCUS.findIndex(([v]) => v === stand));
  useEffect(() => { if (!open) return undefined; const t = setTimeout(() => setOpen(false), 8000); return () => clearTimeout(t); }, [open, stand, auto]);
  // de duim staat via een CSS-variabele op de rail: tijdens het slepen schrijven we die direct (geen herteken per beweging)
  const setF = (f) => { if (track.current) track.current.style.setProperty('--f', f.toFixed(4)); };
  useLayoutEffect(() => { if (!st.current || !st.current.moved) setF(idx / 2); }, [idx]);
  const fracAt = (y) => { const r = track.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (y - r.top) / r.height)); };
  const paint = () => {
    const s = st.current;
    if (!s) return;
    s.raf = 0;
    const f = fracAt(s.py);
    setF(f);
    const k = Math.round(f * 2);
    if (k !== s.k) { s.k = k; setHk(k); if (s.moved) haptic('select'); }
  };
  const down = (e) => { e.stopPropagation(); st.current = { y: e.clientY, py: e.clientY, moved: false, k: null, raf: 0 }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ } };
  const move = (e) => {
    const s = st.current; if (!s) return;
    s.py = e.clientY;
    if (!s.moved) {
      if (Math.abs(e.clientY - s.y) < 6) return;
      s.moved = true;
      s.k = idx;
      track.current.parentElement.classList.add('dragging');
      setHk(idx);
    }
    if (!s.raf) s.raf = requestAnimationFrame(paint);
  };
  const up = (e) => {
    const s = st.current; st.current = null; if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (!s.moved) { setOpen(!open); return; }
    const k = Math.round(fracAt(e.clientY) * 2);
    // eerst de overgang weer aanzetten, dan veert de duim vanaf je vinger naar de stop
    const box = track.current.parentElement;
    box.classList.remove('dragging');
    void box.offsetWidth;
    setF(k / 2);
    setHk(null);
    if (FOCUS[k][0] !== stand || auto) onSet(FOCUS[k][0]);
  };
  const cancel = () => { const s = st.current; st.current = null; if (s && s.raf) cancelAnimationFrame(s.raf); if (track.current) track.current.parentElement.classList.remove('dragging'); setF(idx / 2); setHk(null); };
  const [, label, icon] = FOCUS[idx];
  const hover = hk != null ? FOCUS[hk] : null;
  return html`${open && html`<button type="button" class="f-scrim" aria-label="Sluiten" onClick=${() => setOpen(false)}></button>`}
  <div class=${'focus f-' + stand + (open ? ' open' : '') + (hk != null ? ' dragging' : '')}>
    <div class="f-track" ref=${track}>
      <span class="f-line"></span>
      ${FOCUS.map(([v, l], k) => html`<button type="button" class=${'f-stop' + (k === idx ? ' on' : '') + (hover && k === hk ? ' aim' : '')} style=${`top:${k * 50}%`} tabindex=${open ? 0 : -1}
        onClick=${() => { setOpen(false); if (v !== stand || auto) setTimeout(() => onSet(v), 260); }} aria-label=${l}><i></i><span class="f-lbl"><b>${l}</b><small>${FOCUS_TXT[v]}</small></span></button>`)}
      <button type="button" class="f-thumb" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel}
        aria-label=${'Focus: ' + label + (auto ? ', automatisch op de stand' : '') + '. Tik om te kiezen of sleep omhoog of omlaag.'}>
        <${Icon} name=${icon} size=${18} />${auto && html`<b class="f-auto">A</b>`}
      </button>
      ${hover && html`<span class="f-bubble live" key=${'b' + hk}><b>${hover[1]}</b><small>${FOCUS_TXT[hover[0]]}</small></span>`}
    </div>
    ${open && html`<div class="f-foot">
      ${canAuto && html`<button type="button" class=${'f-autobtn' + (auto ? ' on' : '')} aria-pressed=${auto} onClick=${() => onAuto(!auto)}><span class="f-sw"><i></i></span><span class="col" style="gap:0"><b>Auto op stand</b><small>Volgt de stand van de wedstrijd</small></span></button>`}
      <span class="f-hint">Geldt vanaf de volgende wissel</span>
    </div>`}
  </div>`;
}

// ---------- stand handmatig aanpassen (⋯-menu) ----------
function ScoreSheet({ match, team, onClose }) {
  const nick = (id) => M.nickOf(team, id);
  const goals = {}; let unknown = 0, us = 0, them = 0;
  for (const e of match.events) {
    if (e.type === 'goal') { us++; if (e.scorer) goals[e.scorer] = (goals[e.scorer] || 0) + 1; else unknown++; }
    else if (e.type === 'oppgoal') them++;
  }
  const ids = [...new Set(match.present.concat(Object.keys(goals)))].filter((id) => team.players.some((p) => p.id === id));
  ids.sort((a, b) => (goals[b] || 0) - (goals[a] || 0) || nick(a).localeCompare(nick(b)));
  const setFor = (id, v) => mutate((m, t) => { const cur = id === 'opp' ? them : id ? (goals[id] || 0) : unknown; if (v > cur) M.goal(m, t, id); else if (v < cur) M.removeGoal(m, t, id, false); });
  const setOpp = (v) => mutate((m, t) => { if (v > them) M.oppGoal(m, t); else if (v < them) M.removeGoal(m, t, null, true); });
  return html`<${Sheet} onClose=${onClose} label="Stand aanpassen">
    <span class="h2" style="font-size:22px">Stand aanpassen</span>
    <div class="ss-total"><${TeamBadge} team=${team} size=${36} /><span class="ss-sc"><${Roll} text=${String(us)} /><span class="ss-colon">:</span><${Roll} text=${String(them)} /></span><${OppBadge} name=${match.opponent} size=${38} /></div>
    <div class="ss-row opp"><${OppBadge} name=${match.opponent} size=${26} /><span class="grow">Tegengoals<small>${match.opponent || 'Tegenstander'}</small></span><${Stepper} value=${them} label="Tegengoals" onChange=${setOpp} /></div>
    <span class="label" style="margin-top:6px">Onze doelpunten</span>
    <div class="ss-list">
      ${ids.map((id) => html`<div class=${'ss-row' + (goals[id] ? ' has' : '')} key=${id}><span class="grow">${nick(id)}</span><${Stepper} value=${goals[id] || 0} label=${'Doelpunten ' + nick(id)} onChange=${(v) => setFor(id, v)} /></div>`)}
      <div class="ss-row"><span class="grow">Onbekend<small>Wie scoorde weet je niet</small></span><${Stepper} value=${unknown} label="Doelpunten onbekend" onChange=${(v) => setFor(null, v)} /></div>
    </div>
    <button type="button" class="btn plain block" onClick=${onClose}>Klaar</button>
  </${Sheet}>`;
}

function LiveView({ match, team }) {
  const now = useNow(match.clock.running ? 500 : 1000);
  const L = M.periodLen(team);
  const T = M.gameTime(match, team, now);
  const el = M.elapsedInPeriod(match, now);
  const tick = Math.floor(T);
  const d = useMemo(() => M.derive(match, team, T), [match, team, tick]);
  const nick = (id) => M.nickOf(team, id);
  const group = M.nextGroup(match, team);
  const next = group[0] || null;
  // game plan: een moment met alleen plekwissels (of een andere opstelling) dat vóór de volgende wissel komt
  const mo = M.nextMovesOnly(match, team);
  const moNow = !!(mo && (!next || mo.t < next.t));
  const countdown = moNow ? mo.t - T : next ? next.t - T : null;
  const pending = M.lineupPending(match, team);
  const timeUp = !match.finished && el >= L;
  const counts = M.swapCounts(match);
  const stand = M.currentStand(match, team, d.score);
  const running = match.clock.running;
  const [sheet, setSheet] = useState(null);
  const zone = useRef(null);
  useWakeLock(true);
  // doelpunt in het veld: 'who' (voor wie?) → 'scorer' (tik de speler); daarna een feestje met 'ongedaan maken'
  const [goal, setGoal] = useState(null);
  const [cele, setCele] = useState(null);
  useEffect(() => { if (!cele) return undefined; const t = setTimeout(() => setCele(null), 3000); return () => clearTimeout(t); }, [cele]);
  // actiepil boven de keeper: ongedaan maken (en bij naar de bank: kan terug / rust / klaar)
  const [act, setAct] = useState(null);
  useEffect(() => { if (!act) return undefined; const t = setTimeout(() => setAct(null), act.out ? 7000 : 6000); return () => clearTimeout(t); }, [act && act.key, act && act.status]);
  const showAct = (a) => { const v = { key: Date.now(), undos: 1, out: null, status: 'terug', top: false, ...a }; v.base = v.status !== 'terug' ? v.undos - (v.outs ? v.outs.length : 1) : v.undos; setAct(v); };
  // terug uit de planner na 'Wissel nu': dezelfde ongedaan-pil als hier
  useEffect(() => {
    if (liveAct.next) { const a = liveAct.next; liveAct.next = null; setTimeout(() => showAct(a), 120); }
    // 'Wissel nu' in de planner: de wissel gebeurt hier, na de schermovergang, zodat je hem ziet gebeuren
    const run = liveAct.run;
    if (run && run.moves) {
      liveAct.run = null;
      setTimeout(() => { mutate((m, t) => M.doPlannedMoves(m, t)); toast('Plekwissel gedaan, zoals gepland', undoAction); }, reduced() ? 60 : TEMPO.screen + 150);
    } else if (run) {
      liveAct.run = null;
      setTimeout(() => {
        const ps = run.pairs;
        mutate((m, t) => (M.isOwn(m, t) || M.nextMoves(m, t).length ? M.doPlannedMoment(m, t) : ps.length > 1 ? M.doSwapGroup(m, t, ps) : M.doSwap(m, t, ps[0].out, ps[0].in, ps[0].shift)));
        showAct(ps.length > 1 ? { outs: ps.map((p) => p.out), undos: 1 } : { out: ps[0].out, undos: 1 });
      }, reduced() ? 60 : TEMPO.screen + 150);
    }
  }, []);
  const undoAct = () => {
    const n = act.undos;
    mutate((m, t) => { for (let k = 0; k < n; k++) M.undo(m, t); });
    setAct(null); setCele(null);
  };
  // status van wie eruit ging: 'terug' (kan terug), 'periode' (rust), 'wedstrijd' (klaar)
  const setStatus = (v) => {
    if (!act || v === act.status) return;
    const ids = act.outs || [act.out];
    mutate((m, t) => {
      if (act.status !== 'terug') for (const id of ids) { const u = M.lastUndoable(m); if (u && u.ev.type === 'disable' && ids.indexOf(u.ev.playerId) !== -1) M.undo(m, t); }
      if (v !== 'terug') for (const id of ids) M.disablePlayer(m, t, id, v);
    });
    setAct({ ...act, status: v, undos: act.base + (v !== 'terug' ? ids.length : 0) });
  };
  // focus die je ziet: na een doelpunt schuift hij pas als het feestje voorbij is
  const [shownStand, setShownStand] = useState(stand);
  const [cheer, setCheer] = useState(null);
  const [focusNote, setFocusNote] = useState(null);
  useEffect(() => { if (!focusNote) return undefined; const t = setTimeout(() => setFocusNote(null), 3800); return () => clearTimeout(t); }, [focusNote && focusNote.key]);
  const celeRef = useRef(null);
  celeRef.current = cele;
  useEffect(() => {
    if (stand === shownStand) return undefined;
    const fromGoal = celeRef.current && Date.now() - celeRef.current.key < 2000;
    const t = setTimeout(() => {
      setShownStand(stand);
      setCheer((c) => ({ line: { aanvallen: 'V', verdedigen: 'A', balans: 'all' }[stand], n: (c ? c.n : 0) + 1 }));
      setFocusNote({ stand, auto: team.rules.autoStand && match.standMode !== 'manual', key: Date.now() });
    }, fromGoal ? 2700 : 0);
    return () => clearTimeout(t);
  }, [stand]);
  useEffect(() => { if (!cheer) return undefined; const t = setTimeout(() => setCheer(null), 1600); return () => clearTimeout(t); }, [cheer && cheer.n]);
  const scoreFor = (id) => {
    mutate((m, t) => M.goal(m, t, id));
    setGoal(null);
    setCele({ us: true, id, key: Date.now() });
    showAct({ label: id ? 'Goal ' + nick(id) : 'Goal', top: !!id && id === d.state.keeper });
  };
  const oppScores = () => {
    mutate((m, t) => M.oppGoal(m, t));
    setGoal(null);
    setCele({ us: false, key: Date.now() });
    showAct({ label: 'Tegengoal' });
  };

  const alerted = useRef({});
  useEffect(() => {
    if (!running) return;
    if (next || moNow) {
      const key = moNow ? 'mv' + mo.t : next.t + ':' + next.out + ':' + next.in;
      if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
      if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
    }
    if (timeUp && !alerted.current['end' + match.clock.period]) { alerted.current['end' + match.clock.period] = 1; beep(2, 520); flash(); }
  }, [tick, running]);

  // ---------- rust: iedereen staat aan de kant, je begint opnieuw met één opstelling ----------
  const restOpts = useMemo(() => (pending ? M.breakOptions(match, team) : null), [pending, match, team]);
  const [rest, setRest] = useState(null);
  useEffect(() => {
    if (!pending) { if (rest) setRest(null); return; }
    // standaard: aanbevolen; na een keeperwissel opnieuw (de keeper hoort niet in het veld of op de bank)
    if (restOpts && (!rest || rest.keeper !== restOpts.keeper)) setRest({ kind: rest && rest.kind !== 'eigen' ? rest.kind : 'aanbevolen', lu: restOpts[rest && rest.kind !== 'eigen' ? rest.kind : 'aanbevolen'], keeper: restOpts.keeper });
  }, [pending, restOpts && restOpts.keeper]);
  const pickRest = (kind) => { if (restOpts && restOpts[kind]) setRest({ kind, lu: restOpts[kind], keeper: restOpts.keeper }); };
  const restDrop = (a, b) => {
    if (!rest) return;
    const lu = rest.lu;
    if (b.slice(0, 5) === 'line:') {
      const [, to, at] = b.split(':');
      const from = lu.pos[a];
      const lines = M.formationAfter(lu.lines, from, to);
      if (!lines) return;
      setRest({ ...rest, kind: 'eigen', lu: { ...lu, lines, slots: M.moveSlot(lu.slots, a, from, to, lines, +at), pos: { ...lu.pos, [a]: to } } });
      return;
    }
    setRest({ ...rest, kind: 'eigen', lu: { ...lu, ...M.swapInLineup(lu, a, b) } });
  };
  const restHint = (a, b) => {
    if (!rest) return null;
    const lu = rest.lu;
    if (b.slice(0, 5) === 'line:') return a in lu.pos ? M.formationLabel(lu.lines, lu.pos[a], b.split(':')[1]) : null;
    const aF = a in lu.pos, bF = b in lu.pos;
    if (aF === bF) return 'Ruil met ' + nick(b);
    return aF ? nick(b) + ' begint' : 'Begint voor ' + nick(b);
  };
  const startRest = () => {
    unlockAudio();
    const lu = rest ? rest.lu : null;
    mutate((m, t) => {
      if (M.lineupPending(m, t)) { const x = lu || M.breakProposal(m, t); if (x) M.applyLineup(m, t, x); }
      M.startClock(m);
    });
    haptic('success');
  };

  const toggleClock = () => {
    unlockAudio();
    if (timeUp) { setSheet({ type: 'end' }); return; }
    if (running) { mutate((m) => M.pauseClock(m)); return; }
    if (pending) { startRest(); return; }
    mutate((m) => M.startClock(m));
  };

  // slepen in het live-scherm = nu wisselen; de actiepil maakt het ongedaan
  const onDrag = (a, b) => {
    if (b.slice(0, 5) === 'line:') {
      const [, to, at] = b.split(':');
      const lines = mutate((m, t) => M.changeFormation(m, t, a, to, +at));
      if (lines) showAct({ label: 'Opstelling ' + M.formationText(lines) });
      return;
    }
    const aF = a in d.state.pos, bF = b in d.state.pos;
    if (aF && bF) { mutate((m, t) => M.movePlayers(m, t, a, b)); showAct({}); return; }
    if (aF === bF) return;
    const out = aF ? a : b, inn = aF ? b : a;
    let undos = 1;
    // weer inzetten van een speler met rust/klaar heft die status op
    mutate((m, t) => { if (d.state.disabled[inn]) { M.enablePlayer(m, t, inn); undos = 2; } M.doSwap(m, t, out, inn, null); });
    showAct({ out, undos });
  };
  // wat er gebeurt als je hier loslaat (boven de zwevende speler)
  const dragHint = (a, b) => {
    if (b.slice(0, 5) === 'line:') return a in d.state.pos ? M.formationLabel(M.linesOf(match, team), d.state.pos[a], b.split(':')[1]) : null;
    const aF = a in d.state.pos, bF = b in d.state.pos;
    if (aF && bF) return 'Ruil met ' + nick(b);
    if (aF === bF) return null;
    return aF ? nick(b) + ' erin' : 'Erin voor ' + nick(b);
  };
  useDragSwap(zone, !pending && !goal, onDrag, dragHint);
  useDragSwap(zone, pending && !goal && !!rest, restDrop, restHint);

  const tapField = (id) => {
    if (goal === 'scorer') { scoreFor(id); return; }
    if (justDragged(zone)) return;
    if (pending) return;
    if (group.length > 1 && group.some((s) => s.out === id)) { setSheet({ type: 'group' }); return; }
    const inn = next && next.out === id ? next.in : M.suggestIn(match, team, id);
    if (!inn) { toast('Er zit niemand inzetbaar op de bank'); return; }
    setSheet({ type: 'swap', out: id, in: inn, planned: !!(next && next.out === id && next.in === inn) });
  };
  const tapBench = (id) => { if (!justDragged(zone)) setSheet({ type: 'bench', id }); };
  const openNext = () => {
    if (pending) return;
    else if (timeUp) setSheet({ type: 'end' });
    // de planner: groot veld, nu en straks, wissel nu of plan vooruit
    else if (next) go('/plan');
  };

  // ronde wisselknop in het eiland: schuif de ring naar links over het eiland (je duim gaat van het veld af en
  // het eiland loopt vol). Voorbij ~60% en loslaten = de pijlen draaien een slag rond en de wissel gebeurt op
  // het veld. Eerder loslaten = de ring veert terug. Kort tikken doet niets behalve uitleggen hoe het werkt.
  const [spinning, setSpinning] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const [holdHint, setHoldHint] = useState(0);
  const slideRef = useRef(null);
  const SLIDE_OK = 0.6;
  const setSlide = (el, px, f) => { if (!el) return; el.style.setProperty('--sx', px.toFixed(1) + 'px'); if (el.parentElement) el.parentElement.style.setProperty('--sf', f.toFixed(3)); };
  const ringDown = (e) => {
    if (e.button > 0 || spinning || !(group.length || moNow)) return;
    const el = e.currentTarget;
    const isl = el.parentElement && el.parentElement.querySelector('.island');
    const r = el.getBoundingClientRect(), ir = isl ? isl.getBoundingClientRect() : r;
    slideRef.current = { el, x0: e.clientX, y0: e.clientY, t0: Date.now(), track: Math.max(90, r.left - ir.left - 4), f: 0, over: false };
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ }
    el.classList.remove('held');
    el.classList.add('sliding'); el.parentElement.classList.add('sliding');
    setHoldHint(0);
  };
  const ringMove = (e) => {
    const s = slideRef.current;
    if (!s) return;
    const px = Math.max(-s.track, Math.min(0, e.clientX - s.x0));
    s.f = -px / s.track;
    setSlide(s.el, px, s.f);
    // een tikje als je over de drempel gaat (en weer terug)
    if (!s.over && s.f >= SLIDE_OK) { s.over = true; s.el.classList.add('over'); haptic('select'); }
    else if (s.over && s.f < SLIDE_OK - 0.08) { s.over = false; s.el.classList.remove('over'); }
  };
  const ringStop = (cancel) => {
    const s = slideRef.current;
    slideRef.current = null;
    if (!s) return;
    s.el.classList.remove('sliding', 'over'); s.el.parentElement.classList.remove('sliding');
    if (!cancel && s.f >= SLIDE_OK) { setSlide(s.el, -s.track, 1); s.el.classList.add('held'); swapFromRing(); return; }
    setSlide(s.el, 0, 0);
    // alleen getikt: zeg hoe het werkt; halverwege losgelaten: 'nee'
    if (!cancel && s.f < 0.06 && Date.now() - s.t0 < 500) { setHoldHint(Date.now()); haptic('no'); }
    else if (!cancel && s.f >= 0.06) haptic('no');
  };
  const resetRing = () => { const r = document.querySelector('.islandwrap > .i-ring'); if (r) { r.classList.remove('held'); setSlide(r, 0, 0); } };
  useEffect(() => { if (!holdHint) return undefined; const t = setTimeout(() => setHoldHint(0), 2600); return () => clearTimeout(t); }, [holdHint]);
  const swapFromRing = () => {
    if (spinning) return;
    if (moNow) {
      setSpinning(true); setSpinKey((k) => k + 1); haptic('success');
      setTimeout(() => {
        mutate((m, t) => M.doPlannedMoves(m, t));
        toast(mo.moves.some((x) => x.to) ? 'Andere opstelling, zoals gepland' : 'Plekwissel gedaan, zoals gepland', undoAction);
        setSpinning(false);
        resetRing();
      }, reduced() ? 0 : 360);
      return;
    }
    if (!group.length) return;
    const pairs = group.map((s) => ({ out: s.out, in: s.in, shift: s.shift }));
    setSpinning(true);
    setSpinKey((k) => k + 1);
    setPeek(false);
    haptic('success');
    setTimeout(() => {
      // game plan: precies zoals gepland (met doorschuiver en plekwissels); anders zoals altijd
      mutate((m, t) => (M.isOwn(m, t) || M.nextMoves(m, t).length ? M.doPlannedMoment(m, t) : pairs.length > 1 ? M.doSwapGroup(m, t, pairs) : M.doSwap(m, t, pairs[0].out, pairs[0].in, pairs[0].shift)));
      showAct(pairs.length > 1 ? { outs: pairs.map((p) => p.out), undos: 1 } : { out: pairs[0].out, undos: 1 });
      setSpinning(false);
      resetRing();
    }, reduced() ? 0 : 360);
  };

  // na een wissel even rust op het veld: de volgende situatie (zwevers, randen, uitleg) pas als de ongedaan-pil
  // weg is, anders is het te veel tegelijk
  const swapActKey = act && (act.out || act.outs) ? act.key : null;
  const [calmNext, setCalmNext] = useState(false);
  useEffect(() => {
    if (swapActKey) { setCalmNext(true); return undefined; }
    if (!calmNext) return undefined;
    const t = setTimeout(() => setCalmNext(false), 600);
    return () => clearTimeout(t);
  }, [swapActKey]);

  // uitleg: het eiland klapt uit tot een lade met het verhaal van de volgende wissel (en die daarna).
  // Tik op het lipje = open/dicht, vasthouden = alleen zolang je vasthoudt, omlaag vegen = open.
  const [peek, setPeek] = useState(false);
  const peekRef = useRef(null);
  const peekDown = (e) => { peekRef.current = { t: Date.now(), y: e.clientY, was: peek, hold: setTimeout(() => { setPeek(true); haptic('select'); peekRef.current && (peekRef.current.held = true); }, 280) }; };
  const peekMove = (e) => {
    const p = peekRef.current;
    if (!p || p.held) return;
    // omlaag vegen opent de lade (en laat hem open)
    if (e.clientY - p.y > 18) { clearTimeout(p.hold); peekRef.current = null; if (!peek) { setPeek(true); haptic('select'); } }
    else if (p.y - e.clientY > 18) { clearTimeout(p.hold); peekRef.current = null; if (peek) setPeek(false); }
  };
  const peekUp = () => {
    const p = peekRef.current; peekRef.current = null;
    if (!p) return;
    clearTimeout(p.hold);
    if (p.held) setPeek(false);
    else { setPeek(!p.was); haptic('select'); }
  };
  const canPeek = !!next && !moNow && !pending && !goal && !timeUp && !calmNext;
  // na de aftrap (en na de rust) eerst rust op het veld: de wissel zweeft pas na anderhalve minuut mee
  const early = !pending && el < 90 && countdown != null && countdown > 60;
  const floating = !!next && !moNow && !pending && !goal && !timeUp && !calmNext && !early;
  // het lipje van de uitleg valt af en toe op met een rimpeling: zodra de nieuwe zwevers er zijn, en daarna zo nu en dan
  const [rip, setRip] = useState(0);
  useEffect(() => { if (floating) setRip((k) => k + 1); }, [floating, next && next.t]);
  useEffect(() => {
    if (!floating || peek) return undefined;
    const id = setInterval(() => setRip((k) => k + 1), 30000);
    return () => clearInterval(id);
  }, [floating, peek]);
  useEffect(() => {
    if (!peek) return undefined;
    // een tik buiten de lade sluit hem, en doet verder niets: geen wissel of keeperswissel eronder
    const KINDS = ['pointerup', 'mouseup', 'touchend', 'click'];
    let until = 0;
    const eat = (ev) => { if (Date.now() < until) { ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); } };
    const away = (e) => {
      if (e.target.closest('.islandwrap')) return;
      e.stopPropagation(); if (e.cancelable) e.preventDefault();
      until = Date.now() + 700;
      setPeek(false);
    };
    document.addEventListener('pointerdown', away, true);
    for (const k of KINDS) document.addEventListener(k, eat, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      // de rest van deze tik nog even opeten, ook nu de lade al dicht is
      setTimeout(() => { for (const k of KINDS) document.removeEventListener(k, eat, true); }, Math.max(0, until - Date.now()));
    };
  }, [peek]);
  useEffect(() => { if (!canPeek && peek) setPeek(false); }, [canPeek]);
  const lines = M.linesOf(match, team);
  // game plan: plekwissels die met dit moment meegaan
  const movesNow = next ? M.nextMoves(match, team) : [];
  // wat de coach roept: wie eruit, en per speler waar hij aan het eind staat
  const call = canPeek ? M.callStory(d.state.slots, lines, group.map((s) => ({ out: s.out, in: s.in, shift: s.shift })), movesNow) : null;
  const drawer = canPeek && html`<div class=${'isl-drawer' + (peek ? ' open' : '')}>
    <div class="dr-clip" onClick=${() => { if (peek) { setPeek(false); haptic('select'); } }}><div class="dr-body" aria-hidden=${!peek} role="status"><div class="dr-in">
      ${next.fixed && !next.own && html`<span class="pk-when pk-pin">Vastgezet door jou</span>`}
      <div class="pk-line"><${CallStory} call=${call} nick=${nick} /></div>
    </div></div></div>
    <button type="button" class="dr-grab" data-press="none" aria-expanded=${peek}
      aria-label=${peek ? 'Uitleg van de wissel sluiten' : 'Uitleg van de wissel tonen'}
      onPointerDown=${peekDown} onPointerMove=${peekMove} onPointerUp=${peekUp} onPointerCancel=${peekUp} onContextMenu=${(e) => e.preventDefault()}
      onClick=${(e) => { if (e.detail === 0) setPeek(!peek); }}>${rip > 0 && !peek && !reduced() && html`<span class="dr-rip" key=${'rip' + rip} aria-hidden="true"><i></i><i></i></span>`}<${Icon} name="chev" size=${16} /></button>
  </div>`;

  // ---------- wissel-eiland ----------
  const short = (s, n = 12) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
  const LORD = { V: 0, M: 1, A: 2 };
  const accent = useMemo(() => accentFor(team), [team]);
  const pw = M.periodWord(team);
  let isl;
  if (pending) isl = { st: 'hot', k: 'Rust', t1: `Opstelling ${M.periodLabel(team, match.clock.period)}`, t2: 'Tik om de opstelling klaar te zetten', ring: 'rust', full: true };
  else if (timeUp) isl = { st: 'hot', k: 'Tijd!', t1: `Einde ${M.periodLabel(team, match.clock.period)}`, t2: 'Tik om af te sluiten', ring: 'eind', full: true };
  else if (moNow) {
    const late = countdown < -0.5;
    const one = mo.moves[0];
    const mtxt = (x) => (x.to ? `${nick(x.a)} naar ${LNAME_LIVE[x.to]}` : `${nick(x.a)} ↔ ${nick(x.b)}`);
    isl = {
      st: late ? 'hot late' : countdown <= 60 ? 'hot' : '',
      k: mo.moves.some((x) => x.to) ? 'Andere opstelling · gepland' : 'Plekwissel · gepland',
      t1: mo.moves.length > 1 ? html`${mo.moves.length} spelers van linie` : one.to ? html`<em>${nick(one.a)}</em> naar ${LNAME_LIVE[one.to]}` : html`<em>${nick(one.a)}</em> ↔ ${nick(one.b)}`,
      t2: mo.moves.length > 1 ? mo.moves.map(mtxt).join(', ') : one.to ? 'Geen wissel, alleen een andere linie' : 'Ze ruilen van linie, geen wissel',
      ring: countdown <= 0 ? 'nu' : M.fmt(countdown),
      late: late ? '−' + M.fmt(-countdown) : null,
      frac: Math.max(0, Math.min(1, (T - (match.plan ? match.plan.at : 0)) / Math.max(1, mo.t - (match.plan ? match.plan.at : 0)))),
      breathe: countdown <= 0 ? 0.55 : 0.55 + (Math.max(0, countdown) / 60) * 1.1,
      swap: true,
    };
  } else if (next) {
    const n = counts.done + 1;
    const late = countdown < -0.5;
    const s0 = next;
    const said = (call || M.callStory(d.state.slots, lines, group.map((s) => ({ out: s.out, in: s.in, shift: s.shift })), movesNow)).tell;
    isl = {
      st: late ? 'hot late' : countdown <= 60 ? 'hot' : '',
      k: late ? `Te laat · wissel ${n}` : countdown <= 60 ? `Bijna · wissel ${n} van ${counts.total}` : `Volgende wissel · ${n} van ${counts.total}`,
      t1: group.length > 1 ? html`${group.length} spelers tegelijk` : html`<em>${nick(s0.in)}</em> erin voor ${nick(s0.out)}`,
      // in dezelfde taal als de uitleg: waar wie erin komt staat, en wie van plek verandert
      t2: (s0.fixed && !s0.own ? 'Aangepast · ' : '') + (group.length > 1 ? group.map((s) => nick(s.in)).join(', ') + ' erin'
        + (said.length > group.length ? ` · ${said.length - group.length} van plek` : '')
        : said.slice(0, 2).map((x) => `${nick(x.id)} ${x.in ? (x.pos ? x.pos.kort : '') : x.pos ? x.pos.naar : 'schuift door'}`).join(' · ') + (said.length > 2 ? ` · +${said.length - 2}` : '')),
      ring: countdown <= 0 ? 'nu' : M.fmt(countdown),
      late: late ? '−' + M.fmt(-countdown) : null,
      frac: Math.max(0, Math.min(1, (T - (match.plan ? match.plan.at : 0)) / Math.max(1, next.t - (match.plan ? match.plan.at : 0)))),
      breathe: countdown <= 0 ? 0.55 : 0.55 + (Math.max(0, countdown) / 60) * 1.1,
      swap: true,
    };
  } else isl = { st: 'calm', k: 'Geen wissels meer', t1: `deze ${pw}`, t2: '', ring: null };
  const C = 207.3;
  // rust: paneel met drie opstellingen en de startknop, in plaats van het eiland
  const restLu = pending && rest ? rest.lu : null;
  let restPanel = null;
  if (restLu) {
    const prevLabel = M.periodLabel(team, match.clock.period - 1);
    const cur = d.state.pos;
    const comingIn = Object.keys(restLu.pos).filter((id) => !(id in cur));
    const list = (ids) => ids.map(nick).join(ids.length > 2 ? ', ' : ' en ').replace(/, ([^,]*)$/, ' en $1');
    const repl = (restLu.repl || []).map((r) => `${nick(r.in)} voor ${nick(r.out)}`).join(', ');
    const own = restOpts && restOpts.own;
    const why = rest.kind === 'eigen'
      ? 'Eigen opstelling. Kies hierboven om opnieuw te beginnen.'
      : rest.kind === 'advies'
        ? (comingIn.length ? `Advies: ${list(comingIn)} ${comingIn.length > 1 ? 'beginnen, zij speelden' : 'begint, speelde'} het minst.` : 'Advies: dezelfde spelers, op hun beste plek.')
      : rest.kind === 'aanbevolen' && own
        ? (restOpts.planned ? 'Zoals je had gepland.' : `Je had niets gepland: zoals het eind van de ${prevLabel}.`)
      : rest.kind === 'aanbevolen'
        ? (comingIn.length ? `${list(comingIn)} ${comingIn.length > 1 ? 'beginnen: zij speelden' : 'begint: speelde'} het minst.` : 'Dezelfde spelers als aan het eind, op hun beste plek.')
        : `Zoals ${rest.kind === 'start' ? 'de start' : 'het eind'} van de ${prevLabel}.${repl ? ' ' + repl + ' (niet meer inzetbaar).' : ''}`;
    restPanel = html`<div class="restpanel" role="region" aria-label="Opstelling na de rust">
      <div class="rp-head">
        <span class="rp-k">${M.periodWord(team) === 'helft' ? 'Rust' : 'Pauze'}<span class="rp-form" key=${M.formationText(restLu.lines)}>${M.formationText(restLu.lines)}</span></span>
        <button type="button" class="rp-start" onClick=${startRest}><${Icon} name="play" size=${16} />Start ${M.periodLabel(team, match.clock.period)}</button>
      </div>
      <div class="rp-row">
        <div class=${'rp-seg' + (rest.kind === 'eigen' || rest.kind === 'advies' ? ' none' : '')}>
          <${Seg} label="Opstelling na de rust" value=${rest.kind} onChange=${pickRest}
            options=${[['aanbevolen', own ? 'Game plan' : 'Aanbevolen'], ['start', 'Als start'], ['eind', 'Als eind']]} />
        </div>
        ${own && html`<button type="button" class=${'rp-advise' + (rest.kind === 'advies' ? ' on' : '')} aria-pressed=${rest.kind === 'advies' ? 'true' : 'false'} onClick=${() => { haptic('select'); pickRest('advies'); }}><${Icon} name="spark" size=${16} />Advies</button>`}
      </div>
      <span class="rp-why" key=${rest.kind + ':' + comingIn.join()}>${why}</span>
    </div>`;
  }
  const noteOk = focusNote && !goal && !pending && !timeUp && !(next && countdown <= 60);
  const fIcon = { aanvallen: 'up2', balans: 'even', verdedigen: 'down2' };
  const island = noteOk ? html`<button type="button" class=${'island focusnote f-' + focusNote.stand} key=${'fn' + focusNote.key} onClick=${() => setFocusNote(null)}>
    <span class="i-txt"><span class="i-k">Focus${focusNote.auto ? ' · automatisch bij ' + (d.score.us > d.score.them ? 'voorsprong' : d.score.us < d.score.them ? 'achterstand' : 'gelijke stand') : ''}</span>
      <span class="i-t1">${{ aanvallen: 'Aanvallen', balans: 'Balans', verdedigen: 'Verdedigen' }[focusNote.stand]}</span>
      <span class="i-t2">Volgende wissel: ${FOCUS_TXT[focusNote.stand].toLowerCase()}</span></span>
    <span class="fn-icon"><${Icon} name=${fIcon[focusNote.stand]} size=${26} /></span>
  </button>` : goal === 'scorer' ? html`<div class="island goalask" role="status">
    <span class="i-txt"><span class="i-k">Goal voor ${short(team.name, 18)}</span><span class="i-t1">Wie scoorde?</span><span class="i-t2">Tik de speler in het veld <span class="ga-arrow" aria-hidden="true">↓</span></span></span>
    <button type="button" class="ga-btn jelly" onClick=${() => scoreFor(null)}>Weet ik <br />niet</button>
    <button type="button" class="ga-x jelly" aria-label="Annuleren" onClick=${() => setGoal(null)}><${Icon} name="x" size=${18} /></button>
  </div>` : html`<div class=${'islandwrap ' + isl.st + (spinning ? ' spinning' : '') + (peek && canPeek ? ' drawer-open' : '')}>
    <button type="button" class=${'island jelly ' + isl.st} onClick=${openNext} disabled=${isl.st === 'calm'} style=${isl.breathe ? `--breathe:${isl.breathe.toFixed(2)}s` : ''}
      aria-label=${next && !pending && !timeUp ? 'Open de planner' : undefined}>
      <span class="i-txt"><span class="i-k">${isl.k}</span><span class="i-t1">${isl.t1}</span>${isl.t2 && html`<span class="i-t2">${isl.t2}</span>`}</span>
      ${isl.ring && html`<span class="i-ringspace" aria-hidden="true"></span>`}
    </button>
    ${isl.ring && html`<button type="button" class=${'i-ring' + (isl.swap ? ' swapbtn' : '') + (isl.swap && countdown <= 60 ? ' soon' : '') + (isl.swap && countdown <= 0 ? ' due' : '')}
      style=${isl.breathe ? `--breathe:${isl.breathe.toFixed(2)}s` : ''}
      onPointerDown=${isl.swap ? ringDown : undefined} onPointerUp=${isl.swap ? () => ringStop(false) : undefined} onPointerCancel=${isl.swap ? () => ringStop(true) : undefined} onPointerMove=${isl.swap ? ringMove : undefined}
      onContextMenu=${(e) => e.preventDefault()}
      onClick=${isl.swap ? (e) => { if (e.detail === 0) swapFromRing(); } : openNext}
      aria-label=${isl.swap ? (moNow ? 'Schuif naar links: plekwissel zoals gepland' : 'Schuif naar links om nu te wisselen: ' + group.map((s) => nick(s.in) + ' erin voor ' + nick(s.out)).join(', ')) : isl.k}>
      <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="track" cx="40" cy="40" r="33" /><circle class="arc" cx="40" cy="40" r="33" stroke-dasharray=${C} stroke-dashoffset=${isl.full || countdown <= 0 ? 0 : (C * (isl.frac || 0)).toFixed(1)} />${isl.swap && html`<circle class="holdarc" cx="40" cy="40" r="33" stroke-dasharray=${C} />`}</svg>
      ${isl.swap
        ? html`<span class="i-lbl swaplbl"><span class="i-arrows" key=${'sp' + spinKey}><${Icon} name="swaparrows" size=${countdown <= 0 ? 30 : 22} /></span><span class="i-time">${isl.ring}</span></span>`
        : html`<span class="i-lbl">${isl.ring}</span>`}
    </button>`}
    ${isl.late && html`<span class="i-late">${isl.late}</span>`}
    ${drawer}
    ${isl.swap && !spinning && !peek && (holdHint || countdown <= 60) && html`<span class=${'i-holdtip' + (holdHint ? ' nudge' : '')} key=${'ht' + holdHint} aria-hidden="true">${holdHint ? '← Schuif de ring naar links om te wisselen' : '← schuif'}</span>`}
  </div>`;

  // zwevende wisselspelers achter de plekken die gaan veranderen
  const ghosts = {};
  if (floating) {
    const hot = countdown <= 60;
    for (const s of group) {
      if (s.shift && s.shift.id in d.state.pos) {
        const from = d.state.pos[s.shift.id], to = s.shift.to;
        ghosts[s.out] = { name: nick(s.shift.id), kind: 'shift', dir: LORD[to] < LORD[from] ? '↑' : LORD[to] > LORD[from] ? '↓' : '↔', hot };
        ghosts[s.shift.id] = { name: nick(s.in), kind: 'in', hot };
      } else ghosts[s.out] = { name: nick(s.in), kind: 'in', hot };
    }
  }
  // wie net naar de bank ging, valt erin
  const benchMem = useRef({ ids: d.state.bench, at: {} });
  for (const id of d.state.bench) if (benchMem.current.ids.indexOf(id) === -1) benchMem.current.at[id] = Date.now();
  benchMem.current.ids = d.state.bench;
  const dropped = (id) => Date.now() - (benchMem.current.at[id] || 0) < 1700;
  const everDropped = (id) => !!benchMem.current.at[id];

  // ---------- scorebord ----------
  const nextLabel = M.periodLabel(team, match.clock.period);
  const startable = !running && !pending && el < 1 && match.clock.period > 0;
  const bState = running ? (timeUp ? 'Tijd!' : nextLabel) : pending ? 'Rust' : startable ? 'Klaar voor de ' + nextLabel : 'Pauze · ' + nextLabel;
  const bRight = pending ? 'tik: start ' + nextLabel : timeUp ? 'tik om af te sluiten' : startable ? 'tik: start ' + nextLabel : el <= L ? 'nog ' + M.fmt(L - el) : '+' + M.fmt(el - L);
  const scoreCls = d.score.us > d.score.them ? 'ahead' : d.score.us < d.score.them ? 'behind' : 'level';
  const board = html`<section class=${'board' + (running ? '' : ' paused') + (timeUp ? ' over' : '') + (goal === 'who' ? ' goalwho' : '') + (cele ? ' cele ' + (cele.us ? 'us' : 'them') : '')} key="board">
    ${cele && html`<span class="b-shine" key=${'sh' + cele.key} aria-hidden="true"></span>`}
    ${goal === 'who' ? html`<div class="b-goal" role="group" aria-label="Doelpunt voor wie?">
      <button type="button" class="bg-side jelly" onClick=${() => setGoal('scorer')}><${TeamBadge} team=${team} size=${34} /><span class="bg-n">${short(team.name)}</span><span class="bg-plus">+1</span></button>
      <button type="button" class="bg-side them jelly" onClick=${oppScores}><${OppBadge} name=${match.opponent} size=${36} /><span class="bg-n">${short(match.opponent || 'Tegenstander')}</span><span class="bg-plus">+1</span></button>
    </div>` : html`<div class="b-top">
      <button type="button" class="b-clock jelly" onClick=${toggleClock} aria-label=${running ? 'Klok loopt, tik om te pauzeren' : 'Klok staat stil, tik om te starten'}>
        <${Roll} cls="b-digits" text=${M.fmt(Math.min(el, L))} />
        <span class="b-state"><span class="b-dot"></span>${bState}</span>
      </button>
      <span class="b-div" aria-hidden="true"></span>
      <button type="button" class=${'b-score jelly ' + scoreCls} onClick=${() => { setCele(null); setGoal(goal ? null : 'who'); }} aria-label=${`Stand ${d.score.us} tegen ${d.score.them}, tik bij een doelpunt`}>
        <span class=${'b-sc' + (cele ? ' pop' : '')}><${Roll} cls="b-digits" text=${String(d.score.us)} /><span class="b-colon"><i></i><i></i></span><${Roll} cls="b-digits" text=${String(d.score.them)} /></span>
        <span class="b-badges"><${TeamBadge} team=${team} size=${20} /><span class="b-tap">${goal ? 'wie scoorde?' : 'tik bij goal'}</span><${OppBadge} name=${match.opponent} size=${22} /></span>
      </button>
    </div>`}
    <button type="button" class="b-bottom" onClick=${goal === 'who' ? () => setGoal(null) : toggleClock} tabindex="-1" aria-hidden=${goal === 'who' ? 'false' : 'true'}>
      <span class="b-periods" style=${`grid-template-columns:repeat(${team.periods},1fr)`}>${Array.from({ length: team.periods }, (_, p) => (p < match.clock.period ? html`<i class="done"><b></b></i>`
        : p === match.clock.period ? html`<i><b style=${`width:${Math.min(100, (el / L) * 100)}%`}></b></i>` : html`<i><b></b></i>`))}</span>
      ${goal === 'who' ? html`<span class="b-plabel"><span>Doelpunt voor wie?</span><span class="b-right b-cancel">✕ annuleren</span></span>`
        : html`<span class="b-plabel"><span>${pw} ${match.clock.period + 1} van ${team.periods}</span><span class="b-right">${bRight}</span></span>`}
    </button>
  </section>`;

  return html`<main class="matchscreen live">
    <${Affiche} match=${match} team=${team} onClick=${() => setSheet({ type: 'menu' })}>
      <button type="button" class="iconbtn" aria-label="Laatste actie ongedaan maken" disabled=${!M.lastUndoable(match)} onClick=${undoAction.run}><${Icon} name="undo" size=${20} /></button>
      <button type="button" class="iconbtn" aria-label="Menu" onClick=${() => setSheet({ type: 'menu' })}><${Icon} name="more" size=${22} /></button>
    </${Affiche}>
    ${board}
    ${restLu ? restPanel : island}
    <div class="grow-field" key="livefield" ref=${zone}>
      <div class=${'fieldbox' + (goal ? ' goalmode' : '') + (restLu ? ' restmode' : '')}>
        <${Field} slots=${restLu ? restLu.slots : d.state.slots} lines=${restLu ? restLu.lines : M.linesOf(match, team)} keeperId=${d.state.keeper} nick=${nick} height="auto" formable=${!goal}
          onTap=${tapField} onKeeper=${goal === 'scorer' ? (id) => scoreFor(id) : () => setSheet({ type: 'keeper' })}
          picking=${goal === 'scorer'} hot=${cele && cele.us ? cele.id : null} hotKey=${cele ? cele.key : 0}
          neon=${floating ? group.map((s) => s.out) : []} sub=${(id) => M.fmt(d.state.played[id])}
          ghosts=${ghosts} animate accent=${accent} badges=${d.goals} cheer=${cheer} />
        ${!goal && !pending && html`<${FocusRail} stand=${shownStand} auto=${team.rules.autoStand && match.standMode !== 'manual'} canAuto=${!!team.rules.autoStand}
          onSet=${(v) => mutate((m, t) => M.setStand(m, t, 'manual', v))} onAuto=${(on) => mutate((m, t) => M.setStand(m, t, on ? 'auto' : 'manual', stand))} />`}
        ${act && html`<div class=${'actpill' + (act.top ? ' top' : '') + (act.out || act.outs ? ' wide' : '') + (act.label ? ' labeled' : '')} key=${'a' + act.key} role="status">
          ${act.label && html`<span class="ap-who">${act.label}</span>`}
          ${(act.out || act.outs) && html`<span class="ap-who">${act.outs ? 'Eruit' : nick(act.out)}</span>
            <span class="ap-seg" role="group" aria-label="Daarna">${[['terug', 'Kan terug'], ['periode', 'Rust'], ['wedstrijd', 'Klaar']].map(([v, l]) => html`<button type="button" class=${act.status === v ? 'on' : ''} aria-pressed=${act.status === v} onClick=${() => setStatus(v)}>${l}</button>`)}</span>`}
          <button type="button" class="ap-undo" onClick=${undoAct} aria-label="Ongedaan maken"><${Icon} name="undo" size=${16} />${act.out || act.outs ? '' : html`<span>${act.label ? 'Ongedaan' : 'Ongedaan maken'}</span>`}</button>
        </div>`}
      </div>
      <div class="benchrow">
        <span class="label">Bank</span>
        <${BenchScroll} key=${restLu ? 'rest' : 'live'} focus=${next && !pending ? (group.find((s) => d.state.bench.indexOf(s.in) !== -1) || {}).in : null}>
          ${(restLu ? restLu.bench : d.state.bench).map((id) => {
            const dis = d.state.disabled[id];
            const isNext = floating && group.some((s) => s.in === id);
            const ac = accent(id);
            const pill = html`<button type="button" key=${id} data-pid=${id} class=${'benchpill' + (dis ? ' off' : '') + (everDropped(id) ? ' dropped' : '') + (dropped(id) ? ' drop' : '') + (ac ? ' acc' : '')} style=${ac ? '--acc:' + ac : ''} onClick=${() => tapBench(id)}>
              ${nick(id)}${d.goals[id] ? html`<span class="bgoal">${d.goals[id]}</span>` : ''}<span class="t">${dis && !restLu ? (dis === 'wedstrijd' ? 'klaar' : 'rust') : isNext ? 'klaarmaken' : M.mins(d.state.played[id]) + ' min'}</span>
            </button>`;
            return isNext ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
          })}
          ${!d.state.bench.length && html`<span class="small">Niemand</span>`}
        </${BenchScroll}>
        <button type="button" class="iconbtn" aria-label="Speler later gekomen" onClick=${() => setSheet({ type: 'join' })}><${Icon} name="plus" size=${18} /></button>
      </div>
    </div>

    ${sheet && sheet.type === 'swap' && html`<${SwapSheet} match=${match} team=${team} d=${d} init=${sheet} counts=${counts} onClose=${() => setSheet(null)} onDone=${showAct} />`}
    ${sheet && sheet.type === 'group' && html`<${GroupSwapSheet} match=${match} team=${team} d=${d} counts=${counts} onClose=${() => setSheet(null)} onDone=${showAct} />`}
    ${sheet && sheet.type === 'bench' && html`<${BenchSheet} match=${match} team=${team} d=${d} id=${sheet.id} onClose=${() => setSheet(null)} openSwap=${(s) => setSheet({ type: 'swap', ...s, planned: false })} />`}
    ${sheet && sheet.type === 'join' && html`<${JoinSheet} match=${match} team=${team} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'keeper' && html`<${KeeperSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'opp' && html`<${OpponentSheet} match=${match} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'score' && html`<${ScoreSheet} match=${match} team=${team} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'menu' && html`<${GameMenu} match=${match} team=${team} live onClose=${() => setSheet(null)} onSheet=${(t) => setSheet({ type: t })} />`}
    ${sheet && sheet.type === 'end' && html`<${Confirm} title=${'Einde ' + M.periodLabel(team, match.clock.period) + '?'}
      text=${match.clock.period + 1 >= team.periods ? 'Daarna zie je het overzicht van de wedstrijd.' : 'De klok stopt. Daarna zet je de opstelling voor de volgende ' + M.periodWord(team) + ' klaar.'}
      yes=${match.clock.period + 1 >= team.periods ? 'Wedstrijd afsluiten' : 'Einde ' + M.periodLabel(team, match.clock.period)}
      onYes=${() => {
        const fin = mutate((m, t) => { M.endPeriod(m, t); return m.finished; });
        if (fin) setTimeout(() => go('/afloop/' + match.id), 0);
      }}
      onClose=${() => setSheet((s) => (s && s.type === 'end' ? null : s))} />`}
    ${sheet && sheet.type === 'finish' && html`<${Confirm} title="Wedstrijd nu afsluiten?" text="Bijvoorbeeld als hij eerder stopt. De tijd die niet gespeeld is telt niet mee."
      yes="Afsluiten" onYes=${() => { mutate((m, t) => M.finishNow(m, t)); setTimeout(() => go('/afloop/' + match.id), 0); }} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'delete' && html`<${Confirm} title="Wedstrijd stoppen en weggooien?" text="Alles van deze wedstrijd verdwijnt (tijd, wissels, doelpunten)." yes="Weggooien" danger
      onYes=${() => { update((dd) => { dd.matches = dd.matches.filter((x) => x.id !== match.id); if (dd.currentMatchId === match.id) dd.currentMatchId = null; }); toast('Wedstrijd weggegooid'); }} onClose=${() => setSheet(null)} />`}
  </main>`;
}


// ---------- menu (⋯) ----------
function GameMenu({ match, team, live, onClose, onSheet }) {
  const now = useNow(500);
  const el = M.elapsedInPeriod(match, now);
  const adj = (delta) => mutate((m, t) => M.adjustClock(m, t, delta));
  const item = (title, sub, onClick, danger) => html`<button type="button" class="choice" style=${danger ? 'border-color:#F0C2B4' : ''} onClick=${onClick}>
    <span class="col" style="gap:1px"><span style=${'font-weight:800;font-size:16px' + (danger ? ';color:var(--danger)' : '')}>${title}</span>${sub && html`<span class="sub">${sub}</span>`}</span></button>`;
  return html`<${Sheet} onClose=${onClose} label="Menu">
    <span class="h2" style="font-size:22px">${live ? 'Wedstrijd' : 'Voorbereiden'}</span>
    ${live && html`<div class="card" style="box-shadow:none;border:1px solid var(--line);align-items:center;gap:10px">
      <span class="label">Tijd ${M.periodLabel(team, match.clock.period)}</span>
      <span class="num" style="font-size:40px;line-height:1">${M.fmt(el)}</span>
      <div class="timeadj">
        <button type="button" class="btn plain" onClick=${() => adj(-60)}>−1:00</button>
        <button type="button" class="btn plain" onClick=${() => adj(-10)}>−0:10</button>
        <button type="button" class="btn plain" onClick=${() => adj(10)}>+0:10</button>
        <button type="button" class="btn plain" onClick=${() => adj(60)}>+1:00</button>
      </div>
      <button type="button" class="link" onClick=${() => { mutate((m, t) => M.setClock(m, t, 0)); toast('Klok op 0:00'); }}>Klok op 0:00 zetten</button>
    </div>`}
    ${!live && !M.isOwn(match, team) && html`<div class="col"><span class="label">Voorrang deze wedstrijd</span>
      <${Seg} label="Voorrang" value=${match.priority} onChange=${(v) => update((d) => rebuildConcept(d, { priority: v }))} options=${[['eerlijk', 'Eerlijkheid'], ['bezetting', 'Beste bezetting']]} /></div>`}
    ${item(M.isOwn(match, team) ? 'Game plan' : 'Autopilot', M.isOwn(match, team) ? 'Je liniebord: wie speelt waar, per blok' : 'Alle wissels en het rooster per speler', () => go('/plan'))}
    ${live && item('Einde ' + M.periodLabel(team, match.clock.period), null, () => onSheet('end'))}
    ${live && item('Stand aanpassen', 'Doelpunten per speler en tegengoals', () => onSheet('score'))}
    ${live && item('Wedstrijdgegevens', 'Tegenstander, tijd, veld', () => onSheet('opp'))}
    ${!live && !M.isOwn(match, team) && item('Basisopstelling', (team.bases || []).length ? 'Begin met een bewaarde opstelling, of bewaar deze' : 'Bewaar deze opstelling om later met één tik te kiezen', () => onSheet('base'))}
    ${!live && !M.isOwn(match, team) && item('Opstelling opnieuw laten voorstellen', 'Je eigen sleepwerk vervalt', () => { update((d) => rebuildConcept(d, { resetLines: true })); onClose(); })}
    ${live && item('Wedstrijd nu afsluiten', 'Bewaren en naar het overzicht', () => onSheet('finish'))}
    ${live && item('Wedstrijd stoppen en weggooien', 'Niets bewaren', () => onSheet('delete'), true)}
    <div class="row">
      <a class="btn plain grow" href="#/seizoen">Seizoen</a>
      <a class="btn plain grow" href="#/team">Team</a>
    </div>
    <span class="appver-mini">SpaBo Coach · versie ${APP_VERSION}</span>
  </${Sheet}>`;
}

// ================= afgelopen =================
function DoneView({ match, team }) {
  const s = M.summary(match, team).score;
  return html`<main class="matchscreen with-tabs">
    <${Affiche} match=${match} team=${team} onClick=${() => go('/afloop/' + match.id)} />
    <div class="card" style="flex:1 1 auto;align-items:center;justify-content:center;gap:10px;text-align:center">
      <span class="label">Afgelopen</span>
      <span class="num" style="font-size:64px;line-height:1" data-hero=${'m-' + match.id}>${s.us}<span style="margin:0 6px;color:var(--line-2)">:</span>${s.them}</span>
      <a class="btn soft" href=${'#/afloop/' + match.id}>Overzicht van de wedstrijd</a>
    </div>
    <button type="button" class="btn primary block startbtn" onClick=${() => update((d) => { d.currentMatchId = null; })}>Nieuwe wedstrijd klaarzetten</button>
  </main>`;
}

// Hoe wissel je deze wedstrijd? Twee manieren naast elkaar, de actieve met een vinkje. Het standaardplan maakt
// de app: dat voelt ook zo (kleurverloop dat rondloopt). Het game plan bouw je zelf.
// ---------- klaarzetten: vakken om in te vullen (niet per se op volgorde) ----------
// Leeg = gestippeld vak met een uitnodiging; ingevuld = echte inhoud (wie er zijn, de basis). Een vak dat net
// klaar is, krijgt een vinkje met een kleine plop.
function Avatars({ team, ids, max = 5 }) {
  const byId = Object.fromEntries(team.players.map((p) => [p.id, p]));
  const show = ids.slice(0, max);
  return html`<span class="avs">${show.map((id, k) => {
    const p = byId[id] || {};
    const c = p.main && POS_COLORS[p.main] ? POS_COLORS[p.main] : 'var(--blue-2)';
    return html`<i key=${id} style=${`--c:${c};--k:${k}`}>${((p.nick || p.name || '?').trim()[0] || '?').toUpperCase()}</i>`;
  })}${ids.length > max && html`<i class="more" style=${'--k:' + max}>+${ids.length - max}</i>`}</span>`;
}
// Spelers aanmelden: één brede, rustige balk. Nog te doen = warm met een zachte glans; klaar = een groene
// ring die zich vult, een vinkje en in één regel wie er zijn en wie keept.
function SquadBar({ match, team, onOpen }) {
  const setup = match.setup || {};
  const active = team.players.filter((p) => p.active !== false);
  const field = match.present.filter((id) => id !== match.keeperId);
  const ok = !!setup.present && (!team.keeper || !!setup.keeper);
  const keeper = team.keeper && match.keeperId ? M.nickOf(team, match.keeperId) : null;
  const title = ok ? `${field.length} ${field.length === 1 ? 'speler' : 'spelers'}` : 'Wie zijn er?';
  const sub = ok ? (keeper ? html`<span class="kbadge">K</span>${keeper} keept` : team.keeper ? 'nog geen keeper' : `${match.present.length} van ${active.length} aangemeld`)
    : team.keeper ? 'En wie keept er?' : 'Tik om aan te melden';
  return html`<button type="button" class=${'sqbar ' + (ok ? 'ok' : 'todo')} onClick=${() => { haptic('select'); onOpen('players'); }}
    aria-label=${ok ? `Spelers: ${field.length}${keeper ? ', keeper ' + keeper : ''}. Tik om te wijzigen` : 'Spelers aanmelden'}>
    <span class="sq-ring" aria-hidden="true" style=${'--p:' + (ok ? 100 : 0)}>
      <svg viewBox="0 0 40 40"><circle class="tr" cx="20" cy="20" r="17" /><circle class="pr" cx="20" cy="20" r="17" pathLength="100" /></svg>
      <span class="sq-ico" key=${ok ? 'ok' : 'todo'}><${Icon} name=${ok ? 'check' : 'team'} size=${ok ? 17 : 18} /></span>
    </span>
    <span class="sq-t" key=${ok ? 't-ok' : 't-todo'}>
      <span class="sq-lab">Spelers${ok ? '' : html`<i class="sq-dot"></i>`}</span>
      <b class="num">${title}</b>
      <small>${sub}</small>
    </span>
    <span class="sq-go" aria-hidden="true"><${Icon} name="chev" size=${16} /></span>
  </button>`;
}

// ---------- Autopilot of Zelf plannen: één schakelaar, het een of het ander ----------
// Speeltijd in één oogopslag: per speler een staafje (lang = veel minuten), van meest naar minst, in de kleur van
// zijn vaste rol (zonder vaste rol: leisteen). Tijdens het doorrekenen dansen de staafjes even.
const NO_ROLE = '#9AA5BA';
function PlayBars({ team, secs, thinking }) {
  const byId = Object.fromEntries(team.players.map((p) => [p.id, p]));
  const ids = Object.keys(secs).sort((a, b) => secs[b] - secs[a]);
  const max = Math.max(1, ...ids.map((id) => secs[id]));
  return html`<span class=${'ptv' + (thinking ? ' wob' : '')} aria-hidden="true">${ids.map((id, k) => {
    const p = byId[id] || {};
    const c = p.main && p.main !== 'K' && POS_COLORS[p.main] ? POS_COLORS[p.main] : NO_ROLE;
    return html`<i key=${id} style=${`--h:${Math.max(0.18, secs[id] / max).toFixed(3)};--c:${c};--k:${k}`}></i>`;
  })}</span>`;
}

// Speeltijd naast de spelers: staafjes per speler en het bereik in minuten. Rekent Autopilot door, dan veert de knop
// open (±75% van de rij) en verschuiven drie pillen (aanval, midden, verdediging) tot ze op het aandeel van de
// kracht per linie in dit plan landen; daarna veert alles terug.
const LINE_PILLS = [['V', 'aanval'], ['M', 'midden'], ['A', 'verdediging']];
const PROF_SHORT = { gelijk: 'Even lang', balans: 'In balans', rustig: 'Rustig', sterk: 'Sterkste ploeg', eigen: 'Eigen regels' };
function strengthShares(match, team) {
  const cards = M.timeline(match, team).cards;
  const END = M.matchEnd(team);
  const kr = Object.fromEntries(team.players.map((p) => [p.id, (p.kracht == null ? 50 : p.kracht) + 12.5]));
  const sum = { V: 0, M: 0, A: 0 };
  cards.forEach((c, i) => { const t1 = i + 1 < cards.length ? cards[i + 1].t : END; for (const id in c.pos) if (sum[c.pos[id]] != null) sum[c.pos[id]] += (kr[id] || 50) * Math.max(0, t1 - c.t); });
  const tot = sum.V + sum.M + sum.A || 1;
  const v = Math.round((sum.V / tot) * 100), mm = Math.round((sum.M / tot) * 100);
  return { V: v, M: mm, A: 100 - v - mm };
}
function PlayBtn({ match, team, think, st, own, onOpen }) {
  const plan = match.plan;
  const open = !own && !!think;
  const secs = own ? (st ? Object.fromEntries(Object.keys(st.kids).map((id) => [id, st.kids[id].sec])) : null)
    : plan && plan.finalPlayed ? Object.fromEntries(match.present.filter((id) => id !== match.keeperId && id in plan.finalPlayed).map((id) => [id, plan.finalPlayed[id]])) : null;
  const vals = secs ? Object.values(secs) : [];
  const lo = vals.length ? M.mins(Math.min(...vals)) : null, hi = vals.length ? M.mins(Math.max(...vals)) : null;
  const range = lo == null ? '—' : lo === hi ? `${lo}′` : `${lo}–${hi}′`;
  const real = useMemo(() => (open ? strengthShares(match, team) : null), [open, plan]);
  const [shares, setShares] = useState(null);
  // tijdens het rekenen: de pillen verspringen met een veer; daarna landen ze op het echte aandeel
  useEffect(() => {
    if (!open) { setShares(null); return undefined; }
    if (think.phase !== 'run') { setShares(real); return undefined; }
    const rnd = () => { const a = 18 + Math.random() * 40, b = 12 + Math.random() * 30, c = 18 + Math.random() * 40, t = a + b + c; const v = Math.round((a / t) * 100), m = Math.round((b / t) * 100); return { V: v, M: m, A: 100 - v - m }; };
    setShares(rnd());
    const iv = setInterval(() => setShares(rnd()), 280);
    return () => clearInterval(iv);
  }, [open, think && think.phase, think && think.k]);
  const sh = shares || { V: 34, M: 33, A: 33 };
  // de instelling: het wisselprofiel (Autopilot) of de speelstijl (Zelf plannen); kort als de knop smal is
  const pk = profileOf(team.rules);
  const prof = own ? (M.planStyle(match, team) === 'sterk' ? ['Sterkste opstelling', 'Sterkst'] : ['Gebalanceerd', 'Gebalanceerd'])
    : [PROFILES[pk] ? PROFILES[pk].label : 'Eigen instellingen', PROF_SHORT[pk] || 'Eigen regels'];
  const byId = Object.fromEntries(team.players.map((p) => [p.id, p]));
  const ids = secs ? Object.keys(secs).sort((a, b) => secs[a] - secs[b]) : [];
  const max = Math.max(1, ...vals);
  return html`<button type="button" class=${'ptbtn' + (own ? ' own' : '') + (open ? ' open ' + think.phase : '')} onClick=${() => { haptic('select'); onOpen(); }}
    aria-label=${(secs ? `Speeltijd per speler: ${range.replace('′', '')} minuten` : 'Speeltijd per speler') + `, ${prof[0]}. Tik voor details`}>
    <span class="ptb-bg" aria-hidden="true">${ids.map((id, k) => {
      const p = byId[id] || {};
      const c = p.main && p.main !== 'K' && POS_COLORS[p.main] ? POS_COLORS[p.main] : NO_ROLE;
      return html`<i key=${id} style=${`--h:${Math.max(0.2, secs[id] / max).toFixed(3)};--c:${c};--k:${k}`}></i>`;
    })}</span>
    <span class="ptb-sum">
      <span class="ptb-prof"><i class="ptb-dot"></i><span class="pl-full">${prof[0]}</span><span class="pl-short">${prof[1]}</span></span>
      <b class="num">${range}</b>
      <small>speeltijd</small>
    </span>
    ${open && html`<span class="ptb-lines" aria-hidden="true">
      <span class="ptb-t">${think.phase === 'run' ? html`<span class="ai-grad">✦ ${prof[0]} · doorrekenen…</span>` : `Kracht per linie · ${prof[0]}`}</span>
      <span class="ptb-ps">${LINE_PILLS.map(([l, w]) => html`<span key=${l} class="ptb-c" style=${'flex-grow:' + Math.max(8, sh[l])}><small>${w}</small><span class=${'ptb-p l' + l}><b class="num">${sh[l]}%</b></span></span>`)}</span>
    </span>`}
  </button>`;
}

function ModeSwitch({ match, team, swaps, perMoment, st, onTour, onSheet, think = null, onReplay = null }) {
  const own = M.isOwn(match, team);
  const [pend, setPend] = useState(null);
  const [ask, setAsk] = useState(null);
  const z = pend ? pend === 'z' : own;
  const plan = match.plan;
  const gp = match.gameplan;
  const stash = !!(gp && gp.base) || !!(match.ownStash && ((match.ownStash.pins || []).length || match.ownStash.periodLineups));
  const bases = (team.bases || []).filter((b) => M.baseFits(team, b));
  const done = () => { setAsk(null); setPend(null); };
  const goZelf = () => {
    if (stash) { done(); switchPlanMode('eigen', true); toast('Zelf plannen staat aan · je game plan is terug.', { label: 'Ongedaan', run: () => switchPlanMode('app', true) }); return; }
    setAsk('start');
  };
  const toZelf = () => {
    if (own) return;
    haptic('select');
    setPend('z');
    if (!devicePrefs().seenZelf) { setAsk('compare'); return; }
    goZelf();
  };
  const toAuto = () => {
    haptic('select');
    if (onReplay) onReplay();
    if (!own) return;
    switchPlanMode('app', true);
    toast('Autopilot staat aan · je game plan blijft bewaard.', { label: 'Ongedaan', run: () => switchPlanMode('eigen', true) });
  };
  const seen = () => setDevicePref('seenZelf', true);
  const takeOver = () => {
    done();
    const res = mutate((m, t) => M.gpFromPlan(m, t));
    if (res) { haptic('success'); toast(res.fill ? `✦ Voorzet in ${res.n} blokken per ${M.periodWord(team)} staat klaar.` : `✦ Het plan van Autopilot staat klaar als game plan.`); go('/plan'); }
  };
  const empty = () => { done(); switchPlanMode('eigen', true); go('/plan'); };
  const withBase = (b) => {
    done();
    switchPlanMode('eigen', true);
    // basis als startblok; de rest krijgt een voorzet van de app die je daarna zelf aanpast
    mutateConcept((m, d) => { const t = d.teams.find((x) => x.id === m.teamId); M.applyBase(m, t, b); M.gpFill(m, t); m.setup = { ...(m.setup || {}), base: true }; });
    toast(`✦ ${b.name} staat als start; de rest is een voorzet`);
    go('/plan');
  };
  // het blokje kun je ook slepen: voorbij het midden loslaten = de andere kant
  const swRef = useRef(null);
  const live = useRef({});
  live.current = { z, toZelf, toAuto };
  useEffect(() => {
    const el = swRef.current;
    if (!el) return undefined;
    let st = null;
    let eat = false;
    const down = (e) => { if (e.button > 0) return; st = { x: e.clientX, from: live.current.z ? 1 : 0, w: Math.max(40, el.clientWidth / 2 - 4), moved: false }; };
    const move = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x;
      if (!st.moved) { if (Math.abs(dx) < 6) return; st.moved = true; el.classList.add('drag'); try { el.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ } }
      const p = Math.max(0, Math.min(1, st.from + dx / st.w));
      el.style.setProperty('--p', p);
      el.classList.toggle('past', p > 0.5);
    };
    const up = () => {
      if (!st) return;
      const was = st; st = null;
      if (!was.moved) return;
      const p = parseFloat(el.style.getPropertyValue('--p'));
      el.classList.remove('drag', 'past');
      el.style.removeProperty('--p');
      eat = true; setTimeout(() => { eat = false; }, 350);
      const to = p > 0.5 ? 1 : 0;
      if (to === was.from) { haptic('tap'); return; }
      if (to) live.current.toZelf(); else live.current.toAuto();
    };
    const cancel = () => { if (!st) return; st = null; el.classList.remove('drag', 'past'); el.style.removeProperty('--p'); };
    const click = (e) => { if (eat) { e.stopPropagation(); e.preventDefault(); eat = false; } };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('click', click, true);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); el.removeEventListener('click', click, true); };
  }, []);
  const range = plan && plan.fair ? (M.mins(plan.fair.minPlayed) === M.mins(plan.fair.maxPlayed) ? `${M.mins(plan.fair.minPlayed)}` : `${M.mins(plan.fair.minPlayed)}–${M.mins(plan.fair.maxPlayed)}`) : '';
  const full = st ? st.blocks.filter((b) => b.ok).length : 0;
  return html`<section class="modesw">
    <div class="msw-row">
      <div class=${'msw' + (z ? ' z' : '') + (!z && think ? ' ' + (think.phase === 'run' ? 'thinking' : 'done') : '')} role="radiogroup" aria-label="Hoe wissel je?" ref=${swRef} aria-busy=${!z && think && think.phase === 'run' ? 'true' : 'false'}>
        <span class="msw-tag" aria-hidden="true">✦ aanbevolen</span>
        <span class="msw-th" aria-hidden="true"><span class="ai-sparks"><i></i><i></i><i></i><i></i></span>${!z && think && html`<span class="msw-fill" key=${'f' + think.k}></span>`}</span>
        <button type="button" role="radio" aria-checked=${z ? 'false' : 'true'} class="msw-a" onClick=${toAuto}><${Icon} name="spark" size=${16} />Autopilot</button>
        <button type="button" role="radio" aria-checked=${z ? 'true' : 'false'} class="msw-b" onClick=${toZelf}><${Icon} name="edit" size=${15} />Zelf plannen</button>
      </div>
      <button type="button" class="msw-i" aria-label="Uitleg: Autopilot en Zelf plannen" onClick=${() => { haptic('select'); onTour(); }}><${Icon} name="info" size=${19} /></button>
    </div>
    ${own && html`<div class="msum" key="z">
      <button type="button" class="msum-t" onClick=${() => onSheet('speeltijd')}>${st ? html`<${Icon} name="chart" size=${14} />${full}/${st.blocks.length} blokken vol` : 'Je plan is nog leeg'}</button>
      <button type="button" class="msum-go" onClick=${() => go('/plan')}>${st ? 'Open game plan' : 'Maak je plan'}<${Icon} name="chev" size=${14} /></button>
    </div>`}
    ${ask === 'compare' && html`<${Sheet} onClose=${() => { seen(); done(); }} label="Zelf plannen of Autopilot">
      <span class="h2" style="font-size:22px">Zelf plannen?</span>
      <span class="sub">Zo verschillen de twee manieren. Je kunt altijd terug.</span>
      <div class="cmp">
        <div class="cmp-h"><span></span><b class="ai-grad">✦ Autopilot</b><b>Zelf plannen</b></div>
        ${[
          ['Wie plant', 'De app, uit je profiel en wie er is', 'Jij, blok voor blok; de app kan een voorzet doen'],
          ['Wisselen', 'Meestal 1 tegelijk, ongeveer elke 3 min', 'Vaste momenten, vaak de hele bank tegelijk'],
          ['Tijdens de wedstrijd', 'Rekent mee na een eigen wissel, blessure of goal', 'Volgt je bord precies; ingrijpen doe je live'],
          ['Werk vooraf', 'Geen', '2 tot 10 minuten'],
          ['Eerlijk', 'Altijd binnen je regels', 'Ligt bij jou; Controle helpt'],
        ].map(([a, b, c]) => html`<div class="cmp-r" key=${a}><span>${a}</span><span>${b}</span><span>${c}</span></div>`)}
      </div>
      <button type="button" class="btn primary block" onClick=${() => { seen(); goZelf(); }}>Ga verder met Zelf plannen</button>
      <button type="button" class="btn plain block" onClick=${() => { seen(); done(); }}>Toch Autopilot</button>
    </${Sheet}>`}
    ${ask === 'start' && html`<${Sheet} onClose=${done} label="Hoe begin je je plan">
      <span class="h2" style="font-size:22px">Hoe begin je?</span>
      <span class="sub">Daarna bepaal je zelf per blok wie waar speelt.</span>
      <button type="button" class="startopt ai" onClick=${takeOver}><span class="pc-ico ai"><${Icon} name="spark" size=${16} /></span><span class="col" style="gap:2px"><b>Neem Autopilot over</b><span class="small">Het plan van nu, in blokken. Daarna pas je aan.</span></span><${Icon} name="chev" size=${16} /></button>
      ${bases.slice(0, 3).map((b) => html`<button type="button" key=${b.id} class="startopt" onClick=${() => withBase(b)}><span class="pc-ico"><${Icon} name="team" size=${16} /></span><span class="col" style="gap:2px"><b>Met basis ${b.name}</b><span class="small">${M.formationText(b.lines)} als start, de app doet een voorzet voor de rest.</span></span><${Icon} name="chev" size=${16} /></button>`)}
      <button type="button" class="startopt" onClick=${empty}><span class="pc-ico"><${Icon} name="edit" size=${16} /></span><span class="col" style="gap:2px"><b>Begin leeg</b><span class="small">Jij zet de startopstelling en de blokken.</span></span><${Icon} name="chev" size=${16} /></button>
    </${Sheet}>`}
  </section>`;
}

// ---------- spelers en keeper in één stap ----------
// Wie is er en wie keept. Aanmelden is de hoofdzaak: grote tegels die je aan- en uittikt. De keeper is een
// rustige regel eronder (de app stelt voor wie het minst keepte); het K-badge vliegt naar wie je kiest.
function SquadSheet({ match, team, counts, onClose }) {
  const active = team.players.filter((p) => p.active !== false);
  const [present, setPresent] = useState(match.present.slice());
  const [keeper, setKeeper] = useState(match.keeperId);
  const [pickK, setPickK] = useState(false);
  const kOk = !team.keeper || (keeper && present.indexOf(keeper) !== -1);
  const grid = useRef(null);
  const fly = useRef(null);
  const done = () => {
    const ids = active.map((p) => p.id).filter((id) => present.indexOf(id) !== -1);
    const changed = ids.join(',') !== match.present.join(',') || keeper !== match.keeperId;
    update((d) => {
      if (changed) rebuildConcept(d, { present: ids, keeperId: kOk ? keeper : null });
      const m = d.matches.find((x) => x.id === d.currentMatchId);
      m.setup = { ...(m.setup || {}), present: true, keeper: !team.keeper || m.keeperId === keeper || !!m.keeperId };
    });
    onClose();
  };
  // K-badge: onthoud waar hij stond en laat hem na het tekenen vanaf daar naar de nieuwe keeper vliegen
  const badgeRect = () => { const el = grid.current && grid.current.querySelector('.sq-kb'); return el ? el.getBoundingClientRect() : null; };
  const chooseKeeper = (id) => {
    if (id === keeper) return;
    fly.current = badgeRect();
    haptic('select');
    setKeeper(id);
  };
  useLayoutEffect(() => {
    const from = fly.current;
    fly.current = null;
    const el = grid.current && grid.current.querySelector('.sq-kb');
    if (!from || !el || reduced() || typeof el.animate !== 'function') return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top;
    try {
      el.animate([
        { translate: `${dx}px ${dy}px`, scale: '1' },
        { translate: `${dx * 0.5}px ${dy * 0.5 - 26}px`, scale: '1.35', offset: 0.5 },
        { translate: '0 0', scale: '1' }
      ], { duration: 520, easing: 'cubic-bezier(.3,1.1,.4,1)' });
    } catch (e) { /* oud toestel */ }
  }, [keeper]);
  const toggle = (id) => {
    const on = present.indexOf(id) !== -1;
    haptic(on ? 'tap' : 'select');
    const next = on ? present.filter((x) => x !== id) : present.concat([id]);
    setPresent(next);
    // keeper afgemeld: de app stelt meteen een nieuwe voor
    if (team.keeper && on && id === keeper) { fly.current = badgeRect(); setKeeper(suggestKeeper(team, next, counts)); }
    if (team.keeper && !on && !keeper) setKeeper(suggestKeeper(team, next, counts));
  };
  const nick = (p) => p.nick || p.name;
  const byId = Object.fromEntries(team.players.map((p) => [p.id, p]));
  const sugg = team.keeper ? suggestKeeper(team, present, counts) : null;
  const kp = keeper && byId[keeper];
  const pool = active.filter((p) => present.indexOf(p.id) !== -1).sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0) || nick(a).localeCompare(nick(b)));
  const timesK = (id) => (counts[id] ? `${counts[id]}× gekeept` : 'nog niet gekeept');
  return html`<${Sheet} onClose=${done} label="Spelers en keeper">
    <div class="sq-head">
      <span class="h2" style="font-size:22px">Wie is er?</span>
      <span class="sq-count num" aria-live="polite"><b key=${present.length}>${present.length}</b> van ${active.length}</span>
    </div>
    <span class="sub" style="margin-top:-6px">Tik om aan of af te melden.</span>
    <div class="sq-grid" ref=${grid}>${active.map((p, k) => {
      const on = present.indexOf(p.id) !== -1;
      // kleur van de vaste rol; zonder vaste rol leisteen (niet het blauw van achter)
      const c = p.main && POS_COLORS[p.main] ? POS_COLORS[p.main] : NO_ROLE;
      return html`<button type="button" key=${p.id} class=${'sq-p' + (on ? ' on' : '') + (team.keeper && keeper === p.id && on ? ' keeps' : '')} style=${`--c:${c};--k:${k}`}
        aria-pressed=${on ? 'true' : 'false'} onClick=${() => toggle(p.id)}>
        <span class="sq-n">${nick(p)}</span>
        <span class="sq-tick" aria-hidden="true"><${Icon} name="check" size=${12} /></span>
        ${team.keeper && keeper === p.id && on && html`<span class="sq-kb kbadge" aria-label="keept">K</span>`}
      </button>`;
    })}</div>
    ${team.keeper && html`<div class=${'sq-keeper' + (pickK ? ' open' : '')}>
      <button type="button" class="sq-kline" aria-expanded=${pickK ? 'true' : 'false'} onClick=${() => { haptic('select'); setPickK(!pickK); }}>
        <span class="sq-kic"><${Icon} name="glove" size=${16} /></span>
        <span class="col grow" style="gap:0;min-width:0">
          <span class="sq-kt">Keeper${kp && kOk ? html` · <b>${nick(kp)}</b>` : ''}</span>
          <small>${kp && kOk ? (keeper === sugg ? 'Voorstel van de app · ' : '') + timesK(keeper) : 'Kies wie er keept'}</small>
        </span>
        <span class=${'sq-kgo' + (pickK ? ' up' : '')}>${pickK ? '' : 'Ander'}<${Icon} name="chev" size=${15} /></span>
      </button>
      <${Reveal} open=${pickK}><div class="sq-kpick">${pool.map((p) => html`<button type="button" key=${'k' + p.id} class=${'sq-kc' + (keeper === p.id ? ' on' : '')}
        aria-pressed=${keeper === p.id ? 'true' : 'false'} onClick=${() => chooseKeeper(p.id)}>
        <span class="sq-kn">${nick(p)}</span><small>${(counts[p.id] || 0) + '×'}</small>${p.id === sugg && html`<i class="sq-sugg" title="Voorstel van de app">✦</i>`}
      </button>`)}</div></${Reveal}>
    </div>`}
    <button type="button" class="btn primary block" onClick=${done}>Klaar</button>
  </${Sheet}>`;
}

// ---------- basisopstellingen: kiezen, bewaren, beheren ----------
function MiniField({ base }) {
  return html`<span class="mini-f" aria-hidden="true">${['V', 'M', 'A'].map((l) => html`<span class="mf-r" key=${l}>${Array.from({ length: base.lines[l] || 0 }, (_, i) => html`<i key=${i} class=${'l' + l}></i>`)}</span>`)}</span>`;
}
function BaseSheet({ match, team, onClose }) {
  const bases = team.bases || [];
  const [naming, setNaming] = useState(null);
  const [name, setName] = useState('');
  const [menu, setMenu] = useState(null);
  const own = M.isOwn(match, team);
  const nick = (id) => M.nickOf(team, id);
  const teamOf = (d) => d.teams.find((x) => x.id === match.teamId);
  const curOf = (d) => d.matches.find((x) => x.id === d.currentMatchId);
  const lineText = (b) => ['V', 'M', 'A'].map((l) => ({ l, ids: Object.keys(b.slots).filter((k) => k[0] === l && b.slots[k]).map((k) => b.slots[k]) }))
    .filter((x) => x.ids.length).map((x) => ({ V: 'Voor', M: 'Midden', A: 'Achter' })[x.l] + ': ' + x.ids.map(nick).join(', ')).join(' · ');
  const absentOf = (b) => Object.values(b.slots).filter((id) => id && match.present.indexOf(id) === -1);
  const pick = (b) => {
    let res = null;
    update((d) => {
      const t = teamOf(d);
      let m = curOf(d);
      if (t.keeper && b.keeperId && b.keeperId !== m.keeperId && m.present.indexOf(b.keeperId) !== -1) { rebuildConcept(d, { keeperId: b.keeperId }); m = curOf(d); }
      res = M.applyBase(m, t, b);
      m.setup = { ...(m.setup || {}), base: true };
    });
    haptic('success');
    const r = res || { missing: [], filled: [] };
    toast(r.missing.length ? `${r.missing.map(nick).join(', ')} ${r.missing.length > 1 ? 'zijn' : 'is'} er niet: ${r.filled.map(nick).join(', ') || 'de app'} neemt de plek${own ? '' : ' · plan opnieuw berekend'}` : `Basis ${b.name} staat klaar${own ? ' als startblok' : ' · plan opnieuw berekend'}`);
    onClose();
  };
  const save = () => {
    const nm = name.trim();
    update((d) => {
      const t = teamOf(d); const m = curOf(d);
      const b = M.baseFromMatch(m, t, nm);
      t.bases = (t.bases || []).concat([b]);
      m.baseId = b.id;
      m.setup = { ...(m.setup || {}), base: true };
    });
    haptic('success');
    toast(`Basis bewaard · volgende keer kies je hem met één tik`);
    setNaming(null); setName('');
  };
  const replace = (b) => {
    update((d) => { const t = teamOf(d); const m = curOf(d); const nb = M.baseFromMatch(m, t, b.name); t.bases = (t.bases || []).map((x) => (x.id === b.id ? { ...nb, id: b.id } : x)); m.baseId = b.id; });
    setMenu(null); toast(`${b.name} bijgewerkt met de opstelling op het veld`);
  };
  const rename = (b) => {
    const nm = name.trim(); if (!nm) return;
    update((d) => { const t = teamOf(d); t.bases = (t.bases || []).map((x) => (x.id === b.id ? { ...x, name: nm } : x)); });
    setNaming(null); setName(''); setMenu(null);
  };
  const remove = (b) => {
    const prev = bases.slice();
    update((d) => { const t = teamOf(d); t.bases = (t.bases || []).filter((x) => x.id !== b.id); const m = curOf(d); if (m.baseId === b.id) m.baseId = null; });
    setMenu(null);
    toast(`${b.name} verwijderd`, { label: 'Ongedaan', run: () => update((d) => { teamOf(d).bases = prev; }) });
  };
  const useField = () => { update((d) => { const m = curOf(d); m.setup = { ...(m.setup || {}), base: true }; }); onClose(); };
  return html`<${Sheet} onClose=${onClose} label="Basisopstelling">
    <span class="h2" style="font-size:22px">Basisopstelling</span>
    <span class="sub">${bases.length ? 'Kies waarmee je begint. Is iemand er niet, dan zet de app daar wie het best past.' : 'Een basis is een vaste startopstelling die je bewaart en per wedstrijd met één tik kiest.'}</span>
    ${!bases.length && html`<div class="base-empty">
      <span class="be-ico"><${Icon} name="team" size=${22} /></span>
      <b>Nog geen basisopstellingen</b>
      <span>Laten we er een maken: zet de spelers op het veld zoals je wilt beginnen en bewaar dat hieronder.</span>
    </div>`}
    ${bases.length > 0 && html`<div class="base-list">${bases.map((b) => {
      const fits = M.baseFits(team, b);
      const absent = absentOf(b);
      const on = match.baseId === b.id;
      return html`<div class=${'base-row' + (on ? ' on' : '') + (fits ? '' : ' off')} key=${b.id}>
        <button type="button" class="base-main" disabled=${!fits} onClick=${() => pick(b)}>
          <${MiniField} base=${b} />
          <span class="col grow" style="gap:1px;min-width:0">
            <span class="base-n"><b>${b.name}</b><span class="base-f">${M.formationText(b.lines)}</span>${on && html`<span class="base-on"><${Icon} name="check" size=${12} />gekozen</span>`}</span>
            <span class="base-l">${fits ? lineText(b) : `Past niet bij ${team.lines.A + team.lines.M + team.lines.V} in het veld`}</span>
            ${fits && absent.length > 0 && html`<span class="base-a">${absent.map(nick).join(', ')} ${absent.length > 1 ? 'zijn' : 'is'} er niet · de app vult aan</span>`}
          </span>
        </button>
        <button type="button" class="base-more" aria-label=${'Meer voor ' + b.name} onClick=${() => { setMenu(menu === b.id ? null : b.id); setNaming(null); }}><${Icon} name="more" size=${18} /></button>
        ${menu === b.id && html`<div class="base-menu">
          ${naming === b.id
            ? html`<input class="input" value=${name} placeholder=${b.name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') rename(b); }} /><button type="button" class="btn primary" onClick=${() => rename(b)}>Bewaar</button>`
            : html`<button type="button" class="chip" onClick=${() => { setNaming(b.id); setName(b.name); }}>Hernoem</button>
              <button type="button" class="chip" onClick=${() => replace(b)}>Vervang door het veld</button>
              <button type="button" class="chip warn" onClick=${() => remove(b)}>Verwijder</button>`}
        </div>`}
      </div>`;
    })}</div>`}
    ${naming === 'new'
      ? html`<div class="base-save"><input class="input" value=${name} placeholder=${'Bijv. Sterk begin'} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') save(); }} />
          <button type="button" class="btn primary" onClick=${save}>Bewaar</button></div>`
      : html`<button type="button" class=${'btn block ' + (bases.length ? 'plain' : 'primary')} onClick=${() => { setNaming('new'); setName(''); setMenu(null); }}><${Icon} name="plus" size=${18} />Bewaar het veld als basis</button>`}
    <button type="button" class="btn plain block" onClick=${useField}>Zo beginnen, zonder basis</button>
  </${Sheet}>`;
}
