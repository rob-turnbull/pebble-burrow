import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, hkdfSync, webcrypto } from 'node:crypto';
import * as E from '../js/engine.js';
import { decideNudge, recordNudge } from '../worker/src/nudge.js';
import { encryptPayload, generateVapid, vapidHeader, b64u, sendPush } from '../worker/src/webpush.js';
import worker, { callTool, runNudges } from '../worker/src/index.js';

const H = 36e5, M = 60e3;
// 2026-10-30 noon in Los Angeles (UTC-7)
const NOON = Date.UTC(2026, 9, 30, 19);
const burrow = (now = NOON - 30 * H) => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, now);

/* ---------------- nudges ---------------- */
test('quiet hours: never between 10pm and 7am local', () => {
  const s = burrow(); s.beings[0].napping = true;
  assert.equal(decideNudge(s, Date.UTC(2026, 9, 31, 6)), null);   // 11pm PDT
  assert.equal(decideNudge(s, Date.UTC(2026, 9, 30, 13)), null);  // 6am PDT
  assert.ok(decideNudge(s, Date.UTC(2026, 9, 30, 15)));           // 8am PDT
});

test('at most 4 a day, at least 2 hours apart, and not while tending', () => {
  const s = burrow(); s.beings.forEach(b => b.napping = true);
  let hist = {}, sent = 0;
  for (let t = Date.UTC(2026, 9, 30, 14); t < Date.UTC(2026, 9, 31, 5); t += 30 * M) {
    const n = decideNudge(s, t, hist); if (n) { sent++; hist = recordNudge(hist, n, t, s.tz); }
  }
  assert.ok(sent <= 4, `sent ${sent}`);
  const s2 = burrow(); s2.beings[0].napping = true; s2.updatedAt = NOON - 10 * M;
  assert.equal(decideNudge(s2, NOON), null);
});

test('each reason respects its own gap; napping beats peckish', () => {
  const s = burrow(); s.beings[0].napping = true; s.beings[1].full = 20; s.beings[1].statsAt = s.beings[1].tick = NOON;
  const n1 = decideNudge(s, NOON); assert.match(n1.key, /^nap:/);
  const h = recordNudge({}, n1, NOON, s.tz);
  const n2 = decideNudge(s, NOON + 3 * H, h); assert.match(n2.key, /^(hungry|miss):/);
});

test('birthday and halloween mornings', () => {
  const s = burrow(); s.bday = { d: 31, m: 10 };
  const n = decideNudge(s, Date.UTC(2026, 9, 31, 16)); // 9am PDT Oct 31
  assert.match(n.key, /^bday:/);
  const h = recordNudge({}, n, Date.UTC(2026, 9, 31, 16), s.tz);
  assert.match(decideNudge(s, Date.UTC(2026, 9, 31, 19), h).key, /^halloween:/);
});

/* ---------------- web push crypto ---------------- */
async function browserSub() {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  return { ua, auth, sub: { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) } } };
}
function decrypt(body, ua, auth) {            // independent RFC 8291 decrypt using node:crypto
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2, 'last-record padding delimiter');
  return pt.subarray(0, pt.length - 1).toString();
}

test('push payloads decrypt with an independent RFC 8291 implementation', async () => {
  const { ua, auth, sub } = await browserSub();
  const body = await encryptPayload(sub, new TextEncoder().encode('{"title":"hi 🧀"}'));
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  assert.equal(decrypt(Buffer.from(body), ua, auth), '{"title":"hi 🧀"}');
});

test('VAPID header verifies against the public key and targets the push origin', async () => {
  const v = await generateVapid();
  const h = await vapidHeader('https://web.push.apple.com/abc', v.publicKey, v.privateJwk, 'https://example.com');
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, v.publicKey);
  const [hd, cl, sig] = jwt.split('.');
  assert.equal(JSON.parse(atob(cl.replace(/-/g, '+').replace(/_/g, '/'))).aud, 'https://web.push.apple.com');
  const key = await webcrypto.subtle.importKey('raw', b64u.dec(v.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64u.dec(sig), new TextEncoder().encode(`${hd}.${cl}`)));
});

/* ---------------- the worker end to end, with GitHub and push mocked ---------------- */
function harness(save) {
  const kv = new Map(), gist = { content: save ? JSON.stringify(save) : null }, pushes = [];
  const env = {
    ACCESS_KEY: 'k'.repeat(32), GITHUB_TOKEN: 'github_pat_x', VISITOR_NAME: 'Claude', APP_URL: 'https://example.com/',
    BURROW: {
      get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); },
      list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true })
    }
  };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET';
    const res = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('https://api.github.com/gists?')) return res(200, gist.content ? [{ id: 'g1', files: { 'pebble-burrow.json': {} } }] : []);
    if (u === 'https://api.github.com/gists/g1' && m === 'GET') return res(200, { files: { 'pebble-burrow.json': { content: gist.content, truncated: false } } });
    if (u === 'https://api.github.com/gists/g1' && m === 'PATCH') { gist.content = JSON.parse(opts.body).files['pebble-burrow.json'].content; return res(200, { id: 'g1' }); }
    if (u.startsWith('https://push.example.com/')) { pushes.push({ url: u, headers: opts.headers }); return new Response(null, { status: u.endsWith('gone') ? 410 : 201 }); }
    throw new Error('unexpected fetch ' + u);
  };
  return { env, kv, gist, pushes, saved: () => JSON.parse(gist.content) };
}
const rpc = (env, body, key = 'k'.repeat(32)) => worker.fetch(new Request(`https://h.example/mcp/${key}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), env);

test('MCP: initialize, list tools, and reject a wrong key', async () => {
  const { env } = harness(burrow());
  const init = await (await rpc(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
  assert.equal(init.result.protocolVersion, '2025-06-18'); assert.equal(init.result.serverInfo.name, 'pebble-burrow');
  const note = await rpc(env, { jsonrpc: '2.0', method: 'notifications/initialized' }); assert.equal(note.status, 202);
  const list = await (await rpc(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assert.deepEqual(list.result.tools.map(t => t.name), ['peek', 'feed', 'hug', 'wake']);
  assert.equal((await rpc(env, { jsonrpc: '2.0', id: 3, method: 'tools/list' }, 'x'.repeat(32))).status, 404);
});

test('MCP: feed wakes a napping being, signs the feast book, and merges into the gist', async () => {
  const s = burrow(); s.beings[0].napping = true; s.beings[0].full = 0;
  const h = harness(s);
  const r = await (await rpc(h.env, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'feed', arguments: { being: E.first(s.beings[0]), cheese: 'brie' } } })).json();
  assert.equal(r.result.isError, false, r.result.content[0].text);
  assert.match(r.result.content[0].text, /woke up glowing/);
  const after = h.saved();
  assert.equal(after.beings[0].napping, false);
  assert.equal(after.log[0].by, 'Claude'); assert.equal(after.log[0].c, 'brie');
  assert.equal(E.count(after.beings[0], 'feasts'), 1);
  assert.ok(after.album.some(k => k.k === 'visitor'));
});

test('MCP: hug refuses a napping being and unknown names list the roster', async () => {
  const s = burrow(); s.beings[1].napping = true;
  const { env } = harness(s);
  const t1 = await callTool(env, 'hug', { being: E.first(s.beings[1]) });
  assert.match(t1.text, /napping/);
  const t2 = await callTool(env, 'feed', { being: 'gerald' });
  assert.equal(t2.error, true); assert.match(t2.text, /ember kit/);
  const peek = await callTool(env, 'peek');
  assert.match(peek, /Rob's burrow/);
});

test('scheduled nudge reaches devices and forgets ones that are gone', async () => {
  const s = burrow(); s.beings[0].napping = true;
  const h = harness(s);
  const v = await generateVapid(); Object.assign(h.env, { VAPID_PUBLIC: v.publicKey, VAPID_PRIVATE_JWK: v.privateJwk });
  const ok = await browserSub(), gone = await browserSub();
  gone.sub.endpoint = 'https://push.example.com/gone';
  const auth = { Authorization: 'Bearer ' + 'k'.repeat(32), 'Content-Type': 'application/json' };
  for (const x of [ok, gone]) assert.equal((await worker.fetch(new Request('https://h.example/subscribe', { method: 'POST', headers: auth, body: JSON.stringify({ subscription: x.sub }) }), h.env)).status, 200);
  const r = await runNudges(h.env, NOON);
  assert.equal(r.sent, 1); assert.match(r.nudge, /^nap:/);
  assert.equal([...h.kv.keys()].filter(k => k.startsWith('sub:')).length, 1);
  assert.match(h.pushes[0].headers.Authorization, /^vapid t=/);
  assert.equal(h.pushes[0].headers['Content-Encoding'], 'aes128gcm');
  const again = await runNudges(h.env, NOON + 30 * M);
  assert.equal(again.skipped, 'nothing to say');
});
