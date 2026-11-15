import { html, useMemo } from '../../vendor/preact-htm.js';
import { activeTeam } from '../store.js';
import * as M from '../match.js';
import { Icon } from '../ui.js';

export function Seizoen({ state }) {
  const team = activeTeam(state);
  const matches = state.matches.filter((m) => m.teamId === team.id && m.finished).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const data = useMemo(() => {
    const per = {};
    let w = 0, g = 0, l = 0, gf = 0, ga = 0;
    const res = matches.map((m) => {
      const s = M.summary(m, team);
      gf += s.score.us; ga += s.score.them;
      if (s.score.us > s.score.them) w++; else if (s.score.us === s.score.them) g++; else l++;
      for (const id of m.present) {
        const p = per[id] || (per[id] = { matches: 0, sec: 0, goals: 0, keeper: 0 });
        p.matches += 1;
        const isK = id === m.keeperId;
        p.sec += (s.state.played[id] || 0) + (isK && team.rules.keeperCounts ? (s.lineTime[id] ? s.lineTime[id].K : 0) : 0);
        p.goals += s.goals[id] || 0;
        if (isK) p.keeper += 1;
      }
      return { m, s };
    });
    return { per, res, w, g, l, gf, ga };
  }, [state.matches, team]);

  const players = team.players.filter((p) => data.per[p.id] || p.active !== false);
  const avgs = players.map((p) => (data.per[p.id] && data.per[p.id].matches ? data.per[p.id].sec / data.per[p.id].matches : 0)).filter((x) => x > 0);
  const maxAvg = avgs.length ? Math.max(...avgs) : 1;

  return html`<main class="screen with-tabs">
    <div class="topbar"><span class="badge">${team.name}</span></div>
    <h1 class="h1">Seizoen</h1>

    <section class="card" style="flex-direction:row;justify-content:space-around;text-align:center">
      <div class="col" style="gap:0"><span class="num" style="font-size:26px">${matches.length}</span><span class="small">wedstrijden</span></div>
      <div class="col" style="gap:0"><span class="num" style="font-size:26px">${data.w}-${data.g}-${data.l}</span><span class="small">w-g-v</span></div>
      <div class="col" style="gap:0"><span class="num" style="font-size:26px">${data.gf}–${data.ga}</span><span class="small">doelpunten</span></div>
    </section>

    <section class="card">
      <span class="h2">Per speler</span>
      <div class="row small" style="font-weight:800">
        <span class="grow">Speler</span><span style="width:34px;text-align:right">Wed.</span><span style="width:84px;text-align:right">Gem. min</span><span style="width:34px;text-align:right">Goals</span><span style="width:34px;text-align:right">Keep</span>
      </div>
      ${players.map((p) => {
        const d = data.per[p.id] || { matches: 0, sec: 0, goals: 0, keeper: 0 };
        const avg = d.matches ? d.sec / d.matches : 0;
        return html`<div class="row" style="min-height:34px">
          <span class="grow" style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nick || p.name}</span>
          <span class="num" style="width:34px;text-align:right;font-size:14px">${d.matches}</span>
          <span style="width:84px;display:flex;align-items:center;gap:6px;justify-content:flex-end">
            <span style=${`display:inline-block;height:8px;border-radius:999px;background:var(--blue-2);width:${Math.round((avg / maxAvg) * 40)}px`}></span>
            <span class="num" style="font-size:14px">${M.mins(avg)}</span>
          </span>
          <span class="num" style="width:34px;text-align:right;font-size:14px">${d.goals}</span>
          <span class="num" style="width:34px;text-align:right;font-size:14px">${d.keeper}</span>
        </div>`;
      })}
      <span class="small">Uitgebreide grafieken per speler volgen in een volgende stap.</span>
    </section>

    <section class="card">
      <span class="h2">Wedstrijden</span>
      ${!matches.length && html`<p class="sub" style="margin:0">Nog geen afgeronde wedstrijden.</p>`}
      ${data.res.map(({ m, s }) => html`<a href=${'#/afloop/' + m.id} class="between" style="min-height:48px;text-decoration:none;color:inherit;border-top:1px solid var(--line-3)">
        <span class="col" style="gap:0"><span style="font-weight:800">${m.opponent || 'Tegenstander'}</span><span class="small">${new Date(m.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span></span>
        <span class="row"><span class="num" style="font-size:18px">${s.score.us}–${s.score.them}</span><${Icon} name="chev" size=${18} /></span>
      </a>`)}
    </section>
  </main>`;
}
