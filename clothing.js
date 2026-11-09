/*
 * 衣服、鞋子、配件的標籤：選項清單＋點選元件
 *
 * 標籤資料（存在物品的 clothing 欄位）：
 *   { group, type, part, colors[], pattern, seasons[], styles[], brand }
 *   - group：大類（上衣、下身、洋裝／連身、外套、鞋子、配件）
 *   - type：細項（例如襯衫）；洋裝／連身沒有細項
 *   - part：穿搭部位，給之後的「模擬穿搭」用
 *       top 上衣、bottom 下身、full 洋裝／連身（同時算上衣＋下身）、
 *       outer 外套、shoes 鞋子、accessory 配件
 */
(function () {
  'use strict';

  var GROUPS = [
    { name: '上衣', part: 'top', types: ['T 恤', '襯衫', '背心', '毛衣', '針織衫'] },
    { name: '下身', part: 'bottom', types: ['長褲', '牛仔褲', '短褲', '裙子'] },
    { name: '洋裝／連身', part: 'full', types: [] },
    { name: '外套', part: 'outer', types: ['外套', '大衣', '羽絨衣'] },
    { name: '鞋子', part: 'shoes', types: ['運動鞋', '皮鞋', '靴子', '涼鞋', '拖鞋', '高跟鞋'] },
    { name: '配件', part: 'accessory', types: ['皮帶', '太陽眼鏡', '帽子', '圍巾', '包包', '耳環', '項鍊', '戒指', '手環', '手錶'] }
  ];
  var COLORS = [
    { name: '黑', hex: '#111827' }, { name: '白', hex: '#ffffff' }, { name: '灰', hex: '#9ca3af' },
    { name: '米', hex: '#e8dcc4' }, { name: '咖啡', hex: '#7c4a2d' }, { name: '藍', hex: '#3b82f6' },
    { name: '海軍藍', hex: '#1e3a8a' }, { name: '綠', hex: '#16a34a' }, { name: '紅', hex: '#dc2626' },
    { name: '粉紅', hex: '#f9a8d4' }, { name: '黃', hex: '#facc15' }, { name: '紫', hex: '#8b5cf6' },
    { name: '其他', hex: 'conic-gradient(#dc2626, #facc15, #16a34a, #3b82f6, #8b5cf6, #dc2626)' }
  ];
  var PATTERNS = ['素色', '條紋', '格紋', '碎花', '印花', '圓點', '其他'];
  var SEASONS = ['春', '夏', '秋', '冬'];
  var STYLES = ['休閒', '正式', '運動', '度假'];

  function groupOf(name) { return GROUPS.find(function (g) { return g.name === name; }); }

  function colorHex(name) {
    var c = COLORS.find(function (x) { return x.name === name; });
    return c ? c.hex : '#ccc';
  }

  function empty() {
    return { group: '', type: '', part: '', colors: [], pattern: '', seasons: [], styles: [], brand: '' };
  }

  // 有選大類才算「有標籤」
  function hasTags(c) { return !!(c && c.group); }

  // 名稱預設用細項或大類，例如「襯衫」「洋裝／連身」
  function typeName(c) { return c ? (c.type || c.group || '') : ''; }

  // 從名稱猜大類與細項，例如「白色襯衫」→ 上衣／襯衫
  function guess(name, norm) {
    var q = norm(name);
    if (!q) return null;
    var best = null, bestLen = 0;
    GROUPS.forEach(function (g) {
      (g.types.length ? g.types : [g.name.split('／')[0]]).forEach(function (t) {
        var k = norm(t);
        if (k.length >= 2 && q.indexOf(k) >= 0 && k.length > bestLen) {
          bestLen = k.length;
          best = { group: g.name, type: g.types.length ? t : '' };
        }
      });
    });
    return best;
  }

  // ---------- 上一版衣櫃資料的轉換 ----------
  var OLD_TYPE = {
    'T恤': ['上衣', 'T 恤'], '長袖上衣': ['上衣', 'T 恤'], '襯衫': ['上衣', '襯衫'], '毛衣': ['上衣', '毛衣'],
    '運動服': ['上衣', ''], '睡衣': ['上衣', ''],
    '長褲': ['下身', '長褲'], '牛仔褲': ['下身', '牛仔褲'], '短褲': ['下身', '短褲'], '裙子': ['下身', '裙子'],
    '洋裝': ['洋裝／連身', ''], '泳衣': ['洋裝／連身', ''],
    '外套': ['外套', '外套'], '羽絨外套': ['外套', '羽絨衣'], '大衣': ['外套', '大衣'],
    '鞋子': ['鞋子', ''],
    '帽子': ['配件', '帽子'], '圍巾': ['配件', '圍巾'], '包包': ['配件', '包包'], '內衣褲': ['配件', ''], '其他配件': ['配件', '']
  };
  var OLD_COLOR = { '米色': '米', '深藍': '海軍藍', '橘': '其他', '多色': '其他' };
  var OLD_PATTERN = { '點點': '圓點', '圖案': '其他', '迷彩': '其他' };
  var OLD_STYLE = { '上班': '正式' };

  function uniq(arr) { return arr.filter(function (v, i) { return v && arr.indexOf(v) === i; }); }

  function fromOld(old) {
    var t = OLD_TYPE[old.type] || ['', ''];
    var g = groupOf(t[0]);
    return {
      group: t[0], type: t[1], part: g ? g.part : '',
      colors: uniq((old.colors || []).map(function (c) { return OLD_COLOR[c] || c; }))
        .filter(function (c) { return COLORS.some(function (x) { return x.name === c; }); }),
      pattern: (function (p) { p = OLD_PATTERN[p] || p || ''; return PATTERNS.indexOf(p) >= 0 ? p : ''; })(old.pattern),
      seasons: (old.seasons || []).filter(function (s) { return SEASONS.indexOf(s) >= 0; }),
      styles: uniq((old.styles || []).map(function (s) { return OLD_STYLE[s] || s; }))
        .filter(function (s) { return STYLES.indexOf(s) >= 0; }),
      brand: old.brand || ''
    };
  }

  // ---------- 點選元件 ----------
  function chips(values, selected, kind) {
    return values.map(function (v) {
      var name = typeof v === 'string' ? v : v.name;
      var on = Array.isArray(selected) ? selected.indexOf(name) >= 0 : selected === name;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-v="' + esc(name) + '">' +
        (kind === 'color' ? '<i class="sw" style="background:' + colorHex(name) + '"></i>' : '') +
        esc(name) + '</button>';
    }).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /*
   * 在 el 裡建立標籤點選區。
   * opts.onChange(tags, key)：任何標籤改變時呼叫
   * opts.brands()：回傳品牌建議清單
   */
  function createPicker(el, opts) {
    var tags = empty();
    var listId = 'brands-' + Math.random().toString(36).slice(2, 7);

    el.innerHTML =
      '<div class="field-title">衣服種類</div>' +
      '<div class="chips pick" data-k="group"></div>' +
      '<div class="sub-types" data-sub hidden><div class="chips pick" data-k="type"></div></div>' +
      '<div class="field-title">顏色 <span class="muted small">可複選</span></div>' +
      '<div class="chips pick" data-k="colors" data-many></div>' +
      '<div class="field-title">花紋</div>' +
      '<div class="chips pick" data-k="pattern"></div>' +
      '<div class="field-title">適合季節 <span class="muted small">可複選</span></div>' +
      '<div class="chips pick" data-k="seasons" data-many></div>' +
      '<div class="field-title">風格 <span class="muted small">可複選</span></div>' +
      '<div class="chips pick" data-k="styles" data-many></div>' +
      '<label>品牌<input data-k="brand" maxlength="30" placeholder="例如：UNIQLO" list="' + listId + '">' +
      '<datalist id="' + listId + '"></datalist></label>';

    var q = function (sel) { return el.querySelector(sel); };

    function render() {
      var g = groupOf(tags.group);
      q('[data-k="group"]').innerHTML = chips(GROUPS, tags.group);
      q('[data-sub]').hidden = !(g && g.types.length);
      q('[data-k="type"]').innerHTML = g ? chips(g.types, tags.type) : '';
      q('[data-k="colors"]').innerHTML = chips(COLORS, tags.colors, 'color');
      q('[data-k="pattern"]').innerHTML = chips(PATTERNS, tags.pattern);
      q('[data-k="seasons"]').innerHTML = chips(SEASONS, tags.seasons);
      q('[data-k="styles"]').innerHTML = chips(STYLES, tags.styles);
      if (document.activeElement !== q('[data-k="brand"]')) q('[data-k="brand"]').value = tags.brand || '';
      var brands = opts && opts.brands ? opts.brands() : [];
      q('datalist').innerHTML = brands.map(function (b) { return '<option value="' + esc(b) + '">'; }).join('');
    }

    el.addEventListener('click', function (e) {
      var chip = e.target.closest('.pick [data-v]');
      if (!chip) return;
      var box = chip.parentElement;
      var key = box.getAttribute('data-k');
      var v = chip.getAttribute('data-v');
      if (box.hasAttribute('data-many')) {
        var i = tags[key].indexOf(v);
        if (i >= 0) tags[key].splice(i, 1); else tags[key].push(v);
      } else {
        tags[key] = tags[key] === v ? '' : v;
      }
      if (key === 'group') {
        tags.type = '';
        var g = groupOf(tags.group);
        tags.part = g ? g.part : '';
      }
      render();
      if (opts && opts.onChange) opts.onChange(tags, key);
    });

    q('[data-k="brand"]').addEventListener('input', function () {
      tags.brand = this.value.trim();
      if (opts && opts.onChange) opts.onChange(tags, 'brand');
    });

    render();
    return {
      get: function () { return tags; },
      set: function (c) {
        tags = Object.assign(empty(), JSON.parse(JSON.stringify(c || {})));
        var g = groupOf(tags.group);
        tags.part = g ? g.part : '';
        render();
      },
      render: render
    };
  }

  window.Clothing = {
    GROUPS: GROUPS, COLORS: COLORS, PATTERNS: PATTERNS, SEASONS: SEASONS, STYLES: STYLES,
    groupOf: groupOf, colorHex: colorHex, empty: empty, hasTags: hasTags, typeName: typeName,
    guess: guess, fromOld: fromOld, createPicker: createPicker
  };
})();
