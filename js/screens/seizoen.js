import { html, useMemo, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, uid } from '../store.js';
import * as M from '../match.js';
import { Icon, Sheet, Seg, Confirm, toast, POS_COLORS } from '../ui.js';

export const todayISO = () => new Date().toLocaleDateString('sv-SE');
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
  const lines = [`🏑 ${title}`, `📅 ${longDate(e.date)}`];
  if (e.time || e.meet) lines.push(`⏰ ${e.time ? 'Aanvang ' + e.time : ''}${e.time && e.meet ? ' · ' : ''}${e.meet ? 'verzamelen ' + e.meet : ''}`);
  lines.push(`📍 ${e.home === false ? 'Uit' : 'Thuis'}${e.field ? ' · ' + e.field : ''}`);
  const tasks = TASKS.filter((t) => (e.tasks && e.tasks[t.key] || []).filter(Boolean).length);
  if (tasks.length) {
    lines.push('', '📋 Taken');
    for (const t of tasks) lines.push(`${t.emoji} ${t.label}: ouders van ${names(e.tasks[t.key])}`);
  }
  lines.push('', `Succes ${team.name}! 💪🧡💙`);
  return lines.join('\n');
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Bericht gekopieerd · plak het in de teamapp'); return true; }
  catch (e) { return false; }
}

export function Seizoen({ state }) {
  const team = activeTeam(state);
  const [edit, setEdit] = useState(null);
  const finished = state.matches.filter((m) => m.teamId === team.id && m.finished);
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
  }, [state.matches, team]);

  // programma + gespeelde wedstrijden in één lijst
  const today = todayISO();
  const schedule = (team.schedule || []).slice();
  const linked = new Set(finished.map((m) => m.scheduleId).filter(Boolean));
  const rows = schedule.map((e) => ({ kind: 'plan', e, m: finished.find((x) => x.scheduleId === e.id) || null, date: e.date, time: e.time || '' }))
    .concat(finished.filter((m) => !m.scheduleId || !schedule.some((e) => e.id === m.scheduleId)).map((m) => ({ kind: 'played', m, date: m.date, time: m.time || '' })));
  const upcoming = rows.filter((r) => !r.m && r.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = rows.filter((r) => r.m || r.date < today).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  void linked;

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
        <span class="mname">${name || 'Tegenstander'}</span>
        <span class="msub">${r.e ? (r.e.home === false ? 'Uit' : 'Thuis') : ''}${r.time ? (r.e ? ' · ' : '') + r.time : ''}${r.e && r.e.field ? ' · ' + r.e.field : ''}${r.e && !r.m ? (taskCount ? ` · ${taskCount} taken` : ' · taken nog open') : ''}</span>
      </button>
      ${s ? html`<a class=${'mscore ' + res} href=${'#/afloop/' + r.m.id}>${s.score.us}–${s.score.them}</a>`
        : html`<button type="button" class="iconbtn" aria-label="Bericht kopiëren" onClick=${() => copyText(buildMessage(team, r.e)).then((ok) => { if (!ok) setEdit({ ...r.e, tasks: { ...(r.e.tasks || {}) }, showText: true }); })}><${Icon} name="copy" size=${20} /></button>`}
    </div>`;
  };

  return html`<main class="screen with-tabs">
    <div class="topbar"><span class="badge">${team.name}</span>
      <button type="button" class="btn soft" style="min-height:40px" onClick=${() => setEdit({ id: null, opponent: '', home: true, date: today, time: '', meet: '', field: '', tasks: { fluiten: [], fruit: [], bar: [] } })}><${Icon} name="plus" size=${18} /> Wedstrijd</button>
    </div>
    <h1 class="h1">Seizoen</h1>

    <section class="kpis">
      <div><b class="num">${finished.length}</b><span>gespeeld</span></div>
      <div><b class="num"><span style="color:#1f8a3a !important">${data.w}</span>-${data.g}-<span style="color:#E08A00 !important">${data.l}</span></b><span>w-g-v</span></div>
      <div><b class="num">${data.gf}–${data.ga}</b><span>doelpunten</span></div>
    </section>

    <section class="card" style="gap:4px">
      <span class="h2">Programma</span>
      ${!upcoming.length && html`<span class="sub">Nog geen komende wedstrijden. Voeg ze toe met + Wedstrijd.</span>`}
      ${upcoming.map(row)}
      ${past.length > 0 && html`<span class="label" style="margin-top:8px">Gespeeld</span>`}
      ${past.map(row)}
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

    ${edit && html`<${ScheduleSheet} team=${team} entry=${edit} onClose=${() => setEdit(null)} />`}
  </main>`;
}

function ScheduleSheet({ team, entry, onClose }) {
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
  const fairFill = () => {
    const tasks = { ...(e.tasks || {}) };
    const used = new Set(Object.values(tasks).flat().filter(Boolean));
    for (const t of TASKS) {
      const c = taskCounts(t.key);
      tasks[t.key] = ((tasks[t.key]) || []).map((id) => {
        if (id) return id;
        const pick = active.map((p) => p.id).filter((pid) => !used.has(pid)).sort((a, b) => (c[a] || 0) - (c[b] || 0))[0] || '';
        if (pick) used.add(pick);
        return pick;
      });
    }
    setE({ ...e, tasks });
  };
  const save = (close = true) => {
    const clean = { ...e, opponent: (e.opponent || '').trim(), field: (e.field || '').trim() };
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
    <div class="col"><label class="label" for="s-opp">Tegenstander</label><input id="s-opp" class="input" value=${e.opponent} placeholder="Bijv. Hurley JO9-3" onInput=${(ev) => set('opponent', ev.target.value)} /></div>
    <${Seg} label="Thuis of uit" value=${e.home === false ? 'uit' : 'thuis'} onChange=${(v) => set('home', v === 'thuis')} options=${[['thuis', 'Thuis'], ['uit', 'Uit']]} />
    <div class="row">
      <div class="col grow"><label class="label" for="s-date">Datum</label><input id="s-date" type="date" class="input" value=${e.date} onInput=${(ev) => set('date', ev.target.value)} /></div>
      <div class="col" style="width:104px"><label class="label" for="s-time">Aanvang</label><input id="s-time" type="time" class="input" value=${e.time} onInput=${(ev) => set('time', ev.target.value)} /></div>
    </div>
    <div class="row">
      <div class="col" style="width:104px"><label class="label" for="s-meet">Verzamelen</label><input id="s-meet" type="time" class="input" value=${e.meet} onInput=${(ev) => set('meet', ev.target.value)} /></div>
      <div class="col grow"><label class="label" for="s-field">Veld / locatie</label><input id="s-field" class="input" value=${e.field} placeholder="Bijv. veld 3" onInput=${(ev) => set('field', ev.target.value)} /></div>
    </div>

    <div class="between"><span class="h2">Taken voor ouders</span><button type="button" class="link" onClick=${fairFill}>Eerlijk verdelen</button></div>
    ${TASKS.map((t) => {
      const n = (tasks[t.key] || []).length;
      const opts = [[0, 'Geen'], [1, '1']].concat(t.max > 1 ? [[2, '2']] : []);
      return html`<div class="taskblock">
        <div class="between"><span class="t" style="font-weight:800">${t.emoji} ${t.label}</span>
          <div style="width:${t.max > 1 ? 170 : 120}px"><${Seg} small label=${t.label} value=${n} onChange=${(v) => setCount(t.key, v)} options=${opts} /></div></div>
        ${Array.from({ length: n }, (_, i) => html`<select class="input" style="height:44px" aria-label=${t.label + ' ' + (i + 1)} value=${tasks[t.key][i] || ''} onChange=${(ev) => setSlot(t.key, i, ev.target.value)}>
          <option value="">Kies een speler (ouders van)…</option>
          ${active.map((p) => html`<option value=${p.id}>${p.name || p.nick}</option>`)}
        </select>`)}
      </div>`;
    })}

    ${showText && html`<textarea class="input" style="height:180px;padding:10px;font-size:14px;font-weight:600" readonly value=${buildMessage(team, e)} onFocus=${(ev) => ev.target.select()}></textarea>
      <span class="small">Kopiëren lukte niet automatisch: houd de tekst vast en kies Kopieer.</span>`}
    <button type="button" class="btn soft block" onClick=${copy}><${Icon} name="copy" size=${18} /> Bericht voor de teamapp kopiëren</button>
    <button type="button" class="btn primary block" onClick=${() => save(true)}>Opslaan</button>
    <div class="row">
      ${e.id && html`<button type="button" class="btn danger grow" onClick=${() => setConfirm(true)}>Verwijderen</button>`}
      <button type="button" class="btn plain grow" onClick=${onClose}>Annuleren</button>
    </div>
    ${confirm && html`<${Confirm} title="Wedstrijd uit het programma halen?" yes="Verwijderen" danger
      onYes=${() => { update((d) => { const t = activeTeam(d); t.schedule = (t.schedule || []).filter((x) => x.id !== e.id); }); toast('Verwijderd'); onClose(); }} onClose=${() => setConfirm(false)} />`}
  </${Sheet}>`;
}
