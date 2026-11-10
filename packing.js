/*
 * 打包清單：選一趟旅程 → 自動產生要帶的清單，分成手提、托運、背包三區
 *
 * 資料存在 state.packLists（每趟旅程一份，id＝旅程 id）：
 *   { id, zones: { carry: { on, bagId }, checked: {…}, personal: {…} },
 *     seasons[], activities[], entries[], createdAt, updatedAt }
 *   entries：{ id, key, catalogId, name, weight(每單位 kg), qty, unit, category,
 *              zone(carry／checked／personal), status(take 要帶／home 家裡已有／removed 已刪除),
 *              checked(已收好), itemId(打勾後對應首頁行李清單 state.items 的 id), carryOnly, source }
 *
 * 行李箱本身用 state.bags（{ id, name, kind, limit, tare }），每一區對應一個行李箱；
 * 之後做完整的行李箱設定頁時，直接在 state.bags 上加欄位（品牌、尺寸、照片…）即可。
 *
 * 打勾＝真的放進行李：會在 state.items 加一筆，衣物的位置同時變成「在行李裡」。
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;
  var norm = App.norm;

  var ZONES = [['carry', '手提', '手提行李', 7], ['checked', '托運', '托運行李', 23], ['personal', '背包', '背包', 5]];
  function zoneName(z) { return (ZONES.find(function (x) { return x[0] === z; }) || [, ''])[1]; }

  // 每趟都要提醒的東西
  var MUST = [
    { key: '護照', kw: ['護照', 'passport'] },
    { key: '錢包', kw: ['錢包', '皮夾'] },
    { key: '充電線', kw: ['充電線', '傳輸線', '充電器'] }
  ];
  // 只能手提（不能託運或不該託運）
  var CARRY_ONLY = ['護照', '簽證', '證件', '現金', '錢包', '皮夾', '信用卡', '行動電源', '行充', '充電寶', '筆電', '電腦',
    'macbook', 'laptop', '手機', 'iphone', 'ipad', '平板', '相機', '鑰匙', '藥'];
  // 當地容易買到
  var EASY_BUY = ['牙刷', '牙膏', '洗髮', '潤髮', '沐浴', '洗面', '毛巾', '雨傘', '零食', '泡麵', '口罩', '面膜', '防曬',
    '分裝瓶', '拖鞋', '刮鬍刀', '乳液', '餅乾', '襪子', '衛生紙', '濕紙巾'];
  // 活動：kw 用來比對物品名稱，uses 對應鞋子的「用途」，styles 對應衣服的「風格」
  var ACTS = [
    { name: '騎馬', kw: ['騎馬', '馬術', '馬靴', '馬褲', '頭盔'], uses: ['騎馬'] },
    { name: '網球', kw: ['網球', '球拍'], uses: ['網球'] },
    { name: '游泳', kw: ['泳', '蛙鏡'], uses: [] },
    { name: '登山健行', kw: ['登山', '健行'], uses: ['登山'] },
    { name: '跑步', kw: ['跑步', '跑鞋', '慢跑'], uses: ['跑步'] },
    { name: '正式場合', kw: ['西裝', '領帶', '禮服'], uses: ['正式'], styles: ['正式'] },
    { name: '雨天', kw: ['雨衣', '雨靴', '雨鞋'], uses: ['雨天'] }
  ];
  var SEASONS = ['春', '夏', '秋', '冬'];
  var TROPICAL = ['曼谷', 'bangkok', 'bkk', '泰國', '普吉', '清邁', '新加坡', 'singapore', '吉隆坡', '峇里', '巴里', '胡志明',
    '馬尼拉', '宿霧', '雅加達', '金邊', '關島', '夏威夷', '杜拜'];
  var SOUTH = ['雪梨', '悉尼', '墨爾本', '布里斯本', '伯斯', '澳洲', '紐西蘭', '奧克蘭', '基督城', '皇后鎮', '開普敦', '布宜諾斯'];

  function st() { return App.state(); }
  function has(text, list) { var q = norm(text); return list.some(function (k) { return q.indexOf(norm(k)) >= 0; }); }
  function fmt(n) { var r = Math.round(n * 10) / 10; return (Object.is(r, -0) ? 0 : r).toFixed(1); }
  function level(remain, limit) { return remain < 0 ? 'bad' : (limit > 0 && remain / limit < 0.2 ? 'warn' : 'ok'); }
  function touch(list) { list.updatedAt = Date.now(); }

  // ---------- 旅程資訊 ----------
  function tripById(id) { return st().trips.find(function (t) { return t.id === id; }); }

  function seasonOf(city, date) {
    if (has(city || '', TROPICAL)) return '夏';
    var m = date ? +date.split('-')[1] : new Date().getMonth() + 1;
    var s = m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬';
    if (has(city || '', SOUTH)) s = { '春': '秋', '夏': '冬', '秋': '春', '冬': '夏' }[s];
    return s;
  }

  function tripSeasons(t) {
    var out = [];
    var end = window.Trips.endHomeOf(t);
    t.legs.forEach(function (l, i) {
      // 最後一段是回家，不算目的地
      if (i === t.legs.length - 1 && t.legs.length > 1 && end && window.Trips.homeFor(l.to) === end) return;
      var s = seasonOf(l.to, l.date);
      if (out.indexOf(s) < 0) out.push(s);
    });
    return out.length ? out : [seasonOf(t.origin, '')];
  }

  function guessActs(t) {
    var text = t.name + ' ' + t.legs.map(function (l) { return (l.connection || {}).note || ''; }).join(' ');
    return ACTS.filter(function (a) { return has(text, [a.name].concat(a.kw)); }).map(function (a) { return a.name; });
  }

  // 途經、目的地有哪些家（不含出發的家）
  function routeHomes(t) {
    var T = window.Trips, out = [];
    var origin = T.homeFor(t.origin);
    t.legs.forEach(function (l, i) {
      var h = (l.connection || {}).mode === 'transit' && i < t.legs.length - 1 ? null : T.homeFor(l.to);
      if (h && h !== origin && out.indexOf(h) < 0) out.push(h);
    });
    var end = T.endHomeOf(t);
    if (end && end !== origin && out.indexOf(end) < 0) out.push(end);
    return { origin: origin, homes: out };
  }

  // 這趟用哪一段的額度：這趟旅程接下來最近的一段（都過了就用第一段）
  function legFor(t) {
    var today = App.todayStr();
    var up = t.legs.filter(function (l) { return l.date && l.date >= today; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    return up[0] || t.legs[0] || null;
  }

  // ---------- 清單 ----------
  function lists() { return st().packLists; }
  function listFor(tripId) { return lists().find(function (l) { return l.id === tripId; }); }

  // 這類行李箱：出發地那個家的排前面
  function bagsOfKind(kind, originHome) {
    return st().bags.filter(function (b) { return b.kind === kind; }).sort(function (a, b) {
      return (b.home === originHome ? 1 : 0) - (a.home === originHome ? 1 : 0);
    });
  }
  function originOf(list) {
    var t = tripById(list.id);
    return t && window.Trips ? window.Trips.homeFor(t.origin) : '';
  }
  function firstBag(kind, originHome) { return bagsOfKind(kind, originHome)[0]; }

  function ensureList(t) {
    var list = listFor(t.id);
    if (list) return list;
    var zones = {};
    var origin = window.Trips ? window.Trips.homeFor(t.origin) : '';
    ZONES.forEach(function (z) {
      var b = firstBag(z[0], origin);
      zones[z[0]] = { on: !!b, bagId: b ? b.id : null };
    });
    if (!ZONES.some(function (z) { return zones[z[0]].on; })) setZone({ id: t.id, zones: zones }, 'carry', true);
    list = { id: t.id, zones: zones, seasons: tripSeasons(t), activities: guessActs(t), entries: [], createdAt: Date.now(), updatedAt: Date.now() };
    lists().push(list);
    generate(list, t);
    App.save();
    return list;
  }

  function setZone(list, z, on) {
    var cfg = list.zones[z];
    if (on && !(cfg.bagId && App.bagById(cfg.bagId))) {
      var origin = originOf(list);
      var b = firstBag(z, origin);
      if (!b) {
        var def = ZONES.find(function (x) { return x[0] === z; });
        b = App.normalizeBag({ id: App.uid(), name: def[2], kind: z, limit: def[3], tare: 0, home: origin || '' });
        st().bags.push(b);
      }
      cfg.bagId = b.id;
    }
    cfg.on = on;
  }

  function activeZones(list) {
    return ZONES.map(function (z) { return z[0]; }).filter(function (z) {
      var c = list.zones[z];
      return c && c.on && c.bagId && App.bagById(c.bagId);
    });
  }

  function defaultZone(list, e) {
    var act = activeZones(list);
    var order = e.carryOnly ? ['carry', 'personal', 'checked']
      : e.category === '電線電器' ? ['carry', 'personal', 'checked'] : ['checked', 'carry', 'personal'];
    return order.find(function (z) { return act.indexOf(z) >= 0; }) || act[0] || 'carry';
  }

  function zoneOfBag(list, bagId) {
    var act = activeZones(list);
    var z = act.find(function (k) { return list.zones[k].bagId === bagId; });
    if (z) return z;
    var b = App.bagById(bagId);
    return b && act.indexOf(b.kind) >= 0 ? b.kind : null;
  }

  function mkEntry(o) {
    return Object.assign({
      id: App.uid(), key: '', catalogId: null, name: '', weight: 0, qty: 1, unit: '個', category: '必備品',
      zone: 'carry', status: 'take', checked: false, itemId: null, carryOnly: false, source: 'auto'
    }, o);
  }

  function fromCatalog(m, source) {
    return mkEntry({
      key: 'c:' + m.id, catalogId: m.id, name: m.name, weight: m.weight || 0, unit: m.unit || '個',
      category: m.category || '必備品', carryOnly: has(m.name, CARRY_ONLY), source: source || 'auto'
    });
  }

  // 衣物適不適合這趟（季節、活動）
  function clothFits(m, list) {
    var c = m.clothing;
    var sel = ACTS.filter(function (a) { return list.activities.indexOf(a.name) >= 0; });
    var unsel = ACTS.filter(function (a) { return list.activities.indexOf(a.name) < 0; });
    if (sel.some(function (a) { return has(m.name, a.kw); })) return true;          // 這趟活動的裝備
    if (unsel.some(function (a) { return has(m.name, a.kw); })) return false;       // 別的活動的裝備
    var uses = c.uses || [];
    var special = ['騎馬', '網球', '登山', '跑步', '雨天'];
    var selUses = [].concat.apply([], sel.map(function (a) { return a.uses; }));
    if (uses.length && uses.every(function (u) { return special.indexOf(u) >= 0; }) &&
        !uses.some(function (u) { return selUses.indexOf(u) >= 0; })) return false;  // 專用鞋，這趟沒有那個活動
    if (uses.some(function (u) { return selUses.indexOf(u) >= 0; })) return true;
    var seasons = c.seasons || [];
    return !seasons.length || seasons.some(function (s) { return list.seasons.indexOf(s) >= 0; });
  }

  // 依旅程產生建議（只加上清單裡還沒有的；被刪掉的不會再加回來）
  function generate(list, t) {
    var have = {};
    list.entries.forEach(function (e) { have[e.key] = true; });
    var rh = routeHomes(t);
    var added = 0;
    function add(e) {
      if (have[e.key]) return;
      have[e.key] = true;
      if (e.status === 'take') e.zone = defaultZone(list, e);
      list.entries.push(e);
      added++;
    }
    var sel = ACTS.filter(function (a) { return list.activities.indexOf(a.name) >= 0; });

    st().memory.forEach(function (m) {
      if (App.isCloth(m)) {
        if (!clothFits(m, list)) return;
        var loc = App.locOf(m);
        var e = fromCatalog(m);
        if (loc.state === 'home' && rh.homes.indexOf(loc.home) >= 0) e.status = 'home';   // 目的地的家已經有
        else if (loc.state === 'home' && rh.origin && loc.home !== rh.origin) return;      // 放在別的家，這趟帶不到
        add(e);
      } else if (m.category === '特殊類') {
        if (sel.some(function (a) { return has(m.name, a.kw); })) add(fromCatalog(m));
      } else if ((m.uses || 0) >= 2) {
        add(fromCatalog(m));
      }
    });

    // 每趟必帶：護照、錢包、充電線、睡衣
    MUST.forEach(function (mu) {
      var inList = list.entries.some(function (e) { return e.status !== 'removed' && has(e.name, mu.kw); });
      if (inList || have['must:' + mu.key]) return;
      var m = st().memory.find(function (x) { return !App.isCloth(x) && has(x.name, mu.kw); });
      if (m && !have['c:' + m.id]) { var e = fromCatalog(m, 'must'); add(e); return; }
      if (m) return;
      var ref = App.findRef(mu.key);
      add(mkEntry({ key: 'must:' + mu.key, name: mu.key, weight: ref ? ref.weight : 0.1,
        category: ref ? ref.category : '必備品', carryOnly: has(mu.key, CARRY_ONLY), source: 'must' }));
    });
    var isSleep = function (e) {
      var m = e.catalogId && App.entryById(e.catalogId);
      return (m && m.clothing && m.clothing.group === '睡衣') || e.key === 'must:睡衣';
    };
    if (!list.entries.some(isSleep)) {
      var pj = st().memory.find(function (m) {
        if (!(m.clothing && m.clothing.group === '睡衣')) return false;
        var loc = App.locOf(m);
        return !(loc.state === 'home' && rh.origin && loc.home !== rh.origin);
      });
      if (pj) add(fromCatalog(pj, 'must'));
      else add(mkEntry({ key: 'must:睡衣', name: '睡衣', weight: 0.35, unit: '套', source: 'must' }));
    }
    touch(list);
    return added;
  }

  // 讓清單和首頁的行李清單一致：
  //   行李裡有、清單上沒打勾的 → 打勾；清單上打勾、行李裡已經拿掉的 → 取消打勾
  function reconcile(list) {
    var changed = false;
    var items = st().items;
    var byItem = {};
    // 從行李帶進來的項目（例如禮物、旅途中買的），行李裡沒有了就一起拿掉，不再算成「還沒收」
    list.entries = list.entries.filter(function (e) {
      if (e.checked && e.source === 'bag' && !items.some(function (it) { return it.id === e.itemId; })) { changed = true; return false; }
      return true;
    });
    list.entries.forEach(function (e) {
      if (e.checked && !items.some(function (it) { return it.id === e.itemId; })) {
        e.checked = false; e.itemId = null; changed = true;
      }
      if (e.itemId) byItem[e.itemId] = e;
    });
    items.forEach(function (it) {
      if (byItem[it.id]) {
        var z0 = zoneOfBag(list, it.bagId);
        if (z0 && byItem[it.id].zone !== z0) { byItem[it.id].zone = z0; changed = true; }
        return;
      }
      var z = zoneOfBag(list, it.bagId);
      if (!z) return;   // 放在這趟沒用到的行李箱
      var e = it.catalogId && list.entries.find(function (x) { return x.catalogId === it.catalogId && !x.checked; });
      if (!e) {
        e = mkEntry({ key: it.catalogId ? 'c:' + it.catalogId + ':' + it.id : 'i:' + it.id, catalogId: it.catalogId || null,
          name: it.name, weight: it.weight, qty: it.qty, unit: it.unit, category: it.category,
          carryOnly: has(it.name, CARRY_ONLY), source: 'bag' });
        if (it.giftId) e.giftId = it.giftId;
        if (it.purchaseId) e.purchaseId = it.purchaseId;
        list.entries.push(e);
      }
      e.status = 'take'; e.zone = z; e.checked = true; e.itemId = it.id;
      changed = true;
    });
    if (changed) touch(list);
    return changed;
  }

  // ---------- 打勾、移動、刪除 ----------
  function setChecked(list, e, on) {
    var s = st();
    var m = e.catalogId && App.entryById(e.catalogId);
    if (on && !e.checked) {
      var bagId = list.zones[e.zone].bagId;
      if (m) App.markPacked(m, bagId);
      var it = { id: App.uid(), name: e.name, weight: e.weight, qty: e.qty, unit: e.unit, category: e.category, bagId: bagId, catalogId: e.catalogId || undefined };
      if (e.giftId) it.giftId = e.giftId;
      if (e.purchaseId) it.purchaseId = e.purchaseId;
      s.items.push(it);
      if (m) m.uses = (m.uses || 0) + 1;
      e.checked = true; e.itemId = it.id;
    } else if (!on && e.checked) {
      var id = e.itemId;
      e.checked = false; e.itemId = null;
      s.items = s.items.filter(function (x) { return x.id !== id; });
      if (m) App.restoreHome(m);   // 位置回到原本的家
    }
    touch(list);
  }

  function moveEntry(list, e, z) {
    if (e.zone === z && e.status === 'take') return;
    e.zone = z; e.status = 'take';
    if (e.checked) {
      var bagId = list.zones[z].bagId;
      var it = st().items.find(function (x) { return x.id === e.itemId; });
      if (it) it.bagId = bagId;
      var m = e.catalogId && App.entryById(e.catalogId);
      if (m) App.markPacked(m, bagId);
    }
    touch(list);
  }

  function removeEntry(list, e) {
    if (e.checked) setChecked(list, e, false);
    if (e.source === 'manual' || e.source === 'bag') list.entries = list.entries.filter(function (x) { return x !== e; });
    else e.status = 'removed';   // 建議的項目記成「已刪除」，重新產生時不會再跑出來
    touch(list);
  }

  // ---------- 重量 ----------
  function zoneStats(list, t) {
    var leg = t ? legFor(t) : null;
    return activeZones(list).map(function (z) {
      var bag = App.bagById(list.zones[z].bagId);
      var w = Number(bag.tare) || 0, packed = 0, n = 0;
      list.entries.forEach(function (e) {
        if (e.status !== 'take' || e.zone !== z) return;
        w += e.weight * e.qty; n++;
        if (e.checked) packed++;
      });
      var a = leg && leg.allowance ? leg.allowance[z] : '';
      var limit = a === '' || a == null ? Number(bag.limit) || 0 : Number(a) || 0;
      return { zone: z, bag: bag, weight: w, limit: limit, count: n, packed: packed, level: level(limit - w, limit) };
    });
  }

  // 給首頁用：下一趟旅程的清單上「要帶但還沒收好」的重量（依行李箱）
  function pendingByBag() {
    var next = App.nextLeg();
    var list = next && listFor(next.trip.id);
    var out = {};
    if (!list) return out;
    reconcile(list);
    var act = activeZones(list);
    list.entries.forEach(function (e) {
      if (e.status !== 'take' || e.checked || act.indexOf(e.zone) < 0) return;
      var id = list.zones[e.zone].bagId;
      if (!out[id]) out[id] = { weight: 0, count: 0 };
      out[id].weight += e.weight * e.qty;
      out[id].count++;
    });
    return out;
  }

  // ---------- 畫面 ----------
  var curTrip = null, curList = null;

  function sortedTrips() {
    return st().trips.slice().sort(function (a, b) {
      var da = a.legs.map(function (l) { return l.date; }).filter(Boolean).sort()[0] || '9999';
      var db = b.legs.map(function (l) { return l.date; }).filter(Boolean).sort()[0] || '9999';
      return da.localeCompare(db);
    });
  }

  function show() {
    var trips = sortedTrips();
    $('#pack-empty').hidden = trips.length > 0;
    $('#pack-main').hidden = !trips.length;
    if (!trips.length) return;
    var saved = null;
    try { saved = localStorage.getItem('luggage-pack-trip'); } catch (e) { /* 不影響 */ }
    var next = App.nextLeg();
    var t = tripById(curTrip && curTrip.id) || tripById(saved) || (next && next.trip) || trips[0];
    $('#pack-trip').innerHTML = trips.map(function (x) {
      var d = x.legs.map(function (l) { return l.date; }).filter(Boolean).sort()[0];
      return '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.name) +
        (d ? '（' + window.Trips.fmtDate(d) + '）' : '') + '</option>';
    }).join('');
    open(t);
  }

  function open(t) {
    curTrip = t;
    try { localStorage.setItem('luggage-pack-trip', t.id); } catch (e) { /* 不影響 */ }
    curList = ensureList(t);
    if (reconcile(curList)) App.save();
    render();
  }

  function thumb(e) {
    var m = e.catalogId && App.entryById(e.catalogId);
    return m && m.photoId ? '<img class="org-thumb" data-photo="' + esc(m.photoId) + '" alt="">' : '';
  }

  function rowHTML(e) {
    return '<div class="pk-row' + (e.checked ? ' done' : '') + '" data-e="' + esc(e.id) + '">' +
      '<button type="button" class="pk-check" data-check="' + esc(e.id) + '" aria-label="' + (e.checked ? '取消收好' : '收好了') + '">' + (e.checked ? '✓' : '') + '</button>' +
      thumb(e) +
      '<div class="org-info"><div class="org-name">' + esc(e.name) + (e.qty > 1 ? ' × ' + e.qty : '') + '</div>' +
      '<div class="muted small">' + esc(App.fmtWeight(e.weight * e.qty)) +
      (e.carryOnly ? ' <span class="pk-tag only">只能手提</span>' : '') +
      (e.source === 'must' ? ' <span class="pk-tag must">必帶</span>' : '') + '</div></div>' +
      '<button type="button" class="pk-handle" data-handle="' + esc(e.id) + '" aria-label="拖到別區（點一下可選擇）">⠿</button>' +
      '<button type="button" class="icon-btn" data-remove="' + esc(e.id) + '" aria-label="刪除 ' + esc(e.name) + '">✕</button></div>';
  }

  function render() {
    var list = curList, t = curTrip;
    // 設定：行李
    // 從「我的行李箱」挑：出發地那個家的箱子排前面
    var origin = originOf(list);
    $('#pack-bags').innerHTML = ZONES.map(function (z) {
      var cfg = list.zones[z[0]];
      var bag = cfg.bagId && App.bagById(cfg.bagId);
      var on = cfg.on && !!bag;
      var choices = bagsOfKind(z[0], origin);
      return '<div class="pk-bag' + (on ? ' on' : '') + '">' +
        '<button type="button" class="chip' + (on ? ' on' : '') + '" data-zone-toggle="' + z[0] + '">' + (on ? '✓ ' : '') + z[1] + '</button>' +
        (on ? '<label class="pk-bag-pick">用哪個箱子<select data-zone-bag="' + z[0] + '">' + choices.map(function (b) {
            return '<option value="' + esc(b.id) + '"' + (b.id === bag.id ? ' selected' : '') + '>' + esc(b.name) +
              (b.home ? '（' + esc(b.home) + (b.home === origin ? '・出發地' : '') + '）' : '') + '</option>';
          }).join('') + '</select></label>' +
          '<span class="muted small pk-bag-tare">空箱 ' + fmt(Number(bag.tare) || 0) + ' kg</span>'
          : '<span class="muted small">這趟不用</span>') + '</div>';
    }).join('') + '<a class="link small" href="#bags">管理我的行李箱 ›</a>';
    $('#pack-seasons').innerHTML = SEASONS.map(function (s) {
      return '<button type="button" class="chip' + (list.seasons.indexOf(s) >= 0 ? ' on' : '') + '" data-season="' + s + '">' + s + '</button>';
    }).join('');
    $('#pack-acts').innerHTML = ACTS.map(function (a) {
      return '<button type="button" class="chip' + (list.activities.indexOf(a.name) >= 0 ? ' on' : '') + '" data-act="' + esc(a.name) + '">' + esc(a.name) + '</button>';
    }).join('');

    renderSummary();

    // 三區
    var act = activeZones(list);
    $('#pack-zones').innerHTML = act.map(function (z) {
      var rows = list.entries.filter(function (e) { return e.status === 'take' && e.zone === z; })
        .sort(function (a, b) { return (a.checked ? 1 : 0) - (b.checked ? 1 : 0); });
      var bag = App.bagById(list.zones[z].bagId);
      return '<div class="card pk-zone" data-zone="' + z + '">' +
        '<div class="pk-zone-head"><b>' + zoneName(z) + '</b><span class="muted small">' + esc(bag.name) + '・' + rows.length + ' 件</span></div>' +
        (rows.length ? rows.map(rowHTML).join('') : '<p class="muted small pk-drop-hint">還沒有東西。可以把物品拖到這裡。</p>') + '</div>';
    }).join('');

    var home = list.entries.filter(function (e) { return e.status === 'home'; });
    $('#pack-home-wrap').hidden = !home.length;
    $('#pack-home').innerHTML = home.map(function (e) {
      var m = e.catalogId && App.entryById(e.catalogId);
      var loc = m ? App.locOf(m) : null;
      return '<button type="button" class="pk-row gray" data-take="' + esc(e.id) + '">' + thumb(e) +
        '<span class="org-info"><span class="org-name">' + esc(e.name) + '</span>' +
        '<span class="muted small">' + (loc && loc.home ? esc(loc.home) + '的家已經有' : '家裡已經有') + '・點一下改成要帶</span></span></button>';
    }).join('');
    Photos.fillThumbs($('#view-pack'));
  }

  function renderSummary() {
    var list = curList;
    var take = list.entries.filter(function (e) { return e.status === 'take' && activeZones(list).indexOf(e.zone) >= 0; });
    var done = take.filter(function (e) { return e.checked; }).length;
    var pct = take.length ? Math.round(done / take.length * 100) : 0;
    $('#pack-progress-text').textContent = '已收好 ' + done + '／總共 ' + take.length + ' 件';
    $('#pack-progress-bar').style.width = pct + '%';
    var stats = zoneStats(list, curTrip);
    var total = 0, limit = 0;
    $('#pack-weights').innerHTML = stats.map(function (s) {
      total += s.weight; limit += s.limit;
      var p = s.limit > 0 ? Math.min(100, s.weight / s.limit * 100) : 100;
      return '<div class="pk-w ' + s.level + '"><div class="pk-w-head"><span>' + zoneName(s.zone) + '</span>' +
        '<b>' + fmt(s.weight) + ' / ' + fmt(s.limit) + ' kg</b></div>' +
        '<div class="bar ' + s.level + '"><i style="width:' + p + '%"></i></div>' +
        '<div class="muted small">' + (s.level === 'bad' ? '超重 ' + fmt(s.weight - s.limit) + ' kg' : '還可以放 ' + fmt(s.limit - s.weight) + ' kg') +
        '・含空箱 ' + fmt(Number(s.bag.tare) || 0) + ' kg</div></div>';
    }).join('');
    var lv = level(limit - total, limit);
    $('#pack-total').className = 'pk-total ' + lv;
    $('#pack-total').innerHTML = '總重量 <b>' + fmt(total) + ' kg</b>　／額度 ' + fmt(limit) + ' kg';
    var leg = legFor(curTrip);
    $('#pack-leg-note').textContent = leg ? '額度依這趟的「' + (leg.from || '?') + ' → ' + (leg.to || '?') + '」；重量包含清單上還沒收好的東西' : '';
  }

  function entryById(id) { return curList.entries.find(function (e) { return e.id === id; }); }
  function commit() { App.save(); render(); }

  // ---------- 操作 ----------
  $('#pack-trip').addEventListener('change', function () { var t = tripById(this.value); if (t) open(t); });

  $('#view-pack').addEventListener('click', function (ev) {
    if (!curList) return;
    var t = ev.target, el;
    if ((el = t.closest('[data-check]'))) {
      var e = entryById(el.getAttribute('data-check'));
      setChecked(curList, e, !e.checked);
      commit();
      return;
    }
    if ((el = t.closest('[data-remove]'))) {
      var e2 = entryById(el.getAttribute('data-remove'));
      if (e2.checked && !confirm('「' + e2.name + '」已經收好了，要從清單刪除並從行李拿出來嗎？')) return;
      removeEntry(curList, e2);
      commit();
      return;
    }
    if ((el = t.closest('[data-take]'))) {
      var e3 = entryById(el.getAttribute('data-take'));
      e3.status = 'take'; e3.zone = defaultZone(curList, e3); touch(curList);
      App.toast('已改成要帶：' + e3.name);
      commit();
      return;
    }
    if ((el = t.closest('[data-zone-toggle]'))) {
      var z = el.getAttribute('data-zone-toggle');
      var on = !(curList.zones[z].on && App.bagById(curList.zones[z].bagId));
      if (!on && activeZones(curList).length <= 1) { App.toast('至少要用一個行李'); return; }
      if (!on) {
        // 這區不用了：裡面的東西移到其他區
        curList.zones[z].on = false;
        curList.entries.forEach(function (e) {
          if (e.zone === z && e.status === 'take') moveEntry(curList, e, defaultZone(curList, e));
        });
      } else setZone(curList, z, true);
      touch(curList);
      commit();
      return;
    }
    if ((el = t.closest('[data-season]'))) { toggle(curList.seasons, el.getAttribute('data-season')); touch(curList); commit(); return; }
    if ((el = t.closest('[data-act]'))) { toggle(curList.activities, el.getAttribute('data-act')); touch(curList); commit(); return; }
    if (t.id === 'pack-regen') {
      var n = generate(curList, curTrip);
      App.toast(n ? '新增了 ' + n + ' 項建議' : '沒有新的建議');
      commit();
      return;
    }
    if (t.id === 'pack-add') { openAdd(); return; }
    if (t.id === 'pack-check') { openCheck(); return; }
  });

  function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  // 換成另一個行李箱：已經收好的東西一起搬過去
  $('#pack-bags').addEventListener('change', function (ev) {
    var z = ev.target.getAttribute('data-zone-bag');
    if (!z) return;
    var oldId = curList.zones[z].bagId, newId = ev.target.value;
    if (oldId === newId) return;
    App.moveBagContents(oldId, newId);
    curList.zones[z].bagId = newId;
    touch(curList);
    var b = App.bagById(newId);
    App.toast('這趟的' + zoneName(z) + '改用：' + (b ? b.name : ''));
    commit();
  });

  // ---------- 拖曳到別區（按住 ⠿ 拖；只點一下則跳出選單） ----------
  var drag = null;
  $('#view-pack').addEventListener('pointerdown', function (ev) {
    var h = ev.target.closest('[data-handle]');
    if (!h || !curList) return;
    ev.preventDefault();
    drag = { id: h.getAttribute('data-handle'), x: ev.clientX, y: ev.clientY, moved: false, ghost: null, pid: ev.pointerId, handle: h };
    try { h.setPointerCapture(ev.pointerId); } catch (e) { /* 不支援就算了 */ }
  });
  document.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    if (!drag.moved && Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      var e = entryById(drag.id);
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'pk-ghost';
      drag.ghost.textContent = e ? e.name : '';
      document.body.appendChild(drag.ghost);
      document.body.classList.add('pk-dragging');
    }
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = ev.clientY + 'px';
    if (ev.clientY < 90) window.scrollBy(0, -14);
    else if (ev.clientY > window.innerHeight - 150) window.scrollBy(0, 14);
    var over = zoneAt(ev.clientX, ev.clientY);
    document.querySelectorAll('.pk-zone').forEach(function (z) { z.classList.toggle('over', z === over); });
  });
  function zoneAt(x, y) {
    var el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('.pk-zone') : null;
  }
  function endDrag(ev, cancel) {
    if (!drag || (ev && ev.pointerId !== drag.pid)) return;
    var d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    document.body.classList.remove('pk-dragging');
    document.querySelectorAll('.pk-zone.over').forEach(function (z) { z.classList.remove('over'); });
    if (cancel) return;
    var e = entryById(d.id);
    if (!e) return;
    if (!d.moved) { openMove(e); return; }
    var over = zoneAt(ev.clientX, ev.clientY);
    if (over) tryMove(e, over.getAttribute('data-zone'));
  }
  document.addEventListener('pointerup', function (ev) { endDrag(ev, false); });
  document.addEventListener('pointercancel', function (ev) { endDrag(ev, true); });

  function tryMove(e, z) {
    if (e.zone === z) return;
    if (e.carryOnly && z === 'checked' && !confirm('「' + e.name + '」標記為只能手提，確定要放到托運嗎？')) return;
    moveEntry(curList, e, z);
    App.toast('已移到' + zoneName(z) + '：' + e.name);
    commit();
  }

  var moveTarget = null;
  function openMove(e) {
    moveTarget = e;
    $('#pk-move-title').textContent = '「' + e.name + '」移到哪一區？';
    $('#pk-move-list').innerHTML = activeZones(curList).map(function (z) {
      return '<button type="button" class="btn sheet-bag' + (z === e.zone ? ' cur' : '') + '" data-move-zone="' + z + '">' + zoneName(z) +
        (z === e.zone ? '（目前）' : '') + '</button>';
    }).join('');
    $('#pk-move-sheet').hidden = false;
  }
  $('#pk-move-sheet').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-move-zone]');
    if (b && moveTarget) { var e = moveTarget; $('#pk-move-sheet').hidden = true; moveTarget = null; tryMove(e, b.getAttribute('data-move-zone')); return; }
    if (ev.target.id === 'pk-move-sheet' || ev.target.id === 'pk-move-cancel') { $('#pk-move-sheet').hidden = true; moveTarget = null; }
  });

  // ---------- 手動新增 ----------
  function openAdd() {
    $('#pk-add-name').value = ''; $('#pk-add-weight').value = ''; $('#pk-add-qty').value = 1; $('#pk-add-only').checked = false;
    $('#pk-add-zone').innerHTML = activeZones(curList).map(function (z) { return '<option value="' + z + '">' + zoneName(z) + '</option>'; }).join('');
    var names = [];
    st().memory.forEach(function (m) { if (names.indexOf(m.name) < 0) names.push(m.name); });
    (window.REFERENCE_WEIGHTS || []).forEach(function (r) { if (names.indexOf(r.name) < 0) names.push(r.name); });
    $('#pk-add-names').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    $('#pk-add-sheet').hidden = false;
    setTimeout(function () { $('#pk-add-name').focus(); }, 50);
  }
  var addMatch = null;
  $('#pk-add-name').addEventListener('input', function () {
    var name = this.value.trim();
    addMatch = st().memory.find(function (m) { return norm(m.name) === norm(name); }) || null;
    var ref = addMatch ? null : App.findRef(name);
    var w = addMatch ? addMatch.weight : ref ? ref.weight : null;
    if (w != null) $('#pk-add-weight').value = Math.round(w * 1000);
    var only = has(name, CARRY_ONLY);
    $('#pk-add-only').checked = only;
    if (only && activeZones(curList).indexOf('carry') >= 0) $('#pk-add-zone').value = 'carry';
  });
  $('#pk-add-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = $('#pk-add-name').value.trim();
    if (!name) { App.toast('請輸入名稱'); return; }
    var g = parseFloat($('#pk-add-weight').value);
    var q = Math.max(1, parseInt($('#pk-add-qty').value, 10) || 1);
    var m = addMatch && norm(addMatch.name) === norm(name) ? addMatch : null;
    var ref = App.findRef(name);
    var old = m && curList.entries.find(function (x) { return x.catalogId === m.id && x.status !== 'take'; });
    var e = old || mkEntry({ key: m ? 'c:' + m.id + ':' + App.uid() : 'm:' + App.uid(), catalogId: m ? m.id : null, source: 'manual' });
    e.name = name;
    e.weight = isFinite(g) && g >= 0 ? g / 1000 : (m ? m.weight : ref ? ref.weight : 0);
    e.qty = q;
    e.unit = m ? m.unit || '個' : ref && ref.unit ? ref.unit : '個';
    e.category = m ? m.category : ref ? ref.category : '必備品';
    e.carryOnly = $('#pk-add-only').checked;
    e.zone = $('#pk-add-zone').value;
    e.status = 'take';
    if (!old) curList.entries.push(e);
    touch(curList);
    $('#pk-add-sheet').hidden = true;
    App.toast('已加入' + zoneName(e.zone) + '：' + name);
    commit();
  });
  $('#pk-add-sheet').addEventListener('click', function (ev) {
    if (ev.target.id === 'pk-add-sheet' || ev.target.id === 'pk-add-cancel') $('#pk-add-sheet').hidden = true;
  });

  // ---------- 出發前檢查 ----------
  function openCheck() {
    var list = curList;
    var act = activeZones(list);
    var take = list.entries.filter(function (e) { return e.status === 'take' && act.indexOf(e.zone) >= 0; });
    var todo = take.filter(function (e) { return !e.checked; });
    var inList = {};
    take.forEach(function (e) { if (e.catalogId) inList[e.catalogId] = true; });
    var homeIds = {};
    list.entries.forEach(function (e) { if (e.status === 'home' && e.catalogId) homeIds[e.catalogId] = true; });
    // 常帶（放過 2 次以上）但這次沒在清單上
    var missing = st().memory.filter(function (m) {
      return (m.uses || 0) >= 2 && !inList[m.id] && !homeIds[m.id] && !take.some(function (e) { return norm(e.name) === norm(m.name); });
    });
    var easy = todo.filter(function (e) { return has(e.name, EASY_BUY); });
    var over = zoneStats(list, curTrip).filter(function (s) { return s.level === 'bad'; });

    var html = '';
    if (over.length) html += '<div class="ck-block bad"><b>⚠️ 超重</b>' + over.map(function (s) {
      return '<div>' + zoneName(s.zone) + '超過 ' + fmt(s.weight - s.limit) + ' kg</div>'; }).join('') + '</div>';
    html += '<div class="ck-block"><b>還沒收好（' + todo.length + ' 件）</b>' +
      (todo.length ? todo.map(function (e) {
        return '<div class="ck-row"><span>' + esc(e.name) + ' <span class="muted small">' + zoneName(e.zone) + '</span>' +
          (has(e.name, EASY_BUY) ? ' <span class="pk-tag easy">當地容易買到</span>' : '') + '</span>' +
          '<button type="button" class="link" data-ck-done="' + esc(e.id) + '">收好了</button></div>';
      }).join('') : '<div class="muted small">全部都收好了 🎉</div>') + '</div>';
    html += '<div class="ck-block"><b>常帶但這次沒放進清單（' + missing.length + ' 件）</b>' +
      (missing.length ? missing.map(function (m) {
        return '<div class="ck-row"><span>' + esc(m.name) + '</span><button type="button" class="link" data-ck-add="' + esc(m.id) + '">加入清單</button></div>';
      }).join('') : '<div class="muted small">沒有漏掉常帶的東西</div>') + '</div>';
    if (easy.length) html += '<div class="ck-block"><b>當地容易買到，可以不用帶</b>' + easy.map(function (e) {
      return '<div class="ck-row"><span>' + esc(e.name) + '</span><button type="button" class="link" data-ck-drop="' + esc(e.id) + '">不帶了</button></div>';
    }).join('') + '</div>';
    $('#pk-check-body').innerHTML = html;
    $('#pk-check-sheet').hidden = false;
  }
  $('#pk-check-sheet').addEventListener('click', function (ev) {
    var t = ev.target, id;
    if ((id = t.getAttribute('data-ck-done'))) { setChecked(curList, entryById(id), true); App.save(); render(); openCheck(); return; }
    if ((id = t.getAttribute('data-ck-drop'))) { removeEntry(curList, entryById(id)); App.save(); render(); openCheck(); return; }
    if ((id = t.getAttribute('data-ck-add'))) {
      var m = App.entryById(id);
      var old = curList.entries.find(function (x) { return x.catalogId === id; });
      var e = old || fromCatalog(m, 'manual');
      e.status = 'take'; e.zone = defaultZone(curList, e);
      if (!old) curList.entries.push(e);
      touch(curList); App.save(); render(); openCheck();
      return;
    }
    if (t.id === 'pk-check-sheet' || t.id === 'pk-check-close') $('#pk-check-sheet').hidden = true;
  });

  // ---------- 給首頁「我的行李」用 ----------
  function nextList(create) {
    var n = App.nextLeg();
    if (!n) return null;
    var l = listFor(n.trip.id);
    if (!l && create) l = ensureList(n.trip);
    if (l) reconcile(l);
    return l;
  }

  // 某個行李箱裡「清單上要帶、還沒收好」的項目
  function bagPending(bagId) {
    var l = nextList(false);
    if (!l) return [];
    var act = activeZones(l);
    return l.entries.filter(function (e) {
      return e.status === 'take' && !e.checked && act.indexOf(e.zone) >= 0 && l.zones[e.zone].bagId === bagId;
    });
  }

  function findEntry(id) { var l = nextList(false); return l ? { l: l, e: l.entries.find(function (x) { return x.id === id; }) } : null; }

  // 打勾：清單上的項目收好了（放進行李）
  function checkEntry(id) {
    var f = findEntry(id);
    if (!f || !f.e) return;
    setChecked(f.l, f.e, true);
    App.save();
  }

  // 取消打勾：從行李拿出來，但留在這趟的清單上（之後還要帶）
  function uncheckItem(itemId) {
    var l = nextList(true);
    if (!l) return false;
    var e = l.entries.find(function (x) { return x.itemId === itemId; });
    if (!e) return false;   // 這個行李不在這趟的打包清單裡
    setChecked(l, e, false);
    App.save();
    return true;
  }

  function zoneForBag(l, bagId) {
    return activeZones(l).find(function (z) { return l.zones[z].bagId === bagId; }) || null;
  }

  // 已放進行李的東西換到別的行李
  function moveItem(itemId, bagId) {
    var it = st().items.find(function (x) { return x.id === itemId; });
    if (!it) return;
    it.bagId = bagId;
    var m = it.catalogId && App.entryById(it.catalogId);
    if (m) App.markPacked(m, bagId);
    var l = nextList(false);
    if (l) reconcile(l);
    App.save();
  }

  // 清單上還沒收好的項目換到別的行李
  function moveEntryTo(id, bagId) {
    var f = findEntry(id);
    if (!f || !f.e) return false;
    var z = zoneForBag(f.l, bagId);
    if (!z) return false;
    moveEntry(f.l, f.e, z);
    App.save();
    return true;
  }

  // 拿出來：這趟不帶了
  function takeOutItem(itemId) {
    var l = nextList(false);
    var e = l && l.entries.find(function (x) { return x.itemId === itemId; });
    if (e) removeEntry(l, e);
    else {
      var it = st().items.find(function (x) { return x.id === itemId; });
      st().items = st().items.filter(function (x) { return x.id !== itemId; });
      var m = it && it.catalogId && App.entryById(it.catalogId);
      if (m) App.restoreHome(m);
    }
    App.save();
  }

  function takeOutEntry(id) {
    var f = findEntry(id);
    if (!f || !f.e) return;
    removeEntry(f.l, f.e);
    App.save();
  }

  window.Packing = {
    show: show, pendingByBag: pendingByBag, bagPending: bagPending, checkEntry: checkEntry, uncheckItem: uncheckItem,
    moveItem: moveItem, moveEntryTo: moveEntryTo, takeOutItem: takeOutItem, takeOutEntry: takeOutEntry
  };
})();
