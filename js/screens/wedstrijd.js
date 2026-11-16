// Eén Wedstrijd-scherm: voorbereiden → live → afgelopen. Past op één scherm, zonder scrollen.
import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch } from '../store.js';
import * as M from '../match.js';
import { PlanView } from '../planview.js';
import { keeperCounts, suggestKeeper, WHY_TEXT } from './home.js';
import { nextScheduled, todayISO } from './seizoen.js';
import { mutate, undoAction, SwapSheet, GroupSwapSheet, BenchSheet, GoalSheet, BreakSheet, JoinSheet, KeeperSheet } from './live.js';
import { Field, Neon, Sheet, Confirm, Seg, Switch, Icon, TeamBadge, OppBadge, OpponentInput, ShieldColors, useNow, useWakeLock, useDragSwap, justDragged, beep, flash, unlockAudio, toast, go, STANDS } from '../ui.js';

// ---------- concept-wedstrijd (nog niet begonnen) ----------
export function newConcept(d) {
  const t = activeTeam(d);
  const present = t.players.filter((p) => p.active !== false).map((p) => p.id);
  const keeperId = t.keeper ? suggestKeeper(t, present, keeperCounts(d, t)) : null;
  d.matches = d.matches.filter((x) => x.started || x.id !== d.currentMatchId);
  const e = nextScheduled(t, d.matches);
  const plan = scheduleSelection(t, e, present, keeperId);
  const m = M.createMatch(t, { present: plan.present, keeperId: plan.keeperId, priority: t.rules.priority });
  m.setup = { present: false, keeper: !t.keeper || !!(e && e.keeperId), opponent: false };
  if (e) { applySchedule(m, e); m.setup.opponent = true; }
  d.matches.push(m);
  d.currentMatchId = m.id;
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
  const n = M.createMatch(t, { present, keeperId, priority: changes.priority || m.priority, opponent: m.opponent, date: m.date });
  n.id = m.id;
  n.setup = m.setup || { present: false, keeper: false, opponent: false };
  for (const k of ['scheduleId', 'time', 'meet', 'field', 'home', 'season']) if (m[k] !== undefined) n[k] = m[k];
  d.matches[i] = n;
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

const mutateConcept = (fn) => update((d) => { const m = d.matches.find((x) => x.id === d.currentMatchId); if (m) fn(m, d); });
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

function Affiche({ match, team, onClick, children }) {
  return html`<header class="mhead">
    <button type="button" class="affiche" onClick=${onClick} aria-label="Wedstrijdgegevens">
      <${TeamBadge} team=${team} size=${32} />
      <span class="col grow" style="gap:0;min-width:0">
        <span class="aff-title">${match.opponent ? 'tegen ' + match.opponent : 'Tegenstander?'}</span>
        <span class="aff-sub">${dateLabel(match.date)}${match.time ? ' · ' + match.time : ''}${match.field ? ' · ' + match.field : ''}${match.home === false ? ' · uit' : ''}</span>
      </span>
      <${OppBadge} name=${match.opponent} size=${32} />
    </button>
    ${children}
  </header>`;
}

// ================= voorbereiden =================
function PrepView({ state, match, team }) {
  const [sheet, setSheet] = useState(null);
  const counts = useMemo(() => keeperCounts(state, team), [state.matches, team.id]);
  const setup = match.setup || {};
  const F = team.lines.A + team.lines.M + team.lines.V;
  const field = match.present.filter((id) => id !== match.keeperId);
  const tooFew = field.length < F || (team.keeper && !match.keeperId);
  const plan = match.plan;
  const swaps = plan ? new Set(plan.steps.filter((s) => s.type === 'swap').map((s) => s.t)).size : 0;
  const perMoment = Math.max(1, Math.min(5, team.rules.perMoment || 1));
  const every = swaps ? Math.round((M.matchEnd(team) / (swaps + team.periods)) / 30) / 2 : 0;
  const todo = [!setup.present && 'wie er is', team.keeper && !setup.keeper && 'de keeper', !setup.opponent && 'de tegenstander'].filter(Boolean);
  const start = () => {
    unlockAudio();
    mutateConcept((m) => M.startClock(m));
  };
  return html`<main class="matchscreen with-tabs">
    <${Affiche} match=${match} team=${team} onClick=${() => setSheet('opp')}>
      <button type="button" class="iconbtn" aria-label="Menu" onClick=${() => setSheet('menu')}><${Icon} name="more" size=${22} /></button>
    </${Affiche}>
    <div class="setchips">
      <button type="button" class=${'setchip' + (setup.present ? '' : ' todo')} onClick=${() => setSheet('players')}><${Icon} name="team" size=${16} />${match.present.length} spelers</button>
      ${team.keeper && html`<button type="button" class=${'setchip' + (setup.keeper ? '' : ' todo')} onClick=${() => setSheet('keeper')}><span class="kbadge">K</span>${match.keeperId ? M.nickOf(team, match.keeperId) : 'keeper?'}</button>`}
      <button type="button" class=${'setchip' + (setup.opponent ? '' : ' todo')} onClick=${() => setSheet('opp')}>${match.opponent ? 'tegen ' + match.opponent : 'tegenstander?'}</button>
    </div>
    ${tooFew
      ? html`<div class="card" style="flex:1 1 auto;justify-content:center;text-align:center"><span class="h2">Te weinig spelers</span><span class="sub">Je hebt ${F} veldspelers nodig${team.keeper ? ' plus een keeper' : ''}. Tik op "spelers".</span></div>`
      : html`
        <button type="button" class="planline" onClick=${() => go('/plan')}>
          <span>${swaps ? `${swaps} ${perMoment > 1 ? 'momenten (tot ' + perMoment + ' tegelijk)' : 'wissels'} · ~${String(every).replace('.', ',')} min · ${M.mins(plan.fair.minPlayed)}–${M.mins(plan.fair.maxPlayed)} min p.p. · ${plan.fair.minTurns === plan.fair.maxTurns ? plan.fair.minTurns + '×' : plan.fair.minTurns + '–' + plan.fair.maxTurns + '×'}` : 'Geen wissels nodig'}</span>
          ${!plan.ok && html`<span class="warnicon" title=${(plan.why || []).map((w) => WHY_TEXT[w]).join(', ')}>!</span>`}
          <${Icon} name="chev" size=${16} />
        </button>
        <div class="grow-field"><${PlanView} match=${match} team=${team} compact editable
          onSwap=${(a, b) => { mutateConcept((m, d) => M.swapInStartLineup(m, d.teams.find((t) => t.id === m.teamId), a, b)); toast(`${M.nickOf(team, a)} ↔ ${M.nickOf(team, b)} · plan opnieuw berekend`); }} /></div>`}
    <button type="button" class="btn primary block startbtn" disabled=${tooFew} onClick=${() => (todo.length ? setSheet('confirm') : start())}>
      <${Icon} name="play" size=${18} /> Start · tik bij de aftrap
    </button>

    ${sheet === 'players' && html`<${PlayersSheet} match=${match} team=${team} onClose=${() => setSheet(null)} />`}
    ${sheet === 'keeper' && html`<${KeeperPickSheet} match=${match} team=${team} counts=${counts} onClose=${() => setSheet(null)} />`}
    ${sheet === 'opp' && html`<${OpponentSheet} match=${match} upcoming=${upcomingFor(team, state.matches)} onClose=${() => setSheet(null)} />`}
    ${sheet === 'menu' && html`<${GameMenu} match=${match} team=${team} onClose=${() => setSheet(null)} onSheet=${setSheet} />`}
    ${sheet === 'confirm' && html`<${Confirm} title="Toch starten?" text=${'Nog niet bevestigd: ' + todo.join(', ') + '.'} yes="Start" onYes=${start} onClose=${() => setSheet(null)} />`}
  </main>`;
}

function PlayersSheet({ match, team, onClose }) {
  const active = team.players.filter((p) => p.active !== false);
  const [present, setPresent] = useState(match.present.slice());
  const done = () => {
    const changed = present.join(',') !== match.present.join(',');
    update((d) => {
      if (changed) rebuildConcept(d, { present: active.map((p) => p.id).filter((id) => present.indexOf(id) !== -1) });
      const m = d.matches.find((x) => x.id === d.currentMatchId);
      m.setup = { ...(m.setup || {}), present: true };
    });
    onClose();
  };
  return html`<${Sheet} onClose=${done} label="Wie is er">
    <div class="between"><span class="h2" style="font-size:22px">Wie is er?</span><span class="sub">${present.length} van ${active.length}</span></div>
    <div class="wrap">${active.map((p) => html`<button type="button" class="chip big" aria-pressed=${present.indexOf(p.id) !== -1 ? 'true' : 'false'}
      onClick=${() => setPresent(present.indexOf(p.id) !== -1 ? present.filter((x) => x !== p.id) : present.concat([p.id]))}>${p.nick || p.name}</button>`)}</div>
    <button type="button" class="btn primary block" onClick=${done}>Klaar</button>
  </${Sheet}>`;
}

function KeeperPickSheet({ match, team, counts, onClose }) {
  const pick = (id) => {
    update((d) => {
      if (id !== match.keeperId) rebuildConcept(d, { keeperId: id });
      const m = d.matches.find((x) => x.id === d.currentMatchId);
      m.setup = { ...(m.setup || {}), keeper: true };
    });
    onClose();
  };
  return html`<${Sheet} onClose=${() => pick(match.keeperId)} label="Keeper">
    <span class="h2" style="font-size:22px">Wie keept er?</span>
    <span class="sub">Voorstel: wie het minst gekeept heeft${team.players.some((p) => p.main === 'K' || (p.prefs || []).indexOf('K') !== -1) ? ' en graag keept' : ''}.</span>
    <div class="wrap">${team.players.filter((p) => match.present.indexOf(p.id) !== -1).map((p) => html`<button type="button" class="chip big warm" aria-pressed=${match.keeperId === p.id ? 'true' : 'false'} onClick=${() => pick(p.id)}>
      ${p.nick || p.name}<span class="small">${counts[p.id] ? counts[p.id] + '×' : 'nog niet'}</span></button>`)}</div>
  </${Sheet}>`;
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
          ${upcoming.map((e) => html`<button type="button" key=${e.id} class=${'prow2' + (match.scheduleId === e.id ? ' on' : '')} onClick=${() => choose(e)}>
            <${OppBadge} name=${e.opponent} size=${30} />
            <span class="col grow" style="gap:1px;min-width:0"><span class="pr-name">${e.opponent || 'Tegenstander'}</span><span class="pr-meta">${entryLine(e)}</span></span>
            ${match.scheduleId === e.id && html`<span class="pr-check" aria-hidden="true">✓</span>`}
          </button>`)}
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
  const countdown = next ? next.t - T : null;
  const pending = M.lineupPending(match, team);
  const timeUp = !match.finished && el >= L;
  const counts = M.swapCounts(match);
  const stand = M.currentStand(match, team, d.score);
  const running = match.clock.running;
  const [sheet, setSheet] = useState(null);
  const zone = useRef(null);
  useWakeLock(true);

  const alerted = useRef({});
  useEffect(() => {
    if (!running) return;
    if (next) {
      const key = next.t + ':' + next.out + ':' + next.in;
      if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
      if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
    }
    if (timeUp && !alerted.current['end' + match.clock.period]) { alerted.current['end' + match.clock.period] = 1; beep(2, 520); flash(); }
  }, [tick, running]);

  const toggleClock = () => {
    unlockAudio();
    if (running) { mutate((m) => M.pauseClock(m)); return; }
    if (pending) { setSheet({ type: 'break' }); return; }
    mutate((m) => M.startClock(m));
  };

  const onDrag = (a, b) => {
    const aF = a in d.state.pos, bF = b in d.state.pos;
    if (aF && bF) { mutate((m, t) => M.movePlayers(m, t, a, b)); toast(`${nick(a)} ↔ ${nick(b)} van plek gewisseld`, undoAction); return; }
    if (aF === bF) return;
    const out = aF ? a : b, inn = aF ? b : a;
    if (d.state.disabled[inn]) { toast(nick(inn) + ' is nu niet inzetbaar'); return; }
    mutate((m, t) => M.doSwap(m, t, out, inn, null));
    toast(`${nick(inn)} erin voor ${nick(out)}`, undoAction);
  };
  useDragSwap(zone, !pending, onDrag);

  const tapField = (id) => {
    if (justDragged(zone)) return;
    if (pending) { setSheet({ type: 'break' }); return; }
    if (group.length > 1 && group.some((s) => s.out === id)) { setSheet({ type: 'group' }); return; }
    const inn = next && next.out === id ? next.in : M.suggestIn(match, team, id);
    if (!inn) { toast('Er zit niemand inzetbaar op de bank'); return; }
    setSheet({ type: 'swap', out: id, in: inn, planned: !!(next && next.out === id && next.in === inn) });
  };
  const tapBench = (id) => { if (!justDragged(zone)) setSheet({ type: 'bench', id }); };
  const openNext = () => {
    if (pending) setSheet({ type: 'break' });
    else if (timeUp) setSheet({ type: 'end' });
    else if (group.length > 1) setSheet({ type: 'group' });
    else if (next) setSheet({ type: 'swap', out: next.out, in: next.in, planned: true });
  };

  // smalle balk met het volgende moment
  let bar;
  if (pending) bar = { hot: true, title: `Rust · opstelling ${M.periodLabel(team, match.clock.period)}`, sub: 'tik om klaar te zetten' };
  else if (timeUp) bar = { hot: true, title: `Tijd! Einde ${M.periodLabel(team, match.clock.period)}`, sub: 'tik om af te sluiten' };
  else if (next) bar = { hot: countdown <= 60, title: countdown <= 0 ? 'Nu wisselen' : 'Wissel over ' + M.fmt(countdown),
    sub: (group.length > 1 ? `${group.length} tegelijk: ${group.map((s) => nick(s.in)).join(', ')} erin` : `${nick(next.in)} erin voor ${nick(next.out)}`) + (next.fixed ? ' · aangepast' : ''),
    n: countdown < -0.5 ? null : `${counts.done + 1}/${counts.total}`,
    blink: countdown <= 60 ? (countdown <= 0 ? 0.32 : 0.32 + (countdown / 60) * 1.0) : 0,
    late: countdown < -0.5 ? '−' + M.fmt(-countdown) : null,
    progress: Math.max(0, Math.min(1, (T - (match.plan ? match.plan.at : 0)) / Math.max(1, next.t - (match.plan ? match.plan.at : 0)))) };
  else bar = { hot: false, title: `Geen wissels meer deze ${M.periodWord(team)}`, calm: true };
  if (timeUp && bar.hot && !pending) { bar.progress = 1; bar.blink = 0.32; }
  const barInner = html`<span class=${'nextbar' + (bar.calm ? ' calm' : ' blue')}>
    <span class="nb-top">
      <span class="col grow" style="gap:0;min-width:0"><span class="nb-title">${bar.title}</span>${bar.sub && html`<span class="nb-sub">${bar.sub}</span>`}</span>
      ${bar.n && html`<span class="nb-n">${bar.n}</span>`}
      ${bar.late && html`<span class="nb-late" aria-label=${'Te laat: ' + bar.late}>${bar.late}</span>`}
    </span>
    ${bar.progress != null && html`<span class=${'nb-pill' + (bar.blink ? ' blink' : '')} style=${bar.blink ? `--blink:${bar.blink.toFixed(2)}s` : ''}><span style=${`width:${Math.max(6, bar.progress * 100)}%`}></span></span>`}
  </span>`;

  return html`<main class="matchscreen live">
    <${Affiche} match=${match} team=${team} onClick=${() => setSheet({ type: 'menu' })}>
      <button type="button" class="iconbtn" aria-label="Laatste actie ongedaan maken" disabled=${!M.lastUndoable(match)} onClick=${undoAction.run}><${Icon} name="undo" size=${20} /></button>
      <button type="button" class="iconbtn" aria-label="Menu" onClick=${() => setSheet({ type: 'menu' })}><${Icon} name="more" size=${22} /></button>
    </${Affiche}>
    <div class="clockrow">
      <button type="button" class=${'clockbtn ' + (running ? 'running' : 'stopped')} onClick=${toggleClock} aria-label=${running ? 'Klok loopt, tik om te pauzeren' : 'Klok staat stil, tik om te starten'}>
        <span class="clockmain">
          <span class="num clock" style=${el > L ? 'color:#B26A00' : ''}>${M.fmt(el)}</span>
          <span class="clockstate">${running ? html`<span class="rundot"></span>${M.periodLabel(team, match.clock.period)}` : html`<span class="stopdot"></span>stil · ${M.periodLabel(team, match.clock.period)}`}</span>
        </span>
        <span class="periods" aria-hidden="true">
          <span class="ptrack">${Array.from({ length: team.periods }, (_, p) => (p < match.clock.period ? html`<i class="done"></i>`
            : p === match.clock.period ? html`<i><b style=${`width:${Math.min(100, (el / L) * 100)}%`}></b></i>` : html`<i></i>`))}</span>
          <span class=${'premain' + (el > L ? ' over' : '')}>${el <= L ? 'nog ' + M.fmt(L - el) : '+' + M.fmt(el - L)}</span>
        </span>
      </button>
      <button type="button" class=${'scorebtn ' + (d.score.us > d.score.them ? 'ahead' : d.score.us < d.score.them ? 'behind' : 'level')} onClick=${() => setSheet({ type: 'goal' })} aria-label=${`Stand ${d.score.us} tegen ${d.score.them}, tik bij een doelpunt`}>
        <span class="num score bump" key=${d.score.us + '-' + d.score.them}>${d.score.us}<span class="sep2">:</span>${d.score.them}</span>
      </button>
    </div>
    <button type="button" class="nextbtn" onClick=${openNext} disabled=${bar.calm}>${barInner}</button>
    <div class="grow-field" ref=${zone}>
      <div class="fieldbox">
        <${Field} slots=${d.state.slots} lines=${team.lines} keeperId=${d.state.keeper} nick=${nick} height="auto"
          onTap=${tapField} onKeeper=${!pending ? () => setSheet({ type: 'keeper' }) : null}
          neon=${next && !pending ? group.map((s) => s.out) : []} sub=${(id) => M.fmt(d.state.played[id])} />
        <button type="button" class="fieldtag right" onClick=${() => setSheet({ type: 'stand' })}>${STANDS.find(([v]) => v === stand)[1]}${match.standMode !== 'manual' && team.rules.autoStand ? ' · auto' : ''}</button>
      </div>
      <div class="benchrow">
        <span class="label">Bank</span>
        <div class="scroll">
          ${d.state.bench.map((id) => {
            const dis = d.state.disabled[id];
            const isNext = next && !pending && group.some((s) => s.in === id);
            const pill = html`<button type="button" key=${id} data-pid=${id} class=${'benchpill' + (dis ? ' off' : '')} onClick=${() => tapBench(id)}>
              ${nick(id)}<span class="t">${dis ? (dis === 'wedstrijd' ? 'klaar' : 'rust') : isNext ? 'klaarmaken' : M.mins(d.state.played[id]) + ' min'}</span>
            </button>`;
            return isNext ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
          })}
          ${!d.state.bench.length && html`<span class="small">Niemand</span>`}
        </div>
        <button type="button" class="iconbtn" aria-label="Speler later gekomen" onClick=${() => setSheet({ type: 'join' })}><${Icon} name="plus" size=${18} /></button>
      </div>
    </div>

    ${sheet && sheet.type === 'swap' && html`<${SwapSheet} match=${match} team=${team} d=${d} init=${sheet} counts=${counts} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'group' && html`<${GroupSwapSheet} match=${match} team=${team} d=${d} counts=${counts} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'bench' && html`<${BenchSheet} match=${match} team=${team} d=${d} id=${sheet.id} onClose=${() => setSheet(null)} openSwap=${(s) => setSheet({ type: 'swap', ...s, planned: false })} />`}
    ${sheet && sheet.type === 'goal' && html`<${GoalSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'break' && html`<${BreakSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'join' && html`<${JoinSheet} match=${match} team=${team} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'keeper' && html`<${KeeperSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'opp' && html`<${OpponentSheet} match=${match} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'stand' && html`<${StandSheet} match=${match} team=${team} stand=${stand} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'menu' && html`<${GameMenu} match=${match} team=${team} live onClose=${() => setSheet(null)} onSheet=${(t) => setSheet({ type: t })} />`}
    ${sheet && sheet.type === 'end' && html`<${Confirm} title=${'Einde ' + M.periodLabel(team, match.clock.period) + '?'}
      text=${match.clock.period + 1 >= team.periods ? 'Daarna zie je het overzicht van de wedstrijd.' : 'De klok stopt. Daarna zet je de opstelling voor de volgende ' + M.periodWord(team) + ' klaar.'}
      yes=${match.clock.period + 1 >= team.periods ? 'Wedstrijd afsluiten' : 'Einde ' + M.periodLabel(team, match.clock.period)}
      onYes=${() => {
        const fin = mutate((m, t) => { M.endPeriod(m, t); return m.finished; });
        if (fin) setTimeout(() => go('/afloop/' + match.id), 0);
        else if (team.rules.newLineupAtBreak) setTimeout(() => setSheet({ type: 'break' }), 0);
      }}
      onClose=${() => setSheet((s) => (s && s.type === 'end' ? null : s))} />`}
    ${sheet && sheet.type === 'finish' && html`<${Confirm} title="Wedstrijd nu afsluiten?" text="Bijvoorbeeld als hij eerder stopt. De tijd die niet gespeeld is telt niet mee."
      yes="Afsluiten" onYes=${() => { mutate((m, t) => M.finishNow(m, t)); setTimeout(() => go('/afloop/' + match.id), 0); }} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'delete' && html`<${Confirm} title="Wedstrijd stoppen en weggooien?" text="Alles van deze wedstrijd verdwijnt (tijd, wissels, doelpunten)." yes="Weggooien" danger
      onYes=${() => { update((dd) => { dd.matches = dd.matches.filter((x) => x.id !== match.id); if (dd.currentMatchId === match.id) dd.currentMatchId = null; }); toast('Wedstrijd weggegooid'); }} onClose=${() => setSheet(null)} />`}
  </main>`;
}

function StandSheet({ match, team, stand, onClose }) {
  return html`<${Sheet} onClose=${onClose} label="Opstellingsstand">
    <span class="h2" style="font-size:22px">Opstelling</span>
    <span class="sub">Geldt vanaf de volgende wissel.</span>
    ${team.rules.autoStand && html`<div class="setting"><div class="col" style="gap:1px"><span class="t">Automatisch op de stand</span><span class="small">Achterstand: ${team.rules.standAchter} · gelijk: ${team.rules.standGelijk} · voorsprong: ${team.rules.standVoor}</span></div>
      <${Switch} label="Automatisch" on=${match.standMode !== 'manual'} onChange=${(v) => mutate((m, t) => M.setStand(m, t, v ? 'auto' : 'manual', stand))} /></div>`}
    <${Seg} label="Opstellingsstand" value=${stand} options=${STANDS} onChange=${(v) => mutate((m, t) => M.setStand(m, t, 'manual', v))} />
    <button type="button" class="btn plain block" onClick=${onClose}>Klaar</button>
  </${Sheet}>`;
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
    ${!live && html`<div class="col"><span class="label">Voorrang deze wedstrijd</span>
      <${Seg} label="Voorrang" value=${match.priority} onChange=${(v) => update((d) => rebuildConcept(d, { priority: v }))} options=${[['eerlijk', 'Eerlijkheid'], ['bezetting', 'Beste bezetting']]} /></div>`}
    ${item('Wedstrijdplan', 'Alle wissels en het rooster per kind', () => go('/plan'))}
    ${live && item('Einde ' + M.periodLabel(team, match.clock.period), null, () => onSheet('end'))}
    ${live && item('Wedstrijdgegevens', 'Tegenstander, tijd, veld', () => onSheet('opp'))}
    ${!live && item('Opstelling opnieuw laten voorstellen', 'Je eigen sleepwerk vervalt', () => { update((d) => rebuildConcept(d)); onClose(); })}
    ${live && item('Wedstrijd nu afsluiten', 'Bewaren en naar het overzicht', () => onSheet('finish'))}
    ${live && item('Wedstrijd stoppen en weggooien', 'Niets bewaren', () => onSheet('delete'), true)}
    <div class="row">
      <a class="btn plain grow" href="#/seizoen">Seizoen</a>
      <a class="btn plain grow" href="#/team">Team</a>
    </div>
  </${Sheet}>`;
}

// ================= afgelopen =================
function DoneView({ match, team }) {
  const s = M.summary(match, team).score;
  return html`<main class="matchscreen with-tabs">
    <${Affiche} match=${match} team=${team} onClick=${() => go('/afloop/' + match.id)} />
    <div class="card" style="flex:1 1 auto;align-items:center;justify-content:center;gap:10px;text-align:center">
      <span class="label">Afgelopen</span>
      <span class="num" style="font-size:64px;line-height:1">${s.us}<span style="margin:0 6px;color:var(--line-2)">:</span>${s.them}</span>
      <a class="btn soft" href=${'#/afloop/' + match.id}>Overzicht van de wedstrijd</a>
    </div>
    <button type="button" class="btn primary block startbtn" onClick=${() => update((d) => { d.currentMatchId = null; })}>Nieuwe wedstrijd klaarzetten</button>
  </main>`;
}
