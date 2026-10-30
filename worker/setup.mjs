#!/usr/bin/env node
// One-time setup for the Pebble Burrow helper. Safe to re-run: it reuses what it already made.
//   cd worker
//   npx wrangler login
//   node setup.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { generateVapid } from './src/webpush.js';

const SECRETS_FILE = '.helper-secrets.json';   // local only, git-ignored
const TOML = 'wrangler.toml';
const win = process.platform === 'win32';

// stdin is always piped so wrangler runs non-interactively and never waits on a hidden prompt
function wrangler(args, input = '') {
  const r = spawnSync('npx', ['--yes', 'wrangler', ...args], { input, encoding: 'utf8', shell: win, env: { ...process.env, CI: '1' } });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}
const ask = q => new Promise(res => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a.trim()); }); });
const step = m => console.log(`\n→ ${m}`);
const die = m => { console.error(`\n✖ ${m}`); process.exit(1); };

step('checking your Cloudflare login');
const who = wrangler(['whoami']);
if (!who.ok || /not authenticated|You are not logged in/i.test(who.out)) die('run `npx wrangler login` first, then run this again.');

// 1. storage for device subscriptions and nudge history
let toml = readFileSync(TOML, 'utf8');
if (!/binding\s*=\s*"BURROW"/.test(toml)) {
  step('creating storage (KV namespace)');
  const kv = wrangler(['kv', 'namespace', 'create', 'BURROW']);
  toml = readFileSync(TOML, 'utf8');                       // wrangler may have written it in already
  if (!/binding\s*=\s*"BURROW"/.test(toml)) {
    const id = (kv.out.match(/"?id"?\s*[=:]\s*"([0-9a-f]{32})"/) || [])[1];
    if (!id) die('could not create the KV namespace:\n' + kv.out);
    toml += `\n[[kv_namespaces]]\nbinding = "BURROW"\nid = "${id}"\n`;
    writeFileSync(TOML, toml);
  }
  console.log('  storage ready.');
}

// 2. keys, made once and kept locally so re-runs don't break subscribed devices
let sec = existsSync(SECRETS_FILE) ? JSON.parse(readFileSync(SECRETS_FILE, 'utf8')) : {};
if (!sec.VAPID_PUBLIC) { const v = await generateVapid(); sec.VAPID_PUBLIC = v.publicKey; sec.VAPID_PRIVATE_JWK = v.privateJwk; }
if (!sec.ACCESS_KEY) sec.ACCESS_KEY = randomBytes(24).toString('base64url');
if (!sec.MAILBOX_KEY) sec.MAILBOX_KEY = randomBytes(18).toString('base64url');
if (!sec.GITHUB_TOKEN || process.argv.includes('--new-token')) {
  console.log('\nThe helper needs its own GitHub token to read and write your burrow gist.');
  console.log('Make one at https://github.com/settings/personal-access-tokens/new');
  console.log('  Account permissions → Gists → Read and write. Nothing else. A long expiration is fine.');
  sec.GITHUB_TOKEN = process.env.PEBBLE_GITHUB_TOKEN || await ask('Paste the token: ');
  if (!/^(github_pat_|ghp_)/.test(sec.GITHUB_TOKEN)) die('that doesn’t look like a GitHub token.');
}
writeFileSync(SECRETS_FILE, JSON.stringify(sec, null, 2));

// 3. deploy, then hand it the secrets
step('deploying the helper');
const dep = wrangler(['deploy']);
if (!dep.ok) die('deploy failed:\n' + dep.out);
const url = (dep.out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) || [])[0];
if (!url) die('deployed, but could not find the workers.dev address in:\n' + dep.out);

step('storing secrets');
for (const name of ['VAPID_PUBLIC', 'VAPID_PRIVATE_JWK', 'ACCESS_KEY', 'MAILBOX_KEY', 'GITHUB_TOKEN']) {
  const r = wrangler(['secret', 'put', name], sec[name]);
  if (!r.ok) die(`could not store ${name}:\n${r.out}`);
  console.log(`  ${name} ✓`);
}

console.log(`
✔ the helper is live.

  Helper link (paste into pebble burrow → settings → nudges & AI visitor):
    ${url}/k/${sec.ACCESS_KEY}

  AI visitor address (claude.ai → settings → connectors → add custom connector):
    ${url}/mcp/${sec.ACCESS_KEY}

  Plain-text peek:
    ${url}/peek/${sec.ACCESS_KEY}

Keep those three private. Anyone with them can visit your burrow.

  Postcard mailbox (this one is fine to give to friends; it can only receive postcards):
    ${url}/mail/${sec.MAILBOX_KEY}
${SECRETS_FILE} holds your keys on this computer only (it's git-ignored).
`);
