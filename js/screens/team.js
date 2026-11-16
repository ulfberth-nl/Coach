import { html, useMemo, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch, newTeam, exportData, importData } from '../store.js';
import { replan, periodWord, createMatch, matchEnd, mins } from '../match.js';
import { suggestKeeper } from './home.js';
import { rebuildConcept } from './wedstrijd.js';
import { Seg, Switch, Setting, Stepper, Icon, Confirm, TeamBadge, toast, STANDS } from '../ui.js';

export const APP_VERSION = '0.9.1';

// Eerlijkheid in drie standen; zetten de onderliggende regels in één keer
const FAIR = {
  streng: { label: 'Streng', sub: 'Iedereen even lang: hooguit 2 minuten verschil.', rules: { equalTime: true, marge: 2, priority: 'eerlijk', evenOften: true } },
  normaal: { label: 'Normaal', sub: 'Iedereen ongeveer even lang: hooguit 5 minuten verschil.', rules: { equalTime: true, marge: 5, priority: 'eerlijk', evenOften: true } },
  ruim: { label: 'Ruim', sub: 'De beste bezetting gaat voor; sterkere spelers mogen iets langer staan (hooguit 8 minuten verschil).', rules: { equalTime: true, marge: 8, priority: 'bezetting', evenOften: true } }
};
const presetOf = (r) => Object.keys(FAIR).find((k) => Object.entries(FAIR[k].rules).every(([key, v]) => r[key] === v)) || 'eigen';

// logo verkleinen tot 256 px zodat het licht blijft in de opslag
function readLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function Team({ state }) {
  const team = activeTeam(state);
  const r = team.rules;
  const running = currentMatch(state);
  const locked = !!(running && running.started && !running.finished && running.teamId === team.id);
  const [confirm, setConfirm] = useState(null);
  const pw = periodWord(team);
  const [more, setMore] = useState(false);
  const preset = presetOf(r);
  const preview = useMemo(() => {
    const present = team.players.filter((p) => p.active !== false).map((p) => p.id);
    const keeper = team.keeper ? suggestKeeper(team, present, {}) : null;
    const F = team.lines.A + team.lines.M + team.lines.V;
    if (present.filter((id) => id !== keeper).length < F) return null;
    const plan = createMatch(team, { present, keeperId: keeper, priority: r.priority }).plan;
    const swaps = plan.steps.filter((x) => x.type === 'swap').length;
    const f = plan.fair;
    return {
      n: present.length, swaps, ok: plan.ok,
      every: swaps ? Math.round((matchEnd(team) / (swaps + team.periods)) / 30) / 2 : 0,
      minP: mins(f.minPlayed), maxP: mins(f.maxPlayed), maxStint: mins(f.maxStint || 0),
      turns: f.minTurns === f.maxTurns ? `Iedereen ${f.minTurns}× naar de bank` : `${f.minTurns}–${f.maxTurns}× naar de bank`
    };
  }, [team]);

  const set = (fn) => update((draft) => {
    const t = activeTeam(draft);
    fn(t);
    const m = currentMatch(draft);
    if (m && !m.finished && m.teamId === t.id) {
      try { if (m.started) replan(m, t); else rebuildConcept(draft); } catch (e) { /* plan volgt bij de volgende actie */ }
    }
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
  const pickLogo = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    readLogo(file).then((url) => { set((t) => { t.logo = url; }); toast('Logo ingesteld'); }).catch(() => toast('Dit plaatje kan ik niet lezen'));
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
      <div class="row" style="gap:14px">
        <${TeamBadge} team=${team} size=${64} />
        <div class="col grow">
          <label class="label" for="tname">Naam</label>
          <input id="tname" class="input" value=${team.name} maxLength="30" onChange=${(e) => set((t) => { t.name = e.target.value.trim() || t.name; })} />
        </div>
      </div>
      <div class="row">
        <label class="btn plain grow" style="cursor:pointer">${team.logo ? 'Ander logo' : 'Logo kiezen'}<input type="file" accept="image/*" class="sr" onChange=${pickLogo} /></label>
        ${team.logo
          ? html`<button type="button" class="btn plain" onClick=${() => set((t) => { delete t.logo; })}>Weghalen</button>`
          : html`<input class="input" style="width:96px" maxLength="4" aria-label="Afkorting op het logo" placeholder="SB" value=${team.short || ''} onChange=${(e) => set((t) => { t.short = e.target.value.trim(); })} />`}
      </div>
      <span class="small">Het logo zie je als je een doelpunt invoert. Het blijft op deze telefoon.</span>
      <a class="setting" href="#/spelers" style="text-decoration:none;color:inherit">
        <div class="col" style="gap:1px"><span class="t">Spelers en beoordeling</span><span class="small">${team.players.filter((p) => p.active !== false).length} spelers · dominante rol, kracht · achter pincode</span></div>
        <span class="row"><${Icon} name="lock" size=${18} /><${Icon} name="chev" size=${18} /></span>
      </a>
    </section>

    <section class="card">
      <span class="h2">Spelvorm</span>
      ${locked && html`<span class="small" style="color:var(--ink)">Tijdens een wedstrijd kun je de spelvorm niet aanpassen.</span>`}
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
      <span class="h2">Wisselen</span>
      <span class="label">Hoe vaak gaat elk kind naar de bank?</span>
      <${Seg} label="Wisselritme" value=${[0, 1, 2].indexOf(r.turnsPerPeriod || 0) !== -1 ? (r.turnsPerPeriod || 0) : -1} onChange=${(v) => setRule('turnsPerPeriod', v)} options=${[[0, 'App kiest'], [1, '1× per ' + pw], [2, '2× per ' + pw]]} />
      <span class="small">${r.turnsPerPeriod ? `Ieder kind ${r.turnsPerPeriod}× per ${pw} op de bank; de app kiest de momenten.` : 'De app kiest het kleinste aantal wissels dat eerlijk uitkomt.'}</span>
      <span class="label">Eerlijkheid</span>
      <${Seg} label="Eerlijkheid" value=${preset} onChange=${(v) => set((t) => { Object.assign(t.rules, FAIR[v].rules); })} options=${Object.keys(FAIR).map((k) => [k, FAIR[k].label])} />
      <span class="small">${preset in FAIR ? FAIR[preset].sub : 'Eigen instellingen (zie hieronder).'}</span>
      <${Setting} title="Nieuwe opstelling na de rust" sub="Gratis moment om meerdere kinderen te wisselen"><${Switch} label="Nieuwe opstelling na de rust" on=${r.newLineupAtBreak} onChange=${(v) => setRule('newLineupAtBreak', v)} /></${Setting}>

      ${preview && html`<div class="preview">
        <span class="label">Zo ziet een wedstrijd eruit met je ${preview.n} spelers</span>
        <div class="pv-grid">
          <div><b class="num">${preview.swaps}</b><span>wissels</span></div>
          <div><b class="num">~${String(preview.every).replace('.', ',')}′</b><span>tussen wissels</span></div>
          <div><b class="num">${preview.minP === preview.maxP ? preview.minP : preview.minP + '–' + preview.maxP}′</b><span>speeltijd per kind</span></div>
          <div><b class="num">${preview.maxStint}′</b><span>langst op de bank</span></div>
        </div>
        <span class="small">${preview.turns}${!preview.ok ? ' · niet alles past precies, dit is de eerlijkste verdeling' : ''}</span>
      </div>`}

      <button type="button" class="between" style="background:none;border:none;padding:0;min-height:44px;width:100%" aria-expanded=${more ? 'true' : 'false'} onClick=${() => setMore(!more)}>
        <span class="label">Meer instellingen</span><span class=${'chev' + (more ? ' open' : '')}><${Icon} name="chev" size=${18} /></span>
      </button>
      <div class=${'collapse' + (more ? ' open' : '')}><div class="col" style="gap:6px">
        ${!r.turnsPerPeriod && html`<${Setting} title="Iedereen even vaak gewisseld"><${Switch} label="Iedereen even vaak gewisseld" on=${r.evenOften} onChange=${(v) => setRule('evenOften', v)} /></${Setting}>`}
        <${Setting} title="Gelijke speeltijd"><${Switch} label="Gelijke speeltijd" on=${r.equalTime} onChange=${(v) => setRule('equalTime', v)} /></${Setting}>
        ${r.equalTime && html`<${Setting} title="Maximaal verschil in speeltijd"><${Stepper} label="Marge" value=${r.marge} min=${1} max=${15} suffix=" min" onChange=${(v) => setRule('marge', v)} /></${Setting}>`}
        <${Setting} title="Niet te lang op de bank"><${Switch} label="Niet te lang op de bank" on=${!!r.maxBenchOn} onChange=${(v) => setRule('maxBenchOn', v)} /></${Setting}>
        ${r.maxBenchOn && html`<${Setting} title="Maximaal achter elkaar op de bank"><${Stepper} label="Maximaal op de bank" value=${r.maxBench || 10} min=${3} max=${30} suffix=" min" onChange=${(v) => setRule('maxBench', v)} /></${Setting}>`}
        <${Setting} title="Minimaal tussen wissels"><${Stepper} label="Minimaal tussen wissels" value=${r.minInterval || 2} min=${1} max=${8} suffix=" min" onChange=${(v) => setRule('minInterval', v)} /></${Setting}>
        ${r.turnsPerPeriod === 3 && html`<span class="small">Nu: 3× per ${pw}.</span>`}
        <${Setting} title="3× per ${pw} naar de bank" sub="Voor grote selecties"><${Switch} label="3 keer" on=${r.turnsPerPeriod === 3} onChange=${(v) => setRule('turnsPerPeriod', v ? 3 : 0)} /></${Setting}>
      </div></div>
    </section>

    <section class="card">
      <span class="h2">Opstelling en stand</span>
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
      <span class="h2">Overzichten</span>
      <${Setting} title="Keepertijd telt mee" sub="Uit: keepertijd telt niet als speeltijd"><${Switch} label="Keepertijd telt mee" on=${r.keeperCounts} onChange=${(v) => setRule('keeperCounts', v)} /></${Setting}>
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
