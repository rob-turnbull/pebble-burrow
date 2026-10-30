// Postcards between burrows. Anyone with your *mailbox* address can knock; only approved friends get in.
// Your mailbox key is separate from your access key, so sharing it never exposes your burrow.
export const LIMITS = { name: 40, note: 140, doodle: 60000, perSenderPerDay: 10, keep: 200 };
const DOODLE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const ADDRESS = /^https:\/\/[^\s/]+\/mail\/[A-Za-z0-9_-]{16,}$/;

export const isAddress = a => ADDRESS.test(String(a || '').trim());

async function sha(s) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); return [...d.slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const kvJson = async (kv, k) => { try { return JSON.parse(await kv.get(k)); } catch { return null; } };
const day = now => new Date(now).toISOString().slice(0, 10);

async function list(kv, prefix) {
  const out = []; let cursor;
  do { const p = await kv.list({ prefix, cursor }); cursor = p.list_complete ? null : p.cursor;
    for (const k of p.keys) { const v = await kvJson(kv, k.name); if (v) out.push(v); } } while (cursor);
  return out;
}

/** Validate an incoming postcard. Returns {card} or {error, status}. */
export function validate(body) {
  const from = body?.from || {};
  const name = String(from.name || '').trim().slice(0, LIMITS.name);
  const reply = String(from.reply || '').trim();
  const note = String(body?.note || '').trim();
  const doodle = body?.doodle ? String(body.doodle) : '';
  const being = String(body?.being || '').trim().slice(0, 40);
  if (!name) return { error: 'a postcard needs a sender name', status: 400 };
  if (!isAddress(reply)) return { error: 'a postcard needs the sender’s own mailbox address', status: 400 };
  if (!note && !doodle) return { error: 'a postcard needs a note or a doodle', status: 400 };
  if (note.length > LIMITS.note) return { error: `notes are ${LIMITS.note} characters at most`, status: 413 };
  if (doodle && (!DOODLE.test(doodle) || doodle.length > LIMITS.doodle)) return { error: 'the doodle must be a small PNG', status: 413 };
  return { card: { from: { name, reply, burrow: String(from.burrow || '').slice(0, 60) }, note, doodle, being } };
}

/**
 * Receive a postcard. `notify(title, body)` is called for the owner (approved card or a new request).
 * Returns {status, body} for the HTTP response.
 */
export async function receive(kv, body, now = Date.now(), notify = async () => {}) {
  const v = validate(body); if (v.error) return { status: v.status, body: { error: v.error } };
  const sid = await sha(v.card.from.reply);
  const friend = (await kvJson(kv, 'friend:' + sid)) || { sid, status: 'new' };
  if (friend.status === 'blocked') return { status: 403, body: { error: 'this burrow isn’t accepting postcards from you' } };
  const rk = `rate:${sid}:${day(now)}`, sent = +(await kv.get(rk) || 0);
  if (sent >= LIMITS.perSenderPerDay) return { status: 429, body: { error: 'that’s plenty of postcards for today. try again tomorrow.' } };
  await kv.put(rk, String(sent + 1), { expirationTtl: 2 * 86400 });

  const pending = friend.status !== 'approved';
  Object.assign(friend, { name: v.card.from.name, reply: v.card.from.reply, burrow: v.card.from.burrow, status: pending ? 'pending' : 'approved', last: now });
  if (!friend.since) friend.since = now;
  await kv.put('friend:' + sid, JSON.stringify(friend));
  const id = now.toString(36) + Math.random().toString(36).slice(2, 6);
  await kv.put('card:' + id, JSON.stringify({ id, sid, t: now, ...v.card, status: pending ? 'pending' : 'inbox' }));
  await trim(kv);
  if (pending && friend.notified !== true) {
    friend.notified = true; await kv.put('friend:' + sid, JSON.stringify(friend));
    await notify('💌 someone new wrote', `${friend.name} wants to send you postcards. open the burrow to say yes.`, 'post-request');
  } else if (!pending) await notify(`💌 a postcard from ${friend.name}`, v.card.note ? v.card.note.slice(0, 80) : 'with a little doodle', 'post');
  return { status: 202, body: { ok: true, status: pending ? 'waiting for them to accept you' : 'delivered' } };
}

async function trim(kv) {
  const cards = await list(kv, 'card:');
  if (cards.length <= LIMITS.keep) return;
  cards.sort((a, b) => a.t - b.t).slice(0, cards.length - LIMITS.keep).forEach(c => kv.delete('card:' + c.id));
}

/** Everything the owner's app needs. Pending cards are withheld until the sender is accepted. */
export async function mailbox(kv, address) {
  const friends = await list(kv, 'friend:'), cards = await list(kv, 'card:');
  const pub = f => ({ sid: f.sid, name: f.name, reply: f.reply, burrow: f.burrow || '', since: f.since, last: f.last });
  return {
    address,
    cards: cards.filter(c => c.status === 'inbox').sort((a, b) => b.t - a.t).map(({ status, ...c }) => c),
    requests: friends.filter(f => f.status === 'pending').map(f => ({ ...pub(f), waiting: cards.filter(c => c.sid === f.sid && c.status === 'pending').length })),
    friends: friends.filter(f => f.status === 'approved').map(pub),
    blocked: friends.filter(f => f.status === 'blocked').map(pub)
  };
}

export async function decide(kv, sid, verdict) {
  const f = await kvJson(kv, 'friend:' + sid); if (!f) return false;
  f.status = verdict === 'approve' ? 'approved' : verdict === 'unblock' ? 'pending' : 'blocked';
  await kv.put('friend:' + sid, JSON.stringify(f));
  for (const c of await list(kv, 'card:')) {
    if (c.sid !== sid) continue;
    if (verdict === 'approve' && c.status === 'pending') await kv.put('card:' + c.id, JSON.stringify({ ...c, status: 'inbox' }));
    if (verdict === 'block') await kv.delete('card:' + c.id);
  }
  return true;
}

export const removeCard = (kv, id) => kv.delete('card:' + String(id).replace(/[^a-z0-9]/gi, ''));
