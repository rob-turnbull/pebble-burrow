// Pebble Burrow helper: gentle push nudges on a schedule, a peek page, and an MCP connector
// so an AI friend can visit. Reads and writes the same secret gist the app syncs with.
import * as E from '../../js/engine.js';
import { CHEESES, SPECIES } from '../../js/data.js';
import { GistSync } from '../../js/sync.js';
import { fetchWeather } from '../../js/weather.js';
import { sunFor, phaseAt } from '../../js/sky.js';
import { sendPush } from './webpush.js';
import { decideNudge, recordNudge, localParts, NUDGE, alertsToSend } from './nudge.js';
import { fetchAlerts, reactLine } from '../../js/alerts.js';
import * as Mail from './mail.js';

const VERSION = '3.5.0';
const UA = { 'User-Agent': 'pebble-burrow-helper' };

/* ---------------- small helpers ---------------- */
const cors = env => ({ 'Access-Control-Allow-Origin': env.APP_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
const json = (env, data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(env), ...extra } });
const text = (env, body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors(env) } });
function sameKey(a, b) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const bearer = req => (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
const kvJson = async (env, k) => { try { return JSON.parse(await env.BURROW.get(k)); } catch { return null; } };
async function hash(s) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); return [...d.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const vapid = env => ({ publicKey: env.VAPID_PUBLIC, privateJwk: env.VAPID_PRIVATE_JWK, subject: env.APP_URL || 'https://github.com/rob-turnbull/pebble-burrow' });

/* ---------------- the save ---------------- */
async function gist(env) { return new GistSync(env.GITHUB_TOKEN, await env.BURROW.get('gist:id'), UA); }

export async function loadSave(env, now = Date.now()) {
  const g = await gist(env);
  const s = E.migrate(await g.pull());
  if (g.gistId) await env.BURROW.put('gist:id', g.gistId);
  if (s) E.catchUp(s, now);
  return s;
}

/** Read, change, merge with whatever is there now, write. `fn` returns a result for the caller. */
export async function changeSave(env, fn, now = Date.now()) {
  const g = await gist(env);
  const before = E.migrate(await g.pull());
  if (!before) return { error: 'no burrow has been saved yet. open pebble burrow and turn on sync first.' };
  const s = JSON.parse(JSON.stringify(before)); E.catchUp(s, now);
  const result = fn(s, now);
  if (result?.changed) {
    const fresh = E.migrate(await g.pull());              // someone may have tended them in the meantime
    await g.push(E.merge(s, fresh));
  }
  if (g.gistId) await env.BURROW.put('gist:id', g.gistId);
  return result;
}

async function weatherFor(env, s) {
  if (!s?.place) return null;
  const key = `${s.place.lat},${s.place.lon}`;
  const cached = await kvJson(env, 'wx');
  if (cached && cached.for === key && cached.units === s.units && Date.now() - cached.fetchedAt < 30 * 60e3) return cached;
  try { const w = await fetchWeather(s.place, s.units); await env.BURROW.put('wx', JSON.stringify(w)); return w; } catch { return cached; }
}

async function peekFor(env, s, now = Date.now()) {
  const w = await weatherFor(env, s);
  const { phase } = phaseAt(now, sunFor(now, s.place, w));
  return E.peekText(s, { now, phase, weather: w });
}

/* ---------------- nudges ---------------- */
async function subs(env) {
  const out = []; let cursor;
  do { const page = await env.BURROW.list({ prefix: 'sub:', cursor }); cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) { const v = await kvJson(env, k.name); if (v) out.push({ k: k.name, ...v }); } } while (cursor);
  return out;
}
async function broadcast(env, list, n) {
  let sent = 0;
  for (const s of list) {
    try {
      const status = await sendPush(s.subscription, { title: n.title, body: n.body, tag: n.tag }, vapid(env));
      if (status === 404 || status === 410) await env.BURROW.delete(s.k);
      else if (status < 300) sent++;
    } catch { /* one bad device never blocks the others */ }
  }
  return sent;
}

/** A postcard notice for the owner's devices. Respects quiet hours; the card waits in the mailbox either way. */
export async function notifyOwner(env, title, body, tag, now = Date.now()) {
  const list = await subs(env); if (!list.length) return 0;
  let tz = '';
  try { const s = await loadSave(env, now); tz = s?.tz || ''; } catch {}
  const { hour } = localParts(now, tz);
  if (hour >= NUDGE.quietFrom || hour < NUDGE.quietTo) return 0;
  return broadcast(env, list, { title, body, tag });
}

export async function runNudges(env, now = Date.now()) {
  const list = await subs(env); if (!list.length) return { skipped: 'no devices' };
  const s = await loadSave(env, now); if (!s) return { skipped: 'no save' };
  const hist = (await kvJson(env, 'nudge:hist')) || {};
  const w = await weatherFor(env, s);
  // official weather warnings first: their own channel, no daily limit
  let warned = 0;
  if (s.place) {
    try {
      const alerts = await fetchAlerts(s.place, { ua: 'pebble-burrow-helper (github.com/rob-turnbull/pebble-burrow)' });
      const seen = (await kvJson(env, 'alerts:seen')) || {};
      for (const a of alertsToSend(alerts, seen, now, s.tz)) {
        warned += await broadcast(env, list, { title: `⚠️ ${a.event}`, body: `${E.first(s.beings[0])} says: ${reactLine(a)}`, tag: 'alert-' + a.id.slice(-12) });
        seen[a.id] = a.ends || now + 864e5;
      }
      for (const [id, until] of Object.entries(seen)) if (until < now - 864e5) delete seen[id];
      await env.BURROW.put('alerts:seen', JSON.stringify(seen));
    } catch { /* the NWS is sometimes busy */ }
  }
  const n = decideNudge(s, now, hist, w?.kind);
  if (!n) return warned ? { warned } : { skipped: 'nothing to say' };
  const sent = await broadcast(env, list, n);
  await env.BURROW.put('nudge:hist', JSON.stringify(recordNudge(hist, n, now, s.tz)));
  return { sent, warned, nudge: n.key };
}

/* ---------------- AI visitor (MCP) ---------------- */
const beingProp = { being: { type: 'string', description: 'Name, first name, or species of the being. Omit to choose whoever needs it most.' } };
export const TOOLS = [
  { name: 'peek', title: 'Peek into the burrow', description: 'See how the little beings in the Pebble Burrow are doing: mood, tummy, sparkle, joy, growth stage, the weather on their hill, and the latest feast. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'feed', title: 'Feed a being', description: 'Give one being a cheese. Wakes them first if they are napping. Your visit is signed in the feast book.',
    inputSchema: { type: 'object', properties: { ...beingProp, cheese: { type: 'string', enum: CHEESES.map(c => c.id), description: 'Which cheese. Defaults to cheddar.' } }, additionalProperties: false } },
  { name: 'hug', title: 'Hug a being', description: 'Give one awake being a hug. Raises their joy.',
    inputSchema: { type: 'object', properties: beingProp, additionalProperties: false } },
  { name: 'wake', title: 'Wake a napping being', description: 'Gently wake a napping being. They glow when they wake.',
    inputSchema: { type: 'object', properties: beingProp, additionalProperties: false } }
];

function findBeing(s, q, pick) {
  if (!q) return pick(s.beings);
  const k = q.trim().toLowerCase();
  return s.beings.find(b => b.name.toLowerCase() === k || E.first(b).toLowerCase() === k || b.sp === k || SPECIES[b.sp].label === k)
    || s.beings.find(b => b.name.toLowerCase().includes(k));
}
const roster = s => s.beings.map(b => `${b.name} (${SPECIES[b.sp].label})`).join(', ');

export async function callTool(env, name, args = {}, now = Date.now()) {
  const who = env.VISITOR_NAME || 'Claude';
  if (name === 'peek') { const s = await loadSave(env, now); return s ? await peekFor(env, s, now) : 'no burrow has been saved yet.'; }
  const r = await changeSave(env, (s, t) => {
    const signVisit = () => E.keepsake(s, 'visitor', '🤖', `${who} came to visit for the first time`, t);
    if (name === 'feed') {
      const b = findBeing(s, args.being, list => [...list].sort((x, y) => x.full - y.full)[0]);
      if (!b) return { text: `no being called "${args.being}". the burrow has ${roster(s)}.`, error: true };
      const cheese = CHEESES.find(c => c.id === (args.cheese || 'cheddar')) || CHEESES[0];
      const woke = E.wake(s, b, t, 'visitor');
      const before = Math.round(b.full);
      if (!E.feed(s, b, cheese, t, 'visitor', who)) return { text: `${E.first(b)} is too full right now (tummy ${before}). maybe a hug instead?`, changed: woke };
      signVisit(); E.checkGrowth(s, t);
      return { changed: true, text: `${woke ? `${E.first(b)} woke up glowing, then ` : ''}${E.first(b)} munched the ${cheese.id}. tummy ${before} → ${Math.round(b.full)}. the feast book now says ${who} fed them.` };
    }
    if (name === 'hug') {
      const b = findBeing(s, args.being, list => [...list].filter(x => !x.napping).sort((x, y) => x.joy - y.joy)[0]);
      if (!b) return { text: args.being ? `no being called "${args.being}". the burrow has ${roster(s)}.` : 'everyone is napping. try wake first.', error: !!args.being };
      if (b.napping) return { text: `${E.first(b)} is napping. use wake first, gently.` };
      const before = Math.round(b.joy); E.hug(s, b, t, 'visitor'); signVisit(); E.checkGrowth(s, t);
      return { changed: true, text: `smoosh. ${E.first(b)}'s joy ${before} → ${Math.round(b.joy)}.` };
    }
    if (name === 'wake') {
      const b = findBeing(s, args.being, list => list.find(x => x.napping));
      if (!b) return { text: args.being ? `no being called "${args.being}". the burrow has ${roster(s)}.` : 'nobody is napping right now.', error: !!args.being };
      if (!E.wake(s, b, t, 'visitor')) return { text: `${E.first(b)} is already awake.` };
      signVisit(); E.checkGrowth(s, t);
      return { changed: true, text: `${E.first(b)} stretched, blinked, and is glowing. they were waiting, not worrying.` };
    }
    return { text: `unknown tool ${name}`, error: true };
  }, now);
  return r.error && !r.text ? { text: r.error, error: true } : r;
}

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export async function mcp(env, msg) {
  const reply = result => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'invalid request');
  if (msg.id === undefined) return null;                                        // notifications need no answer
  switch (msg.method) {
    case 'initialize': return reply({
      protocolVersion: PROTOCOLS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'pebble-burrow', title: 'Pebble Burrow', version: VERSION },
      instructions: 'A gentle virtual-pet burrow. Use peek to see how the beings are, then feed, hug or wake them if they need it. Nothing here ever dies; napping just means waiting. Visits are signed in the feast book.' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      if (!TOOLS.some(t => t.name === name)) return fail(-32602, `unknown tool: ${name}`);
      try {
        const r = await callTool(env, name, args || {});
        const t = typeof r === 'string' ? r : r.text;
        return reply({ content: [{ type: 'text', text: t }], isError: !!r.error });
      } catch (e) { return reply({ content: [{ type: 'text', text: `the burrow couldn't be reached: ${e.message}` }], isError: true }); }
    }
    default: return fail(-32601, `method not found: ${msg.method}`);
  }
}

/* ---------------- router ---------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '') || '/';

    const mail = p.match(/^\/mail\/([^/]+)$/);
    if (mail) {
      const open = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
      if (!env.MAILBOX_KEY || !sameKey(mail[1], env.MAILBOX_KEY)) return new Response(JSON.stringify({ error: 'no mailbox here' }), { status: 404, headers: { 'Content-Type': 'application/json', ...open } });
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: open });
      if (req.method !== 'POST') return new Response('this is a pebble burrow mailbox. postcards arrive here.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...open } });
      if (+(req.headers.get('Content-Length') || 0) > 160000) return new Response(JSON.stringify({ error: 'that postcard is too big' }), { status: 413, headers: { 'Content-Type': 'application/json', ...open } });
      let body; try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'not a postcard' }), { status: 400, headers: { 'Content-Type': 'application/json', ...open } }); }
      const r = await Mail.receive(env.BURROW, body, Date.now(), (title, text, tag) => notifyOwner(env, title, text, tag));
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json', ...open } });
    }

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    const keyed = p.match(/^\/(k|peek|mcp)\/([^/]+)$/);
    if (keyed) {
      if (!sameKey(keyed[2], env.ACCESS_KEY)) return text(env, 'not found', 404);
      if (keyed[1] === 'k') return text(env, 'this is your pebble burrow helper link.\npaste it into pebble burrow → settings → nudges & AI visitor.');
      if (keyed[1] === 'peek') { const s = await loadSave(env); return text(env, s ? await peekFor(env, s) : 'no burrow has been saved yet.'); }
      if (req.method !== 'POST') return json(env, { error: 'use POST' }, 405, { Allow: 'POST' });
      let body; try { body = await req.json(); } catch { return json(env, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400); }
      if (Array.isArray(body)) { const out = (await Promise.all(body.map(m => mcp(env, m)))).filter(Boolean); return out.length ? json(env, out) : new Response(null, { status: 202, headers: cors(env) }); }
      const out = await mcp(env, body);
      return out ? json(env, out) : new Response(null, { status: 202, headers: cors(env) });
    }

    if (p === '/') return text(env, 'pebble burrow helper. nothing to see here.');
    if (!sameKey(bearer(req), env.ACCESS_KEY)) return json(env, { error: 'unauthorized' }, 401);

    if (p === '/vapid') return json(env, { publicKey: env.VAPID_PUBLIC });
    if (p === '/status') return json(env, { ok: true, version: VERSION, devices: (await subs(env)).length, last: (await kvJson(env, 'nudge:hist'))?.last || 0 });
    if (p === '/subscribe' && req.method === 'POST') {
      const { subscription, label } = await req.json();
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json(env, { error: 'bad subscription' }, 400);
      await env.BURROW.put('sub:' + await hash(subscription.endpoint), JSON.stringify({ subscription, label: String(label || '').slice(0, 80), added: Date.now() }));
      return json(env, { ok: true });
    }
    if (p === '/unsubscribe' && req.method === 'POST') {
      const { endpoint } = await req.json(); if (endpoint) await env.BURROW.delete('sub:' + await hash(endpoint));
      return json(env, { ok: true });
    }
    if (p === '/mailbox') {
      const address = env.MAILBOX_KEY ? `${url.origin}/mail/${env.MAILBOX_KEY}` : '';
      if (req.method === 'GET') return json(env, address ? await Mail.mailbox(env.BURROW, address) : { address: '', cards: [], requests: [], friends: [], blocked: [] });
      const { action, sid, id } = await req.json();
      if (action === 'delete') { await Mail.removeCard(env.BURROW, id); return json(env, { ok: true }); }
      if (['approve', 'block', 'unblock'].includes(action)) return json(env, { ok: await Mail.decide(env.BURROW, String(sid), action) });
      return json(env, { error: 'unknown action' }, 400);
    }
    if (p === '/test' && req.method === 'POST') {
      const list = await subs(env); let name = 'everyone';
      try { const s = await loadSave(env); if (s) name = E.first(s.beings[0]); } catch {}
      const sent = list.length ? await broadcast(env, list, { title: 'pebble burrow', body: `${name} says hi! nudges are working.`, tag: 'test' }) : 0;
      return json(env, { sent });
    }
    return json(env, { error: 'not found' }, 404);
  },

  async scheduled(event, env, ctx) { ctx.waitUntil(runNudges(env, event.scheduledTime || Date.now())); }
};
