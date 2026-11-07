'use strict';
/* ===================================================================
   RentMate – single page app (talks to Server.java over /api/*)
   =================================================================== */

/* ---------------------------- helpers ---------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const truthy = v => v === true || v === 1 || v === '1' || v === 'true';
const fmtDate = s => {
  if (!s) return '—';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
  return isNaN(d) ? esc(s) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTime = s => {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d) ? esc(s) : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
function priceHtml(n) {
  const [w, d] = Number(n || 0).toFixed(2).split('.');
  return `<span class="price"><sup>₹</sup><b>${Number(w).toLocaleString('en-IN')}</b><sup>${d}</sup></span>`;
}
function dueInfo(due) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(String(due).slice(0, 10) + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  if (diff < 0) return { text: `Overdue by ${-diff} day${-diff === 1 ? '' : 's'}`, cls: 'bad' };
  if (diff === 0) return { text: 'Due today', cls: 'warn' };
  return { text: `Due in ${diff} day${diff === 1 ? '' : 's'}`, cls: diff <= 2 ? 'warn' : 'ok' };
}
function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const BADGE = { APPROVED: 'ok', RETURNED: 'ok', EARNING: 'ok', YES: 'ok', ACTIVE: 'blue', RENTAL: 'blue', PENDING: 'warn', TOPUP: 'purple', REJECTED: 'bad', NO: 'bad' };
const badge = t => `<span class="badge ${BADGE[String(t).toUpperCase().trim()] || ''}">${esc(t)}</span>`;

const ICONS = [
  [/camera|photo|lens|dslr/, '📷'], [/drill|tool|saw|hammer|wrench|plier/, '🛠️'], [/bike|cycle|bicycle/, '🚲'],
  [/car|vehicle|scooter|bike rack/, '🚗'], [/laptop|computer|pc|monitor/, '💻'], [/phone|mobile|tablet/, '📱'],
  [/guitar|piano|drum|music|speaker|mic|dj/, '🎸'], [/tent|camp|hik|trek|sleeping/, '⛺'], [/book|novel/, '📚'],
  [/game|console|ps\d|xbox|controller/, '🎮'], [/party|event|decor|light|wedding/, '🎉'], [/cloth|dress|suit|costume|wear|sherwani/, '👗'],
  [/furnit|chair|table|sofa|bed/, '🪑'], [/kitchen|cook|mixer|oven|grill/, '🍳'], [/sport|cricket|bat|ball|gym|yoga/, '🏏'],
  [/garden|plant|lawn|mower/, '🌿'], [/projector|tv|screen|cinema/, '📽️'], [/ladder/, '🪜'], [/electronic/, '🔌'],
];
const DEFAULT_CATS = ['Electronics', 'Camera', 'Tools', 'Sports', 'Camping', 'Party', 'Furniture', 'Books', 'Vehicles'];
const iconOf = (cat, name) => { const t = `${cat} ${name}`.toLowerCase(); for (const [re, ic] of ICONS) if (re.test(t)) return ic; return '📦'; };
const hueOf = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
function imgBox(it, cls = '') {
  const cat = it.category || '', name = it.name || it.product || '';
  return `<div class="pimg ${cls}" style="--h:${hueOf(cat || name || 'x')}"><span class="ph">${iconOf(cat, name)}</span>` +
    (it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '') + `</div>`;
}

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 3300);
  setTimeout(() => t.remove(), 3700);
}

function openModal(html, opts = {}) {
  const root = $('#modal-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${opts.small ? 'small' : ''}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close" type="button">×</button>${html}</div>`;
  root.append(ov);
  document.body.classList.add('noscroll');
  let closed = false;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return; closed = true;
    ov.remove(); document.removeEventListener('keydown', onKey);
    if (!root.children.length) document.body.classList.remove('noscroll');
    if (opts.onClose) opts.onClose();
  }
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $('.modal-x', ov).onclick = close;
  return { el: ov, close };
}

function confirmBox({ title, message, ok = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let answer = false;
    const m = openModal(
      `<h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
       <div class="row end gap" style="margin-top:18px"><button class="btn btn-light" data-no type="button">Cancel</button>
       <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes type="button">${esc(ok)}</button></div>`,
      { small: true, onClose: () => resolve(answer) });
    $('[data-yes]', m.el).onclick = () => { answer = true; m.close(); };
    $('[data-no]', m.el).onclick = () => m.close();
  });
}

/* ---------------------------- API layer ---------------------------- */
const S = {
  token: sessionStorage.getItem('rm_token'),
  user: null,
  query: '',
  products: [],
  filters: { category: '', min: '', max: '', available: false, sort: 'featured' },
  history: 'ALL',
};

async function api(path, data) {
  const opt = { method: data ? 'POST' : 'GET', headers: {} };
  if (S.token) opt.headers.Authorization = 'Bearer ' + S.token;
  if (data) {
    opt.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opt.body = new URLSearchParams(data).toString();
  }
  let res;
  try { res = await fetch(path, opt); }
  catch (e) { throw new Error('Cannot reach the server. Make sure Server.java is running.'); }
  let body = {};
  try { body = await res.json(); } catch (e) { /* ignore */ }
  if (res.status === 401 && S.token && path !== '/api/login') {
    clearSession(); showAuth(); toast('Your session ended. Please sign in again.', 'error');
    throw new Error(body.error || 'Signed out');
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; }
}

function clearSession() {
  S.token = null; S.user = null; S.query = '';
  sessionStorage.removeItem('rm_token');
}

/* ---------------------------- auth screens ---------------------------- */
let authRole = 'customer', authMode = 'login';

function showAuth() {
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  document.body.removeAttribute('data-role');
  history.replaceState(null, '', location.pathname);
  drawAuth();
}

function drawAuth(error = '') {
  const card = $('#auth-card');
  if (authMode === 'register') {
    card.innerHTML = `
      <h1>Create account</h1>
      <div class="gift">🎁 New customers start with ₹5,000 in their wallet.</div>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form id="reg-form">
        <label>Full name<input name="name" type="text" required autocomplete="name"></label>
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Phone <span class="muted">(optional)</span><input name="phone" type="text" autocomplete="tel"></label>
        <label>Password<input name="password" type="password" minlength="4" required autocomplete="new-password" placeholder="At least 4 characters"></label>
        <button class="btn btn-primary btn-block" type="submit">Create your RentMate account</button>
      </form>
      <div class="divider"><span>Already a customer?</span></div>
      <button class="btn btn-light btn-block" id="to-login" type="button">Sign in</button>`;
    $('#to-login').onclick = () => { authMode = 'login'; drawAuth(); };
    $('#reg-form').onsubmit = async e => {
      e.preventDefault();
      const btn = $('button[type=submit]', e.target);
      btn.disabled = true;
      try {
        const r = await api('/api/register', Object.fromEntries(new FormData(e.target)));
        await startApp(r);
      } catch (err) { drawAuth(err.message); }
    };
    return;
  }
  card.innerHTML = `
    <h1>Sign in</h1>
    <div class="seg" role="tablist">
      <button type="button" data-r="customer" class="${authRole === 'customer' ? 'on' : ''}">Customer</button>
      <button type="button" data-r="admin" class="${authRole === 'admin' ? 'on' : ''}">Admin</button>
    </div>
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <form id="login-form">
      <label>${authRole === 'admin' ? 'Admin username' : 'Email'}
        <input name="username" type="text" required autofocus autocomplete="username"></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-primary btn-block" type="submit">Sign in</button>
    </form>
    ${authRole === 'customer' ? `
      <div class="divider"><span>New to RentMate?</span></div>
      <button class="btn btn-light btn-block" id="to-reg" type="button">Create your RentMate account</button>` :
      `<p class="small">Admin accounts are created by an existing admin.</p>`}`;
  $$('.seg button', card).forEach(b => b.onclick = () => { authRole = b.dataset.r; drawAuth(); });
  if ($('#to-reg')) $('#to-reg').onclick = () => { authMode = 'register'; drawAuth(); };
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(e.target));
      const r = await api('/api/login', { username: f.username, password: f.password, as: authRole });
      await startApp(r);
    } catch (err) { drawAuth(err.message); }
  };
}

async function startApp(session) {
  S.token = session.token;
  sessionStorage.setItem('rm_token', S.token);
  S.user = await api('/api/me');
  enterApp(true);
}

function enterApp(fresh) {
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  const admin = S.user.role === 'ADMIN';
  document.body.dataset.role = S.user.role;
  $('#who').textContent = S.user.name;
  $('#role-badge').classList.toggle('hidden', !admin);
  $('#search-form').classList.toggle('hidden', admin);
  $('#wallet-chip').classList.toggle('hidden', admin);
  drawNav();
  updateWalletChip();
  const home = admin ? 'dashboard' : 'browse';
  const cur = location.hash.slice(1);
  if (fresh || !pagesFor()[cur]) go(home); else render();
}

/* ---------------------------- navigation ---------------------------- */
const NAV = {
  ADMIN: [['dashboard', 'Dashboard'], ['users', 'Users'], ['aproducts', 'Products'], ['approvals', 'Approvals'],
    ['arentals', 'Rentals'], ['payments', 'Payments'], ['wallets', 'Wallets'], ['addadmin', 'Add Admin']],
  CUSTOMER: [['dashboard', 'Dashboard'], ['browse', 'Browse Products'], ['rentals', 'My Rentals'], ['history', 'Rental History'],
    ['wallet', 'My Wallet'], ['addproduct', 'Add Product'], ['myproducts', 'My Products']],
};
const pagesFor = () => (S.user && S.user.role === 'ADMIN') ? ADMIN_PAGES : CUSTOMER_PAGES;

function drawNav() {
  $('#subnav').innerHTML = NAV[S.user.role].map(([k, label]) => `<a href="#${k}" data-page="${k}">${label}</a>`).join('');
}
function go(page) {
  if (location.hash === '#' + page) render(); else location.hash = page;
}
async function render() {
  if (!S.user) return;
  const pages = pagesFor();
  let page = location.hash.slice(1);
  if (!pages[page]) page = S.user.role === 'ADMIN' ? 'dashboard' : 'browse';
  $$('#subnav a').forEach(a => a.classList.toggle('on', a.dataset.page === page));
  const c = document.createElement('div');
  c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  $('#content').replaceChildren(c);
  window.scrollTo(0, 0);
  try { await pages[page](c); }
  catch (e) {
    if (S.user) c.innerHTML = `<div class="empty big">⚠️<p>${esc(e.message)}</p><button class="btn btn-light" onclick="render()">Try again</button></div>`;
  }
}
window.addEventListener('hashchange', render);

async function refreshMe() {
  const me = await api('/api/me');
  S.user = { ...S.user, ...me };
  updateWalletChip();
}
function updateWalletChip() {
  if (S.user && S.user.role === 'CUSTOMER') $('#wallet-chip b').textContent = money(S.user.wallet);
}

/* ---------------------------- generic UI blocks ---------------------------- */
const pageHead = (title, sub = '') => `<div class="pagehead"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;

function dataTable({ cols, rows, empty = 'Nothing here yet.', onAction }) {
  const wrap = document.createElement('div');
  wrap.className = 'tablecard';
  if (!rows.length) { wrap.innerHTML = `<div class="empty">${esc(empty)}</div>`; return wrap; }
  wrap.innerHTML = `
    <div class="tbl-tools"><input type="search" class="tbl-search" placeholder="Filter rows…" aria-label="Filter rows">
      <span class="muted">${rows.length} record${rows.length === 1 ? '' : 's'}</span></div>
    <div class="tbl-scroll"><table><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $('.tbl-search', wrap).addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    $$('tbody tr', wrap).forEach(tr => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); });
  });
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && onAction) onAction(b.dataset.act, b.dataset.id, b);
  });
  return wrap;
}

const stat = (label, value, href, tone = '') => `<a class="stat ${tone}" href="#${href}"><small>${esc(label)}</small><b>${value}</b></a>`;
const tile = (icon, title, sub, href) => `<a class="tile" href="#${href}"><span class="ic">${icon}</span><div><b>${esc(title)}</b><span>${esc(sub)}</span></div></a>`;
const prodCell = p => `<div class="cellprod">${imgBox(p)}<div><b>${esc(p.name)}</b><small>${esc(p.description || p.category || '')}</small></div></div>`;

/* ===================================================================
   CUSTOMER PAGES
   =================================================================== */
const CUSTOMER_PAGES = {};

/* ---- dashboard ---- */
CUSTOMER_PAGES.dashboard = async c => {
  const s = await api('/api/my/stats');
  S.user.wallet = s.wallet; updateWalletChip();
  c.innerHTML = `
    <section class="welcome"><div><h1>Hello, ${esc(S.user.name)} 👋</h1>
      <p>Here is a quick look at your rentals, listings and wallet.</p></div>
      <a class="btn btn-primary" href="#browse">Browse products</a></section>
    <div class="stats">
      ${stat('Wallet balance', money(s.wallet), 'wallet')}
      ${stat('Active rentals', s.activeRentals, 'rentals', s.activeRentals ? '' : '')}
      ${stat('Rental history', s.history, 'history')}
      ${stat('My products', s.myProducts, 'myproducts')}
      ${stat('Awaiting approval', s.pendingProducts, 'myproducts', s.pendingProducts ? 'warn' : '')}
      ${stat('Currently lent out', s.lentActive, 'myproducts')}
      ${stat('Earned from lending', money(s.earnings), 'myproducts', 'good')}
      ${stat('Spent on rentals', money(s.spent), 'history')}
    </div>
    <h2 class="sec">Quick actions</h2>
    <div class="tiles">
      ${tile('🛍️', 'Browse products', 'Find something to rent today', 'browse')}
      ${tile('📦', 'List a product', 'Earn money from items you own', 'addproduct')}
      ${tile('💳', 'Add money', 'Top up your wallet', 'wallet')}
      ${tile('↩️', 'Return an item', 'See what is due back', 'rentals')}
    </div>`;
};

/* ---- browse (storefront) ---- */
function cardHtml(p, preview = false) {
  const avail = truthy(p.available);
  const mine = S.user && p.sellerId === S.user.id;
  return `<article class="pcard ${avail ? '' : 'off'} ${preview ? 'preview' : ''}" data-id="${p.id}">
    ${imgBox(p)}
    <div class="pbody">
      <span class="tag">${esc(p.category)}</span>
      <h3 class="ptitle">${esc(p.name)}</h3>
      <div>${priceHtml(p.price)} <span class="per">/ day</span></div>
      <div class="seller">Sold by ${esc(p.seller)}${mine ? ' (you)' : ''}</div>
      <div class="stock ${avail ? 'ok' : 'bad'}">${avail ? '● Available now' : '● Currently rented out'}</div>
      <button class="btn ${avail && !mine ? 'btn-primary' : ''} btn-block" type="button" ${preview ? 'tabindex="-1"' : ''}>${mine ? 'View your listing' : avail ? 'Rent now' : 'View details'}</button>
    </div></article>`;
}

CUSTOMER_PAGES.browse = async c => {
  const q = S.query;
  const list = await api('/api/products?q=' + encodeURIComponent(q));
  S.products = list.map(p => ({ ...p, available: truthy(p.available) }));
  const counts = {};
  S.products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  if (S.filters.category && !counts[S.filters.category]) S.filters.category = '';
  const f = S.filters;

  c.innerHTML = `
    ${q ? `<div class="searchnote">Results for <b>“${esc(q)}”</b> · <a href="#" id="clear-q">Clear search</a></div>` : `
    <section class="hero"><div><h1>Rent what you need. Lend what you don't.</h1>
      <p>Cameras, tools, bikes, tents and more from people near you. Pay from your wallet and return when you're done.</p></div>
      <a class="btn btn-primary" href="#addproduct">Start listing your items</a></section>`}
    <div class="cats" id="cats"></div>
    <div class="shop">
      <aside class="filters card">
        <div class="grp"><h3>Price per day</h3>
          <div class="pricerow"><input type="number" id="f-min" min="0" placeholder="Min" value="${esc(f.min)}"><span>–</span>
          <input type="number" id="f-max" min="0" placeholder="Max" value="${esc(f.max)}"></div></div>
        <div class="grp"><h3>Availability</h3>
          <label class="check"><input type="checkbox" id="f-av" ${f.available ? 'checked' : ''}> Available now only</label></div>
        <button class="btn btn-light btn-block btn-sm" id="f-clear" type="button">Clear filters</button>
      </aside>
      <section>
        <div class="results-bar"><span id="rcount" class="muted"></span>
          <label>Sort by
            <select id="f-sort">
              <option value="featured">Featured</option><option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option><option value="new">Newest first</option><option value="az">Name: A to Z</option>
            </select></label></div>
        <div class="grid" id="grid"></div>
      </section>
    </div>`;
  $('#f-sort').value = f.sort;

  const draw = () => {
    let items = S.products.filter(p =>
      (!f.category || p.category === f.category) && (!f.available || p.available) &&
      (f.min === '' || p.price >= +f.min) && (f.max === '' || p.price <= +f.max));
    if (f.sort === 'low') items.sort((a, b) => a.price - b.price);
    else if (f.sort === 'high') items.sort((a, b) => b.price - a.price);
    else if (f.sort === 'new') items.sort((a, b) => b.id - a.id);
    else if (f.sort === 'az') items.sort((a, b) => a.name.localeCompare(b.name));
    $('#cats').innerHTML =
      `<button class="cat ${f.category ? '' : 'on'}" data-cat="" type="button">All <i>${S.products.length}</i></button>` +
      Object.keys(counts).sort().map(k => `<button class="cat ${f.category === k ? 'on' : ''}" data-cat="${esc(k)}" type="button">${iconOf(k, '')} ${esc(k)} <i>${counts[k]}</i></button>`).join('');
    $('#rcount').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    $('#grid').innerHTML = items.length ? items.map(p => cardHtml(p)).join('') :
      `<div class="empty big" style="grid-column:1/-1">🔍<p>${S.products.length ? 'No products match your filters.' : (q ? 'No products found for your search.' : 'No approved products yet. Be the first to list one!')}</p>
       <a class="btn btn-primary" href="#addproduct">List a product</a></div>`;
  };
  draw();

  $('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { f.category = b.dataset.cat; draw(); } };
  $('#grid').onclick = e => {
    const card = e.target.closest('.pcard');
    if (card) { const p = S.products.find(x => String(x.id) === card.dataset.id); if (p) openProduct(p); }
  };
  $('#f-min').oninput = e => { f.min = e.target.value; draw(); };
  $('#f-max').oninput = e => { f.max = e.target.value; draw(); };
  $('#f-av').onchange = e => { f.available = e.target.checked; draw(); };
  $('#f-sort').onchange = e => { f.sort = e.target.value; draw(); };
  $('#f-clear').onclick = () => {
    Object.assign(f, { category: '', min: '', max: '', available: false, sort: 'featured' });
    $('#f-min').value = ''; $('#f-max').value = ''; $('#f-av').checked = false; $('#f-sort').value = 'featured'; draw();
  };
  if ($('#clear-q')) $('#clear-q').onclick = e => { e.preventDefault(); S.query = ''; $('#search-input').value = ''; render(); };
};

function openProduct(p) {
  const mine = p.sellerId === S.user.id;
  const canRent = p.available && !mine;
  const m = openModal(`
    <div class="pd">
      <div>${imgBox(p, 'lg')}</div>
      <div class="pd-info">
        <span class="tag">${esc(p.category)}</span>
        <h2>${esc(p.name)}</h2>
        <div class="muted">Sold by <b>${esc(p.seller)}</b>${mine ? ' (you)' : ''}</div>
        <hr>
        <div>${priceHtml(p.price)} <span class="per">per day</span></div>
        <p class="desc">${p.description ? esc(p.description) : '<span class="muted">The seller has not added a description.</span>'}</p>
        <div class="stock ${p.available ? 'ok' : 'bad'}">${p.available ? '● Available now' : '● Currently rented out'}</div>
      </div>
      <div class="pd-buy card">
        <span class="lbl">Rental period (days)</span>
        <div class="stepper"><button type="button" data-step="-1" aria-label="Fewer days">−</button>
          <input id="days" type="number" min="1" max="365" value="1" aria-label="Number of days">
          <button type="button" data-step="1" aria-label="More days">+</button></div>
        <div class="quick">${[1, 3, 7, 14, 30].map(n => `<button class="qk" type="button" data-d="${n}">${n} day${n > 1 ? 's' : ''}</button>`).join('')}</div>
        <div class="sum">
          <div><span>Rent × <b id="s-days">1</b> day(s)</span><span id="s-sub"></span></div>
          <div><span>Return by</span><b id="s-due"></b></div>
          <div><span>Wallet balance</span><span>${money(S.user.wallet)}</span></div>
          <div class="total"><span>Total</span><span id="s-total"></span></div>
        </div>
        <div class="notice warn hidden" id="s-warn">Not enough balance. <a href="#wallet" id="s-add">Add money to wallet</a></div>
        <button class="btn btn-buy btn-block" id="do-rent" type="button" ${canRent ? '' : 'disabled'}>
          ${mine ? 'This is your own listing' : p.available ? 'Rent now' : 'Currently unavailable'}</button>
        <small class="muted">Paid instantly from your RentMate wallet.</small>
      </div>
    </div>`);
  const input = $('#days', m.el);
  const days = () => Math.min(365, Math.max(1, parseInt(input.value, 10) || 1));
  const update = () => {
    const d = days(), total = p.price * d;
    $('#s-days', m.el).textContent = d;
    $('#s-sub', m.el).textContent = money(total);
    $('#s-total', m.el).textContent = money(total);
    $('#s-due', m.el).textContent = addDays(d);
    $('#s-warn', m.el).classList.toggle('hidden', !(canRent && total > Number(S.user.wallet)));
  };
  input.oninput = update;
  input.onblur = () => { input.value = days(); update(); };
  $$('[data-step]', m.el).forEach(b => b.onclick = () => { input.value = Math.min(365, Math.max(1, days() + (+b.dataset.step))); update(); });
  $$('[data-d]', m.el).forEach(b => b.onclick = () => { input.value = b.dataset.d; update(); });
  $('#s-add', m.el).onclick = () => m.close();
  $('#do-rent', m.el).onclick = e => busy(e.currentTarget, async () => {
    const d = days();
    const r = await api('/api/rent', { product_id: p.id, days: d });
    m.close();
    await refreshMe();
    toast(`Rented “${p.name}” for ${d} day${d > 1 ? 's' : ''}. ${money(r.amount)} paid. Return by ${fmtDate(r.dueDate)}.`);
    go('rentals');
  });
  update();
}

/* ---- rentals ---- */
function rentalCard(r, returnable) {
  const active = r.status === 'ACTIVE';
  const due = active ? dueInfo(r.dueDate) : null;
  return `<article class="order">
    <div class="order-head">
      <div><small>RENTED ON</small>${fmtDate(r.startDate)}</div>
      <div><small>TOTAL PAID</small>${money(r.amount)}</div>
      <div><small>${active ? 'DUE DATE' : 'RETURNED ON'}</small>${active ? fmtDate(r.dueDate) : fmtDate(r.returnDate)}</div>
      <div class="grow"></div>
      <div><small>RENTAL #</small>${r.id}</div>
    </div>
    <div class="order-body">
      ${imgBox({ name: r.product, category: r.category, image: r.image })}
      <div class="info">
        <h3>${esc(r.product)}</h3>
        <span class="muted">${esc(r.category)} · Sold by ${esc(r.seller)}</span>
        <div>${badge(r.status)} ${active ? `<span class="badge ${due.cls}">${due.text}</span>` : ''}</div>
      </div>
      ${returnable && active ? `<button class="btn btn-primary" data-return="${r.id}" type="button">Return item</button>` : ''}
    </div></article>`;
}
function bindReturns(c) {
  c.addEventListener('click', async e => {
    const b = e.target.closest('[data-return]');
    if (!b) return;
    if (!await confirmBox({ title: 'Return this item?', message: 'It becomes available for other customers again.', ok: 'Return item' })) return;
    busy(b, async () => { await api('/api/return', { rental_id: b.dataset.return }); toast('Item returned. Thank you!'); render(); });
  });
}

CUSTOMER_PAGES.rentals = async c => {
  const list = await api('/api/my/rentals');
  c.innerHTML = pageHead('My Rentals', 'Items you currently have on rent') +
    (list.length ? list.map(r => rentalCard(r, true)).join('') :
      `<div class="empty big">🛍️<p>You have no active rentals.</p><a class="btn btn-primary" href="#browse">Find something to rent</a></div>`);
  bindReturns(c);
};

CUSTOMER_PAGES.history = async c => {
  const list = await api('/api/my/rentals?all=1');
  c.innerHTML = pageHead('Rental History', 'Every item you have rented') + `
    <div class="tabs">${['ALL', 'ACTIVE', 'RETURNED'].map(t => `<button type="button" data-t="${t}" class="${S.history === t ? 'on' : ''}">${t === 'ALL' ? 'All' : t[0] + t.slice(1).toLowerCase()}</button>`).join('')}</div>
    <div id="hlist"></div>`;
  const draw = () => {
    const items = list.filter(r => S.history === 'ALL' || r.status === S.history);
    $('#hlist', c).innerHTML = items.length ? items.map(r => rentalCard(r, true)).join('') : `<div class="empty big">📭<p>No rentals to show here.</p></div>`;
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.t === S.history));
  };
  $('.tabs', c).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { S.history = b.dataset.t; draw(); } };
  draw(); bindReturns(c);
};

/* ---- wallet ---- */
const TX = { RENTAL: ['Rental payment', -1], EARNING: ['Rental earning', 1], TOPUP: ['Wallet top-up', 1] };
CUSTOMER_PAGES.wallet = async c => {
  const w = await api('/api/wallet');
  S.user.wallet = w.balance; updateWalletChip();
  c.innerHTML = pageHead('My Wallet', 'Add money and track every payment') + `
    <div class="wallet-grid">
      <div class="walletcard"><small>AVAILABLE BALANCE</small><div class="bal">${money(w.balance)}</div><p>Use your balance to rent items instantly.</p></div>
      <div class="card topup"><h3>Add money</h3>
        <div class="quick">${[500, 1000, 2000, 5000].map(n => `<button class="qk" type="button" data-a="${n}">+ ₹${n.toLocaleString('en-IN')}</button>`).join('')}</div>
        <form id="topup"><input type="number" name="amount" min="1" max="100000" step="1" placeholder="Amount in ₹" required>
          <button class="btn btn-primary" type="submit">Add</button></form>
        <p class="muted" style="font-size:12px;margin:10px 0 0">Demo wallet – no real money is charged.</p></div>
    </div>
    <h2 class="sec">Transactions</h2>`;
  $$('[data-a]', c).forEach(b => b.onclick = () => { $('#topup input', c).value = b.dataset.a; });
  $('#topup', c).onsubmit = e => {
    e.preventDefault();
    busy($('button', e.target), async () => {
      await api('/api/wallet/topup', { amount: new FormData(e.target).get('amount') });
      toast('Money added to your wallet.'); render();
    });
  };
  c.append(dataTable({
    rows: w.transactions, empty: 'No transactions yet.',
    cols: [
      { h: 'ID', f: r => r.id },
      { h: 'Details', f: r => badge(r.type) + ' ' + esc((TX[r.type] || [r.type])[0]) },
      { h: 'Date', f: r => fmtDateTime(r.txDate) },
      { h: 'Amount', cls: 'num', f: r => { const sg = (TX[r.type] || [0, 1])[1]; return `<span class="${sg < 0 ? 'neg' : 'pos'}">${sg < 0 ? '−' : '+'}${money(r.amount)}</span>`; } },
    ],
  }));
};

/* ---- add product ---- */
CUSTOMER_PAGES.addproduct = async c => {
  const cats = [...new Set([...DEFAULT_CATS, ...S.products.map(p => p.category)])];
  c.innerHTML = pageHead('Add Product', 'List an item for rent. It goes live after an admin approves it.') + `
    <div class="split">
      <form class="card formcard" id="pform">
        <label>Product name<input name="name" type="text" maxlength="150" required placeholder="e.g. Canon EOS 200D DSLR camera"></label>
        <label>Category<input name="category" type="text" list="catlist" maxlength="60" required placeholder="e.g. Camera">
          <datalist id="catlist">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label>Rent price per day (₹)<input name="price" type="number" min="1" step="0.01" required placeholder="250"></label>
        <label>Photo URL <span class="muted">(optional)</span><input name="image" type="url" placeholder="https://…"></label>
        <label>Description <span class="muted">(optional)</span><textarea name="description" rows="4" maxlength="1000" placeholder="Condition, what's included, pick-up details…"></textarea></label>
        <div class="notice warn">⏳ Your product stays <b>PENDING</b> until an admin approves it.</div>
        <button class="btn btn-primary btn-block" type="submit">Submit for approval</button>
      </form>
      <div><h2 class="sec" style="margin-top:0">Preview</h2><div id="preview"></div></div>
    </div>`;
  const form = $('#pform', c);
  const preview = () => {
    const f = Object.fromEntries(new FormData(form));
    $('#preview', c).innerHTML = cardHtml({ id: 0, name: f.name || 'Your product name', category: f.category || 'Category', price: +f.price || 0,
      image: f.image, seller: S.user.name, sellerId: -1, available: true }, true);
  };
  form.oninput = preview; preview();
  form.onsubmit = e => {
    e.preventDefault();
    busy($('button[type=submit]', form), async () => {
      await api('/api/my/products/add', Object.fromEntries(new FormData(form)));
      toast('Product submitted for approval.'); go('myproducts');
    });
  };
};

/* ---- my products ---- */
CUSTOMER_PAGES.myproducts = async c => {
  const [mine, lent] = await Promise.all([api('/api/my/products'), api('/api/my/lent')]);
  c.innerHTML = pageHead('My Products', 'Your listings and the items you have lent out') +
    `<div class="row gap" style="margin-bottom:14px"><a class="btn btn-primary" href="#addproduct">+ Add a product</a></div>`;
  c.append(dataTable({
    rows: mine, empty: 'You have not listed anything yet.',
    onAction: async (act, id, btn) => {
      if (!await confirmBox({ title: 'Delete this product?', message: 'This also removes its rental history.', ok: 'Delete', danger: true })) return;
      busy(btn, async () => { await api('/api/my/products/delete', { id }); toast('Product deleted.'); render(); });
    },
    cols: [
      { h: 'Product', f: prodCell },
      { h: 'Price / day', cls: 'num', f: r => money(r.price) },
      { h: 'Status', f: r => badge(r.status) },
      { h: 'Available', f: r => badge(truthy(r.available) ? 'YES' : 'NO') },
      { h: '', f: r => `<button class="btn btn-danger btn-sm" data-act="del" data-id="${r.id}" type="button">Delete</button>` },
    ],
  }));
  c.insertAdjacentHTML('beforeend', `<h2 class="sec">Items you have lent out</h2>`);
  c.append(dataTable({
    rows: lent, empty: 'Nobody has rented your items yet.',
    cols: [
      { h: 'Rental #', f: r => r.id },
      { h: 'Product', f: r => `<b>${esc(r.product)}</b>` },
      { h: 'Rented by', f: r => esc(r.customer) },
      { h: 'Start', f: r => fmtDate(r.startDate) },
      { h: 'Due', f: r => fmtDate(r.dueDate) },
      { h: 'Earned', cls: 'num', f: r => `<span class="pos">${money(r.amount)}</span>` },
      { h: 'Status', f: r => badge(r.status) + (truthy(r.overdue) ? ' <span class="badge bad">Overdue</span>' : '') },
    ],
  }));
};

/* ===================================================================
   ADMIN PAGES
   =================================================================== */
const ADMIN_PAGES = {};

function approvalsTable(rows) {
  return dataTable({
    rows, empty: 'No products are waiting for approval. 🎉',
    onAction: (act, id, btn) => busy(btn, async () => {
      await api('/api/admin/approve', { id, approve: act === 'approve' });
      toast(act === 'approve' ? 'Product approved and live.' : 'Product rejected.'); render();
    }),
    cols: [
      { h: 'Product', f: prodCell },
      { h: 'Category', f: r => esc(r.category) },
      { h: 'Price / day', cls: 'num', f: r => money(r.price) },
      { h: 'Seller', f: r => esc(r.seller) },
      { h: 'Decision', f: r => `<div class="acts"><button class="btn btn-ok btn-sm" data-act="approve" data-id="${r.id}" type="button">Approve</button>
        <button class="btn btn-danger btn-sm" data-act="reject" data-id="${r.id}" type="button">Reject</button></div>` },
    ],
  });
}

ADMIN_PAGES.dashboard = async c => {
  const [s, pending] = await Promise.all([api('/api/admin/stats'), api('/api/admin/approvals')]);
  c.innerHTML = `
    <section class="welcome"><div><h1>Admin dashboard</h1>
      <p>Manage customers, products, approvals, rentals and payments.</p></div>
      ${s.pendingProducts ? `<a class="btn btn-primary" href="#approvals">Review ${s.pendingProducts} pending</a>` : ''}</section>
    <div class="stats">
      ${stat('Total users', s.users, 'users')}
      ${stat('Approved products', s.approvedProducts, 'aproducts')}
      ${stat('Pending approvals', s.pendingProducts, 'approvals', s.pendingProducts ? 'warn' : '')}
      ${stat('Active rentals', s.activeRentals, 'arentals')}
      ${stat('Overdue rentals', s.overdueRentals, 'arentals', s.overdueRentals ? 'bad' : '')}
      ${stat('Transactions', s.transactions, 'payments')}
      ${stat('Rental volume', money(s.revenue), 'payments', 'good')}
      ${stat('Money in wallets', money(s.walletTotal), 'wallets')}
    </div>
    <h2 class="sec">Waiting for your approval</h2>`;
  c.append(approvalsTable(pending.slice(0, 5)));
  if (pending.length > 5) c.insertAdjacentHTML('beforeend', `<p style="margin-top:10px"><a href="#approvals">See all ${pending.length} pending products</a></p>`);
};

ADMIN_PAGES.users = async c => {
  const rows = await api('/api/admin/users');
  c.innerHTML = pageHead('Users', 'Registered customers');
  c.append(dataTable({
    rows, empty: 'No customers have registered yet.',
    onAction: async (act, id, btn) => {
      if (!await confirmBox({ title: 'Delete this user?', message: 'Their products, rentals and transactions are deleted too. This cannot be undone.', ok: 'Delete user', danger: true })) return;
      busy(btn, async () => { await api('/api/admin/users/delete', { id }); toast('User deleted.'); render(); });
    },
    cols: [
      { h: 'ID', f: r => r.id }, { h: 'Name', f: r => `<b>${esc(r.name)}</b>` }, { h: 'Email', f: r => esc(r.email) },
      { h: 'Phone', f: r => esc(r.phone || '—') }, { h: 'Wallet', cls: 'num', f: r => money(r.wallet) },
      { h: '', f: r => `<button class="btn btn-danger btn-sm" data-act="del" data-id="${r.id}" type="button">Delete</button>` },
    ],
  }));
};

ADMIN_PAGES.aproducts = async c => {
  const rows = await api('/api/admin/products');
  c.innerHTML = pageHead('Products', 'All products on RentMate');
  c.append(dataTable({
    rows, empty: 'No products yet.',
    onAction: async (act, id, btn) => {
      if (!await confirmBox({ title: 'Delete this product?', message: 'Its rental history is removed as well.', ok: 'Delete', danger: true })) return;
      busy(btn, async () => { await api('/api/admin/products/delete', { id }); toast('Product deleted.'); render(); });
    },
    cols: [
      { h: 'ID', f: r => r.id }, { h: 'Product', f: prodCell }, { h: 'Category', f: r => esc(r.category) },
      { h: 'Price / day', cls: 'num', f: r => money(r.price) }, { h: 'Seller', f: r => esc(r.seller) },
      { h: 'Status', f: r => badge(r.status) }, { h: 'Available', f: r => badge(truthy(r.available) ? 'YES' : 'NO') },
      { h: '', f: r => `<button class="btn btn-danger btn-sm" data-act="del" data-id="${r.id}" type="button">Delete</button>` },
    ],
  }));
};

ADMIN_PAGES.approvals = async c => {
  const rows = await api('/api/admin/approvals');
  c.innerHTML = pageHead('Pending Product Approvals', 'Approved products appear in the store straight away');
  c.append(approvalsTable(rows));
};

ADMIN_PAGES.arentals = async c => {
  const rows = await api('/api/admin/rentals');
  c.innerHTML = pageHead('All Rentals', 'Every rental on the platform');
  c.append(dataTable({
    rows, empty: 'No rentals yet.',
    cols: [
      { h: 'ID', f: r => r.id }, { h: 'Customer', f: r => esc(r.customer) }, { h: 'Seller', f: r => esc(r.seller) },
      { h: 'Product', f: r => `<b>${esc(r.product)}</b>` }, { h: 'Start', f: r => fmtDate(r.startDate) },
      { h: 'Due', f: r => fmtDate(r.dueDate) }, { h: 'Returned', f: r => fmtDate(r.returnDate) },
      { h: 'Amount', cls: 'num', f: r => money(r.amount) },
      { h: 'Status', f: r => badge(r.status) + (truthy(r.overdue) ? ' <span class="badge bad">Overdue</span>' : '') },
    ],
  }));
};

ADMIN_PAGES.payments = async c => {
  const rows = await api('/api/admin/payments');
  c.innerHTML = pageHead('Payment Transactions', 'Rentals, earnings and wallet top-ups');
  c.append(dataTable({
    rows, empty: 'No transactions yet.',
    cols: [
      { h: 'ID', f: r => r.id }, { h: 'Customer', f: r => esc(r.customer) },
      { h: 'Type', f: r => badge(r.type) }, { h: 'Date', f: r => fmtDateTime(r.txDate) },
      { h: 'Amount', cls: 'num', f: r => money(r.amount) },
    ],
  }));
};

ADMIN_PAGES.wallets = async c => {
  const rows = await api('/api/admin/wallets');
  const total = rows.reduce((a, r) => a + Number(r.wallet), 0);
  c.innerHTML = pageHead('Customer Wallets', 'Sorted by balance') +
    `<div class="stats" style="margin-bottom:14px">${stat('Customers', rows.length, 'users')}${stat('Total in wallets', money(total), 'wallets', 'good')}</div>`;
  c.append(dataTable({
    rows, empty: 'No customers yet.',
    cols: [
      { h: 'ID', f: r => r.id }, { h: 'Name', f: r => `<b>${esc(r.name)}</b>` },
      { h: 'Email', f: r => esc(r.email) }, { h: 'Wallet', cls: 'num', f: r => money(r.wallet) },
    ],
  }));
};

ADMIN_PAGES.addadmin = async c => {
  const admins = await api('/api/admin/admins');
  c.innerHTML = pageHead('Add Admin', 'Give another person access to the admin panel') + `
    <div class="split">
      <form class="card formcard" id="aform">
        <label>Username<input name="username" type="text" required autocomplete="off"></label>
        <label>Password<input name="password" type="password" minlength="4" required autocomplete="new-password" placeholder="At least 4 characters"></label>
        <button class="btn btn-primary btn-block" type="submit">Create admin</button>
      </form>
      <div><h2 class="sec" style="margin-top:0">Current admins</h2><div id="alist"></div></div>
    </div>`;
  $('#alist', c).append(dataTable({ rows: admins, cols: [{ h: 'ID', f: r => r.id }, { h: 'Username', f: r => `<b>${esc(r.username)}</b>` }] }));
  $('#aform', c).onsubmit = e => {
    e.preventDefault();
    busy($('button', e.target), async () => {
      await api('/api/admin/addAdmin', Object.fromEntries(new FormData(e.target)));
      toast('Admin created.'); render();
    });
  };
};

/* ---------------------------- global wiring ---------------------------- */
$('#search-form').addEventListener('submit', e => {
  e.preventDefault();
  S.query = $('#search-input').value.trim();
  if (location.hash === '#browse') render(); else location.hash = 'browse';
});
$('#logo-link').addEventListener('click', e => { e.preventDefault(); if (S.user) go(S.user.role === 'ADMIN' ? 'dashboard' : 'browse'); });
$('#backtop').addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('#subnav').addEventListener('click', e => {
  const a = e.target.closest('a');
  if (a && a.hash === location.hash) { e.preventDefault(); render(); }
});
$('#logout-btn').addEventListener('click', async () => {
  if (!await confirmBox({ title: 'Sign out?', message: 'You will need to sign in again to continue.', ok: 'Sign out' })) return;
  try { await api('/api/logout', {}); } catch (e) { /* ignore */ }
  clearSession(); authMode = 'login'; showAuth();
});

(async function boot() {
  if (S.token) {
    try { S.user = await api('/api/me'); enterApp(false); return; }
    catch (e) { clearSession(); }
  }
  showAuth();
})();
