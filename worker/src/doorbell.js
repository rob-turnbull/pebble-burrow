// The doorbell: your phone's own automation (iPhone Shortcuts, Tasker, MacroDroid) pings this when a
// text or email arrives. Only a short label is sent, never the message itself.
export const KINDS = { text: '💬', email: '✉️', call: '📞', other: '🔔' };
const KEEP_MS = 24 * 36e5, MAX = 30, PER_HOUR = 40;
const kvJson = async (kv, k) => { try { return JSON.parse(await kv.get(k)); } catch { return null; } };

/** Clean up what the automation sent. `from` is whatever label you chose in the automation (optional). */
export function cleanRing(q) {
  const kind = KINDS[String(q.kind || '').toLowerCase()] ? String(q.kind).toLowerCase() : 'other';
  const from = String(q.from || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
  return { kind, from };
}

export async function ring(kv, q, now = Date.now()) {
  const r = cleanRing(q), hour = 'ring:rate:' + Math.floor(now / 36e5);
  const n = +(await kv.get(hour) || 0);
  if (n >= PER_HOUR) return { status: 429, ring: null };
  await kv.put(hour, String(n + 1), { expirationTtl: 7200 });
  const list = ((await kvJson(kv, 'rings')) || []).filter(x => now - x.t < KEEP_MS);
  const item = { id: now.toString(36) + Math.random().toString(36).slice(2, 5), t: now, ...r };
  list.unshift(item);
  await kv.put('rings', JSON.stringify(list.slice(0, MAX)));
  return { status: 202, ring: item };
}

export async function recent(kv, now = Date.now()) { return ((await kvJson(kv, 'rings')) || []).filter(x => now - x.t < KEEP_MS); }
export async function clear(kv, upTo = Infinity) { const list = (await kvJson(kv, 'rings')) || []; await kv.put('rings', JSON.stringify(list.filter(x => x.t > upTo))); }

export const ringText = r => `${r.kind === 'text' ? 'a text' : r.kind === 'email' ? 'an email' : r.kind === 'call' ? 'a missed call' : 'something'}${r.from ? ` from ${r.from}` : ''}`;
