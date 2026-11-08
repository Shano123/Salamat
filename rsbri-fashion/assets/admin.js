/* RSBRI Fashion — back office (demo)
   Staff sign-in with roles, dashboard, orders, stock, affiliates, staff access and activity log.
   Data is shared with the storefront through RSBRI.app (see app.js) and saved in this browser.
   On the live store these screens map to Shopify admin + an affiliate app (see README). */
(function () {
  'use strict';
  var R = window.RSBRI;
  function A() { return R.app; }

  var TABS = [
    ['overview', 'Overview', 'overview'],
    ['orders', 'Orders', 'orders.view'],
    ['stock', 'Stock', 'stock.view'],
    ['affiliates', 'Affiliates', 'affiliates.manage'],
    ['staff', 'Staff & access', 'staff.manage'],
    ['activity', 'Activity', 'activity.view']
  ];
  var ui = { stockFilter: 'all', stockQ: '', stockDept: 'all', orderFilter: 'all', actType: 'all', open: {} };
  var SITE = 'https://rsbrifashion.com';

  function href(t) { return A().BASE() + 'admin' + (t ? '/' + t : ''); }
  function when(t) { return new Date(t).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function st(text, kind) { return '<span class="st ' + (kind || '') + '">' + text + '</span>'; }
  function wrap(h) { return '<div class="wrap adm" translate="no">' + h + '</div>'; }
  function e(s) { return A().esc(s); }
  function statusKind(s) { return s < 0 ? 'bad' : s === 0 ? 'warn' : s === 4 ? 'ok' : 'info'; }
  function stockKind(q) { var th = A().SETTINGS.lowStockAt; return q <= 0 ? 'bad' : q <= th ? 'warn' : 'ok'; }
  function stockText(q) { var th = A().SETTINGS.lowStockAt; return q <= 0 ? 'Sold out' : q <= th ? 'Low' : 'In stock'; }
  function affLink(code) { return SITE + '/en-pk/?ref=' + code; }

  /* ---------------- shell ---------------- */
  function view(seg) {
    var a = A(), u = a.adminUser();
    document.title = 'Admin | RSBRI Fashion';
    if (!u) return wrap(loginHTML());
    var allowed = TABS.filter(function (t) { return a.can(t[2], u); });
    var tab = allowed.filter(function (t) { return t[0] === (seg[0] || 'overview'); })[0] || allowed[0];
    var denied = seg[0] && tab[0] !== seg[0];
    return wrap(
      '<div class="adm-head"><div><span class="eyebrow">Back office</span><h1>RSBRI Admin</h1></div>' +
      '<div class="adm-user"><div><b>' + e(u.name) + '</b><small>' + a.ROLES[u.role].name + '</small></div><button class="btn btn-outline adm-sm" id="adm-out">Sign out</button></div></div>' +
      '<p class="adm-note">Demo back office: changes are saved in this browser only, so you can try every step. On the live store the same work happens in Shopify admin.</p>' +
      '<nav class="adm-tabs" aria-label="Admin sections">' + TABS.map(function (t) {
        if (allowed.indexOf(t) > -1) return '<a href="' + href(t[0]) + '" class="' + (t === tab ? 'on' : '') + '">' + t[1] + '</a>';
        var who = Object.keys(a.ROLES).filter(function (r) { return a.ROLES[r].perms.indexOf(t[2]) > -1; }).map(function (r) { return a.ROLES[r].name; }).join(' / ');
        return '<span class="locked" title="Only ' + who + ' can open this">🔒 ' + t[1] + '<small>' + who + ' only</small></span>';
      }).join('') + '</nav>' +
      (denied ? '<p class="adm-deny">Your role (' + a.ROLES[u.role].name + ') can’t open that section. Ask the owner to change your access.</p>' : '') +
      '<div class="adm-body" id="adm-body">' + RENDER[tab[0]](u) + '</div>');
  }

  function loginHTML() {
    var a = A(), staff = a.STAFF.filter(function (s) { return s.active; });
    return '<div class="adm-login"><span class="eyebrow">Back office</span><h1>Staff sign-in</h1><p class="muted">Each team member signs in with their own account. What they can see depends on their role.</p>' +
      '<form id="adm-login" class="fgrid" novalidate>' +
      '<div class="field"><label for="adm-who">Staff member</label><select class="input" id="adm-who">' + staff.map(function (s) { return '<option value="' + s.id + '">' + e(s.name) + ' — ' + a.ROLES[s.role].name + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="adm-pin">PIN</label><input class="input" id="adm-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></div>' +
      '<button class="btn btn-dark btn-block">Sign in</button><span class="error" id="adm-err"></span></form>' +
      '<div class="adm-demo"><b>Demo accounts</b><table class="atbl"><thead><tr><th>Name</th><th>Role</th><th>PIN</th></tr></thead><tbody>' +
      a.STAFF.filter(function (s) { return /^u[123]$/.test(s.id); }).map(function (s) { return '<tr><td>' + e(s.name) + '</td><td>' + a.ROLES[s.role].name + '</td><td class="num">' + e(s.pin) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="muted">Sign in as each one to see how access changes. The live store uses Shopify staff accounts with passwords and two-step verification.</p></div></div>';
  }

  /* ---------------- overview ---------------- */
  function variantRows() {
    var a = A(), out = [];
    R.PRODUCTS.forEach(function (p) { a.variantsOf(p).forEach(function (v) { out.push({ p: p, v: v, q: a.STOCK[v.k] || 0 }); }); });
    return out;
  }
  function overview(u) {
    var a = A(), os = a.state.orders, live = os.filter(function (o) { return o.status >= 0; });
    var day = new Date(); day.setHours(0, 0, 0, 0);
    var today = live.filter(function (o) { return o.at >= day.getTime(); });
    var pending = os.filter(function (o) { return o.status === 0; });
    var prepaid = live.filter(function (o) { return o.pay !== 'cod'; }).length;
    var rows = variantRows(), th = a.SETTINGS.lowStockAt;
    var low = rows.filter(function (r) { return r.q > 0 && r.q <= th; }), out = rows.filter(function (r) { return r.q <= 0; });
    var affSales = live.filter(function (o) { return o.aff; }).reduce(function (s, o) { return s + o.totals.total; }, 0);
    var tiles = [
      ['Sales today', a.money(today.reduce(function (s, o) { return s + o.totals.total; }, 0)), today.length + ' order' + (today.length === 1 ? '' : 's')],
      ['Waiting for confirmation', pending.length, 'COD orders to confirm on WhatsApp', pending.length ? 'warn' : ''],
      ['Paid online', live.length ? Math.round(prepaid / live.length * 100) + '%' : '—', 'of orders (target 30%)'],
      ['Low stock', low.length, 'sizes/colours at ' + th + ' or fewer', low.length ? 'warn' : ''],
      ['Sold out', out.length, 'sizes/colours at 0', out.length ? 'bad' : ''],
      ['Affiliate sales', a.money(affSales), a.AFFILIATES.filter(function (x) { return x.status === 'active'; }).length + ' active affiliates']
    ];
    var h = '<div class="kpis">' + tiles.map(function (t) { return '<div class="kpi ' + (t[3] || '') + '"><span>' + t[0] + '</span><b class="num">' + t[1] + '</b><small>' + t[2] + '</small></div>'; }).join('') + '</div><div class="adm-cols">';
    if (a.can('orders.view', u)) {
      h += '<section class="adm-card"><h3>Confirm these COD orders</h3>' + (pending.length ? '<ul class="adm-list">' + pending.slice(0, 6).map(function (o) {
        return '<li><div><b>' + o.id + '</b> · ' + e(o.addr.fname + ' ' + o.addr.lname) + ', ' + e(o.addr.city) + '<small>' + when(o.at) + ' · ' + a.money(o.totals.total) + '</small></div><a class="link" href="' + href('orders') + '">Open</a></li>';
      }).join('') + '</ul>' : '<p class="muted">Nothing waiting. Well done.</p>') + '</section>';
    }
    if (a.can('stock.view', u)) {
      var attn = out.concat(low).slice(0, 8);
      h += '<section class="adm-card"><h3>Restock soon</h3>' + (attn.length ? '<ul class="adm-list">' + attn.map(function (r) {
        return '<li><div><b>' + e(r.p.title) + '</b><small>' + e(r.p.colors[r.v.c].name) + (r.v.s ? ' · ' + e(r.v.s) : '') + ' · ' + r.p.sku + '</small></div>' + st(r.q + ' left', stockKind(r.q)) + '</li>';
      }).join('') + '</ul><a class="link" href="' + href('stock') + '">See all stock</a>' : '<p class="muted">All sizes are well stocked.</p>') + '</section>';
    }
    return h + '</div>';
  }

  /* ---------------- orders ---------------- */
  function orders(u) {
    var a = A(), os = a.state.orders, edit = a.can('orders.edit', u);
    var filters = [['all', 'All']].concat(a.STATUSES.map(function (s, i) { return [String(i), s]; })).concat([['-1', 'Cancelled']]);
    var list = os.filter(function (o) { return ui.orderFilter === 'all' || String(o.status) === ui.orderFilter; });
    return '<div class="chips adm-chips">' + filters.map(function (f) {
      var n = f[0] === 'all' ? os.length : os.filter(function (o) { return String(o.status) === f[0]; }).length;
      return '<button class="chip' + (ui.orderFilter === f[0] ? ' on' : '') + '" data-ofilter="' + f[0] + '">' + f[1] + ' <span class="num">' + n + '</span></button>';
    }).join('') + '</div>' +
      (list.length ? '<div class="tbl-scroll"><table class="atbl"><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th class="r">Total</th><th>Affiliate</th><th>Status</th></tr></thead><tbody>' + list.map(function (o) {
        var items = o.lines.reduce(function (s, l) { return s + l.qty; }, 0);
        return '<tr><td><a class="link" href="' + A().BASE() + 'order/' + o.id + '">' + o.id + '</a>' + (o.demo ? ' <span class="tag">demo</span>' : '') + '<small>' + when(o.at) + ' · ' + items + ' item' + (items > 1 ? 's' : '') + '</small></td>' +
          '<td>' + e(o.addr.fname + ' ' + o.addr.lname) + '<small>' + e(o.phone) + ' · ' + e(o.addr.city) + '</small></td>' +
          '<td>' + a.PAY_LABEL[o.pay] + '</td><td class="r num">' + a.money(o.totals.total) + '</td>' +
          '<td>' + (o.aff ? e(o.aff) + '<small>' + a.money(o.commission || 0) + ' commission</small>' : '<span class="muted">—</span>') + '</td>' +
          '<td>' + (edit ? '<label class="sr-only" for="os-' + o.id + '">Status of ' + o.id + '</label><select class="adm-select ' + statusKind(o.status) + '" id="os-' + o.id + '" data-ostatus="' + o.id + '">' +
            a.STATUSES.map(function (s, i) { return '<option value="' + i + '"' + (o.status === i ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
            '<option value="-1"' + (o.status < 0 ? ' selected' : '') + '>Cancelled</option></select>' : st(a.statusName(o.status), statusKind(o.status))) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">No orders with this status.</p>') +
      (edit ? '<p class="adm-hint">Cancelling an order puts its items back into stock. Confirm COD orders by WhatsApp before marking them Confirmed.</p>' : '');
  }
  function setOrderStatus(id, ns) {
    var a = A(), o = a.state.orders.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var old = o.status; ns = +ns; if (old === ns) return;
    if (ns < 0 && old >= 0) o.lines.forEach(function (l) { a.setStock(l.k, a.stockOf(a.byId(l.id), l.color, l.size) + l.qty, 'Cancelled ' + id); });
    if (old < 0 && ns >= 0) o.lines.forEach(function (l) { a.setStock(l.k, a.stockOf(a.byId(l.id), l.color, l.size) - l.qty, 'Re-opened ' + id); });
    o.status = ns; a.saveOrders();
    a.logActivity('Order', id, a.statusName(old) + ' → ' + a.statusName(ns));
    a.toast(id + ': ' + a.statusName(ns));
  }

  /* ---------------- stock ---------------- */
  function stock(u) {
    var a = A(), edit = a.can('stock.edit', u), th = a.SETTINGS.lowStockAt, q = ui.stockQ.toLowerCase();
    var rows = variantRows(), units = rows.reduce(function (s, r) { return s + r.q; }, 0);
    var prods = R.PRODUCTS.filter(function (p) {
      if (ui.stockDept !== 'all' && p.dept !== ui.stockDept) return false;
      if (q && (p.title + ' ' + p.sku).toLowerCase().indexOf(q) < 0) return false;
      if (ui.stockFilter === 'all') return true;
      return a.variantsOf(p).some(function (v) { var n = a.STOCK[v.k] || 0; return ui.stockFilter === 'out' ? n <= 0 : n > 0 && n <= th; });
    });
    var h = '<div class="adm-tools">' +
      '<div class="field"><label for="st-q">Search</label><input class="input" id="st-q" placeholder="Name or SKU" value="' + e(ui.stockQ) + '"></div>' +
      '<div class="field"><label for="st-dept">Department</label><select class="input" id="st-dept"><option value="all">All</option><option value="women"' + (ui.stockDept === 'women' ? ' selected' : '') + '>Women</option><option value="home"' + (ui.stockDept === 'home' ? ' selected' : '') + '>Bedding & Home</option></select></div>' +
      '<div class="field"><label for="st-filter">Show</label><select class="input" id="st-filter"><option value="all">All products</option><option value="low"' + (ui.stockFilter === 'low' ? ' selected' : '') + '>Low stock</option><option value="out"' + (ui.stockFilter === 'out' ? ' selected' : '') + '>Sold out</option></select></div>' +
      (edit ? '<div class="field"><label for="st-th">Low-stock alert at</label><input class="input num" id="st-th" type="number" min="1" max="50" value="' + th + '"></div>' : '') +
      '</div><p class="adm-sum" id="st-sum">' + R.PRODUCTS.length + ' products · ' + rows.length + ' sizes/colours · <b class="num">' + units.toLocaleString('en-PK') + '</b> units · ' +
      st(rows.filter(function (r) { return r.q > 0 && r.q <= th; }).length + ' low', 'warn') + ' ' + st(rows.filter(function (r) { return r.q <= 0; }).length + ' sold out', 'bad') + '</p>';
    if (!prods.length) return h + '<p class="muted">No products match.</p>';
    var autoOpen = ui.stockFilter !== 'all' || !!q;
    h += prods.map(function (p) {
      var vs = a.variantsOf(p), tot = a.totalStock(p);
      var nLow = vs.filter(function (v) { var n = a.STOCK[v.k] || 0; return n > 0 && n <= th; }).length, nOut = vs.filter(function (v) { return (a.STOCK[v.k] || 0) <= 0; }).length;
      return '<details class="st-prod" data-pid="' + p.id + '"' + (autoOpen || ui.open[p.id] ? ' open' : '') + '><summary>' +
        '<img src="' + R.art.product(p, 0, 0) + '" alt="" loading="lazy"><div class="t"><b>' + e(p.title) + '</b><small>' + p.sku + ' · ' + e(a.catName(p.dept, p.cat)) + '</small></div>' +
        '<div class="pills">' + (nOut ? st(nOut + ' sold out', 'bad') : '') + (nLow ? st(nLow + ' low', 'warn') : '') + '</div>' +
        '<b class="num tot" id="tot-' + p.id + '">' + tot + '</b></summary>' +
        '<div class="tbl-scroll"><table class="atbl"><thead><tr><th>Colour</th><th>Size</th><th>Status</th><th class="r">In stock</th></tr></thead><tbody>' + vs.map(function (v) {
          var n = a.STOCK[v.k] || 0, id = 'q-' + v.k.replace(/[^A-Za-z0-9]/g, '_');
          return '<tr><td><i class="sw-dot" style="background:' + p.colors[v.c].hex + '"></i>' + e(p.colors[v.c].name) + '</td><td>' + (v.s ? e(v.s) : '—') + '</td>' +
            '<td id="s-' + id + '">' + st(stockText(n), stockKind(n)) + '</td><td class="r">' +
            (edit ? '<div class="qty sm adm-qty"><button data-sd="-1" data-k="' + v.k + '" aria-label="Remove one">−</button><input id="' + id + '" class="num" type="number" min="0" value="' + n + '" data-sk="' + v.k + '" aria-label="Stock for ' + e(p.colors[v.c].name) + (v.s ? ' ' + e(v.s) : '') + '"><button data-sd="1" data-k="' + v.k + '" aria-label="Add one">+</button></div><button class="link adm-plus10" data-sd="10" data-k="' + v.k + '">+10</button>'
              : '<b class="num">' + n + '</b>') + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }).join('');
    return h + (edit ? '<p class="adm-hint">Stock goes down automatically when a customer orders and back up when an order is cancelled. Every change is recorded in Activity.</p>' : '<p class="adm-hint">Your role can see stock but not change it.</p>');
  }
  function refreshStockRow(k) {
    var a = A(), id = 'q-' + k.replace(/[^A-Za-z0-9]/g, '_'), n = a.STOCK[k] || 0, p = a.byId(k.split('|')[0]);
    var inp = document.getElementById(id); if (inp) inp.value = n;
    var s = document.getElementById('s-' + id); if (s) s.innerHTML = st(stockText(n), stockKind(n));
    var t = document.getElementById('tot-' + p.id); if (t) t.textContent = a.totalStock(p);
  }

  /* ---------------- affiliates ---------------- */
  function affiliates() {
    var a = A(), S = a.AFFSET;
    var list = a.AFFILIATES.slice().sort(function (x, y) { return (x.status === 'pending' ? -1 : 0) - (y.status === 'pending' ? -1 : 0); });
    var tot = list.map(a.affStats).reduce(function (s, x) { return { sales: s.sales + x.sales, earned: s.earned + x.earned, pending: s.pending + x.pending, balance: s.balance + x.balance }; }, { sales: 0, earned: 0, pending: 0, balance: 0 });
    return '<div class="kpis k4">' +
      '<div class="kpi"><span>Affiliate sales</span><b class="num">' + a.money(tot.sales) + '</b><small>all time</small></div>' +
      '<div class="kpi"><span>Commission earned</span><b class="num">' + a.money(tot.earned) + '</b><small>on delivered orders</small></div>' +
      '<div class="kpi"><span>Commission pending</span><b class="num">' + a.money(tot.pending) + '</b><small>orders not yet delivered</small></div>' +
      '<div class="kpi ' + (tot.balance ? 'warn' : '') + '"><span>To pay out</span><b class="num">' + a.money(tot.balance) + '</b><small>earned minus paid</small></div></div>' +
      '<section class="adm-card"><h3>Programme settings</h3><form id="aff-set" class="adm-tools" novalidate>' +
        '<div class="field"><label for="as-rate">Commission for affiliate (%)</label><input class="input num" id="as-rate" type="number" min="1" max="50" value="' + S.rate + '"></div>' +
        '<div class="field"><label for="as-cust">Discount for customer (%)</label><input class="input num" id="as-cust" type="number" min="0" max="50" value="' + S.customerPct + '"></div>' +
        '<div class="field"><label for="as-days">Link counts for (days)</label><input class="input num" id="as-days" type="number" min="1" max="90" value="' + S.days + '"></div>' +
        '<div class="field"><span class="label">&nbsp;</span><button class="btn btn-dark adm-sm">Save settings</button></div></form>' +
        '<p class="adm-hint">Public sign-up page: <a class="link" href="' + a.BASE() + 'affiliates">' + SITE + '/en-pk/affiliates</a></p></section>' +
      '<div class="tbl-scroll"><table class="atbl"><thead><tr><th>Affiliate</th><th>Code & link</th><th>Status</th><th class="r">Clicks</th><th class="r">Orders</th><th class="r">Sales</th><th class="r">Earned</th><th class="r">Paid</th><th class="r">Balance</th><th>Actions</th></tr></thead><tbody>' +
      list.map(function (x) {
        var s = a.affStats(x), kind = x.status === 'active' ? 'ok' : x.status === 'pending' ? 'warn' : 'bad';
        return '<tr><td><b>' + e(x.name) + '</b><small>' + e(x.handle || '') + ' · ' + e(x.phone || '') + (x.city ? ' · ' + e(x.city) : '') + '</small></td>' +
          '<td><b class="num">' + e(x.code) + '</b><small class="adm-link">' + affLink(e(x.code)) + '</small></td>' +
          '<td>' + st(x.status === 'active' ? 'Active' : x.status === 'pending' ? 'Waiting approval' : 'Paused', kind) + '</td>' +
          '<td class="r num">' + (x.clicks || 0) + '</td><td class="r num">' + s.orders + '</td><td class="r num">' + a.money(s.sales) + '</td>' +
          '<td class="r num">' + a.money(s.earned) + (s.pending ? '<small>+' + a.money(s.pending) + ' pending</small>' : '') + '</td><td class="r num">' + a.money(x.paid || 0) + '</td><td class="r num">' + a.money(s.balance) + '</td>' +
          '<td class="acts">' +
            (x.status === 'pending' ? '<button class="btn btn-dark adm-xs" data-aff="approve" data-code="' + e(x.code) + '">Approve</button>' : '') +
            (x.status === 'active' ? '<button class="btn btn-outline adm-xs" data-aff="pause" data-code="' + e(x.code) + '">Pause</button>' : '') +
            (x.status === 'paused' ? '<button class="btn btn-outline adm-xs" data-aff="approve" data-code="' + e(x.code) + '">Activate</button>' : '') +
            (s.balance ? '<button class="btn btn-outline adm-xs" data-aff="paid" data-code="' + e(x.code) + '">Mark ' + a.money(s.balance) + ' paid</button>' : '') +
            (x.status === 'active' ? '<button class="link adm-xs" data-aff="copy" data-code="' + e(x.code) + '">Copy link</button><button class="link adm-xs" data-aff="try" data-code="' + e(x.code) + '">Try link</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<section class="adm-card"><h3>Add an affiliate</h3><form id="aff-add" class="adm-tools" novalidate>' +
        '<div class="field"><label for="aa-name">Name</label><input class="input" id="aa-name"></div>' +
        '<div class="field"><label for="aa-phone">WhatsApp</label><input class="input" id="aa-phone" inputmode="tel" placeholder="03XX-XXXXXXX"></div>' +
        '<div class="field"><label for="aa-handle">Page</label><input class="input" id="aa-handle" placeholder="@page"></div>' +
        '<div class="field"><label for="aa-code">Code (optional)</label><input class="input" id="aa-code" placeholder="e.g. AYESHA10" style="text-transform:uppercase"></div>' +
        '<div class="field"><span class="label">&nbsp;</span><button class="btn btn-dark adm-sm">Add affiliate</button></div></form><span class="error" id="aa-err"></span>' +
        '<p class="adm-hint">An affiliate’s code works two ways: as a discount code at checkout, and in their link (?ref=CODE). Either one credits their commission.</p></section>';
  }
  function affAction(act, code) {
    var a = A(), x = a.affByCode(code); if (!x) return;
    if (act === 'approve') { x.status = 'active'; a.logActivity('Affiliate', code, 'Activated'); a.toast(code + ' is active'); }
    if (act === 'pause') { x.status = 'paused'; a.logActivity('Affiliate', code, 'Paused'); a.toast(code + ' paused'); }
    if (act === 'paid') { var s = a.affStats(x); x.paid = (x.paid || 0) + s.balance; a.logActivity('Affiliate', code, 'Payout ' + a.money(s.balance) + ' marked paid'); a.toast('Payout recorded'); }
    if (act === 'copy') {
      var link = affLink(code);
      try { navigator.clipboard.writeText(link).then(function () { a.toast('Link copied'); }, function () { a.toast('Copy didn’t work — select the link text instead'); }); }
      catch (err) { a.toast('Copy didn’t work — select the link text instead'); }
      return;
    }
    if (act === 'try') { a.go(a.BASE() + '?ref=' + code); return; }
    a.saveAffiliates(); a.rerender();
  }

  /* ---------------- staff ---------------- */
  function staff(u) {
    var a = A();
    return '<div class="tbl-scroll"><table class="atbl"><thead><tr><th>Name</th><th>Sign-in</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + a.STAFF.map(function (s) {
      var self = s.id === u.id;
      return '<tr><td><b>' + e(s.name) + '</b>' + (self ? ' <span class="tag">you</span>' : '') + '</td><td>' + e(s.login) + '</td>' +
        '<td>' + (self ? a.ROLES[s.role].name : '<label class="sr-only" for="role-' + s.id + '">Role for ' + e(s.name) + '</label><select class="adm-select" id="role-' + s.id + '" data-role="' + s.id + '">' + Object.keys(a.ROLES).map(function (r) { return '<option value="' + r + '"' + (s.role === r ? ' selected' : '') + '>' + a.ROLES[r].name + '</option>'; }).join('') + '</select>') + '</td>' +
        '<td>' + st(s.active ? 'Active' : 'Disabled', s.active ? 'ok' : 'bad') + '</td>' +
        '<td class="acts">' + (self ? '<span class="muted">—</span>' : '<button class="btn btn-outline adm-xs" data-staff="toggle" data-id="' + s.id + '">' + (s.active ? 'Disable' : 'Enable') + '</button><button class="link adm-xs" data-staff="pin" data-id="' + s.id + '">Reset PIN</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
      '<section class="adm-card"><h3>Add a staff member</h3><form id="staff-add" class="adm-tools" novalidate>' +
        '<div class="field"><label for="sa-name">Name</label><input class="input" id="sa-name"></div>' +
        '<div class="field"><label for="sa-login">Mobile or email</label><input class="input" id="sa-login" placeholder="03XX-XXXXXXX"></div>' +
        '<div class="field"><label for="sa-role">Role</label><select class="input" id="sa-role">' + Object.keys(a.ROLES).filter(function (r) { return r !== 'owner'; }).map(function (r) { return '<option value="' + r + '">' + a.ROLES[r].name + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="sa-pin">4-digit PIN</label><input class="input num" id="sa-pin" inputmode="numeric" maxlength="4"></div>' +
        '<div class="field"><span class="label">&nbsp;</span><button class="btn btn-dark adm-sm">Add staff</button></div></form><span class="error" id="sa-err"></span></section>' +
      '<section class="adm-card"><h3>What each role can do</h3><div class="tbl-scroll"><table class="atbl matrix"><thead><tr><th>Access</th>' + Object.keys(a.ROLES).map(function (r) { return '<th>' + a.ROLES[r].name + '</th>'; }).join('') + '</tr></thead><tbody>' +
        a.PERMS.map(function (p) { return '<tr><td>' + p[1] + '</td>' + Object.keys(a.ROLES).map(function (r) { var y = a.ROLES[r].perms.indexOf(p[0]) > -1; return '<td class="c">' + (y ? '<span class="yes" aria-label="Yes">✓</span>' : '<span class="no" aria-label="No">—</span>') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></section>';
  }
  function activeOwners(except) { return A().STAFF.filter(function (s) { return s.active && s.role === 'owner' && s.id !== except; }).length; }

  /* ---------------- activity ---------------- */
  function activity() {
    var a = A(), types = ['all'].concat(a.ACTIVITY.map(function (x) { return x.type; }).filter(function (t, i, arr) { return arr.indexOf(t) === i; }));
    var list = a.ACTIVITY.filter(function (x) { return ui.actType === 'all' || x.type === ui.actType; }).slice(0, 200);
    return '<div class="adm-tools"><div class="field"><label for="act-type">Show</label><select class="input" id="act-type">' + types.map(function (t) { return '<option value="' + e(t) + '"' + (ui.actType === t ? ' selected' : '') + '>' + (t === 'all' ? 'Everything' : e(t)) + '</option>'; }).join('') + '</select></div></div>' +
      (list.length ? '<div class="tbl-scroll"><table class="atbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th><th>Change</th></tr></thead><tbody>' + list.map(function (x) {
        return '<tr><td class="nowrap">' + when(x.at) + '</td><td>' + e(x.who) + '</td><td>' + st(e(x.type), 'info') + '</td><td>' + e(x.target) + '</td><td>' + e(x.detail) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">Nothing recorded yet. Stock changes, orders, sign-ins and access changes appear here.</p>');
  }

  var RENDER = { overview: overview, orders: orders, stock: stock, affiliates: affiliates, staff: staff, activity: activity };

  /* ---------------- events ---------------- */
  function mount() {
    var a = A(), root = a.$('.adm'); if (!root) return;
    var login = a.$('#adm-login');
    if (login) {
      login.onsubmit = function (ev) {
        ev.preventDefault();
        var u = a.STAFF.filter(function (s) { return s.id === a.$('#adm-who').value; })[0];
        if (!u || a.$('#adm-pin').value !== u.pin) { a.$('#adm-err').textContent = 'That PIN doesn’t match. Check the PIN and try again.'; return; }
        a.store.set('adminUser', u.id); a.logActivity('Sign in', u.name, a.ROLES[u.role].name, u.name); a.rerender();
      };
      return;
    }
    root.addEventListener('click', function (ev) {
      var t = ev.target, el;
      if (t.id === 'adm-out') { var u = a.adminUser(); a.logActivity('Sign out', u ? u.name : '', ''); a.store.set('adminUser', null); a.go(href()); return; }
      if ((el = t.closest('[data-ofilter]'))) { ui.orderFilter = el.dataset.ofilter; a.rerender(); return; }
      if ((el = t.closest('[data-sd]'))) {
        var k = el.dataset.k, p = a.byId(k.split('|')[0]), parts = k.split('|');
        a.setStock(k, a.stockOf(p, +parts[1], parts[2] || null) + +el.dataset.sd, 'Manual adjustment'); refreshStockRow(k); return;
      }
      if ((el = t.closest('[data-aff]'))) { affAction(el.dataset.aff, el.dataset.code); return; }
      if ((el = t.closest('[data-staff]'))) {
        var s = a.STAFF.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!s) return;
        if (el.dataset.staff === 'toggle') {
          if (s.active && s.role === 'owner' && !activeOwners(s.id)) { a.toast('Keep at least one active owner'); return; }
          s.active = !s.active; a.logActivity('Staff', s.name, s.active ? 'Enabled' : 'Disabled');
        } else {
          s.pin = String(1000 + Math.floor(Math.random() * 9000)); a.logActivity('Staff', s.name, 'PIN reset');
          a.toast('New PIN for ' + s.name + ': ' + s.pin + ' — share it with them privately');
        }
        a.saveStaff(); a.rerender(); return;
      }
    });
    root.addEventListener('toggle', function (ev) { var d = ev.target; if (d.dataset && d.dataset.pid) ui.open[d.dataset.pid] = d.open; }, true);
    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.dataset.ostatus) { setOrderStatus(t.dataset.ostatus, t.value); a.rerender(); return; }
      if (t.dataset.sk) { a.setStock(t.dataset.sk, t.value, 'Stock count'); refreshStockRow(t.dataset.sk); return; }
      if (t.dataset.role) {
        var s = a.STAFF.filter(function (x) { return x.id === t.dataset.role; })[0];
        if (s.role === 'owner' && t.value !== 'owner' && !activeOwners(s.id)) { a.toast('Keep at least one active owner'); t.value = 'owner'; return; }
        a.logActivity('Staff', s.name, a.ROLES[s.role].name + ' → ' + a.ROLES[t.value].name); s.role = t.value; a.saveStaff(); a.toast(s.name + ' is now ' + a.ROLES[s.role].name); return;
      }
      if (t.id === 'st-dept') { ui.stockDept = t.value; a.rerender(); return; }
      if (t.id === 'st-filter') { ui.stockFilter = t.value; a.rerender(); return; }
      if (t.id === 'st-th') { var n = Math.max(1, Math.min(50, +t.value || 5)); a.logActivity('Settings', 'Low-stock alert', a.SETTINGS.lowStockAt + ' → ' + n); a.SETTINGS.lowStockAt = n; a.saveSettings(); a.rerender(); return; }
      if (t.id === 'act-type') { ui.actType = t.value; a.rerender(); return; }
    });
    var qIn = a.$('#st-q'), qT;
    if (qIn) qIn.addEventListener('input', function () { clearTimeout(qT); var v = qIn.value; qT = setTimeout(function () { ui.stockQ = v; a.rerender(); var el = a.$('#st-q'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 300); });
    var fs = a.$('#aff-set');
    if (fs) fs.onsubmit = function (ev) {
      ev.preventDefault();
      var S = a.AFFSET, nr = Math.max(1, Math.min(50, +a.$('#as-rate').value || S.rate)), nc = Math.max(0, Math.min(50, +a.$('#as-cust').value || 0)), nd = Math.max(1, Math.min(90, +a.$('#as-days').value || S.days));
      a.logActivity('Settings', 'Affiliate programme', 'Commission ' + S.rate + '→' + nr + '%, customer ' + S.customerPct + '→' + nc + '%, ' + S.days + '→' + nd + ' days');
      S.rate = nr; S.customerPct = nc; S.days = nd; a.store.set('affset', S); a.toast('Programme settings saved'); a.rerender();
    };
    var fa = a.$('#aff-add');
    if (fa) fa.onsubmit = function (ev) {
      ev.preventDefault();
      var name = a.$('#aa-name').value.trim(), ph = a.$('#aa-phone').value.trim(), code = a.$('#aa-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!name || !a.validPhone(ph)) { a.$('#aa-err').textContent = 'Enter a name and a valid WhatsApp number, e.g. 0300-1234567.'; return; }
      if (!code) code = (name.replace(/[^A-Za-z]/g, '').toUpperCase() || 'RSBRI').slice(0, 6) + (10 + Math.floor(Math.random() * 90));
      if (a.affByCode(code) || a.S.discountCodes[code]) { a.$('#aa-err').textContent = 'The code ' + code + ' is already used. Choose another.'; return; }
      a.AFFILIATES.push({ code: code, name: name, phone: ph, handle: a.$('#aa-handle').value.trim(), status: 'active', clicks: 0, paid: 0, joined: Date.now() });
      a.saveAffiliates(); a.logActivity('Affiliate', code, 'Added for ' + name); a.toast(code + ' added'); a.rerender();
    };
    var sf = a.$('#staff-add');
    if (sf) sf.onsubmit = function (ev) {
      ev.preventDefault();
      var name = a.$('#sa-name').value.trim(), login = a.$('#sa-login').value.trim(), pin = a.$('#sa-pin').value.trim(), role = a.$('#sa-role').value;
      if (!name || !login) { a.$('#sa-err').textContent = 'Enter a name and a mobile number or email.'; return; }
      if (!/^\d{4}$/.test(pin)) { a.$('#sa-err').textContent = 'The PIN must be 4 digits.'; return; }
      if (a.STAFF.some(function (s) { return s.login.toLowerCase() === login.toLowerCase(); })) { a.$('#sa-err').textContent = 'Someone already signs in with ' + login + '.'; return; }
      a.STAFF.push({ id: 'u' + Date.now(), name: name, login: login, role: role, pin: pin, active: true });
      a.saveStaff(); a.logActivity('Staff', name, 'Added as ' + a.ROLES[role].name); a.toast(name + ' added as ' + a.ROLES[role].name); a.rerender();
    };
  }

  R.admin = { view: view, mount: mount };
})();
