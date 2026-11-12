/*
 * 回程購物與送禮（底部「＋」→ 記一筆購物；首頁剩餘公斤數下方的入口）
 *
 * state.shopping
 *   plans      計畫要買：{ id, tripId, name, weight(每個 kg), qty, purchaseId(買了之後連到購物紀錄), createdAt }
 *   purchases  購物紀錄：{ id, tripId, name, weight(每個 kg), qty, price, category, city, bagId, homeDest(之後放到哪個家),
 *                         placedHome(整理行李時已經放到哪個家), planId, date, createdAt, updatedAt }
 *   ratio      { 旅程 id: 計畫購物佔比 0–1 }
 * state.gifts  送禮：{ id, tripId, name, weight(每個 kg), qty, to(送給誰), city(在哪個城市送), status, source, drawerId,
 *                     bagId, home(不在行李裡時放在哪個家), givenDate, createdAt, updatedAt }
 *   status：want 想買／bought 已買好／packed 在行李裡／given 已送出
 *   source：home 出發前從家裡帶／trip 旅途中買／drawer 從抽屜挑
 * 放進行李的購物和禮物，會在 state.items 有一筆（purchaseId／giftId），首頁剩餘公斤數自動扣掉。
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;
  var DEFAULT_RATIO = 0.7;
  var STATUS = [['want', '想買'], ['bought', '已買好'], ['packed', '在行李裡'], ['given', '已送出']];
  var SOURCES = [['home', '從家裡帶'], ['trip', '旅途中買'], ['drawer', '從抽屜挑']];

  function st() { return App.state(); }
  function sh() { return st().shopping; }
  function fmt(n) { var r = Math.round((Number(n) || 0) * 10) / 10; return (Object.is(r, -0) ? 0 : r).toFixed(1); }
  function num(v) { var n = parseFloat(v); return isFinite(n) && n >= 0 ? n : 0; }
  function tripById(id) { return st().trips.find(function (t) { return t.id === id; }); }
  function itemOfPurchase(p) { return st().items.find(function (it) { return it.purchaseId === p.id; }); }
  function itemOfGift(g) { return st().items.find(function (it) { return it.giftId === g.id; }); }
  function giftById(id) { return st().gifts.find(function (g) { return g.id === id; }); }
  function purchaseById(id) { return sh().purchases.find(function (p) { return p.id === id; }); }
  function statusName(s) { return (STATUS.find(function (x) { return x[0] === s; }) || [, ''])[1]; }
  function bagName(id) { var b = App.bagById(id); return b ? b.name : ''; }
  function sameCity(a, b) {
    var x = App.norm(a || ''), y = App.norm(b || '');
    return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0);
  }

  // 禮物狀態以行李清單為準：行李裡有＝在行李裡；被拿出來了＝已買好
  function giftStatus(g) {
    if (g.status === 'given') return 'given';
    if (itemOfGift(g)) return 'packed';
    return g.status === 'packed' ? 'bought' : (g.status || 'want');
  }

  // ---------- 旅程 ----------
  function sortedTrips() {
    return st().trips.slice().sort(function (a, b) {
      var da = (a.legs[0] || {}).date || '', db = (b.legs[0] || {}).date || '';
      return db.localeCompare(da);
    });
  }
  function defaultTripId() {
    var n = App.nextLeg();
    if (n) return n.trip.id;
    var t = sortedTrips()[0];
    return t ? t.id : '';
  }
  function tripCities(t) {
    var out = [];
    (t ? t.legs : []).forEach(function (l) {
      [l.from, l.to].forEach(function (c) { c = (c || '').trim(); if (c && out.indexOf(c) < 0) out.push(c); });
    });
    return out;
  }

  var tripId = '';
  var tab = 'buy';
  var giftView = 'list';

  function curTrip() {
    if (!tripById(tripId)) tripId = defaultTripId();
    return tripById(tripId);
  }

  // ---------- 額度計算 ----------
  function ratioOf(id) {
    var r = sh().ratio[id];
    return typeof r === 'number' && r >= 0 && r <= 1 ? r : DEFAULT_RATIO;
  }

  function tripWeights(id) {
    var planUsed = 0, impulseUsed = 0, reserve = 0, boughtCount = 0, boughtW = 0;
    sh().purchases.forEach(function (p) {
      if (p.tripId !== id) return;
      var w = p.weight * p.qty;
      boughtCount++; boughtW += w;
      if (!itemOfPurchase(p)) return;          // 不在行李裡就不佔額度
      if (p.planId) planUsed += w; else impulseUsed += w;
    });
    sh().plans.forEach(function (pl) {
      if (pl.tripId === id && !(pl.purchaseId && purchaseById(pl.purchaseId))) reserve += pl.weight * pl.qty;
    });
    st().gifts.forEach(function (g) {
      if (g.tripId !== id) return;
      var s = giftStatus(g);
      if (s === 'want') reserve += g.weight * g.qty;                                  // 想買的禮物先預留在計畫購物
      else if (s === 'packed' && g.source === 'trip') planUsed += g.weight * g.qty;   // 旅途中買的禮物算計畫購物
    });
    return { planUsed: planUsed, impulseUsed: impulseUsed, reserve: reserve, boughtCount: boughtCount, boughtW: boughtW };
  }

  function quota(id) {
    var info = App.remainInfo();
    var w = tripWeights(id);
    var r = ratioOf(id);
    if (info.remain == null) return { remain: null, w: w, ratio: r };
    var budget = info.remain + w.planUsed + w.impulseUsed;
    var planQ = budget * r, impQ = budget - planQ;
    return {
      remain: info.remain, budget: budget, ratio: r, w: w, next: info.next,
      planQ: planQ, impQ: impQ,
      planLeft: planQ - w.planUsed - w.reserve, impLeft: impQ - w.impulseUsed
    };
  }

  // ---------- 首頁 ----------
  function hereCity() {
    var T = window.Trips;
    if (!T) return null;
    var today = App.todayStr(), best = null;
    st().trips.forEach(function (t) {
      t.legs.forEach(function (l, i) {
        var arr = T.arrivalDate(l);
        if (!arr || arr > today || !l.to) return;
        var nx = t.legs[i + 1];
        if (nx && nx.date && nx.date < today) return;   // 已經離開這個城市
        var d = (Date.parse(today) - Date.parse(arr)) / 86400000;
        if (d > 21) return;
        if (!best || arr >= best.date) best = { city: l.to, date: arr, trip: t };
      });
    });
    return best;
  }

  function giftsHere() {
    var h = hereCity();
    if (!h) return { here: null, list: [] };
    return {
      here: h,
      list: st().gifts.filter(function (g) {
        var s = giftStatus(g);
        return (s === 'bought' || s === 'packed') && sameCity(g.city, h.city);
      })
    };
  }

  function renderHomeBits() {
    var entry = $('#shop-entry');
    if (entry) {
      var id = defaultTripId();
      var w = id ? tripWeights(id) : { boughtCount: 0, boughtW: 0 };
      var gifts = st().gifts.filter(function (g) { return g.tripId === id && giftStatus(g) !== 'given'; }).length;
      $('#shop-entry-sub').textContent = '已買 ' + w.boughtCount + ' 件・' + fmt(w.boughtW) + ' kg' + (gifts ? '・禮物 ' + gifts + ' 份' : '');
    }
    var box = $('#gift-banner');
    if (!box) return;
    var gh = giftsHere();
    if (!gh.list.length) { box.hidden = true; box.innerHTML = ''; return; }
    var people = [];
    gh.list.forEach(function (g) { var p = g.to || '未填對象'; if (people.indexOf(p) < 0) people.push(p); });
    var n = gh.list.reduce(function (s, g) { return s + (g.qty || 1); }, 0);
    box.hidden = false;
    box.innerHTML = '<div class="arrival-text">' + App.GIFT_ICON + ' 這裡有 <b>' + n + '</b> 份禮物要送<br><span class="muted small">' +
      esc(gh.here.city) + '・給 ' + esc(people.join('、')) + '</span></div>' +
      '<div class="arrival-btns"><a class="btn primary small-btn" href="#shop/gift">查看禮物</a></div>';
  }

  // ---------- 頁面 ----------
  function show(which) {
    tab = which === 'gift' ? 'gift' : 'buy';
    render();
  }

  function render() {
    var trips = sortedTrips();
    var t = curTrip();
    $('#shop-empty').hidden = !!trips.length;
    $('#shop-main').hidden = !trips.length;
    Array.prototype.forEach.call(document.querySelectorAll('[data-shop-tab]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-shop-tab') === tab);
    });
    $('#shop-h1').textContent = tab === 'gift' ? '送禮與伴手禮' : '回程購物';
    $('#shop-h1').setAttribute('data-en', tab === 'gift' ? 'GIFTS' : 'SHOPPING');
    if (!trips.length) return;
    $('#shop-trip').innerHTML = trips.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === tripId ? ' selected' : '') + '>' + esc(x.name || '未命名旅程') + '</option>';
    }).join('');
    $('#shop-buy').hidden = tab !== 'buy';
    $('#shop-gift').hidden = tab !== 'gift';
    if (tab === 'buy') renderBuy(t); else renderGift(t);
  }

  function renderQuota(t) {
    var q = quota(t.id);
    var pct = Math.round(q.ratio * 100);
    $('#shop-ratio').value = pct;
    $('#shop-ratio-text').textContent = '計畫 ' + pct + '%・衝動 ' + (100 - pct) + '%';
    if (q.remain == null) {
      $('#shop-remain').textContent = '—';
      $('#shop-remain-note').textContent = '沒有接下來的航班，新增旅程後就會計算';
      $('#shop-quota').innerHTML = '';
      return q;
    }
    $('#shop-remain').textContent = fmt(q.remain);
    $('#shop-remain').classList.toggle('over', q.remain < 0);
    $('#shop-remain-note').textContent = '依下一段 ' + window.Trips.fmtDate(q.next.leg.date) + '「' + (q.next.leg.from || '?') + ' → ' + (q.next.leg.to || '?') + '」的額度' +
      (q.next.trip.id !== t.id ? '（不是這趟旅程）' : '');
    function row(label, total, used, reserve, left) {
      return '<div class="sq-row"><div class="sq-head"><span>' + label + '</span><b class="' + (left < 0 ? 'over' : '') + '">剩 ' + fmt(left) + ' kg</b></div>' +
        '<div class="sq-bar"><i style="width:' + Math.max(0, Math.min(100, total > 0 ? (used + reserve) / total * 100 : 100)) + '%"></i></div>' +
        '<div class="muted small">額度 ' + fmt(total) + ' kg・已買 ' + fmt(used) + ' kg' + (reserve != null ? '・預留 ' + fmt(reserve) + ' kg' : '') + '</div></div>';
    }
    $('#shop-quota').innerHTML = row('計畫購物', q.planQ, q.w.planUsed, q.w.reserve, q.planLeft) +
      row('衝動購物', q.impQ, q.w.impulseUsed, null, q.impLeft);
    return q;
  }

  function tryText(w, q) {
    if (!q || q.remain == null) return '';
    var left = q.remain - w;
    return '<span class="' + (left < 0 ? 'over' : '') + '">買了之後還剩 <b>' + fmt(left) + '</b> 公斤' + (left < 0 ? '（超重了）' : '') + '</span>';
  }

  function renderTry() {
    var t = curTrip(); if (!t) return;
    var w = num($('#shop-try').value);
    $('#shop-try-out').innerHTML = $('#shop-try').value === '' ? '<span class="muted">輸入重量，先算算看</span>' : tryText(w, quota(t.id));
  }

  function renderBuy(t) {
    renderQuota(t);
    renderTry();
    var plans = sh().plans.filter(function (p) { return p.tripId === t.id; });
    $('#shop-plans').innerHTML = plans.length ? plans.map(function (p) {
      var done = p.purchaseId && purchaseById(p.purchaseId);
      return '<div class="sp-row' + (done ? ' done' : '') + '">' +
        '<button type="button" class="bp-check" data-plan-buy="' + esc(p.id) + '" aria-label="' + (done ? '已買' : '買了') + '">' + (done ? '✓' : '') + '</button>' +
        '<span class="sp-name">' + esc(p.name) + (p.qty > 1 ? ' <span class="muted">× ' + p.qty + '</span>' : '') + '</span>' +
        '<span class="bp-w">約 ' + App.fmtWeight(p.weight * p.qty) + '</span>' +
        '<button type="button" class="bp-out" data-plan-del="' + esc(p.id) + '" aria-label="刪除：' + esc(p.name) + '">✕</button></div>';
    }).join('') : '<p class="muted small">還沒有計畫要買的東西。先列下來，會從計畫購物額度預留重量。</p>';
    renderRecords(t);
  }

  function purchaseLoc(p) {
    var it = itemOfPurchase(p);
    if (it) return '🧳 ' + (bagName(it.bagId) || '行李');
    if (p.placedHome) return '📍 已放到' + p.placedHome;
    return '不在行李裡';
  }

  function renderRecords(t) {
    var trips = [t].concat(sortedTrips().filter(function (x) { return x.id !== t.id; }));
    var html = trips.map(function (x) {
      var list = sh().purchases.filter(function (p) { return p.tripId === x.id; });
      if (!list.length && x.id !== t.id) return '';
      var w = list.reduce(function (s, p) { return s + p.weight * p.qty; }, 0);
      return '<div class="sr-group"><div class="sr-head"><span>' + esc(x.name || '未命名旅程') + '</span><span class="muted small">' + list.length + ' 件・' + fmt(w) + ' kg</span></div>' +
        (list.length ? list.slice().reverse().map(function (p) {
          return '<button type="button" class="sr-row" data-buy-edit="' + esc(p.id) + '">' +
            '<span class="sr-info"><b>' + (p.planId ? '' : '<span class="sr-tag">衝動</span>') + esc(p.name) + (p.qty > 1 ? ' × ' + p.qty : '') + '</b>' +
            '<span class="muted small">' + esc([p.city, p.price, purchaseLoc(p), p.homeDest ? '之後放' + p.homeDest : ''].filter(Boolean).join('・')) + '</span></span>' +
            '<span class="bp-w">' + App.fmtWeight(p.weight * p.qty) + '</span></button>';
        }).join('') : '<p class="muted small">這趟還沒有購物紀錄。</p>') + '</div>';
    }).join('');
    $('#shop-records').innerHTML = html;
  }

  // ---------- 送禮 ----------
  function giftRow(g, withTrip) {
    var s = giftStatus(g);
    var it = itemOfGift(g);
    var t = tripById(g.tripId);
    var meta = [g.to ? '給 ' + g.to : '還沒決定送誰', g.city, s === 'packed' && it ? bagName(it.bagId) : '', s === 'bought' && g.home ? '在' + g.home : '',
      s === 'given' && g.givenDate ? window.Trips.fmtDate(g.givenDate) + '送出' : '', withTrip && t ? t.name : ''].filter(Boolean).join('・');
    var act = s === 'want' ? ['bought', '已買好'] : s === 'bought' ? ['pack', '放進行李'] : s === 'packed' ? ['given', '已送出'] : null;
    return '<div class="gf-row' + (s === 'given' ? ' done' : '') + '">' +
      '<button type="button" class="gf-main" data-gift-edit="' + esc(g.id) + '">' + App.GIFT_ICON +
      '<span class="sr-info"><b>' + esc(g.name) + (g.qty > 1 ? ' × ' + g.qty : '') + '</b><span class="muted small">' + esc(meta) + '</span></span>' +
      '<span class="gf-side"><span class="gf-status s-' + s + '">' + statusName(s) + '</span><span class="muted small">' + App.fmtWeight(g.weight * g.qty) + '</span></span></button>' +
      (act ? '<button type="button" class="link small gf-act" data-gift-act="' + act[0] + '" data-gift-id="' + esc(g.id) + '">' + act[1] + ' ›</button>' : '') +
      '</div>';
  }

  function renderGift(t) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-gift-view]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-gift-view') === giftView);
    });
    var gh = giftsHere();
    $('#gift-here').hidden = !gh.list.length;
    if (gh.list.length) {
      $('#gift-here').innerHTML = '<div class="arrival-text">' + App.GIFT_ICON + ' 在' + esc(gh.here.city) + '有 <b>' + gh.list.length + '</b> 項禮物要送</div>' +
        gh.list.map(function (g) { return giftRow(g, true); }).join('');
    }
    if (giftView === 'list') {
      var list = st().gifts.filter(function (g) { return g.tripId === t.id; });
      var order = ['want', 'bought', 'packed', 'given'];
      list.sort(function (a, b) { return order.indexOf(giftStatus(a)) - order.indexOf(giftStatus(b)); });
      var w = list.filter(function (g) { return giftStatus(g) === 'packed'; }).reduce(function (s, g) { return s + g.weight * g.qty; }, 0);
      $('#gift-list').innerHTML = list.length ?
        '<p class="muted small gf-sum">' + list.length + ' 項・在行李裡 ' + fmt(w) + ' kg</p>' + list.map(function (g) { return giftRow(g, false); }).join('') :
        '<p class="muted small">這趟還沒有禮物。可以先記下想買的，重量會從計畫購物預留。</p>';
    } else {
      var by = {};
      st().gifts.forEach(function (g) { var p = g.to || '未填對象'; (by[p] = by[p] || []).push(g); });
      var names = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; });
      $('#gift-list').innerHTML = names.length ? names.map(function (p) {
        var arr = by[p].slice().sort(function (a, b) { return (b.givenDate || '').localeCompare(a.givenDate || '') || (b.createdAt || 0) - (a.createdAt || 0); });
        var given = arr.filter(function (g) { return giftStatus(g) === 'given'; }).length;
        return '<div class="sr-group"><div class="sr-head"><span>' + esc(p) + '</span><span class="muted small">' + arr.length + ' 份・已送 ' + given + '</span></div>' +
          arr.map(function (g) { return giftRow(g, true); }).join('') + '</div>';
      }).join('') : '<p class="muted small">還沒有送禮紀錄。</p>';
    }
  }

  // ---------- 記一筆購物 ----------
  var buy = null;   // 編輯中的購物紀錄（新的或舊的副本）

  function chipList(el, list, value, attr, extra) {
    el.innerHTML = list.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o;
      return '<button type="button" class="chip' + (v === value ? ' on' : '') + '" ' + attr + '="' + esc(v) + '">' + esc(label) + '</button>';
    }).join('') + (extra || '');
  }

  function defaultBagId() {
    // 這趟用到的箱子優先（托運優先），不會選到放在別的家的箱子
    var bags = App.pickBags().filter(function (b) { return App.isTripBag(b.id); });
    if (!bags.length) bags = App.pickBags();
    var pick = bags.find(function (b) { return b.kind === 'checked'; }) || bags[0];
    return pick ? pick.id : '';
  }

  function openBuy(id, plan) {
    var t = curTrip();
    if (!t) { App.toast('請先新增一趟旅程'); return; }
    var p = id && purchaseById(id);
    if (p) {
      var it = itemOfPurchase(p);
      buy = JSON.parse(JSON.stringify(p));
      buy.bagId = it ? it.bagId : '';
      buy.isNew = false;
    } else {
      var here = hereCity();
      buy = { id: App.uid(), tripId: t.id, name: plan ? plan.name : '', weight: plan ? plan.weight : '', qty: plan ? plan.qty : 1, price: '',
        category: '必備品', city: here && here.trip.id === t.id ? here.city : '', bagId: defaultBagId(), homeDest: '', planId: plan ? plan.id : null, isNew: true };
    }
    $('#buy-title').textContent = buy.isNew ? (plan ? '買了：' + plan.name : '記一筆購物') : '編輯購物紀錄';
    $('#buy-name').value = buy.name;
    $('#buy-weight').value = buy.weight === '' ? '' : buy.weight;
    $('#buy-qty').value = buy.qty || 1;
    $('#buy-price').value = buy.price || '';
    $('#buy-cat').innerHTML = App.categories().map(function (c) {
      return '<option' + (c.name === buy.category ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    $('#buy-delete').hidden = buy.isNew;
    // 已經放到家裡（進了抽屜）的購物：只留作紀錄，東西本身到抽屜改，才不會有兩份不一樣的資料
    buy.locked = !buy.isNew && !!(p && p.placedHome) && !itemOfPurchase(p);
    $('#buy-note').hidden = !buy.locked;
    $('#buy-note').textContent = buy.locked ? '這筆已經放到' + p.placedHome + '的家，現在在「我的抽屜」裡。這裡只留作購物紀錄；要改名稱或重量請到抽屜。' : '';
    ['#buy-name', '#buy-weight', '#buy-qty', '#buy-price', '#buy-cat'].forEach(function (s) { $(s).disabled = buy.locked; });
    $('#buy-save').hidden = buy.locked;
    $('#buy-sheet').classList.toggle('locked', buy.locked);
    renderBuyForm();
    $('#buy-sheet').hidden = false;
    $('#buy-sheet .org-panel').scrollTop = 0;
    if (buy.isNew && !plan) setTimeout(function () { $('#buy-name').focus(); }, 50);
  }

  function renderBuyForm() {
    chipList($('#buy-bag'), App.pickBags().map(function (b) { return [b.id, App.bagLabel(b)]; }).concat([['', '不放進行李']]), buy.bagId, 'data-buy-bag');
    var cities = tripCities(tripById(buy.tripId));
    if (buy.city && cities.indexOf(buy.city) < 0) cities.push(buy.city);
    chipList($('#buy-city'), cities, buy.city, 'data-buy-city', '<button type="button" class="chip" data-buy-city-other="1">其他</button>');
    chipList($('#buy-home'), App.homes().concat([['', '未定']]), buy.homeDest, 'data-buy-home');
    buyTry();
  }

  function buyTry() {
    var w = num($('#buy-weight').value) * Math.max(1, parseInt($('#buy-qty').value, 10) || 1);
    var q = quota(buy.tripId);
    if (q.remain == null) { $('#buy-try').innerHTML = ''; return; }
    // 編輯舊紀錄：原本已算在行李裡的先加回來
    var old = !buy.isNew && purchaseById(buy.id);
    var back = old && itemOfPurchase(old) ? old.weight * old.qty : 0;
    var left = q.remain + back - (buy.bagId ? w : 0);
    $('#buy-try').innerHTML = buy.bagId ? '<span class="' + (left < 0 ? 'over' : '') + '">買了之後還剩 <b>' + fmt(left) + '</b> 公斤' + (left < 0 ? '（超重了）' : '') + '</span>' :
      '<span class="muted">不放進行李，不會扣剩餘公斤數</span>';
  }

  function saveBuy() {
    var name = $('#buy-name').value.trim();
    if (!name) { App.toast('請輸入名稱'); return; }
    var s = st();
    var p = buy.isNew ? { id: buy.id, createdAt: Date.now(), date: App.todayStr(), planId: buy.planId || null, tripId: buy.tripId } : purchaseById(buy.id);
    if (!p) return;
    p.name = name;
    p.weight = num($('#buy-weight').value);
    p.qty = Math.max(1, parseInt($('#buy-qty').value, 10) || 1);
    p.price = $('#buy-price').value.trim().slice(0, 20);
    p.category = $('#buy-cat').value || '必備品';
    p.city = buy.city || '';
    p.homeDest = buy.homeDest || '';
    p.bagId = buy.bagId || '';
    p.updatedAt = Date.now();
    if (buy.isNew) {
      sh().purchases.push(p);
      var plan = p.planId && sh().plans.find(function (x) { return x.id === p.planId; });
      if (plan) plan.purchaseId = p.id;
    }
    // 行李清單：放進行李就有一筆，不放就拿掉
    var it = itemOfPurchase(p);
    if (p.bagId) {
      if (!it) { it = { id: App.uid(), purchaseId: p.id }; s.items.push(it); }
      it.name = p.name; it.weight = p.weight; it.qty = p.qty; it.unit = '個'; it.category = p.category; it.bagId = p.bagId;
      p.placedHome = '';
    } else if (it) {
      s.items = s.items.filter(function (x) { return x !== it; });
    }
    App.save();
    $('#buy-sheet').hidden = true;
    App.toast(buy.isNew ? '已記下：' + name : '已儲存');
    render();
  }

  function deleteBuy() {
    var p = purchaseById(buy.id);
    if (!p || !confirm('要刪除購物紀錄「' + p.name + '」嗎？（也會從行李拿出來）')) return;
    sh().purchases = sh().purchases.filter(function (x) { return x !== p; });
    st().items = st().items.filter(function (it) { return it.purchaseId !== p.id; });
    sh().plans.forEach(function (pl) { if (pl.purchaseId === p.id) pl.purchaseId = null; });
    App.save();
    $('#buy-sheet').hidden = true;
    App.toast('已刪除');
    render();
  }

  $('#buy-sheet').addEventListener('click', function (e) {
    var t = e.target, el;
    if (buy && buy.locked && t.closest('[data-buy-bag], [data-buy-city], [data-buy-city-other], [data-buy-home]')) return;
    if ((el = t.closest('[data-buy-bag]'))) { buy.bagId = el.getAttribute('data-buy-bag'); renderBuyForm(); return; }
    if ((el = t.closest('[data-buy-city-other]'))) {
      window.Clothing.askText('在哪個城市買的？', '').then(function (v) { v = (v || '').trim().slice(0, 20); if (v) { buy.city = v; renderBuyForm(); } });
      return;
    }
    if ((el = t.closest('[data-buy-city]'))) { var c = el.getAttribute('data-buy-city'); buy.city = buy.city === c ? '' : c; renderBuyForm(); return; }
    if ((el = t.closest('[data-buy-home]'))) { buy.homeDest = el.getAttribute('data-buy-home'); renderBuyForm(); return; }
    if (t.id === 'buy-save') { saveBuy(); return; }
    if (t.id === 'buy-delete') { deleteBuy(); return; }
    if (t.id === 'buy-sheet' || t.id === 'buy-cancel') $('#buy-sheet').hidden = true;
  });
  $('#buy-weight').addEventListener('input', buyTry);
  $('#buy-qty').addEventListener('input', buyTry);

  // ---------- 禮物 ----------
  var gift = null;

  function drawerGifts() {
    return st().memory.filter(function (m) { return !App.isCloth(m) && m.category === '禮物'; });
  }

  function openGift(id) {
    var t = curTrip();
    if (!t) { App.toast('請先新增一趟旅程'); return; }
    var g = id && giftById(id);
    if (g) {
      gift = JSON.parse(JSON.stringify(g));
      gift.status = giftStatus(g);
      var it = itemOfGift(g);
      gift.bagId = it ? it.bagId : (g.bagId || defaultBagId());
      gift.isNew = false;
    } else {
      gift = { id: App.uid(), tripId: t.id, name: '', weight: '', qty: 1, to: '', city: '', status: 'want', source: 'trip', drawerId: null,
        bagId: defaultBagId(), home: '', isNew: true };
    }
    $('#gift-title').textContent = gift.isNew ? '新增禮物' : '編輯禮物';
    var dm0 = gift.source === 'drawer' && gift.drawerId && App.entryById(gift.drawerId);
    if (dm0) { gift.name = dm0.name; gift.weight = dm0.weight || 0; }
    $('#gift-name').value = gift.name;
    $('#gift-weight').value = gift.weight === '' ? '' : gift.weight;
    $('#gift-qty').value = gift.qty || 1;
    $('#gift-to').value = gift.to || '';
    var names = [];
    st().gifts.forEach(function (x) { if (x.to && names.indexOf(x.to) < 0) names.push(x.to); });
    $('#gift-to-list').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    $('#gift-to-chips').innerHTML = names.slice(0, 8).map(function (n) {
      return '<button type="button" class="chip" data-gift-to="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
    $('#gift-delete').hidden = gift.isNew;
    renderGiftForm();
    $('#gift-sheet').hidden = false;
    $('#gift-sheet .org-panel').scrollTop = 0;
  }

  function renderGiftForm() {
    $('#gift-source').innerHTML = SOURCES.map(function (x) {
      return '<button type="button" class="' + (gift.source === x[0] ? 'on' : '') + '" data-gift-source="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var dg = drawerGifts();
    $('#gift-drawer-wrap').hidden = gift.source !== 'drawer';
    $('#gift-drawer').innerHTML = dg.length ? dg.map(function (m) {
      var loc = App.locOf(m);
      return '<button type="button" class="chip' + (gift.drawerId === m.id ? ' on' : '') + '" data-gift-drawer="' + esc(m.id) + '">' + esc(m.name) +
        (loc && loc.state === 'home' ? '・' + esc(loc.home) : '') + '</button>';
    }).join('') : '<p class="muted small">抽屜裡還沒有「禮物」品類的東西。</p>';
    var cities = tripCities(tripById(gift.tripId));
    if (gift.city && cities.indexOf(gift.city) < 0) cities.push(gift.city);
    chipList($('#gift-city'), cities, gift.city, 'data-gift-city', '<button type="button" class="chip" data-gift-city-other="1">其他</button>');
    $('#gift-status').innerHTML = STATUS.map(function (x) {
      return '<button type="button" class="' + (gift.status === x[0] ? 'on' : '') + '" data-gift-status="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    $('#gift-bag-wrap').hidden = gift.status !== 'packed';
    var fromDrawer = gift.source === 'drawer' && !!gift.drawerId && !!App.entryById(gift.drawerId);
    $('#gift-name').disabled = fromDrawer;
    $('#gift-weight').disabled = fromDrawer;
    $('#gift-drawer-note').hidden = !fromDrawer;
    chipList($('#gift-bag'), App.pickBags().map(function (b) { return [b.id, App.bagLabel(b)]; }), gift.bagId, 'data-gift-bag');
  }

  // 把禮物放進行李（從抽屜挑的，抽屜那件的位置也一起變成「在行李裡」）
  function packGift(g, bagId) {
    var s = st();
    var it = itemOfGift(g);
    if (!bagId) bagId = defaultBagId();
    if (!it) {
      var m = g.drawerId && App.entryById(g.drawerId);
      // 抽屜那件已經在行李裡：直接用行李裡那份，不要重複算重量
      var already = m && s.items.find(function (x) { return x.catalogId === m.id && !x.giftId; });
      if (already) {
        bagId = already.bagId;
        if ((already.qty || 1) > g.qty) {
          already.qty -= g.qty;
          it = { id: App.uid(), giftId: g.id, catalogId: m.id };
          s.items.push(it);
        } else {
          it = already;
          it.giftId = g.id;
        }
      } else {
        it = { id: App.uid(), giftId: g.id };
        if (m) it.catalogId = m.id;
        s.items.push(it);
      }
    }
    it.name = g.name; it.weight = g.weight; it.qty = g.qty; it.unit = '份'; it.category = '禮物'; it.bagId = bagId;
    var m2 = it.catalogId && App.entryById(it.catalogId);
    if (m2) App.markPacked(m2, bagId);
    g.bagId = bagId;
    g.status = 'packed';
  }

  function unpackGift(g) {
    var it = itemOfGift(g);
    if (!it) return;
    st().items = st().items.filter(function (x) { return x !== it; });
    var m = it.catalogId && App.entryById(it.catalogId);
    if (m) App.restoreHome(m);
  }

  // 送出：從行李拿掉；抽屜裡的那件數量也扣掉
  function giveGift(g) {
    var wasPacked = !!itemOfGift(g);
    unpackGift(g);
    var m = g.drawerId && App.entryById(g.drawerId);
    if (m && g.status !== 'given' && m.count > 0) {
      m.count = Math.max(0, m.count - (g.qty || 1));
      if (!m.count) m.stock = 'out';
      m.updatedAt = Date.now();
    }
    g.status = 'given';
    g.givenDate = App.todayStr();
    return wasPacked;
  }

  function setGiftStatus(g, s, bagId) {
    if (s === 'packed') packGift(g, bagId);
    else if (s === 'given') { if (g.status !== 'given') giveGift(g); }
    else { unpackGift(g); g.status = s; g.givenDate = ''; }
    g.updatedAt = Date.now();
  }

  function saveGift() {
    var name = $('#gift-name').value.trim();
    if (!name) { App.toast('請輸入禮物名稱'); return; }
    var g = gift.isNew ? { id: gift.id, tripId: gift.tripId, createdAt: Date.now(), status: 'want', givenDate: '' } : giftById(gift.id);
    if (!g) return;
    g.name = name;
    g.weight = num($('#gift-weight').value);
    var dm = gift.source === 'drawer' && gift.drawerId && App.entryById(gift.drawerId);
    if (dm) { g.name = dm.name; g.weight = dm.weight || 0; }
    g.qty = Math.max(1, parseInt($('#gift-qty').value, 10) || 1);
    g.to = $('#gift-to').value.trim().slice(0, 20);
    g.city = gift.city || '';
    g.source = gift.source;
    g.drawerId = gift.source === 'drawer' ? gift.drawerId : null;
    if (gift.isNew) st().gifts.push(g);
    var prev = giftStatus(g);
    if (prev !== gift.status || gift.status === 'packed') setGiftStatus(g, gift.status, gift.bagId);
    g.updatedAt = Date.now();
    App.save();
    $('#gift-sheet').hidden = true;
    App.toast(gift.isNew ? '已新增禮物' : '已儲存');
    render();
  }

  function deleteGift() {
    var g = giftById(gift.id);
    if (!g || !confirm('要刪除禮物「' + g.name + '」嗎？（也會從行李拿出來）')) return;
    unpackGift(g);
    st().gifts = st().gifts.filter(function (x) { return x !== g; });
    App.save();
    $('#gift-sheet').hidden = true;
    App.toast('已刪除');
    render();
  }

  $('#gift-sheet').addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-gift-source]'))) { gift.source = el.getAttribute('data-gift-source'); if (gift.source === 'home' && gift.status === 'want') gift.status = 'bought'; renderGiftForm(); return; }
    if ((el = t.closest('[data-gift-drawer]'))) {
      var m = App.entryById(el.getAttribute('data-gift-drawer'));
      gift.drawerId = m.id;
      $('#gift-name').value = m.name;   // 從抽屜挑的：名稱、重量都跟抽屜那件一樣
      $('#gift-weight').value = Math.round((m.weight || 0) * 1000) / 1000;
      if (gift.status === 'want') gift.status = 'bought';
      renderGiftForm();
      return;
    }
    if ((el = t.closest('[data-gift-city-other]'))) {
      window.Clothing.askText('在哪個城市送？', '').then(function (v) { v = (v || '').trim().slice(0, 20); if (v) { gift.city = v; renderGiftForm(); } });
      return;
    }
    if ((el = t.closest('[data-gift-city]'))) { var c = el.getAttribute('data-gift-city'); gift.city = gift.city === c ? '' : c; renderGiftForm(); return; }
    if ((el = t.closest('[data-gift-to]'))) { $('#gift-to').value = el.getAttribute('data-gift-to'); return; }
    if ((el = t.closest('[data-gift-status]'))) { gift.status = el.getAttribute('data-gift-status'); renderGiftForm(); return; }
    if ((el = t.closest('[data-gift-bag]'))) { gift.bagId = el.getAttribute('data-gift-bag'); renderGiftForm(); return; }
    if (t.id === 'gift-save') { saveGift(); return; }
    if (t.id === 'gift-delete') { deleteGift(); return; }
    if (t.id === 'gift-sheet' || t.id === 'gift-cancel') $('#gift-sheet').hidden = true;
  });

  // ---------- 頁面操作 ----------
  $('#view-shop').addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-shop-tab]'))) { tab = el.getAttribute('data-shop-tab'); location.hash = tab === 'gift' ? '#shop/gift' : '#shop'; render(); return; }
    if ((el = t.closest('[data-gift-view]'))) { giftView = el.getAttribute('data-gift-view'); render(); return; }
    if ((el = t.closest('[data-plan-buy]'))) {
      var pl = sh().plans.find(function (x) { return x.id === el.getAttribute('data-plan-buy'); });
      if (!pl) return;
      if (pl.purchaseId && purchaseById(pl.purchaseId)) openBuy(pl.purchaseId); else openBuy(null, pl);
      return;
    }
    if ((el = t.closest('[data-plan-del]'))) {
      var id = el.getAttribute('data-plan-del');
      sh().plans = sh().plans.filter(function (x) { return x.id !== id; });
      App.save(); render();
      return;
    }
    if ((el = t.closest('[data-buy-edit]'))) { openBuy(el.getAttribute('data-buy-edit')); return; }
    if ((el = t.closest('[data-gift-act]'))) {
      var g = giftById(el.getAttribute('data-gift-id'));
      var act = el.getAttribute('data-gift-act');
      if (!g) return;
      if (act === 'given') {
        if (!confirm('「' + g.name + '」' + (g.to ? '已經送給' + g.to : '已經送出') + '了嗎？會從行李拿出來。')) return;
        setGiftStatus(g, 'given');
        App.toast('已送出，行李少了 ' + App.fmtWeight(g.weight * g.qty));
      } else if (act === 'pack') { setGiftStatus(g, 'packed', g.bagId); App.toast('已放進' + bagName(itemOfGift(g).bagId)); }
      else { setGiftStatus(g, 'bought'); App.toast('已買好：' + g.name); }
      App.save(); render();
      return;
    }
    if ((el = t.closest('[data-gift-edit]'))) { openGift(el.getAttribute('data-gift-edit')); return; }
    if (t.id === 'shop-record') { openBuy(null); return; }
    if (t.id === 'gift-add') { openGift(null); return; }
  });

  $('#shop-trip').addEventListener('change', function () { tripId = this.value; render(); });
  $('#shop-ratio').addEventListener('input', function () {
    var t = curTrip(); if (!t) return;
    sh().ratio[t.id] = Math.round(this.value) / 100;
    renderQuota(t); renderTry();
  });
  $('#shop-ratio').addEventListener('change', function () { App.save(); });   // 也會同步到雲端
  $('#shop-try').addEventListener('input', renderTry);

  $('#shop-plan-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = curTrip(); if (!t) return;
    var name = $('#shop-plan-name').value.trim();
    if (!name) { App.toast('請輸入要買什麼'); return; }
    var ref = App.findRef(name);
    var w = parseFloat($('#shop-plan-w').value);
    sh().plans.push({ id: App.uid(), tripId: t.id, name: name, weight: isFinite(w) && w >= 0 ? w : (ref ? ref.weight : 0.5), qty: 1, purchaseId: null, createdAt: Date.now() });
    $('#shop-plan-name').value = ''; $('#shop-plan-w').value = '';
    App.save(); render();
  });

  // 整理行李用：這筆行李物品是購物或禮物時的資訊
  function itemInfo(it) {
    if (it.purchaseId) { var p = purchaseById(it.purchaseId); return p ? { kind: 'buy', homeDest: p.homeDest, rec: p } : null; }
    if (it.giftId) { var g = giftById(it.giftId); return g ? { kind: 'gift', rec: g } : null; }
    return null;
  }

  // 整理行李時留在某個家：購物放進那個家的抽屜；禮物記成「已買好、在那個家」
  function leftAtHome(it, home, date) {
    var info = itemInfo(it);
    if (!info) return;
    if (info.kind === 'buy') {
      var p = info.rec;
      p.placedHome = home;
      if (!it.catalogId) {
        st().memory.push(App.normalizeEntry({
          name: p.name, weight: p.weight, unit: '個', category: p.category || '必備品', uses: 0, estimated: false,
          home: home, count: p.qty, countUnit: '個', stock: '', drawer: true, fromPurchase: p.id,
          location: { state: 'home', home: home, since: date }, moves: [{ home: home, date: date }]
        }));
      }
    } else {
      var g = info.rec;
      g.status = 'bought'; g.home = home; g.updatedAt = Date.now();
    }
  }

  window.Shop = {
    show: show, renderHomeBits: renderHomeBits, openBuy: openBuy, giftsHere: giftsHere,
    itemInfo: itemInfo, leftAtHome: leftAtHome
  };
})();
