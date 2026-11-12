/*
 * 我的抽屜：衣服以外的物品（必備品、保健品、保養品、特殊類、禮物、食品、電線電器）
 *
 * 抽屜物品＝常帶物品（state.memory）裡沒有衣物標籤的那些，欄位：
 *   home（放在哪個家）、count／countUnit（數量，例如 5 片）、stock（have 有／low 快用完／out 沒了）
 *   位置與移動紀錄跟衣物共用：location、moves（見 app.js「物品位置」）
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;
  var norm = App.norm;

  var UNITS = ['個', '包', '片', '瓶', '盒', '條', '支', '罐', '套', '雙'];
  var STOCK = [['have', '有'], ['low', '快用完'], ['out', '沒了']];
  var PACKED = '在行李裡', NOHOME = '未設定';

  function st() { return App.state(); }
  function isDrawer(m) { return !App.isCloth(m); }
  function drawerItems() { return st().memory.filter(isDrawer); }
  function cats() { return App.categories().map(function (c) { return c.name; }); }

  function homeMatch(loc, f) {
    if (!f) return true;
    if (f === PACKED) return loc.state === 'packed';
    if (f === NOHOME) return loc.state === 'none';
    return (loc.state === 'home' || loc.state === 'pending') && loc.home === f;
  }

  function weightText(m) {
    var u = m.count != null ? (m.countUnit || m.unit || '個') : (m.unit || '個');
    return (m.estimated ? '約' : '') + App.fmtWeight(m.weight || 0) + '／' + u;
  }

  // ---------- 列表 ----------
  var tab = '';

  function renderTabs() {
    var all = drawerItems();
    var opts = [''].concat(App.homes(), [PACKED]);
    if (all.some(function (m) { return App.locOf(m).state === 'none'; })) opts.push(NOHOME);
    if (opts.indexOf(tab) < 0) tab = '';
    $('#dr-tabs').innerHTML = opts.map(function (h) {
      var n = all.filter(function (m) { return homeMatch(App.locOf(m), h); }).length;
      return '<button type="button" class="tab' + (h === tab ? ' on' : '') + '" data-dr-tab="' + esc(h) + '">' +
        (h ? esc(h === NOHOME ? '未設定家' : h) : '全部') + '<small>' + n + '</small></button>';
    }).join('');
  }

  function qtyHTML(m) {
    if (m.count != null) {
      return '<div class="dr-qty">' +
        '<button type="button" class="dr-step" data-dr-step="-1" data-id="' + esc(m.id) + '" aria-label="減少">－</button>' +
        '<span class="dr-num' + (m.count === 0 ? ' zero' : '') + '">' + m.count + '<small>' + esc(m.countUnit || '個') + '</small></span>' +
        '<button type="button" class="dr-step" data-dr-step="1" data-id="' + esc(m.id) + '" aria-label="增加">＋</button></div>';
    }
    var s = m.stock || 'have';
    return '<div class="seg dr-stock">' + STOCK.map(function (x) {
      return '<button type="button" class="' + (s === x[0] ? 'on ' + x[0] : '') + '" data-dr-stock="' + x[0] + '" data-id="' + esc(m.id) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    renderTabs();
    renderAddHomes();
    var list = drawerItems().filter(function (m) { return homeMatch(App.locOf(m), tab); });
    var groups = cats().map(function (c) {
      var rows = list.filter(function (m) { return (cats().indexOf(m.category) >= 0 ? m.category : '必備品') === c; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); });
      if (!rows.length) return '';
      return '<div class="card dr-group"><div class="dr-group-head"><b>' + esc(c) + '</b><span class="muted small">' + rows.length + ' 項</span></div>' +
        rows.map(function (m) {
          var loc = App.locOf(m);
          var showLoc = !tab || tab === PACKED;
          return '<div class="dr-row' + ((m.count === 0 || m.stock === 'out') ? ' out' : '') + '">' +
            '<button type="button" class="dr-main" data-dr-open="' + esc(m.id) + '">' +
            '<span class="dr-name">' + esc(m.name) + '</span>' +
            '<span class="muted small">' + esc(weightText(m)) + (showLoc || loc.state !== 'home' ? '・' + esc(App.locText(loc)) : '') + '</span></button>' +
            qtyHTML(m) + '</div>';
        }).join('') + '</div>';
    }).join('');
    $('#dr-list').innerHTML = groups || '<p class="empty-big">' +
      (drawerItems().length ? '這裡沒有東西。' : '抽屜還是空的。<br>在上面輸入名稱，就能快速新增，例如：泡麵、面膜、護照。') + '</p>';
  }

  $('#view-drawer').addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-dr-tab]'))) {
      tab = el.getAttribute('data-dr-tab');
      if (App.homes().indexOf(tab) >= 0) addHome = tab;   // 在哪個家的分頁，新增就預設放那個家
      render(); checkDup(); return;
    }
    if ((el = t.closest('[data-dr-step]'))) {
      var m = App.entryById(el.getAttribute('data-id'));
      m.count = Math.max(0, (m.count || 0) + +el.getAttribute('data-dr-step'));
      App.save(); render(); return;
    }
    if ((el = t.closest('[data-dr-stock]'))) {
      var m2 = App.entryById(el.getAttribute('data-id'));
      m2.stock = el.getAttribute('data-dr-stock');
      App.save(); render(); return;
    }
    if ((el = t.closest('[data-dr-open]'))) { openDetail(el.getAttribute('data-dr-open')); return; }
    if ((el = t.closest('[data-add-home]'))) { addHome = el.getAttribute('data-add-home'); renderAddHomes(); checkDup(); return; }
    if ((el = t.closest('[data-add-step]'))) {
      var q = $('#dr-add-qty');
      q.value = Math.max(0, (parseInt(q.value, 10) || 0) + +el.getAttribute('data-add-step'));
      return;
    }
    if (t.id === 'dr-dup-plus') { plusOne(); return; }
  });

  // ---------- 快速新增 ----------
  var addHome = null;

  function defaultHome() {
    var homes = App.homes();
    if (tab && homes.indexOf(tab) >= 0) return tab;
    if (addHome && homes.indexOf(addHome) >= 0) return addHome;
    var next = App.nextLeg();
    return (next && window.Trips && window.Trips.homeFor(next.trip.origin)) || homes[0] || '';
  }

  function renderAddHomes() {
    if (!addHome || App.homes().indexOf(addHome) < 0) addHome = defaultHome();
    $('#dr-add-homes').innerHTML = App.homes().map(function (h) {
      return '<button type="button" class="chip' + (h === addHome ? ' on' : '') + '" data-add-home="' + esc(h) + '">' + esc(h) + '</button>';
    }).join('');
  }

  function fillOptions() {
    $('#dr-add-cat').innerHTML = cats().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    $('#dr-add-unit').innerHTML = UNITS.map(function (u) { return '<option>' + u + '</option>'; }).join('');
    var names = [];
    drawerItems().forEach(function (m) { if (names.indexOf(m.name) < 0) names.push(m.name); });
    (window.REFERENCE_WEIGHTS || []).forEach(function (r) { if (names.indexOf(r.name) < 0) names.push(r.name); });
    $('#dr-names').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  var fromRef = false;
  $('#dr-name').addEventListener('input', function () {
    var name = this.value.trim();
    $('#dr-add-more').hidden = !name;
    if (!name) { $('#dr-dup').hidden = true; return; }
    // 先用自己記過的，沒有再用參考重量表
    var same = drawerItems().find(function (m) { return norm(m.name) === norm(name); });
    var ref = same ? null : App.findRef(name);
    var src = same || ref;
    if (src) {
      $('#dr-add-weight').value = Math.round((src.weight || 0) * 1000);
      if (cats().indexOf(src.category) >= 0) $('#dr-add-cat').value = src.category;
      var u = same ? (same.countUnit || same.unit) : ref.unit;
      if (u && UNITS.indexOf(u) >= 0) $('#dr-add-unit').value = u;
      fromRef = !same || !!same.estimated;
      $('#dr-add-approx').hidden = !fromRef;
    } else {
      $('#dr-add-approx').hidden = true;
      fromRef = false;
    }
    checkDup();
  });
  $('#dr-add-weight').addEventListener('input', function () { fromRef = false; $('#dr-add-approx').hidden = true; });

  // 同一個家已經有同名物品
  function dupItem() {
    var name = $('#dr-name').value.trim();
    if (!name) return null;
    return drawerItems().find(function (m) {
      var loc = App.locOf(m);
      return norm(m.name) === norm(name) && (loc.state === 'home' || loc.state === 'pending') && loc.home === addHome;
    }) || null;
  }

  function checkDup() {
    var d = dupItem();
    $('#dr-dup').hidden = !d;
    if (d) {
      $('#dr-dup-text').textContent = '⚠️ ' + addHome + '這個家已經有「' + d.name + '」了' +
        (d.count != null ? '（目前 ' + d.count + ' ' + (d.countUnit || '個') + '）' : d.stock ? '（' + STOCK.find(function (x) { return x[0] === d.stock; })[1] + '）' : '');
      $('#dr-dup-plus').hidden = d.count == null;
    }
  }

  function plusOne() {
    var d = dupItem();
    if (!d) return;
    var add = Math.max(1, parseInt($('#dr-add-qty').value, 10) || 1);
    d.count = (d.count || 0) + add;
    App.save();
    App.toast(d.name + '：數量加 ' + add + '，現在 ' + d.count + ' ' + (d.countUnit || '個'));
    resetAdd();
    render();
  }

  function resetAdd() {
    $('#dr-name').value = '';
    $('#dr-add-weight').value = '';
    $('#dr-add-qty').value = '';
    $('#dr-add-more').hidden = true;
    $('#dr-dup').hidden = true;
    $('#dr-add-approx').hidden = true;
  }

  $('#dr-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#dr-name').value.trim();
    if (!name) { App.toast('請輸入名稱'); return; }
    if (!addHome) { App.toast('請先到首頁或衣櫃新增一個家'); return; }
    if (dupItem() && !confirm(addHome + '這個家已經有「' + name + '」了，還是要再新增一筆嗎？')) return;
    var g = parseFloat($('#dr-add-weight').value);
    var ref = App.findRef(name);
    var qty = parseInt($('#dr-add-qty').value, 10);
    var today = App.todayStr();
    var m = App.normalizeEntry({
      name: name,
      weight: isFinite(g) && g >= 0 ? g / 1000 : (ref ? ref.weight : 0.1),
      unit: $('#dr-add-unit').value || '個',
      category: $('#dr-add-cat').value,
      bagId: st().bags[0] && st().bags[0].id,
      uses: 0,
      estimated: fromRef || !(isFinite(g) && g >= 0),
      home: addHome,
      count: isFinite(qty) && $('#dr-add-qty').value !== '' ? qty : null,
      countUnit: $('#dr-add-unit').value || '個',
      stock: isFinite(qty) && $('#dr-add-qty').value !== '' ? '' : 'have',
      drawer: true,
      location: { state: 'home', home: addHome, since: today },
      moves: [{ home: addHome, date: today }]
    });
    st().memory.push(m);
    App.save();
    App.toast('已放進' + addHome + '的抽屜：' + name);
    resetAdd();
    render();
    $('#dr-name').focus();
  });

  // ---------- 詳細頁 ----------
  var cur = null;

  function openDetail(id) {
    cur = App.entryById(id);
    if (!cur) return;
    $('#drd-name').value = cur.name;
    $('#drd-cat').innerHTML = cats().map(function (c) { return '<option' + (c === cur.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    $('#drd-weight').value = Math.round((cur.weight || 0) * 1000);
    $('#drd-bag').innerHTML = App.bagOptions();
    renderDetail();
    $('#dr-sheet').hidden = false;
    $('#dr-sheet .org-panel').scrollTop = 0;
  }

  function renderDetail() {
    var m = cur, loc = App.locOf(m);
    var counting = m.count != null;
    $('#drd-mode').innerHTML = '<button type="button" class="' + (counting ? 'on' : '') + '" data-drd-mode="count">記數量</button>' +
      '<button type="button" class="' + (!counting ? 'on' : '') + '" data-drd-mode="stock">有／快用完／沒了</button>';
    $('#drd-count-wrap').hidden = !counting;
    $('#drd-count').textContent = counting ? m.count : '';
    $('#drd-unit').innerHTML = UNITS.concat((m.countUnit && UNITS.indexOf(m.countUnit) < 0) ? [m.countUnit] : []).map(function (u) {
      return '<button type="button" class="chip' + ((m.countUnit || '個') === u ? ' on' : '') + '" data-drd-unit="' + esc(u) + '">' + esc(u) + '</button>';
    }).join('');
    $('#drd-stock').hidden = counting;
    $('#drd-stock').innerHTML = STOCK.map(function (x) {
      return '<button type="button" class="' + ((m.stock || 'have') === x[0] ? 'on ' + x[0] : '') + '" data-drd-stock="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var bag = loc.bagId && App.bagById(loc.bagId);
    $('#drd-loc').textContent = App.locText(loc) + (bag && loc.state !== 'home' ? '・' + bag.name : '');
    $('#drd-moves').textContent = App.movesText(m) || '還沒有移動紀錄';
    var here = loc.state === 'home' || loc.state === 'pending' ? loc.home : '';
    $('#drd-homes').innerHTML = App.homes().filter(function (h) { return h !== here || loc.state === 'pending'; }).map(function (h) {
      return '<button type="button" class="chip" data-drd-home="' + esc(h) + '">' + (loc.state === 'none' ? '放在 ' : '移到 ') + esc(h) + '</button>';
    }).join('');
    var packed = !!App.packedItem(m);
    $('#drd-bag').hidden = packed;
    $('#drd-pack').textContent = packed ? '從行李拿出來' : '放進行李';
    $('#drd-pack').classList.toggle('out', packed);
  }

  function saveFields() {
    var name = $('#drd-name').value.trim();
    if (name) cur.name = name;
    cur.category = $('#drd-cat').value;
    var g = parseFloat($('#drd-weight').value);
    if (isFinite(g) && g >= 0 && Math.round((cur.weight || 0) * 1000) !== Math.round(g)) { cur.weight = g / 1000; cur.estimated = false; }
    cur.updatedAt = Date.now();
    // 已在行李裡的話，同步名稱和重量
    st().items.forEach(function (it) { if (it.catalogId === cur.id) { it.name = cur.name; it.weight = cur.weight; } });
    // 從這件挑出來的禮物也一起更新
    (st().gifts || []).forEach(function (g) { if (g.drawerId === cur.id) { g.name = cur.name; g.weight = cur.weight; g.updatedAt = Date.now(); } });
  }

  $('#dr-sheet').addEventListener('click', function (e) {
    var t = e.target, el;
    if (!cur) return;
    if ((el = t.closest('[data-drd-mode]'))) {
      if (el.getAttribute('data-drd-mode') === 'count') { if (cur.count == null) cur.count = cur.stock === 'out' ? 0 : 1; cur.countUnit = cur.countUnit || cur.unit || '個'; }
      else { cur.stock = cur.count === 0 ? 'out' : 'have'; cur.count = null; }
      App.save(); renderDetail(); return;
    }
    if ((el = t.closest('[data-drd-step]'))) { cur.count = Math.max(0, (cur.count || 0) + +el.getAttribute('data-drd-step')); App.save(); renderDetail(); return; }
    if ((el = t.closest('[data-drd-unit]'))) { cur.countUnit = el.getAttribute('data-drd-unit'); App.save(); renderDetail(); return; }
    if ((el = t.closest('[data-drd-stock]'))) { cur.stock = el.getAttribute('data-drd-stock'); App.save(); renderDetail(); return; }
    if ((el = t.closest('[data-drd-home]'))) {
      var h = el.getAttribute('data-drd-home');
      if (App.packedItem(cur)) {
        if (!confirm('「' + cur.name + '」現在在行李裡。要從行李拿出來，改放在「' + h + '」嗎？')) return;
        st().items = st().items.filter(function (it) { return it.catalogId !== cur.id; });
      }
      App.markHome(cur, h, App.todayStr(), App.locOf(cur).state !== 'none');
      if (!(cur.moves || []).length) cur.moves = [{ home: h, date: App.todayStr() }];
      App.save(); renderDetail(); render();
      App.toast('已放在' + h);
      return;
    }
    if (t.id === 'drd-pack') {
      saveFields();
      if (App.packedItem(cur)) { App.unpackEntry(cur); App.toast('已從行李拿出來'); }
      else {
        var bagId = $('#drd-bag').value;
        App.packEntry(cur, bagId);
        var b = App.bagById(bagId);
        App.toast('已放進' + (b ? b.name : '行李') + '：' + cur.name);
      }
      renderDetail(); render(); return;
    }
    if (t.id === 'drd-delete') {
      if (!confirm('要從抽屜刪除「' + cur.name + '」嗎？\n（已經放進行李的會保留在行李清單裡）')) return;
      var s = st(), m = cur;
      s.memory = s.memory.filter(function (x) { return x !== m; });
      App.save();
      $('#dr-sheet').hidden = true; cur = null;
      App.toast('已刪除'); render(); return;
    }
    if (t.id === 'drd-save') { saveFields(); App.save(); $('#dr-sheet').hidden = true; cur = null; App.toast('已儲存'); render(); return; }
    if (t.id === 'dr-sheet' || t.id === 'drd-close') { saveFields(); App.save(); $('#dr-sheet').hidden = true; cur = null; render(); }
  });

  // ---------- 對外 ----------
  function show() {
    fillOptions();
    render();
  }

  window.Drawer = { show: show };
})();
