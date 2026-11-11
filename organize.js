/*
 * 整理行李：抵達有家的城市時（依行程設定判斷），決定行李裡的東西要留下還是繼續帶走，
 * 也可以從這個家的衣櫃挑東西放進行李。
 *
 * 判斷方式：
 *   - 中途：某段航班抵達有家的城市，而且轉機方式不是「不入境，直接轉機」
 *   - 最後一段：旅程設定的「結束後回到哪個家」
 *   - 抵達日已到（今天或之前，3 週內），而且還沒整理過
 * 整理完會在那段航班記下 arrivalDone，不會再跳出。
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;

  function st() { return App.state(); }

  function daysBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }

  // 最近一次「已經抵達、還沒整理」的家
  function pendingArrival() {
    var T = window.Trips;
    if (!T) return null;
    var today = App.todayStr(), best = null;
    st().trips.forEach(function (t) {
      t.legs.forEach(function (l, i) {
        var last = i === t.legs.length - 1;
        var home = last ? T.endHomeOf(t) : ((l.connection || {}).mode === 'transit' ? '' : T.homeFor(l.to));
        if (!home || l.arrivalDone) return;
        var arr = T.arrivalDate(l);
        if (!arr || arr > today || daysBetween(arr, today) > 21) return;
        if (!best || arr >= best.date) best = { trip: t, leg: l, index: i, home: home, date: arr, last: last };
      });
    });
    return best;
  }

  // 抵達後還沒整理：行李裡的衣物先標成「待確認」
  function markPending(a) {
    st().memory.forEach(function (m) {
      var loc = App.locOf(m);
      if (loc && loc.state === 'packed') {
        m.location = Object.assign({}, m.location || {}, { state: 'pending', home: a.home, fromHome: loc.fromHome, bagId: loc.bagId });
      }
    });
  }

  // 首頁提醒；第一次發現時自動打開整理畫面
  function check() {
    var box = $('#arrival-banner');
    var a = pendingArrival();
    if (!a) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<div class="arrival-text">🏠 ' + (a.last ? '旅程結束，回到' : '已抵達') + '<b>' + esc(a.home) + '</b>的家（' +
      esc(window.Trips.fmtDate(a.date)) + '）<br><span class="muted small">' + esc(a.trip.name) + '：整理一下行李，決定哪些留下、哪些帶走</span></div>' +
      '<div class="arrival-btns"><button type="button" class="btn primary small-btn" id="arrival-open">整理行李</button>' +
      '<button type="button" class="link small" id="arrival-skip">這次不用整理</button></div>';
    if (!a.leg.arrivalPrompted) {
      a.leg.arrivalPrompted = true;
      markPending(a);
      App.save();
      setTimeout(function () { open(a); }, 300);
    }
  }

  // ---------- 整理畫面 ----------
  var cur = null;        // 目前整理的抵達點
  var choice = {};       // 行李物品 id → 'stay' 留下／'go' 帶走
  var picked = {};       // 這個家衣櫃裡要帶走的物品 id
  var swap = {};         // 換行李箱：舊行李箱 id → 這個家的另一個行李箱 id

  function thumb(m) {
    return m && m.photoId ? '<img class="org-thumb" data-photo="' + esc(m.photoId) + '" alt="">' : '<span class="org-thumb none"></span>';
  }

  function open(a) {
    cur = a || pendingArrival();
    if (!cur) return;
    choice = {};
    picked = {};
    swap = {};
    // 回到旅程終點的家：預設全部留下；中途：預設繼續帶走
    // 購物時選了「之後放到這個家」的，預設留下
    st().items.forEach(function (it) {
      var info = window.Shop && window.Shop.itemInfo(it);
      choice[it.id] = cur.last || (info && info.homeDest === cur.home) ? 'stay' : 'go';
    });
    $('#org-title').textContent = '整理行李：' + (cur.last ? '回到' : '抵達') + cur.home + '的家';
    $('#org-sub').textContent = cur.trip.name + '・' + window.Trips.fmtDate(cur.date) +
      (cur.last ? '・旅程最後一段' : '・下一站：' + (cur.trip.legs[cur.index + 1] ? cur.trip.legs[cur.index + 1].to || '下一段' : ''));
    $('#org-home-title').textContent = cur.home + '的衣櫃和抽屜裡的物品（勾選要帶去下一站的）';
    $('#org-bag').innerHTML = App.bagOptions();
    render();
    $('#org-sheet').hidden = false;
    $('#org-sheet .org-panel').scrollTop = 0;
  }

  function render() {
    var items = st().items;
    $('#org-packed').innerHTML = items.length ? items.map(function (it) {
      var m = it.catalogId && App.entryById(it.catalogId);
      var bag = App.bagById(it.bagId);
      var c = choice[it.id];
      var info = window.Shop && window.Shop.itemInfo(it);
      var tag = info && info.kind === 'buy' ? (info.homeDest ? '・要放到' + info.homeDest + '的家' : '・旅途中買的') :
        info && info.kind === 'gift' ? (info.rec.to ? '・給' + info.rec.to : '・禮物') : '';
      return '<div class="org-row">' + thumb(m) +
        '<div class="org-info"><div class="org-name">' + (it.giftId ? App.GIFT_ICON : '') + (it.purchaseId ? '<span class="bp-buy">購</span>' : '') + esc(it.name) + (it.qty > 1 ? ' × ' + it.qty : '') + '</div>' +
        '<div class="muted small">' + esc(bag ? bag.name : '行李') + (m && App.locOf(m) && App.locOf(m).fromHome ? '・從' + esc(App.locOf(m).fromHome) + '帶出' : '') + esc(tag) + '</div></div>' +
        '<div class="seg org-seg">' +
        '<button type="button" data-org-item="' + esc(it.id) + '" data-choice="stay" class="' + (c === 'stay' ? 'on' : '') + '">留在' + esc(cur.home) + '</button>' +
        '<button type="button" data-org-item="' + esc(it.id) + '" data-choice="go" class="' + (c === 'go' ? 'on' : '') + '">繼續帶走</button>' +
        '</div></div>';
    }).join('') : '<p class="muted small">行李裡沒有東西。</p>';

    renderSwap();

    var atHome = st().memory.filter(function (m) {
      var loc = App.locOf(m);
      return loc && loc.state === 'home' && loc.home === cur.home;
    });
    $('#org-home-wrap').hidden = !atHome.length && cur.last;
    $('#org-home').innerHTML = atHome.length ? atHome.map(function (m) {
      var on = !!picked[m.id];
      return '<button type="button" class="org-row org-pick' + (on ? ' on' : '') + '" data-org-pick="' + esc(m.id) + '">' +
        '<span class="org-check">' + (on ? '✓' : '') + '</span>' + thumb(m) +
        '<span class="org-info"><span class="org-name">' + esc(m.name) + '</span>' +
        '<span class="muted small">' + esc(App.fmtWeight(m.weight || 0)) + '</span></span></button>';
    }).join('') : '<p class="muted small">' + esc(cur.home) + '的衣櫃和抽屜裡目前沒有東西。</p>';
    Photos.fillThumbs($('#org-sheet'));
    summary();
  }

  // 換行李箱：正在用的行李箱，可以換成這個家另一個空的同類型行李箱（舊的留在這裡）
  function renderSwap() {
    var bags = st().bags;
    var used = bags.filter(function (b) { return st().items.some(function (it) { return it.bagId === b.id && choice[it.id] !== 'stay'; }); });
    var html = used.map(function (b) {
      var opts = bags.filter(function (x) {
        return x.id !== b.id && x.kind === b.kind && x.home === cur.home && App.bagLocOf(x).state !== 'out' &&
          !Object.keys(swap).some(function (k) { return k !== b.id && swap[k] === x.id; });
      });
      if (!opts.length) return '';
      return '<label class="org-bag-row org-swap-row"><span>' + esc(b.name) + '</span>' +
        '<select data-org-swap="' + esc(b.id) + '"><option value="">繼續用這個</option>' +
        opts.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (swap[b.id] === x.id ? ' selected' : '') + '>換成「' + esc(x.name) + '」' + (x.size ? '（' + esc(x.size) + '）' : '') + '</option>';
        }).join('') + '</select></label>';
    }).join('');
    $('#org-swap-wrap').hidden = !html;
    $('#org-swap').innerHTML = html;
  }

  function summary() {
    var stay = 0, go = 0;
    Object.keys(choice).forEach(function (k) { if (choice[k] === 'stay') stay++; else go++; });
    var add = Object.keys(picked).filter(function (k) { return picked[k]; }).length;
    $('#org-summary').textContent = '留下 ' + stay + ' 件・繼續帶走 ' + go + ' 件・新放進行李 ' + add + ' 件';
  }

  $('#org-sheet').addEventListener('click', function (e) {
    var t = e.target;
    var ch = t.closest('[data-org-item]');
    if (ch) { choice[ch.getAttribute('data-org-item')] = ch.getAttribute('data-choice'); render(); return; }
    var pk = t.closest('[data-org-pick]');
    if (pk) { var id = pk.getAttribute('data-org-pick'); picked[id] = !picked[id]; render(); return; }
    if (t.id === 'org-all-stay' || t.id === 'org-all-go') {
      var v = t.id === 'org-all-stay' ? 'stay' : 'go';
      Object.keys(choice).forEach(function (k) { choice[k] = v; });
      render();
      return;
    }
    if (t.id === 'org-ok') { confirmAll(); return; }
    if (t.closest('[data-org-swap]')) return;
    if (t.id === 'org-later' || t.id === 'org-sheet') { $('#org-sheet').hidden = true; }
  });

  $('#org-sheet').addEventListener('change', function (e) {
    var el = e.target.closest('[data-org-swap]');
    if (!el) return;
    if (el.value) swap[el.getAttribute('data-org-swap')] = el.value; else delete swap[el.getAttribute('data-org-swap')];
    render();
  });

  function confirmAll() {
    var s = st();
    var stayed = 0, added = 0;
    var bagId = $('#org-bag').value;
    var hadItems = s.bags.filter(function (b) { return s.items.some(function (it) { return it.bagId === b.id; }); });
    // 1. 行李裡的物品：留下的拿出行李、放在這個家；帶走的維持在行李裡
    var stayIds = Object.keys(choice).filter(function (k) { return choice[k] === 'stay'; });
    var stayItems = s.items.filter(function (it) { return stayIds.indexOf(it.id) >= 0; });
    s.items = s.items.filter(function (it) { return stayIds.indexOf(it.id) < 0; });
    stayItems.forEach(function (it) {
      stayed++;
      if (window.Shop) window.Shop.leftAtHome(it, cur.home, cur.date);   // 購物放進這個家的抽屜、禮物記成在這個家
      var m = it.catalogId && App.entryById(it.catalogId);
      if (m && App.locOf(m) && !s.items.some(function (x) { return x.catalogId === m.id; })) {
        App.markHome(m, cur.home, cur.date, true);
      }
    });
    s.memory.forEach(function (m) {
      var loc = App.locOf(m);
      if (loc && loc.state === 'pending') m.location.state = 'packed';   // 繼續帶走
    });
    // 2. 換行李箱：東西搬到這個家的另一個箱子，舊箱子留在這裡
    var swapped = 0;
    Object.keys(swap).forEach(function (oldId) {
      var nb = App.bagById(swap[oldId]), ob = App.bagById(oldId);
      if (!nb || !ob || !s.items.some(function (it) { return it.bagId === oldId; })) return;
      App.moveBagContents(oldId, nb.id);
      ob.home = cur.home;
      swapped++;
    });
    if (swap[bagId]) bagId = swap[bagId];
    // 清空的行李箱就放在這個家
    hadItems.forEach(function (b) { if (!s.items.some(function (it) { return it.bagId === b.id; })) b.home = cur.home; });
    // 3. 這個家衣櫃裡勾選的：放進行李
    Object.keys(picked).forEach(function (id) {
      if (!picked[id]) return;
      var m = App.entryById(id);
      if (m) { App.packEntry(m, bagId); added++; }
    });
    cur.leg.arrivalDone = true;
    cur.leg.arrivalPrompted = true;
    App.save();
    $('#org-sheet').hidden = true;
    App.toast('整理好了：留下 ' + stayed + ' 件、新放進行李 ' + added + ' 件' + (swapped ? '、換了 ' + swapped + ' 個行李箱' : ''));
    App.refreshView();
  }

  document.addEventListener('click', function (e) {
    if (e.target.id === 'arrival-open') open();
    if (e.target.id === 'arrival-skip') {
      var a = pendingArrival();
      if (!a || !confirm('這次抵達' + a.home + '不整理行李嗎？行李裡的東西會維持「在行李裡」。')) return;
      st().memory.forEach(function (m) {
        var loc = App.locOf(m);
        if (loc && loc.state === 'pending') m.location.state = 'packed';
      });
      a.leg.arrivalDone = true;
      App.save();
      App.refreshView();
    }
  });

  window.Organize = { check: check, open: open, pendingArrival: pendingArrival };
})();
