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
        connTags(t) +
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
    // 新旅程：出發地預設是「上一趟結束後回到的家」
    var hint = '';
    if (!t) {
      var prev = lastTrip();
      if (prev && endHomeOf(prev)) {
        draft.origin = endHomeOf(prev);
        hint = '依上一趟「' + prev.name + '」結束後回到的家帶入';
      }
    }
    // 還沒設定過「結束後回到哪個家」，就依最後一段的抵達城市猜
    if (draft.endHome == null) draft.endHome = guessEndHome(draft);
    if (!draft.legs.length) draft.legs.push(newLeg(null, draft.origin));
    $('#tf-origin-hint').textContent = hint;
    $('#tf-origin-hint').hidden = !hint;
    $('#tf-title').textContent = t ? '編輯旅程' : '新增旅程';
    $('#tf-name').value = draft.name;
    $('#tf-origin').value = draft.origin;
    $('#tf-delete').hidden = !t;
    renderLegs();
    renderEndHome();
  }

  function guessEndHome(t) {
    var last = t.legs[t.legs.length - 1];
    return (last && homeFor(last.to)) || '';
  }

  function renderEndHome() {
    var homes = App.homes();
    $('#tf-end-home').innerHTML = homes.map(function (h) {
      return '<button type="button" class="chip' + (draft.endHome === h ? ' on' : '') + '" data-end-home="' + esc(h) + '">🏠 ' + esc(h) + '</button>';
    }).join('') + '<button type="button" class="chip' + (!draft.endHome ? ' on' : '') + '" data-end-home="">未定／不回家</button>';
  }

  function numVal(v) {
    if (v === '' || v == null) return '';
    var n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : '';
  }

  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  // 時間欄位：點一下跳出 24 小時制的選擇器（不用打字）
  function timeBtnInner(v) {
    return (v ? '<span class="tv">' + esc(v) + '</span>' : '<span class="tv ph">選擇時間</span>') +
      '<svg class="clock" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  }

  function legHTML(l, i, n) {
    var a = l.allowance || {};
    function input(field, label, attrs, value) {
      if (attrs === 'time') {
        return '<div class="time-field"><span class="time-label">' + label + '</span>' +
          '<button type="button" class="time-btn" data-time-leg="' + i + '" data-time-field="' + field + '">' + timeBtnInner(value) + '</button></div>';
      }
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
      input('date', '起飛日期', 'type="date"', l.date) +
      input('depTime', '起飛時間（當地）', 'time', l.depTime) +
      input('arrDate', '抵達日期 <span class="muted">（同一天可不填）</span>', 'type="date"', l.arrDate) +
      input('arrTime', '抵達時間（當地）', 'time', l.arrTime) +
      input('flightNo', '航班號碼', 'maxlength="12" placeholder="例如：BR211" autocapitalize="characters"', l.flightNo) +
      '<div class="span2">' + input('airline', '航空公司', 'maxlength="30" placeholder="例如：長榮航空"', l.airline) + '</div>' +
      '</div>' +
      '<div class="leg-home" data-home="' + i + '">' + homeBadge(l.to) + '</div>' +
      '<div class="leg-recheck" data-recheck="' + i + '">' + recheckNote(l, i, n) + '</div>' +
      '<div class="field-title">這段的行李額度 <span class="muted small">沒填＝沿用行李額度的設定；填 0＝這段沒有這項</span></div>' +
      '<div class="allow-grid">' +
      input('checked', '托運（公斤）', 'type="number" inputmode="decimal" step="any" min="0" placeholder="例如 23"', a.checked) +
      input('carry', '手提（公斤）', 'type="number" inputmode="decimal" step="any" min="0" placeholder="例如 7"', a.carry) +
      input('personal', '背包／個人物品', 'type="number" inputmode="decimal" step="any" min="0" placeholder="公斤"', a.personal) +
      '</div></div>';
  }

  // ---------- 轉機 ----------
  function pad2(n) { return String(n).padStart(2, '0'); }

  // 這段實際抵達的日期：有填抵達日期就用它；沒填而且抵達時間比起飛時間早，視為隔天抵達
  function arrivalDate(l) {
    if (l.arrDate) return l.arrDate;
    if (l.date && l.arrTime && l.depTime && l.arrTime < l.depTime) return addDays(l.date, 1);
    return l.date;
  }

  function toMinutes(date, time) {
    var p = date.split('-'), t = time.split(':');
    return Date.UTC(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]) / 60000;
  }

  // 抵達到下一段起飛之間的分鐘數（兩個時間都是轉機城市的當地時間，直接相減）
  function layoverMinutes(a, b) {
    var ad = arrivalDate(a);
    if (!ad || !a.arrTime || !b.date || !b.depTime) return null;
    return toMinutes(b.date, b.depTime) - toMinutes(ad, a.arrTime);
  }

  function fmtDuration(min) {
    var d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    return (d ? d + ' 天 ' : '') + (h ? h + ' 小時' : '') + (m ? (h || d ? ' ' : '') + m + ' 分' : '') || '0 分';
  }

  function conn(l) {
    if (!l.connection) l.connection = { baggage: '', mode: '', stayDays: '', note: '' };
    return l.connection;
  }

  function recheckNote(l, i, n) {
    return i < n - 1 && conn(l).baggage === 'recheck'
      ? '<div class="recheck-badge">🧳 行李要領出，可以整理或換東西</div>' : '';
  }

  function connHTML(i) {
    var a = draft.legs[i], b = draft.legs[i + 1];
    var c = conn(a);
    var min = layoverMinutes(a, b);
    var city = a.to || b.from || '轉機點';
    var time;
    if (min == null) time = '<span class="muted">填上這段的抵達時間和下一段的起飛日期、時間，就會自動算出轉機時間</span>';
    else if (min < 0) time = '<span class="conn-warn">⚠️ 下一段起飛比這段抵達還早，請檢查日期和時間</span>';
    else time = '<b>' + (min >= 1440 ? '停留 ' : '轉機 ') + fmtDuration(min) + '</b>' +
      (min > 0 && min < 60 ? ' <span class="conn-warn">時間很趕</span>' : '');
    function opt(key, val, label) {
      return '<button type="button" class="chip' + (c[key] === val ? ' on' : '') + '" data-conn-set="' + i + '" data-k="' + key + '" data-v="' + val + '">' + label + '</button>';
    }
    return '<div class="conn-box" data-conn="' + i + '">' +
      '<div class="conn-head">🔁 在 <b>' + esc(city) + '</b>　' + time + '</div>' +
      '<div class="conn-row"><span class="conn-label">行李</span><div class="chips">' +
      opt('baggage', 'through', '直掛到下一段') + opt('baggage', 'recheck', '需要領出重新託運') + '</div></div>' +
      '<div class="conn-row"><span class="conn-label">轉機方式</span><div class="chips">' +
      opt('mode', 'transit', '不入境，直接轉機') + opt('mode', 'enter', '入境停留') + '</div></div>' +
      (c.mode === 'enter'
        ? '<div class="conn-stay"><label>停留天數<input type="number" inputmode="numeric" min="0" step="1" data-conn-field="stayDays" data-conn-i="' + i + '" value="' + esc(c.stayDays) + '" placeholder="例如 2"></label>' +
          '<label>備註<input maxlength="60" data-conn-field="note" data-conn-i="' + i + '" value="' + esc(c.note) + '" placeholder="例如：去清邁玩、住朋友家"></label></div>'
        : '') +
      (c.baggage === 'recheck' ? '<div class="recheck-badge">🧳 行李要領出，可以整理或換東西</div>' : '') +
      '</div>';
  }

  function refreshConn(i) {
    var n = draft.legs.length;
    [i - 1, i].forEach(function (k) {
      if (k < 0 || k >= n - 1) return;
      var el = $('#tf-legs [data-conn="' + k + '"]');
      if (el) el.outerHTML = connHTML(k);
    });
  }

  // 行程列表的小標籤：每個轉機點「直掛／領出」「轉機／入境」
  function connTags(t) {
    var html = '';
    for (var i = 0; i < t.legs.length - 1; i++) {
      var c = t.legs[i].connection || {};
      if (!c.baggage && !c.mode) continue;
      html += '<span class="conn-tag"><span class="ct-city">' + esc(t.legs[i].to || '轉機') + '</span>' +
        (c.baggage ? '<span class="ct ' + c.baggage + '">' + (c.baggage === 'through' ? '直掛' : '領出') + '</span>' : '') +
        (c.mode ? '<span class="ct ' + c.mode + '">' + (c.mode === 'enter' ? '入境' + (c.stayDays ? ' ' + c.stayDays + ' 天' : '') : '轉機') + '</span>' : '') +
        '</span>';
    }
    return html ? '<div class="conn-tags">' + html + '</div>' : '';
  }

  function renderLegs() {
    var n = draft.legs.length;
    $('#tf-legs').innerHTML = draft.legs.map(function (l, i) {
      return legHTML(l, i, n) + (i < n - 1 ? connHTML(i) : '');
    }).join('');
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
    var ci = el.getAttribute('data-conn-i');
    if (ci != null) {
      var cf = el.getAttribute('data-conn-field');
      conn(draft.legs[+ci])[cf] = cf === 'stayDays' ? numVal(el.value) : el.value.trim();
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
      if (['date', 'depTime', 'arrDate', 'arrTime', 'to', 'from'].indexOf(field) >= 0) refreshConn(+i);
    }
  });

  // 日期選擇器有些瀏覽器只觸發 change
  $('#trip-form').addEventListener('change', function (e) {
    var el = e.target, i = el.getAttribute('data-leg'), field = el.getAttribute('data-field');
    if (i == null) return;
    if (['date', 'arrDate'].indexOf(field) < 0) return;
    draft.legs[+i][field] = el.value.trim();
    refreshConn(+i);
  });

  $('#trip-form').addEventListener('click', function (e) {
    var tb = e.target.closest('[data-time-leg]');
    if (tb) { openTimePicker(+tb.getAttribute('data-time-leg'), tb.getAttribute('data-time-field')); return; }
    var cs = e.target.closest('[data-conn-set]');
    if (cs) {
      var k = +cs.getAttribute('data-conn-set');
      var c = conn(draft.legs[k]);
      var key = cs.getAttribute('data-k'), val = cs.getAttribute('data-v');
      c[key] = c[key] === val ? '' : val;
      $('#tf-legs [data-conn="' + k + '"]').outerHTML = connHTML(k);
      var rc = $('#tf-legs [data-recheck="' + k + '"]');
      if (rc) rc.innerHTML = recheckNote(draft.legs[k], k, draft.legs.length);
      return;
    }
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

  $('#tf-end-home').addEventListener('click', function (e) {
    var c = e.target.closest('[data-end-home]');
    if (!c) return;
    draft.endHome = c.getAttribute('data-end-home');
    renderEndHome();
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

  // ---------- 24 小時制時間選擇器 ----------
  var tp = { leg: -1, field: '', h: null, m: null };
  var HOURS = [], MINS = [];
  for (var hh = 0; hh < 24; hh++) HOURS.push(pad2(hh));
  for (var mm = 0; mm < 60; mm += 5) MINS.push(pad2(mm));

  function openTimePicker(i, field) {
    var l = draft.legs[i];
    var v = TIME_RE.test(l[field] || '') ? l[field] : '';
    tp = { leg: i, field: field, h: v ? v.slice(0, 2) : null, m: v ? v.slice(3) : null };
    $('#time-sheet-title').textContent = '第 ' + (i + 1) + ' 段・' + (field === 'depTime' ? '起飛時間' : '抵達時間') +
      '（' + ((field === 'depTime' ? l.from : l.to) || '當地') + '時間）';
    renderTimePicker();
    $('#time-sheet').hidden = false;
    // 把選到的時間捲到中間；還沒選就從 08 點附近開始
    ['#tp-hours', '#tp-mins'].forEach(function (sel) {
      var list = $(sel);
      var on = list.querySelector('.on') || (sel === '#tp-hours' ? list.children[8] : list.children[0]);
      if (on) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2;
    });
  }

  function renderTimePicker() {
    // 原本存的分鐘不是 5 的倍數（例如 04:12）也保留在清單裡
    var mins = MINS.slice();
    if (tp.m && mins.indexOf(tp.m) < 0) { mins.push(tp.m); mins.sort(); }
    $('#tp-hours').innerHTML = HOURS.map(function (h) {
      return '<button type="button" class="tp-item' + (h === tp.h ? ' on' : '') + '" data-tp-h="' + h + '">' + h + '</button>';
    }).join('');
    $('#tp-mins').innerHTML = mins.map(function (m) {
      return '<button type="button" class="tp-item' + (m === tp.m ? ' on' : '') + '" data-tp-m="' + m + '">' + m + '</button>';
    }).join('');
    $('#tp-preview').textContent = (tp.h || '--') + ':' + (tp.m || (tp.h ? '00' : '--'));
  }

  function setTime(v) {
    var l = draft.legs[tp.leg];
    if (!l) return;
    l[tp.field] = v;
    var btn = $('#tf-legs [data-time-leg="' + tp.leg + '"][data-time-field="' + tp.field + '"]');
    if (btn) btn.innerHTML = timeBtnInner(v);
    refreshConn(tp.leg);
  }

  function closeTimePicker() { $('#time-sheet').hidden = true; }

  $('#time-sheet').addEventListener('click', function (e) {
    var t = e.target;
    var h = t.closest('[data-tp-h]'), m = t.closest('[data-tp-m]');
    if (h) { tp.h = h.getAttribute('data-tp-h'); markOn('#tp-hours', h); return; }
    if (m) { tp.m = m.getAttribute('data-tp-m'); markOn('#tp-mins', m); return; }
    if (t.id === 'tp-ok') {
      if (!tp.h) { App.toast('請先選小時'); return; }
      setTime(tp.h + ':' + (tp.m || '00'));
      closeTimePicker();
      return;
    }
    if (t.id === 'tp-clear') { setTime(''); closeTimePicker(); return; }
    if (t.id === 'time-sheet' || t.id === 'tp-cancel') closeTimePicker();
  });

  function markOn(sel, el) {
    $(sel).querySelectorAll('.on').forEach(function (x) { x.classList.remove('on'); });
    el.classList.add('on');
    $('#tp-preview').textContent = (tp.h || '--') + ':' + (tp.m || (tp.h ? '00' : '--'));
  }

  // ---------- 行事曆：日期計算 ----------
  function parseD(d) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ymd(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) { // b - a（天）
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }
  function addDays(d, n) { var dt = parseD(d); dt.setDate(dt.getDate() + n); return ymd(dt); }

  function endHomeOf(t) { return t.endHome != null ? t.endHome : guessEndHome(t); }

  // 有日期的旅程，依出發日排序，附上起訖日
  function datedTrips() {
    return st().trips.map(function (t) {
      var d = t.legs.map(function (l) { return l.date; }).filter(Boolean).sort();
      return d.length ? { trip: t, start: d[0], end: d[d.length - 1] } : null;
    }).filter(Boolean).sort(function (a, b) { return a.start.localeCompare(b.start) || a.end.localeCompare(b.end); });
  }

  // 最後結束的那一趟（新增旅程時用來預設出發地）
  function lastTrip() {
    var list = datedTrips();
    if (!list.length) return null;
    return list.reduce(function (a, b) { return b.end >= a.end ? b : a; }).trip;
  }

  // 兩趟旅程之間的空檔：在哪個家、待幾天
  function gaps(list) {
    var out = [];
    for (var i = 0; i < list.length - 1; i++) {
      var a = list[i], b = list[i + 1];
      var days = daysBetween(a.end, b.start);
      if (days <= 0) continue;
      out.push({ after: a, before: b, from: a.end, to: b.start, days: days,
        home: endHomeOf(a.trip) || homeFor(b.trip.origin) || '' });
    }
    return out;
  }

  // 某一天的狀態：在旅程中（{ trip }）或待在哪個家（{ home }）
  function dayInfo(d, list) {
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (d >= x.start && d <= x.end) {
        return { trip: x.trip, idx: i, flight: x.trip.legs.some(function (l) { return l.date === d; }),
          first: d === x.start, last: d === x.end };
      }
    }
    var prev = null, next = null;
    list.forEach(function (x) {
      if (x.end < d && (!prev || x.end > prev.end)) prev = x;
      if (x.start > d && (!next || x.start < next.start)) next = x;
    });
    // 第一趟之前：只推測今天以後（應該就在下一趟的出發地），過去沒有資料就不顯示
    var home = prev ? endHomeOf(prev.trip) : (next && d >= ymd(new Date()) ? homeFor(next.trip.origin) : '');
    return { home: home || '' };
  }

  var TRIP_COLORS = ['#2563eb', '#db2777', '#0891b2', '#ea580c', '#7c3aed', '#059669', '#ca8a04'];
  var HOME_COLORS = ['#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  function tripColor(i) { return TRIP_COLORS[i % TRIP_COLORS.length]; }
  function homeColor(h) {
    var i = App.homes().indexOf(h);
    return i < 0 ? '#cbd5e1' : HOME_COLORS[i % HOME_COLORS.length];
  }

  function homeLegend() {
    return '<div class="cal-legend">' + App.homes().map(function (h) {
      return '<span><i style="background:' + homeColor(h) + '"></i>在' + esc(h) + '</span>';
    }).join('') + '<span><i class="trip-dot"></i>旅程中</span></div>';
  }

  // ---------- 檢視切換 ----------
  var viewMode = 'list';
  var monthCursor = null;   // 'YYYY-MM'
  var yearCursor = null;

  function renderMode() {
    document.querySelectorAll('#trip-mode [data-mode]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === viewMode);
    });
    $('#trip-view-list').hidden = viewMode !== 'list';
    $('#trip-view-month').hidden = viewMode !== 'month';
    $('#trip-view-year').hidden = viewMode !== 'year';
    if (viewMode === 'list') renderList();
    if (viewMode === 'month') renderMonth();
    if (viewMode === 'year') renderYear();
  }

  $('#trip-mode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    viewMode = b.getAttribute('data-mode');
    try { localStorage.setItem('luggage-trip-view', viewMode); } catch (err) { /* 不影響使用 */ }
    renderMode();
  });

  // ---------- 月曆 ----------
  function renderMonth() {
    var list = datedTrips();
    if (!monthCursor) {
      var n = App.nextLeg();
      monthCursor = (n ? n.leg.date : ymd(new Date())).slice(0, 7);
    }
    var y = +monthCursor.slice(0, 4), m = +monthCursor.slice(5, 7);
    $('#cal-month-title').textContent = y + ' 年 ' + m + ' 月';
    var first = new Date(y, m - 1, 1);
    var daysIn = new Date(y, m, 0).getDate();
    var today = ymd(new Date());
    var cells = '';
    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (w) { cells += '<div class="cal-wd">' + w + '</div>'; });
    for (var k = 0; k < first.getDay(); k++) cells += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= daysIn; d++) {
      var ds = ymd(new Date(y, m - 1, d));
      var info = dayInfo(ds, list);
      var inner = '<span class="cal-num' + (ds === today ? ' today' : '') + '">' + d + '</span>';
      if (info.trip) {
        var dow = new Date(y, m - 1, d).getDay();
        var showName = info.first || d === 1 || dow === 0;
        inner += '<span class="cal-bar' + (info.first ? ' first' : '') + (info.last ? ' last' : '') + '" style="background:' + tripColor(info.idx) + '">' +
          '<span class="nm">' + (info.flight ? '✈️' : '') + (showName ? esc(info.trip.name) : '&nbsp;') + '</span></span>';
        cells += '<a class="cal-cell in-trip" href="#trips/' + encodeURIComponent(info.trip.id) + '" title="' + esc(info.trip.name) + '">' + inner + '</a>';
      } else {
        if (info.home) inner += '<span class="cal-home"><i style="background:' + homeColor(info.home) + '"></i>' + esc(info.home) + '</span>';
        cells += '<div class="cal-cell">' + inner + '</div>';
      }
    }
    $('#cal-month-grid').innerHTML = cells;
    $('#cal-month-legend').innerHTML = list.length ? homeLegend() :
      '<p class="muted small center">還沒有排日期的旅程。新增旅程並填上航班日期，就會顯示在月曆上。</p>';
  }

  $('#cal-month-prev').addEventListener('click', function () { shiftMonth(-1); });
  $('#cal-month-next').addEventListener('click', function () { shiftMonth(1); });
  function shiftMonth(n) {
    var y = +monthCursor.slice(0, 4), m = +monthCursor.slice(5, 7) - 1 + n;
    var dt = new Date(y, m, 1);
    monthCursor = ymd(dt).slice(0, 7);
    renderMonth();
  }

  // ---------- 一整年的時間軸 ----------
  function renderYear() {
    var list = datedTrips();
    if (!yearCursor) {
      var n = App.nextLeg();
      yearCursor = +(n ? n.leg.date : ymd(new Date())).slice(0, 4);
    }
    var y = yearCursor;
    $('#cal-year-title').textContent = y + ' 年';
    var today = ymd(new Date());

    // 上方：12 個月的色條，每一天一格
    var rows = '';
    for (var m = 1; m <= 12; m++) {
      var daysIn = new Date(y, m, 0).getDate();
      var segs = '';
      for (var d = 1; d <= daysIn; d++) {
        var ds = ymd(new Date(y, m - 1, d));
        var info = dayInfo(ds, list);
        var color = info.trip ? tripColor(info.idx) : (info.home ? homeColor(info.home) : '#e5e7eb');
        var title = ds + ' ' + (info.trip ? info.trip.name : info.home ? '在' + info.home : '');
        var cls = 'yd' + (info.trip ? ' trip' : '') + (ds === today ? ' today' : '');
        segs += info.trip
          ? '<a class="' + cls + '" style="background:' + color + '" href="#trips/' + encodeURIComponent(info.trip.id) + '" title="' + esc(title) + '"></a>'
          : '<span class="' + cls + '" style="background:' + color + '" title="' + esc(title) + '"></span>';
      }
      rows += '<div class="year-row"><span class="year-m">' + m + '月</span><div class="year-days">' + segs + '</div></div>';
    }
    $('#cal-year-strip').innerHTML = list.length ? rows + homeLegend() : '';

    // 下方：依時間列出旅程與中間的空檔
    var ys = y + '-01-01', ye = y + '-12-31';
    var inYear = list.filter(function (x) { return x.end >= ys && x.start <= ye; });
    var gapList = gaps(list).filter(function (g) { return g.to >= ys && g.from <= ye; });
    var items = inYear.map(function (x) { return { at: x.start, html: tripItem(x, list.indexOf(x)) }; })
      .concat(gapList.map(function (g) { return { at: g.from + 'z', html: gapItem(g) }; }))
      .sort(function (a, b) { return a.at.localeCompare(b.at); });
    // 這一年最後一趟之後回到哪個家
    var lastInYear = inYear[inYear.length - 1];
    if (lastInYear && !list.some(function (x) { return x.start > lastInYear.end; })) {
      var h = endHomeOf(lastInYear.trip);
      if (h) items.push({ at: 'zz', html: '<div class="tl-gap open"><span class="tl-dot" style="background:' + homeColor(h) + '"></span>' +
        '<div><b>🏠 之後回到' + esc(h) + '</b><div class="muted small">' + fmtDate(addDays(lastInYear.end, 1)) + ' 起</div></div></div>' });
    }
    $('#cal-year-list').innerHTML = items.length ? items.map(function (x) { return x.html; }).join('') :
      '<p class="muted small center">' + y + ' 年還沒有排日期的旅程。</p>';
  }

  function tripItem(x, idx) {
    var cities = [x.trip.origin].concat(x.trip.legs.map(function (l) { return l.to; })).filter(Boolean);
    var days = daysBetween(x.start, x.end) + 1;
    return '<a class="tl-trip" href="#trips/' + encodeURIComponent(x.trip.id) + '" style="border-left-color:' + tripColor(idx) + '">' +
      '<div class="tl-head"><b>' + esc(x.trip.name) + '</b><span class="muted small">' + days + ' 天・編輯 ›</span></div>' +
      '<div class="muted small">' + fmtDate(x.start) + (x.end !== x.start ? ' ～ ' + fmtDate(x.end) : '') + '</div>' +
      '<div class="trip-route">' + cities.map(function (c) {
        return '<span class="city' + (homeFor(c) ? ' is-home' : '') + '">' + (homeFor(c) ? '🏠' : '') + esc(c) + '</span>';
      }).join('<span class="arrow">→</span>') + '</div>' + connTags(x.trip) + '</a>';
  }

  function gapItem(g) {
    var color = g.home ? homeColor(g.home) : '#cbd5e1';
    return '<div class="tl-gap"><span class="tl-dot" style="background:' + color + '"></span><div>' +
      '<b>' + (g.home ? '🏠 在' + esc(g.home) + '待 ' + g.days + ' 天' : '空檔 ' + g.days + ' 天（未設定回到哪個家）') + '</b>' +
      '<div class="muted small">' + fmtDate(g.from) + ' 回來 → ' + fmtDate(g.to) + ' 出發</div></div></div>';
  }

  $('#cal-year-prev').addEventListener('click', function () { yearCursor--; renderYear(); });
  $('#cal-year-next').addEventListener('click', function () { yearCursor++; renderYear(); });

  // ---------- 對外 ----------
  function show(param) {
    var inForm = !!param;
    $('#trip-list-view').hidden = inForm;
    $('#trip-form').hidden = !inForm;
    if (inForm) { openForm(param); return; }
    try {
      var saved = localStorage.getItem('luggage-trip-view');
      if (saved && /^(list|month|year)$/.test(saved)) viewMode = saved;
    } catch (err) { /* 不影響使用 */ }
    renderMode();
  }

  window.Trips = {
    show: show, homeFor: homeFor, homeBadge: homeBadge, fmtDate: fmtDate,
    allowanceText: allowanceText, legRoute: legRoute, endHomeOf: endHomeOf
  };
})();
