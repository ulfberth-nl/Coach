import { html, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch, newTeam, exportData, importData } from '../store.js';
import { replan } from '../match.js';
import { Seg, Switch, Setting, Stepper, Icon, Confirm, toast, STANDS } from '../ui.js';

export const APP_VERSION = '0.1.0';

export function Team({ state }) {
  const team = activeTeam(state);
  const r = team.rules;
  const running = currentMatch(state);
  const locked = !!(running && !running.finished && running.teamId === team.id);
  const [confirm, setConfirm] = useState(null);

  const set = (fn) => update((draft) => {
    const t = activeTeam(draft);
    fn(t);
    const m = currentMatch(draft);
    if (m && !m.finished && m.teamId === t.id) { try { replan(m, t); } catch (e) { /* plan volgt bij de volgende actie */ } }
  });
  const setRule = (k, v) => set((t) => { t.rules[k] = v; });
  const setLines = (k, v) => set((t) => {
    const next = { ...t.lines, [k]: v };
    if (next.A + next.M + next.V < 1) return;
    t.lines = next;
    t.formation = `${next.A}-${next.M}-${next.V}`;
  });
  const F = team.lines.A + team.lines.M + team.lines.V;

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spabo-coach-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  const upload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    file.text().then((txt) => {
      setConfirm({ title: 'Back-up terugzetten?', text: 'Alles op deze telefoon wordt vervangen door de back-up.', yes: 'Terugzetten', danger: true, run: () => {
        try { importData(txt); toast('Back-up teruggezet'); } catch (err) { toast(err.message || 'Dit bestand herken ik niet'); }
      } });
    });
    e.target.value = '';
  };

  return html`<main class="screen with-tabs">
    <div class="topbar">
      ${state.teams.length > 1
        ? html`<select class="input" style="width:auto;height:40px" value=${team.id} aria-label="Team kiezen" onChange=${(e) => update((d) => { d.activeTeamId = e.target.value; })}>
            ${state.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}
          </select>`
        : html`<span class="badge">${team.name}</span>`}
      <button type="button" class="link" onClick=${() => update((d) => { const t = newTeam('Nieuw team', false); d.teams.push(t); d.activeTeamId = t.id; })}><${Icon} name="plus" size=${16} /> Team</button>
    </div>
    <h1 class="h1">Team instellen</h1>

    <section class="card">
      <span class="h2">Team</span>
      <div class="col">
        <label class="label" for="tname">Naam</label>
        <input id="tname" class="input" value=${team.name} maxLength="30" onChange=${(e) => set((t) => { t.name = e.target.value.trim() || t.name; })} />
      </div>
      <a class="setting" href="#/spelers" style="text-decoration:none;color:inherit">
        <div class="col" style="gap:1px"><span class="t">Spelers en beoordeling</span><span class="small">${team.players.filter((p) => p.active !== false).length} spelers · achter pincode</span></div>
        <span class="row"><${Icon} name="lock" size=${18} /><${Icon} name="chev" size=${18} /></span>
      </a>
    </section>

    <section class="card">
      <span class="h2">Spelvorm</span>
      ${locked && html`<div class="col" style="gap:6px">
        <span class="small" style="color:var(--ink)">${running.started ? 'Tijdens een wedstrijd kun je de spelvorm niet aanpassen.' : 'Er staat een wedstrijd klaar. Gooi die weg om de spelvorm aan te passen.'}</span>
        ${!running.started && html`<button type="button" class="btn plain" onClick=${() => update((d) => { d.matches = d.matches.filter((m) => m.id !== d.currentMatchId); d.currentMatchId = null; })}>Klaargezette wedstrijd weggooien</button>`}
      </div>`}
      <fieldset disabled=${locked} style="border:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px">
        <${Seg} label="Veld of zaal" value=${team.type} onChange=${(v) => set((t) => { t.type = v; })} options=${[['veld', 'Veld'], ['zaal', 'Zaal']]} />
        <${Setting} title="Met keeper"><${Switch} label="Met keeper" on=${team.keeper} onChange=${(v) => set((t) => { t.keeper = v; })} /></${Setting}>
        <${Setting} title="Achter"><${Stepper} label="Achter" value=${team.lines.A} min=${0} max=${5} onChange=${(v) => setLines('A', v)} /></${Setting}>
        <${Setting} title="Midden"><${Stepper} label="Midden" value=${team.lines.M} min=${0} max=${5} onChange=${(v) => setLines('M', v)} /></${Setting}>
        <${Setting} title="Voor"><${Stepper} label="Voor" value=${team.lines.V} min=${0} max=${5} onChange=${(v) => setLines('V', v)} /></${Setting}>
        <span class="small">${F + (team.keeper ? 1 : 0)} tegen ${F + (team.keeper ? 1 : 0)} · opstelling ${team.lines.A}-${team.lines.M}-${team.lines.V}${team.keeper ? ' plus keeper' : ''}</span>
        <${Setting} title="Aantal periodes" sub=${team.periods === 2 ? 'helften' : team.periods === 4 ? 'kwarten' : 'periodes'}><${Stepper} label="Aantal periodes" value=${team.periods} min=${1} max=${4} onChange=${(v) => set((t) => { t.periods = v; })} /></${Setting}>
        <${Setting} title="Minuten per periode"><${Stepper} label="Minuten per periode" value=${team.periodMin} min=${5} max=${45} onChange=${(v) => set((t) => { t.periodMin = v; })} /></${Setting}>
      </fieldset>
    </section>

    <section class="card">
      <span class="h2">Rekenregels wissels</span>
      <${Setting} title="Opstelling volgt de stand" sub="Past de stand automatisch aan bij een goal"><${Switch} label="Opstelling volgt de stand" on=${r.autoStand} onChange=${(v) => setRule('autoStand', v)} /></${Setting}>
      ${r.autoStand && html`
        <span class="label">Bij achterstand</span>
        <${Seg} label="Bij achterstand" value=${r.standAchter} onChange=${(v) => setRule('standAchter', v)} options=${STANDS} />
        <span class="label">Bij gelijke stand</span>
        <${Seg} label="Bij gelijke stand" value=${r.standGelijk} onChange=${(v) => setRule('standGelijk', v)} options=${STANDS} />
        <span class="label">Bij voorsprong</span>
        <${Seg} label="Bij voorsprong" value=${r.standVoor} onChange=${(v) => setRule('standVoor', v)} options=${STANDS} />`}
      <span class="small">Verdedigen: sterkere wissels achterin. Aanvallen: sterkere wissels voorin. Het midden blijft altijd sterk.</span>
    </section>

    <section class="card">
      <span class="h2">Eerlijkheid</span>
      <${Setting} title="Iedereen even vaak gewisseld"><${Switch} label="Iedereen even vaak gewisseld" on=${r.evenOften} onChange=${(v) => setRule('evenOften', v)} /></${Setting}>
      <${Setting} title="Gelijke speeltijd"><${Switch} label="Gelijke speeltijd" on=${r.equalTime} onChange=${(v) => setRule('equalTime', v)} /></${Setting}>
      ${r.equalTime && html`<${Setting} title="Marge speeltijd" sub="Maximaal verschil tussen kinderen"><${Stepper} label="Marge" value=${r.marge} min=${1} max=${15} suffix=" min" onChange=${(v) => setRule('marge', v)} /></${Setting}>`}
      <${Setting} title="Niet te lang op de bank" sub="Niemand zit langer achter elkaar op de bank dan"><${Switch} label="Niet te lang op de bank" on=${!!r.maxBenchOn} onChange=${(v) => setRule('maxBenchOn', v)} /></${Setting}>
      ${r.maxBenchOn && html`<${Setting} title="Maximaal op de bank"><${Stepper} label="Maximaal op de bank" value=${r.maxBench || 10} min=${3} max=${30} suffix=" min" onChange=${(v) => setRule('maxBench', v)} /></${Setting}>`}
      <${Setting} title="Minimaal tussen wissels"><${Stepper} label="Minimaal tussen wissels" value=${r.minInterval || 2} min=${1} max=${8} suffix=" min" onChange=${(v) => setRule('minInterval', v)} /></${Setting}>
      <${Setting} title="Nieuwe opstelling na de rust" sub="Gratis moment om meerdere kinderen te wisselen"><${Switch} label="Nieuwe opstelling na de rust" on=${r.newLineupAtBreak} onChange=${(v) => setRule('newLineupAtBreak', v)} /></${Setting}>
      <${Setting} title="Keepertijd telt mee" sub="Uit: keepertijd telt niet als speeltijd in de overzichten"><${Switch} label="Keepertijd telt mee" on=${r.keeperCounts} onChange=${(v) => setRule('keeperCounts', v)} /></${Setting}>
      <span class="label">Standaard voorrang</span>
      <${Seg} label="Standaard voorrang" value=${r.priority} onChange=${(v) => setRule('priority', v)} options=${[['eerlijk', 'Eerlijkheid'], ['bezetting', 'Beste bezetting']]} />
      <span class="small">Bij het klaarzetten kun je per wedstrijd een andere keuze maken.</span>
    </section>

    <section class="card">
      <span class="h2">Gegevens</span>
      <span class="small">Alles staat nu alleen op deze telefoon. Maak af en toe een back-up, bijvoorbeeld naar je bestanden of mail.</span>
      <button type="button" class="btn plain block" onClick=${download}>Back-up maken</button>
      <label class="btn plain block" style="cursor:pointer">Back-up terugzetten<input type="file" accept="application/json,.json" class="sr" onChange=${upload} /></label>
      ${state.teams.length > 1 && html`<button type="button" class="btn danger block" onClick=${() => setConfirm({ title: 'Team ' + team.name + ' verwijderen?', text: 'De spelers en wedstrijden van dit team worden ook verwijderd.', yes: 'Verwijderen', danger: true, run: () => update((d) => {
        d.matches = d.matches.filter((m) => m.teamId !== team.id);
        d.teams = d.teams.filter((t) => t.id !== team.id);
        d.activeTeamId = d.teams[0].id;
        if (d.currentMatchId && !d.matches.some((m) => m.id === d.currentMatchId)) d.currentMatchId = null;
      }) })}>Team verwijderen</button>`}
      <span class="small" style="text-align:center">Versie ${APP_VERSION}</span>
    </section>

    ${confirm && html`<${Confirm} title=${confirm.title} text=${confirm.text} yes=${confirm.yes} danger=${confirm.danger} onYes=${confirm.run} onClose=${() => setConfirm(null)} />`}
  </main>`;
}
