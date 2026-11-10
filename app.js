(function () {
  'use strict';

  var STORE_KEY = 'luggage-app-v1';
  // 七大品類：name 存進資料，hint 只在選單裡提示
  var CATEGORY_LIST = [
    { name: '必備品', hint: '護照、現金、信用卡、簽證、衣服、鞋子配件' },
    { name: '保健品', hint: '保健食品與藥品' },
    { name: '保養品', hint: '臉部、身體、手部' },
    { name: '特殊類', hint: '騎馬、打網球等活動用品' },
    { name: '禮物', hint: '' },
    { name: '食品', hint: '' },
    { name: '電線電器', hint: '' }
  ];
  var CATEGORIES = CATEGORY_LIST.map(function (c) { return c.name; });
  var NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
  // 第一版的舊品類，對應到新的七大品類
  var OLD_CATEGORY_MAP = {
    '衣物': '必備品', '證件文件': '必備品', '其他': '必備品',
    '藥品': '保健品', '盥洗用品': '保養品',
    '伴手禮': '禮物', '食品': '食品', '電子產品': '電線電器'
  };
  // 剩餘比例低於這個值就顯示黃色
  var WARN_RATIO = 0.2;

  // ---------- 資料 ----------
  /*
   * 存在 localStorage（luggage-app-v1）的資料結構，第 2 版：
   *
   * bags   行李：{ id, name, kind, limit(上限 kg), tare(空箱 kg) }
   *          kind：checked 托運、carry 手提、personal 背包／個人物品（對應航班的三種額度）
   *          limit：沒有排行程時使用的上限；有下一段航班時改用那段的額度
   * items  行李裡的東西：{ id, name, weight(每單位 kg), qty, unit, category, bagId, catalogId }
   *          catalogId：對應到 memory 裡的哪一件（用來顯示照片）
   * memory 常帶物品＝我擁有的東西，「我的衣櫃」也是從這裡來：
   *          { id, name, weight, unit, category, bagId, uses, estimated,
   *            photoId,   照片的 id（iPad 上的暫存用這個 id），沒有照片是 null
   *            photoPath, 照片在 Supabase Storage 的路徑：item-photos 裡的 <帳號 id>/<照片 id>.jpg（登入同步後才有）
   *            clothing,  衣服標籤，不是衣服是 null（格式見 clothing.js）
   *            createdAt, updatedAt,
   *            cloudId, syncedAt,  預留：雲端儲存
   *            ai,                 預留：AI 辨識結果 { colors, pattern, group, type, confidence, model, at }
   *            location, moves,    位置與移動紀錄（見下方「物品位置」；衣物和抽屜物品都有）
   *            home,               抽屜物品放在哪個家（衣物記在 clothing.home）
   *            count, countUnit,   抽屜物品的數量（例如 5、'片'）；用「有／快用完／沒了」時 count 是 null
   *            stock }             'have' 有、'low' 快用完、'out' 沒了
   * outfits 預留：模擬穿搭 { id, date, place, weather, parts: { top, bottom, full, outer, shoes, accessory[] } }
   * sync    預留：雲端帳號 { userId, lastSyncedAt }
   * homes   「家」的清單，衣服標籤的 clothing.home 會是其中之一
   * customOptions  在「其他」自己輸入過的選項：{ 'colors@配件/皮帶': ['酒紅'], … }
   * packLists  打包清單，每趟旅程一份（格式見 packing.js）
   * legacyWardrobe 上一版衣櫃的原始資料，留著備份
   * trips  旅程：{ id, name, origin, endHome, legs[], createdAt, updatedAt,
   *            endHome：最後一段結束後回到哪個家（null＝還沒設定，依最後一段抵達城市判斷；''＝未定／不回家）
   *            source,     來源：manual 手動、import 匯入訂位紀錄、ai 行程單截圖辨識（預留）
   *            importRef,  預留：匯入資訊 { platform, bookingCode, importedAt, raw }
   *            ownerId, members[], shareCode,  預留：多人共用同一份行程
   *            cloudId, syncedAt }             預留：雲端
   *          legs 航班段：{ id, from, to, date(起飛日期 YYYY-MM-DD), depTime, arrDate, arrTime(當地時間 HH:MM), flightNo, airline,
   *            connection: { baggage: through 直掛／recheck 領出, mode: transit 不入境／enter 入境停留, stayDays, note }
   *              （抵達這段的終點後、轉下一段時的設定；最後一段不用）
   *            allowance: { checked, carry, personal }（公斤；空白＝沿用行李自己的上限，0＝這段沒有這項額度）,
   *            bookingCode,  預留：訂位代號
   *            ai }          預留：AI 辨識結果 { confidence, fromImage, at }
   *
   * 照片本身存在 IndexedDB（見 photos.js），不放在 localStorage。
   */
  var SCHEMA_VERSION = 2;
  var DEFAULT_HOMES = ['曼谷', '台灣', '昆明'];

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      bags: [
        { id: uid(), name: '托運行李', kind: 'checked', limit: 23, tare: 4 },
        { id: uid(), name: '登機箱', kind: 'carry', limit: 7, tare: 2.5 }
      ],
      items: [],
      memory: [],
      outfits: [],
      homes: DEFAULT_HOMES.slice(),
      trips: [],
      sync: { userId: null, lastSyncedAt: null }
    };
  }

  // 補齊常帶物品的欄位
  // 依行李名稱猜類型（托運、手提、背包）
  function guessBagKind(name) {
    name = String(name || '');
    if (/背包|個人|后背|後背|包包/.test(name)) return 'personal';
    if (/登機|手提|隨身|carry/i.test(name)) return 'carry';
    return 'checked';
  }
  var BAG_KINDS = [['checked', '托運'], ['carry', '手提'], ['personal', '背包']];

  function normalizeTrip(t) {
    if (!t.id) t.id = uid();
    if (!Array.isArray(t.legs)) t.legs = [];
    t.legs.forEach(normalizeLeg);
    ['name', 'origin'].forEach(function (k) { if (t[k] == null) t[k] = ''; });
    if (!t.createdAt) t.createdAt = Date.now();
    if (!t.updatedAt) t.updatedAt = t.createdAt;
    if (!t.source) t.source = 'manual';
    if (t.importRef === undefined) t.importRef = null;
    if (t.ownerId === undefined) t.ownerId = null;
    if (!Array.isArray(t.members)) t.members = [];
    if (t.shareCode === undefined) t.shareCode = null;
    if (t.cloudId === undefined) t.cloudId = null;
    if (t.syncedAt === undefined) t.syncedAt = null;
    if (t.endHome === undefined) t.endHome = null;
    return t;
  }

  function normalizeLeg(l) {
    if (!l.id) l.id = uid();
    ['from', 'to', 'date', 'depTime', 'arrDate', 'arrTime', 'flightNo', 'airline'].forEach(function (k) { if (l[k] == null) l[k] = ''; });
    if (!l.connection) l.connection = { baggage: '', mode: '', stayDays: '', note: '' };
    if (!l.allowance) l.allowance = { checked: '', carry: '', personal: '' };
    if (l.bookingCode === undefined) l.bookingCode = null;
    if (l.ai === undefined) l.ai = null;
    return l;
  }

  function normalizeEntry(m) {
    if (!m.id) m.id = uid();
    if (m.photoId === undefined) m.photoId = null;
    if (m.photoPath === undefined) m.photoPath = null;
    if (m.clothing === undefined) m.clothing = null;
    if (!m.createdAt) m.createdAt = Date.now();
    if (!m.updatedAt) m.updatedAt = m.createdAt;
    if (m.cloudId === undefined) m.cloudId = null;
    if (m.syncedAt === undefined) m.syncedAt = null;
    if (m.ai === undefined) m.ai = null;
    return m;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.bags) && Array.isArray(s.items) && Array.isArray(s.memory)) return migrate(s);
      }
    } catch (e) { /* 讀不到就用預設值 */ }
    return defaultState();
  }

  function migrate(s) {
    s.items.concat(s.memory).forEach(function (x) {
      if (CATEGORIES.indexOf(x.category) < 0) x.category = OLD_CATEGORY_MAP[x.category] || '必備品';
    });
    s.memory.forEach(normalizeEntry);

    // 上一版的「我的衣櫃」：每件衣服轉成一筆常帶物品，照片 id 沿用，原始資料留作備份
    if (Array.isArray(s.wardrobe)) {
      s.wardrobe.forEach(function (w) {
        if (s.memory.some(function (m) { return m.id === w.id; })) return;
        var tags = window.Clothing ? window.Clothing.fromOld(w) : null;
        var name = [w.brand, (w.colors || []).join('/'), w.type].filter(Boolean).join(' ') || '衣服';
        s.memory.push(normalizeEntry({
          id: w.id, name: name, weight: w.weight != null ? w.weight : 0.2, unit: '個', category: '必備品',
          bagId: s.bags[0] && s.bags[0].id, uses: 0, estimated: !w.weightByUser,
          photoId: w.id, clothing: tags, createdAt: w.createdAt || Date.now()
        }));
      });
      s.legacyWardrobe = (s.legacyWardrobe || []).concat(s.wardrobe);
      delete s.wardrobe;
    }
    // 衣服標籤升級到第 3 版（帽子、圍巾從配件獨立出來、鞋子改成大類＋款式）
    s.memory.forEach(function (m) {
      if (m.clothing && window.Clothing) window.Clothing.upgrade(m.clothing);
    });
    s.items.forEach(function (it) {
      if (it.wardrobeId) { it.catalogId = it.wardrobeId; delete it.wardrobeId; }
    });

    if (!Array.isArray(s.outfits)) s.outfits = [];
    if (!Array.isArray(s.homes)) s.homes = DEFAULT_HOMES.slice();
    if (!s.customOptions || typeof s.customOptions !== 'object') s.customOptions = {};
    if (!Array.isArray(s.packLists)) s.packLists = [];
    if (!Array.isArray(s.trips)) s.trips = [];
    s.trips.forEach(normalizeTrip);
    s.bags.forEach(function (b) { if (!b.kind) b.kind = guessBagKind(b.name); });
    // 首頁原本填的額度：搬到行程裡還沒填的航班段（只做一次；填過或填 0 的不動）
    if (!s.allowanceMoved) {
      s.trips.forEach(function (t) {
        t.legs.forEach(function (l) {
          ['checked', 'carry', 'personal'].forEach(function (k) {
            var v = l.allowance[k];
            if (v !== '' && v != null) return;
            var bags = s.bags.filter(function (b) { return b.kind === k; });
            if (!bags.length) return;
            l.allowance[k] = bags.reduce(function (sum, b) { return sum + (Number(b.limit) || 0); }, 0);
          });
        });
      });
      s.allowanceMoved = true;
    }
    if (!s.sync) s.sync = { userId: null, lastSyncedAt: null };
    s.schemaVersion = SCHEMA_VERSION;
    return s;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('無法儲存（瀏覽器可能在私密模式）'); }
    // 有登入雲端的話，稍後自動同步
    if (window.Cloud) window.Cloud.schedule();
  }

  // 存檔但不觸發同步（雲端同步自己用）
  function saveQuiet() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 下次再存 */ }
  }

  // 雲端合併後套用到這台裝置（不會再觸發同步）
  function replaceState(next) {
    state = migrate(JSON.parse(JSON.stringify(next)));
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 下次再存 */ }
    refreshView();
  }

  // 重畫目前的畫面；正在填表單（編輯衣服、旅程）時先不重畫，避免打斷
  function refreshView() {
    if (/\//.test(location.hash)) return;
    route();
  }

  var state = load();

  // ---------- 工具 ----------
  var $ = function (sel) { return document.querySelector(sel); };

  function fmt(n) {
    var r = Math.round(n * 10) / 10;
    return (Object.is(r, -0) ? 0 : r).toFixed(1);
  }

  function fmtWeight(kg) {
    return kg < 1 ? Math.round(kg * 1000) + ' g' : (Math.round(kg * 100) / 100) + ' kg';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function entryById(id) {
    return state.memory.find(function (m) { return m.id === id; });
  }

  function bagById(id) {
    return state.bags.find(function (b) { return b.id === id; });
  }

  function bagLoad(bag) {
    return state.items.reduce(function (sum, it) {
      return it.bagId === bag.id ? sum + it.weight * it.qty : sum;
    }, Number(bag.tare) || 0);
  }

  function level(remain, limit) {
    if (remain < 0) return 'bad';
    if (limit > 0 && remain / limit < WARN_RATIO) return 'warn';
    return 'ok';
  }

  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  // ---------- 下一段航班 ----------
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // 今天（含）以後、日期最近的一段航班
  function nextLeg() {
    var today = todayStr(), best = null;
    state.trips.forEach(function (t) {
      t.legs.forEach(function (l, i) {
        if (!l.date || l.date < today) return;
        if (!best || l.date < best.leg.date) best = { trip: t, leg: l, index: i };
      });
    });
    return best;
  }

  // 這段航班某種額度的公斤數；沒填回傳 null
  function allowanceOf(leg, kind) {
    var v = leg.allowance && leg.allowance[kind];
    return v === '' || v == null ? null : Number(v) || 0;
  }

  // 每個行李這次的上限：有下一段航班就用那段的額度（同類型有好幾個行李就平分）；
  // 那段沒填這項額度、或沒有排行程時，用行李自己設定的上限
  function bagLimits(next) {
    var out = {};
    state.bags.forEach(function (b) {
      var a = next ? allowanceOf(next.leg, b.kind) : null;
      if (a == null) { out[b.id] = Number(b.limit) || 0; return; }
      var same = state.bags.filter(function (x) { return x.kind === b.kind; }).length || 1;
      out[b.id] = a / same;
    });
    return out;
  }

  // 「修改額度」連到行程設定裡那一段航班
  function legLink(next) {
    return '#trips/' + encodeURIComponent(next.trip.id) + '/leg/' + next.index;
  }

  function renderNextTrip(next) {
    var box = $('#next-trip');
    if (!next) {
      var hasTrips = state.trips.length > 0;
      box.innerHTML = '<div class="next-title">' + (hasTrips ? '沒有接下來的航班' : '還沒有旅程') + '</div>' +
        '<p class="muted small">行李額度會自動讀取「行程」裡下一段航班的托運、手提、背包額度。' +
        (hasTrips ? '目前的旅程都已經結束，' : '') + '先新增一趟旅程吧。</p>' +
        '<a class="btn primary first-trip-btn" href="#trips/new">＋ 先新增一趟旅程</a>' +
        (hasTrips ? '<a class="link small" href="#trips">查看所有行程</a>' : '');
      return;
    }
    var l = next.leg, T = window.Trips;
    var flight = [l.airline, l.flightNo].filter(Boolean).join(' ');
    box.innerHTML = '<div class="next-head"><span class="next-title">下一趟旅程：' + esc(next.trip.name) + '</span>' +
      '<a class="link" href="#trips/' + encodeURIComponent(next.trip.id) + '">查看</a></div>' +
      '<div class="next-leg">' + T.fmtDate(l.date) + '　<b>' + T.legRoute(l) + '</b>' +
      (flight ? '<span class="muted">　' + esc(flight) + '</span>' : '') + '</div>' +
      '<div class="next-allow"><span>額度：' + esc(T.allowanceText(l.allowance)) + '</span>' +
      '<a class="link small" href="' + legLink(next) + '">修改額度</a></div>' +
      T.homeBadge(l.to) +
      '<p class="muted small next-note">剩餘公斤數依這段航班的額度計算</p>';
  }

  // ---------- 首頁 ----------
  function renderHome() {
    var next = nextLeg();
    var limits = bagLimits(next);
    var total = 0, limit = 0;
    // 打包清單上「要帶但還沒收好」的重量也算進去
    var pend = window.Packing ? window.Packing.pendingByBag() : {};
    function pendOf(b) { return pend[b.id] || { weight: 0, count: 0 }; }
    state.bags.forEach(function (b) { total += bagLoad(b) + pendOf(b).weight; });
    // 總上限：每種額度各算一次（有填就用航班額度，沒填就加總那類行李自己的上限）
    BAG_KINDS.forEach(function (k) {
      var a = next ? allowanceOf(next.leg, k[0]) : null;
      if (a != null) limit += a;
      else state.bags.forEach(function (b) { if (b.kind === k[0]) limit += limits[b.id]; });
    });
    renderNextTrip(next);
    if (window.Organize) window.Organize.check();
    var remain = limit - total;
    var lv = level(remain, limit);

    var card = $('#remain-card');
    card.className = 'remain-card ' + (next ? lv : 'none');
    // 額度只讀行程：沒有接下來的航班時不計算
    $('#remain-num').textContent = next ? fmt(remain) : '—';
    $('#remain-status').innerHTML = '<span>' + (!next ? '新增旅程後就會計算' :
      lv === 'bad' ? '超重 ' + fmt(-remain) + ' kg' : lv === 'warn' ? '快滿了' : '充裕') + '</span>';
    $('#total-num').textContent = fmt(total);
    $('#limit-num').textContent = next ? fmt(limit) : '—';
    $('#limit-link').href = next ? legLink(next) : '#trips/new';
    $('#limit-link-text').textContent = next ? '修改額度' : '新增旅程';

    // 各行李
    var html = state.bags.map(function (b) {
      var w = bagLoad(b) + pendOf(b).weight;
      var lim = limits[b.id];
      var blv = next ? level(lim - w, lim) : 'ok';
      var pct = !next ? 0 : lim > 0 ? Math.min(100, (w / lim) * 100) : 100;
      var items = state.items.filter(function (it) { return it.bagId === b.id; });
      var list = items.length
        ? '<ul class="items">' + items.map(function (it) {
            var entry = it.catalogId && entryById(it.catalogId);
            return '<li>' + (entry && entry.photoId ? '<img class="thumb" data-photo="' + esc(entry.photoId) + '" alt="">' : '') +
              '<span class="name">' + esc(it.name) + ' × ' + it.qty + ' ' + esc(it.unit) +
              '<span class="tag">' + esc(it.category) + '</span></span>' +
              '<span class="w">' + fmtWeight(it.weight * it.qty) + '</span>' +
              '<button class="icon-btn" data-del-item="' + it.id + '" aria-label="刪除 ' + esc(it.name) + '">✕</button></li>';
          }).join('') + '</ul>'
        : '<div class="empty">還沒有物品</div>';
      if (pendOf(b).count) list += '<a class="pend-note" href="#pack">＋ 打包清單上還沒收好 ' + pendOf(b).count +
        ' 件（' + fmtWeight(pendOf(b).weight) + '），已算進重量 ›</a>';
      var kindName = (BAG_KINDS.find(function (k) { return k[0] === b.kind; }) || [, ''])[1];
      return '<div class="card"><div class="bag-head"><span class="bag-name">' + esc(b.name) +
        (kindName ? '<span class="tag">' + kindName + '</span>' : '') + '</span>' +
        '<span class="bag-weight">' + fmt(w) + (next ? ' / ' + fmt(lim) : '') + ' kg</span></div>' +
        '<div class="bar ' + blv + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="muted small">含空箱 ' + fmt(Number(b.tare) || 0) + ' kg' + (next ? '・剩 ' + fmt(lim - w) + ' kg' : '') + '</div>' +
        list + '</div>';
    }).join('');
    $('#bag-list').innerHTML = html;
    Photos.fillThumbs($('#bag-list'));

  }

  $('#bag-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-del-item]');
    if (!btn) return;
    var id = btn.getAttribute('data-del-item');
    var it = state.items.find(function (x) { return x.id === id; });
    var ent = it && it.catalogId && entryById(it.catalogId);
    if (!it || !confirm('要把「' + it.name + '」移出行李嗎？')) return;
    state.items = state.items.filter(function (x) { return x.id !== id; });
    restoreHome(ent);
    save();
    renderHome();
  });

  // ---------- 放進行李 ----------
  var form = $('#add-form');
  var unit = '個';
  var managing = false;
  // 重量欄目前的來源：'' 空白、'ref' 參考重量、'memory' 常帶物品、'user' 自己輸入
  var weightSource = '';

  // ---------- 參考重量比對 ----------
  // 常見簡體字轉繁體，讓簡體輸入也能對到
  var S2T = {};
  ('线線电電头頭转轉换換机機风風药藥镜鏡键鍵盘盤装裝袜襪裤褲衬襯伞傘护護钱錢签簽证證维維鱼魚' +
   '马馬网網运運动動叶葉饼餅宝寶记記笔筆脑腦长長绒絨内內带帶凉涼阳陽叠疊隐隱妆妝晒曬体體胡鬍' +
   '垫墊温溫壶壺凤鳳红紅坚堅卷捲离離夹夾触觸阅閱读讀戴戴发髮洁潔肤膚润潤乐樂鞋鞋针針织織连連' +
   '单單数數码碼备備源源移移动動盔盔帽帽围圍巾巾腰腰拍拍罩罩').replace(/(.)(.)/g, function (_, a, b) { S2T[a] = b; });

  function norm(str) {
    return String(str).toLowerCase().replace(/[^\s]/g, function (c) { return S2T[c] || c; })
      .replace(/[\s\-_.,，。、・·()（）\[\]【】\/]+/g, '');
  }

  var REFS = (window.REFERENCE_WEIGHTS || []).map(function (r) {
    return { ref: r, keys: [r.name].concat(r.aliases || []).map(norm).filter(Boolean) };
  });

  // 寬鬆比對：完全相同 > 名稱裡包含關鍵字（例如「iPhone充電線」）> 打到一半（例如「行動電」）
  function findRef(name) {
    var q = norm(name);
    if (!q) return null;
    var best = null, bestScore = 0;
    REFS.forEach(function (x) {
      x.keys.forEach(function (k) {
        var score = 0;
        if (q === k) score = 1000 + k.length;
        // 中文名稱的重點通常在最後，例如「iPhone充電線」是充電線，不是手機
        else if (k.length >= 2 && q.indexOf(k) >= 0) score = 500 + (q.slice(-k.length) === k ? 200 : 0) + k.length;
        else if (q.length >= 2 && k.indexOf(q) === 0) score = 100 - k.length;
        if (score > bestScore) { bestScore = score; best = x.ref; }
      });
    });
    return best;
  }

  function setWeightField(kg) {
    if (kg < 1) {
      $('#f-wunit').value = 'g';
      $('#f-weight').value = Math.round(kg * 1000);
    } else {
      $('#f-wunit').value = 'kg';
      $('#f-weight').value = Math.round(kg * 1000) / 1000;
    }
  }

  function setWeightSource(src, text) {
    weightSource = src;
    $('#f-approx').hidden = src !== 'ref';
    $('#weight-hint').textContent = text || '';
    $('#weight-hint').hidden = !text;
  }

  // 名稱改變時：先找自己記過的重量，再找參考重量表
  function autofillFromName() {
    if (weightSource === 'user') return;
    var name = $('#f-name').value;
    var m = findMemory(name);
    var ref = findRef(name);
    if (!m && ref) m = state.memory.find(function (x) { return isPlain(x) && findRef(x.name) === ref; });
    if (m) {
      setWeightField(m.weight);
      if (CATEGORIES.indexOf(m.category) >= 0) $('#f-cat').value = m.category;
      setUnit(m.unit || '個');
      if (m.estimated) {
        setWeightSource('ref', '這是參考重量，秤過之後可以直接改成實際重量。');
      } else {
        setWeightSource('memory', '使用你記錄的重量（' + m.name + '）。');
      }
    } else if (ref) {
      setWeightField(ref.weight);
      $('#f-cat').value = ref.category;
      setUnit(ref.unit || '個');
      setWeightSource('ref', '參考「' + ref.name + '」' + (ref.note ? '（' + ref.note + '）' : '') +
        '的大約重量，秤過之後可以直接改成實際重量。');
    } else if (weightSource) {
      $('#f-weight').value = '';
      $('#f-wunit').value = 'kg';
      setWeightSource('');
    }
    updatePreview();
  }

  function setUnit(u) {
    unit = u;
    Array.prototype.forEach.call($('#f-unit').children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-unit') === u);
      if (b.getAttribute('data-unit') === '套') b.hidden = u !== '套';   // 「套」只在睡衣時出現
    });
    updatePreview();
  }

  // ---------- 照片與衣服標籤（放進行李） ----------
  var selectedId = null;     // 從常帶物品點選的那一件
  var newPhoto = null;       // 這次新拍／新選的照片（已壓縮，還沒存）
  var entryPhotoId = null;   // 點選的常帶物品原本的照片
  var photoRemoved = false;  // 按了「移除照片」
  var tagsTouched = false;   // 自己點過標籤
  var autoName = '';         // 由標籤自動填入的名稱

  // 沒有照片、沒有衣服標籤的一般物品，才用名稱來找同一筆
  function isPlain(m) { return !m.photoId && !(m.clothing && m.clothing.group); }

  function allBrands() {
    var out = [];
    state.memory.forEach(function (m) {
      var b = m.clothing && m.clothing.brand;
      if (b && out.indexOf(b) < 0) out.push(b);
    });
    return out;
  }

  // ---------- 家 ----------
  function homes() { return state.homes; }

  // 自己輸入過的選項
  function customs(ctx) { return (state.customOptions || {})[ctx] || []; }
  function addCustom(ctx, value) {
    if (!state.customOptions) state.customOptions = {};
    var list = state.customOptions[ctx] || (state.customOptions[ctx] = []);
    if (list.indexOf(value) < 0) { list.push(value); save(); }
  }
  function addHome(name) {
    if (state.homes.indexOf(name) < 0) { state.homes.push(name); save(); }
  }

  // ---------- 衣櫃與行李共用：打包 ----------
  function isCloth(m) { return !!(m && m.clothing && m.clothing.group); }

  function packedItem(m) {
    return state.items.find(function (it) { return it.catalogId === m.id; });
  }

  // ---------- 物品位置（衣服、鞋子、配件） ----------
  /*
   * m.location：{ state, home, bagId, fromHome, since }
   *   state：home 在某個家、packed 在行李裡、pending 待確認（已抵達新的家，還沒決定要不要留下）
   * m.moves：移動紀錄 [{ home, date }]，例如 曼谷(11/3) → 昆明(11/8)
   * 行李清單（state.items）才是「在不在行李裡」的依據，location 記錄其他細節。
   */
  // 物品「放在哪個家」：衣物記在 clothing.home，抽屜物品記在 m.home
  function homeOfEntry(m) { return (isCloth(m) ? m.clothing.home : m.home) || ''; }
  function setHomeOfEntry(m, h) { if (isCloth(m)) m.clothing.home = h; else m.home = h; }

  function locOf(m) {
    if (!m) return null;
    var L = m.location || {};
    var item = packedItem(m);
    var origin = L.fromHome || (L.state === 'home' ? L.home : '') || homeOfEntry(m);
    if (item) {
      if (L.state === 'pending' && L.home) return { state: 'pending', home: L.home, bagId: item.bagId, fromHome: origin };
      return { state: 'packed', bagId: item.bagId, fromHome: origin };
    }
    if (L.state === 'home' && L.home) return { state: 'home', home: L.home };
    if (L.state === 'pending' && L.home) return { state: 'home', home: L.home };
    if (L.state === 'packed' && origin) return { state: 'home', home: origin };   // 從行李拿出來了，回到原本的家
    return homeOfEntry(m) ? { state: 'home', home: homeOfEntry(m) } : { state: 'none' };
  }

  // 從行李拿出來後：位置回到原本的家（不算一次移動）
  function restoreHome(m) {
    if (!m || packedItem(m)) return;
    var L = m.location || {};
    if (L.state === 'packed' || L.state === 'pending') {
      m.location = { state: 'home', home: L.fromHome || homeOfEntry(m), since: todayStr() };
    }
  }

  function locText(loc) {
    if (!loc || loc.state === 'none') return '📍 未設定家';
    if (loc.state === 'home') return '📍 ' + loc.home;
    if (loc.state === 'pending') return '⏳ 待確認（已到' + loc.home + '）';
    return '🧳 在行李裡' + (loc.fromHome ? '（從' + loc.fromHome + '帶出）' : '');
  }

  function shortDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return (+p[1]) + '/' + (+p[2]) + ' ';
  }

  function addMove(m, home, date, prevHome) {
    if (!Array.isArray(m.moves)) m.moves = [];
    if (!m.moves.length && prevHome && prevHome !== home) m.moves.push({ home: prevHome, date: '' });
    var last = m.moves[m.moves.length - 1];
    if (last && last.home === home) return;
    m.moves.push({ home: home, date: date || '' });
    if (m.moves.length > 40) m.moves.shift();
  }

  function movesText(m) {
    var list = (m.moves || []).map(function (x) { return shortDate(x.date) + x.home; });
    var loc = locOf(m);
    if (!list.length && loc && loc.state === 'home') list.push(loc.home);
    if (loc && loc.state === 'packed') list.push('行李中');
    if (loc && loc.state === 'pending') list.push('待確認（' + loc.home + '）');
    return list.join(' → ');
  }

  // 放進行李：記住從哪個家帶出
  function markPacked(m, bagId) {
    if (!m) return;
    var cur = locOf(m);
    var from = cur.state === 'home' ? cur.home : (cur.fromHome || homeOfEntry(m));
    if (from && !(m.moves || []).length) addMove(m, from, '', '');
    m.location = { state: 'packed', bagId: bagId, fromHome: from, since: todayStr() };
  }

  // 放在某個家；record 為 true 時記一筆移動紀錄
  function markHome(m, home, date, record) {
    if (!m) return;
    var cur = locOf(m);
    var prev = cur.state === 'home' ? cur.home : (cur.fromHome || '');
    m.location = { state: 'home', home: home, since: date || todayStr() };
    setHomeOfEntry(m, home);
    if (record && home) addMove(m, home, date || todayStr(), prev);
  }

  // 把一件常帶物品（例如衣櫃裡的衣服）放進指定的行李
  function packEntry(m, bagId) {
    markPacked(m, bagId);
    // 抽屜物品有記數量的話，整份一起帶（例如泡麵 × 3 包）
    var counted = !isCloth(m) && m.count > 0;
    var item = {
      id: uid(), name: m.name, weight: m.weight, qty: counted ? m.count : 1, unit: counted ? (m.countUnit || m.unit || '個') : (m.unit || '個'),
      category: m.category || '必備品', bagId: bagId, catalogId: m.id
    };
    state.items.push(item);
    m.bagId = bagId;
    m.uses = (m.uses || 0) + 1;
    save();
    return item;
  }

  // 從行李拿出來（同一件放了好幾次，就全部拿出來）
  function unpackEntry(m) {
    var cur = locOf(m);
    state.items = state.items.filter(function (it) { return it.catalogId !== m.id; });
    // 取消打包：回到原本的家（不算一次移動）
    if (cur && cur.state !== 'home' && cur.state !== 'none') {
      m.location = { state: 'home', home: cur.fromHome || homeOfEntry(m), since: todayStr() };
    }
    save();
  }

  var picker = Clothing.createPicker($('#f-tags'), {
    brands: allBrands,
    homes: homes,
    addHome: addHome,
    customs: customs,
    addCustom: addCustom,
    watches: watches,
    onChange: function (tags, key) {
      tagsTouched = true;
      syncHeavy();
      // 睡衣以「一套」為單位
      if (key === 'group') {
        if (tags.group === '睡衣') setUnit('套');
        else if (unit === '套') setUnit('個');
      }
      if (key === 'group' || key === 'type' || key === 'subtype') {
        var tn = Clothing.typeName(tags);
        var nameEl = $('#f-name');
        // 名稱空白（或是剛才自動填的）就用種類當名稱
        if (tn && (!nameEl.value.trim() || nameEl.value === autoName)) {
          nameEl.value = autoName = tn;
          if (selectedId) deselect(true);
        }
        if (weightSource !== 'user' && weightSource !== 'memory' && tn) {
          var ref = findRef(Clothing.refName(tags)) || findRef(tags.group);
          if (ref) {
            setWeightField(ref.weight);
            setWeightSource('ref', '參考「' + ref.name + '」' + (ref.note ? '（' + ref.note + '）' : '') +
              '的大約重量，秤過之後可以直接改成實際重量。');
          }
        }
      }
      updatePreview();
    }
  });

  function syncClothingBox() {
    $('#f-clothing').hidden = $('#f-cat').value !== '必備品';
    syncHeavy();
  }

  // 鞋子很重：重量欄位特別顯眼
  function syncHeavy() {
    var heavy = $('#f-cat').value === '必備品' && picker.get().group === '鞋子';
    $('#f-weight-label').classList.toggle('weight-strong', heavy);
    $('#f-heavy-tip').hidden = !heavy;
  }

  // 衣櫃裡的手錶（錶帶選「適用手錶」用）
  function watches() {
    return state.memory.filter(function (m) {
      return m.clothing && m.clothing.group === '配件' && m.clothing.type === '手錶';
    }).map(function (m) { return { id: m.id, name: m.name }; });
  }

  function showFormPhoto(url) {
    $('#f-photo-preview').hidden = !url;
    $('#f-photo-label').textContent = url ? '換一張照片' : '加入照片';
    if (url) $('#f-photo-img').src = url;
  }

  function resetPhoto() {
    newPhoto = null;
    entryPhotoId = null;
    photoRemoved = false;
    showFormPhoto(null);
  }

  // 取消「正在使用某件常帶物品」；keepTags 為 true 時保留已點的標籤
  function deselect(keepTags) {
    selectedId = null;
    if (!newPhoto) resetPhoto();
    else entryPhotoId = null;
    if (!keepTags && !tagsTouched) picker.set(Clothing.empty());
    syncHeavy();
  }

  $('#f-photo').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    toast('照片壓縮中…');
    Photos.compress(file).then(function (p) {
      newPhoto = p;
      photoRemoved = false;
      showFormPhoto(URL.createObjectURL(p.blob));
      toast('照片已壓縮為 ' + Math.max(1, Math.round(p.size / 1024)) + ' KB');
    }).catch(function () {
      toast('這張照片讀不到，請換一張試試');
    });
  });

  $('#f-photo-remove').addEventListener('click', function () {
    newPhoto = null;
    if (entryPhotoId) photoRemoved = true;
    showFormPhoto(null);
  });

  $('#f-cat').addEventListener('change', syncClothingBox);

  function renderAdd() {
    var cat = $('#f-cat').value;
    $('#f-cat').innerHTML = CATEGORY_LIST.map(function (c, i) {
      return '<option value="' + esc(c.name) + '">' + NUMS[i] + ' ' + esc(c.name) +
        (c.hint ? '（' + esc(c.hint) + '）' : '') + '</option>';
    }).join('');
    if (cat) $('#f-cat').value = cat;

    var current = $('#f-bag').value;
    $('#f-bag').innerHTML = state.bags.map(function (b) {
      return '<option value="' + b.id + '">' + esc(b.name) + '</option>';
    }).join('');
    if (bagById(current)) $('#f-bag').value = current;

    syncClothingBox();
    picker.render();
    renderMemory();
    updatePreview();
  }

  function renderMemory() {
    renderClosetPick();
    var list = state.memory.filter(function (m) { return !isCloth(m); }).sort(function (a, b) {
      return (b.uses || 0) - (a.uses || 0) || (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    $('#memory-list').innerHTML = list.map(function (m) {
      return '<button type="button" class="chip' + (m.photoId ? ' has-thumb' : '') + (m.id === selectedId ? ' on' : '') +
        '" data-mem="' + esc(m.id) + '">' +
        (m.photoId ? '<img class="chip-thumb" data-photo="' + esc(m.photoId) + '" alt="">' : '') +
        esc(m.name) + ' <small>' + (m.estimated ? '約' : '') + fmtWeight(m.weight) + '/' + esc(m.unit) +
        '</small><span class="x">✕</span></button>';
    }).join('');
    Photos.fillThumbs($('#memory-list'));
    $('#memory-empty').hidden = state.memory.length > 0;
    $('#toggle-manage').hidden = list.length === 0;
    if (!list.length) managing = false;
    $('#memory-box').classList.toggle('managing', managing);
    $('#toggle-manage').textContent = managing ? '完成' : '管理';

    var names = [];
    list.forEach(function (m) { if (isPlain(m) && names.indexOf(m.name) < 0) names.push(m.name); });
    (window.REFERENCE_WEIGHTS || []).forEach(function (r) {
      if (names.indexOf(r.name) < 0) names.push(r.name);
    });
    $('#name-options').innerHTML = names.map(function (n) {
      return '<option value="' + esc(n) + '">';
    }).join('');
  }

  // 「從衣櫃挑」：顯示衣櫃裡每件衣服的小照片，點了就帶入表單
  function renderClosetPick() {
    var list = state.memory.filter(isCloth).sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    $('#closet-pick').hidden = !list.length;
    $('#closet-pick-list').innerHTML = list.map(function (m) {
      var c = m.clothing;
      var packed = packedItem(m);
      return '<button type="button" class="pick-tile' + (m.id === selectedId ? ' on' : '') + '" data-pick="' + esc(m.id) + '">' +
        '<span class="pick-ph">' + (m.photoId ? '<img data-photo="' + esc(m.photoId) + '" alt="">' : '') +
        (packed ? '<span class="packed">已打包</span>' : '') + '</span>' +
        '<span class="pick-name">' + esc(m.name) + '</span>' +
        '<span class="pick-home">' + (c.home ? '📍' + esc(c.home) : '&nbsp;') + '</span>' +
        '</button>';
    }).join('');
    Photos.fillThumbs($('#closet-pick-list'));
  }

  $('#closet-pick-list').addEventListener('click', function (e) {
    var tile = e.target.closest('[data-pick]');
    if (!tile) return;
    var m = entryById(tile.getAttribute('data-pick'));
    if (!m) return;
    if (selectedId === m.id) { deselect(); renderMemory(); return; }
    var packed = packedItem(m);
    if (packed) {
      var bag = bagById(packed.bagId);
      if (!confirm('「' + m.name + '」已經打包在' + (bag ? bag.name : '行李') + '，還要再放一次嗎？')) return;
    }
    applyMemory(m);
    toast('已從衣櫃帶入「' + m.name + '」，確認後按「加入行李」');
  });

  // 用名稱找一般物品（有照片或衣服標籤的每件都是獨立的，不用名稱合併）
  function findMemory(name) {
    var key = norm(name);
    if (!key) return null;
    return state.memory.find(function (m) { return isPlain(m) && norm(m.name) === key; });
  }

  function applyMemory(m) {
    selectedId = m.id;
    $('#f-name').value = m.name;
    autoName = '';
    setWeightField(m.weight);
    setWeightSource(m.estimated ? 'ref' : 'memory',
      m.estimated ? '這是參考重量，秤過之後可以直接改成實際重量。' : '');
    if (CATEGORIES.indexOf(m.category) >= 0) $('#f-cat').value = m.category;
    if (bagById(m.bagId)) $('#f-bag').value = m.bagId;
    $('#f-qty').value = 1;
    setUnit(m.unit || '個');

    newPhoto = null;
    photoRemoved = false;
    entryPhotoId = m.photoId || null;
    showFormPhoto(null);
    if (entryPhotoId) Photos.url(entryPhotoId).then(function (u) {
      if (selectedId === m.id && !newPhoto && !photoRemoved) showFormPhoto(u);
    });
    picker.set(m.clothing || Clothing.empty());
    tagsTouched = false;
    syncClothingBox();
    renderMemory();
  }

  function weightKg() {
    var v = parseFloat($('#f-weight').value);
    if (!isFinite(v) || v < 0) return NaN;
    return $('#f-wunit').value === 'g' ? v / 1000 : v;
  }

  function updatePreview() {
    var w = weightKg();
    var q = parseInt($('#f-qty').value, 10);
    var name = $('#f-name').value.trim();
    $('#preview').textContent = (isFinite(w) && q > 0)
      ? (name || '這項物品') + '：' + q + ' ' + unit + '，共 ' + fmtWeight(w * q)
      : '';
  }

  // 沒有其他物品用到這張照片，才真的刪掉
  function dropPhotoIfUnused(photoId) {
    if (!photoId) return;
    if (state.memory.some(function (m) { return m.photoId === photoId; })) return;
    Photos.del(photoId).catch(function () {});
    // 雲端的照片也一起刪掉（沒網路時等有網路再刪）
    if (window.Cloud) window.Cloud.queueDelete(photoId);
  }

  $('#memory-list').addEventListener('click', function (e) {
    var chip = e.target.closest('[data-mem]');
    if (!chip) return;
    var m = entryById(chip.getAttribute('data-mem'));
    if (!m) return;
    if (managing) {
      if ((m.photoId || m.clothing) && !confirm('要從常帶物品移除「' + m.name + '」嗎？照片和標籤也會一起刪除，衣櫃裡也會看不到。')) return;
      state.memory = state.memory.filter(function (x) { return x !== m; });
      dropPhotoIfUnused(m.photoId);
      if (selectedId === m.id) deselect();
      save();
      renderMemory();
      toast('已移除「' + m.name + '」');
      return;
    }
    if (selectedId === m.id) { deselect(); renderMemory(); return; }
    applyMemory(m);
    toast('已帶入「' + m.name + '」');
  });

  $('#toggle-manage').addEventListener('click', function () {
    managing = !managing;
    renderMemory();
  });

  // 輸入名稱時：自動帶入重量，並猜衣服種類
  $('#f-name').addEventListener('input', function () {
    if (selectedId) {
      var m = entryById(selectedId);
      if (!m || norm(m.name) !== norm(this.value)) { deselect(); renderMemory(); }
    }
    autoName = '';
    autofillFromName();
    if (!tagsTouched && !selectedId) {
      var g = $('#f-cat').value === '必備品' ? Clothing.guess(this.value, norm) : null;
      var cur = picker.get();
      if (g) picker.apply(g);
      else if (cur.group) picker.apply({ group: '', type: '', subtype: '' });
    }
    // 猜到是睡衣就用「套」，不是就換回「個」
    if (picker.get().group === '睡衣') setUnit('套');
    else if (unit === '套') setUnit('個');
    syncClothingBox();
  });

  // 自己改了重量或單位，就以輸入的為準
  ['#f-weight', '#f-wunit'].forEach(function (sel) {
    $(sel).addEventListener('input', function () {
      setWeightSource($('#f-weight').value ? 'user' : '');
    });
  });

  ['#f-name', '#f-weight', '#f-qty', '#f-wunit'].forEach(function (sel) {
    $(sel).addEventListener('input', updatePreview);
  });

  $('#f-unit').addEventListener('click', function (e) {
    var b = e.target.closest('[data-unit]');
    if (b) setUnit(b.getAttribute('data-unit'));
  });

  form.querySelector('.stepper').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (!b) return;
    var q = parseInt($('#f-qty').value, 10) || 1;
    $('#f-qty').value = Math.max(1, q + parseInt(b.getAttribute('data-step'), 10));
    updatePreview();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#f-name').value.trim();
    var w = weightKg();
    var q = parseInt($('#f-qty').value, 10);
    if (!name) { toast('請輸入名稱'); return; }
    if (!isFinite(w)) { toast('請輸入正確的重量'); return; }
    if (!(q >= 1)) { toast('數量至少為 1'); return; }

    var category = $('#f-cat').value;
    var tags = picker.get();
    var clothing = category === '必備品' && Clothing.hasTags(tags) ? JSON.parse(JSON.stringify(tags)) : null;

    // 決定要記在哪一筆常帶物品
    //  - 點選了常帶物品：更新那一筆；但如果它已經有照片又拍了新照片，就當作「另一件」
    //  - 一般物品（沒照片、沒標籤）：用名稱找同一筆
    //  - 其他（有照片或衣服標籤）：每件都是新的一筆
    var sel = selectedId && entryById(selectedId);
    var entry = null;
    if (sel && !(newPhoto && sel.photoId)) entry = sel;
    else if (!sel && !newPhoto && !clothing) entry = findMemory(name);
    var isNewEntry = !entry;
    if (!entry) {
      entry = normalizeEntry({ uses: 0, photoId: sel && !photoRemoved && !newPhoto ? sel.photoId : null });
      state.memory.push(entry);
    }
    entry.name = name;
    entry.weight = w;
    entry.unit = unit;
    entry.category = category;
    entry.bagId = $('#f-bag').value;
    entry.estimated = weightSource === 'ref';
    entry.clothing = clothing;
    entry.uses = (entry.uses || 0) + 1;
    entry.updatedAt = Date.now();

    var oldPhotoId = null;
    if (photoRemoved && !newPhoto && entry.photoId) { oldPhotoId = entry.photoId; entry.photoId = null; }

    var item = {
      id: uid(), name: name, weight: w, qty: q, unit: unit,
      category: category, bagId: entry.bagId, catalogId: entry.id
    };
    if (!packedItem(entry)) markPacked(entry, item.bagId);
    state.items.push(item);

    var photoJob = Promise.resolve();
    if (newPhoto) {
      entry.photoId = entry.id;
      photoJob = Photos.put(entry.photoId, newPhoto).catch(function () {
        entry.photoId = null;
        save();
        toast('照片存不進去，可能是瀏覽器空間不足；物品已照常加入');
      });
    }
    save();
    dropPhotoIfUnused(oldPhotoId);

    var bag = bagById(item.bagId);
    toast('已放進' + (bag ? bag.name : '行李') + '：' + name + ' × ' + q + ' ' + unit +
      (isNewEntry && (newPhoto || clothing) ? '（已加入常帶物品）' : ''));

    // 清空表單，但保留品類與行李方便連續新增
    $('#f-name').value = '';
    $('#f-weight').value = '';
    $('#f-wunit').value = 'kg';
    $('#f-qty').value = 1;
    setUnit('個');
    setWeightSource('');
    selectedId = null;
    autoName = '';
    resetPhoto();
    picker.set(Clothing.empty());
    tagsTouched = false;
    syncHeavy();
    photoJob.then(renderMemory);
    renderMemory();
    $('#f-name').focus();
  });

  // ---------- 畫面切換 ----------
  // 網址：#home、#add、#closet（衣櫃）、#closet/new（新增衣服）、#closet/<id>（編輯衣服）
  function route() {
    var parts = location.hash.replace(/^#/, '').split('/');
    var view = ['add', 'closet', 'trips', 'pack', 'drawer'].indexOf(parts[0]) >= 0 ? parts[0] : 'home';
    ['home', 'add', 'closet', 'trips', 'pack', 'drawer'].forEach(function (v) { $('#view-' + v).hidden = v !== view; });
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === view);
    });
    if (view === 'home') renderHome();
    else if (view === 'add') renderAdd();
    else if (view === 'pack') { if (window.Packing) window.Packing.show(); }
    else if (view === 'drawer') { if (window.Drawer) window.Drawer.show(); }
    else if (view === 'trips') { if (window.Trips) window.Trips.show(decodeURIComponent(parts.slice(1).join('/'))); }
    else if (window.Closet) window.Closet.show(decodeURIComponent(parts.slice(1).join('/')));
    window.scrollTo(0, 0);
  }

  // 給衣櫃（closet.js）使用的共用功能
  window.App = {
    saveQuiet: saveQuiet,
    replaceState: replaceState,
    refreshView: refreshView,
    state: function () { return state; },
    save: save,
    toast: toast,
    esc: esc,
    uid: uid,
    fmtWeight: fmtWeight,
    findRef: findRef,
    norm: norm,
    normalizeEntry: normalizeEntry,
    entryById: entryById,
    allBrands: allBrands,
    dropPhotoIfUnused: dropPhotoIfUnused,
    homes: homes,
    addHome: addHome,
    customs: customs,
    addCustom: addCustom,
    watches: watches,
    nextLeg: nextLeg,
    normalizeTrip: normalizeTrip,
    normalizeLeg: normalizeLeg,
    isCloth: isCloth,
    packedItem: packedItem,
    packEntry: packEntry,
    unpackEntry: unpackEntry,
    locOf: locOf,
    homeOfEntry: homeOfEntry,
    restoreHome: restoreHome,
    categories: function () { return CATEGORY_LIST; },
    locText: locText,
    movesText: movesText,
    markPacked: markPacked,
    markHome: markHome,
    todayStr: todayStr,
    bagById: bagById
  };

  window.addEventListener('hashchange', route);
  // 其他分頁改了資料時同步
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY) { state = load(); route(); }
  });

  // 啟動時檢查：照片其實不存在的（例如上一版沒拍照的衣服），改成沒有照片
  function checkPhotos() {
    // 只檢查上一版衣櫃轉過來的衣服（照片 id 沿用舊衣服 id）；其他照片可能還在雲端等下載，不能清掉
    var legacy = (state.legacyWardrobe || []).map(function (w) { return w.id; });
    if (state.legacyPhotosChecked) return;
    var withPhoto = state.memory.filter(function (m) { return m.photoId && legacy.indexOf(m.photoId) >= 0; });
    Promise.all(withPhoto.map(function (m) {
      return Photos.get(m.photoId).then(function (p) { return p ? null : m; }).catch(function () { return null; });
    })).then(function (missing) {
      missing = missing.filter(Boolean);
      missing.forEach(function (m) { m.photoId = null; });
      state.legacyPhotosChecked = true;
      save();
      if (missing.length) route();
    });
  }

  // 等所有程式（包含 closet.js）都載入後再顯示畫面
  document.addEventListener('DOMContentLoaded', function () {
    route();
    checkPhotos();
  });

  // 讓 app 沒有網路時也能打開
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 不支援就算了 */ });
    });
  }
})();
