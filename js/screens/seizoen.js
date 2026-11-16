import { html, useMemo, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, uid } from '../store.js';
import * as M from '../match.js';
import { Icon, Sheet, Seg, Confirm, toast, POS_COLORS, OpponentInput, ShieldColors, OppBadge } from '../ui.js';

export const todayISO = () => new Date().toLocaleDateString('sv-SE');
// standaard verzamelen: een half uur voor aanvang
export function minus30(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return '';
  const [h, m] = t.split(':').map(Number);
  const x = (h * 60 + m - 30 + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
}
// seizoen loopt van augustus t/m juli, bijv. '2026-2027'
export function seasonOf(iso) {
  const [y, m] = (iso || todayISO()).split('-').map(Number);
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
const shiftSeason = (s, n) => { const y = Number(s.split('-')[0]) + n; return `${y}-${y + 1}`; };
const seasonLabel = (s) => 'Seizoen ' + s.replace('-', '/').replace(/\/20(\d\d)$/, '/$1');
const TASKS = [
  { key: 'fluiten', label: 'Fluiten', emoji: '🟨', max: 2 },
  { key: 'fruit', label: 'Fruit', emoji: '🍎', max: 1 },
  { key: 'bar', label: 'Bar / wedstrijdtafel', emoji: '☕', max: 2 }
];
// voornaam, of de volledige naam als een andere speler dezelfde voornaam heeft
const firstName = (team, id) => {
  const p = team.players.find((x) => x.id === id);
  if (!p) return '?';
  const full = p.name || p.nick;
  const first = full.split(' ')[0];
  return team.players.some((q) => q.id !== id && (q.name || q.nick).split(' ')[0] === first) ? full : first;
};
const longDate = (iso) => { const s = new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };

// Eerstvolgende wedstrijd uit het programma (vandaag of later, nog niet gespeeld)
export function nextScheduled(team, matches) {
  const today = todayISO();
  const played = new Set(matches.filter((m) => m.finished && m.scheduleId).map((m) => m.scheduleId));
  return (team.schedule || []).filter((e) => e.date >= today && !played.has(e.id))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;
}

export function buildMessage(team, e) {
  const names = (ids) => { const n = (ids || []).filter(Boolean).map((id) => firstName(team, id)); return n.length > 1 ? n.slice(0, -1).join(', ') + ' en ' + n[n.length - 1] : n[0] || ''; };
  const title = e.home === false ? `${e.opponent || 'Tegenstander'} – ${team.name}` : `${team.name} – ${e.opponent || 'Tegenstander'}`;
  // *tekst* is vet in WhatsApp
  const lines = [`*${title}*`, longDate(e.date)];
  if (e.time || e.meet) lines.push(`${e.time ? 'Aanvang ' + e.time : ''}${e.time && e.meet ? ' · ' : ''}${e.meet ? (e.time ? 'verzamelen ' : 'Verzamelen ') + e.meet : ''}`);
  lines.push(`📍 ${e.home === false ? 'Uit' : 'Thuis'}${e.field ? ' · ' + e.field : ''}`);
  if (e.keeperId) lines.push(`🧤 Keeper: ${firstName(team, e.keeperId)}`);
  if ((e.absent || []).length) lines.push(`🙋 Afgemeld: ${names(e.absent)}`);
  const tasks = TASKS.filter((t) => (e.tasks && e.tasks[t.key] || []).filter(Boolean).length);
  if (tasks.length) {
    lines.push('', '*Taken*');
    for (const t of tasks) lines.push(`${t.emoji} ${t.label}: ${names(e.tasks[t.key])}`);
  }
  lines.push('', `Succes ${team.name}! 💪🧡💙`);
  return lines.join('\n');
}

// Overzicht van alle taken per wedstrijd, voor WhatsApp (WhatsApp kent geen tabellen: per wedstrijd een blokje)
export function buildTaskOverview(team, entries, season) {
  const short = (iso) => { const s = new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const list = (ids) => (ids || []).filter(Boolean).map((id) => firstName(team, id)).join(', ');
  const out = [`*${team.name} · taken ${seasonLabel(season).replace('Seizoen ', 'seizoen ')}*`];
  for (const e of entries) {
    out.push('', `*${short(e.date)}${e.time ? ' · ' + e.time : ''} · ${e.opponent || 'Tegenstander'} (${e.home === false ? 'uit' : 'thuis'})*`);
    if (e.keeperId) out.push(`🧤 Keeper: ${firstName(team, e.keeperId)}`);
    for (const t of TASKS) { const l = list(e.tasks && e.tasks[t.key]); if (l) out.push(`${t.emoji} ${t.label}: ${l}`); }
  }
  out.push('', 'Kun je niet? Ruil zelf en laat het even weten 🙏');
  return out.join('\n');
}

// Agenda-bestand (.ics), op de telefoon gemaakt; tijden zonder tijdzone = lokale tijd
export function buildICS(team, entries) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const fold = (line) => { const ch = Array.from(line); const parts = []; for (let i = 0; i < ch.length; i += 60) parts.push(ch.slice(i, i + 60).join('')); return parts.join('\r\n '); };
  const dt = (date, time) => date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  const addMin = (time, min) => { const [h, m] = time.split(':').map(Number); const t = h * 60 + m + min; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dur = team.periods * team.periodMin + 15;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SpaBo Coach//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc('Hockey ' + team.name)];
  for (const e of entries) {
    const title = e.home === false ? `${e.opponent || 'Tegenstander'} – ${team.name}` : `${team.name} – ${e.opponent || 'Tegenstander'}`;
    const desc = [e.time ? 'Aanvang ' + e.time : '', e.meet ? 'Verzamelen ' + e.meet : '', e.keeperId ? 'Keeper: ' + firstName(team, e.keeperId) : '']
      .concat(TASKS.map((t) => { const l = ((e.tasks && e.tasks[t.key]) || []).filter(Boolean).map((id) => firstName(team, id)).join(', '); return l ? `${t.label}: ${l}` : ''; })).filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', 'UID:' + e.id + '@spabo-coach', 'DTSTAMP:' + stamp);
    const start = e.meet || e.time;
    if (start) { lines.push('DTSTART:' + dt(e.date, start), 'DTEND:' + dt(e.date, addMin(e.time || start, dur))); }
    else { const d = e.date.replace(/-/g, ''); lines.push('DTSTART;VALUE=DATE:' + d); }
    lines.push(fold('SUMMARY:' + esc('🏑 ' + title)), fold('LOCATION:' + esc((e.home === false ? 'Uit' : 'Thuis') + (e.field ? ', ' + e.field : ''))), fold('DESCRIPTION:' + esc(desc)), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function copyText(text, what = 'Bericht gekopieerd · plak het in de teamapp') {
  try { await navigator.clipboard.writeText(text); toast(what); return true; }
  catch (e) { return false; }
}

export function Seizoen({ state }) {
  const team = activeTeam(state);
  const [edit, setEdit] = useState(null);
  const schedAll = team.schedule || [];
  const seasonOfMatch = (m) => m.season || (schedAll.find((e) => e.id === m.scheduleId) || {}).season || seasonOf(m.date);
  const seasonOfEntry = (e) => e.season || seasonOf(e.date);
  const allFinished = state.matches.filter((m) => m.teamId === team.id && m.finished);
  const current = seasonOf(todayISO());
  const seasons = Array.from(new Set([current].concat(schedAll.map(seasonOfEntry), allFinished.map(seasonOfMatch)))).sort().reverse();
  const [season, setSeason] = useState(current);
  const finished = allFinished.filter((m) => seasonOfMatch(m) === season);
  const data = useMemo(() => {
    const per = {};
    let w = 0, g = 0, l = 0, gf = 0, ga = 0;
    const res = {};
    for (const m of finished) {
      const s = M.summary(m, team);
      res[m.id] = s;
      gf += s.score.us; ga += s.score.them;
      if (s.score.us > s.score.them) w++; else if (s.score.us === s.score.them) g++; else l++;
      for (const id of m.present) {
        const p = per[id] || (per[id] = { matches: 0, sec: 0, goals: 0, keeper: 0, lt: { A: 0, M: 0, V: 0 } });
        p.matches += 1;
        const isK = id === m.keeperId;
        p.sec += (s.state.played[id] || 0) + (isK && team.rules.keeperCounts && s.lineTime[id] ? s.lineTime[id].K : 0);
        p.goals += s.goals[id] || 0;
        if (isK) p.keeper += 1;
        if (s.lineTime[id]) for (const k of ['A', 'M', 'V']) p.lt[k] += s.lineTime[id][k];
      }
    }
    return { per, res, w, g, l, gf, ga };
  }, [state.matches, team, season]);

  // programma + gespeelde wedstrijden in één lijst
  const today = todayISO();
  const schedule = schedAll.filter((e) => seasonOfEntry(e) === season);
  const linked = new Set(finished.map((m) => m.scheduleId).filter(Boolean));
  const rows = schedule.map((e) => ({ kind: 'plan', e, m: finished.find((x) => x.scheduleId === e.id) || null, date: e.date, time: e.time || '' }))
    .concat(finished.filter((m) => !m.scheduleId || !schedule.some((e) => e.id === m.scheduleId)).map((m) => ({ kind: 'played', m, date: m.date, time: m.time || '' })));
  // nieuwste bovenaan
  const list = rows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  void linked; void today;
  const newEntry = () => setEdit({ id: null, opponent: '', home: true, date: todayISO(), time: '', meet: '', field: '', season, keeperId: '', absent: [], tasks: { fluiten: [], fruit: [], bar: [] } });

  const players = team.players.filter((p) => data.per[p.id] || p.active !== false);
  const avgs = players.map((p) => (data.per[p.id] && data.per[p.id].matches ? data.per[p.id].sec / data.per[p.id].matches : 0));
  const maxAvg = Math.max(1, ...avgs);

  const row = (r) => {
    const name = r.e ? r.e.opponent : r.m.opponent;
    const s = r.m && data.res[r.m.id];
    const res = s ? (s.score.us > s.score.them ? 'win' : s.score.us === s.score.them ? 'draw' : 'loss') : null;
    const d = new Date(r.date + 'T12:00:00');
    const taskCount = r.e ? TASKS.reduce((a, t) => a + ((r.e.tasks && r.e.tasks[t.key]) || []).filter(Boolean).length, 0) : 0;
    return html`<div class="mrow">
      <span class="mdate"><b>${d.getDate()}</b><span>${d.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')}</span></span>
      <button type="button" class="mmain" onClick=${() => (r.e ? setEdit({ ...r.e, tasks: { ...(r.e.tasks || {}) } }) : (location.hash = '#/afloop/' + r.m.id))}>
        <span class="mname"><${OppBadge} name=${name} size=${22} /> ${name || 'Tegenstander'}</span>
        <span class="msub">${r.e ? (r.e.home === false ? 'Uit' : 'Thuis') : ''}${r.time ? (r.e ? ' · ' : '') + r.time : ''}${r.e && r.e.field ? ' · ' + r.e.field : ''}${r.e && !r.m ? (taskCount ? ` · ${taskCount} taken` : ' · taken nog open') : ''}</span>
      </button>
      ${s ? html`<a class=${'mscore ' + res} href=${'#/afloop/' + r.m.id}>${s.score.us} : ${s.score.them}</a>`
        : html`<button type="button" class="iconbtn" aria-label="Bericht kopiëren" onClick=${() => copyText(buildMessage(team, r.e)).then((ok) => { if (!ok) setEdit({ ...r.e, tasks: { ...(r.e.tasks || {}) }, showText: true }); })}><${Icon} name="copy" size=${20} /></button>`}
    </div>`;
  };

  return html`<main class="screen with-tabs">
    <div class="topbar"><span class="badge">${team.name}</span>
      <select class="input" style="width:auto;height:40px;font-size:15px" aria-label="Seizoen kiezen" value=${season} onChange=${(e) => setSeason(e.target.value)}>
        ${seasons.map((s) => html`<option value=${s}>${seasonLabel(s)}${s === current ? '' : ' (archief)'}</option>`)}
      </select>
    </div>
    <h1 class="h1">Seizoen</h1>

    <section class="kpis">
      <div><b class="num">${finished.length}</b><span>gespeeld</span></div>
      <div><b class="num"><span style="color:#1f8a3a !important">${data.w}</span>-${data.g}-<span style="color:#E08A00 !important">${data.l}</span></b><span>w-g-v</span></div>
      <div><b class="num">${data.gf}–${data.ga}</b><span>doelpunten</span></div>
    </section>

    <section class="card" style="gap:4px">
      <div class="between"><span class="h2">Wedstrijden</span><span class="small">${seasonLabel(season)}</span></div>
      ${schedule.length > 0 && html`<div class="row" style="margin:4px 0 6px">
        <button type="button" class="btn plain grow" style="min-height:40px;font-size:14px" onClick=${() => { const entries = schedule.filter((x) => season !== current || x.date >= todayISO()).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); copyText(buildTaskOverview(team, entries.length ? entries : schedule, season), 'Takenoverzicht gekopieerd · plak het in WhatsApp'); }}><${Icon} name="copy" size=${16} /> Takenoverzicht</button>
        <button type="button" class="btn plain grow" style="min-height:40px;font-size:14px" onClick=${() => shareFile(`hockey-${team.name.replace(/[^A-Za-z0-9]+/g, '-')}-${season}.ics`, buildICS(team, schedule.slice().sort((a, b) => a.date.localeCompare(b.date))), 'text/calendar')}><${Icon} name="calendar" size=${16} /> Agenda</button>
      </div>`}
      ${list.map(row)}
      <button type="button" class="addtile" onClick=${newEntry}><${Icon} name="plus" size=${20} /> Wedstrijd toevoegen</button>
    </section>

    <section class="card" style="gap:2px">
      <div class="between"><span class="h2">Spelers</span><span class="small">gem. min · goals · keeper</span></div>
      ${players.map((p) => {
        const d = data.per[p.id] || { matches: 0, sec: 0, goals: 0, keeper: 0, lt: { A: 0, M: 0, V: 0 } };
        const avg = d.matches ? d.sec / d.matches : 0;
        const tot = d.lt.A + d.lt.M + d.lt.V || 1;
        return html`<div class="prow">
          <span class="pname">${p.nick || p.name}<span class="small">${d.matches}×</span></span>
          <span class="pbar" title="gemiddelde speeltijd, gekleurd naar positie">
            <span style=${`width:${(avg / maxAvg) * 100}%`}>
              ${['A', 'M', 'V'].map((k) => html`<i style=${`flex:${d.lt[k] / tot} 1 0;background:${POS_COLORS[k]}`}></i>`)}
            </span>
          </span>
          <span class="pnum num">${M.mins(avg)}′</span>
          <span class=${'pchip' + (d.goals ? ' on' : '')}>${d.goals}</span>
          <span class=${'pchip k' + (d.keeper ? ' on' : '')}>${d.keeper}</span>
        </div>`;
      })}
      <div class="legend" style="margin-top:6px"><span><i style="background:var(--pos-A)"></i>Achter</span><span><i style="background:var(--pos-M)"></i>Midden</span><span><i style="background:var(--pos-V)"></i>Voor</span></div>
    </section>

    ${edit && html`<${ScheduleSheet} team=${team} matches=${state.matches} entry=${edit} onClose=${() => setEdit(null)} />`}
  </main>`;
}

function ScheduleSheet({ team, matches, entry, onClose }) {
  const [e, setE] = useState(entry);
  const [confirm, setConfirm] = useState(false);
  const [showText, setShowText] = useState(!!entry.showText);
  const set = (k, v) => setE((x) => ({ ...x, [k]: v }));
  const active = team.players.filter((p) => p.active !== false);
  // wie deed deze taak het minst vaak (eerlijk verdelen)
  const taskCounts = (key) => {
    const c = {};
    for (const x of team.schedule || []) if (x.id !== e.id) for (const id of (x.tasks && x.tasks[key]) || []) if (id) c[id] = (c[id] || 0) + 1;
    return c;
  };
  const setCount = (key, n) => setE((x) => {
    const cur = ((x.tasks || {})[key] || []).slice(0, n);
    while (cur.length < n) cur.push('');
    return { ...x, tasks: { ...(x.tasks || {}), [key]: cur } };
  });
  const setSlot = (key, i, id) => setE((x) => {
    const cur = ((x.tasks || {})[key] || []).slice();
    cur[i] = id;
    return { ...x, tasks: { ...(x.tasks || {}), [key]: cur } };
  });
  const absent = e.absent || [];
  const toggleAbsent = (id) => setE((x) => { const a = x.absent || []; return { ...x, absent: a.indexOf(id) !== -1 ? a.filter((y) => y !== id) : a.concat([id]), keeperId: x.keeperId === id ? '' : x.keeperId }; });
  const keeperCount = (() => {
    const c = {};
    for (const x of team.schedule || []) if (x.id !== e.id && x.keeperId && seasonOf(x.date) === seasonOf(e.date)) c[x.keeperId] = (c[x.keeperId] || 0) + 1;
    for (const m of matches) if (m.teamId === team.id && m.finished && m.keeperId && !m.scheduleId && seasonOf(m.date) === seasonOf(e.date)) c[m.keeperId] = (c[m.keeperId] || 0) + 1;
    return c;
  })();
  const fairFill = () => {
    const tasks = { ...(e.tasks || {}) };
    const used = new Set(Object.values(tasks).flat().filter(Boolean).concat(absent));
    let keeperId = e.keeperId;
    if (team.keeper && !keeperId) {
      const pool = active.filter((p) => absent.indexOf(p.id) === -1);
      const wants = pool.filter((p) => p.main === 'K' || (p.prefs || []).indexOf('K') !== -1);
      const pick = (wants.length ? wants : pool).slice().sort((a, b) => (keeperCount[a.id] || 0) - (keeperCount[b.id] || 0))[0];
      keeperId = pick ? pick.id : '';
    }
    for (const t of TASKS) {
      const c = taskCounts(t.key);
      tasks[t.key] = ((tasks[t.key]) || []).map((id) => {
        if (id) return id;
        const pick = active.map((p) => p.id).filter((pid) => !used.has(pid)).sort((a, b) => (c[a] || 0) - (c[b] || 0))[0] || '';
        // ouders van afgemelde kinderen krijgen geen taak
        if (pick) used.add(pick);
        return pick;
      });
    }
    setE({ ...e, tasks, keeperId });
  };
  const save = (close = true) => {
    const clean = { ...e, opponent: (e.opponent || '').trim(), field: (e.field || '').trim(), season: e.season || seasonOf(e.date) };
    delete clean.showText;
    update((d) => {
      const t = activeTeam(d);
      t.schedule = t.schedule || [];
      if (clean.id) { const i = t.schedule.findIndex((x) => x.id === clean.id); if (i !== -1) t.schedule[i] = clean; else t.schedule.push(clean); }
      else { clean.id = uid(); t.schedule.push(clean); }
      // een klaargezette (nog niet begonnen) wedstrijd voor dit programma-item meenemen
      const m = d.matches.find((x) => x.id === d.currentMatchId);
      if (m && !m.started && m.scheduleId === clean.id) Object.assign(m, { opponent: clean.opponent, date: clean.date, time: clean.time, field: clean.field, meet: clean.meet });
    });
    if (close) { toast('Opgeslagen'); onClose(); }
    return clean;
  };
  const copy = async () => {
    const saved = save(false);
    setE(saved);
    const ok = await copyText(buildMessage(team, saved));
    if (!ok) setShowText(true);
  };
  const tasks = e.tasks || {};
  return html`<${Sheet} onClose=${onClose} label="Wedstrijd">
    <span class="h2" style="font-size:22px">${e.id ? 'Wedstrijd' : 'Nieuwe wedstrijd'}</span>
    <div class="col"><label class="label" for="s-opp">Tegenstander</label><${OpponentInput} id="s-opp" value=${e.opponent || ''} onChange=${(v) => set('opponent', v)} /></div>
    ${(e.opponent || '').trim() && html`<${ShieldColors} name=${e.opponent} />`}
    <${Seg} label="Thuis of uit" value=${e.home === false ? 'uit' : 'thuis'} onChange=${(v) => set('home', v === 'thuis')} options=${[['thuis', 'Thuis'], ['uit', 'Uit']]} />
    <div class="col"><label class="label" for="s-season">Seizoen</label>
      <select id="s-season" class="input" value=${e.season || seasonOf(e.date)} onChange=${(ev) => set('season', ev.target.value)}>
        ${[-1, 0, 1].map((n) => shiftSeason(seasonOf(todayISO()), n)).concat(e.season ? [e.season] : []).filter((v, i, a) => a.indexOf(v) === i).sort().map((s) => html`<option value=${s}>${seasonLabel(s)}</option>`)}
      </select></div>
    <div class="row">
      <div class="col grow"><label class="label" for="s-date">Datum</label><input id="s-date" type="date" class="input" value=${e.date} onInput=${(ev) => { const v = ev.target.value; setE((x) => ({ ...x, date: v, season: !x.season || x.season === seasonOf(x.date) ? seasonOf(v) : x.season })); }} /></div>
      <div class="col" style="width:118px"><label class="label" for="s-time">Aanvang</label><input id="s-time" type="time" class="input" value=${e.time} onInput=${(ev) => { const v = ev.target.value; setE((x) => ({ ...x, time: v, meet: v && (!x.meet || x.meet === minus30(x.time)) ? minus30(v) : x.meet })); }} /></div>
    </div>
    <div class="row">
      <div class="col" style="width:118px"><label class="label" for="s-meet">Verzamelen</label><input id="s-meet" type="time" class="input" value=${e.meet} onInput=${(ev) => set('meet', ev.target.value)} /></div>
      <div class="col grow"><label class="label" for="s-field">Veld / locatie</label><input id="s-field" class="input" value=${e.field} placeholder="Bijv. veld 3" onInput=${(ev) => set('field', ev.target.value)} /></div>
    </div>

    <div class="col">
      <span class="label">Wie is er niet? ${absent.length ? `(${absent.length})` : ''}</span>
      <div class="wrap">${active.map((p) => html`<button type="button" class="chip warm" aria-pressed=${absent.indexOf(p.id) !== -1 ? 'true' : 'false'} onClick=${() => toggleAbsent(p.id)}>${p.nick || p.name}</button>`)}</div>
    </div>
    ${team.keeper && html`<div class="col">
      <label class="label" for="s-keeper">Keeper</label>
      <select id="s-keeper" class="input" value=${e.keeperId || ''} onChange=${(ev) => set('keeperId', ev.target.value)}>
        <option value="">Nog niet gekozen</option>
        ${active.filter((p) => absent.indexOf(p.id) === -1).map((p) => html`<option value=${p.id}>${p.nick || p.name} · ${keeperCount[p.id] || 0}× dit seizoen</option>`)}
      </select>
    </div>`}
    <div class="between"><span class="h2">Taken voor ouders</span><button type="button" class="link" onClick=${fairFill}>Eerlijk verdelen</button></div>
    ${TASKS.map((t) => {
      const n = (tasks[t.key] || []).length;
      const opts = [[0, 'Geen'], [1, '1']].concat(t.max > 1 ? [[2, '2']] : []);
      return html`<div class="taskblock">
        <div class="between"><span class="t" style="font-weight:800">${t.emoji} ${t.label}</span>
          <div style="width:${t.max > 1 ? 170 : 120}px"><${Seg} small label=${t.label} value=${n} onChange=${(v) => setCount(t.key, v)} options=${opts} /></div></div>
        ${Array.from({ length: n }, (_, i) => html`<select class="input" style="height:44px" aria-label=${t.label + ' ' + (i + 1)} value=${tasks[t.key][i] || ''} onChange=${(ev) => setSlot(t.key, i, ev.target.value)}>
          <option value="">Kies een speler…</option>
          ${active.map((p) => html`<option value=${p.id}>${p.name || p.nick}</option>`)}
        </select>`)}
      </div>`;
    })}

    ${showText && html`<textarea class="input" style="height:180px;padding:10px;font-size:14px;font-weight:600" readonly value=${buildMessage(team, e)} onFocus=${(ev) => ev.target.select()}></textarea>
      <span class="small">Kopiëren lukte niet automatisch: houd de tekst vast en kies Kopieer.</span>`}
    <div class="row">
      <button type="button" class="btn soft grow" onClick=${copy}><${Icon} name="copy" size=${18} /> Bericht</button>
      <button type="button" class="btn soft grow" onClick=${() => { const saved = save(false); setE(saved); shareFile('hockey-' + (saved.opponent || 'wedstrijd').replace(/[^A-Za-z0-9]+/g, '-') + '.ics', buildICS(team, [saved]), 'text/calendar'); }}><${Icon} name="calendar" size=${18} /> In agenda</button>
    </div>
    <button type="button" class="btn primary block" onClick=${() => save(true)}>Opslaan</button>
    <div class="row">
      ${e.id && html`<button type="button" class="btn danger grow" onClick=${() => setConfirm(true)}>Verwijderen</button>`}
      <button type="button" class="btn plain grow" onClick=${onClose}>Annuleren</button>
    </div>
    ${confirm && html`<${Confirm} title="Wedstrijd uit het programma halen?" yes="Verwijderen" danger
      onYes=${() => { update((d) => { const t = activeTeam(d); t.schedule = (t.schedule || []).filter((x) => x.id !== e.id); }); toast('Verwijderd'); onClose(); }} onClose=${() => setConfirm(false)} />`}
  </${Sheet}>`;
}
