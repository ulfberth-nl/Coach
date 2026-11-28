// Run: node tests/demo.test.mjs  (demoteam: verse installatie, plan, herstellen, weghalen, terugzetten)
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const store = await import('../js/store.js');
const M = await import('../js/match.js');
const { suggestKeeper } = await import('../js/screens/home.js').catch(() => ({ suggestKeeper: null }));

// verse installatie begint met het demoteam
{
  const s = store.getState();
  assert.equal(s.teams.length, 1);
  assert.ok(s.teams[0].demo, 'eerste team is het demoteam');
  assert.equal(s.teams[0].name, store.DEMO_NAME);
  assert.equal(s.teams[0].players.length, 9);
}

// het demoteam heeft een keeper, en per linie genoeg spelers voor 2-1-2
const team = store.demoTeam();
const ids = team.players.map((p) => p.id);
{
  const by = (l) => team.players.filter((p) => p.main === l).length;
  assert.equal(by('K'), 1);
  assert.ok(by('A') >= team.lines.A && by('M') >= team.lines.M && by('V') >= team.lines.V, 'genoeg spelers per linie');
  assert.ok(team.players.every((p) => p.kracht >= 60), 'geen lage cijfers voor internationals');
  assert.ok(team.players.every((p) => p.kracht % 12.5 === 0), 'kracht altijd op een van de 9 niveaus (label en groene kleur kloppen)');
  if (suggestKeeper) assert.equal(suggestKeeper(team, ids, {}), 'nl-pirmin', 'Pirmin wordt als keeper voorgesteld');
  const m = M.createMatch(team, { opponent: 'België', present: ids, keeperId: 'nl-pirmin' });
  assert.ok(m.plan && m.plan.steps.length, 'Autopilot maakt een plan');
  assert.equal(Object.keys(m.events[0].pos).length, team.lines.A + team.lines.M + team.lines.V);
}

// herstellen, weghalen en terugzetten
{
  const d = { teams: [store.demoTeam(), store.newTeam('Mijn team', false)], matches: [], currentMatchId: null };
  const demo = d.teams[0];
  d.activeTeamId = demo.id;
  d.teams[0].players[0].name = 'Anders';
  d.teams[0].periods = 4;
  d.matches.push({ id: 'm1', teamId: demo.id }, { id: 'm2', teamId: d.teams[1].id });
  d.currentMatchId = 'm1';
  store.resetDemo(d, demo.id);
  assert.equal(d.teams[0].id, demo.id, 'zelfde team');
  assert.equal(d.teams[0].players[0].name, 'Pirmin');
  assert.equal(d.teams[0].periods, store.newTeam('x', false).periods);
  assert.deepEqual(d.matches.map((m) => m.id), ['m2'], 'oefenwedstrijden weg, eigen wedstrijden blijven');
  assert.equal(d.currentMatchId, null);

  store.dropTeam(d, demo.id);
  assert.equal(d.teams.length, 1);
  assert.equal(d.activeTeamId, d.teams[0].id, 'naar het eigen team');
  store.addDemo(d);
  assert.equal(d.teams.length, 2);
  assert.ok(d.teams.find((t) => t.id === d.activeTeamId).demo, 'demoteam terug en actief');
  store.addDemo(d);
  assert.equal(d.teams.length, 2, 'niet dubbel');
}

console.log('Demoteamtest geslaagd');
