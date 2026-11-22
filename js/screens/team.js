import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update, activeTeam, currentMatch, newTeam, exportData, importData } from '../store.js';
import { periodWord } from '../match.js';
import { suggestKeeper } from './home.js';
import { Seg, Switch, Setting, Stepper, Icon, Confirm, TeamBadge, Reveal, toast, STANDS, appInfo } from '../ui.js';
import { devicePrefs, setDevicePref, onDevicePrefs, osReduced } from '../motion.js';
import { PROFILES, PROFILE_ORDER, profileOf, cachedTune, rememberTune, consequences } from '../profiles.js';
import { compute } from '../compute.js';
import { scheduleRefresh } from '../refresh.js';

export const APP_VERSION = '0.24.7';

// regels die het wisselprofiel bepaalt; zet je er zelf een, dan wordt het profiel 'Eigen'
const TUNED = ['marge', 'equalTime', 'evenOften', 'maxBenchOn', 'maxBench', 'minInterval', 'turnsPerPeriod', 'priority', 'strongBias'];

// Voorbeeld bij eigen instellingen, ook in de rekendraad
function usePreview(team, present, keeper, on) {
  const sig = on ? JSON.stringify([present, keeper, team.lines, team.periods, team.periodMin, team.keeper, team.rules, team.players.map((p) => [p.id, p.kracht, p.prefs, p.main, p.flex])]) : '';
  const [pv, setPv] = useState(null);
  useEffect(() => {
    if (!on) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      let s = null;
      try { s = await compute('preview', { team, present, keeperId: keeper }); } catch (e) { s = null; }
      if (!alive) return;
      setPv(s && {
        n: present.length, swaps: s.moments, ok: s.ok, every: s.every, minP: s.minP, maxP: s.maxP, maxStint: Math.round(s.maxStint),
        turns: s.minTurns === s.maxTurns ? `Iedereen ${s.minTurns}× naar de bank` : `${s.minTurns}–${s.maxTurns}× naar de bank`
      });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [sig]);
  return on ? pv : null;
}

// Profielen doorrekenen voor de selectie, in de rekendraad. Optimistisch: tijdens het rekenen blijven de
// vorige getallen staan (iets vager); pas als je even niets aanpast begint het rekenen.
function useProfiles(team, present, keeper, current, onResult) {
  const sig = JSON.stringify([present, keeper, team.lines, team.periods, team.periodMin, team.keeper, team.type, team.rules.perMoment, team.rules.newLineupAtBreak,
    team.players.map((p) => [p.id, p.kracht, p.prefs, p.main, p.flex])]);
  const known = () => { const o = {}; for (const k of PROFILE_ORDER) { const c = cachedTune(team, k, present, keeper); if (c !== undefined) o[k] = c; } return o; };
  const [res, setRes] = useState(known);
  const [busy, setBusy] = useState(false);
  const cb = useRef(onResult);
  cb.current = onResult;
  useEffect(() => {
    let alive = true;
    const have = known();
    const todo = PROFILE_ORDER.filter((k) => !(k in have)).sort((a, b) => (b === current) - (a === current));
    if (!todo.length) { setRes(have); setBusy(false); return undefined; }
    setBusy(true);
    const t = setTimeout(async () => {
      const out = { ...have };
      for (const k of todo) {
        let r = null;
        try { r = await compute('tune', { team, key: k, present, keeperId: keeper }); } catch (e) { r = null; }
        if (!alive) return;
        rememberTune(team, k, present, keeper, r);
        out[k] = r;
        if (cb.current) cb.current(k, r);
      }
      setRes(out);
      setBusy(false);
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [sig]);
  return [res, busy];
}

function ProfileCard({ k, on, r, ref0, n, onPick, stale }) {
  const P = PROFILES[k];
  const s = r && r.stats;
  const pp = s ? (s.minP === s.maxP ? s.minP + ' min' : s.minP + '–' + s.maxP + ' min') : '';
  return html`<div class=${'prof' + (on ? ' on' : '')}>
    <button type="button" class="prof-btn" role="radio" aria-checked=${on ? 'true' : 'false'} onClick=${onPick}>
      <span class="prof-radio" aria-hidden="true"></span>
      <span class="prof-txt">
        <span class="prof-title">${P.label}<span class="prof-tag">${P.tag}</span></span>
        <span class="prof-sub">${P.sub}</span>
        <span class=${'prof-mini' + (s ? (stale ? ' stale' : '') : ' wait')}>${s ? `${s.moments} wissels · ${pp} p.p. · max ${Math.round(s.maxStint)}′ bank` : 'rekent het door…'}</span>
      </span>
    </button>
    <${Reveal} open=${on}><div class="prof-more">
      <span class="label">Wat de app doet</span>
      <p class="prof-does">${P.does}</p>
      ${s && html`<span class="label">Gevolgen voor je ${n} spelers${stale ? html` <span class="prof-upd">wordt bijgewerkt…</span>` : ''}</span>
        <ul class=${"prof-cons" + (stale ? " stale" : "")}>${consequences(k, s, ref0).map((c) => html`<li class=${c.warn ? 'warn' : ''}>${c.t}</li>`)}</ul>`}
    </div></${Reveal}>
  </div>`;
}

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
  const [dev, setDev] = useState(devicePrefs());
  useEffect(() => onDevicePrefs((p) => setDev({ ...p })), []);
  const prof = profileOf(r);
  const squad = team.players.filter((p) => p.active !== false).map((p) => p.id);
  const squadKeeper = team.keeper ? suggestKeeper(team, squad, {}) : null;
  // komt het profiel voor de selectie anders uit dan de teamregels (bijv. na een nieuwe speler), dan volgen die
  const syncRules = (k, r) => {
    if (!r || k !== profileOf(activeTeam().rules)) return;
    const cur = activeTeam().rules;
    if (Object.keys(r.rules).every((x) => cur[x] === r.rules[x])) return;
    update((d) => { const t = activeTeam(d); Object.assign(t.rules, r.rules); });
    scheduleRefresh({ force: true });
  };
  const [profs, profBusy] = useProfiles(team, squad, squadKeeper, prof, syncRules);
  const preview = usePreview(team, squad, squadKeeper, prof === 'eigen');
  // optimistisch: de instelling staat meteen op het scherm; het plan rekent de app daarna op de achtergrond uit
  const set = (fn, changes) => {
    update((draft) => {
      const t = activeTeam(draft);
      fn(t);
      const m = currentMatch(draft);
      if (m && !m.finished && m.teamId === t.id && changes && changes.priority) m.priority = changes.priority;
    });
    scheduleRefresh({ force: true });
  };
  // zelf een regel zetten die het profiel bepaalt: profiel wordt 'Eigen'
  const setRule = (k, v) => set((t) => { t.rules[k] = v; if (TUNED.indexOf(k) !== -1) t.rules.profile = 'eigen'; });
  const pickProfile = (k) => {
    if (k === prof) return;
    // al uitgerekend? dan die regels; anders de standaardvariant (de rekendraad stelt hem zo nodig bij)
    const tr = profs[k];
    const rules = tr ? tr.rules : { evenOften: true, equalTime: true, turnsPerPeriod: 0, ...PROFILES[k].variants[1 % PROFILES[k].variants.length] };
    set((t) => { Object.assign(t.rules, rules, { profile: k }); if (!('strongBias' in rules)) delete t.rules.strongBias; }, { priority: rules.priority || 'eerlijk' });
  };
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
    update((d) => { d.lastBackupAt = Date.now(); });
  };
  // wanneer was de laatste back-up (alles staat alleen op deze telefoon)
  const bk = state.lastBackupAt ? Math.floor((Date.now() - state.lastBackupAt) / 864e5) : null;
  const bkText = bk == null ? 'Nog nooit een back-up gemaakt' : bk === 0 ? 'Laatste back-up: vandaag' : bk === 1 ? 'Laatste back-up: gisteren' : `Laatste back-up: ${bk} dagen geleden`;
  const bkWarn = (bk == null || bk > 14) && state.matches.some((m) => m.finished);
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
        <${Seg} label="Veld of zaal" value=${team.type} onChange=${(v) => set((t) => { t.type = v; const f = t.lines.A + t.lines.M + t.lines.V; t.rules.perMoment = v === 'zaal' ? Math.min(5, f) : 1; })} options=${[['veld', 'Veld'], ['zaal', 'Zaal']]} />
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
      <span class="label">Nieuwe wedstrijd begint met</span>
      <${Seg} label="Nieuwe wedstrijd begint met" value=${r.planMode === 'eigen' ? 'eigen' : 'app'} onChange=${(v) => setRule('planMode', v)} options=${[['app', 'Autopilot'], ['eigen', 'Game plan']]} />
      <span class="small">${r.planMode === 'eigen'
        ? 'Je legt per wedstrijd zelf de puzzel op het liniebord: startopstelling, dan wie waar speelt per blok. De app rekent mee en kan een voorzet doen.'
        : 'De app maakt het plan volgens de instellingen hieronder. Per wedstrijd kun je ook een game plan maken.'}</span>
      <span class="sub">Kies hoe je wilt wisselen. De app rekent het door voor je ${squad.length} spelers, en per wedstrijd opnieuw met wie er is.</span>
      <div class="profiles" role="radiogroup" aria-label="Wisselprofiel">
        ${PROFILE_ORDER.map((k) => html`<${ProfileCard} key=${k} k=${k} on=${prof === k} r=${profs[k]} stale=${profBusy} ref0=${profs.balans && profs.balans.stats} n=${squad.length} onPick=${() => pickProfile(k)} />`)}
      </div>
      <${Reveal} open=${prof === 'eigen'}><div class="prof-eigen"><span><b>Eigen instellingen</b> · je hebt zelf regels gezet</span><button type="button" class="link" onClick=${() => pickProfile('balans')}>Terug naar In balans</button></div></${Reveal}>
      <${Setting} title="Nieuwe opstelling na de rust" sub="Gratis moment om meerdere kinderen te wisselen"><${Switch} label="Nieuwe opstelling na de rust" on=${r.newLineupAtBreak} onChange=${(v) => setRule('newLineupAtBreak', v)} /></${Setting}>

      <button type="button" class="between" style="background:none;border:none;padding:0;min-height:44px;width:100%" aria-expanded=${more ? 'true' : 'false'} onClick=${() => setMore(!more)}>
        <span class="label">Eigen instellingen</span><span class=${'chev' + (more ? ' open' : '')}><${Icon} name="chev" size=${18} /></span>
      </button>
      <${Reveal} open=${more}><div class="col" style="gap:6px">
        <span class="small">Hier zet je de regels zelf. Pas je iets aan dat het profiel bepaalt, dan heet je keuze 'Eigen'.</span>
        <span class="label">Hoeveel spelers tegelijk wisselen?</span>
        <${Seg} label="Spelers per wissel" value=${Math.max(1, Math.min(5, r.perMoment || 1))} onChange=${(v) => setRule('perMoment', v)} options=${[1, 2, 3, 4, 5].map((n) => [n, String(n)])} />
        <span class="small">${(r.perMoment || 1) > 1 ? `Per wisselmoment gaan er ${r.perMoment} kinderen tegelijk naar de bank (of minder als de bank kleiner is).` : 'Telkens één kind tegelijk.'}${team.type === 'zaal' && (r.perMoment || 1) < Math.min(5, F) ? html` <button type="button" class="link" onClick=${() => setRule('perMoment', Math.min(5, F))}>Hele veldploeg (${Math.min(5, F)})</button>` : ''}</span>
        <span class="label">Hoe vaak gaat elk kind naar de bank?</span>
        <${Seg} label="Wisselritme" value=${[0, 1, 2].indexOf(r.turnsPerPeriod || 0) !== -1 ? (r.turnsPerPeriod || 0) : -1} onChange=${(v) => setRule('turnsPerPeriod', v)} options=${[[0, 'App kiest'], [1, '1× per ' + pw], [2, '2× per ' + pw]]} />
        <span class="label">Voorrang</span>
        <${Seg} label="Voorrang" value=${r.priority === 'bezetting' ? 'bezetting' : 'eerlijk'} onChange=${(v) => setRule('priority', v)} options=${[['eerlijk', 'Eerlijkheid'], ['bezetting', 'Beste bezetting']]} />
        <${Reveal} open=${!r.turnsPerPeriod}><${Setting} title="Iedereen even vaak gewisseld"><${Switch} label="Iedereen even vaak gewisseld" on=${r.evenOften} onChange=${(v) => setRule('evenOften', v)} /></${Setting}></${Reveal}>
        <${Setting} title="Gelijke speeltijd"><${Switch} label="Gelijke speeltijd" on=${r.equalTime} onChange=${(v) => setRule('equalTime', v)} /></${Setting}>
        <${Reveal} open=${!!r.equalTime}><${Setting} title="Maximaal verschil in speeltijd"><${Stepper} label="Marge" value=${r.marge} min=${1} max=${15} suffix=" min" onChange=${(v) => setRule('marge', v)} /></${Setting}></${Reveal}>
        <${Setting} title="Niet te lang op de bank"><${Switch} label="Niet te lang op de bank" on=${!!r.maxBenchOn} onChange=${(v) => setRule('maxBenchOn', v)} /></${Setting}>
        <${Reveal} open=${!!r.maxBenchOn}><${Setting} title="Maximaal achter elkaar op de bank"><${Stepper} label="Maximaal op de bank" value=${r.maxBench || 10} min=${3} max=${30} suffix=" min" onChange=${(v) => setRule('maxBench', v)} /></${Setting}></${Reveal}>
        <${Setting} title="Minimaal tussen wissels"><${Stepper} label="Minimaal tussen wissels" value=${r.minInterval || 2} min=${1} max=${8} suffix=" min" onChange=${(v) => setRule('minInterval', v)} /></${Setting}>
        <${Reveal} open=${r.turnsPerPeriod === 3}><span class="small">Nu: 3× per ${pw}.</span></${Reveal}>
        <${Setting} title="3× per ${pw} naar de bank" sub="Voor grote selecties"><${Switch} label="3 keer" on=${r.turnsPerPeriod === 3} onChange=${(v) => setRule('turnsPerPeriod', v ? 3 : 0)} /></${Setting}>
        ${preview && html`<div class="preview">
          <span class="label">Zo ziet een wedstrijd eruit met je ${preview.n} spelers</span>
          <div class="pv-grid">
            <div><b class="num">${preview.swaps}</b><span>${(r.perMoment || 1) > 1 ? 'wisselmomenten' : 'wissels'}</span></div>
            <div><b class="num">~${String(preview.every).replace('.', ',')}′</b><span>tussen wissels</span></div>
            <div><b class="num">${preview.minP === preview.maxP ? preview.minP : preview.minP + '–' + preview.maxP}′</b><span>speeltijd per kind</span></div>
            <div><b class="num">${preview.maxStint}′</b><span>langst op de bank</span></div>
          </div>
          <span class="small">${preview.turns}${!preview.ok ? ' · niet alles past precies, dit is de eerlijkste verdeling' : ''}</span>
        </div>`}
      </div></${Reveal}>
    </section>

    <section class="card">
      <span class="h2">Opstelling en stand</span>
      <${Setting} title="Opstelling volgt de stand" sub="Past de stand automatisch aan bij een goal"><${Switch} label="Opstelling volgt de stand" on=${r.autoStand} onChange=${(v) => setRule('autoStand', v)} /></${Setting}>
      <${Reveal} open=${!!r.autoStand}><div class="col" style="gap:10px">
        <span class="label">Bij achterstand</span>
        <${Seg} label="Bij achterstand" value=${r.standAchter} onChange=${(v) => setRule('standAchter', v)} options=${STANDS} />
        <span class="label">Bij gelijke stand</span>
        <${Seg} label="Bij gelijke stand" value=${r.standGelijk} onChange=${(v) => setRule('standGelijk', v)} options=${STANDS} />
        <span class="label">Bij voorsprong</span>
        <${Seg} label="Bij voorsprong" value=${r.standVoor} onChange=${(v) => setRule('standVoor', v)} options=${STANDS} />
      </div></${Reveal}>
      <span class="small">Verdedigen: sterkere wissels achterin. Aanvallen: sterkere wissels voorin. Het midden blijft altijd sterk.</span>
    </section>

    <section class="card">
      <span class="h2">Overzichten</span>
      <${Setting} title="Keepertijd telt mee" sub="Uit: keepertijd telt niet als speeltijd"><${Switch} label="Keepertijd telt mee" on=${r.keeperCounts} onChange=${(v) => setRule('keeperCounts', v)} /></${Setting}>
    </section>

    <section class="card">
      <span class="h2">Deze telefoon</span>
      <${Setting} title="Tikje bij tikken" sub="Voel een tikje bij knoppen en keuzes. iPhone vanaf iOS 18 en Android."><${Switch} label="Tikje bij tikken" on=${!!dev.haptics} onChange=${(v) => setDevicePref('haptics', v)} /></${Setting}>
      <${Setting} title="Klikgeluid bij schuiven" sub="Zacht klikje als je door de wissels scrolt of een schuif versleept. De iPhone geeft daar geen tikje; Android trilt."><${Switch} label="Klikgeluid bij schuiven" on=${dev.clicks !== false} onChange=${(v) => setDevicePref('clicks', v)} /></${Setting}>
      <${Setting} title="Minder beweging" sub=${osReduced() ? 'Staat aan via Beperk beweging op je telefoon.' : 'Rustiger beeld: geen veren, wiebels en zwevers.'}><${Switch} label="Minder beweging" on=${!!dev.calm || osReduced()} disabled=${osReduced()} onChange=${(v) => setDevicePref('calm', v)} /></${Setting}>
    </section>

    <section class="card">
      <span class="h2">Gegevens</span>
      <span class="small">Alles staat nu alleen op deze telefoon. Maak af en toe een back-up, bijvoorbeeld naar je bestanden of mail.</span>
      <span class=${'bk-when' + (bkWarn ? ' warn' : '')}>${bkText}</span>
      <button type="button" class="btn plain block" onClick=${download}>Back-up maken</button>
      <label class="btn plain block" style="cursor:pointer">Back-up terugzetten<input type="file" accept="application/json,.json" class="sr" onChange=${upload} /></label>
      ${state.teams.length > 1 && html`<button type="button" class="btn danger block" onClick=${() => setConfirm({ title: 'Team ' + team.name + ' verwijderen?', text: 'De spelers en wedstrijden van dit team worden ook verwijderd.', yes: 'Verwijderen', danger: true, run: () => update((d) => {
        d.matches = d.matches.filter((m) => m.teamId !== team.id);
        d.teams = d.teams.filter((t) => t.id !== team.id);
        d.activeTeamId = d.teams[0].id;
        if (d.currentMatchId && !d.matches.some((m) => m.id === d.currentMatchId)) d.currentMatchId = null;
      }) })}>Team verwijderen</button>`}
    </section>

    <footer class="appver">
      <span class="appver-n"><b>SpaBo Coach</b> · versie ${APP_VERSION}</span>
      ${appInfo.updateReady
        ? html`<button type="button" class="link" onClick=${() => location.reload()}>Nieuwe versie klaar · Vernieuwen</button>`
        : html`<span class="small">Nieuwe versies komen vanzelf binnen.</span>`}
    </footer>

    ${confirm && html`<${Confirm} title=${confirm.title} text=${confirm.text} yes=${confirm.yes} danger=${confirm.danger} onYes=${confirm.run} onClose=${() => setConfirm(null)} />`}
  </main>`;
}
