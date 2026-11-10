/*
 * 衣服、鞋子、帽子、圍巾、配件的標籤：選項規則＋點選元件
 *
 * 標籤資料（存在物品的 clothing 欄位），第 3 版：
 *   { v, group, type, subtype, part, home, colors[], pattern, seasons[], styles[], brand,
 *     uses[], material, thickness, length, lengthCm, fitsWatches[] }
 *   - group：大類（上衣、下身、洋裝／連身、外套、鞋子、帽子、圍巾、配件）
 *   - type：細項（例如襯衫、手錶、棒球帽）；鞋子是鞋子的大類（高跟鞋、運動鞋…）
 *   - subtype：鞋子的款式（例如跑步鞋、短靴）
 *   - part：穿搭部位，給之後的「模擬穿搭」用
 *       top 上衣、bottom 下身、full 洋裝／連身（同時算上衣＋下身）、outer 外套、
 *       shoes 鞋子、hat 帽子、scarf 圍巾、accessory 配件
 *   - home：放在哪個家，清單存在 state.homes
 *   - uses：鞋子用途；material：材質；thickness：圍巾厚度
 *   - length／lengthCm：皮帶長度（短、標準、長）與實際公分
 *   - fitsWatches：錶帶適用的手錶（衣櫃裡手錶的 id）
 *
 * 每排選項都有「其他」，點了可以自己輸入；自己輸入的文字直接存成選項值。
 */
(function () {
  'use strict';

  var OTHER = '其他';

  // ---------- 顏色 ----------
  var HEX = {
    '黑': '#111827', '白': '#ffffff', '灰': '#9ca3af', '米': '#e8dcc4', '咖啡': '#7c4a2d', '藍': '#3b82f6',
    '海軍藍': '#1e3a8a', '綠': '#16a34a', '紅': '#dc2626', '粉紅': '#f9a8d4', '黃': '#facc15', '紫': '#8b5cf6',
    '金色': 'linear-gradient(135deg, #f5d77a, #b8860b)', '銀色': 'linear-gradient(135deg, #f3f4f6, #9ca3af)',
    '玫瑰金': 'linear-gradient(135deg, #f6c9b8, #b76e5a)', '珍珠白': 'radial-gradient(circle at 35% 35%, #fff, #ece4d4)',
    '雙色（金銀）': 'linear-gradient(135deg, #d4af37 50%, #c0c0c0 50%)',
    '黑色': '#111827', '白色': '#ffffff', '米色': '#e8dcc4', '咖啡色': '#7c4a2d', '淺棕色': '#c8a27a',
    '深棕色': '#4a2c1a', '紅色': '#dc2626', '藍色': '#3b82f6', '綠色': '#16a34a',
    '玳瑁色': 'radial-gradient(circle at 30% 30%, #e0a34a 20%, #5a3010 60%)',
    '金框': 'radial-gradient(circle, #fff 45%, #d4af37 50%)', '銀框': 'radial-gradient(circle, #fff 45%, #a1a1aa 50%)',
    '透明': 'linear-gradient(135deg, #f8fafc, #e2e8f0)', '綠框': 'radial-gradient(circle, #fff 45%, #16a34a 50%)',
    '紫框': 'radial-gradient(circle, #fff 45%, #8b5cf6 50%)', '紅框': 'radial-gradient(circle, #fff 45%, #dc2626 50%)'
  };
  HEX[OTHER] = 'conic-gradient(#dc2626, #facc15, #16a34a, #3b82f6, #8b5cf6, #dc2626)';

  var FULL_COLORS = ['黑', '白', '灰', '米', '咖啡', '藍', '海軍藍', '綠', '紅', '粉紅', '黃', '紫', '金色', '銀色', OTHER];
  var JEWEL_COLORS = ['金色', '銀色', '玫瑰金', '珍珠白', OTHER];
  var WATCH_COLORS = ['金色', '銀色', '玫瑰金', '黑色', '雙色（金銀）', OTHER];
  var STRAP_COLORS = ['黑色', '咖啡色', '淺棕色', '深棕色', '白色', '金色', '銀色', '紅色', '藍色', '綠色', OTHER];
  var BELT_COLORS = ['黑色', '咖啡色', '淺棕色', '深棕色', '紅色', '白色', OTHER];
  var SUN_COLORS = ['黑色', '玳瑁色', '咖啡色', '金框', '銀框', '透明', '綠框', '紫框', '紅框', OTHER];
  var BAG_COLORS = ['黑色', '白色', '米色', '咖啡色', '淺棕色', '深棕色', '紅色', '金色', '銀色', OTHER];

  var PATTERNS = ['素色', '條紋', '格紋', '碎花', '印花', '圓點', OTHER];
  var SEASONS = ['春', '夏', '秋', '冬'];
  var STYLES = ['休閒', '正式', '運動', '度假'];

  // ---------- 大類與細項 ----------
  var SHOE_TYPES = {
    '高跟鞋': ['細跟', '粗跟', '楔型鞋', OTHER],
    '平底鞋': ['樂福鞋', '芭蕾舞鞋', '涼鞋', '拖鞋', OTHER],
    '運動鞋': ['休閒運動鞋', '跑步鞋', '走路鞋', '網球鞋', OTHER],
    '靴子': ['短靴', '長靴', '馬靴', '雨靴', OTHER]
  };

  var GROUPS = [
    { name: '上衣', part: 'top', types: ['T 恤', '襯衫', '背心', '毛衣', '針織衫', OTHER] },
    { name: '下身', part: 'bottom', types: ['長褲', '牛仔褲', '短褲', '裙子', OTHER] },
    { name: '洋裝／連身', part: 'full', types: [] },
    { name: '外套', part: 'outer', types: ['外套', '大衣', '羽絨衣', OTHER] },
    { name: '鞋子', part: 'shoes', types: Object.keys(SHOE_TYPES).concat(OTHER) },
    { name: '帽子', part: 'hat', types: ['棒球帽', '漁夫帽', '登山帽', '毛帽', '草帽', '貝雷帽', '紳士帽', OTHER] },
    { name: '圍巾', part: 'scarf', types: [] },
    { name: '配件', part: 'accessory', types: ['耳環', '項鍊', '戒指', '手環', '手錶', '錶帶', '皮帶', '太陽眼鏡', '包包', OTHER] }
  ];
  var CLOTHES = ['上衣', '下身', '洋裝／連身', '外套'];

  function groupOf(name) { return GROUPS.find(function (g) { return g.name === name; }); }

  /*
   * 依目前選到的種類，回傳要顯示哪些欄位（依序）。
   * kind：one 單選、many 複選、watches 選衣櫃裡的手錶、length 皮帶長度
   */
  function fieldsFor(tags) {
    var g = tags.group, t = tags.type;
    var f = [];
    var typeLabel = { '鞋子': '鞋子大類', '帽子': '帽型', '配件': '配件種類' }[g] || '細項';
    var grp = groupOf(g);
    if (grp && grp.types.length) f.push({ key: 'type', label: typeLabel, kind: 'one', options: grp.types, sub: true });

    if (CLOTHES.indexOf(g) >= 0) {
      f.push({ key: 'colors', label: '顏色', kind: 'many', options: FULL_COLORS, swatch: true });
      f.push({ key: 'pattern', label: '花紋', kind: 'one', options: PATTERNS });
      f.push({ key: 'seasons', label: '適合季節', kind: 'many', options: SEASONS, noOther: true });
      f.push({ key: 'styles', label: '風格', kind: 'many', options: STYLES.concat(OTHER) });
    } else if (g === '鞋子') {
      if (SHOE_TYPES[t]) f.push({ key: 'subtype', label: '款式', kind: 'one', options: SHOE_TYPES[t], sub: true });
      f.push({ key: 'uses', label: '用途', kind: 'many', options: ['日常', '正式', '跑步', '走路', '網球', '騎馬', '雨天', '登山', OTHER] });
      f.push({ key: 'colors', label: '顏色', kind: 'many', options: FULL_COLORS, swatch: true });
      f.push({ key: 'seasons', label: '適合季節', kind: 'many', options: SEASONS, noOther: true });
    } else if (g === '帽子') {
      f.push({ key: 'colors', label: '顏色', kind: 'many', options: FULL_COLORS, swatch: true });
      f.push({ key: 'seasons', label: '適合季節', kind: 'many', options: SEASONS, noOther: true });
    } else if (g === '圍巾') {
      f.push({ key: 'thickness', label: '厚度', kind: 'one', options: ['薄', '厚', OTHER] });
      f.push({ key: 'material', label: '材質', kind: 'one', options: ['針織', '喀什米爾', OTHER] });
      f.push({ key: 'colors', label: '顏色', kind: 'many', options: FULL_COLORS, swatch: true });
      f.push({ key: 'seasons', label: '適合季節', kind: 'many', options: SEASONS, noOther: true });
    } else if (g === '配件') {
      if (['耳環', '項鍊', '戒指', '手環'].indexOf(t) >= 0) {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: JEWEL_COLORS, swatch: true });
      } else if (t === '手錶') {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: WATCH_COLORS, swatch: true });
      } else if (t === '錶帶') {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: STRAP_COLORS, swatch: true });
        f.push({ key: 'material', label: '材質', kind: 'one', options: ['皮革', '金屬', '布／尼龍', '矽膠', OTHER] });
        f.push({ key: 'fitsWatches', label: '適用手錶', kind: 'watches' });
      } else if (t === '皮帶') {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: BELT_COLORS, swatch: true });
        f.push({ key: 'material', label: '材質', kind: 'one', options: ['皮革', '布面', OTHER] });
        f.push({ key: 'length', label: '長度', kind: 'length', options: ['短', '標準', '長'] });
      } else if (t === '太陽眼鏡') {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: SUN_COLORS, swatch: true });
      } else if (t === '包包') {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: BAG_COLORS, swatch: true });
      } else if (t) {
        f.push({ key: 'colors', label: '顏色', kind: 'many', options: FULL_COLORS, swatch: true });
      }
    }
    return f;
  }

  // 每個選項欄位會用到的 key，用來「換種類時清掉不適用的值」
  var OPTION_KEYS = ['type', 'subtype', 'colors', 'pattern', 'seasons', 'styles', 'uses', 'material', 'thickness', 'length', 'fitsWatches'];

  function colorHex(name) { return HEX[name] || HEX[OTHER]; }

  function empty() {
    return {
      v: 3, group: '', type: '', subtype: '', part: '', home: '', colors: [], pattern: '', seasons: [], styles: [],
      brand: '', uses: [], material: '', thickness: '', length: '', lengthCm: null, fitsWatches: []
    };
  }

  function hasTags(c) { return !!(c && c.group); }

  // 預設名稱，例如「襯衫」「跑步鞋」「細跟高跟鞋」「棒球帽」「圍巾」
  function typeName(c) {
    if (!c) return '';
    var t = c.type && c.type !== OTHER ? c.type : '';
    if (c.group === '鞋子') {
      var s = c.subtype && c.subtype !== OTHER ? c.subtype : '';
      if (s) return /[鞋靴]$/.test(s) ? s : s + (t || '鞋');
      return t || '鞋子';
    }
    return t || c.group || '';
  }

  // 查參考重量用的名稱
  function refName(c) {
    if (!c) return '';
    if (c.group === '鞋子') return typeName(c);
    if (c.group === '帽子' || c.group === '圍巾') return c.type && c.type !== OTHER ? c.type : c.group;
    return typeName(c);
  }

  // ---------- 從名稱猜種類 ----------
  var KEYWORDS = [];
  GROUPS.forEach(function (g) {
    if (g.name === '鞋子') {
      Object.keys(SHOE_TYPES).forEach(function (t) {
        KEYWORDS.push([t, { group: '鞋子', type: t, subtype: '' }]);
        SHOE_TYPES[t].forEach(function (s) {
          if (s !== OTHER) KEYWORDS.push([s, { group: '鞋子', type: t, subtype: s }]);
        });
      });
      KEYWORDS.push(['鞋子', { group: '鞋子', type: '', subtype: '' }]);
      return;
    }
    if (!g.types.length) KEYWORDS.push([g.name.split('／')[0], { group: g.name, type: '' }]);
    g.types.forEach(function (t) {
      if (t !== OTHER) KEYWORDS.push([t, { group: g.name, type: t }]);
    });
  });
  KEYWORDS.push(['帽子', { group: '帽子', type: '' }]);

  function guess(name, norm) {
    var q = norm(name);
    if (!q) return null;
    var best = null, bestLen = 0;
    KEYWORDS.forEach(function (kw) {
      var k = norm(kw[0]);
      if (k.length >= 2 && q.indexOf(k) >= 0 && k.length > bestLen) { bestLen = k.length; best = kw[1]; }
    });
    return best;
  }

  // ---------- 換種類時清掉不適用的值 ----------
  function sanitize(tags) {
    var fields = fieldsFor(tags);
    // type 可能影響 subtype 的選項，所以重算兩次
    for (var round = 0; round < 2; round++) {
      fields = fieldsFor(tags);
      OPTION_KEYS.forEach(function (key) {
        var f = fields.find(function (x) { return x.key === key; });
        var isArr = Array.isArray(empty()[key]);
        if (!f) { tags[key] = isArr ? [] : ''; return; }
        if (f.kind === 'watches') return;
        var opts = f.options;
        if (isArr) tags[key] = (tags[key] || []).filter(function (v) { return opts.indexOf(v) >= 0; });
        else if (tags[key] && opts.indexOf(tags[key]) < 0) tags[key] = '';
      });
    }
    if (!fields.some(function (x) { return x.key === 'length'; })) tags.lengthCm = null;
    var g = groupOf(tags.group);
    tags.part = g ? g.part : '';
    return tags;
  }

  // ---------- 舊資料升級到第 3 版 ----------
  var OLD_SHOES = {
    '運動鞋': ['運動鞋', ''], '皮鞋': ['平底鞋', '皮鞋'], '靴子': ['靴子', ''],
    '涼鞋': ['平底鞋', '涼鞋'], '拖鞋': ['平底鞋', '拖鞋'], '高跟鞋': ['高跟鞋', '']
  };
  var SHORT_TO_LONG = { '黑': '黑色', '白': '白色', '米': '米色', '咖啡': '咖啡色', '紅': '紅色', '藍': '藍色', '綠': '綠色' };
  var LONG_TO_SHORT = {};
  Object.keys(SHORT_TO_LONG).forEach(function (k) { LONG_TO_SHORT[SHORT_TO_LONG[k]] = k; });

  function upgrade(c) {
    if (!c || c.v >= 3) return c;
    var base = empty();
    Object.keys(base).forEach(function (k) { if (c[k] === undefined) c[k] = base[k]; });
    if (c.group === '配件' && c.type === '帽子') { c.group = '帽子'; c.type = ''; }
    else if (c.group === '配件' && c.type === '圍巾') { c.group = '圍巾'; c.type = ''; }
    else if (c.group === '配件' && c.type === '鞋子') { c.group = '鞋子'; c.type = ''; }
    else if (c.group === '鞋子' && c.type && !SHOE_TYPES[c.type]) {
      var m = OLD_SHOES[c.type] || ['', c.type];
      c.type = m[0];
      c.subtype = m[1];
    } else if (c.group === '上衣' || c.group === '外套' || c.group === '下身') {
      // 細項都還在新清單裡
    }
    // 顏色名稱轉成新種類用的名稱（例如 黑 → 黑色）；對不上的保留成「其他」自己輸入的值
    var cf = fieldsFor(c).find(function (x) { return x.key === 'colors'; });
    if (cf) {
      c.colors = (c.colors || []).map(function (v) {
        if (cf.options.indexOf(v) >= 0) return v;
        if (SHORT_TO_LONG[v] && cf.options.indexOf(SHORT_TO_LONG[v]) >= 0) return SHORT_TO_LONG[v];
        if (LONG_TO_SHORT[v] && cf.options.indexOf(LONG_TO_SHORT[v]) >= 0) return LONG_TO_SHORT[v];
        return v;
      }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
    }
    var g = groupOf(c.group);
    c.part = g ? g.part : '';
    c.v = 3;
    return c;
  }

  // ---------- 上一版（v1 衣櫃頁）資料轉換 ----------
  var V1_TYPE = {
    'T恤': ['上衣', 'T 恤'], '長袖上衣': ['上衣', 'T 恤'], '襯衫': ['上衣', '襯衫'], '毛衣': ['上衣', '毛衣'],
    '運動服': ['上衣', ''], '睡衣': ['上衣', ''],
    '長褲': ['下身', '長褲'], '牛仔褲': ['下身', '牛仔褲'], '短褲': ['下身', '短褲'], '裙子': ['下身', '裙子'],
    '洋裝': ['洋裝／連身', ''], '泳衣': ['洋裝／連身', ''],
    '外套': ['外套', '外套'], '羽絨外套': ['外套', '羽絨衣'], '大衣': ['外套', '大衣'],
    '鞋子': ['鞋子', ''],
    '帽子': ['帽子', ''], '圍巾': ['圍巾', ''], '包包': ['配件', '包包'], '內衣褲': ['配件', ''], '其他配件': ['配件', '']
  };
  var V1_COLOR = { '米色': '米', '深藍': '海軍藍', '橘': OTHER, '多色': OTHER };
  var V1_PATTERN = { '點點': '圓點', '圖案': OTHER, '迷彩': OTHER };
  var V1_STYLE = { '上班': '正式' };

  function uniq(arr) { return arr.filter(function (v, i) { return v && arr.indexOf(v) === i; }); }

  function fromOld(old) {
    var t = V1_TYPE[old.type] || ['', ''];
    var c = empty();
    c.group = t[0];
    c.type = t[1];
    c.colors = uniq((old.colors || []).map(function (x) { return V1_COLOR[x] || x; }))
      .filter(function (x) { return FULL_COLORS.indexOf(x) >= 0; });
    var p = V1_PATTERN[old.pattern] || old.pattern || '';
    c.pattern = PATTERNS.indexOf(p) >= 0 ? p : '';
    c.seasons = (old.seasons || []).filter(function (s) { return SEASONS.indexOf(s) >= 0; });
    c.styles = uniq((old.styles || []).map(function (s) { return V1_STYLE[s] || s; }))
      .filter(function (s) { return STYLES.indexOf(s) >= 0; });
    c.brand = old.brand || '';
    var g = groupOf(c.group);
    c.part = g ? g.part : '';
    return c;
  }

  // ---------- 點選元件 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function chip(value, label, on, swatch, extra) {
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-v="' + esc(value) + '"' + (extra || '') + '>' +
      (swatch ? '<i class="sw" style="background:' + colorHex(value) + '"></i>' : '') + esc(label) + '</button>';
  }

  // 一排選項；自己輸入的「其他」值會顯示成「其他：xxx」
  function optionChips(f, current) {
    var many = f.kind === 'many';
    var sel = many ? (current || []) : (current ? [current] : []);
    var html = f.options.map(function (o) {
      return chip(o, o, sel.indexOf(o) >= 0, f.swatch && o !== OTHER);
    }).join('');
    sel.forEach(function (v) {
      if (f.options.indexOf(v) < 0) html += chip(v, OTHER + '：' + v, true, false, ' data-custom');
    });
    return html;
  }

  /*
   * 在 el 裡建立標籤點選區。
   * opts.onChange(tags, key)：任何標籤改變時呼叫
   * opts.brands()：品牌建議；opts.homes()／opts.addHome(name)：家
   * opts.watches()：衣櫃裡的手錶 [{ id, name }]（錶帶用）
   */
  function createPicker(el, opts) {
    opts = opts || {};
    var tags = empty();
    var listId = 'brands-' + Math.random().toString(36).slice(2, 7);

    el.innerHTML =
      '<div class="field-title">單品類別</div>' +
      '<div class="chips pick" data-k="group"></div>' +
      '<div data-fields></div>' +
      '<div class="field-title">放在哪個家</div>' +
      '<div class="chips pick" data-k="home"></div>' +
      '<label>品牌<input data-k="brand" maxlength="30" placeholder="例如：UNIQLO" list="' + listId + '">' +
      '<datalist id="' + listId + '"></datalist></label>';

    var q = function (sel) { return el.querySelector(sel); };

    function fieldHTML(f) {
      var title = '<div class="field-title">' + esc(f.label) +
        (f.kind === 'many' || f.kind === 'watches' ? ' <span class="muted small">可複選</span>' : '') + '</div>';
      if (f.kind === 'watches') {
        var watches = opts.watches ? opts.watches() : [];
        return title + (watches.length
          ? '<div class="chips pick" data-k="fitsWatches" data-watches>' + watches.map(function (w) {
              return chip(w.id, w.name, (tags.fitsWatches || []).indexOf(w.id) >= 0, false);
            }).join('') + '</div>'
          : '<p class="muted small field-note">衣櫃裡還沒有手錶。先新增手錶，就能在這裡選。</p>');
      }
      if (f.kind === 'length') {
        return title + '<div class="chips pick" data-k="length">' +
          f.options.map(function (o) { return chip(o, o, tags.length === o, false); }).join('') + '</div>' +
          '<label class="inline-cm">實際長度（選填）<span class="cm-row"><input data-k="lengthCm" type="number" inputmode="decimal" min="0" step="any" placeholder="例如 105" value="' +
          (tags.lengthCm != null ? esc(tags.lengthCm) : '') + '"><span class="unit-text">公分</span></span></label>';
      }
      var opt = f.noOther ? f.options : f.options;
      var box = '<div class="chips pick" data-k="' + f.key + '"' + (f.kind === 'many' ? ' data-many' : '') + '>' +
        optionChips({ options: opt, kind: f.kind, swatch: f.swatch }, tags[f.key]) + '</div>';
      return title + (f.sub ? '<div class="sub-types">' + box + '</div>' : box);
    }

    function render() {
      q('[data-k="group"]').innerHTML = GROUPS.map(function (g) {
        return chip(g.name, g.name, tags.group === g.name, false);
      }).join('');
      q('[data-fields]').innerHTML = fieldsFor(tags).map(fieldHTML).join('');
      var homes = opts.homes ? opts.homes() : [];
      q('[data-k="home"]').innerHTML = homes.map(function (h) { return chip(h, h, tags.home === h, false); }).join('') +
        '<button type="button" class="chip add-chip" data-add-home>＋ 新增</button>';
      if (document.activeElement !== q('[data-k="brand"]')) q('[data-k="brand"]').value = tags.brand || '';
      var brands = opts.brands ? opts.brands() : [];
      q('datalist').innerHTML = brands.map(function (b) { return '<option value="' + esc(b) + '">'; }).join('');
    }

    function changed(key) {
      render();
      if (opts.onChange) opts.onChange(tags, key);
    }

    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-add-home]')) {
        var n = (prompt('新增一個家（例如：東京）') || '').trim().slice(0, 20);
        if (n && opts.addHome) {
          opts.addHome(n);
          tags.home = n;
          changed('home');
        }
        return;
      }
      var c = e.target.closest('.pick [data-v]');
      if (!c) return;
      var box = c.parentElement;
      var key = box.getAttribute('data-k');
      var v = c.getAttribute('data-v');
      var many = box.hasAttribute('data-many') || box.hasAttribute('data-watches');

      // 「其他」：自己輸入
      if (v === OTHER && !c.hasAttribute('data-custom')) {
        var input = prompt('請輸入' + (key === 'colors' ? '顏色' : '內容') + '（不輸入直接按確定，就記成「其他」）');
        if (input === null) return;
        input = input.trim().slice(0, 20) || OTHER;
        v = input;
        if (many) {
          if (tags[key].indexOf(v) < 0) tags[key].push(v);
        } else {
          tags[key] = v;
        }
      } else if (many) {
        var arr = tags[key] || (tags[key] = []);
        var i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
      } else {
        tags[key] = tags[key] === v ? '' : v;
      }

      // 換大類、細項時，清掉不適用的選項
      if (key === 'group' || key === 'type' || key === 'subtype') sanitize(tags);
      changed(key);
    });

    el.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k');
      if (k === 'brand') { tags.brand = e.target.value.trim(); if (opts.onChange) opts.onChange(tags, 'brand'); }
      if (k === 'lengthCm') {
        var n = parseFloat(e.target.value);
        tags.lengthCm = isFinite(n) && n > 0 ? n : null;
        if (opts.onChange) opts.onChange(tags, 'lengthCm');
      }
    });

    render();
    return {
      get: function () { return tags; },
      // 載入已存的標籤（不清除任何值）
      set: function (c) {
        tags = Object.assign(empty(), upgrade(JSON.parse(JSON.stringify(c || {}))));
        if (!tags.v || tags.v < 3) tags.v = 3;
        var g = groupOf(tags.group);
        tags.part = g ? g.part : '';
        render();
      },
      // 自動猜到種類時套用，並清掉不適用的值
      apply: function (patch) {
        Object.assign(tags, patch);
        sanitize(tags);
        render();
      },
      render: render
    };
  }

  // 衣櫃篩選用：所有可能的顏色（依選項順序）
  var ALL_COLORS = uniq([].concat(FULL_COLORS, JEWEL_COLORS, WATCH_COLORS, STRAP_COLORS, BELT_COLORS, SUN_COLORS, BAG_COLORS)
    .filter(function (c) { return c !== OTHER; }));

  window.Clothing = {
    OTHER: OTHER, GROUPS: GROUPS, SEASONS: SEASONS, STYLES: STYLES, ALL_COLORS: ALL_COLORS,
    groupOf: groupOf, colorHex: colorHex, empty: empty, hasTags: hasTags, typeName: typeName, refName: refName,
    guess: guess, upgrade: upgrade, fromOld: fromOld, fieldsFor: fieldsFor, createPicker: createPicker
  };
})();
