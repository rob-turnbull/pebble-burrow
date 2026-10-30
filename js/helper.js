// Talking to your Cloudflare helper: push-notification nudges and the AI-visitor address.
// The helper link looks like https://pebble-burrow-helper.<you>.workers.dev/k/<ACCESS_KEY>

export function parseHelper(link) {
  const m = String(link || '').trim().match(/^(https:\/\/[^\s/]+)\/k\/([A-Za-z0-9_-]{16,})\/?$/);
  return m ? { base: m[1], key: m[2], mcp: `${m[1]}/mcp/${m[2]}`, peek: `${m[1]}/peek/${m[2]}` } : null;
}

const b64urlToBytes = s => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};

async function call(h, path, body) {
  const r = await fetch(h.base + path, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${h.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) throw new Error('the helper didn’t recognise this link. copy it again from the setup output.');
  if (!r.ok) throw new Error(`the helper answered ${r.status}`);
  return r.json();
}

export const helperStatus = h => call(h, '/status');

export function pushSupport() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return { ok: false, why: ios ? 'on iPhone, nudges only work from the home-screen app. add it to your home screen first, then open it from there.' : 'this browser can’t receive notifications.' };
  }
  return { ok: true };
}

export async function currentSubscription() {
  if (!pushSupport().ok) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must run inside a tap), subscribe, and register with the helper. */
export async function enableNudges(h, label) {
  const sup = pushSupport(); if (!sup.ok) throw new Error(sup.why);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('notifications are blocked for this site. allow them in your browser or phone settings, then try again.');
  const { publicKey } = await call(h, '/vapid');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
  await call(h, '/subscribe', { subscription: sub.toJSON(), label });
  return sub;
}

export async function disableNudges(h) {
  const sub = await currentSubscription(); if (!sub) return;
  try { await call(h, '/unsubscribe', { endpoint: sub.endpoint }); } catch { /* still unsubscribe locally */ }
  await sub.unsubscribe();
}

export const testNudge = h => call(h, '/test', {});
