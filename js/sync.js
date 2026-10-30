// Cross-device sync through one secret GitHub Gist.
// Each device only needs the same GitHub token; the gist is found by its file name.
// The token stays in this device's storage and is never written into the save itself.
const API = 'https://api.github.com';
export const FILE = 'pebble-burrow.json';
const DESC = 'Pebble Burrow save (do not rename the file)';

export class SyncError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

export class GistSync {
  constructor(token, gistId = null) { this.token = token.trim(); this.gistId = gistId; }

  async req(path, opts = {}) {
    let r;
    try {
      r = await fetch(API + path, { ...opts, headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch (e) { throw new SyncError('offline, will sync when you’re back online', 'offline'); }
    if (r.status === 401) throw new SyncError('GitHub rejected the token. Make a new one with gist access.', 'auth');
    if (r.status === 403) throw new SyncError('this token can’t use gists. Give it the Gists read & write permission.', 'scope');
    if (r.status === 404) throw new SyncError('save gist not found', 'missing');
    if (!r.ok) throw new SyncError(`GitHub answered ${r.status}`, 'http');
    return r.status === 204 ? null : r.json();
  }

  /** Who the token belongs to, used to confirm a fresh token works. */
  async whoami() { const u = await this.req('/user'); return u.login; }

  /** Locate the save gist across the account's gists. Returns its id or null. */
  async find() {
    for (let page = 1; page <= 10; page++) {
      const list = await this.req(`/gists?per_page=100&page=${page}`);
      const hit = list.find(g => g.files && g.files[FILE]);
      if (hit) return (this.gistId = hit.id);
      if (list.length < 100) break;
    }
    return null;
  }

  async pull() {
    if (!this.gistId && !(await this.find())) return null;
    let g;
    try { g = await this.req(`/gists/${this.gistId}`); }
    catch (e) { if (e.code === 'missing') { this.gistId = null; return null; } throw e; }
    const f = g.files[FILE]; if (!f) return null;
    const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    try { return JSON.parse(text); } catch { return null; }
  }

  async push(state) {
    const content = JSON.stringify(state, null, 1);
    if (this.gistId) {
      try { await this.req(`/gists/${this.gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content } } }) }); return this.gistId; }
      catch (e) { if (e.code !== 'missing') throw e; this.gistId = null; }
    }
    if (await this.find()) return this.push(state);
    const g = await this.req('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content } } }) });
    return (this.gistId = g.id);
  }
}
