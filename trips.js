/*
 * 行程設定：旅程 → 多段航班，每段有自己的行李額度
 *
 * 資料存在 state.trips（格式見 app.js 開頭的說明）
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;

  function st() { return App.state(); }
  function tripById(id) { return st().trips.find(function (t) { return t.id === id; }); }

  // ---------- 城市 → 家 ----------
  // 預設的三個家，常見的城市、機場寫法也認得
  var HOME_ALIASES = {
    '曼谷': ['曼谷', 'bangkok', 'bkk', 'dmk', '素萬那普', '廊曼', '泰國'],
    '台灣': ['台灣', '臺灣', 'taiwan', '台北', '臺北', 'taipei', '桃園', 'taoyuan', '松山', '高雄', 'kaohsiung',
            '台中', '臺中', 'taichung', '台南', '臺南', 'tainan', '花蓮', 'tpe', 'tsa', 'khh', 'rmq', 'tnn'],
    '昆明': ['昆明', 'kunming', 'kmg', '長水', '长水', '雲南', '云南']
  };

  function homeFor(city) {
    var q = App.norm(city || '');
    if (!q) return null;
    var homes = App.homes();
    for (var i = 0; i < homes.length; i++) {
      var h = homes[i];
      var keys = (HOME_ALIASES[h] || []).concat(h).map(App.norm).filter(Boolean);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        // 英文代碼（BKK、TPE）要完全相同，避免誤判
        if (/^[a-z]{3}$/.test(k) ? q === k : (q === k || q.indexOf(k) >= 0)) return h;
      }
    }
    return null;
  }

  function homeBadge(city) {
    var h = homeFor(city);
    return h ? '<div class="home-badge">🏠 ' + esc(h) + '有家：可換行李箱或寄放東西</div>' : '';
  }

  // ---------- 日期 ----------
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function fmtDate(d) {
    if (!d) return '日期未定';
    var p = d.split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return (+p[1]) + '/' + (+p[2]) + '（' + WEEK[dt.getDay()] + '）';
  }

  function kg(v) { return v === '' || v == null ? '未填' : (Math.round(v * 10) / 10) + ' kg'; }

  function allowanceText(a) {
    a = a || {};
    return '托運 ' + kg(a.checked) + '・手提 ' + kg(a.carry) + '・背包 ' + kg(a.personal);
  }

  function legRoute(l) {
    return esc(l.from || '?') + ' → ' + esc(l.to || '?');
  }

  // ---------- 旅程列表 ----------
  function renderList() {
    var next = App.nextLeg();
    var trips = st().trips.slice().sort(function (a, b) {
      return firstDate(a).localeCompare(firstDate(b));
    });
    $('#trip-list').innerHTML = trips.map(function (t) {
      var dates = t.legs.map(function (l) { return l.date; }).filter(Boolean).sort();
      var cities = [t.origin].concat(t.legs.map(function (l) { return l.to; })).filter(Boolean);
      var isNext = next && next.trip === t;
      return '<a class="card trip-card" href="#trips/' + encodeURIComponent(t.id) + '">' +
        '<div class="trip-head"><span class="trip-name">' + esc(t.name) + '</span>' +
        (isNext ? '<span class="next-badge">下一趟</span>' : '') + '</div>' +
        '<div class="muted small">' + (dates.length ? fmtDate(dates[0]) + (dates.length > 1 ? ' ～ ' + fmtDate(dates[dates.length - 1]) : '') : '日期未定') +
        '・' + t.legs.length + ' 段航班</div>' +
        '<div class="trip-route">' + cities.map(function (c) {
          return '<span class="city' + (homeFor(c) ? ' is-home' : '') + '">' + (homeFor(c) ? '🏠' : '') + esc(c) + '</span>';
        }).join('<span class="arrow">→</span>') + '</div>' +
        '</a>';
    }).join('');
    $('#trip-empty').hidden = trips.length > 0;
  }

  function firstDate(t) {
    var d = t.legs.map(function (l) { return l.date; }).filter(Boolean).sort();
    return d[0] || '9999';
  }

  // ---------- 編輯旅程 ----------
  var draft = null;     // 編輯中的旅程（存檔前不影響原本資料）
  var editingId = null;

  function newLeg(prev, from) {
    var a = prev ? prev.allowance : { checked: 23, carry: 7, personal: '' };
    return App.normalizeLeg({
      from: from || '', to: '', date: '', flightNo: '', airline: prev ? prev.airline : '',
      allowance: { checked: a.checked, carry: a.carry, personal: a.personal }
    });
  }

  function openForm(id) {
    var t = id && id !== 'new' ? tripById(id) : null;
    if (id && id !== 'new' && !t) { location.replace('#trips'); return; }
    editingId = t ? t.id : null;
    draft = t ? JSON.parse(JSON.stringify(t)) : App.normalizeTrip({ name: '', origin: '', legs: [] });
    if (!draft.legs.length) draft.legs.push(newLeg(null, draft.origin));
    $('#tf-title').textContent = t ? '編輯旅程' : '新增旅程';
    $('#tf-name').value = draft.name;
    $('#tf-origin').value = draft.origin;
    $('#tf-delete').hidden = !t;
    renderLegs();
  }

  function numVal(v) {
    if (v === '' || v == null) return '';
    var n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : '';
  }

  function legHTML(l, i, n) {
    var a = l.allowance || {};
    function input(field, label, attrs, value) {
      return '<label>' + label + '<input data-leg="' + i + '" data-field="' + field + '" ' + attrs +
        ' value="' + esc(value == null ? '' : value) + '"></label>';
    }
    return '<div class="card leg-card">' +
      '<div class="leg-head"><span class="leg-no">第 ' + (i + 1) + ' 段</span>' +
      '<span class="leg-tools">' +
      '<button type="button" class="icon-btn" data-move="' + i + '" data-dir="-1" aria-label="往上移"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="icon-btn" data-move="' + i + '" data-dir="1" aria-label="往下移"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="icon-btn" data-del-leg="' + i + '" aria-label="刪除這段">🗑</button>' +
      '</span></div>' +
      '<div class="leg-grid">' +
      input('from', '出發城市', 'maxlength="30" placeholder="例如：台北"', l.from) +
      input('to', '抵達城市', 'maxlength="30" placeholder="例如：曼谷"', l.to) +
      input('date', '日期', 'type="date"', l.date) +
      input('flightNo', '航班號碼', 'maxlength="12" placeholder="例如：BR211" autocapitalize="characters"', l.flightNo) +
      '<div class="span2">' + input('airline', '航空公司', 'maxlength="30" placeholder="例如：長榮航空"', l.airline) + '</div>' +
      '</div>' +
      '<div class="leg-home" data-home="' + i + '">' + homeBadge(l.to) + '</div>' +
      '<div class="field-title">這段的行李額度 <span class="muted small">沒填＝沿用行李額度的設定；填 0＝這段沒有這項</span></div>' +
      '<div class="allow-grid">' +
      input('checked', '托運（公斤）', 'type="number" inputmode="decimal" step="any" min="0" placeholder="例如 23"', a.checked) +
      input('carry', '手提（公斤）', 'type="number" inputmode="decimal" step="any" min="0" placeholder="例如 7"', a.carry) +
      input('personal', '背包／個人物品', 'type="number" inputmode="decimal" step="any" min="0" placeholder="公斤"', a.personal) +
      '</div></div>';
  }

  function renderLegs() {
    var n = draft.legs.length;
    $('#tf-legs').innerHTML = draft.legs.map(function (l, i) { return legHTML(l, i, n); }).join('');
    $('#tf-origin-home').innerHTML = homeFor(draft.origin)
      ? '<div class="home-badge">🏠 出發地' + esc(homeFor(draft.origin)) + '有家</div>' : '';
  }

  // 輸入時直接更新草稿（不重畫，避免打字被打斷）
  $('#trip-form').addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'tf-name') { draft.name = el.value; return; }
    if (el.id === 'tf-origin') {
      var old = draft.origin;
      draft.origin = el.value.trim();
      // 第一段的出發城市還沒填（或跟著出發地），就一起帶入
      if (draft.legs[0] && (!draft.legs[0].from || draft.legs[0].from === old)) {
        draft.legs[0].from = draft.origin;
        var f = $('#tf-legs [data-leg="0"][data-field="from"]');
        if (f) f.value = draft.origin;
      }
      $('#tf-origin-home').innerHTML = homeFor(draft.origin)
        ? '<div class="home-badge">🏠 出發地' + esc(homeFor(draft.origin)) + '有家</div>' : '';
      return;
    }
    var i = el.getAttribute('data-leg');
    if (i == null) return;
    var l = draft.legs[+i];
    var field = el.getAttribute('data-field');
    if (['checked', 'carry', 'personal'].indexOf(field) >= 0) {
      l.allowance[field] = numVal(el.value);
    } else {
      l[field] = field === 'flightNo' ? el.value.trim().toUpperCase() : el.value.trim();
      if (field === 'to') $('#tf-legs [data-home="' + i + '"]').innerHTML = homeBadge(l.to);
    }
  });

  $('#trip-form').addEventListener('click', function (e) {
    var mv = e.target.closest('[data-move]');
    if (mv) {
      var i = +mv.getAttribute('data-move'), j = i + +mv.getAttribute('data-dir');
      if (j < 0 || j >= draft.legs.length) return;
      var tmp = draft.legs[i]; draft.legs[i] = draft.legs[j]; draft.legs[j] = tmp;
      renderLegs();
      return;
    }
    var del = e.target.closest('[data-del-leg]');
    if (del) {
      var k = +del.getAttribute('data-del-leg');
      var l = draft.legs[k];
      if ((l.from || l.to || l.date || l.flightNo) && !confirm('要刪除第 ' + (k + 1) + ' 段（' + (l.from || '?') + ' → ' + (l.to || '?') + '）嗎？')) return;
      draft.legs.splice(k, 1);
      renderLegs();
      return;
    }
  });

  $('#tf-add-leg').addEventListener('click', function () {
    var prev = draft.legs[draft.legs.length - 1];
    draft.legs.push(newLeg(prev, prev ? prev.to : draft.origin));
    renderLegs();
    var cards = document.querySelectorAll('#tf-legs .leg-card');
    var last = cards[cards.length - 1];
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#trip-form').addEventListener('submit', function (e) {
    e.preventDefault();
    draft.name = $('#tf-name').value.trim();
    draft.origin = $('#tf-origin').value.trim();
    if (!draft.name) { App.toast('請輸入旅程名稱'); $('#tf-name').focus(); return; }
    // 完全空白的航班段不存
    draft.legs = draft.legs.filter(function (l) { return l.from || l.to || l.date || l.flightNo || l.airline; });
    draft.updatedAt = Date.now();
    var s = st();
    if (editingId) {
      var idx = s.trips.findIndex(function (t) { return t.id === editingId; });
      if (idx >= 0) s.trips[idx] = draft; else s.trips.push(draft);
    } else {
      s.trips.push(draft);
    }
    App.save();
    App.toast(editingId ? '已儲存旅程' : '已新增旅程');
    location.hash = '#trips';
  });

  $('#tf-delete').addEventListener('click', function () {
    var t = tripById(editingId);
    if (!t || !confirm('要刪除旅程「' + t.name + '」嗎？所有航班段都會一起刪除。')) return;
    var s = st();
    s.trips = s.trips.filter(function (x) { return x !== t; });
    App.save();
    App.toast('已刪除旅程');
    location.hash = '#trips';
  });

  // ---------- 對外 ----------
  function show(param) {
    var inForm = !!param;
    $('#trip-list-view').hidden = inForm;
    $('#trip-form').hidden = !inForm;
    if (inForm) openForm(param); else renderList();
  }

  window.Trips = {
    show: show, homeFor: homeFor, homeBadge: homeBadge, fmtDate: fmtDate,
    allowanceText: allowanceText, legRoute: legRoute
  };
})();
