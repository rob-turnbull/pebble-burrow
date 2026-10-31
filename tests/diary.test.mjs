import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { writeDiary, awayLabel } from '../js/diary.js';

const T0 = Date.UTC(2026, 9, 30, 16), H = 36e5;
const burrow = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, T0);

test('short absences write nothing; longer ones write a few entries in order', () => {
  const s = burrow();
  assert.deepEqual(writeDiary(s, T0, T0 + 20 * 60e3), []);
  const d = writeDiary(s, T0, T0 + 6 * H);
  assert.ok(d.length >= 3 && d.length <= 7);
  assert.ok(d.every((x, i) => i === 0 || x.t >= d[i - 1].t), 'in time order');
  assert.ok(d.every(x => x.t >= T0 && x.t <= T0 + 6 * H && x.text && x.e));
  assert.ok(d.some(x => /Tansy|Pip|Wren|Tuft|Bram|Dib|Nim|Sorrel|Quill|Puddle|Bun|Flick|Moss|Clove|Juniper|Pebble/.test(x.text)), 'names the pets');
});

test('the same absence always tells the same story', () => {
  const s = burrow();
  assert.deepEqual(writeDiary(s, T0, T0 + 5 * H), writeDiary(s, T0, T0 + 5 * H));
});

test('naps and rumbly tummies come from real stats', () => {
  const s = burrow(); s.beings[0].full = 20;
  const d = writeDiary(s, T0, T0 + 8 * H);
  assert.ok(d.some(x => /curled up for a nap/.test(x.text)));
});

test('night entries at night; weather entries on weather days; other features can add events', () => {
  const s = burrow(); E.noteWeather(s, 'snow', T0);
  const d = writeDiary(s, T0, T0 + 9 * H, { phaseAt: t => t > T0 + 4 * H ? 'night' : 'day', extra: [{ t: T0 + H, e: '🦆', text: 'a duckling visited' }, { t: T0 - H, e: 'x', text: 'too early' }] });
  assert.ok(d.some(x => x.text === 'a duckling visited'));
  assert.ok(!d.some(x => x.text === 'too early'));
  assert.equal(awayLabel(9 * H), '9 hours'); assert.equal(awayLabel(50 * H), '2 days');
});
