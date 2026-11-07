/* ===================================================================
   RentMate v2 – cart, wishlist, ratings & reviews, return flow,
   safe deposit, damage deductions, alerts, extra admin pages.
   Loaded after app.js; it extends / overrides the pieces below.
   =================================================================== */
Object.assign(BADGE, { HELD: 'warn', REFUNDED: 'ok', PARTIAL: 'blue', FORFEITED: 'bad', NONE: '', DEPOSIT: 'teal', REFUND: 'ok', DAMAGE: 'bad', LATEFEE: 'bad' });
Object.assign(TX, { DEPOSIT: ['Safe deposit paid', -1], REFUND: ['Deposit refund', 1], DAMAGE: ['Damage charge', -1], LATEFEE: ['Late fee', -1] });

const LATE_RATE = 0.5;
const stars = (r, n) => r
  ? `<span class="rate-line"><b>${Number(r).toFixed(1)}</b><span class="stars" style="--p:${Number(r) / 5 * 100}%">★★★★★</span><span>(${n})</span></span>`
  : `<span class="rate-line muted">No reviews yet</span>`;
const findProduct = id => [S.products, S.wl, S.cartItems].flat().filter(Boolean).find(p => String(p.id) === String(id));
const cartDays = {};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ---------- top bar: alerts bell + cart ---------- */
$('#wallet-chip').insertAdjacentHTML('beforebegin',
  `<a class="tb-ic hidden" id="ic-bell" href="#alerts"><span>🔔</span>Alerts<i id="n-bell"></i></a>
   <a class="tb-ic hidden" id="ic-cart" href="#cart"><span>🛒</span>Cart<i id="n-cart"></i></a>`);
const setN = (id, n) => { $('#' + id).textContent = n > 0 ? (n > 99 ? '99+' : n) : ''; };
const _uw = updateWalletChip;
updateWalletChip = function () {
  _uw();
  const cu = S.user && S.user.role === 'CUSTOMER';
  $('#ic-bell').classList.toggle('hidden', !cu); $('#ic-cart').classList.toggle('hidden', !cu);
  if (cu) { setN('n-bell', (S.user.unread || 0) + (S.user.due || 0)); setN('n-cart', S.user.cart || 0); }
};

NAV.CUSTOMER = [['dashboard', 'Dashboard'], ['browse', 'Shop'], ['cart', 'Cart'], ['wishlist', 'Wishlist'], ['rentals', 'My Orders'],
  ['history', 'Order History'], ['wallet', 'Wallet'], ['addproduct', 'Sell an Item'], ['myproducts', 'My Listings'], ['alerts', 'Alerts']];
NAV.ADMIN = [['dashboard', 'Dashboard'], ['users', 'Users'], ['aproducts', 'Products'], ['approvals', 'Approvals'], ['arentals', 'Rentals'],
  ['deposits', 'Deposits & Damage'], ['reviews', 'Reviews'], ['payments', 'Payments'], ['wallets', 'Wallets'], ['addadmin', 'Add Admin']];

/* ---------- wishlist heart + add-to-cart (works on every card / modal) ---------- */
document.addEventListener('click', async e => {
  const w = e.target.closest('[data-wish]'), a = e.target.closest('[data-cart]');
  if (!w && !a) return;
  e.stopPropagation(); e.preventDefault();
  try {
    if (w) {
      const r = await api('/api/wishlist/toggle', { product_id: w.dataset.wish });
      w.classList.toggle('on', r.wished); w.textContent = r.wished ? '♥' : '♡';
      const p = findProduct(w.dataset.wish); if (p) p.wished = r.wished;
      toast(r.wished ? 'Saved to your wishlist.' : 'Removed from wishlist.');
      if (location.hash === '#wishlist') render();
    } else {
      const r = await api('/api/cart/add', { product_id: a.dataset.cart });
      S.user.cart = r.cart; updateWalletChip();
      toast('Added to cart.');
    }
  } catch (err) { toast(err.message, 'error'); }
}, true);

/* ---------- product card ---------- */
cardHtml = function (p, preview = false) {
  const avail = truthy(p.available), mine = S.user && p.sellerId === S.user.id;
  const dep = Number(p.deposit || p.price * 2);
  return `<article class="pcard ${avail ? '' : 'off'} ${preview ? 'preview' : ''}" data-id="${p.id}">
    ${preview || mine ? '' : `<button class="wish ${truthy(p.wished) ? 'on' : ''}" data-wish="${p.id}" title="Save for later" aria-label="Save for later" type="button">${truthy(p.wished) ? '♥' : '♡'}</button>`}
    ${imgBox(p)}
    <div class="pbody">
      <span class="tag">${esc(p.category)}</span>
      <h3 class="ptitle">${esc(p.name)}</h3>
      ${stars(p.rating, p.reviews)}
      <div>${priceHtml(p.price)} <span class="per">/ day</span></div>
      <div class="dep">+ <b>${money(dep)}</b> refundable deposit</div>
      <div class="seller">Sold by ${esc(p.seller)}${mine ? ' (you)' : ''}</div>
      <div class="stock ${avail ? 'ok' : 'bad'}">${avail ? '● Available now' : '● Currently rented out'}</div>
      ${preview ? '<button class="btn btn-primary btn-block" type="button" tabindex="-1">Rent now</button>'
        : mine ? '<button class="btn btn-block" type="button">View your listing</button>'
        : avail ? `<div class="btn-row"><button class="btn btn-primary" data-cart="${p.id}" type="button">Add to cart</button><button class="btn btn-buy" type="button">Rent now</button></div>`
        : '<button class="btn btn-block" type="button">View details</button>'}
    </div></article>`;
};

/* ---------- product page (modal) with deposit + reviews ---------- */
openProduct = function (p) {
  const mine = p.sellerId === S.user.id, avail = truthy(p.available), canRent = avail && !mine;
  const dep = Number(p.deposit || p.price * 2);
  const m = openModal(`
    <div class="pd">
      <div>${imgBox(p, 'lg')}</div>
      <div class="pd-info">
        <span class="tag">${esc(p.category)}</span>
        <h2>${esc(p.name)}</h2>
        ${stars(p.rating, p.reviews)}
        <div class="muted">Sold by <b>${esc(p.seller)}</b>${mine ? ' (you)' : ''}</div>
        <hr>
        <div>${priceHtml(p.price)} <span class="per">per day</span></div>
        <div class="money-box"><div class="r"><span>Refundable safe deposit</span><b>${money(dep)}</b></div>
          <small class="muted">Returned to your wallet after the owner inspects the item. Late fee: ${LATE_RATE * 100}% of the daily price per overdue day. Damage is deducted from the deposit (minor 25% · moderate 50% · major 100%).</small></div>
        <p class="desc">${p.description ? esc(p.description) : '<span class="muted">The seller has not added a description.</span>'}</p>
        <div class="stock ${avail ? 'ok' : 'bad'}">${avail ? '● Available now' : '● Currently rented out'}</div>
      </div>
      <div class="pd-buy card">
        <span class="lbl">Rental period (days)</span>
        <div class="stepper"><button type="button" data-step="-1" aria-label="Fewer days">−</button>
          <input id="days" type="number" min="1" max="365" value="1" aria-label="Number of days">
          <button type="button" data-step="1" aria-label="More days">+</button></div>
        <div class="quick">${[1, 3, 7, 14, 30].map(n => `<button class="qk" type="button" data-d="${n}">${n} day${n > 1 ? 's' : ''}</button>`).join('')}</div>
        <div class="sum">
          <div><span>Rent × <b id="s-days">1</b> day(s)</span><span id="s-sub"></span></div>
          <div><span>Safe deposit (refundable)</span><span>${money(dep)}</span></div>
          <div><span>Return by</span><b id="s-due"></b></div>
          <div><span>Wallet balance</span><span>${money(S.user.wallet)}</span></div>
          <div class="total"><span>Pay now</span><span id="s-total"></span></div>
        </div>
        <div class="notice warn hidden" id="s-warn">Not enough balance. <a href="#wallet" id="s-add">Add money to wallet</a></div>
        <button class="btn btn-buy btn-block" id="do-rent" type="button" ${canRent ? '' : 'disabled'}>${mine ? 'This is your own listing' : avail ? 'Rent now' : 'Currently unavailable'}</button>
        ${canRent ? `<button class="btn btn-primary btn-block" data-cart="${p.id}" type="button" style="margin-top:8px">Add to cart</button>` : ''}
        ${mine ? '' : `<button class="linkbtn" data-wish="${p.id}" type="button" style="margin-top:8px">${truthy(p.wished) ? '♥ Saved to wishlist' : '♡ Add to wishlist'}</button>`}
      </div>
    </div>
    <h3 class="sec" style="margin-top:22px">Customer reviews</h3><div id="revs"><span class="muted">Loading reviews…</span></div>`);
  const input = $('#days', m.el);
  const days = () => Math.min(365, Math.max(1, parseInt(input.value, 10) || 1));
  const update = () => {
    const d = days(), rent = p.price * d;
    $('#s-days', m.el).textContent = d; $('#s-sub', m.el).textContent = money(rent);
    $('#s-total', m.el).textContent = money(rent + dep); $('#s-due', m.el).textContent = addDays(d);
    $('#s-warn', m.el).classList.toggle('hidden', !(canRent && rent + dep > Number(S.user.wallet)));
  };
  input.oninput = update; input.onblur = () => { input.value = days(); update(); };
  $$('[data-step]', m.el).forEach(b => b.onclick = () => { input.value = Math.min(365, Math.max(1, days() + (+b.dataset.step))); update(); });
  $$('[data-d]', m.el).forEach(b => b.onclick = () => { input.value = b.dataset.d; update(); });
  $('#s-add', m.el).onclick = () => m.close();
  $('#do-rent', m.el).onclick = e => busy(e.currentTarget, async () => {
    const r = await api('/api/rent', { product_id: p.id, days: days() });
    m.close(); await refreshMe();
    toast(`Rented “${p.name}”. Paid ${money(r.amount)} + ${money(r.deposit)} refundable deposit. Return by ${fmtDate(r.dueDate)}.`);
    go('rentals');
  });
  update();
  api('/api/reviews?product_id=' + p.id).then(list => {
    const box = $('#revs', m.el); if (!box) return;
    if (!list.length) { box.innerHTML = '<p class="muted">No reviews yet. Rent and return this item to be the first to review it.</p>'; return; }
    const avg = list.reduce((a, r) => a + r.rating, 0) / list.length;
    box.innerHTML = `<div class="row gap" style="align-items:flex-start;gap:30px;flex-wrap:wrap"><div><div style="font-size:34px;font-weight:600">${avg.toFixed(1)}</div>${stars(avg, list.length)}</div>
      <div class="bars" style="flex:1;min-width:220px">${[5, 4, 3, 2, 1].map(s => { const n = list.filter(r => r.rating === s).length; return `<div class="b"><span>${s} star</span><div class="t"><i style="width:${n / list.length * 100}%"></i></div><span>${n}</span></div>`; }).join('')}</div></div>
      ${list.map(r => `<div class="rev"><b>${esc(r.customer)}</b> · <span class="stars" style="--p:${r.rating * 20}%">★★★★★</span> <b>${esc(r.title || '')}</b>
        <div class="muted" style="font-size:12px">Reviewed on ${fmtDate(r.createdAt)} · Verified rental</div>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}</div>`).join('')}`;
  }).catch(() => { const b = $('#revs', m.el); if (b) b.textContent = ''; });
};

/* ---------- orders: tracker, deposit box, return + rate buttons ---------- */
rentalCard = function (r) {
  const active = r.status === 'ACTIVE', returned = r.status === 'RETURNED', due = active ? dueInfo(r.dueDate) : null;
  const dep = Number(r.deposit || 0), late = Number(r.lateFee || 0), dmg = Number(r.damageFee || 0), ds = r.depositStatus;
  const settled = ['REFUNDED', 'PARTIAL', 'FORFEITED'].includes(ds) || (returned && !dep);
  const steps = [['Rented', true], ['In use', true], ['Returned', returned], ['Deposit settled', settled]];
  let box = '';
  if (dep > 0) {
    box = `<div class="money-box">
      <div class="r"><span>Rent paid</span><span>${money(r.amount)}</span></div>
      <div class="r"><span>Safe deposit ${badge(ds)}</span><span>${money(dep)}</span></div>
      ${late > 0 ? `<div class="r"><span>Late fee (taken from deposit)</span><span class="neg">−${money(late)}</span></div>` : ''}
      ${dmg > 0 ? `<div class="r"><span>Damage charge${r.damageNote ? ' – ' + esc(r.damageNote) : ''}</span><span class="neg">−${money(dmg)}</span></div>` : ''}
      ${settled ? `<div class="r"><b>Deposit refunded to wallet</b><b class="pos">${money(dep - late - dmg)}</b></div>`
        : `<small class="muted">${returned ? '⏳ Waiting for the owner to inspect the item, then your deposit is refunded.' : 'Return on time and undamaged to get the full deposit back.'}</small>`}
    </div>`;
  }
  return `<article class="order">
    <div class="order-head">
      <div><small>RENTED ON</small>${fmtDate(r.startDate)}</div>
      <div><small>RENT PAID</small>${money(r.amount)}</div>
      <div><small>${active ? 'DUE DATE' : 'RETURNED ON'}</small>${active ? fmtDate(r.dueDate) : fmtDate(r.returnDate)}</div>
      <div class="grow"></div><div><small>RENTAL #</small>${r.id}</div>
    </div>
    <div class="order-body">
      ${imgBox({ name: r.product, category: r.category, image: r.image })}
      <div class="info">
        <h3>${esc(r.product)}</h3>
        <span class="muted">${esc(r.category)} · Sold by ${esc(r.seller)}</span>
        <div>${badge(r.status)} ${active ? `<span class="badge ${due.cls}">${due.text}</span>` : ''}</div>
        <div class="track">${steps.map(([l, d]) => `<div class="${d ? 'done' : ''}">${l}</div>`).join('')}</div>
        ${box}
      </div>
      <div class="acts2">
        ${active ? `<button class="btn btn-primary" data-return="${r.id}" data-name="${esc(r.product)}" data-due="${String(r.dueDate).slice(0, 10)}" data-price="${r.dayPrice || 0}" data-dep="${dep}" type="button">Return item</button>` : ''}
        ${returned && !Number(r.reviewed) ? `<button class="btn btn-buy" data-rate="${r.id}" data-name="${esc(r.product)}" type="button">★ Rate &amp; review</button>` : ''}
        ${returned && Number(r.reviewed) ? '<span class="badge ok">Reviewed ✓</span>' : ''}
      </div>
    </div></article>`;
};

bindReturns = function (c) {
  c.addEventListener('click', e => {
    const b = e.target.closest('[data-return]'), rb = e.target.closest('[data-rate]');
    if (b) returnModal(b.dataset); else if (rb) rateModal(rb.dataset.rate, rb.dataset.name);
  });
};

function returnModal(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const lateDays = Math.max(0, Math.round((t - new Date(d.due + 'T00:00:00')) / 864e5));
  const dep = Number(d.dep), late = Math.min(dep, Math.round(lateDays * Number(d.price) * LATE_RATE * 100) / 100);
  const m = openModal(`<h2>Return “${esc(d.name)}”</h2>
    <p class="muted">Tell the owner what condition the item is in. They will inspect it and settle your deposit.</p>
    <label>Condition notes <span class="muted">(optional)</span><textarea id="rnote" rows="3" maxlength="500" placeholder="e.g. Works perfectly, small scratch on the side that was already there"></textarea></label>
    <div class="money-box">
      <div class="r"><span>Safe deposit held</span><span>${money(dep)}</span></div>
      ${lateDays ? `<div class="r"><span>Late by ${plural(lateDays, 'day')}</span><span class="neg">−${money(late)}</span></div>` : '<div class="r"><span>Returned on time</span><span class="pos">No late fee</span></div>'}
      <div class="r"><b>Refundable after inspection</b><b>${money(dep - late)}</b></div>
      <small class="muted">If the owner finds damage, minor = 25%, moderate = 50%, major = 100% of the remaining deposit is deducted.</small></div>
    <div class="row end gap" style="margin-top:16px"><button class="btn btn-light" data-no type="button">Cancel</button><button class="btn btn-primary" data-yes type="button">Confirm return</button></div>`, { small: true });
  $('[data-no]', m.el).onclick = () => m.close();
  $('[data-yes]', m.el).onclick = e => busy(e.currentTarget, async () => {
    const r = await api('/api/return', { rental_id: d.return, note: $('#rnote', m.el).value });
    m.close(); await refreshMe();
    toast(`Item returned.${r.lateFee ? ' Late fee ' + money(r.lateFee) + ' charged.' : ''} Your deposit is refunded after inspection.`);
    await render();
    rateModal(d.return, d.name);
  });
}

function rateModal(rid, name) {
  let rating = 0;
  const m = openModal(`<h2>Rate “${esc(name)}”</h2>
    <div class="starpick" id="sp">${[1, 2, 3, 4, 5].map(i => `<span data-s="${i}" role="button" aria-label="${i} stars">★</span>`).join('')}</div>
    <label>Headline <span class="muted">(optional)</span><input id="rt" maxlength="120" placeholder="What's most important to know?"></label>
    <label>Review <span class="muted">(optional)</span><textarea id="rc" rows="4" maxlength="1000" placeholder="How was the item and the owner?"></textarea></label>
    <div class="row end gap" style="margin-top:14px"><button class="btn btn-light" data-no type="button">Maybe later</button><button class="btn btn-primary" data-yes type="button">Submit review</button></div>`, { small: true });
  const paint = n => $$('#sp span', m.el).forEach(s => s.classList.toggle('on', +s.dataset.s <= n));
  $('#sp', m.el).onclick = e => { const s = e.target.closest('[data-s]'); if (s) { rating = +s.dataset.s; paint(rating); } };
  $('#sp', m.el).onmouseover = e => { const s = e.target.closest('[data-s]'); if (s) paint(+s.dataset.s); };
  $('#sp', m.el).onmouseleave = () => paint(rating);
  $('[data-no]', m.el).onclick = () => m.close();
  $('[data-yes]', m.el).onclick = e => {
    if (!rating) return toast('Please tap a star rating first.', 'error');
    busy(e.currentTarget, async () => {
      await api('/api/review/add', { rental_id: rid, rating, title: $('#rt', m.el).value, comment: $('#rc', m.el).value });
      m.close(); toast('Thanks for your review!'); render();
    });
  };
}

/* ---------- owner / admin: inspect returned item, rate damage, settle deposit ---------- */
function settleModal(r, endpoint, done) {
  const held = Number(r.deposit) - Number(r.lateFee || 0);
  const L = [['NONE', 'No damage', 0], ['MINOR', 'Minor damage (scratches, wear)', .25], ['MODERATE', 'Moderate damage (needs repair)', .5], ['MAJOR', 'Major damage / missing / broken', 1]];
  const m = openModal(`<h2>Inspect “${esc(r.product)}”</h2>
    <p class="muted">Returned by <b>${esc(r.customer)}</b>. Deposit held: <b>${money(held)}</b>${Number(r.lateFee) ? ` (after ${money(r.lateFee)} late fee)` : ''}.</p>
    ${r.returnNote ? `<div class="notice info">Customer note: ${esc(r.returnNote)}</div>` : ''}
    <div class="opts">${L.map(([k, t, p], i) => `<label class="opt"><input type="radio" name="lvl" value="${k}" ${i === 0 ? 'checked' : ''}>
      <span><b>${t}</b><br><small class="muted">${p ? `Keep ${money(held * p)} · refund ${money(held * (1 - p))}` : `Refund full ${money(held)}`}</small></span></label>`).join('')}</div>
    <label>Damage description <span class="muted">(required if damaged)</span><textarea id="dn" rows="3" maxlength="500" placeholder="What is damaged?"></textarea></label>
    <div class="row end gap" style="margin-top:14px"><button class="btn btn-light" data-no type="button">Cancel</button><button class="btn btn-primary" data-yes type="button">Settle deposit</button></div>`, { small: true });
  $('[data-no]', m.el).onclick = () => m.close();
  $('[data-yes]', m.el).onclick = e => busy(e.currentTarget, async () => {
    const lvl = $('input[name=lvl]:checked', m.el).value;
    const res = await api(endpoint, { rental_id: r.id, level: lvl, note: $('#dn', m.el).value });
    m.close(); toast(`Settled. Refunded ${money(res.refund)} to the customer${res.deduction ? `, ${money(res.deduction)} deducted for damage` : ''}.`); done();
  });
}

const depCols = (withSeller) => [
  { h: 'Rental #', f: r => r.id }, { h: 'Product', f: r => `<b>${esc(r.product)}</b>` },
  { h: 'Customer', f: r => esc(r.customer) }, ...(withSeller ? [{ h: 'Owner', f: r => esc(r.seller) }] : []),
  { h: 'Returned', f: r => fmtDate(r.returnDate) }, { h: 'Deposit', cls: 'num', f: r => money(r.deposit) },
  { h: 'Late fee', cls: 'num', f: r => Number(r.lateFee) ? `<span class="neg">${money(r.lateFee)}</span>` : '—' },
  { h: 'Damage', cls: 'num', f: r => Number(r.damageFee) ? `<span class="neg">${money(r.damageFee)}</span>` : '—' },
  { h: 'Deposit status', f: r => badge(r.depositStatus) },
  { h: '', f: r => r.status === 'RETURNED' && r.depositStatus === 'HELD' ? `<button class="btn btn-primary btn-sm" data-act="settle" data-id="${r.id}" type="button">Inspect &amp; settle</button>` : '' },
];

/* ---------- cart ---------- */
CUSTOMER_PAGES.cart = async c => {
  const items = await api('/api/cart');
  S.cartItems = items; S.user.cart = items.length; updateWalletChip();
  if (!items.length) {
    c.innerHTML = pageHead('Shopping Cart') + `<div class="empty big">🛒<p>Your cart is empty.</p><a class="btn btn-primary" href="#browse">Continue shopping</a></div>`;
    return;
  }
  c.innerHTML = pageHead('Shopping Cart', 'Choose how many days you need each item') +
    `<div class="cartwrap"><div class="card" id="clist" style="padding:0"></div><aside class="card sumcard" id="csum"></aside></div>`;
  const d = p => Math.min(365, Math.max(1, cartDays[p.id] || 1));
  const draw = () => {
    const live = items.filter(p => truthy(p.available));
    const rent = live.reduce((a, p) => a + p.price * d(p), 0), dep = live.reduce((a, p) => a + Number(p.deposit), 0), total = rent + dep;
    $('#clist', c).innerHTML = items.map(p => `<div class="citem">
      ${imgBox(p)}
      <div><h3>${esc(p.name)}</h3>${stars(p.rating, p.reviews)}
        <div class="stock ${truthy(p.available) ? 'ok' : 'bad'}">${truthy(p.available) ? '● Available' : '● Currently rented out – not included in checkout'}</div>
        <div class="muted">Sold by ${esc(p.seller)} · ${money(p.price)}/day · ${money(p.deposit)} refundable deposit</div>
        <div><span class="mini-step"><button type="button" data-cs="-1" data-id="${p.id}">−</button><input class="cd" data-id="${p.id}" type="number" min="1" max="365" value="${d(p)}"><button type="button" data-cs="1" data-id="${p.id}">+</button></span>
          &nbsp;day(s) · <button class="linkbtn" data-crm="${p.id}" type="button">Delete</button> · <button class="linkbtn" data-wish="${p.id}" type="button">${truthy(p.wished) ? '♥ Saved' : 'Save for later'}</button></div></div>
      <div style="text-align:right"><b style="font-size:18px">${money(p.price * d(p))}</b><div class="muted" style="font-size:12px">rent for ${plural(d(p), 'day')}</div></div></div>`).join('');
    $('#csum', c).innerHTML = `<h3 style="margin-bottom:10px">Order summary</h3>
      <div class="l"><span>Rent (${plural(live.length, 'item')})</span><span>${money(rent)}</span></div>
      <div class="l"><span>Refundable deposits</span><span>${money(dep)}</span></div>
      <div class="l t"><span>Total now</span><span>${money(total)}</span></div>
      <div class="l muted"><span>Wallet balance</span><span>${money(S.user.wallet)}</span></div>
      ${total > Number(S.user.wallet) ? '<div class="notice warn">Not enough balance. <a href="#wallet">Add money</a></div>' : ''}
      <button class="btn btn-buy btn-block" id="checkout" type="button" ${live.length && total <= Number(S.user.wallet) ? '' : 'disabled'}>Proceed to checkout</button>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Deposits come back to your wallet after the owner inspects each returned item.</p>`;
  };
  draw();
  c.onchange = e => { const i = e.target.closest('.cd'); if (i) { cartDays[i.dataset.id] = Math.min(365, Math.max(1, parseInt(i.value, 10) || 1)); draw(); } };
  c.onclick = async e => {
    const s = e.target.closest('[data-cs]'), rm = e.target.closest('[data-crm]');
    if (s) { cartDays[s.dataset.id] = Math.min(365, Math.max(1, (cartDays[s.dataset.id] || 1) + (+s.dataset.cs))); draw(); }
    else if (rm) busy(rm, async () => { await api('/api/cart/remove', { product_id: rm.dataset.crm }); render(); });
    else if (e.target.closest('#checkout')) busy(e.target.closest('#checkout'), async () => {
      const live = items.filter(p => truthy(p.available));
      const r = await api('/api/cart/checkout', { items: live.map(p => `${p.id}:${d(p)}`).join(',') });
      r.errors.forEach(x => { const p = items.find(i => i.id === x.id); toast(`${p ? p.name : 'Item'}: ${x.error}`, 'error'); });
      await refreshMe();
      if (r.rented) { toast(`${plural(r.rented, 'item')} rented. ${money(r.paid)} paid (incl. refundable deposits).`); go('rentals'); } else render();
    });
  };
};

/* ---------- wishlist ---------- */
CUSTOMER_PAGES.wishlist = async c => {
  S.wl = await api('/api/wishlist');
  c.innerHTML = pageHead('Your Wishlist', 'Items you saved for later') + (S.wl.length ? `<div class="grid" id="wgrid">${S.wl.map(p => cardHtml(p)).join('')}</div>`
    : `<div class="empty big">♡<p>Nothing saved yet. Tap the heart on any product.</p><a class="btn btn-primary" href="#browse">Browse products</a></div>`);
  const g = $('#wgrid', c);
  if (g) g.onclick = e => { const card = e.target.closest('.pcard'); if (card) { const p = findProduct(card.dataset.id); if (p) openProduct(p); } };
};

/* ---------- alerts: due-date reminders + activity ---------- */
const remHtml = r => {
  const n = Number(r.daysLeft), nm = esc(r.product);
  const [cls, txt] = n < 0 ? ['late', `⚠️ “${nm}” is overdue by ${plural(-n, 'day')}. Late fees are being charged – return it now.`]
    : n === 0 ? ['due', `⏰ “${nm}” is due today. Return it today to avoid late fees.`]
    : ['due', `⏰ “${nm}” is due in ${plural(n, 'day')} (${fmtDate(r.dueDate)}).`];
  return `<div class="alert-row ${cls}" style="border-radius:8px;border:1px solid var(--line)"><span style="flex:1">${txt}</span><a class="btn btn-sm btn-light" href="#rentals">Go to orders</a></div>`;
};
CUSTOMER_PAGES.alerts = async c => {
  const n = await api('/api/notifications');
  c.innerHTML = pageHead('Alerts & reminders', 'Due dates, rentals, returns and deposits') +
    (n.reminders.length ? `<div class="rem">${n.reminders.map(remHtml).join('')}</div>` : '') +
    `<div class="tablecard">${n.items.length ? n.items.map(i => `<div class="alert-row ${Number(i.isRead) ? '' : 'unread'}"><span style="flex:1">${esc(i.message)}</span><small class="muted">${fmtDateTime(i.createdAt)}</small></div>`).join('')
      : '<div class="empty">No notifications yet.</div>'}</div>`;
  await api('/api/notifications/read', {});
  S.user.unread = 0; updateWalletChip();
};

const _dash = CUSTOMER_PAGES.dashboard;
CUSTOMER_PAGES.dashboard = async c => {
  await _dash(c);
  try {
    const n = await api('/api/notifications');
    if (n.reminders.length) { const box = document.createElement('div'); box.className = 'rem'; box.innerHTML = n.reminders.map(remHtml).join(''); $('.welcome', c).after(box); }
  } catch (e) { /* reminders are optional */ }
};

/* ---------- my listings: inspect returned items ---------- */
const _mp = CUSTOMER_PAGES.myproducts;
CUSTOMER_PAGES.myproducts = async c => {
  await _mp(c);
  const rows = (await api('/api/my/lent')).filter(r => r.status === 'RETURNED' && Number(r.deposit) > 0);
  c.insertAdjacentHTML('beforeend', `<h2 class="sec">Returned items – inspect &amp; settle deposit</h2>
    <p class="muted" style="margin:-6px 0 12px">Check each returned item. If it is damaged, choose the damage level and the matching share of the deposit is paid to you; the rest is refunded to the customer.</p>`);
  c.append(dataTable({ rows, empty: 'No returned items yet.', cols: depCols(false),
    onAction: (act, id) => settleModal(rows.find(x => String(x.id) === id), '/api/settle', render) }));
};

/* ---------- admin: deposits & damage, reviews ---------- */
ADMIN_PAGES.deposits = async c => {
  const rows = await api('/api/admin/deposits');
  c.innerHTML = pageHead('Deposits & Damage', 'Safe deposits held, late fees and damage charges. Admins can settle any returned item.');
  c.append(dataTable({ rows, empty: 'No deposits yet.', cols: depCols(true),
    onAction: (act, id) => settleModal(rows.find(x => String(x.id) === id), '/api/admin/settle', render) }));
};
ADMIN_PAGES.reviews = async c => {
  const rows = await api('/api/admin/reviews');
  c.innerHTML = pageHead('Reviews', 'Moderate customer ratings');
  c.append(dataTable({ rows, empty: 'No reviews yet.',
    onAction: async (act, id, btn) => {
      if (!await confirmBox({ title: 'Delete this review?', message: 'It will disappear from the product page.', ok: 'Delete', danger: true })) return;
      busy(btn, async () => { await api('/api/admin/reviews/delete', { id }); toast('Review deleted.'); render(); });
    },
    cols: [
      { h: 'ID', f: r => r.id }, { h: 'Product', f: r => `<b>${esc(r.product)}</b>` }, { h: 'Customer', f: r => esc(r.customer) },
      { h: 'Rating', f: r => `<span class="stars" style="--p:${r.rating * 20}%">★★★★★</span>` },
      { h: 'Review', f: r => `<b>${esc(r.title || '')}</b> ${esc(r.comment || '')}` }, { h: 'Date', f: r => fmtDate(r.createdAt) },
      { h: '', f: r => `<button class="btn btn-danger btn-sm" data-act="del" data-id="${r.id}" type="button">Delete</button>` },
    ] }));
};
