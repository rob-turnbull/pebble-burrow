// Postcards: the composer (note + doodle) and how a card is drawn.
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const safeDoodle = d => /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d || '') ? d : '';
const INK = ['#2f2a3a', '#e57fa8', '#f08a24', '#86c46f', '#7fb8d6'];

/** Keep Tab inside an open dialog. */
export function trapFocus(root) {
  root.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = [...root.querySelectorAll('button,input,select,textarea,a[href],canvas,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

export function cardHTML(c, { mine = false } = {}) {
  const d = safeDoodle(c.doodle);
  return `<article class="postcard" data-card="${esc(c.id || '')}">
    ${d ? `<img class="pc-doodle" src="${d}" alt="a doodle from ${esc(c.from?.name || 'a friend')}">` : ''}
    <div class="pc-body">${c.note ? `<p class="pc-note">${esc(c.note)}</p>` : ''}
      <p class="pc-from">from <strong>${esc(c.from?.name || 'someone')}</strong>${c.being ? ` &amp; ${esc(c.being)}` : ''}${c.from?.burrow ? ` · ${esc(c.from.burrow)}` : ''}<span>${new Date(c.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></p></div>
    ${mine ? '' : `<button class="linkbtn pc-del" data-del="${esc(c.id)}">put away</button>`}
  </article>`;
}

/**
 * Open the composer. friends: [{addr,name}], beings: [{name}], send(card, to) -> Promise<string>
 */
export function compose({ friends, beings, me, send, addFriend, isAddress, fx, image }) {
  const root = document.createElement('div'); root.className = 'modal';
  root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="write a postcard">
    <div class="sheet-top"><strong>💌 write a postcard</strong><button class="ghost" data-close>close</button></div>
    <label class="field">to<select id="pc-to">${friends.map(f => `<option value="${esc(f.addr)}">${esc(f.name)}</option>`).join('')}<option value="__new">+ someone new…</option></select></label>
    <div class="row" id="pc-new" ${friends.length ? 'hidden' : ''}>
      <label class="field grow">their name<input id="pc-name" maxlength="40" autocomplete="off"></label>
      <label class="field grow">their mailbox address<input id="pc-addr" placeholder="https://….workers.dev/mail/…" autocomplete="off"></label></div>
    <label class="field">from<select id="pc-being">${beings.map((b, i) => `<option value="${i}">${esc(me)} &amp; ${esc(b.name)}</option>`).join('')}<option value="-1">just ${esc(me)}</option></select></label>
    <label class="field">note <span class="hint" id="pc-count">0 / 140</span><textarea id="pc-note" maxlength="140" rows="2" placeholder="the pumpkins are glowing. how’s your hill?"></textarea></label>
    <div class="field">doodle <span class="hint">optional</span>
      <canvas id="pc-pad" width="480" height="300" aria-label="doodle pad"></canvas>
      <div class="row inks">${INK.map((c, i) => `<button class="ink ${i ? '' : 'on'}" data-ink="${c}" style="--c:${c}" aria-label="ink ${i + 1}"></button>`).join('')}<button class="linkbtn" id="pc-clear">clear</button></div></div>
    <div class="row"><button class="big" id="pc-send">send it</button><span class="note" id="pc-msg" role="status"></span></div>
  </div>`;
  document.body.appendChild(root);
  const $ = id => root.querySelector('#' + id), close = () => root.remove();
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  root.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  if (!friends.length) $('pc-to').value = '__new';
  $('pc-to').onchange = () => { $('pc-new').hidden = $('pc-to').value !== '__new'; };
  $('pc-note').oninput = () => { $('pc-count').textContent = `${$('pc-note').value.length} / 140`; };

  // doodle pad
  const pad = $('pc-pad'), g = pad.getContext('2d'); let ink = INK[0], drawn = false, down = false, last = null;
  const blank = () => { g.fillStyle = '#fffaf0'; g.fillRect(0, 0, pad.width, pad.height); drawn = false; };
  blank(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 6;
  let photo = false;
  if (image) { const im = new Image(); im.onload = () => { const s = Math.max(pad.width / im.width, pad.height / im.height); g.drawImage(im, (pad.width - im.width * s) / 2, (pad.height - im.height * s) / 2, im.width * s, im.height * s); photo = true; drawn = true; }; im.src = image; }
  const pt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.onpointerdown = e => { down = true; last = pt(e); pad.setPointerCapture(e.pointerId); g.fillStyle = ink; g.beginPath(); g.arc(last[0], last[1], 3, 0, 7); g.fill(); drawn = true; };
  pad.onpointermove = e => { if (!down) return; const p = pt(e); g.strokeStyle = ink; g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; drawn = true; };
  pad.onpointerup = pad.onpointercancel = () => { down = false; };
  root.querySelectorAll('[data-ink]').forEach(b => b.onclick = () => { ink = b.dataset.ink; root.querySelectorAll('.ink').forEach(x => x.classList.toggle('on', x === b)); });
  $('pc-clear').onclick = () => { blank(); photo = false; };

  $('pc-send').onclick = async () => {
    const msg = $('pc-msg'), note = $('pc-note').value.trim();
    let to = $('pc-to').value, name = '';
    if (to === '__new') {
      to = $('pc-addr').value.trim(); name = $('pc-name').value.trim();
      if (!name) { msg.textContent = 'add their name so you know who it’s for.'; return; }
      if (!isAddress(to)) { msg.textContent = 'that doesn’t look like a mailbox address. it ends in /mail/ and a long code.'; return; }
    }
    if (!note && !drawn) { msg.textContent = 'write a note or draw something first.'; return; }
    const doodle = drawn ? (photo ? pad.toDataURL('image/jpeg', 0.78) : shrink(pad)) : '';
    const bi = +$('pc-being').value;
    $('pc-send').disabled = true; msg.textContent = 'sending…';
    try {
      const status = await send({ note, doodle, being: bi > -1 ? beings[bi].name : '' }, to);
      if (name) addFriend(to, name);
      fx?.play('post');
      msg.textContent = status === 'delivered' ? 'delivered! 💌' : `sent. ${status}.`;
      setTimeout(close, 1400);
    } catch (e) { msg.textContent = e.message; $('pc-send').disabled = false; }
  };
  $('pc-note').focus();
  trapFocus(root);
}

/** Half-size PNG keeps cards well under the mailbox limit. */
function shrink(canvas) {
  const c = document.createElement('canvas'); c.width = 240; c.height = 150;
  c.getContext('2d').drawImage(canvas, 0, 0, 240, 150);
  return c.toDataURL('image/png');
}
