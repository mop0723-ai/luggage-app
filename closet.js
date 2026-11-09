/* 我的衣櫃：幫每件衣服拍照、點選分類，並可一鍵放進行李 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;

  // ---------- 選項 ----------
  // ref：對應參考重量表（weights.js）的名稱，用來帶入大約重量與品類
  var TYPES = [
    { name: 'T恤', ref: 'T恤' },
    { name: '長袖上衣', ref: '長袖上衣' },
    { name: '襯衫', ref: '襯衫' },
    { name: '毛衣', ref: '毛衣' },
    { name: '外套', ref: '外套' },
    { name: '羽絨外套', ref: '羽絨外套' },
    { name: '大衣', ref: '大衣' },
    { name: '長褲', ref: '長褲' },
    { name: '牛仔褲', ref: '牛仔褲' },
    { name: '短褲', ref: '短褲' },
    { name: '裙子', ref: '裙子' },
    { name: '洋裝', ref: '洋裝' },
    { name: '運動服', ref: '運動服' },
    { name: '睡衣', ref: '睡衣' },
    { name: '泳衣', ref: '泳衣' },
    { name: '內衣褲', ref: '內衣' },
    { name: '鞋子', ref: '運動鞋' },
    { name: '帽子', ref: '帽子' },
    { name: '圍巾', ref: '圍巾' },
    { name: '包包', weight: 0.5, category: '必備品' },
    { name: '其他配件', weight: 0.1, category: '必備品' }
  ];
  var COLORS = [
    { name: '黑', hex: '#111827' }, { name: '白', hex: '#ffffff' }, { name: '灰', hex: '#9ca3af' },
    { name: '米色', hex: '#e8dcc4' }, { name: '咖啡', hex: '#7c4a2d' }, { name: '紅', hex: '#dc2626' },
    { name: '粉紅', hex: '#f9a8d4' }, { name: '橘', hex: '#f97316' }, { name: '黃', hex: '#facc15' },
    { name: '綠', hex: '#16a34a' }, { name: '藍', hex: '#3b82f6' }, { name: '深藍', hex: '#1e3a8a' },
    { name: '紫', hex: '#8b5cf6' },
    { name: '多色', hex: 'conic-gradient(#dc2626, #facc15, #16a34a, #3b82f6, #8b5cf6, #dc2626)' }
  ];
  var PATTERNS = ['素色', '條紋', '格紋', '點點', '碎花', '印花', '圖案', '迷彩', '其他'];
  var SEASONS = ['春', '夏', '秋', '冬'];
  var STYLES = ['休閒', '正式', '上班', '運動', '度假', '約會', '戶外', '居家'];

  function colorHex(name) {
    var c = COLORS.find(function (x) { return x.name === name; });
    return c ? c.hex : '#ccc';
  }

  function typeInfo(name) {
    var t = TYPES.find(function (x) { return x.name === name; }) || { name: name };
    var ref = t.ref ? App.findRef(t.ref) : null;
    return {
      weight: ref ? ref.weight : (t.weight || 0.2),
      category: ref ? ref.category : (t.category || '必備品')
    };
  }

  function wardrobe() { return App.state().wardrobe; }
  function findCloth(id) { return wardrobe().find(function (c) { return c.id === id; }); }

  // 衣服的顯示名稱，例如「UNIQLO 黑 T恤」
  function label(c) {
    return [c.brand, (c.colors || []).join('/'), c.type].filter(Boolean).join(' ');
  }

  function packedItem(c) {
    return App.state().items.find(function (it) { return it.wardrobeId === c.id; });
  }

  // ---------- 照片：壓縮後存在 IndexedDB ----------
  var MAX_SIDE = 900;      // 最長邊像素
  var TARGET_BYTES = 150 * 1024;
  var dbPromise = null;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open('luggage-photos', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('photos', mode);
        var req = fn(t.objectStore('photos'));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function putPhoto(id, blob) { return tx('readwrite', function (s) { return s.put(blob, id); }); }
  function getPhoto(id) { return tx('readonly', function (s) { return s.get(id); }); }
  function delPhoto(id) { return tx('readwrite', function (s) { return s.delete(id); }); }

  var urlCache = {};
  function photoURL(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return getPhoto(id).then(function (blob) {
      if (!blob) return null;
      urlCache[id] = URL.createObjectURL(blob);
      return urlCache[id];
    }).catch(function () { return null; });
  }
  function forgetURL(id) {
    if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('無法讀取照片')); };
      img.src = url;
    });
  }

  function toBlob(canvas, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
  }

  // 縮小到最長邊 900 像素，再用 JPEG 壓縮；太大就再降低畫質
  function compress(file) {
    return loadImage(file).then(function (img) {
      var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var qualities = [0.78, 0.65, 0.5];
      function attempt(i) {
        return toBlob(canvas, qualities[i]).then(function (blob) {
          if (blob && blob.size > TARGET_BYTES && i < qualities.length - 1) return attempt(i + 1);
          return blob;
        });
      }
      return attempt(0);
    });
  }

  // 首頁與衣櫃的小圖：<img data-photo="衣服id">
  function fillThumbs(root) {
    root.querySelectorAll('img[data-photo]').forEach(function (img) {
      photoURL(img.getAttribute('data-photo')).then(function (url) {
        if (url) { img.src = url; img.classList.remove('no-photo'); }
        else img.classList.add('no-photo');
      });
    });
  }

  // ---------- 衣櫃列表 ----------
  var filterType = '';
  var filterSeason = '';

  function renderList() {
    var all = wardrobe();
    var types = TYPES.map(function (t) { return t.name; }).filter(function (n) {
      return all.some(function (c) { return c.type === n; });
    });
    if (filterType && types.indexOf(filterType) < 0) filterType = '';

    $('#closet-filter-type').innerHTML = all.length
      ? [''].concat(types).map(function (t) {
          return '<button type="button" class="chip' + (t === filterType ? ' on' : '') + '" data-ftype="' + esc(t) + '">' +
            (t ? esc(t) : '全部') + '</button>';
        }).join('')
      : '';
    $('#closet-filter-season').innerHTML = all.length
      ? [''].concat(SEASONS).map(function (s) {
          return '<button type="button" class="chip' + (s === filterSeason ? ' on' : '') + '" data-fseason="' + esc(s) + '">' +
            (s ? esc(s) + '季' : '全部季節') + '</button>';
        }).join('')
      : '';

    var list = all.filter(function (c) {
      return (!filterType || c.type === filterType) &&
        (!filterSeason || (c.seasons || []).indexOf(filterSeason) >= 0);
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    $('#closet-grid').innerHTML = list.map(function (c) {
      var packed = packedItem(c);
      return '<a class="cloth" href="#closet/' + encodeURIComponent(c.id) + '">' +
        '<div class="ph"><img data-photo="' + esc(c.id) + '" alt="' + esc(label(c)) + '">' +
        (packed ? '<span class="packed">已放進行李</span>' : '') + '</div>' +
        '<div class="meta"><span class="t">' + esc(c.type || '未分類') + '</span><span class="dots">' +
        (c.colors || []).map(function (n) {
          return '<i style="background:' + colorHex(n) + '" title="' + esc(n) + '"></i>';
        }).join('') + '</span></div>' +
        (c.brand ? '<div class="brand">' + esc(c.brand) + '</div>' : '') +
        '</a>';
    }).join('');
    fillThumbs($('#closet-grid'));

    $('#closet-empty').hidden = all.length > 0;
    if (all.length && !list.length) {
      $('#closet-grid').innerHTML = '<p class="empty">沒有符合的衣服</p>';
    }

    var info = all.length ? '共 ' + all.length + ' 件衣服' : '';
    $('#closet-storage').textContent = info;
    if (all.length && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        if (e && e.usage) {
          $('#closet-storage').textContent = info + '・已使用約 ' + (e.usage / 1024 / 1024).toFixed(1) + ' MB';
        }
      }).catch(function () {});
    }
  }

  $('#closet-filter-type').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ftype]');
    if (b) { filterType = b.getAttribute('data-ftype'); renderList(); }
  });
  $('#closet-filter-season').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fseason]');
    if (b) { filterSeason = b.getAttribute('data-fseason'); renderList(); }
  });

  // ---------- 新增／編輯衣服 ----------
  var editing = null;      // 正在編輯的衣服 id，新增時為 null
  var draft = null;        // 表單內容
  var newPhoto = null;     // 這次拍的新照片（還沒存）
  var previewURL = null;
  var weightByUser = false;

  function pickHTML(values, selected, isColor) {
    return values.map(function (v) {
      var name = typeof v === 'string' ? v : v.name;
      var on = Array.isArray(selected) ? selected.indexOf(name) >= 0 : selected === name;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-v="' + esc(name) + '">' +
        (isColor ? '<i class="sw" style="background:' + colorHex(name) + '"></i>' : '') + esc(name) + '</button>';
    }).join('');
  }

  function renderPickers() {
    $('#cf-type').innerHTML = pickHTML(TYPES, draft.type);
    $('#cf-color').innerHTML = pickHTML(COLORS, draft.colors, true);
    $('#cf-pattern').innerHTML = pickHTML(PATTERNS, draft.pattern);
    $('#cf-season').innerHTML = pickHTML(SEASONS, draft.seasons);
    $('#cf-style').innerHTML = pickHTML(STYLES, draft.styles);
  }

  var FIELDS = { 'cf-type': 'type', 'cf-color': 'colors', 'cf-pattern': 'pattern', 'cf-season': 'seasons', 'cf-style': 'styles' };

  $('#closet-form').addEventListener('click', function (e) {
    var chip = e.target.closest('.pick [data-v]');
    if (!chip) return;
    var box = chip.parentElement;
    var key = FIELDS[box.id];
    var v = chip.getAttribute('data-v');
    if (box.getAttribute('data-mode') === 'many') {
      var arr = draft[key];
      var i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
    } else {
      draft[key] = draft[key] === v ? '' : v;
    }
    if (key === 'type' && !weightByUser) {
      if (draft.type) setWeight(typeInfo(draft.type).weight, true);
      else setWeight(null, false);
    }
    renderPickers();
  });

  function setWeight(kg, approx) {
    $('#cf-weight').value = kg == null ? '' : Math.round(kg * 1000);
    $('#cf-approx').hidden = !approx;
  }

  $('#cf-weight').addEventListener('input', function () {
    weightByUser = this.value !== '';
    $('#cf-approx').hidden = true;
    if (!weightByUser && draft.type) setWeight(typeInfo(draft.type).weight, true);
  });

  function showPhoto(url) {
    $('#cf-photo-img').hidden = !url;
    if (url) $('#cf-photo-img').src = url;
    $('#cf-photo-hint').hidden = !!url;
    $('#cf-photo-change').hidden = !url;
    $('#cf-photo-box').classList.toggle('has-photo', !!url);
  }

  $('#cf-photo').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    App.toast('照片壓縮中…');
    compress(file).then(function (blob) {
      if (!blob) throw new Error('壓縮失敗');
      newPhoto = blob;
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob);
      showPhoto(previewURL);
      App.toast('照片已壓縮為 ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB');
    }).catch(function () {
      App.toast('這張照片讀不到，請換一張試試');
    });
  });

  function renderBrands() {
    var brands = [];
    wardrobe().forEach(function (c) {
      if (c.brand && brands.indexOf(c.brand) < 0) brands.push(c.brand);
    });
    $('#brand-options').innerHTML = brands.map(function (b) { return '<option value="' + esc(b) + '">'; }).join('');
  }

  function renderPack() {
    var c = findCloth(editing);
    if (!c) return;
    var item = packedItem(c);
    var bags = App.state().bags;
    var bag = item && bags.find(function (b) { return b.id === item.bagId; });
    $('#cf-pack-title').textContent = item ? '已放在「' + (bag ? bag.name : '行李') + '」' : '放進行李';
    $('#cf-bag').hidden = !!item;
    $('#cf-bag').innerHTML = bags.map(function (b) {
      return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>';
    }).join('');
    $('#cf-pack').textContent = item ? '從行李拿出來' : '放進行李';
    $('#cf-pack').classList.toggle('out', !!item);
  }

  function openForm(id) {
    var c = id && id !== 'new' ? findCloth(id) : null;
    if (id && id !== 'new' && !c) { location.replace('#closet'); return; }
    editing = c ? c.id : null;
    draft = {
      type: c ? c.type : '',
      colors: c ? (c.colors || []).slice() : [],
      pattern: c ? c.pattern : '',
      seasons: c ? (c.seasons || []).slice() : [],
      styles: c ? (c.styles || []).slice() : []
    };
    newPhoto = null;
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
    weightByUser = !!(c && c.weightByUser);

    $('#cf-title').textContent = c ? '編輯衣服' : '新增衣服';
    $('#cf-brand').value = c ? c.brand || '' : '';
    if (c && c.weight != null) setWeight(c.weight, !c.weightByUser);
    else setWeight(null, false);
    renderPickers();
    renderBrands();
    showPhoto(null);
    if (c) photoURL(c.id).then(function (url) { if (editing === c.id && !newPhoto) showPhoto(url); });

    $('#cf-extra').hidden = !c;
    if (c) renderPack();
  }

  $('#closet-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!draft.type) { App.toast('請選擇種類'); return; }
    var grams = parseFloat($('#cf-weight').value);
    var weight = isFinite(grams) && grams >= 0 ? grams / 1000 : typeInfo(draft.type).weight;

    var isNew = !editing;
    var c = isNew ? { id: App.uid(), createdAt: Date.now() } : findCloth(editing);
    c.type = draft.type;
    c.colors = draft.colors;
    c.pattern = draft.pattern;
    c.seasons = draft.seasons;
    c.styles = draft.styles;
    c.brand = $('#cf-brand').value.trim();
    c.weight = weight;
    c.weightByUser = weightByUser;
    if (isNew) wardrobe().push(c);

    // 已在行李裡的話，同步名稱、重量
    var item = packedItem(c);
    if (item) { item.name = label(c); item.weight = c.weight; }

    var photoSaved = newPhoto
      ? putPhoto(c.id, newPhoto).then(function () { forgetURL(c.id); })
      : Promise.resolve();
    photoSaved.then(function () {
      App.save();
      App.toast(isNew ? '已加入衣櫃' : '已儲存');
      location.hash = '#closet';
    }).catch(function () {
      App.save();
      App.toast('照片存不進去，可能是瀏覽器空間不足');
    });
  });

  $('#cf-pack').addEventListener('click', function () {
    var c = findCloth(editing);
    if (!c) return;
    var st = App.state();
    var item = packedItem(c);
    if (item) {
      st.items = st.items.filter(function (it) { return it !== item; });
      App.toast('已從行李拿出來');
    } else {
      var info = typeInfo(c.type);
      var bagId = $('#cf-bag').value;
      st.items.push({
        id: App.uid(), name: label(c), weight: c.weight != null ? c.weight : info.weight,
        qty: 1, unit: '個', category: info.category, bagId: bagId, wardrobeId: c.id
      });
      var bag = st.bags.find(function (b) { return b.id === bagId; });
      App.toast('已放進' + (bag ? bag.name : '行李') + '：' + label(c));
    }
    App.save();
    renderPack();
  });

  $('#cf-delete').addEventListener('click', function () {
    var c = findCloth(editing);
    if (!c || !confirm('要把「' + label(c) + '」從衣櫃刪除嗎？照片也會一起刪除。')) return;
    var st = App.state();
    st.wardrobe = st.wardrobe.filter(function (x) { return x !== c; });
    // 行李裡的那件保留，只是不再連到照片
    st.items.forEach(function (it) { if (it.wardrobeId === c.id) delete it.wardrobeId; });
    App.save();
    delPhoto(c.id).catch(function () {});
    forgetURL(c.id);
    App.toast('已刪除');
    location.hash = '#closet';
  });

  // ---------- 對外 ----------
  var askedPersist = false;
  function show(param) {
    var inForm = !!param;
    $('#closet-list').hidden = inForm;
    $('#closet-form').hidden = !inForm;
    if (inForm) openForm(param); else renderList();
    // 請瀏覽器盡量不要自動清掉照片
    if (!askedPersist && navigator.storage && navigator.storage.persist) {
      askedPersist = true;
      navigator.storage.persist().catch(function () {});
    }
  }

  window.Closet = { show: show, fillThumbs: fillThumbs };
})();
