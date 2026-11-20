// Eén Wedstrijd-scherm: voorbereiden → live → afgelopen. Past op één scherm, zonder scrollen.
import { html, useEffect, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch } from '../store.js';
import * as M from '../match.js';
import { PlanView } from '../planview.js';
import { keeperCounts, suggestKeeper, WHY_TEXT } from './home.js';
import { nextScheduled, todayISO } from './seizoen.js';
import { mutate, undoAction, SwapSheet, GroupSwapSheet, BenchSheet, GoalSheet, BreakSheet, JoinSheet, KeeperSheet } from './live.js';
import { Field, Neon, Roll, Sheet, Confirm, Seg, Stepper, Icon, accentFor, TeamBadge, OppBadge, OpponentInput, ShieldColors, useNow, useWakeLock, useDragSwap, justDragged, beep, flash, unlockAudio, toast, go } from '../ui.js';

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
const FOCUS_TXT = { aanvallen: 'Meer kracht voorin', balans: 'Kracht gelijk over de linies', verdedigen: 'Meer kracht achterin' };
function FocusRail({ stand, auto, canAuto, onSet, onAuto }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const track = useRef(null);
  const st = useRef(null);
  const idx = Math.max(0, FOCUS.findIndex(([v]) => v === stand));
  useEffect(() => { if (!open) return undefined; const t = setTimeout(() => setOpen(false), 8000); return () => clearTimeout(t); }, [open, stand, auto]);
  const fracAt = (y) => { const r = track.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (y - r.top) / r.height)); };
  const down = (e) => { e.stopPropagation(); st.current = { y: e.clientY, moved: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ } };
  const move = (e) => {
    const s = st.current; if (!s) return;
    if (!s.moved && Math.abs(e.clientY - s.y) < 6) return;
    s.moved = true; setDrag(fracAt(e.clientY));
  };
  const up = (e) => {
    const s = st.current; st.current = null; if (!s) return;
    if (!s.moved) { setOpen(!open); return; }
    const k = Math.round(fracAt(e.clientY) * 2);
    setDrag(null);
    if (FOCUS[k][0] !== stand || auto) onSet(FOCUS[k][0]);
  };
  const frac = drag != null ? drag : idx / 2;
  const [, label, icon] = FOCUS[idx];
  const hover = drag != null ? FOCUS[Math.round(drag * 2)] : null;
  return html`${open && html`<button type="button" class="f-scrim" aria-label="Sluiten" onClick=${() => setOpen(false)}></button>`}
  <div class=${'focus f-' + stand + (open ? ' open' : '') + (drag != null ? ' dragging' : '')}>
    <div class="f-track" ref=${track}>
      <span class="f-line"></span>
      ${FOCUS.map(([v, l], k) => html`<button type="button" class=${'f-stop' + (k === idx ? ' on' : '')} style=${`top:${k * 50}%`} tabindex=${open ? 0 : -1}
        onClick=${() => { setOpen(false); if (v !== stand || auto) setTimeout(() => onSet(v), 260); }} aria-label=${l}><i></i><span class="f-lbl"><b>${l}</b><small>${FOCUS_TXT[v]}</small></span></button>`)}
      <button type="button" class="f-thumb" style=${`top:${(frac * 100).toFixed(1)}%`} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${() => { st.current = null; setDrag(null); }}
        aria-label=${'Focus: ' + label + (auto ? ', automatisch op de stand' : '') + '. Tik om te kiezen of sleep omhoog of omlaag.'}>
        <${Icon} name=${icon} size=${18} />${auto && html`<b class="f-auto">A</b>`}
      </button>
      ${hover && html`<span class="f-bubble live" style=${`top:${(frac * 100).toFixed(1)}%`}><b>${hover[1]}</b><small>${FOCUS_TXT[hover[0]]}</small></span>`}
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
  const countdown = next ? next.t - T : null;
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
    if (next) {
      const key = next.t + ':' + next.out + ':' + next.in;
      if (countdown <= 60 && countdown > 1 && !alerted.current[key + 'a']) { alerted.current[key + 'a'] = 1; beep(1, 660); }
      if (countdown <= 0 && !alerted.current[key + 'b']) { alerted.current[key + 'b'] = 1; beep(3); flash(); }
    }
    if (timeUp && !alerted.current['end' + match.clock.period]) { alerted.current['end' + match.clock.period] = 1; beep(2, 520); flash(); }
  }, [tick, running]);

  const toggleClock = () => {
    unlockAudio();
    if (timeUp) { setSheet({ type: 'end' }); return; }
    if (running) { mutate((m) => M.pauseClock(m)); return; }
    if (pending) { setSheet({ type: 'break' }); return; }
    mutate((m) => M.startClock(m));
  };

  // slepen in het live-scherm = nu wisselen; de actiepil maakt het ongedaan
  const onDrag = (a, b) => {
    const aF = a in d.state.pos, bF = b in d.state.pos;
    if (aF && bF) { mutate((m, t) => M.movePlayers(m, t, a, b)); showAct({}); return; }
    if (aF === bF) return;
    const out = aF ? a : b, inn = aF ? b : a;
    let undos = 1;
    // weer inzetten van een speler met rust/klaar heft die status op
    mutate((m, t) => { if (d.state.disabled[inn]) { M.enablePlayer(m, t, inn); undos = 2; } M.doSwap(m, t, out, inn, null); });
    showAct({ out, undos });
  };
  useDragSwap(zone, !pending && !goal, onDrag);

  const tapField = (id) => {
    if (goal === 'scorer') { scoreFor(id); return; }
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

  // ---------- wissel-eiland ----------
  const short = (s, n = 12) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
  const LORD = { V: 0, M: 1, A: 2 };
  const accent = useMemo(() => accentFor(team), [team]);
  const pw = M.periodWord(team);
  let isl;
  if (pending) isl = { st: 'hot', k: 'Rust', t1: `Opstelling ${M.periodLabel(team, match.clock.period)}`, t2: 'Tik om de opstelling klaar te zetten', ring: 'rust', full: true };
  else if (timeUp) isl = { st: 'hot', k: 'Tijd!', t1: `Einde ${M.periodLabel(team, match.clock.period)}`, t2: 'Tik om af te sluiten', ring: 'eind', full: true };
  else if (next) {
    const n = counts.done + 1;
    const late = countdown < -0.5;
    const s0 = next;
    const lineName = (id) => ({ V: 'voor', M: 'midden', A: 'achter' }[d.state.pos[id]] || '');
    isl = {
      st: late ? 'hot late' : countdown <= 60 ? 'hot' : '',
      k: late ? `Te laat · wissel ${n}` : countdown <= 60 ? `Bijna · wissel ${n} van ${counts.total}` : `Volgende wissel · ${n} van ${counts.total}`,
      t1: group.length > 1 ? html`${group.length} spelers tegelijk` : html`<em>${nick(s0.in)}</em> erin voor ${nick(s0.out)}`,
      t2: (s0.fixed ? 'Aangepast · ' : '') + (group.length > 1 ? group.map((s) => nick(s.in)).join(', ') + ' erin'
        : s0.shift && s0.shift.id in d.state.pos ? `${nick(s0.shift.id)} schuift door naar ${lineName(s0.out)}` : `${nick(s0.in)} gaat naar ${lineName(s0.out)}`),
      ring: countdown <= 0 ? 'nu' : M.fmt(countdown),
      late: late ? '−' + M.fmt(-countdown) : null,
      frac: Math.max(0, Math.min(1, (T - (match.plan ? match.plan.at : 0)) / Math.max(1, next.t - (match.plan ? match.plan.at : 0)))),
      breathe: countdown <= 0 ? 0.55 : 0.55 + (Math.max(0, countdown) / 60) * 1.1,
    };
  } else isl = { st: 'calm', k: 'Geen wissels meer', t1: `deze ${pw}`, t2: '', ring: null };
  const C = 207.3;
  const noteOk = focusNote && !goal && !pending && !timeUp && !(next && countdown <= 60);
  const fIcon = { aanvallen: 'up2', balans: 'even', verdedigen: 'down2' };
  const island = noteOk ? html`<button type="button" class=${'island focusnote f-' + focusNote.stand} key=${'fn' + focusNote.key} onClick=${() => setFocusNote(null)}>
    <span class="i-txt"><span class="i-k">Focus${focusNote.auto ? ' · automatisch bij ' + (d.score.us > d.score.them ? 'voorsprong' : d.score.us < d.score.them ? 'achterstand' : 'gelijke stand') : ''}</span>
      <span class="i-t1">${{ aanvallen: 'Aanvallen', balans: 'Balans', verdedigen: 'Verdedigen' }[focusNote.stand]}</span>
      <span class="i-t2">${FOCUS_TXT[focusNote.stand]} vanaf de volgende wissel</span></span>
    <span class="fn-icon"><${Icon} name=${fIcon[focusNote.stand]} size=${26} /></span>
  </button>` : goal === 'scorer' ? html`<div class="island goalask" role="status">
    <span class="i-txt"><span class="i-k">Goal voor ${short(team.name, 18)}</span><span class="i-t1">Wie scoorde?</span><span class="i-t2">Tik de speler in het veld <span class="ga-arrow" aria-hidden="true">↓</span></span></span>
    <button type="button" class="ga-btn jelly" onClick=${() => scoreFor(null)}>Weet ik <br />niet</button>
    <button type="button" class="ga-x jelly" aria-label="Annuleren" onClick=${() => setGoal(null)}><${Icon} name="x" size=${18} /></button>
  </div>` : html`<button type="button" class=${'island jelly ' + isl.st} onClick=${openNext} disabled=${isl.st === 'calm'} style=${isl.breathe ? `--breathe:${isl.breathe.toFixed(2)}s` : ''}>
    <span class="i-txt"><span class="i-k">${isl.k}</span><span class="i-t1">${isl.t1}</span>${isl.t2 && html`<span class="i-t2">${isl.t2}</span>`}</span>
    ${isl.ring && html`<span class="i-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="track" cx="40" cy="40" r="33" /><circle class="arc" cx="40" cy="40" r="33" stroke-dasharray=${C} stroke-dashoffset=${isl.full || countdown <= 0 ? 0 : (C * (isl.frac || 0)).toFixed(1)} /></svg><span class="i-lbl">${isl.ring}</span></span>`}
    ${isl.late && html`<span class="i-late">${isl.late}</span>`}
  </button>`;

  // zwevende wisselspelers achter de plekken die gaan veranderen
  const ghosts = {};
  if (next && !pending && !goal && !timeUp) {
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
  const bRight = pending ? 'tik: opstelling ' + nextLabel : timeUp ? 'tik om af te sluiten' : startable ? 'tik: start ' + nextLabel : el <= L ? 'nog ' + M.fmt(L - el) : '+' + M.fmt(el - L);
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
    ${island}
    <div class="grow-field" ref=${zone}>
      <div class=${'fieldbox' + (goal ? ' goalmode' : '')}>
        <${Field} slots=${d.state.slots} lines=${team.lines} keeperId=${d.state.keeper} nick=${nick} height="auto"
          onTap=${tapField} onKeeper=${goal === 'scorer' ? (id) => scoreFor(id) : !pending ? () => setSheet({ type: 'keeper' }) : null}
          picking=${goal === 'scorer'} hot=${cele && cele.us ? cele.id : null} hotKey=${cele ? cele.key : 0}
          neon=${next && !pending && !goal && !timeUp ? group.map((s) => s.out) : []} sub=${(id) => M.fmt(d.state.played[id])}
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
        <div class="scroll">
          ${d.state.bench.map((id) => {
            const dis = d.state.disabled[id];
            const isNext = next && !pending && group.some((s) => s.in === id);
            const ac = accent(id);
            const pill = html`<button type="button" key=${id} data-pid=${id} class=${'benchpill' + (dis ? ' off' : '') + (everDropped(id) ? ' dropped' : '') + (dropped(id) ? ' drop' : '') + (ac ? ' acc' : '')} style=${ac ? '--acc:' + ac : ''} onClick=${() => tapBench(id)}>
              ${nick(id)}${d.goals[id] ? html`<span class="bgoal">${d.goals[id]}</span>` : ''}<span class="t">${dis ? (dis === 'wedstrijd' ? 'klaar' : 'rust') : isNext ? 'klaarmaken' : M.mins(d.state.played[id]) + ' min'}</span>
            </button>`;
            return isNext ? html`<${Neon} key=${'n' + id}>${pill}</${Neon}>` : pill;
          })}
          ${!d.state.bench.length && html`<span class="small">Niemand</span>`}
        </div>
        <button type="button" class="iconbtn" aria-label="Speler later gekomen" onClick=${() => setSheet({ type: 'join' })}><${Icon} name="plus" size=${18} /></button>
      </div>
    </div>

    ${sheet && sheet.type === 'swap' && html`<${SwapSheet} match=${match} team=${team} d=${d} init=${sheet} counts=${counts} onClose=${() => setSheet(null)} onDone=${showAct} />`}
    ${sheet && sheet.type === 'group' && html`<${GroupSwapSheet} match=${match} team=${team} d=${d} counts=${counts} onClose=${() => setSheet(null)} onDone=${showAct} />`}
    ${sheet && sheet.type === 'bench' && html`<${BenchSheet} match=${match} team=${team} d=${d} id=${sheet.id} onClose=${() => setSheet(null)} openSwap=${(s) => setSheet({ type: 'swap', ...s, planned: false })} />`}
    ${sheet && sheet.type === 'break' && html`<${BreakSheet} match=${match} team=${team} d=${d} onClose=${() => setSheet(null)} />`}
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
        else if (team.rules.newLineupAtBreak) setTimeout(() => setSheet({ type: 'break' }), 0);
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
    ${!live && html`<div class="col"><span class="label">Voorrang deze wedstrijd</span>
      <${Seg} label="Voorrang" value=${match.priority} onChange=${(v) => update((d) => rebuildConcept(d, { priority: v }))} options=${[['eerlijk', 'Eerlijkheid'], ['bezetting', 'Beste bezetting']]} /></div>`}
    ${item('Wedstrijdplan', 'Alle wissels en het rooster per kind', () => go('/plan'))}
    ${live && item('Einde ' + M.periodLabel(team, match.clock.period), null, () => onSheet('end'))}
    ${live && item('Stand aanpassen', 'Doelpunten per speler en tegengoals', () => onSheet('score'))}
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
