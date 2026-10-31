import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as Mail from '../worker/src/mail.js';
import worker from '../worker/src/index.js';

const MBX = 'm'.repeat(24), KEY = 'k'.repeat(32);
const FRIEND = 'https://pebble-burrow-helper.sam.workers.dev/mail/' + 'f'.repeat(24);
const STRANGER = 'https://other.workers.dev/mail/' + 's'.repeat(24);
const DOODLE = 'data:image/png;base64,iVBORw0KGgo=';

function harness() {
  const kv = new Map();
  const env = { ACCESS_KEY: KEY, MAILBOX_KEY: MBX, GITHUB_TOKEN: 'x', APP_ORIGIN: 'https://rob-turnbull.github.io',
    BURROW: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); },
      list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) } };
  globalThis.fetch = async () => { throw new Error('no network in this test'); };   // no devices subscribed, so no pushes
  return { env, kv };
}
const post = (env, body, key = MBX, origin = 'https://someone-else.github.io') => worker.fetch(new Request(`https://h.example/mail/${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }), env);
const owner = (env, method = 'GET', body) => worker.fetch(new Request('https://h.example/mailbox', { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }), env);
const card = (reply = FRIEND, extra = {}) => ({ from: { name: 'Sam', reply, burrow: "Sam's burrow" }, note: 'the pumpkins are glowing!', doodle: DOODLE, being: 'Pip', ...extra });

test('validation: needs a name, a real reply mailbox, and a small card', () => {
  assert.ok(Mail.validate(card()).card);
  assert.equal(Mail.validate(card(FRIEND, { from: { name: '', reply: FRIEND } })).status, 400);
  assert.equal(Mail.validate(card('https://evil.example/elsewhere')).status, 400);
  assert.equal(Mail.validate(card(FRIEND, { note: 'x'.repeat(141) })).status, 413);
  assert.equal(Mail.validate(card(FRIEND, { doodle: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 413);
  assert.equal(Mail.validate(card(FRIEND, { note: '', doodle: '' })).status, 400);
});

test('a new sender waits; the card is hidden until you say yes', async () => {
  const { env } = harness();
  const r = await post(env, card());
  assert.equal(r.status, 202); assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match((await r.json()).status, /waiting/);
  let mb = await (await owner(env)).json();
  assert.equal(mb.address, `https://h.example/mail/${MBX}`);
  assert.equal(mb.cards.length, 0); assert.equal(mb.requests.length, 1); assert.equal(mb.requests[0].waiting, 1);
  await owner(env, 'POST', { action: 'approve', sid: mb.requests[0].sid });
  mb = await (await owner(env)).json();
  assert.equal(mb.cards.length, 1); assert.equal(mb.cards[0].note, 'the pumpkins are glowing!'); assert.equal(mb.friends[0].name, 'Sam');
  const again = await (await post(env, card(FRIEND, { note: 'second!' }))).json();
  assert.equal(again.status, 'delivered');
  assert.equal((await (await owner(env)).json()).cards[0].note, 'second!');
});

test('saying no removes their cards and stops future ones', async () => {
  const { env } = harness();
  await post(env, card(STRANGER));
  const sid = (await (await owner(env)).json()).requests[0].sid;
  await owner(env, 'POST', { action: 'block', sid });
  assert.equal((await post(env, card(STRANGER))).status, 403);
  const mb = await (await owner(env)).json();
  assert.equal(mb.cards.length, 0); assert.equal(mb.requests.length, 0); assert.equal(mb.blocked.length, 1);
});

test('wrong mailbox key, too many cards, and owner routes need the access key', async () => {
  const { env } = harness();
  assert.equal((await post(env, card(), 'x'.repeat(24))).status, 404);
  for (let i = 0; i < 10; i++) assert.equal((await post(env, card())).status, 202);
  assert.equal((await post(env, card())).status, 429);
  assert.equal((await worker.fetch(new Request('https://h.example/mailbox'), env)).status, 401);
  const pre = await worker.fetch(new Request(`https://h.example/mail/${MBX}`, { method: 'OPTIONS' }), env);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
});

test('friends list merges across devices and removals stick', () => {
  const a = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'] }, 1), b = JSON.parse(JSON.stringify(a));
  E.setFriend(a, FRIEND, 'Sam', 10); E.setFriend(b, STRANGER, 'Jo', 11);
  E.setFriend(b, FRIEND, 'Sam', 20, true);
  const m = E.merge(a, b);
  assert.equal(m.friends.length, 2);
  assert.equal(m.friends.find(f => f.addr === FRIEND).gone, true);
});

test('doorbell: rings with its own key, keeps only a label, and the owner can read and clear', async () => {
  const Bell = await import('../worker/src/doorbell.js');
  const { env } = harness(); env.DOORBELL_KEY = 'd'.repeat(24);
  const ringUrl = q => worker.fetch(new Request(`https://h.example/ring/${'d'.repeat(24)}${q}`), env);
  assert.equal((await worker.fetch(new Request(`https://h.example/ring/${'x'.repeat(24)}?kind=text`), env)).status, 404);
  assert.equal((await ringUrl('?kind=text&from=Mom<script>')).status, 202);
  assert.equal((await ringUrl('?kind=weird')).status, 202);
  const r = await (await owner(env, 'GET').then(() => worker.fetch(new Request('https://h.example/rings', { headers: { Authorization: 'Bearer ' + KEY } }), env))).json();
  assert.equal(r.rings.length, 2); assert.equal(r.rings[1].from, 'Momscript'); assert.equal(r.rings[0].kind, 'other');
  assert.match(r.address, /\/ring\//);
  assert.equal(Bell.ringText({ kind: 'email', from: 'work' }), 'an email from work');
  await worker.fetch(new Request('https://h.example/rings', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal((await Bell.recent(env.BURROW)).length, 0);
  assert.equal((await worker.fetch(new Request('https://h.example/rings'), env)).status, 401, 'reading needs the access key');
});
