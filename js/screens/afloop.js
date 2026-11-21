import { html, useState } from '../../vendor/preact-htm.js';
import { update } from '../store.js';
import * as M from '../match.js';
import { Icon, PosBar, Confirm, go, toast } from '../ui.js';

export function Afloop({ state, matchId }) {
  const match = state.matches.find((m) => m.id === matchId);
  const [confirm, setConfirm] = useState(false);
  if (!match) return html`<main class="screen"><div class="empty"><p>Deze wedstrijd bestaat niet meer.</p><a class="btn primary" href="#/">Naar start</a></div></main>`;
  const team = state.teams.find((t) => t.id === match.teamId) || state.teams[0];
  const s = M.summary(match, team);
  const nick = (id) => M.nickOf(team, id);
  const kc = team.rules.keeperCounts;
  const rows = match.present.map((id) => {
    const lt = s.lineTime[id] || { A: 0, M: 0, V: 0, K: 0 };
    const isK = id === match.keeperId;
    const minutes = (s.state.played[id] || 0) + (isK && kc ? lt.K : 0);
    return { id, isK, lt, minutes, goals: s.goals[id] || 0, outs: s.state.turns[id] || 0, gone: s.state.disabled[id] === 'wedstrijd' };
  }).sort((a, b) => (a.isK ? -1 : b.isK ? 1 : nick(a.id).localeCompare(nick(b.id), 'nl')));
  const goals = match.events.filter((e) => e.type === 'goal' || e.type === 'oppgoal');
  const L = M.periodLen(team);
  const field = rows.filter((r) => !r.isK);
  const fm = field.map((r) => r.minutes);

  const close = () => {
    update((draft) => { if (draft.currentMatchId === match.id && match.finished) draft.currentMatchId = null; });
    go('/');
  };

  return html`<main class="screen">
    <div class="topbar">
      <a class="iconbtn" href="#/seizoen" aria-label="Terug"><${Icon} name="back" /></a>
      <span class="small">${new Date(match.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
      <span style="width:44px"></span>
    </div>
    <section class="card" style="align-items:center;gap:4px">
      <span class="sub">${team.name}${match.opponent ? ' – ' + match.opponent : ''}</span>
      <span class="num" style="font-size:44px;view-transition-name:hero">${s.score.us}<span style="margin:0 5px;color:var(--line-2)">:</span>${s.score.them}</span>
      <span class="small">${match.finished ? 'Afgelopen' : 'Nog bezig'} · ${match.events.filter((e) => e.type === 'swap').length} wissels</span>
    </section>

    <section class="card">
      <div class="between"><span class="h2">Speeltijd en posities</span>${fm.length > 0 && html`<span class="small">${M.mins(Math.min(...fm))}–${M.mins(Math.max(...fm))} min</span>`}</div>
      ${rows.map((r) => html`<div class="col" style="gap:4px">
        <div class="between">
          <span style="font-weight:800">${nick(r.id)}${r.isK ? html` <span class="badge" style="background:#E3F3E7;color:#14652A">keeper</span>` : ''}${r.gone ? html` <span class="small">(gestopt)</span>` : ''}</span>
          <span class="row" style="gap:10px">
            ${r.goals > 0 && html`<span class="small" style="font-weight:800;color:var(--ink)">${r.goals} goal${r.goals > 1 ? 's' : ''}</span>`}
            ${!r.isK && html`<span class="small">${r.outs}×</span>`}
            <span class="num" style="font-size:15px;min-width:42px;text-align:right">${r.isK && !kc ? M.mins(r.lt.K) : M.mins(r.minutes)}′</span>
          </span>
        </div>
        <${PosBar} parts=${[{ k: 'K', v: r.lt.K }, { k: 'A', v: r.lt.A }, { k: 'M', v: r.lt.M }, { k: 'V', v: r.lt.V }]} />
      </div>`)}
      <div class="legend">
        <span><i style="background:var(--pos-K)"></i>Keeper</span><span><i style="background:var(--pos-A)"></i>Achter</span>
        <span><i style="background:var(--pos-M)"></i>Midden</span><span><i style="background:var(--pos-V)"></i>Voor</span>
      </div>
      ${match.keeperId && !kc && html`<span class="small">Keepertijd telt niet mee in de speeltijd (teaminstelling).</span>`}
    </section>

    ${goals.length > 0 && html`<section class="card">
      <span class="h2">Doelpunten</span>
      ${goals.map((g) => {
        const p = Math.min(team.periods - 1, Math.floor(g.t / L));
        return html`<div class="between" style="min-height:44px">
          <span class="small" style="width:96px">${M.periodLabel(team, p)} ${M.fmt(g.t - p * L)}</span>
          ${g.type === 'oppgoal'
            ? html`<span class="grow sub">Tegengoal</span>`
            : html`<select class="input grow" style="height:40px" value=${g.scorer || ''} aria-label="Wie scoorde"
                onChange=${(e) => { const v = e.target.value; update((draft) => { const m = draft.matches.find((x) => x.id === match.id); M.setScorer(m, g.id, v); }); }}>
                <option value="">Onbekend</option>
                ${match.present.map((id) => html`<option value=${id}>${nick(id)}</option>`)}
              </select>`}
        </div>`;
      })}
    </section>`}

    <button type="button" class="btn primary block" onClick=${close}>Klaar</button>
    <button type="button" class="btn danger block" onClick=${() => setConfirm(true)}>Wedstrijd verwijderen</button>
    ${confirm && html`<${Confirm} title="Wedstrijd verwijderen?" text="Dit kan niet ongedaan worden gemaakt. Handig voor een testwedstrijd." yes="Verwijderen" danger
      onYes=${() => { update((draft) => { draft.matches = draft.matches.filter((m) => m.id !== match.id); if (draft.currentMatchId === match.id) draft.currentMatchId = null; }); toast('Wedstrijd verwijderd'); go('/seizoen'); }}
      onClose=${() => setConfirm(false)} />`}
  </main>`;
}
