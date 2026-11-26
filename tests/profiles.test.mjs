// Wisselprofielen: elk profiel levert een geldig plan dat bij zijn doel past.
import assert from 'node:assert';
import { newTeam } from '../js/store.js';
import { tune, PROFILE_ORDER, profileOf, matchRules } from '../js/profiles.js';
import { createMatch } from '../js/match.js';

const t = newTeam();
const ids = t.players.map((p) => p.id);
for (const n of [9, 8, 7]) {
  const present = ids.slice(0, n);
  const r = {};
  for (const k of PROFILE_ORDER) {
    r[k] = tune(t, k, present, present[0]);
    assert.ok(r[k] && r[k].stats.ok, `${k} met ${n} spelers geeft een geldig plan`);
    // Sterkste ploeg: dragende spelers mogen één keer minder naar de bank
    assert.ok(r[k].stats.maxTurns - r[k].stats.minTurns <= (k === 'sterk' ? 1 : 0), `${k}: iedereen even vaak naar de bank`);
    assert.ok(r[k].stats.every >= 2.5, `${k}: niet elke paar minuten een wissel`);
  }
  assert.ok(r.gelijk.stats.spread <= r.balans.stats.spread + 0.01, 'Iedereen even lang verschilt niet meer dan In balans');
  assert.ok(r.rustig.stats.moments <= r.balans.stats.moments, 'Rustig wisselen heeft niet meer wissels dan In balans');
  assert.ok(r.sterk.stats.strength >= r.balans.stats.strength - 0.01, 'Sterkste ploeg zet minstens zo sterk neer');
  assert.ok(r.sterk.stats.spread <= 10 + 0.01, 'Sterkste ploeg blijft binnen 10 minuten verschil');
  console.log(`${n} spelers: ` + PROFILE_ORDER.map((k) => `${k} ${r[k].stats.moments}× ${r[k].stats.minP}-${r[k].stats.maxP}′`).join(' · '));
}
// standaardregels = In balans; profiel wordt per wedstrijd afgestemd en de wedstrijd gebruikt die regels
assert.strictEqual(profileOf(t.rules), 'balans');
const present = ids.slice(0, 9);
const rules = matchRules(t, present, present[0]);
const m = createMatch(t, { present, keeperId: present[0], rules });
assert.deepStrictEqual(m.rules, rules);
assert.ok(m.plan.ok);
console.log('Profieltest geslaagd');
