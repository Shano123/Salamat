/* RSBRI Fashion — storefront prototype
   Vanilla JS, hash routing so it runs on any static host.
   URL shape mirrors the PRD: #/en-pk/women/unstitched/<product-slug> */
(function () {
  'use strict';

  var R = window.RSBRI;
  var S = R.STORE;
  var BASE = '#/' + S.code + '/';
  var DEPT_SLUG = { women: 'women', home: 'bedding-home' };
  var SLUG_DEPT = { 'women': 'women', 'bedding-home': 'home' };
  var PAGE_SIZE = 8;

  /* ---------------- utilities ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return 'Rs. ' + Math.round(n).toLocaleString('en-PK'); }
  function ic(n, c) { return '<svg class="icon ' + (c || '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function now(p) { return p.sale || p.price; }
  function pctOff(p) { return p.sale ? Math.round((1 - p.sale / p.price) * 100) : 0; }
  function byId(id) { return R.PRODUCTS.filter(function (p) { return p.id === id; })[0]; }
  function bySlug(s) { return R.PRODUCTS.filter(function (p) { return p.slug === s; })[0]; }
  function productUrl(p) { return BASE + DEPT_SLUG[p.dept] + '/' + p.cat + '/' + p.slug; }
  function catName(dept, slug) { var c = R.DEPARTMENTS[dept].cats.filter(function (c) { return c.slug === slug; })[0]; return c ? c.name : slug; }
  function waLink(text) { return 'https://wa.me/' + S.whatsapp + '?text=' + encodeURIComponent(text); }
  function waDisplay() { var n = S.whatsapp; return '+' + n.slice(0, 2) + ' ' + n.slice(2, 5) + ' ' + n.slice(5); } // 923001234567 → +92 300 1234567
  function absUrl(hash) { return location.href.split('#')[0] + hash; }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('rsbri:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('rsbri:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  /* Language comes from the URL prefix (/en-pk/ or /ur-pk/, PRD §5), then the saved preference. */
  var LANG = (location.hash.match(/^#\/(en|ur)-pk(\/|\?|$)/) || [])[1] || store.get('lang', 'en');
  BASE = '#/' + LANG + '-pk/';
  /* T(english, urdu): for copy with inline markup that the text-node translator can't reorder. */
  function T(en, ur) { return LANG === 'ur' ? ur : en; }
  function otherLangHash() {
    var other = LANG === 'ur' ? 'en' : 'ur', h = location.hash || BASE;
    return /^#\/(en|ur)-pk/.test(h) ? h.replace(/^#\/(en|ur)-pk/, '#/' + other + '-pk') : '#/' + other + '-pk/' + h.replace(/^#\/?/, '');
  }

  var state = {
    cart: store.get('cart', []),
    wish: store.get('wish', []),
    city: store.get('city', 'Lahore'),
    user: store.get('user', null),
    orders: store.get('orders', []),
    giftWrap: store.get('giftWrap', false),
    code: store.get('code', null)
  };

  /* ================= back office (demo): stock, staff, affiliates, activity =================
     Prototype only: everything is kept in this browser's localStorage so the flows can be
     tried end to end. On the live store this data lives in Shopify (see README). */

  /* ---- stock: one quantity per product × colour × size ---- */
  function variantsOf(p) {
    var sizes = p.sizes || p.bedSizes || [null], out = [];
    p.colors.forEach(function (c, ci) { sizes.forEach(function (s) { out.push({ c: ci, s: s, k: p.id + '|' + ci + '|' + (s || '') }); }); });
    return out;
  }
  function seedStock() {
    var st = {};
    R.PRODUCTS.forEach(function (p, i) {
      variantsOf(p).forEach(function (v, j) {
        st[v.k] = p.soldOut.indexOf(v.s) > -1 ? 0 : p.lowStock ? 1 + (j % 3) : 5 + ((i * 7 + j * 5) % 26);
      });
    });
    return st;
  }
  var STOCK = (function () {
    var saved = store.get('stock', null), seeded = seedStock();
    if (saved) Object.keys(seeded).forEach(function (k) { if (typeof saved[k] === 'number') seeded[k] = saved[k]; });
    store.set('stock', seeded);
    return seeded;
  })();
  var SETTINGS = store.get('settings', { lowStockAt: 5 });
  function stockOf(p, c, s) { var v = STOCK[p.id + '|' + (c || 0) + '|' + (s || '')]; return typeof v === 'number' ? v : 0; }
  function totalStock(p) { return variantsOf(p).reduce(function (a, v) { return a + (STOCK[v.k] || 0); }, 0); }
  function isOut(p, c, s) { return stockOf(p, c, s) <= 0; }
  function setStock(k, q, reason, who) {
    var before = STOCK[k] || 0; q = Math.max(0, Math.round(+q || 0));
    if (q === before) return false;
    STOCK[k] = q; store.set('stock', STOCK);
    logActivity('Stock', variantLabel(k), before + ' → ' + q + (reason ? ' · ' + reason : ''), who);
    return true;
  }
  function variantLabel(k) {
    var a = k.split('|'), p = byId(a[0]); if (!p) return k;
    return p.sku + ' ' + p.title + ' · ' + p.colors[+a[1]].name + (a[2] ? ' · ' + a[2] : '');
  }

  /* ---- staff & roles ---- */
  var PERMS = [
    ['overview', 'See dashboard'], ['orders.view', 'See orders'], ['orders.edit', 'Confirm & update orders'],
    ['stock.view', 'See stock'], ['stock.edit', 'Change stock'], ['affiliates.manage', 'Manage affiliates & payouts'],
    ['staff.manage', 'Add staff & change access'], ['activity.view', 'See activity log']
  ];
  var ROLES = {
    owner: { name: 'Owner', perms: PERMS.map(function (x) { return x[0]; }) },
    manager: { name: 'Manager', perms: ['overview', 'orders.view', 'orders.edit', 'stock.view', 'stock.edit', 'affiliates.manage', 'activity.view'] },
    orders: { name: 'Order staff', perms: ['overview', 'orders.view', 'orders.edit', 'stock.view'] },
    stock: { name: 'Stock keeper', perms: ['overview', 'stock.view', 'stock.edit'] },
    content: { name: 'Content editor', perms: ['overview', 'stock.view'] }
  };
  var STAFF = store.get('staff', null) || [
    { id: 'u1', name: 'Rizwan', login: 'rizwan', role: 'owner', pin: '1234', active: true },
    { id: 'u2', name: 'Sana (demo)', login: '0300-1111111', role: 'orders', pin: '2222', active: true },
    { id: 'u3', name: 'Bilal (demo)', login: '0300-2222222', role: 'stock', pin: '3333', active: true }
  ];
  function saveStaff() { store.set('staff', STAFF); }
  function adminUser() { var id = store.get('adminUser', null); return STAFF.filter(function (u) { return u.id === id && u.active; })[0] || null; }
  function can(perm, u) { u = u || adminUser(); return !!(u && ROLES[u.role] && ROLES[u.role].perms.indexOf(perm) > -1); }

  /* ---- activity log ---- */
  var ACTIVITY = store.get('activity', []);
  function logActivity(type, target, detail, who) {
    var u = adminUser();
    ACTIVITY.unshift({ at: Date.now(), who: who || (u ? u.name : 'Website'), type: type, target: target, detail: detail });
    if (ACTIVITY.length > 400) ACTIVITY.length = 400;
    store.set('activity', ACTIVITY);
  }

  /* ---- affiliates ---- */
  var AFFSET = store.get('affset', { rate: 10, customerPct: 5, days: 30 });
  var AFFILIATES = store.get('affiliates', null) || [
    { code: 'AYESHA10', name: 'Ayesha Khan (demo)', phone: '0301-2345678', handle: '@ayesha.styles', city: 'Lahore', status: 'active', clicks: 148, paid: 0, joined: Date.now() - 40 * 864e5 },
    { code: 'HIRAHOME', name: 'Hira Home Decor (demo)', phone: '0333-4567890', handle: '@hira.homedecor', city: 'Karachi', status: 'active', clicks: 96, paid: 500, joined: Date.now() - 25 * 864e5 },
    { code: 'SADIA', name: 'Sadia Bridal Tips (demo)', phone: '0345-1112233', handle: '@sadia.bridal', city: 'Islamabad', status: 'pending', clicks: 0, paid: 0, joined: Date.now() - 2 * 864e5 }
  ];
  function saveAffiliates() { store.set('affiliates', AFFILIATES); }
  function affByCode(code, activeOnly) {
    code = String(code || '').trim().toUpperCase();
    var a = AFFILIATES.filter(function (x) { return x.code === code; })[0];
    return a && (!activeOnly || a.status === 'active') ? a : null;
  }
  function affStats(a) {
    var os = state.orders.filter(function (o) { return o.aff === a.code && o.status >= 0; });
    var sales = os.reduce(function (s, o) { return s + o.totals.total; }, 0);
    // commission is earned once an order is delivered; until then it is pending
    var earned = os.filter(function (o) { return o.status === 4; }).reduce(function (s, o) { return s + (o.commission || 0); }, 0);
    var pending = os.filter(function (o) { return o.status < 4; }).reduce(function (s, o) { return s + (o.commission || 0); }, 0);
    return { orders: os.length, sales: sales, earned: earned, pending: pending, balance: Math.max(0, earned - (a.paid || 0)) };
  }
  /* referral link: ?ref=CODE on any page (hash query or real query string) */
  function captureRef() {
    var m = (location.search.match(/[?&]ref=([^&]+)/) || location.hash.match(/[?&]ref=([^&]+)/) || [])[1];
    if (!m) return;
    var a = affByCode(decodeURIComponent(m), true); if (!a) return;
    var cur = store.get('ref', null);
    if (!cur || cur.code !== a.code) { a.clicks = (a.clicks || 0) + 1; saveAffiliates(); }
    store.set('ref', { code: a.code, at: Date.now() });
    if (!state.code) { state.code = a.code; store.set('code', a.code); }
    toast(T(AFFSET.customerPct + '% off applied — referred by ' + a.name.replace(/ \(demo\)$/, ''), a.name.replace(/ \(demo\)$/, '') + ' کے حوالے سے ' + AFFSET.customerPct + '% رعایت لاگو'));
  }
  function activeRef() {
    var r = store.get('ref', null);
    return r && Date.now() - r.at < AFFSET.days * 864e5 && affByCode(r.code, true) ? r.code : null;
  }

  /* demo orders so the admin isn't empty on first open */
  function seedOrders() {
    if (store.get('ordersSeeded', false)) return [];
    store.set('ordersSeeded', true);
    var P = R.PRODUCTS, d = 864e5, t0 = Date.now();
    function o(id, ago, name, city, pay, status, lines, aff) {
      var sub = lines.reduce(function (s, l) { return s + now(P[l[0]]) * l[3]; }, 0);
      var ship = sub >= 3000 ? 0 : 250, pre = pay === 'cod' ? 0 : 100, total = sub + ship - pre;
      return { id: id, at: t0 - ago, demo: true, phone: '0300-55500' + id.slice(-2), email: '', addr: { fname: name.split(' ')[0], lname: name.split(' ')[1] || '', city: city, area: 'Demo area', street: 'Demo street', landmark: '' },
        lines: lines.map(function (l) { return { k: P[l[0]].id + '|' + l[1] + '|' + (l[2] || ''), id: P[l[0]].id, color: l[1], size: l[2], qty: l[3] }; }),
        totals: { sub: sub, disc: 0, ship: ship, gw: 0, pre: pre, total: total }, pay: pay, ship: 'standard', status: status,
        aff: aff || null, commission: aff ? Math.round(sub * AFFSET.rate / 100) : 0 };
    }
    return [
      o('RS-100411', 0.1 * d, 'Mehwish Ali', 'Faisalabad', 'cod', 0, [[0, 0, null, 1], [15, 0, 'M', 1]]),
      o('RS-100410', 0.3 * d, 'Nimra Shah', 'Lahore', 'jazzcash', 1, [[22, 0, 'King', 1]], 'AYESHA10'),
      o('RS-100409', 1.2 * d, 'Farah Iqbal', 'Karachi', 'cod', 0, [[8, 1, 'S', 2]]),
      o('RS-100408', 2.1 * d, 'Rabia Noor', 'Islamabad', 'card', 3, [[19, 1, 'Double', 1], [28, 0, null, 2]], 'HIRAHOME'),
      o('RS-100407', 3.4 * d, 'Saima Tariq', 'Multan', 'easypaisa', 4, [[2, 0, null, 1]], 'AYESHA10'),
      o('RS-100406', 5.0 * d, 'Uzma Javed', 'Rawalpindi', 'cod', -1, [[6, 0, null, 1]])
    ];
  }

  (function () { var s = seedOrders(); if (s.length) { state.orders = state.orders.concat(s); store.set('orders', state.orders); } })();
  function statusName(st) { return st < 0 ? 'Cancelled' : STATUSES[st]; }

  /* colour family for filters */
  function colorFamily(hex) {
    var h = hex.replace('#', ''), r = parseInt(h.substr(0, 2), 16) / 255, g = parseInt(h.substr(2, 2), 16) / 255, b = parseInt(h.substr(4, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), hue = 0;
    if (d) { hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; }
    if (l > 0.86) return 'White & Ivory';
    if (s < 0.14 || l < 0.16) return l < 0.35 ? 'Black & Charcoal' : 'Grey & Silver';
    if (hue < 18 || hue >= 330) return l > 0.62 ? 'Pink & Blush' : 'Red & Maroon';
    if (hue < 45) return l > 0.55 ? 'Beige & Camel' : 'Brown & Rust';
    if (hue < 65) return 'Yellow & Gold';
    if (hue < 170) return 'Green';
    if (hue < 255) return 'Blue';
    return l > 0.6 ? 'Pink & Blush' : 'Purple & Plum';
  }
  var FAMILY_HEX = { 'White & Ivory': '#F3EEE4', 'Black & Charcoal': '#2a2626', 'Grey & Silver': '#A9A6A3', 'Pink & Blush': '#E2B4AE', 'Red & Maroon': '#7A2434', 'Beige & Camel': '#CDB08A', 'Brown & Rust': '#8C5536', 'Yellow & Gold': '#C9A24A', 'Green': '#3E6B53', 'Blue': '#3F5A85', 'Purple & Plum': '#6A3B66' };

  /* ---------------- overlays ---------------- */
  var openId = null;
  function openPanel(id) {
    closeAll(true);
    var el = document.getElementById(id);
    if (!el) return;
    openId = id;
    el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
    if (id !== 'search') $('#scrim').classList.add('on');
    document.body.classList.add('lock');
    if (id === 'cart') renderCartDrawer();
    if (id === 'search') { renderSearch(''); setTimeout(function () { $('#search-input').focus(); }, 60); }
    else { var f = el.querySelector('button, a, input, select'); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60); }
  }
  function closeAll(silent) {
    ['menu', 'cart', 'filters', 'modal', 'search'].forEach(function (id) { var el = document.getElementById(id); el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); });
    $('#scrim').classList.remove('on');
    document.body.classList.remove('lock');
    openId = null;
  }
  function modal(html, wide) {
    var card = $('#modal-card');
    card.className = 'modal-card' + (wide ? ' wide' : '');
    card.innerHTML = '<button class="hbtn modal-close" data-close aria-label="Close">' + ic('x') + '</button>' + html;
    openPanel('modal');
  }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.innerHTML = ic('check') + '<span>' + msg + '</span>'; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ---------------- header / nav ---------------- */
  var ANNOUNCEMENTS = [
    'Free delivery across Pakistan on orders above ' + money(S.freeDeliveryThreshold),
    'Cash on Delivery available nationwide',
    'Pay online with JazzCash or Easypaisa & get ' + money(S.prepaidDiscount) + ' off',
    'Easy 7-day exchange · WhatsApp us anytime'
  ];
  function initAnnounce() {
    var t = $('#announce');
    t.innerHTML = ANNOUNCEMENTS.map(function (a, i) { return '<span class="' + (i ? '' : 'on') + '">' + esc(a) + '</span>'; }).join('');
    var i = 0, spans = $$('span', t);
    setInterval(function () {
      spans[i].className = 'off';
      var prev = i; i = (i + 1) % spans.length;
      spans[i].className = 'on';
      setTimeout(function () { if (spans[prev].className === 'off') spans[prev].className = ''; }, 650);
    }, 4200);
  }

  function featured(dept, n) { return R.PRODUCTS.filter(function (p) { return p.dept === dept; }).sort(function (a, b) { return b.sold - a.sold; }).slice(0, n); }

  function initNav() {
    var D = R.DEPARTMENTS;
    function mega(dept) {
      var d = D[dept], cats = d.cats, half = Math.ceil(cats.length / 2), f = featured(dept, 2);
      function list(arr) { return '<ul>' + arr.map(function (c) { return '<li><a href="' + BASE + DEPT_SLUG[dept] + '/' + c.slug + '">' + esc(c.name) + '</a></li>'; }).join('') + '</ul>'; }
      return '<div class="mega"><div class="wrap mega-grid">' +
        '<div><h4>Shop ' + esc(d.name) + '</h4>' + list(cats.slice(0, half)) + '</div>' +
        '<div><h4>&nbsp;</h4>' + list(cats.slice(half)) + '<ul><li><a href="' + BASE + DEPT_SLUG[dept] + '" style="color:var(--accent);font-weight:600">View all ' + esc(d.name) + ' →</a></li></ul></div>' +
        f.map(function (p) { return '<a class="mega-card" href="' + productUrl(p) + '"><img src="' + R.art.product(p, 0, 0) + '" alt=""><span>' + esc(catName(dept, p.cat)) + '</span></a>'; }).join('') +
        '</div></div>';
    }
    var collMega = '<div class="mega"><div class="wrap mega-grid" style="grid-template-columns:repeat(4,1fr)">' + R.COLLECTIONS.map(function (c) {
      var p = R.PRODUCTS.filter(function (x) { return x.collection === c.slug; })[0];
      return '<a class="mega-card" href="' + BASE + 'collections/' + c.slug + '"><img src="' + R.art.product(p, 0, 3) + '" alt=""><span>' + esc(c.name) + '</span></a>';
    }).join('') + '</div></div>';

    $('#nav-list').innerHTML =
      '<li><a href="' + BASE + 'new-in" data-nav="new-in">New In</a></li>' +
      '<li><a href="' + BASE + 'women" data-nav="women">Women</a>' + mega('women') + '</li>' +
      '<li><a href="' + BASE + 'bedding-home" data-nav="bedding-home">Bedding &amp; Home</a>' + mega('home') + '</li>' +
      '<li><a href="' + BASE + 'collections" data-nav="collections">Collections</a>' + collMega + '</li>' +
      '<li><a href="' + BASE + 'best-sellers" data-nav="best-sellers">Best Sellers</a></li>' +
      '<li><a href="' + BASE + 'sale" class="sale" data-nav="sale">Sale</a></li>';

    function msub(dept) {
      return '<li><button aria-expanded="false" data-acc>' + esc(D[dept].name) + ic('chev', 'sm') + '</button><div class="sub">' +
        '<a href="' + BASE + DEPT_SLUG[dept] + '"><b>Shop all</b></a>' +
        D[dept].cats.map(function (c) { return '<a href="' + BASE + DEPT_SLUG[dept] + '/' + c.slug + '">' + esc(c.name) + '</a>'; }).join('') + '</div></li>';
    }
    $('#mnav').innerHTML =
      '<li><a href="' + BASE + 'new-in">New In</a></li>' + msub('women') + msub('home') +
      '<li><button aria-expanded="false" data-acc>Collections' + ic('chev', 'sm') + '</button><div class="sub">' + R.COLLECTIONS.map(function (c) { return '<a href="' + BASE + 'collections/' + c.slug + '">' + esc(c.name) + '</a>'; }).join('') + '</div></li>' +
      '<li><a href="' + BASE + 'best-sellers">Best Sellers</a></li>' +
      '<li><a href="' + BASE + 'sale" style="color:var(--sale)">Sale — up to ' + maxSale() + '% off</a></li>';
  }
  function maxSale() { return R.PRODUCTS.reduce(function (m, p) { return Math.max(m, pctOff(p)); }, 0); }

  function updateCounts() {
    var n = state.cart.reduce(function (s, l) { return s + l.qty; }, 0);
    var c = $('#cart-count'); c.textContent = n || ''; c.dataset.n = n;
    var w = $('#wish-count'); w.textContent = state.wish.length || ''; w.dataset.n = state.wish.length;
  }

  /* ---------------- product card ---------------- */
  function priceHTML(p) {
    if (!p.sale) return '<div class="price"><span class="now">' + money(p.price) + '</span></div>';
    return '<div class="price"><span class="now sale">' + money(p.sale) + '</span><s>' + money(p.price) + '</s><span class="off">−' + pctOff(p) + '%</span></div>';
  }
  function badgesHTML(p) {
    var b = [];
    if (p.sale) b.push('<span class="badge sale">−' + pctOff(p) + '%</span>');
    if (p.badges.indexOf('new') > -1) b.push('<span class="badge new">New</span>');
    if (p.badges.indexOf('best') > -1) b.push('<span class="badge best">Bestseller</span>');
    var ts = totalStock(p);
    if (ts <= 0) b.unshift('<span class="badge out">Sold out</span>');
    else if (ts <= SETTINGS.lowStockAt) b.push('<span class="badge low">Low stock</span>');
    return '<div class="badges">' + b.slice(0, 2).join('') + '</div>';
  }
  function metaLine(p) {
    if (p.dept === 'women') return p.stitched ? (p.pieces > 1 ? p.pieces + '-Piece · ' : '') + 'Ready-to-wear' : 'Unstitched · ' + p.pieces + '-Piece';
    return p.fabric + (p.threadCount ? ' · ' + p.threadCount + ' TC' : '') + (p.pieces > 2 ? ' · ' + p.pieces + ' pcs' : '');
  }
  function card(p) {
    var w = state.wish.indexOf(p.id) > -1;
    return '<article class="card">' +
      '<div class="card-top">' +
        '<a class="card-media" href="' + productUrl(p) + '" aria-label="' + esc(p.title) + '">' + badgesHTML(p) +
          '<img src="' + R.art.product(p, 0, 0) + '" alt="' + esc(p.title + ' — ' + p.colors[0].name) + '" loading="lazy" width="600" height="800">' +
          '<img class="alt" src="' + R.art.product(p, 0, 3) + '" alt="" loading="lazy" width="600" height="800">' +
        '</a>' +
        '<button class="wish' + (w ? ' on' : '') + '" data-wish="' + p.id + '" aria-pressed="' + w + '" aria-label="' + (w ? 'Remove from' : 'Add to') + ' wishlist">' + ic('heart') + '</button>' +
        '<div class="quick"><button class="btn" data-qv="' + p.id + '">Quick view</button><button class="btn" data-qa="' + p.id + '">Quick add</button></div>' +
      '</div>' +
      '<div class="card-body"><div class="card-meta">' + esc(metaLine(p)) + '</div>' +
        '<h3 class="card-title"><a href="' + productUrl(p) + '">' + esc(p.title) + '</a></h3>' + priceHTML(p) +
        (p.colors.length > 1 ? '<div class="swatches" aria-label="' + p.colors.length + ' colours">' + p.colors.map(function (c) { return '<i style="background:' + c.hex + '" title="' + esc(c.name) + '"></i>'; }).join('') + '</div>' : '') +
      '</div></article>';
  }
  function rail(products) {
    return '<div class="carousel"><button class="rail-btn prev" data-rail="-1" aria-label="Previous">' + ic('left') + '</button>' +
      '<div class="rail">' + products.map(card).join('') + '</div>' +
      '<button class="rail-btn next" data-rail="1" aria-label="Next">' + ic('right') + '</button></div>';
  }

  /* ---------------- HOME ---------------- */
  function weekEnd() {
    // next Sunday 23:59:59 Pakistan time (UTC+5)
    var t = new Date(Date.now() + 5 * 3600e3);
    var d = (7 - t.getUTCDay()) % 7;
    var end = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + d, 23, 59, 59) - 5 * 3600e3;
    return end;
  }

  function viewHome() {
    var P = R.PRODUCTS;
    var newIn = P.slice().sort(function (a, b) { return b.added - a.added; }).slice(0, 10);
    var best = P.slice().sort(function (a, b) { return b.sold - a.sold; }).slice(0, 10);
    var C = R.COLLECTIONS;
    var slides = [
      { tone: C[1].tone, subject: 'kurta', eyebrow: T('Eid ul Adha · Naya Collection', 'عید الاضحیٰ · نیا کلیکشن'), title: T('The <em>Eid</em> Edit', '<em>عید</em> ایڈٹ'), text: T('Hand-finished chikankari, chiffon and silk — festive pieces made to be remembered.', 'ہاتھ سے تیار چکن کاری، شیفون اور سلک — یادگار تہوار کے ملبوسات۔'), cta: [T('Shop the Eid Edit', 'عید ایڈٹ دیکھیں'), BASE + 'collections/eid-edit'], cta2: [T('Shop Women', 'خواتین کی خریداری'), BASE + 'women'] },
      { tone: ['#111C3A', '#EFE8DA', '#C9A23F'], subject: 'bed', eyebrow: T('Wedding Season', 'شادی سیزن'), title: T('Bridal <em>bed sets</em> for the jahez', 'جہیز کے لیے <em>برائیڈل بیڈ سیٹس</em>'), text: T('8 and 10-piece sateen and velvet sets in royal blue, emerald and ivory gold.', 'رائل بلیو، زمردی اور آئیوری گولڈ میں 8 اور 10 پیس ساٹن اور ویلوٹ سیٹس۔'), cta: [T('Shop Bridal Sets', 'برائیڈل سیٹس خریدیں'), BASE + 'bedding-home/bridal-bed-sets'], cta2: [T('All Bedding', 'تمام بیڈنگ'), BASE + 'bedding-home'] },
      { tone: ['#E6E2D8', '#F7F4EC', '#1B2F5E'], subject: 'kurta', light: true, eyebrow: T('Summer Lawn 2026', 'سمر لان 2026'), title: T('Lawn, <em>lightly</em> done', 'ہلکی پھلکی <em>لان</em>'), text: T('Printed and embroidered lawn in 2 and 3-piece — breathable, colour-fast, from ' + money(3990) + '.', '2 اور 3 پیس پرنٹڈ اور کڑھائی والی لان — ہوادار، پکے رنگ، صرف ' + money(3990) + ' سے۔'), cta: [T('Shop Lawn', 'لان خریدیں'), BASE + 'women/unstitched'], cta2: [T('New In', 'نئی آمد'), BASE + 'new-in'] }
    ];
    var hero = '<section class="hero" aria-roledescription="carousel" aria-label="Featured campaigns"><div class="hero-track">' + slides.map(function (s, i) {
      var copy = '<div class="wrap" style="height:100%"><div class="slide-copy"><span class="eyebrow">' + s.eyebrow + '</span>' +
        (i ? '<h2>' : '<h1>') + s.title + (i ? '</h2>' : '</h1>') + '<p>' + esc(s.text) + '</p>' +
        '<div class="ctas"><a class="btn ' + (s.light ? 'btn-primary' : 'btn-light') + '" href="' + s.cta[1] + '">' + s.cta[0] + '</a><a class="btn ' + (s.light ? 'btn-outline' : 'btn-ghost-light') + '" href="' + s.cta2[1] + '">' + s.cta2[0] + '</a></div></div></div>';
      return '<div class="slide' + (i ? '' : ' on') + (s.light ? ' light' : '') + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + slides.length + '">' +
        '<img class="img-d" src="' + R.art.hero(s.tone, s.subject, false) + '" alt="" ' + (i ? 'loading="lazy"' : 'fetchpriority="high"') + '>' +
        '<img class="img-m" src="' + R.art.hero(s.tone, s.subject, true) + '" alt="" ' + (i ? 'loading="lazy"' : '') + '>' + copy + '</div>';
    }).join('') + '</div><div class="hero-ui"><div class="wrap"><div class="dots">' + slides.map(function (s, i) { return '<button class="' + (i ? '' : 'on') + '" data-slide="' + i + '" aria-label="Show slide ' + (i + 1) + '"></button>'; }).join('') + '</div>' +
      '<div class="hero-arrows"><button data-step="-1" aria-label="Previous slide">' + ic('left') + '</button><button data-step="1" aria-label="Next slide">' + ic('right') + '</button></div></div></div></section>';

    var trust = '<section class="trust" aria-label="Why shop with us"><div class="wrap"><ul>' +
      '<li>' + ic('cash') + '<div><b>Cash on Delivery</b><span>Pay when it arrives</span></div></li>' +
      '<li>' + ic('truck') + '<div><b>Free delivery</b><span>On orders over ' + money(S.freeDeliveryThreshold) + '</span></div></li>' +
      '<li>' + ic('swap') + '<div><b>7-day exchange</b><span>Unused, with tags</span></div></li>' +
      '<li>' + ic('lock') + '<div><b>Secure payment</b><span>JazzCash · Easypaisa · Cards</span></div></li>' +
      '</ul></div></section>';

    var circleCats = [['women', 'unstitched', 'Unstitched'], ['women', 'pret', 'Pret'], ['women', 'luxury-pret', 'Formals'], ['home', 'bedsheets', 'Bedsheets'], ['home', 'bridal-bed-sets', 'Bridal Sets'], ['home', 'comforters', 'Comforters'], ['women', 'dupattas', 'Shawls'], ['home', 'cushions', 'Cushions']];
    var circles = '<section class="section tight"><div class="wrap"><div class="sec-head center reveal"><span class="eyebrow">Shop by category</span></div><div class="circles reveal">' + circleCats.map(function (c) {
      var p = R.PRODUCTS.filter(function (x) { return x.dept === c[0] && x.cat === c[1]; })[0];
      return '<a class="circle" href="' + BASE + DEPT_SLUG[c[0]] + '/' + c[1] + '"><div class="ph"><img src="' + R.art.product(p, 0, 0) + '" alt="" loading="lazy"></div>' + c[2] + '</a>';
    }).join('') + '</div></div></section>';

    var womanHero = R.PRODUCTS.filter(function (p) { return p.cat === 'luxury-pret'; })[0];
    var homeHero = R.PRODUCTS.filter(function (p) { return p.cat === 'bridal-bed-sets'; })[0];
    var depts = '<section class="section" style="padding-top:12px"><div class="wrap depts">' +
      '<a class="dept reveal" href="' + BASE + 'women"><img src="' + R.art.product(womanHero, 1, 0) + '" alt="Women\'s clothing" loading="lazy"><div class="dept-copy"><span class="eyebrow" style="color:#E8C766">Department</span><h3>Women</h3><p>' + esc(R.DEPARTMENTS.women.blurb) + '</p><span class="btn btn-light">Shop Women</span></div></a>' +
      '<a class="dept reveal" href="' + BASE + 'bedding-home"><img src="' + R.art.product(homeHero, 0, 0) + '" alt="Bedding and home textiles" loading="lazy"><div class="dept-copy"><span class="eyebrow" style="color:#E8C766">Department</span><h3>Bedding &amp; Home</h3><p>' + esc(R.DEPARTMENTS.home.blurb) + '</p><span class="btn btn-light">Shop Bedding</span></div></a>' +
      '</div></section>';

    var newSec = '<section class="section" style="padding-top:0"><div class="wrap"><div class="sec-head reveal"><div><span class="eyebrow">Just landed</span><h2>New In</h2></div><a href="' + BASE + 'new-in">View all</a></div>' + rail(newIn) + '</div></section>';

    var deal = '<section class="deal"><div class="wrap"><div><span class="eyebrow">White Week · Limited time</span><h2>' + T('Up to <em>' + maxSale() + '% off</em>', '<em>' + maxSale() + '%</em> تک رعایت') + '</h2><p>On selected lawn, comforters and bed sets. While stocks last.</p></div>' +
      '<div class="timer" id="timer" aria-label="Sale ends in"></div><div><a class="btn btn-light" href="' + BASE + 'sale">Shop the Sale</a></div></div></section>';

    var bestSec = '<section class="section"><div class="wrap"><div class="sec-head reveal"><div><span class="eyebrow">Loved across Pakistan</span><h2>Best Sellers</h2></div><a href="' + BASE + 'best-sellers">View all</a></div>' + rail(best) + '</div></section>';

    var bridal = R.PRODUCTS.filter(function (p) { return p.cat === 'bridal-bed-sets'; })[1];
    var editorial = '<section class="section" style="padding-top:0"><div class="wrap split">' +
      '<div class="split-media reveal"><img src="' + R.art.product(bridal, 0, 0) + '" alt="Mehndi 10-piece bridal bed set" loading="lazy"></div>' +
      '<div class="split-copy reveal"><span class="eyebrow">The Jahez Edit</span><h2>' + T('Bridal bedding, <em>beautifully</em> boxed.', 'برائیڈل بیڈنگ، <em>خوبصورت</em> پیکنگ میں۔') + '</h2>' +
      '<p>Our bridal sets arrive gift-boxed and ready for the rukhsati — every piece you need for a complete, coordinated bedroom.</p>' +
      '<ul><li>King and Super King sizes (100 × 108″ / 108 × 108″)</li><li>Sateen and velvet, 300–400 thread count</li><li>Bedsheet, pillow covers, cushions, comforter &amp; runner</li><li>Free gift wrap and a handwritten card</li></ul>' +
      '<a class="btn btn-primary" href="' + BASE + 'bedding-home/bridal-bed-sets">Shop Bridal Sets</a></div></div></section>';

    var colls = '<section class="section" style="padding-top:0"><div class="wrap"><div class="sec-head reveal"><div><span class="eyebrow">Seasonal</span><h2>Collections</h2></div><a href="' + BASE + 'collections">View all</a></div><div class="colls">' + R.COLLECTIONS.map(function (c, i) {
      var p = R.PRODUCTS.filter(function (x) { return x.collection === c.slug; })[i % 2];
      return '<a class="coll reveal" href="' + BASE + 'collections/' + c.slug + '"><img src="' + R.art.product(p, 0, 3) + '" alt="" loading="lazy"><span>' + esc(c.name) + '<small>Explore →</small></span></a>';
    }).join('') + '</div></div></section>';

    var social = R.PRODUCTS.filter(function (p, i) { return i % 5 === 0; }).slice(0, 6);
    var gallery = '<section class="section" style="padding-top:0"><div class="wrap"><div class="sec-head center reveal"><span class="eyebrow">@rsbrifashion</span><h2>Styled by you</h2><p class="muted" style="margin:8px 0 0">Tag us on Instagram &amp; TikTok to be featured. Tap a look to shop it.</p></div><div class="gallery reveal">' +
      social.map(function (p, i) { return '<a href="' + productUrl(p) + '" aria-label="Shop ' + esc(p.title) + '"><img src="' + R.art.social(p, i) + '" alt="" loading="lazy"></a>'; }).join('') + '</div></div></section>';

    var optin = '<section class="optin"><div class="wrap"><div><span class="eyebrow">Join the RSBRI circle</span><h2>10% off your first order</h2><p>New launches, Eid drops and private sales — straight to your WhatsApp or inbox. No spam, unsubscribe anytime.</p></div>' +
      '<form id="optin-form" novalidate><div class="seg" role="tablist"><button type="button" class="on" data-ch="wa">WhatsApp</button><button type="button" data-ch="email">Email</button></div>' +
      '<div class="inline-field"><input class="input" id="optin-input" inputmode="tel" placeholder="03XX-XXXXXXX" aria-label="WhatsApp number"><button class="btn btn-dark">Subscribe</button></div>' +
      '<span class="hint" id="optin-hint">By subscribing you agree to receive marketing messages from RSBRI.</span></form></div></section>';

    return hero + trust + circles + depts + newSec + deal + bestSec + editorial + colls + gallery + optin;
  }

  var heroTimer, timerInt;
  function mountHome() {
    var slides = $$('.slide'), dots = $$('.dots button'), cur = 0;
    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === cur); });
    }
    function auto() { clearInterval(heroTimer); heroTimer = setInterval(function () { go(cur + 1); }, 6500); }
    $$('[data-slide]').forEach(function (b) { b.onclick = function () { go(+b.dataset.slide); auto(); }; });
    $$('[data-step]').forEach(function (b) { b.onclick = function () { go(cur + +b.dataset.step); auto(); }; });
    var hero = $('.hero'), x0 = null;
    hero.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) { go(cur + (dx < 0 ? 1 : -1)); auto(); } x0 = null; });
    hero.addEventListener('mouseenter', function () { clearInterval(heroTimer); });
    hero.addEventListener('mouseleave', auto);
    auto();

    var end = weekEnd(), tEl = $('#timer');
    function tick() {
      var d = Math.max(0, end - Date.now()), parts = [[Math.floor(d / 864e5), 'Days'], [Math.floor(d / 36e5) % 24, 'Hrs'], [Math.floor(d / 6e4) % 60, 'Min'], [Math.floor(d / 1e3) % 60, 'Sec']];
      tEl.innerHTML = parts.map(function (p) { return '<div><b>' + ('0' + p[0]).slice(-2) + '</b><span>' + p[1] + '</span></div>'; }).join('');
    }
    tick(); clearInterval(timerInt); timerInt = setInterval(tick, 1000);

    var ch = 'wa';
    $$('[data-ch]').forEach(function (b) {
      b.onclick = function () {
        ch = b.dataset.ch; $$('[data-ch]').forEach(function (x) { x.classList.toggle('on', x === b); });
        var inp = $('#optin-input'); inp.value = ''; inp.classList.remove('err');
        if (ch === 'wa') { inp.placeholder = '03XX-XXXXXXX'; inp.inputMode = 'tel'; inp.setAttribute('aria-label', 'WhatsApp number'); }
        else { inp.placeholder = 'you@example.com'; inp.inputMode = 'email'; inp.setAttribute('aria-label', 'Email address'); }
      };
    });
    $('#optin-form').onsubmit = function (e) {
      e.preventDefault();
      var inp = $('#optin-input'), v = inp.value.trim();
      var ok = ch === 'wa' ? validPhone(v) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      inp.classList.toggle('err', !ok);
      if (!ok) { $('#optin-hint').innerHTML = '<span class="error">' + (ch === 'wa' ? 'Enter a valid mobile number, e.g. 0300-1234567' : 'Enter a valid email address') + '</span>'; return; }
      $('#optin-form').innerHTML = '<div class="box"><b>Welcome to RSBRI!</b><p style="margin:6px 0 0">Your code <b>WELCOME10</b> is on its way. Use it at checkout for 10% off your first order.</p></div>';
    };
  }

  /* ---------------- LISTING ---------------- */
  var PRICE_BUCKETS = [[0, 3000, 'Under Rs. 3,000'], [3000, 6000, 'Rs. 3,000 – 6,000'], [6000, 12000, 'Rs. 6,000 – 12,000'], [12000, 25000, 'Rs. 12,000 – 25,000'], [25000, 1e9, 'Rs. 25,000 & above']];
  var FACETS = {
    type: { label: 'Type', get: function (p) { return p.type ? [p.type] : []; } },
    category: { label: 'Category', get: function (p) { return [catName(p.dept, p.cat)]; } },
    pieces: { label: 'Pieces', get: function (p) { return [p.pieces + '-Piece']; }, sort: function (a, b) { return parseInt(a, 10) - parseInt(b, 10); } },
    fabric: { label: 'Fabric', get: function (p) { return [p.fabric]; } },
    material: { label: 'Material', get: function (p) { return [p.fabric]; } },
    size: { label: 'Size', get: function (p) { return p.sizes || []; }, sort: function (a, b) { return R.SIZES.indexOf(a) - R.SIZES.indexOf(b); } },
    bedSize: { label: 'Bed size', get: function (p) { return p.bedSizes || []; }, sort: function (a, b) { return ['Single', 'Double', 'King', 'Super King'].indexOf(a) - ['Single', 'Double', 'King', 'Super King'].indexOf(b); } },
    threadCount: { label: 'Thread count', get: function (p) { return p.threadCount ? [p.threadCount >= 400 ? '400+ TC' : p.threadCount >= 300 ? '300–399 TC' : 'Under 300 TC'] : []; } },
    colour: { label: 'Colour', get: function (p) { return p.colors.map(function (c) { return colorFamily(c.hex); }); } },
    occasion: { label: 'Occasion', get: function (p) { return p.occasion ? [p.occasion] : []; } },
    price: { label: 'Price', get: function (p) { var n = now(p); return PRICE_BUCKETS.filter(function (b) { return n >= b[0] && n < b[1]; }).map(function (b) { return b[2]; }); }, sort: function (a, b) { return labelIdx(a) - labelIdx(b); } }
  };
  function labelIdx(l) { for (var i = 0; i < PRICE_BUCKETS.length; i++) if (PRICE_BUCKETS[i][2] === l) return i; return 99; }
  var FACET_SETS = {
    women: ['type', 'pieces', 'fabric', 'size', 'colour', 'occasion', 'price'],
    home: ['category', 'bedSize', 'threadCount', 'material', 'pieces', 'colour', 'price'],
    mixed: ['category', 'fabric', 'colour', 'price']
  };
  var SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['best', 'Best selling'], ['low', 'Price: low to high'], ['high', 'Price: high to low'], ['discount', 'Biggest discount']];
  var L = null; // current listing state

  function listing(opts) {
    // opts: { title, eyebrow, blurb, crumbs, items, facetSet, chips, sort }
    var q = parseQuery();
    L = { items: opts.items, facetSet: FACET_SETS[opts.facetSet], filters: {}, sort: q.sort || opts.sort || 'featured', shown: PAGE_SIZE * Math.max(1, +q.page || 1) };
    var chips = opts.chips ? '<div class="chips" role="list">' + opts.chips.map(function (c) { return '<a role="listitem" class="chip' + (c.on ? ' on' : '') + '" href="' + c.href + '">' + esc(c.name) + '</a>'; }).join('') + '</div>' : '';
    return crumbs(opts.crumbs) +
      '<div class="wrap"><header class="plp-head">' + (opts.eyebrow ? '<span class="eyebrow">' + esc(opts.eyebrow) + '</span>' : '') + '<h1>' + esc(opts.title) + '</h1>' + (opts.blurb ? '<p>' + esc(opts.blurb) + '</p>' : '') + chips + '</header>' +
      '<div class="toolbar"><button class="filter-btn" data-open="filters">' + ic('filter', 'sm') + ' Filter <span id="fcount"></span></button><span class="count" id="rcount"></span>' +
      '<label class="sr-only" for="sort">Sort by</label><select id="sort">' + SORTS.map(function (s) { return '<option value="' + s[0] + '"' + (L.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="plp"><aside class="filters" id="filters-side" aria-label="Filters"></aside><div><div class="grid" id="grid"></div><div id="more"></div></div></div></div>';
  }
  function crumbs(list) {
    if (!list) return '';
    return '<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="' + BASE + '">Home</a>' + list.map(function (c) { return '<span aria-hidden="true">/</span>' + (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : '<span aria-current="page">' + esc(c[0]) + '</span>'); }).join('') + '</nav></div>';
  }
  function facetsHTML() {
    var html = '';
    L.facetSet.forEach(function (key, i) {
      var f = FACETS[key], counts = {};
      L.items.forEach(function (p) { f.get(p).forEach(function (v) { counts[v] = (counts[v] || 0) + 1; }); });
      var vals = Object.keys(counts);
      if (vals.length < 2 && !(L.filters[key] && L.filters[key].length)) return;
      vals.sort(f.sort || function (a, b) { return a.localeCompare(b); });
      var sel = L.filters[key] || [];
      html += '<details class="facet"' + (i < 3 || sel.length ? ' open' : '') + '><summary>' + f.label + (sel.length ? ' (' + sel.length + ')' : '') + ic('chev') + '</summary><div class="opts">' +
        vals.map(function (v) {
          return '<label><input type="checkbox" data-facet="' + key + '" value="' + esc(v) + '"' + (sel.indexOf(v) > -1 ? ' checked' : '') + '>' +
            (key === 'colour' ? '<span class="sw" style="background:' + FAMILY_HEX[v] + '"></span>' : '') + esc(v) + '<small>' + counts[v] + '</small></label>';
        }).join('') + '</div></details>';
    });
    return html || '<p class="muted">No filters for this selection.</p>';
  }
  function applyListing() {
    var res = L.items.filter(function (p) {
      return Object.keys(L.filters).every(function (k) {
        var sel = L.filters[k]; if (!sel.length) return true;
        var vals = FACETS[k].get(p); return vals.some(function (v) { return sel.indexOf(v) > -1; });
      });
    });
    var s = L.sort;
    res.sort(function (a, b) {
      if (s === 'newest') return b.added - a.added;
      if (s === 'best') return b.sold - a.sold;
      if (s === 'low') return now(a) - now(b);
      if (s === 'high') return now(b) - now(a);
      if (s === 'discount') return pctOff(b) - pctOff(a);
      return (b.sold * 0.6 + (b.added / 864e5) * 4) - (a.sold * 0.6 + (a.added / 864e5) * 4);
    });
    return res;
  }
  function renderListing() {
    if (!L) return;
    var res = applyListing(), shown = res.slice(0, L.shown);
    $('#grid').className = 'grid g4';
    $('#grid').innerHTML = shown.length ? shown.map(card).join('') : '';
    $('#rcount').textContent = res.length + ' item' + (res.length === 1 ? '' : 's');
    var nf = Object.keys(L.filters).reduce(function (n, k) { return n + L.filters[k].length; }, 0);
    $('#fcount').textContent = nf ? '(' + nf + ')' : '';
    if (!res.length) {
      $('#more').innerHTML = '<div class="empty"><h2>No matches</h2><p>Try removing a filter or two.</p><button class="btn btn-outline" id="clear-inline">Clear all filters</button></div>';
      $('#clear-inline').onclick = function () { L.filters = {}; renderFacets(); renderListing(); };
    } else if (shown.length < res.length) {
      var next = Math.floor(L.shown / PAGE_SIZE) + 1;
      $('#more').innerHTML = '<div class="load-more"><span>Showing ' + shown.length + ' of ' + res.length + '</span><div class="progress"><i style="width:' + (shown.length / res.length * 100) + '%"></i></div>' +
        '<a class="btn btn-outline" id="load-more" href="' + location.hash.split('?')[0] + '?page=' + next + '">Load more</a></div>';
      $('#load-more').onclick = function (e) {
        e.preventDefault(); L.shown += PAGE_SIZE;
        history.replaceState(null, '', location.hash.split('?')[0] + '?page=' + next);
        renderListing();
      };
    } else {
      $('#more').innerHTML = res.length > PAGE_SIZE ? '<div class="load-more"><span>You\'ve seen all ' + res.length + ' items</span></div>' : '';
    }
  }
  function renderFacets() { var h = facetsHTML(); $('#filters-side').innerHTML = h; $('#filters-body').innerHTML = h; }
  function mountListing() {
    renderFacets(); renderListing();
    $('#sort').onchange = function () { L.sort = this.value; renderListing(); };
  }
  function onFacetChange(input) {
    var k = input.dataset.facet, v = input.value, arr = L.filters[k] || (L.filters[k] = []);
    var i = arr.indexOf(v);
    if (input.checked && i < 0) arr.push(v); else if (!input.checked && i > -1) arr.splice(i, 1);
    L.shown = PAGE_SIZE;
    var openSide = input.closest('#filters-side') ? 'side' : 'drawer';
    // keep both copies in sync without collapsing the panel being used
    var other = openSide === 'side' ? '#filters-body' : '#filters-side';
    $(other).innerHTML = facetsHTML();
    renderListing();
    $('#show-results').textContent = 'Show ' + applyListing().length + ' results';
  }

  /* ---------------- PRODUCT ---------------- */
  var PDP = null;
  function viewProduct(p) {
    PDP = { p: p, color: 0, size: null, qty: 1, view: 0 };
    if (p.sizes && p.sizes.length) PDP.size = null;
    if (p.bedSizes && p.bedSizes.length === 1) PDP.size = p.bedSizes[0];
    pushRecent(p.id);
    var dname = R.DEPARTMENTS[p.dept].name;
    var seo = { '@context': 'https://schema.org', '@type': 'Product', name: p.title, sku: p.sku, brand: { '@type': 'Brand', name: 'RSBRI Fashion' }, description: p.desc,
      offers: { '@type': 'Offer', priceCurrency: 'PKR', price: now(p), availability: 'https://schema.org/InStock' } };
    document.title = p.title + ' | RSBRI Fashion Pakistan';
    var html = crumbs([[dname, BASE + DEPT_SLUG[p.dept]], [catName(p.dept, p.cat), BASE + DEPT_SLUG[p.dept] + '/' + p.cat], [p.title]]) +
      '<div class="wrap"><div class="pdp">' +
      '<div class="gallery-pdp"><div class="thumbs" id="thumbs"></div><div class="main-img" id="main-img"><img id="main-pic" alt=""><span class="vid">' + ic('play', 'sm') + ' Fabric close-up</span></div></div>' +
      '<div class="pdp-info" id="pdp-info"></div></div>' +
      related(p) + recentHTML(p.id) + '</div>' +
      '<script type="application/ld+json">' + JSON.stringify(seo).replace(/</g, '\\u003c') + '</script>';
    return html;
  }
  function pdpImages() { var p = PDP.p, c = PDP.color; return [0, 3, 1, 2].map(function (v) { return R.art.product(p, c, v); }); }
  function renderGallery() {
    var imgs = pdpImages(), labels = ['Front', 'Styled', 'Fabric close-up', 'Detail'];
    $('#main-pic').src = imgs[PDP.view];
    $('#main-pic').alt = PDP.p.title + ' — ' + PDP.p.colors[PDP.color].name + ' — ' + labels[PDP.view];
    $('#thumbs').innerHTML = imgs.map(function (src, i) { return '<button class="' + (i === PDP.view ? 'on' : '') + '" data-view="' + i + '" aria-label="' + labels[i] + '"><img src="' + src + '" alt=""></button>'; }).join('');
  }
  function sizeGuideType(p) { return p.dept === 'home' ? 'bed' : 'women'; }
  function renderPdpInfo() {
    var p = PDP.p, w = state.wish.indexOf(p.id) > -1;
    var opts = p.sizes || p.bedSizes;
    var allOut = opts ? opts.every(function (s) { return isOut(p, PDP.color, s); }) : isOut(p, PDP.color, null);
    var left = (!opts || PDP.size) ? stockOf(p, PDP.color, PDP.size) : 0;
    var city = R.CITIES.filter(function (c) { return c.name === state.city; })[0] || R.CITIES[0];
    var specs = [['SKU', p.sku], ['Fabric', p.fabric]];
    if (p.dept === 'women') {
      specs.push(['Type', p.type]); specs.push(['Pieces', p.pieces + '-Piece' + (p.pieces === 3 ? ' (Shirt, Dupatta, Trouser)' : p.pieces === 2 ? ' (Shirt, Trouser)' : '')]);
      if (p.meters) specs.push(['Fabric length', p.meters]);
      if (p.embroidery) specs.push(['Embroidery', p.embroidery]);
      if (p.occasion) specs.push(['Occasion', p.occasion]);
    } else {
      if (p.threadCount) specs.push(['Thread count', p.threadCount]);
      specs.push(['Pieces in set', p.pieces]);
      if (p.gsm) specs.push(['Filling', p.gsm + ' GSM']);
      if (p.bedSizes) specs.push(['Sizes', p.bedSizes.map(function (s) { var b = R.BED_SIZES.filter(function (x) { return x.name === s; })[0]; return s + ' — ' + b.dims; }).join('<br>')]);
    }
    $('#pdp-info').innerHTML =
      '<span class="eyebrow"><span>' + esc(catName(p.dept, p.cat)) + '</span>' + (p.collection ? ' · <span>' + esc(R.COLLECTIONS.filter(function (c) { return c.slug === p.collection; })[0].name) + '</span>' : '') + '</span>' +
      '<h1>' + esc(p.title) + '</h1>' +
      '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="rating"><span class="stars" aria-hidden="true">★★★★★</span>' + p.rating.toFixed(1) + ' · ' + (12 + p.sold % 80) + ' reviews</span><span class="pdp-sku">SKU ' + p.sku + '</span></div>' +
      '<div class="pdp-price">' + (p.sale ? '<span class="now sale">' + money(p.sale) + '</span><s>' + money(p.price) + '</s><span class="save">Save ' + pctOff(p) + '% · ' + money(p.price - p.sale) + '</span>' : '<span class="now">' + money(p.price) + '</span>') + '</div>' +
      '<div class="tax-note">Inclusive of sales tax · or pay online and save ' + money(S.prepaidDiscount) + '</div>' +

      '<div class="opt-block"><div class="opt-head"><span>Colour: <b>' + esc(p.colors[PDP.color].name) + '</b></span></div><div class="opts-row">' +
        p.colors.map(function (c, i) { return '<button class="sw-btn' + (i === PDP.color ? ' on' : '') + '" data-color="' + i + '" aria-label="' + esc(c.name) + '" aria-pressed="' + (i === PDP.color) + '"><i style="background:' + c.hex + '"></i></button>'; }).join('') + '</div></div>' +

      (opts ? '<div class="opt-block"><div class="opt-head"><span>' + (p.sizes ? 'Size' : 'Bed size') + ': <b id="sel-size">' + (PDP.size || 'Select') + '</b></span><button class="link" data-guide="' + sizeGuideType(p) + '">' + (p.sizes ? 'Size guide' : 'Bedsheet sizes') + '</button></div><div class="opts-row">' +
        opts.map(function (s) { var out = isOut(p, PDP.color, s); return '<button class="size-btn' + (PDP.size === s ? ' on' : '') + (out ? ' out' : '') + '" data-size="' + esc(s) + '"' + (out ? ' aria-disabled="true" title="Sold out — tap to get notified"' : '') + '>' + esc(s) + '</button>'; }).join('') +
        '</div><div class="error" id="size-err" hidden>Please select a ' + (p.sizes ? 'size' : 'bed size') + '.</div></div>' : '') +

      (p.dept === 'women' && !p.stitched ? '<div class="opt-block" style="font-size:13.5px;color:var(--ink-2)">' + ic('ruler', 'sm') + ' <span style="vertical-align:3px">Unstitched — ' + esc(p.meters) + '</span></div>' : '') +

      (left > 0 && left <= 3 ? '<p class="stock-note">' + T('Only ' + left + ' left — order soon', 'صرف ' + left + ' باقی — جلد آرڈر کریں') + '</p>' : '') +
      '<div id="notify-wrap"></div>' +
      '<div class="buy-row"><div class="qty"><button data-qty="-1" aria-label="Decrease quantity">' + ic('minus', 'sm') + '</button><input id="qty" type="number" min="1" max="10" value="' + PDP.qty + '" aria-label="Quantity"><button data-qty="1" aria-label="Increase quantity">' + ic('plus', 'sm') + '</button></div>' +
        '<button class="btn btn-dark" id="add-cart"' + (allOut ? ' disabled' : '') + '>' + (allOut ? 'Sold out' : 'Add to bag') + '</button>' +
        '<button class="wish-btn' + (w ? ' on' : '') + '" data-wish="' + p.id + '" aria-pressed="' + w + '" aria-label="Wishlist">' + ic('heart') + '</button></div>' +
      '<button class="btn btn-primary btn-block buy-now" id="buy-now"' + (allOut ? ' disabled' : '') + '>Buy it now</button>' +
      '<div class="wa-row"><a class="btn btn-wa" target="_blank" rel="noopener" id="wa-order" href="#">' + '<svg class="icon sm" style="fill:#fff;stroke:none"><use href="#i-wa"/></svg>Order on WhatsApp</a>' +
        '<a class="btn btn-outline" target="_blank" rel="noopener" href="' + waLink('Look what I found at RSBRI Fashion: ' + p.title + ' — ' + absUrl(productUrl(p))) + '">' + ic('share', 'sm') + 'Share</a></div>' +

      '<div class="delivery-box">' +
        '<div class="row">' + ic('truck') + '<div>Delivery to <label class="sr-only" for="city-sel">City</label><select id="city-sel">' + R.CITIES.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === city.name ? ' selected' : '') + ' translate="no">' + c.name + '</option>'; }).join('') + '</select>: <b>' + city.days + ' working days</b>' +
          '<div class="muted" style="font-size:12.5px">' + (now(p) >= S.freeDeliveryThreshold ? 'Free delivery on this item' : 'Free delivery on orders over ' + money(S.freeDeliveryThreshold)) + '</div></div></div>' +
        '<div class="row">' + ic('cash') + '<div>Cash on Delivery available · JazzCash · Easypaisa · Cards</div></div>' +
        '<div class="row">' + ic('swap') + '<div>7-day exchange on unused items with tags' + (p.dept === 'women' && !p.stitched ? ' (cut fabric excluded)' : '') + '</div></div>' +
      '</div>' +

      '<div class="acc">' +
        '<details open><summary>Description' + ic('plus') + '</summary><div class="acc-body"><p style="margin-top:0">' + esc(p.desc) + '</p></div></details>' +
        '<details><summary>Details &amp; pieces' + ic('plus') + '</summary><div class="acc-body"><table class="spec">' + specs.map(function (s) { return '<tr><th>' + s[0] + '</th><td>' + s[1] + '</td></tr>'; }).join('') + '</table></div></details>' +
        '<details><summary>Fabric &amp; care' + ic('plus') + '</summary><div class="acc-body">' + esc(p.care) + '<br><br><small class="muted">Colours may vary slightly due to photography and screen settings.</small></div></details>' +
        '<details><summary>Delivery &amp; exchange' + ic('plus') + '</summary><div class="acc-body">Dispatched within 24 hours from our Faisalabad warehouse via Leopards / TCS. Faisalabad and Lahore 1–2 days, other major cities 2–4 days, rest of Pakistan 4–7 days. You\'ll get WhatsApp and SMS updates with your tracking number. <a class="link" href="' + BASE + 'page/returns">Exchange policy</a></div></details>' +
      '</div>';
    updateWaOrder();
  }
  function updateWaOrder() {
    var p = PDP.p, a = $('#wa-order'); if (!a) return;
    a.href = waLink('Assalam o Alaikum! I\'d like to order:\n' + p.title + ' (' + p.sku + ')\nColour: ' + p.colors[PDP.color].name + (PDP.size ? '\nSize: ' + PDP.size : '') + '\nQty: ' + PDP.qty + '\nPrice: ' + money(now(p)) + '\n' + absUrl(productUrl(p)));
  }
  function related(p) {
    var look, title;
    if (p.dept === 'home') {
      look = R.PRODUCTS.filter(function (x) { return x.dept === 'home' && (x.cat === 'cushions' || x.cat === 'pillows' || x.cat === 'comforters') && x.id !== p.id; });
      title = 'Matching cushions & pillow covers';
    } else {
      look = R.PRODUCTS.filter(function (x) { return x.id !== p.id && x.dept === 'women' && (x.cat === 'dupattas' || x.cat === 'bottoms' || (p.collection && x.collection === p.collection)); });
      title = 'Complete the look';
    }
    var also = R.PRODUCTS.filter(function (x) { return x.cat === p.cat && x.id !== p.id; });
    return '<section class="section" style="padding-bottom:0"><div class="sec-head"><div><span class="eyebrow">Styled together</span><h2>' + title + '</h2></div></div>' + rail(look.slice(0, 8)) + '</section>' +
      (also.length ? '<section class="section" style="padding-bottom:0"><div class="sec-head"><div><span class="eyebrow">More like this</span><h2>You may also like</h2></div></div>' + rail(also.slice(0, 8)) + '</section>' : '');
  }
  function pushRecent(id) { var r = store.get('recent', []).filter(function (x) { return x !== id; }); r.unshift(id); store.set('recent', r.slice(0, 10)); }
  function recentHTML(exclude) {
    var r = store.get('recent', []).filter(function (x) { return x !== exclude; }).map(byId).filter(Boolean);
    return r.length > 1 ? '<section class="section"><div class="sec-head"><div><span class="eyebrow">Your history</span><h2>Recently viewed</h2></div></div>' + rail(r.slice(0, 8)) + '</section>' : '<div style="height:60px"></div>';
  }
  function mountProduct() {
    renderGallery(); renderPdpInfo();
    var m = $('#main-img');
    m.addEventListener('mousemove', function (e) { var r = m.getBoundingClientRect(); $('#main-pic').style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%'; });
    m.addEventListener('click', function () { m.classList.toggle('zoom'); });
    m.addEventListener('mouseleave', function () { m.classList.remove('zoom'); });
  }
  function pdpAdd(goCheckout) {
    var p = PDP.p, opts = p.sizes || p.bedSizes;
    if (opts && !PDP.size) { $('#size-err').hidden = false; $('#size-err').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (isOut(p, PDP.color, PDP.size)) { toast(T('Sorry, this is sold out', 'معذرت، یہ ختم ہو گیا ہے')); return; }
    addToCart(p.id, PDP.color, PDP.size, PDP.qty, !goCheckout);
    if (goCheckout) go(BASE + 'checkout');
  }

  /* ---------------- CART ---------------- */
  function lineKey(id, c, s) { return id + '|' + c + '|' + (s || ''); }
  function addToCart(id, color, size, qty, openDrawer) {
    var k = lineKey(id, color, size), l = state.cart.filter(function (x) { return x.k === k; })[0];
    var max = Math.min(10, stockOf(byId(id), color, size)), have = l ? l.qty : 0;
    if (max <= 0) { toast(T('Sorry, this is sold out', 'معذرت، یہ ختم ہو گیا ہے')); return; }
    var nq = Math.min(max, have + qty);
    if (l) l.qty = nq; else state.cart.push({ k: k, id: id, color: color, size: size, qty: nq });
    saveCart();
    if (have + qty > max) toast(T('Only ' + max + ' in stock — your bag has the maximum', 'اسٹاک میں صرف ' + max + ' — بیگ میں زیادہ سے زیادہ تعداد شامل ہے'));
    if (openDrawer) openPanel('cart'); else if (have + qty <= max) toast('Added to your bag');
  }
  function saveCart() { store.set('cart', state.cart); updateCounts(); }
  function subtotal() { return state.cart.reduce(function (s, l) { var p = byId(l.id); return s + (p ? now(p) * l.qty : 0); }, 0); }
  function savings() { return state.cart.reduce(function (s, l) { var p = byId(l.id); return s + (p && p.sale ? (p.price - p.sale) * l.qty : 0); }, 0); }
  function codeDiscount(sub) {
    var c = codeInfoFor(state.code); if (!c) return 0;
    if (c.min && sub < c.min) return 0;
    return c.type === 'pct' ? Math.round(sub * c.value / 100) : c.value;
  }
  /* store codes from data.js, plus every active affiliate code (customer discount set in admin) */
  function codeInfoFor(code) {
    if (!code) return null;
    if (S.discountCodes[code]) return S.discountCodes[code];
    var a = affByCode(code, true);
    return a ? { type: 'pct', value: AFFSET.customerPct, label: AFFSET.customerPct + '% off with ' + a.code } : null;
  }
  function freeBar(sub) {
    var left = S.freeDeliveryThreshold - sub, pct = Math.min(100, sub / S.freeDeliveryThreshold * 100);
    return '<div class="free-bar' + (left <= 0 ? ' done' : '') + '">' + (left > 0 ? T('Add <b>' + money(left) + '</b> more for <b>free delivery</b>', '<b>مفت ڈیلیوری</b> کے لیے مزید <b>' + money(left) + '</b> کی خریداری کریں') : ic('check', 'sm') + ' <b style="vertical-align:3px">' + T('You\'ve unlocked free delivery!', 'آپ کو مفت ڈیلیوری مل گئی!') + '</b>') + '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
  }
  function lineHTML(l, compact) {
    var p = byId(l.id); if (!p) return '';
    return '<div class="line"><a href="' + productUrl(p) + '"><img src="' + R.art.product(p, l.color, 0) + '" alt=""></a><div>' +
      '<h4><a href="' + productUrl(p) + '">' + esc(p.title) + '</a></h4><div class="meta">' + esc(p.colors[l.color].name) + (l.size ? ' · ' + esc(l.size) : '') + ' · ' + p.sku + '</div>' +
      '<div class="price" style="margin-top:6px;font-size:14px">' + (p.sale ? '<span class="now sale">' + money(p.sale) + '</span><s>' + money(p.price) + '</s>' : '<span class="now">' + money(p.price) + '</span>') + '</div>' +
      '<div class="bottom"><div class="qty sm"><button data-lq="-1" data-k="' + esc(l.k) + '" aria-label="Decrease">' + ic('minus', 'sm') + '</button><input value="' + l.qty + '" readonly aria-label="Quantity"><button data-lq="1" data-k="' + esc(l.k) + '" aria-label="Increase">' + ic('plus', 'sm') + '</button></div>' +
      '<button class="rm" data-rm="' + esc(l.k) + '">Remove</button></div></div></div>';
  }
  function renderCartDrawer() {
    var n = state.cart.reduce(function (s, l) { return s + l.qty; }, 0);
    $('#cart-head-n').textContent = n ? '(' + n + ')' : '';
    if (!state.cart.length) {
      $('#cart-body').innerHTML = '<div class="empty" style="padding:50px 0"><h2 style="font-size:28px">Your bag is empty</h2><p>Discover new arrivals and bestsellers.</p><a class="btn btn-dark" href="' + BASE + 'new-in">Shop New In</a></div>';
      $('#cart-foot').innerHTML = ''; $('#cart-foot').style.display = 'none'; return;
    }
    var sub = subtotal();
    $('#cart-body').innerHTML = '<div style="padding-top:12px">' + freeBar(sub) + '</div>' + state.cart.map(function (l) { return lineHTML(l, true); }).join('');
    $('#cart-foot').style.display = '';
    $('#cart-foot').innerHTML = (savings() ? '<div class="sum-row"><span>You save</span><span class="green" style="color:var(--ok);font-weight:600">' + money(savings()) + '</span></div>' : '') +
      '<div class="sum-row" style="font-weight:600;font-size:16px"><span>Subtotal</span><span>' + money(sub) + '</span></div>' +
      '<p class="muted" style="font-size:12px;margin:2px 0 12px">Delivery and discounts calculated at checkout.</p>' +
      '<a class="btn btn-primary btn-block" href="' + BASE + 'checkout">Checkout · ' + money(sub) + '</a>' +
      '<a class="btn btn-outline btn-block" style="margin-top:8px" href="' + BASE + 'cart">View bag</a>';
  }
  function viewCart() {
    document.title = 'Your bag | RSBRI Fashion';
    if (!state.cart.length) return crumbs([['Bag']]) + '<div class="wrap"><div class="empty"><h2>Your bag is empty</h2><p>Your next favourite outfit is waiting.</p><a class="btn btn-dark" href="' + BASE + 'new-in">Shop New In</a></div></div>';
    var sub = subtotal(), disc = codeDiscount(sub), gw = state.giftWrap ? S.giftWrapFee : 0;
    var codeInfo = state.code ? (disc ? '<div class="sum-row"><span>Code ' + esc(state.code) + ' <button class="link muted" data-code-rm style="font-size:12px">remove</button></span><span class="green" style="color:var(--ok)">−' + money(disc) + '</span></div>' : '<p class="error">' + esc((codeInfoFor(state.code) || { label: 'Code ' + state.code }).label) + ' — not yet eligible.</p>') : '';
    return crumbs([['Bag']]) + '<div class="wrap"><div class="plp-head"><h1>Your bag</h1></div><div class="cart-page"><div>' + freeBar(sub) + state.cart.map(function (l) { return lineHTML(l); }).join('') +
      '<label class="check" style="margin-top:20px">' + '<input type="checkbox" id="gift"' + (state.giftWrap ? ' checked' : '') + '><span>' + ic('gift', 'sm') + ' ' + T('<b>Add gift wrap</b> (' + money(S.giftWrapFee) + ') — RSBRI box with a handwritten card. Perfect for Eid and weddings.', '<b>گفٹ ریپ شامل کریں</b> (' + money(S.giftWrapFee) + ') — ہاتھ سے لکھے کارڈ کے ساتھ RSBRI باکس۔ عید اور شادیوں کے لیے بہترین۔') + '</span></label></div>' +
      '<aside class="summary"><h3>Order summary</h3>' +
      '<form id="code-form" class="inline-field" style="margin-bottom:16px"><input class="input" id="code" placeholder="Discount code" aria-label="Discount code" style="min-height:44px"><button class="btn btn-outline" style="min-height:44px;padding:0 18px">Apply</button></form>' +
      '<div class="sum-row"><span>Subtotal</span><span>' + money(sub) + '</span></div>' + codeInfo +
      (gw ? '<div class="sum-row"><span>Gift wrap</span><span>' + money(gw) + '</span></div>' : '') +
      '<div class="sum-row"><span>Delivery</span><span>' + (sub >= S.freeDeliveryThreshold ? '<span class="green" style="color:var(--ok)">Free</span>' : 'Calculated at checkout') + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span>' + money(sub - disc + gw) + '</span></div>' +
      '<p class="muted" style="font-size:12px">Prices include sales tax. Pay online and save a further ' + money(S.prepaidDiscount) + '.</p>' +
      '<a class="btn btn-primary btn-block" href="' + BASE + 'checkout">Proceed to checkout</a>' +
      '<div class="secure-note">' + ic('lock', 'sm') + ' Secure checkout</div>' +
      '<div class="pay-logos" style="justify-content:center"><span>COD</span><span>JazzCash</span><span>Easypaisa</span><span>VISA</span><span>Mastercard</span></div></aside></div></div>';
  }
  function mountCart() {
    var g = $('#gift'); if (g) g.onchange = function () { state.giftWrap = g.checked; store.set('giftWrap', g.checked); rerender(); };
    var f = $('#code-form'); if (f) f.onsubmit = function (e) {
      e.preventDefault(); var v = $('#code').value.trim().toUpperCase();
      if (codeInfoFor(v)) { state.code = v; store.set('code', v); toast('Code ' + v + ' applied'); rerender(); }
      else { $('#code').classList.add('err'); toast('That code isn\'t valid. Try WELCOME10'); }
    };
  }

  /* ---------------- CHECKOUT ---------------- */
  function validPhone(v) { return /^(\+92|0092|92|0)?3\d{2}[-\s]?\d{7}$/.test(v.replace(/\s+/g, '').replace(/^(\+92|0092|92)(?=3)/, '0')) || /^03\d{2}-?\d{7}$/.test(v.trim()); }
  function shippingFor(city, sub, method) {
    if (method === 'express') return S.expressFee;
    if (sub >= S.freeDeliveryThreshold) return 0;
    var c = R.CITIES.filter(function (x) { return x.name === city; })[0];
    return !c ? S.deliveryFee : c.zone === 'local' ? 200 : c.zone === 'major' ? S.deliveryFee : 350;
  }
  var CO = { pay: 'cod', ship: 'standard' };
  function viewCheckout() {
    document.title = 'Checkout | RSBRI Fashion';
    if (!state.cart.length) return '<div class="wrap"><div class="empty"><h2>Your bag is empty</h2><p>Add something you love, then come back to check out.</p><a class="btn btn-dark" href="' + BASE + '">Continue shopping</a></div></div>';
    var u = state.user || {}, a = (u.addresses && u.addresses[0]) || {};
    var express = R.CITIES.filter(function (c) { return c.express; }).map(function (c) { return c.name; });
    return '<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="' + BASE + 'cart">Bag</a><span aria-hidden="true">/</span><span aria-current="page">Checkout</span></nav>' +
      '<form class="co" id="co-form" novalidate><div>' +
      '<section class="co-step"><h2><span class="n">1</span>Contact</h2><div class="fgrid">' +
        '<div class="field"><label for="phone">Mobile number</label><div class="phone"><span>🇵🇰 +92</span><input class="input" id="phone" inputmode="tel" autocomplete="tel" placeholder="03XX-XXXXXXX" value="' + esc(u.phone || '') + '" required></div><span class="hint">We\'ll send order updates by WhatsApp &amp; SMS.</span></div>' +
        '<div class="field"><label for="email">Email <span class="muted">(optional)</span></label><input class="input" id="email" type="email" autocomplete="email" value="' + esc(u.email || '') + '"></div>' +
        '<label class="check"><input type="checkbox" id="wa-opt" checked> Send me new launches &amp; offers on WhatsApp</label>' +
        (state.user ? '' : '<p class="hint" style="margin:0">' + T('Have an account? <a class="link" href="' + BASE + 'account">Sign in with OTP</a> — or continue as a guest.', 'اکاؤنٹ ہے؟ <a class="link" href="' + BASE + 'account">OTP سے سائن ان کریں</a> — یا بطور مہمان جاری رکھیں۔') + '</p>') +
      '</div></section>' +
      '<section class="co-step"><h2><span class="n">2</span>Delivery address</h2><div class="fgrid two">' +
        '<div class="field"><label for="fname">First name</label><input class="input" id="fname" autocomplete="given-name" value="' + esc(a.fname || '') + '" required></div>' +
        '<div class="field"><label for="lname">Last name</label><input class="input" id="lname" autocomplete="family-name" value="' + esc(a.lname || '') + '" required></div>' +
        '<div class="field"><label for="city">City</label><select class="input" id="city" required>' + R.CITIES.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === (a.city || state.city) ? ' selected' : '') + ' translate="no">' + c.name + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="area">Area / Sector</label><input class="input" id="area" placeholder="e.g. DHA Phase 5, Gulberg III, F-7/2" value="' + esc(a.area || '') + '" required></div>' +
        '<div class="field" style="grid-column:1/-1"><label for="street">Street &amp; house no.</label><input class="input" id="street" autocomplete="street-address" placeholder="House 12, Street 4" value="' + esc(a.street || '') + '" required></div>' +
        '<div class="field" style="grid-column:1/-1"><label for="landmark">Nearest landmark</label><input class="input" id="landmark" placeholder="e.g. Near Jamia Masjid, opposite Imtiaz Store" value="' + esc(a.landmark || '') + '"><span class="hint">Helps the courier find you faster.</span></div>' +
      '</div></section>' +
      '<section class="co-step"><h2><span class="n">3</span>Delivery method</h2><div id="ship-opts"></div><p class="hint" style="margin:10px 0 0">Express is available in ' + express.join(', ') + '.</p></section>' +
      '<section class="co-step"><h2><span class="n">4</span>Payment</h2><div id="pay-opts"></div></section>' +
      '</div>' +
      '<aside class="summary" id="co-summary"></aside></form></div>';
  }
  function renderCheckoutDynamic() {
    var city = $('#city').value, sub = subtotal();
    var c = R.CITIES.filter(function (x) { return x.name === city; })[0];
    var expressOK = !!(c && c.express);
    if (!expressOK && CO.ship === 'express') CO.ship = 'standard';
    var std = shippingFor(city, sub, 'standard');
    $('#ship-opts').innerHTML =
      rc('ship', 'standard', 'Standard delivery', c.days + ' working days · Leopards / TCS', std ? money(std) : 'Free', CO.ship === 'standard') +
      (expressOK ? rc('ship', 'express', 'Express delivery', 'Next working day if ordered before 2pm PKT', money(S.expressFee), CO.ship === 'express') : '');
    var prepaid = '<span class="tag-green">Save ' + money(S.prepaidDiscount) + '</span>';
    $('#pay-opts').innerHTML =
      rc('pay', 'cod', 'Cash on Delivery', 'Pay in cash when your order arrives. We\'ll confirm by WhatsApp/SMS before dispatch.', '', CO.pay === 'cod', '<p class="hint" style="margin:0">Please keep the exact amount ready. Orders above ' + money(50000) + ' require advance payment.</p>') +
      rc('pay', 'jazzcash', 'JazzCash ' + prepaid, 'Pay from your JazzCash mobile wallet', '', CO.pay === 'jazzcash', '<div class="field"><label for="wallet-j">JazzCash account number</label><input class="input" id="wallet-j" inputmode="tel" placeholder="03XX-XXXXXXX"></div><p class="hint" style="margin:0">You\'ll get a prompt on your phone to approve the payment with your MPIN.</p>') +
      rc('pay', 'easypaisa', 'Easypaisa ' + prepaid, 'Pay from your Easypaisa mobile account', '', CO.pay === 'easypaisa', '<div class="field"><label for="wallet-e">Easypaisa account number</label><input class="input" id="wallet-e" inputmode="tel" placeholder="03XX-XXXXXXX"></div>') +
      rc('pay', 'card', 'Debit / Credit card ' + prepaid, 'Visa, Mastercard, UnionPay', '', CO.pay === 'card', '<p class="hint" style="margin:0">' + ic('lock', 'sm') + ' You\'ll be redirected to our bank\'s secure payment page. RSBRI never stores your card details.</p>') +
      rc('pay', 'bank', 'Bank transfer / IBFT / Raast ' + prepaid, 'Transfer and share the receipt on WhatsApp', '', CO.pay === 'bank', '<p class="hint" style="margin:0">Account details will be shown after you place the order. Your order is confirmed once payment is received.</p>');
    renderCoSummary();
  }
  function rc(name, val, title, sub, right, on, extra) {
    return '<label class="radio-card' + (on ? ' on' : '') + '"><input type="radio" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + '><div class="rc-main"><b>' + title + '</b><div class="rc-sub">' + sub + '</div>' + (extra ? '<div class="rc-extra">' + extra + '</div>' : '') + '</div>' + (right ? '<span class="rc-right">' + right + '</span>' : '') + '</label>';
  }
  function totals() {
    var sub = subtotal(), city = $('#city') ? $('#city').value : state.city;
    var disc = codeDiscount(sub), ship = shippingFor(city, sub, CO.ship), gw = state.giftWrap ? S.giftWrapFee : 0, pre = CO.pay !== 'cod' ? S.prepaidDiscount : 0;
    return { sub: sub, disc: disc, ship: ship, gw: gw, pre: pre, total: Math.max(0, sub - disc + ship + gw - pre) };
  }
  function renderCoSummary() {
    var t = totals();
    $('#co-summary').innerHTML = '<h3>Your order</h3>' + state.cart.map(function (l) {
      var p = byId(l.id); return '<div class="co-mini"><div class="ph"><img src="' + R.art.product(p, l.color, 0) + '" alt=""><span class="q">' + l.qty + '</span></div><div class="t">' + esc(p.title) + '<small>' + esc(p.colors[l.color].name) + (l.size ? ' · ' + esc(l.size) : '') + '</small></div><b style="font-size:14px">' + money(now(p) * l.qty) + '</b></div>';
    }).join('') +
      '<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px">' +
      '<div class="sum-row"><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' +
      (t.disc ? '<div class="sum-row"><span>Discount (' + esc(state.code) + ')</span><span style="color:var(--ok)">−' + money(t.disc) + '</span></div>' : '') +
      (t.gw ? '<div class="sum-row"><span>Gift wrap</span><span>' + money(t.gw) + '</span></div>' : '') +
      '<div class="sum-row"><span>Delivery</span><span>' + (t.ship ? money(t.ship) : '<span style="color:var(--ok)">Free</span>') + '</span></div>' +
      (t.pre ? '<div class="sum-row"><span>Online payment discount</span><span style="color:var(--ok)">−' + money(t.pre) + '</span></div>' : '') +
      '<div class="sum-row total"><span>Total</span><span>' + money(t.total) + '</span></div>' +
      '<p class="muted" style="font-size:12px;margin:4px 0 16px">Includes sales tax.</p>' +
      (CO.pay === 'cod' && t.sub >= 50000 ? '<p class="error">Orders above ' + money(50000) + ' need advance payment — please choose another method.</p>' : '') +
      '<button class="btn btn-primary btn-block" type="submit">' + (CO.pay === 'cod' ? 'Place order · ' : 'Pay ') + money(t.total) + '</button>' +
      '<div class="secure-note">' + ic('lock', 'sm') + ' Your information is protected</div>' +
      '<p class="muted" style="font-size:11.5px;text-align:center;margin:10px 0 0">' + T('By placing your order you agree to our <a class="link" href="' + BASE + 'page/terms">Terms</a> and <a class="link" href="' + BASE + 'page/privacy">Privacy Policy</a>.', 'آرڈر دے کر آپ ہماری <a class="link" href="' + BASE + 'page/terms">شرائط</a> اور <a class="link" href="' + BASE + 'page/privacy">پرائیویسی پالیسی</a> سے اتفاق کرتے ہیں۔') + '</p></div>';
  }
  function mountCheckout() {
    if (!$('#co-form')) return;
    renderCheckoutDynamic();
    $('#city').onchange = function () { state.city = this.value; store.set('city', this.value); renderCheckoutDynamic(); };
    $('#co-form').addEventListener('change', function (e) {
      if (e.target.name === 'pay') { CO.pay = e.target.value; renderCheckoutDynamic(); }
      if (e.target.name === 'ship') { CO.ship = e.target.value; renderCheckoutDynamic(); }
    });
    $('#co-form').onsubmit = function (e) {
      e.preventDefault();
      var ok = true, first = null;
      function need(id, test, msg) {
        var el = $('#' + id), v = el.value.trim(), good = test ? test(v) : !!v;
        el.classList.toggle('err', !good);
        var n = el.parentNode.classList.contains('phone') ? el.parentNode : el, er = n.parentNode.querySelector('.error');
        if (!good) { if (!er) { er = document.createElement('span'); er.className = 'error'; n.insertAdjacentElement('afterend', er); } er.textContent = msg; ok = false; first = first || el; }
        else if (er) er.remove();
      }
      need('phone', validPhone, 'Enter a valid Pakistani mobile number, e.g. 0300-1234567');
      need('fname', null, 'Please enter your first name');
      need('lname', null, 'Please enter your last name');
      need('area', null, 'Please enter your area or sector');
      need('street', null, 'Please enter your street and house number');
      if (CO.pay === 'jazzcash') need('wallet-j', validPhone, 'Enter your JazzCash number');
      if (CO.pay === 'easypaisa') need('wallet-e', validPhone, 'Enter your Easypaisa number');
      var t = totals();
      if (CO.pay === 'cod' && t.sub >= 50000) { ok = false; }
      if (!ok) { if (first) first.focus(); return; }
      var addr = { fname: $('#fname').value.trim(), lname: $('#lname').value.trim(), city: $('#city').value, area: $('#area').value.trim(), street: $('#street').value.trim(), landmark: $('#landmark').value.trim() };
      var id = 'RS-' + (Date.now() % 1e6 + 100000);
      // re-check stock at the moment of ordering (another order may have taken the last piece)
      var short = state.cart.filter(function (l) { return stockOf(byId(l.id), l.color, l.size) < l.qty; });
      if (short.length) { toast(T('Some items just sold out — please review your bag', 'کچھ اشیاء ابھی ختم ہو گئیں — براہ کرم بیگ دیکھیں')); openPanel('cart'); return; }
      var aff = (affByCode(state.code, true) || {}).code || activeRef();
      var order = { id: id, at: Date.now(), phone: $('#phone').value.trim(), email: $('#email').value.trim(), addr: addr, lines: state.cart.slice(), totals: t, pay: CO.pay, ship: CO.ship, status: CO.pay === 'cod' ? 0 : 1,
        aff: aff || null, commission: aff ? Math.round((t.sub - t.disc) * AFFSET.rate / 100) : 0 };
      state.orders.unshift(order); store.set('orders', state.orders);
      order.lines.forEach(function (l) { setStock(l.k, stockOf(byId(l.id), l.color, l.size) - l.qty, 'Order ' + id, 'Website'); });
      logActivity('Order', id, 'Placed · ' + money(t.total) + ' · ' + PAY_LABEL[CO.pay] + (aff ? ' · affiliate ' + aff : ''), 'Website');
      if (state.user) { state.user.addresses = [addr]; store.set('user', state.user); }
      state.cart = []; state.code = null; state.giftWrap = false; store.set('code', null); store.set('giftWrap', false); saveCart();
      go(BASE + 'order/' + id);
    };
  }

  var STATUSES = ['Pending confirmation', 'Confirmed', 'Packed', 'Dispatched', 'Delivered'];
  function timeline(st) {
    if (st < 0) return '<p class="error" style="margin:24px 0">' + T('This order was cancelled.', 'یہ آرڈر منسوخ کر دیا گیا۔') + '</p>';
    return '<ol class="timeline">' + STATUSES.map(function (s, i) { return '<li class="' + (i <= st ? 'done' : '') + '"><i>' + (i <= st ? ic('check') : '') + '</i>' + s + '</li>'; }).join('') + '</ol>';
  }
  var PAY_LABEL = { cod: 'Cash on Delivery', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', card: 'Debit / Credit card', bank: 'Bank transfer' };
  function viewOrder(id) {
    var o = state.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return viewNotFound();
    document.title = 'Order ' + id + ' | RSBRI Fashion';
    var c = R.CITIES.filter(function (x) { return x.name === o.addr.city; })[0];
    return '<div class="wrap"><div class="confirm"><div class="tick">' + ic('check') + '</div><span class="eyebrow">Shukriya, ' + esc(o.addr.fname) + '!</span><h1>Your order is placed</h1>' +
      '<p class="ord">Order <b>' + o.id + '</b> · ' + money(o.totals.total) + ' · ' + PAY_LABEL[o.pay] + '</p>' +
      (o.pay === 'cod' ? '<div class="box" style="margin-bottom:10px"><b>Please confirm on WhatsApp</b><p style="margin:6px 0 12px">We\'ve sent a confirmation message to <b>' + esc(o.phone) + '</b>. Reply <b>YES</b> to confirm — we dispatch confirmed COD orders within 24 hours.</p><a class="btn btn-wa" target="_blank" rel="noopener" href="' + waLink('Assalam o Alaikum, I confirm my RSBRI order ' + o.id + '.') + '"><svg class="icon sm" style="fill:#fff;stroke:none"><use href="#i-wa"/></svg>Confirm on WhatsApp</a></div>' : '') +
      (o.pay === 'bank' ? '<div class="box" style="margin-bottom:10px"><b>Bank transfer details</b><p style="margin:6px 0 0">Account title: RSBRI Fashion (Pvt) Ltd<br>Bank: [Your bank]<br>IBAN: PK00 XXXX 0000 0000 0000 0000<br>Reference: <b>' + o.id + '</b><br>Please share the receipt on WhatsApp.</p></div>' : '') +
      timeline(o.status) +
      '<div class="box"><div class="fgrid two"><div><span class="label">Delivering to</span><p style="margin:6px 0 0">' + esc(o.addr.fname + ' ' + o.addr.lname) + '<br>' + esc(o.addr.street) + ', ' + esc(o.addr.area) + '<br>' + esc(o.addr.city) + (o.addr.landmark ? '<br><span class="muted">Near ' + esc(o.addr.landmark) + '</span>' : '') + '</p></div>' +
      '<div><span class="label">Estimated delivery</span><p style="margin:6px 0 0">' + (o.ship === 'express' ? 'Next working day' : (c ? c.days : '4–7') + ' working days') + '<br><span class="muted">Updates via WhatsApp &amp; SMS</span></p></div></div>' +
      '<div style="border-top:1px solid var(--line);margin-top:16px;padding-top:6px">' + o.lines.map(function (l) { var p = byId(l.id); return p ? '<div class="co-mini"><div class="ph"><img src="' + R.art.product(p, l.color, 0) + '" alt=""><span class="q">' + l.qty + '</span></div><div class="t">' + esc(p.title) + '<small>' + esc(p.colors[l.color].name) + (l.size ? ' · ' + esc(l.size) : '') + '</small></div><b style="font-size:14px">' + money(now(p) * l.qty) + '</b></div>' : ''; }).join('') + '</div></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:28px;flex-wrap:wrap"><a class="btn btn-dark" href="' + BASE + '">Continue shopping</a><a class="btn btn-outline" href="' + BASE + 'track?o=' + o.id + '">Track order</a></div></div></div>';
  }

  /* ---------------- ACCOUNT / TRACK / WISHLIST ---------------- */
  function viewAccount() {
    document.title = 'My account | RSBRI Fashion';
    if (!state.user) {
      return crumbs([['Account']]) + '<div class="wrap"><div class="page" style="max-width:460px"><h1>Sign in</h1><p>Use your mobile number — we\'ll send a one-time code by SMS. No password needed.</p>' +
        '<form id="login" class="fgrid" novalidate><div class="field"><label for="lphone">Mobile number</label><div class="phone"><span>🇵🇰 +92</span><input class="input" id="lphone" inputmode="tel" placeholder="03XX-XXXXXXX"></div></div>' +
        '<div class="field" id="otp-wrap" hidden><label for="otp">6-digit code</label><input class="input" id="otp" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"><span class="hint">Demo: enter any 6 digits.</span></div>' +
        '<button class="btn btn-dark btn-block" id="login-btn">Send code</button><span class="error" id="lerr"></span></form>' +
        '<div style="display:grid;gap:8px;margin-top:18px"><button class="btn btn-outline btn-block" data-alt-login>Continue with Google</button><button class="btn btn-outline btn-block" data-alt-login>Continue with email</button></div></div></div>';
    }
    var u = state.user, orders = state.orders.filter(function (o) { return o.phone.replace(/\D/g, '').slice(-10) === u.phone.replace(/\D/g, '').slice(-10); });
    return crumbs([['Account']]) + '<div class="wrap"><div class="page" style="max-width:900px"><span class="eyebrow">My account</span><h1>Assalam o Alaikum</h1><p>Signed in as <b>' + esc(u.phone) + '</b> · <button class="link" id="logout">Sign out</button></p>' +
      '<h2>Orders</h2>' + (orders.length ? orders.map(function (o) {
        return '<div class="box" style="margin-bottom:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><b>' + o.id + '</b> · ' + new Date(o.at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) + '<br><span class="muted">' + o.lines.length + ' item(s) · ' + money(o.totals.total) + ' · ' + statusName(o.status) + '</span></div>' +
          '<div style="display:flex;gap:8px"><a class="btn btn-outline" href="' + BASE + 'order/' + o.id + '">View</a><button class="btn btn-dark" data-reorder="' + o.id + '">Re-order</button></div></div>';
      }).join('') : '<p class="muted">No orders yet.</p>') +
      '<h2>Saved addresses</h2>' + (u.addresses && u.addresses.length ? u.addresses.map(function (a) { return '<div class="box">' + esc(a.fname + ' ' + a.lname) + '<br>' + esc(a.street + ', ' + a.area + ', ' + a.city) + '</div>'; }).join('') : '<p class="muted">Your address will be saved at your next checkout.</p>') +
      '<h2>Exchange request</h2><p>Need a different size or colour? Raise a request within 7 days of delivery and we\'ll arrange a courier pickup.</p><a class="btn btn-outline" href="' + waLink('Assalam o Alaikum, I would like to request an exchange for my RSBRI order.') + '" target="_blank" rel="noopener">Request exchange on WhatsApp</a>' +
      '</div></div>';
  }
  function mountAccount() {
    var f = $('#login');
    if (f) {
      var step = 1;
      f.onsubmit = function (e) {
        e.preventDefault();
        var ph = $('#lphone').value.trim();
        if (step === 1) {
          if (!validPhone(ph)) { $('#lerr').textContent = 'Enter a valid mobile number, e.g. 0300-1234567'; return; }
          $('#lerr').textContent = ''; $('#otp-wrap').hidden = false; $('#login-btn').textContent = 'Verify & sign in'; step = 2; $('#otp').focus();
          toast('Code sent to ' + ph);
        } else {
          if (!/^\d{6}$/.test($('#otp').value)) { $('#lerr').textContent = 'Enter the 6-digit code'; return; }
          state.user = { phone: ph, addresses: [] }; store.set('user', state.user); toast('Signed in'); rerender();
        }
      };
    }
    var lo = $('#logout'); if (lo) lo.onclick = function () { state.user = null; store.set('user', null); rerender(); };
  }
  function viewTrack() {
    document.title = 'Track your order | RSBRI Fashion';
    var q = parseQuery(), o = q.o ? state.orders.filter(function (x) { return x.id === q.o; })[0] : null;
    return crumbs([['Track your order']]) + '<div class="wrap"><div class="page" style="max-width:640px"><h1>Track your order</h1><p>Enter your order number and the mobile number used at checkout.</p>' +
      '<form id="track" class="fgrid two" novalidate><div class="field"><label for="tord">Order number</label><input class="input" id="tord" placeholder="RS-123456" value="' + esc(q.o || '') + '"></div><div class="field"><label for="tph">Mobile number</label><input class="input" id="tph" inputmode="tel" placeholder="03XX-XXXXXXX"></div><button class="btn btn-dark" style="grid-column:1/-1">Track</button></form>' +
      '<div id="track-res">' + (o ? trackResult(o) : '') + '</div></div></div>';
  }
  function trackResult(o) { return '<div class="box" style="margin-top:24px"><b>Order ' + o.id + '</b> · ' + statusName(o.status) + timeline(o.status) + '<p class="muted" style="margin:0;font-size:13px">Courier tracking number appears here once your order is dispatched.</p></div>'; }
  function mountTrack() {
    var f = $('#track'); if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault(); var id = $('#tord').value.trim().toUpperCase(), o = state.orders.filter(function (x) { return x.id === id; })[0];
      $('#track-res').innerHTML = o ? trackResult(o) : '<p class="error" style="margin-top:18px">We couldn\'t find that order. Check the number in your WhatsApp/SMS confirmation, or <a class="link" href="' + waLink('Hi, I need help tracking my order ' + id) + '" target="_blank" rel="noopener">ask us on WhatsApp</a>.</p>';
    };
  }
  function viewWishlist() {
    document.title = 'Wishlist | RSBRI Fashion';
    var items = state.wish.map(byId).filter(Boolean);
    return crumbs([['Wishlist']]) + '<div class="wrap"><div class="plp-head"><h1>Wishlist</h1><p>' + (items.length ? items.length + ' saved item' + (items.length > 1 ? 's' : '') : '') + '</p></div>' +
      (items.length ? '<div class="grid g4" style="margin-bottom:80px">' + items.map(card).join('') + '</div>' : '<div class="empty"><h2>Nothing saved yet</h2><p>Tap the heart on any product to save it for later.</p><a class="btn btn-dark" href="' + BASE + 'best-sellers">Browse best sellers</a></div>') + '</div>';
  }

  /* ---------------- SEARCH ---------------- */
  function searchProducts(q) {
    q = q.toLowerCase().trim(); if (!q) return [];
    var terms = q.split(/\s+/).map(function (t) { return R.SYNONYMS[t] ? R.SYNONYMS[t] : t; }).join(' ');
    if (R.SYNONYMS[q]) terms = R.SYNONYMS[q];
    var words = terms.split(/\s+/);
    return R.PRODUCTS.map(function (p) {
      var hay = (p.title + ' ' + p.fabric + ' ' + catName(p.dept, p.cat) + ' ' + p.cat + ' ' + (p.collection || '') + ' ' + p.colors.map(function (c) { return c.name; }).join(' ') + ' ' + (p.occasion || '') + ' ' + R.DEPARTMENTS[p.dept].name + (p.cat === 'pret' ? ' kurti kurta' : '') + (p.cat === 'duvets-quilts' ? ' razai quilt' : '') + (p.cat === 'bedsheets' ? ' bedsheet' : '')).toLowerCase();
      var score = words.reduce(function (s, w) { return s + (hay.indexOf(w) > -1 ? (p.title.toLowerCase().indexOf(w) > -1 ? 3 : 1) : 0); }, 0);
      return { p: p, s: score };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s || b.p.sold - a.p.sold; }).map(function (x) { return x.p; });
  }
  function renderSearch(q) {
    var body = $('#search-body');
    if (!q.trim()) {
      var pop = ['Lawn 3-piece', 'Chadar', 'Bridal bed set', 'Kurti', 'Razai', 'Velvet', 'Comforter', 'Shawl'];
      body.innerHTML = '<h4>Popular searches</h4><div class="sugg">' + pop.map(function (s) { return '<button class="chip" data-sq="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
        '<h4>Trending now</h4><div class="s-results">' + R.PRODUCTS.slice().sort(function (a, b) { return b.sold - a.sold; }).slice(0, 5).map(card).join('') + '</div>';
      return;
    }
    var res = searchProducts(q), syn = R.SYNONYMS[q.toLowerCase().trim()];
    body.innerHTML = (syn ? '<p class="s-hint">Showing results for <b>' + esc(syn.split(' ')[0]) + '</b> (' + esc(q) + ')</p>' : '') +
      (res.length ? '<h4>' + res.length + ' product' + (res.length > 1 ? 's' : '') + '</h4><div class="s-results">' + res.slice(0, 10).map(card).join('') + '</div>' +
        (res.length > 10 ? '<div class="load-more"><a class="btn btn-outline" href="' + BASE + 'search?q=' + encodeURIComponent(q) + '">See all ' + res.length + ' results</a></div>' : '')
        : '<div class="empty" style="padding:30px 0"><h2 style="font-size:28px">No results for “' + esc(q) + '”</h2><p>Try “lawn”, “bedsheet” or “bridal”.</p></div>');
  }

  /* ---------------- CONTENT PAGES ---------------- */
  function sizeTable(kind, unit) {
    if (kind === 'bed') {
      return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Bed size</th><th>Bedsheet</th><th>Fits mattress</th><th>Pillow cover</th></tr></thead><tbody>' +
        [['Single', [60, 90], [36, 78], [19, 29]], ['Double', [90, 100], [54, 75], [19, 29]], ['King', [100, 108], [72, 78], [20, 30]], ['Super King', [108, 108], [78, 84], [20, 30]]].map(function (r) {
          function f(a) { return unit === 'cm' ? Math.round(a[0] * 2.54) + ' × ' + Math.round(a[1] * 2.54) + ' cm' : a[0] + ' × ' + a[1] + '″'; }
          return '<tr><td><b>' + r[0] + '</b></td><td>' + f(r[1]) + '</td><td>' + f(r[2]) + '</td><td>' + f(r[3]) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var rows = [['XS', 34, 37, 38], ['S', 36, 38, 39], ['M', 38, 39, 40], ['L', 41, 40, 40], ['XL', 44, 41, 41]];
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Size</th><th>Chest</th><th>Shirt length</th><th>Trouser length</th></tr></thead><tbody>' +
      rows.map(function (r) { function f(n) { return unit === 'cm' ? Math.round(n * 2.54) + ' cm' : n + '″'; } return '<tr><td><b>' + r[0] + '</b></td><td>' + f(r[1]) + '</td><td>' + f(r[2]) + '</td><td>' + f(r[3]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function guideModal(kind) {
    var unit = 'in';
    function draw() {
      $('#guide-body').innerHTML = sizeTable(kind, unit);
      $$('[data-unit]').forEach(function (b) { b.classList.toggle('on', b.dataset.unit === unit); });
    }
    modal('<h3>' + (kind === 'bed' ? 'Bedsheet size guide' : 'Size guide') + '</h3><p class="muted" style="margin:0 0 6px">' + (kind === 'bed' ? 'Measure your mattress and allow 10–12″ on each side for tucking.' : 'Body measurements. Between sizes? Choose the larger size for a relaxed fit.') + '</p>' +
      '<div class="seg unit-toggle"><button class="on" data-unit="in">Inches</button><button data-unit="cm">cm</button></div><div id="guide-body"></div>');
    draw();
    $$('[data-unit]').forEach(function (b) { b.onclick = function () { unit = b.dataset.unit; draw(); }; });
  }

  var PAGES = {
    'about': ['About RSBRI', '<p>RSBRI Fashion is a Pakistani label for women\'s clothing and home textiles. We design every print, choose every fabric and finish every piece with the care of a designer house — and we sell it directly to you, so you get premium quality at honest prices.</p><h2>Our promise</h2><ul><li>Fabrics you can trust — true-to-description lawn, khaddar, sateen and percale.</li><li>Clear measurements — metres per piece and bedsheet sizes on every product.</li><li>Service that answers — WhatsApp us and a real person replies.</li></ul>'],
    'contact': ['Contact & WhatsApp', '<p>We\'re here 10am – 8pm PKT, Monday to Saturday.</p><ul><li><b>WhatsApp:</b> <a class="link" target="_blank" rel="noopener" href="' + waLink('Assalam o Alaikum RSBRI!') + '">' + waDisplay() + '</a></li><li><b>Email:</b> care@rsbrifashion.com</li><li><b>Warehouse:</b> Faisalabad, Pakistan</li></ul><p>For order questions, please keep your order number (RS-XXXXXX) handy.</p>'],
    'delivery': ['Delivery information', '<p>We ship across Pakistan with Leopards and TCS, and Pakistan Post for remote areas.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zone</th><th>Time</th><th>Fee</th></tr></thead><tbody><tr><td>Faisalabad</td><td>1–2 working days</td><td>Rs. 200</td></tr><tr><td>Major cities</td><td>1–4 working days</td><td>Rs. 250</td></tr><tr><td>Rest of Pakistan</td><td>4–7 working days</td><td>Rs. 350</td></tr><tr><td>Express (Faisalabad, Lahore, Islamabad, Rawalpindi)</td><td>Next working day</td><td>Rs. 450</td></tr></tbody></table></div><p><b>Free standard delivery</b> on all orders over ' + money(S.freeDeliveryThreshold) + '. You\'ll get WhatsApp and SMS updates at every step: confirmed → dispatched (with tracking) → out for delivery → delivered.</p>'],
    'returns': ['Exchange & returns', T('<p>Not quite right? Exchange it within <b>7 days</b> of delivery.</p><ul><li>Items must be unused, unwashed and have original tags.</li><li>Refunds are issued as store credit, or to your JazzCash/Easypaisa wallet or bank account.</li><li>Not eligible: cut unstitched fabric, opened pillows, and final-sale items.</li><li>Request from your account or on WhatsApp — we\'ll arrange a courier pickup.</li></ul>',
      '<p>پسند نہیں آیا؟ ڈیلیوری کے <b>7 دن</b> کے اندر تبدیل کریں۔</p><ul><li>اشیاء غیر استعمال شدہ، بغیر دھلی اور اصل ٹیگ کے ساتھ ہوں۔</li><li>رقم اسٹور کریڈٹ، یا آپ کے جاز کیش/ایزی پیسہ والیٹ یا بینک اکاؤنٹ میں واپس کی جاتی ہے۔</li><li>شامل نہیں: کٹا ہوا ان سلا کپڑا، کھلے ہوئے تکیے، اور فائنل سیل کی اشیاء۔</li><li>اپنے اکاؤنٹ یا واٹس ایپ سے درخواست کریں — ہم کورئیر پک اپ کا انتظام کریں گے۔</li></ul>')],
    'size-guide': ['Size guide', '<p>Body measurements for our ready-to-wear. Between sizes? Size up for a relaxed fit.</p>' + sizeTable('women', 'in') + '<h2>How to measure</h2><ul><li><b>Chest:</b> around the fullest part of your bust.</li><li><b>Shirt length:</b> from the highest point of the shoulder to the hem.</li><li><b>Trouser length:</b> from waist to ankle.</li></ul>'],
    'bedsheet-size-guide': ['Bedsheet size guide', '<p>Pakistani bed sizes vary, so measure your mattress first and allow 10–12″ on each side for tucking.</p>' + sizeTable('bed', 'in') + '<p class="muted">Dimensions in cm: Single 152 × 229, Double 229 × 254, King 254 × 274, Super King 274 × 274.</p>'],
    'faq': ['Frequently asked questions', '<div class="faq">' + [['Do you offer Cash on Delivery?', 'Yes, across Pakistan. We\'ll confirm your order by WhatsApp or SMS before dispatch.'], ['How long does delivery take?', 'Faisalabad and Lahore 1–2 days, other major cities 2–4 days, rest of Pakistan 4–7 working days. We ship from our Faisalabad warehouse.'], ['Can I pay with JazzCash or Easypaisa?', 'Yes — and online payments get ' + money(S.prepaidDiscount) + ' off.'], ['Is unstitched fabric exchangeable?', 'Yes, if it hasn\'t been cut and still has its tags, within 7 days.'], ['Do you ship outside Pakistan?', 'International stores for the UAE, Saudi Arabia and the UK are coming soon. Join the waitlist from the country selector.']].map(function (q) { return '<details><summary>' + q[0] + ic('plus', 'sm') + '</summary><p>' + q[1] + '</p></details>'; }).join('') + '</div>'],
    'fabric-care': ['Fabric & care', '<h2>Lawn &amp; cambric</h2><p>Gentle wash in cold water, dry in shade, iron on reverse.</p><h2>Khaddar &amp; karandi</h2><p>Hand wash separately for the first few washes; avoid wringing.</p><h2>Velvet, silk, chiffon &amp; organza</h2><p>Dry clean only. Store folded in muslin.</p><h2>Bedding</h2><p>Machine wash at 40°C with like colours. Line dry in shade to keep colours bright.</p>'],
    'privacy': ['Privacy policy', '<p>We collect only what we need to process your orders and, with your consent, to send you offers. We never sell your data. Card payments are handled by our payment gateway — RSBRI never sees or stores your card details.</p><p class="muted">This is placeholder copy. Final policy to be reviewed against PECA 2016 and applicable data-protection law.</p>'],
    'terms': ['Terms of service', '<p>All prices are in Pakistani Rupees and include sales tax. Orders are subject to availability and confirmation.</p><p class="muted">Placeholder copy — to be finalised with legal and tax advisers (FBR requirements).</p>'],
    'gift-cards': ['Gift cards', '<p>The perfect Eid and wedding gift. Digital gift cards from Rs. 2,000 to Rs. 50,000, delivered instantly by WhatsApp or email.</p><p class="muted">Coming soon.</p>'],
    'journal': ['Journal', '<p>Styling tips, bedding care and behind-the-scenes from the RSBRI studio.</p><h2>How to choose a bridal bed set</h2><p>Start with the bed size, then pick a colour story that works with the room — royal blue and gold for tradition, ivory and gold for a softer look.</p><h2>Lawn season: 5 ways to style a 3-piece</h2><p>From office to dinner — dupatta draping, trouser cuts and accessories.</p>']
  };
  function viewPage(slug) {
    var pg = PAGES[slug]; if (!pg) return viewNotFound();
    document.title = pg[0] + ' | RSBRI Fashion';
    return crumbs([[pg[0]]]) + '<div class="wrap"><article class="page"><h1>' + pg[0] + '</h1>' + pg[1] + '</article></div>';
  }
  /* ---------------- AFFILIATE PROGRAMME (public page) ---------------- */
  function viewAffiliateProgram() {
    document.title = T('Affiliate programme', 'ایفیلیٹ پروگرام') + ' | RSBRI Fashion';
    var r = AFFSET.rate, c = AFFSET.customerPct, d = AFFSET.days;
    return crumbs([[T('Affiliate programme', 'ایفیلیٹ پروگرام')]]) + '<div class="wrap"><article class="page">' +
      '<span class="eyebrow">' + T('RSBRI Affiliate Programme', 'RSBRI ایفیلیٹ پروگرام') + '</span>' +
      '<h1>' + T('Earn with RSBRI', 'RSBRI کے ساتھ کمائیں') + '</h1>' +
      '<p>' + T('Share RSBRI with your followers and earn <b>' + r + '% commission</b> on every order you bring. Your followers get <b>' + c + '% off</b> with your personal code.',
        'RSBRI کو اپنے فالوورز کے ساتھ شیئر کریں اور آپ کے ذریعے آنے والے ہر آرڈر پر <b>' + r + '% کمیشن</b> کمائیں۔ آپ کے فالوورز کو آپ کے کوڈ سے <b>' + c + '% رعایت</b> ملے گی۔') + '</p>' +
      '<div class="aff-steps">' + [
        [T('Apply', 'درخواست دیں'), T('Fill in the form below. It takes two minutes.', 'نیچے فارم پُر کریں۔ صرف دو منٹ لگتے ہیں۔')],
        [T('Get your link & code', 'لنک اور کوڈ حاصل کریں'), T('Once approved (within 2 working days) we WhatsApp you a personal link and discount code.', 'منظوری کے بعد (2 کاروباری دن میں) ہم آپ کو واٹس ایپ پر ذاتی لنک اور کوڈ بھیجیں گے۔')],
        [T('Share', 'شیئر کریں'), T('Post on Instagram, TikTok, Facebook or WhatsApp status.', 'انسٹاگرام، ٹک ٹاک، فیس بک یا واٹس ایپ اسٹیٹس پر پوسٹ کریں۔')],
        [T('Get paid', 'ادائیگی وصول کریں'), T('Commission is confirmed when the order is delivered and paid monthly to JazzCash, Easypaisa or your bank.', 'آرڈر ڈیلیور ہونے پر کمیشن پکا ہوتا ہے اور ہر ماہ جاز کیش، ایزی پیسہ یا بینک میں ادا کیا جاتا ہے۔')]
      ].map(function (s, i) { return '<div class="aff-step"><span class="n">' + (i + 1) + '</span><div><b>' + s[0] + '</b><p>' + s[1] + '</p></div></div>'; }).join('') + '</div>' +
      '<h2>' + T('Apply now', 'ابھی درخواست دیں') + '</h2>' +
      '<form id="aff-form" class="fgrid two" novalidate>' +
        '<div class="field"><label for="af-name">' + T('Full name', 'پورا نام') + '</label><input class="input" id="af-name" autocomplete="name" required></div>' +
        '<div class="field"><label for="af-phone">' + T('WhatsApp number', 'واٹس ایپ نمبر') + '</label><div class="phone"><span>🇵🇰 +92</span><input class="input" id="af-phone" inputmode="tel" placeholder="03XX-XXXXXXX" required></div></div>' +
        '<div class="field"><label for="af-handle">' + T('Instagram / TikTok / Facebook page', 'انسٹاگرام / ٹک ٹاک / فیس بک پیج') + '</label><input class="input" id="af-handle" placeholder="@yourpage" required></div>' +
        '<div class="field"><label for="af-followers">' + T('Followers', 'فالوورز') + '</label><select class="input" id="af-followers"><option value="under-5k">Under 5,000</option><option value="5k-50k">5,000 – 50,000</option><option value="50k-plus">50,000+</option></select></div>' +
        '<div class="field"><label for="af-city">' + T('City', 'شہر') + '</label><select class="input" id="af-city">' + R.CITIES.map(function (x) { return '<option value="' + esc(x.name) + '" translate="no">' + x.name + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="af-payout">' + T('Payout method', 'ادائیگی کا طریقہ') + '</label><select class="input" id="af-payout"><option value="JazzCash">JazzCash</option><option value="Easypaisa">Easypaisa</option><option value="Bank">' + T('Bank account', 'بینک اکاؤنٹ') + '</option></select></div>' +
        '<div style="grid-column:1/-1"><button class="btn btn-primary">' + T('Send application', 'درخواست بھیجیں') + '</button></div>' +
      '</form><div id="aff-done"></div>' +
      '<h2>' + T('Programme terms', 'پروگرام کی شرائط') + '</h2><ul>' +
        '<li>' + T('Orders count for ' + d + ' days after someone clicks your link, or whenever your code is used.', 'آپ کے لنک پر کلک کے ' + d + ' دن بعد تک، یا جب بھی آپ کا کوڈ استعمال ہو، آرڈر آپ کے کھاتے میں شمار ہوں گے۔') + '</li>' +
        '<li>' + T('Commission is ' + r + '% of the order value after discounts, excluding delivery.', 'کمیشن رعایت کے بعد آرڈر کی رقم کا ' + r + '% ہے، ڈیلیوری شامل نہیں۔') + '</li>' +
        '<li>' + T('Cancelled, refused (RTO) and returned orders do not earn commission.', 'منسوخ، واپس شدہ (RTO) یا ریٹرن آرڈرز پر کمیشن نہیں ملتا۔') + '</li>' +
        '<li>' + T('Ordering through your own link is not allowed.', 'اپنے ہی لنک سے آرڈر کرنا منع ہے۔') + '</li></ul>' +
      '</article></div>';
  }
  function mountAffiliateProgram() {
    var f = $('#aff-form'); if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault();
      var name = $('#af-name').value.trim(), ph = $('#af-phone').value.trim(), handle = $('#af-handle').value.trim();
      var ok = true;
      [['af-name', !!name], ['af-phone', validPhone(ph)], ['af-handle', !!handle]].forEach(function (x) { $('#' + x[0]).classList.toggle('err', !x[1]); ok = ok && x[1]; });
      if (!ok) { toast(T('Please fill in your name, a valid WhatsApp number and your page', 'براہ کرم نام، درست واٹس ایپ نمبر اور اپنا پیج درج کریں')); return; }
      var base = (name.replace(/[^A-Za-z]/g, '').toUpperCase() || 'RSBRI').slice(0, 6), code;
      do { code = base + (10 + Math.floor(Math.random() * 90)); } while (affByCode(code));
      AFFILIATES.push({ code: code, name: name, phone: ph, handle: handle, city: $('#af-city').value, followers: $('#af-followers').value, payout: $('#af-payout').value, status: 'pending', clicks: 0, paid: 0, joined: Date.now() });
      saveAffiliates(); logActivity('Affiliate', code, 'Applied · ' + handle, 'Website');
      f.remove();
      $('#aff-done').innerHTML = '<div class="box">' + ic('check', 'sm') + ' <b>' + T('Thank you, ' + esc(name) + '!', 'شکریہ، ' + esc(name) + '!') + '</b><p style="margin:6px 0 0">' +
        T('Your application is under review. Your code will be <b>' + code + '</b>. We\'ll WhatsApp you within 2 working days.', 'آپ کی درخواست زیرِ غور ہے۔ آپ کا کوڈ <b>' + code + '</b> ہو گا۔ ہم 2 کاروباری دن میں واٹس ایپ کریں گے۔') + '</p></div>';
    };
  }

  function viewNotFound() {
    document.title = 'Page not found | RSBRI Fashion';
    return '<div class="wrap"><div class="empty" style="padding:100px 16px"><span class="eyebrow">404</span><h2 style="font-size:46px;margin-top:10px">This page has moved on</h2><p>But our new collection hasn\'t. Let\'s get you back.</p><a class="btn btn-dark" href="' + BASE + '">Go to homepage</a></div></div>';
  }
  function viewCollections() {
    document.title = 'Collections | RSBRI Fashion';
    return crumbs([['Collections']]) + '<div class="wrap"><header class="plp-head"><h1>Collections</h1><p>Seasonal edits for every chapter of the Pakistani calendar.</p></header><div class="colls" style="margin-bottom:80px">' + R.COLLECTIONS.map(function (c, i) {
      var p = R.PRODUCTS.filter(function (x) { return x.collection === c.slug; })[0];
      return '<a class="coll" href="' + BASE + 'collections/' + c.slug + '"><img src="' + R.art.product(p, 0, 3) + '" alt=""><span>' + esc(c.name) + '<small>' + esc(c.blurb) + '</small></span></a>';
    }).join('') + '</div></div>';
  }

  /* ---------------- quick view ---------------- */
  function quickView(id) {
    var p = byId(id);
    var opts = p.sizes || p.bedSizes, sel = { c: 0, s: opts && opts.length === 1 ? opts[0] : null };
    function draw() {
      $('#qv-img').src = R.art.product(p, sel.c, 0);
      $('#qv-opts').innerHTML = '<div class="opt-block"><div class="opt-head"><span>Colour: <b>' + esc(p.colors[sel.c].name) + '</b></span></div><div class="opts-row">' + p.colors.map(function (c, i) { return '<button class="sw-btn' + (i === sel.c ? ' on' : '') + '" data-qvc="' + i + '" aria-label="' + esc(c.name) + '"><i style="background:' + c.hex + '"></i></button>'; }).join('') + '</div></div>' +
        (opts ? '<div class="opt-block"><div class="opt-head"><span>' + (p.sizes ? 'Size' : 'Bed size') + ': <b>' + (sel.s || 'Select') + '</b></span></div><div class="opts-row">' + opts.map(function (s) { var out = isOut(p, sel.c, s); return '<button class="size-btn' + (sel.s === s ? ' on' : '') + (out ? ' out' : '') + '" data-qvs="' + esc(s) + '"' + (out ? ' disabled' : '') + '>' + esc(s) + '</button>'; }).join('') + '</div></div>' : '');
    }
    modal('<div class="qv"><div class="qv-img"><img id="qv-img" alt="' + esc(p.title) + '"></div><div class="qv-info"><span class="eyebrow">' + esc(catName(p.dept, p.cat)) + '</span><h3 style="margin-top:8px">' + esc(p.title) + '</h3>' + priceHTML(p) +
      '<p class="muted" style="font-size:14px">' + esc(p.desc) + '</p><div id="qv-opts"></div><span class="error" id="qv-err" hidden>Please select a size.</span>' +
      '<button class="btn btn-dark btn-block" style="margin-top:20px" id="qv-add">Add to bag</button><a class="btn btn-outline btn-block" style="margin-top:8px" href="' + productUrl(p) + '">View full details</a></div></div>', true);
    draw();
    $('#qv-opts').onclick = function (e) {
      var c = e.target.closest('[data-qvc]'), s = e.target.closest('[data-qvs]');
      if (c) sel.c = +c.dataset.qvc; if (s) sel.s = s.dataset.qvs; draw();
    };
    $('#qv-add').onclick = function () { if (opts && !sel.s) { $('#qv-err').hidden = false; return; } closeAll(); addToCart(p.id, sel.c, sel.s, 1, true); };
  }

  function countryModal() {
    modal('<h3>Choose your store</h3><p class="muted" style="margin:0">Prices, payment and delivery options follow the store you choose.</p><div class="ctry">' + R.COUNTRIES.map(function (c) {
      return '<button class="' + (c.code === 'pk' ? 'on' : '') + '" data-ctry="' + c.code + '"><span class="fl">' + c.flag + '</span><span class="nm"><b>' + c.name + '</b><small>' + c.currency + (c.live ? ' · COD, JazzCash, Easypaisa, cards' : ' · International shipping') + '</small></span><span class="pill' + (c.live ? '' : ' soon') + '">' + (c.live ? 'Live' : 'Coming soon') + '</span></button>';
    }).join('') + '</div><div id="ctry-msg"></div>');
  }

  /* ---------------- router ---------------- */
  function parseQuery() {
    var q = {}, s = location.hash.split('?')[1]; if (!s) return q;
    s.split('&').forEach(function (kv) { var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    return q;
  }
  function go(h) { if (location.hash === h) rerender(); else location.hash = h; }

  var current = null;
  function rerender() { route(true); }
  function route(keepScroll) {
    var hash = location.hash || BASE;
    var path = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
    var seg = path.split('/').filter(Boolean);
    var pre = /^(en|ur)-pk$/.exec(seg[0] || '');
    if (pre && pre[1] !== LANG) { store.set('lang', pre[1]); location.reload(); return; } // language switch rebuilds the page
    if (pre) seg.shift();
    $$('#lang-btn, #lang-btn-m').forEach(function (a) { a.href = otherLangHash(); });
    var app = $('#app'), html = '', mount = null, nav = seg[0] || '';
    L = null; clearInterval(heroTimer); clearInterval(timerInt);
    document.title = 'RSBRI Fashion — Women\'s Clothing & Bedding | Pakistan';

    var P = R.PRODUCTS;
    captureRef();
    if (!seg.length) { html = viewHome(); mount = mountHome; }
    else if (SLUG_DEPT[seg[0]]) {
      var dept = SLUG_DEPT[seg[0]], D = R.DEPARTMENTS[dept];
      if (seg[2]) {
        var p = bySlug(seg[2]);
        if (p) { html = viewProduct(p); mount = mountProduct; } else html = viewNotFound();
      } else {
        var cat = seg[1], catObj = cat && D.cats.filter(function (c) { return c.slug === cat; })[0];
        if (cat && !catObj) html = viewNotFound();
        else {
          var items = P.filter(function (x) { return x.dept === dept && (!cat || x.cat === cat); });
          var chips = [{ name: 'All', href: BASE + seg[0], on: !cat }].concat(D.cats.map(function (c) { return { name: c.name, href: BASE + seg[0] + '/' + c.slug, on: c.slug === cat }; }));
          document.title = (catObj ? catObj.name + ' — ' : '') + D.name + ' | RSBRI Fashion Pakistan';
          html = listing({ title: catObj ? catObj.name : D.name, eyebrow: catObj ? D.name : 'Department', blurb: catObj ? (catObj.note || D.blurb) : D.blurb, crumbs: catObj ? [[D.name, BASE + seg[0]], [catObj.name]] : [[D.name]], items: items, facetSet: dept, chips: chips });
          mount = mountListing;
        }
      }
    }
    else if (seg[0] === 'collections' && seg[1]) {
      var col = R.COLLECTIONS.filter(function (c) { return c.slug === seg[1]; })[0];
      if (!col) html = viewNotFound();
      else { document.title = col.name + ' | RSBRI Fashion'; html = listing({ title: col.name, eyebrow: 'Collection', blurb: col.blurb, crumbs: [['Collections', BASE + 'collections'], [col.name]], items: P.filter(function (x) { return x.collection === col.slug; }), facetSet: 'mixed', chips: R.COLLECTIONS.map(function (c) { return { name: c.name, href: BASE + 'collections/' + c.slug, on: c.slug === col.slug }; }) }); mount = mountListing; }
    }
    else if (seg[0] === 'collections') html = viewCollections();
    else if (seg[0] === 'new-in') { html = listing({ title: 'New In', eyebrow: 'Just landed', blurb: 'The latest from the RSBRI studio — updated every week.', crumbs: [['New In']], items: P.filter(function (x) { return x.badges.indexOf('new') > -1 || Date.now() - x.added < 21 * 864e5; }), facetSet: 'mixed', sort: 'newest' }); mount = mountListing; }
    else if (seg[0] === 'best-sellers') { html = listing({ title: 'Best Sellers', eyebrow: 'Most loved', blurb: 'The pieces Pakistan keeps coming back for.', crumbs: [['Best Sellers']], items: P.slice().sort(function (a, b) { return b.sold - a.sold; }).slice(0, 16), facetSet: 'mixed', sort: 'best' }); mount = mountListing; }
    else if (seg[0] === 'sale') { html = listing({ title: 'Sale', eyebrow: 'Up to ' + maxSale() + '% off', blurb: 'Limited stock at special prices. Sale items can be exchanged but not refunded.', crumbs: [['Sale']], items: P.filter(function (x) { return x.sale; }), facetSet: 'mixed', sort: 'discount' }); mount = mountListing; }
    else if (seg[0] === 'search') { var qq = parseQuery().q || ''; html = listing({ title: 'Results for “' + qq + '”', crumbs: [['Search']], items: searchProducts(qq), facetSet: 'mixed' }); mount = mountListing; }
    else if (seg[0] === 'cart') { html = viewCart(); mount = mountCart; }
    else if (seg[0] === 'checkout') { html = viewCheckout(); mount = mountCheckout; }
    else if (seg[0] === 'order' && seg[1]) html = viewOrder(seg[1]);
    else if (seg[0] === 'account') { html = viewAccount(); mount = mountAccount; }
    else if (seg[0] === 'track') { html = viewTrack(); mount = mountTrack; }
    else if (seg[0] === 'wishlist') html = viewWishlist();
    else if (seg[0] === 'affiliates') { html = viewAffiliateProgram(); mount = mountAffiliateProgram; }
    else if (seg[0] === 'admin' && R.admin) { html = R.admin.view(seg.slice(1)); mount = R.admin.mount; }
    else if (seg[0] === 'page' && seg[1]) html = viewPage(seg[1]);
    else html = viewNotFound();

    app.innerHTML = html;
    if (mount) mount();
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === nav); });
    closeAll();
    if (!keepScroll || current !== path) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
    current = path;
    observeReveal();
    syncRails();
  }

  /* ---------------- reveal & rails ---------------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function observeReveal() { $$('.reveal:not(.in)').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); }); }
  function syncRails() {
    $$('.carousel').forEach(function (c) {
      var r = $('.rail', c), prev = $('.prev', c), next = $('.next', c);
      function upd() { var x = Math.abs(r.scrollLeft); prev.disabled = x < 8; next.disabled = x + r.clientWidth >= r.scrollWidth - 8; } // abs(): RTL scrollLeft runs negative
      r.addEventListener('scroll', upd, { passive: true }); upd();
    });
  }

  /* ---------------- global events ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-open]'))) { e.preventDefault(); var id = el.dataset.open; if (id === 'country') countryModal(); else openPanel(id); return; }
    if ((el = t.closest('[data-close]'))) { closeAll(); return; }
    if (t.id === 'scrim' || t.id === 'modal') { closeAll(); return; }
    if ((el = t.closest('[data-wish]'))) {
      e.preventDefault(); var wid = el.dataset.wish, i = state.wish.indexOf(wid);
      if (i > -1) state.wish.splice(i, 1); else { state.wish.push(wid); toast('Saved to your wishlist'); }
      store.set('wish', state.wish); updateCounts();
      $$('[data-wish="' + wid + '"]').forEach(function (b) { var on = state.wish.indexOf(wid) > -1; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      if (current && /wishlist$/.test(current)) rerender();
      return;
    }
    if ((el = t.closest('[data-qv]'))) { quickView(el.dataset.qv); return; }
    if ((el = t.closest('[data-qa]'))) { var qp = byId(el.dataset.qa); if (qp.sizes || (qp.bedSizes && qp.bedSizes.length > 1)) quickView(qp.id); else addToCart(qp.id, 0, qp.bedSizes ? qp.bedSizes[0] : null, 1, true); return; }
    if ((el = t.closest('[data-rail]'))) { var rr = $('.rail', el.parentNode); rr.scrollBy({ left: rr.clientWidth * +el.dataset.rail * (LANG === 'ur' ? -1 : 1), behavior: 'smooth' }); return; }
    if ((el = t.closest('[data-acc]'))) { var li = el.parentNode; li.classList.toggle('open'); el.setAttribute('aria-expanded', li.classList.contains('open')); return; }
    if ((el = t.closest('[data-lq]'))) {
      var ln = state.cart.filter(function (x) { return x.k === el.dataset.k; })[0];
      if (ln) { ln.qty = Math.max(1, Math.min(10, ln.qty + +el.dataset.lq)); saveCart(); refreshCartViews(); }
      return;
    }
    if ((el = t.closest('[data-rm]'))) { state.cart = state.cart.filter(function (x) { return x.k !== el.dataset.rm; }); saveCart(); refreshCartViews(); return; }
    if ((el = t.closest('[data-code-rm]'))) { state.code = null; store.set('code', null); rerender(); return; }
    if ((el = t.closest('[data-sq]'))) { $('#search-input').value = el.dataset.sq; renderSearch(el.dataset.sq); return; }
    if ((el = t.closest('[data-guide]'))) { guideModal(el.dataset.guide); return; }
    if ((el = t.closest('[data-ctry]'))) {
      var cc = R.COUNTRIES.filter(function (c) { return c.code === el.dataset.ctry; })[0];
      if (cc.live) { closeAll(); toast('You\'re shopping the Pakistan store'); }
      else $('#ctry-msg').innerHTML = '<div class="notify" style="margin-top:16px"><p><b>' + cc.name + ' store is coming soon.</b> Leave your WhatsApp or email and we\'ll tell you the day it opens.</p><form class="inline-field" onsubmit="event.preventDefault();this.innerHTML=\'<b>Thank you — you\\\'re on the list.</b>\'"><input class="input" required placeholder="WhatsApp or email" aria-label="WhatsApp or email"><button class="btn btn-dark">Notify me</button></form></div>';
      return;
    }
    if ((el = t.closest('[data-reorder]'))) {
      var o = state.orders.filter(function (x) { return x.id === el.dataset.reorder; })[0];
      o.lines.forEach(function (l) { addToCart(l.id, l.color, l.size, l.qty, false); }); openPanel('cart'); return;
    }
    if ((el = t.closest('[data-alt-login]'))) { toast('Google & email sign-in will be connected at build time'); return; }
    if (t.closest('#cookie [data-cookie]')) { store.set('cookie', t.closest('[data-cookie]').dataset.cookie); $('#cookie').classList.remove('on'); return; }
    if (t.id === 'clear-filters' && L) { L.filters = {}; renderFacets(); renderListing(); return; }

    // PDP interactions
    if (PDP && $('#pdp-info')) {
      if ((el = t.closest('[data-view]'))) { PDP.view = +el.dataset.view; renderGallery(); return; }
      if ((el = t.closest('[data-color]'))) { PDP.color = +el.dataset.color; renderGallery(); renderPdpInfo(); return; }
      if ((el = t.closest('[data-size]'))) {
        var sz = el.dataset.size;
        if (isOut(PDP.p, PDP.color, sz)) {
          $('#notify-wrap').innerHTML = '<div class="notify"><p><b>' + esc(sz) + ' is sold out.</b> Get a WhatsApp or email alert when it\'s back in stock.</p><form class="inline-field" id="notify-form"><input class="input" placeholder="03XX-XXXXXXX or email" aria-label="WhatsApp number or email" required><button class="btn btn-dark">Notify me</button></form></div>';
          $('#notify-form').onsubmit = function (ev) { ev.preventDefault(); $('#notify-wrap').innerHTML = '<div class="notify"><p style="margin:0">' + ic('check', 'sm') + ' We\'ll message you when ' + esc(sz) + ' is back.</p></div>'; };
          return;
        }
        PDP.size = sz; $('#notify-wrap').innerHTML = ''; renderPdpInfo(); return;
      }
      if ((el = t.closest('[data-qty]'))) { PDP.qty = Math.max(1, Math.min(10, PDP.qty + +el.dataset.qty)); $('#qty').value = PDP.qty; updateWaOrder(); return; }
      if (t.closest('#add-cart')) { pdpAdd(false); return; }
      if (t.closest('#buy-now')) { pdpAdd(true); return; }
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-facet]') && L) onFacetChange(t);
    if (t.id === 'city-sel') { state.city = t.value; store.set('city', t.value); renderPdpInfo(); }
    if (t.id === 'qty' && PDP) { PDP.qty = Math.max(1, Math.min(10, +t.value || 1)); t.value = PDP.qty; updateWaOrder(); }
  });
  function refreshCartViews() {
    if (openId === 'cart') renderCartDrawer();
    if (current && /\/cart$/.test(current)) rerender();
    if (current && /\/checkout$/.test(current)) rerender();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openId) closeAll(); });
  var sTimer;
  $('#search-input').addEventListener('input', function () { var v = this.value; clearTimeout(sTimer); sTimer = setTimeout(function () { renderSearch(v); }, 120); });
  $('#search-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && this.value.trim()) go(BASE + 'search?q=' + encodeURIComponent(this.value.trim())); });
  window.addEventListener('scroll', function () { $('#header').classList.toggle('scrolled', window.scrollY > 10); }, { passive: true });
  window.addEventListener('hashchange', function () { route(false); });

  /* ---------------- shared with admin.js ---------------- */
  R.app = {
    state: state, store: store, S: S, BASE: function () { return BASE; }, $: $, $$: $$, esc: esc, money: money, ic: ic, toast: toast, rerender: rerender, go: go,
    byId: byId, productUrl: productUrl, catName: catName, now: now, validPhone: validPhone,
    STOCK: STOCK, SETTINGS: SETTINGS, variantsOf: variantsOf, stockOf: stockOf, totalStock: totalStock, setStock: setStock, saveSettings: function () { store.set('settings', SETTINGS); },
    PERMS: PERMS, ROLES: ROLES, STAFF: STAFF, saveStaff: saveStaff, adminUser: adminUser, can: can,
    ACTIVITY: ACTIVITY, logActivity: logActivity,
    AFFSET: AFFSET, AFFILIATES: AFFILIATES, saveAffiliates: saveAffiliates, affStats: affStats, affByCode: affByCode,
    STATUSES: STATUSES, statusName: statusName, PAY_LABEL: PAY_LABEL,
    saveOrders: function () { store.set('orders', state.orders); }
  };

  /* ---------------- boot ---------------- */
  store.set('lang', LANG);
  $$('a[href^="#/en-pk/"]').forEach(function (a) { a.setAttribute('href', a.getAttribute('href').replace('#/en-pk/', BASE)); });
  $('#lang-btn').textContent = LANG === 'ur' ? 'English' : 'اردو';
  $('#lang-btn').setAttribute('lang', LANG === 'ur' ? 'en' : 'ur');
  $('#lang-btn').setAttribute('aria-label', LANG === 'ur' ? 'View in English' : 'اردو میں دیکھیں');
  if (R.i18n) R.i18n.init(LANG);
  $('#year').textContent = new Date().getFullYear();
  $('#wa-float').href = waLink('Assalam o Alaikum RSBRI! I have a question.');
  if (!store.get('cookie', null)) setTimeout(function () { $('#cookie').classList.add('on'); }, 1200);
  initAnnounce(); initNav(); updateCounts(); route(false);
})();
