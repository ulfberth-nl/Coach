import { html, useEffect, useMemo, useRef } from '../../vendor/preact-htm.js';
import { currentMatch } from '../store.js';
import * as M from '../match.js';
import { LINE_NAMES } from '../planner.js';
import { Field, Icon, POS_COLORS } from '../ui.js';

const BENCH_COLOR = '#DCE2EE';

export function Plan({ state }) {
  const match = currentMatch(state);
  if (!match) return html`<main class="screen"><div class="empty"><p>Er is geen wedstrijd klaargezet.</p><a class="btn primary" href="#/">Wedstrijd klaarzetten</a></div></main>`;
  const team = state.teams.find((t) => t.id === match.teamId);
  return html`<${PlanInner} match=${match} team=${team} />`;
}

function PlanInner({ match, team }) {
  const nick = (id) => M.nickOf(team, id);
  const L = M.periodLen(team);
  const end = M.matchEnd(team);
  const { cards, nowIndex } = useMemo(() => M.timeline(match, team), [match, team]);
  const strip = useRef(null);

  const swapNo = [];
  let n = 0;
  for (const c of cards) swapNo.push(c.kind === 'swap' ? ++n : 0);
  const swapsTotal = n;
  const durations = cards.map((c, i) => Math.max(0, (i + 1 < cards.length ? cards[i + 1].t : end) - c.t));

  const scrollTo = (i, smooth) => {
    const el = strip.current;
    if (!el || !el.children[i]) return;
    const child = el.children[i];
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => { scrollTo(Math.max(0, nowIndex), false); }, []);

  // tabel: per kind per interval de linie (of bank)
  const kids = match.present.filter((id) => id !== match.keeperId);
  const rows = kids.map((id) => {
    let played = 0, outs = 0;
    const cells = cards.map((c, i) => {
      const line = c.pos[id];
      if (line) played += durations[i];
      if (i > 0 && cards[i - 1].pos[id] && !line) outs += 1;
      return line || null;
    });
    return { id, cells, played, outs };
  });
  const pv = rows.map((r) => r.played);
  const ov = rows.map((r) => r.outs);
  const every = swapsTotal ? Math.round((end / (swapsTotal + team.periods)) / 30) / 2 : 0;
  const periodTitle = (c) => (c.period === 0 ? 'Start' : 'Opstelling ' + M.periodLabel(team, c.period));
  const timeLabel = (c) => {
    const p = Math.min(team.periods - 1, Math.floor(c.t / L));
    return M.periodLabel(team, p) + ' · ' + M.fmt(c.t - p * L);
  };

  return html`<main class="screen">
    <div class="topbar">
      <a class="iconbtn" href="#/live" aria-label="Terug"><${Icon} name="back" /></a>
      <span class="h2 grow" style="text-align:center">Wedstrijdplan</span>
      <span style="width:44px"></span>
    </div>

    <section class="card" style="gap:6px">
      <span class="h2">${swapsTotal ? `${swapsTotal} wissels, telkens 1` : 'Geen wissels'}${swapsTotal ? html`<span class="sub" style="font-weight:700"> · ongeveer elke ${String(every).replace('.', ',')} min</span>` : ''}</span>
      ${rows.length > 0 && html`<span class="sub">Speeltijd ${M.mins(Math.min(...pv))}–${M.mins(Math.max(...pv))} min · ${Math.min(...ov) === Math.max(...ov) ? `iedereen ${ov[0]}× gewisseld` : `${Math.min(...ov)}–${Math.max(...ov)}× gewisseld`}</span>`}
      ${match.plan && !match.plan.ok && html`<span class="small" style="color:var(--ink)">Niet alle eerlijkheidsregels passen precies; dit is de eerlijkste verdeling die past.</span>`}
      <div class="timeline" style="margin-top:6px" aria-hidden="true">
        ${cards.map((c, i) => html`${c.kind === 'lineup' && c.period > 0 ? html`<i></i>` : null}<span class=${i < nowIndex ? 'past' : i === nowIndex ? 'now' : ''} style=${`flex:${Math.max(20, durations[i])} 1 0;cursor:pointer`} onClick=${() => scrollTo(i, true)}></span>`)}
      </div>
    </section>

    <div class="strip" ref=${strip}>
      ${cards.map((c, i) => {
        const state = i < nowIndex ? 'past' : i === nowIndex ? 'now' : 'future';
        const incoming = c.kind === 'swap' ? [c.in] : (i > 0 ? Object.keys(c.pos).filter((id) => !(id in cards[i - 1].pos)) : []);
        return html`<article class=${'card plancard ' + state} key=${i}>
          <div class="between">
            <div class="col" style="gap:0">
              <span class="h2">${c.kind === 'swap' ? `Wissel ${swapNo[i]} van ${swapsTotal}` : periodTitle(c)}</span>
              <span class="small">${timeLabel(c)}</span>
            </div>
            <span class=${'badge ' + (state === 'past' ? 'past' : state === 'now' ? 'now' : '')}>${state === 'past' ? 'Gedaan' : state === 'now' ? 'Nu' : 'Gepland'}</span>
          </div>
          <${Field} slots=${c.slots} lines=${team.lines} keeperId=${match.keeperId} nick=${nick} height=${250} compact
            neon=${state === 'future' ? incoming : []} dashed=${c.shift ? [c.shift.id] : []} />
          ${c.kind === 'swap'
            ? html`<span class="sub" style="color:var(--ink)"><b>Wissel:</b> ${nick(c.in)} erin voor ${nick(c.out)}${c.shift ? html`<br /><b>Schuif:</b> ${nick(c.shift.id)} naar ${LINE_NAMES[c.shift.to]}, ${nick(c.in)} naar ${LINE_NAMES[c.pos[c.in]]}` : ''}</span>`
            : incoming.length ? html`<span class="sub" style="color:var(--ink)"><b>Erin:</b> ${incoming.map(nick).join(', ')}</span>` : null}
          <span class="small"><b>Bank:</b> ${c.bench.length ? c.bench.map(nick).join(', ') : 'niemand'}</span>
        </article>`;
      })}
    </div>

    <section class="card table">
      <span class="h2">Hele wedstrijd per kind</span>
      ${rows.map((r) => html`<div class="r">
        <span class="n">${nick(r.id)}</span>
        <span class="cells">${r.cells.map((line, i) => html`<span style=${`flex:${Math.max(1, durations[i])} 1 0;background:${line ? POS_COLORS[line] : BENCH_COLOR};opacity:${i < nowIndex ? 0.55 : 1}`}></span>`)}</span>
        <span class="v num">${M.mins(r.played)}′</span>
        <span class="small" style="width:22px;text-align:right">${r.outs}×</span>
      </div>`)}
      <div class="legend">
        <span><i style="background:var(--pos-A)"></i>Achter</span>
        <span><i style="background:var(--pos-M)"></i>Midden</span>
        <span><i style="background:var(--pos-V)"></i>Voor</span>
        <span><i style=${'background:' + BENCH_COLOR}></i>Bank</span>
        <span>′ = minuten · × = keer gewisseld</span>
      </div>
    </section>
  </main>`;
}
