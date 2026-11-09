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
   * bags   行李：{ id, name, limit(上限 kg), tare(空箱 kg) }
   * items  行李裡的東西：{ id, name, weight(每單位 kg), qty, unit, category, bagId, catalogId }
   *          catalogId：對應到 memory 裡的哪一件（用來顯示照片）
   * memory 常帶物品＝我擁有的東西，「我的衣櫃」也是從這裡來：
   *          { id, name, weight, unit, category, bagId, uses, estimated,
   *            photoId,   照片在 IndexedDB 的 id，沒有照片是 null
   *            clothing,  衣服標籤，不是衣服是 null（格式見 clothing.js）
   *            createdAt, updatedAt,
   *            cloudId, syncedAt,  預留：雲端儲存
   *            ai }                預留：AI 辨識結果 { colors, pattern, group, type, confidence, model, at }
   * outfits 預留：模擬穿搭 { id, date, place, weather, parts: { top, bottom, full, outer, shoes, accessory[] } }
   * sync    預留：雲端帳號 { userId, lastSyncedAt }
   * legacyWardrobe 上一版衣櫃的原始資料，留著備份
   *
   * 照片本身存在 IndexedDB（見 photos.js），不放在 localStorage。
   */
  var SCHEMA_VERSION = 2;

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      bags: [
        { id: uid(), name: '托運行李', limit: 23, tare: 4 },
        { id: uid(), name: '登機箱', limit: 7, tare: 2.5 }
      ],
      items: [],
      memory: [],
      outfits: [],
      sync: { userId: null, lastSyncedAt: null }
    };
  }

  // 補齊常帶物品的欄位
  function normalizeEntry(m) {
    if (!m.id) m.id = uid();
    if (m.photoId === undefined) m.photoId = null;
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
    s.items.forEach(function (it) {
      if (it.wardrobeId) { it.catalogId = it.wardrobeId; delete it.wardrobeId; }
    });

    if (!Array.isArray(s.outfits)) s.outfits = [];
    if (!s.sync) s.sync = { userId: null, lastSyncedAt: null };
    s.schemaVersion = SCHEMA_VERSION;
    return s;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('無法儲存（瀏覽器可能在私密模式）'); }
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

  // ---------- 首頁 ----------
  function renderHome() {
    var total = 0, limit = 0;
    state.bags.forEach(function (b) { total += bagLoad(b); limit += Number(b.limit) || 0; });
    var remain = limit - total;
    var lv = level(remain, limit);

    var card = $('#remain-card');
    card.className = 'remain-card ' + lv;
    $('#remain-num').textContent = fmt(remain);
    $('#remain-status').innerHTML = '<span>' +
      (lv === 'bad' ? '超重 ' + fmt(-remain) + ' kg' : lv === 'warn' ? '快滿了' : '充裕') + '</span>';
    $('#total-num').textContent = fmt(total);
    $('#limit-num').textContent = fmt(limit);

    // 各行李
    var html = state.bags.map(function (b) {
      var w = bagLoad(b);
      var lim = Number(b.limit) || 0;
      var blv = level(lim - w, lim);
      var pct = lim > 0 ? Math.min(100, (w / lim) * 100) : 100;
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
      return '<div class="card"><div class="bag-head"><span class="bag-name">' + esc(b.name) + '</span>' +
        '<span class="bag-weight">' + fmt(w) + ' / ' + fmt(lim) + ' kg</span></div>' +
        '<div class="bar ' + blv + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="muted small">含空箱 ' + fmt(Number(b.tare) || 0) + ' kg・剩 ' + fmt(lim - w) + ' kg</div>' +
        list + '</div>';
    }).join('');
    $('#bag-list').innerHTML = html;
    Photos.fillThumbs($('#bag-list'));

    renderBagSettings();
  }

  function renderBagSettings() {
    $('#bag-settings').innerHTML = state.bags.map(function (b) {
      return '<div class="bag-edit" data-bag="' + b.id + '">' +
        '<label>名稱<input data-field="name" value="' + esc(b.name) + '" maxlength="20"></label>' +
        '<label>上限 kg<input data-field="limit" type="number" inputmode="decimal" step="any" min="0" value="' + b.limit + '"></label>' +
        '<label>空箱 kg<input data-field="tare" type="number" inputmode="decimal" step="any" min="0" value="' + b.tare + '"></label>' +
        '<button type="button" class="icon-btn" data-del-bag="' + b.id + '" aria-label="刪除行李">🗑</button>' +
        '</div>';
    }).join('');
  }

  $('#bag-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-del-item]');
    if (!btn) return;
    var id = btn.getAttribute('data-del-item');
    var it = state.items.find(function (x) { return x.id === id; });
    if (!it || !confirm('要把「' + it.name + '」移出行李嗎？')) return;
    state.items = state.items.filter(function (x) { return x.id !== id; });
    save();
    renderHome();
  });

  // 行李設定：離開輸入框時才重畫，避免輸入中被打斷
  $('#bag-settings').addEventListener('change', function (e) {
    var row = e.target.closest('[data-bag]');
    if (!row) return;
    var bag = bagById(row.getAttribute('data-bag'));
    var field = e.target.getAttribute('data-field');
    if (!bag || !field) return;
    if (field === 'name') {
      bag.name = e.target.value.trim() || bag.name;
    } else {
      var v = parseFloat(e.target.value);
      bag[field] = isFinite(v) && v >= 0 ? v : 0;
    }
    save();
    renderHome();
  });

  $('#bag-settings').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-del-bag]');
    if (!btn) return;
    if (state.bags.length <= 1) { toast('至少要保留一個行李'); return; }
    var id = btn.getAttribute('data-del-bag');
    var bag = bagById(id);
    var count = state.items.filter(function (it) { return it.bagId === id; }).length;
    var msg = '要刪除「' + bag.name + '」嗎？' + (count ? '裡面的 ' + count + ' 項物品也會一起刪除。' : '');
    if (!confirm(msg)) return;
    state.bags = state.bags.filter(function (b) { return b.id !== id; });
    state.items = state.items.filter(function (it) { return it.bagId !== id; });
    save();
    renderHome();
  });

  $('#go-allowance').addEventListener('click', function () {
    var box = $('#allowance');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.classList.remove('flash');
    void box.offsetWidth;
    box.classList.add('flash');
  });

  $('#add-bag').addEventListener('click', function () {
    state.bags.push({ id: uid(), name: '行李 ' + (state.bags.length + 1), limit: 7, tare: 0 });
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

  var picker = Clothing.createPicker($('#f-tags'), {
    brands: allBrands,
    onChange: function (tags, key) {
      tagsTouched = true;
      if (key === 'group' || key === 'type') {
        var tn = Clothing.typeName(tags);
        var nameEl = $('#f-name');
        // 名稱空白（或是剛才自動填的）就用種類當名稱
        if (tn && (!nameEl.value.trim() || nameEl.value === autoName)) {
          nameEl.value = autoName = tn;
          if (selectedId) deselect(true);
        }
        if (weightSource !== 'user' && weightSource !== 'memory' && tn) {
          var ref = findRef(tn);
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
    var list = state.memory.slice().sort(function (a, b) {
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
    $('#memory-empty').hidden = list.length > 0;
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
      if (g) picker.set(Object.assign({}, cur, g));
      else if (cur.group) picker.set(Object.assign({}, cur, { group: '', type: '' }));
    }
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
    photoJob.then(renderMemory);
    renderMemory();
    $('#f-name').focus();
  });

  // ---------- 畫面切換 ----------
  // 網址：#home、#add、#closet（衣櫃）、#closet/new（新增衣服）、#closet/<id>（編輯衣服）
  function route() {
    var parts = location.hash.replace(/^#/, '').split('/');
    var view = ['add', 'closet'].indexOf(parts[0]) >= 0 ? parts[0] : 'home';
    ['home', 'add', 'closet'].forEach(function (v) { $('#view-' + v).hidden = v !== view; });
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === view);
    });
    if (view === 'home') renderHome();
    else if (view === 'add') renderAdd();
    else if (window.Closet) window.Closet.show(decodeURIComponent(parts.slice(1).join('/')));
    window.scrollTo(0, 0);
  }

  // 給衣櫃（closet.js）使用的共用功能
  window.App = {
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
    dropPhotoIfUnused: dropPhotoIfUnused
  };

  window.addEventListener('hashchange', route);
  // 其他分頁改了資料時同步
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY) { state = load(); route(); }
  });

  // 啟動時檢查：照片其實不存在的（例如上一版沒拍照的衣服），改成沒有照片
  function checkPhotos() {
    var withPhoto = state.memory.filter(function (m) { return m.photoId; });
    Promise.all(withPhoto.map(function (m) {
      return Photos.get(m.photoId).then(function (p) { return p ? null : m; }).catch(function () { return null; });
    })).then(function (missing) {
      missing = missing.filter(Boolean);
      if (!missing.length) return;
      missing.forEach(function (m) { m.photoId = null; });
      save();
      route();
    });
  }

  // 等所有程式（包含 closet.js）都載入後再顯示畫面
  document.addEventListener('DOMContentLoaded', function () {
    route();
    checkPhotos();
  });
})();
