/*
 * 我的衣櫃：列出常帶物品裡「有衣服標籤」的每一件
 * 上方依大類分頁（上衣、下身、洋裝、外套、鞋子、配件），再依顏色、季節、風格篩選
 */
(function () {
  'use strict';

  var App = window.App;
  var C = window.Clothing;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;
  var Photos = window.Photos;

  function st() { return App.state(); }
  function isCloth(m) { return !!(m.clothing && m.clothing.group); }
  function clothes() { return st().memory.filter(isCloth); }
  function shortGroup(name) { return name.split('／')[0]; }

  function packedItem(m) { return App.packedItem(m); }

  function bagName(id) {
    var b = st().bags.find(function (x) { return x.id === id; });
    return b ? b.name : '行李';
  }

  function refWeight(tags) {
    var ref = App.findRef(C.refName(tags)) || App.findRef(tags.group);
    return ref ? ref.weight : 0.2;
  }

  // ---------- 衣櫃列表 ----------
  var tab = '';
  var fHome = '', fColor = '', fSeason = '', fStyle = '';

  function chipRow(values, current, attr, allLabel, withSwatch) {
    return [''].concat(values).map(function (v) {
      var name = typeof v === 'string' ? v : v.name;
      return '<button type="button" class="chip' + (name === current ? ' on' : '') + '" ' + attr + '="' + esc(name) + '">' +
        (withSwatch && name ? '<i class="sw" style="background:' + C.colorHex(name) + '"></i>' : '') +
        (name ? esc(name) : allLabel) + '</button>';
    }).join('');
  }

  // 依位置篩選：某個家（含待確認）、在行李裡、未設定
  function homeMatch(loc, f) {
    if (f === '在行李裡') return loc.state === 'packed';
    if (f === '未設定') return loc.state === 'none';
    return (loc.state === 'home' || loc.state === 'pending') && loc.home === f;
  }

  // ---------- 詳細頁：位置與移動紀錄 ----------
  function renderLocation(m) {
    var box = $('#cf-loc');
    box.hidden = !m;
    if (!m) return;
    var loc = App.locOf(m);
    var bag = loc.bagId && App.bagById(loc.bagId);
    var here = loc.state === 'home' || loc.state === 'pending' ? loc.home : '';
    $('#cf-loc-now').textContent = App.locText(loc) + (bag && loc.state !== 'home' ? '・' + bag.name : '');
    $('#cf-loc-moves').textContent = App.movesText(m) || '還沒有移動紀錄';
    $('#cf-loc-btns').innerHTML = App.homes().filter(function (h) { return h !== here || loc.state === 'pending'; }).map(function (h) {
      return '<button type="button" class="chip" data-move-home="' + esc(h) + '">移到 ' + esc(h) + '</button>';
    }).join('');
  }

  $('#cf-loc-btns').addEventListener('click', function (e) {
    var b = e.target.closest('[data-move-home]');
    var m = App.entryById(editing);
    if (!b || !m) return;
    var h = b.getAttribute('data-move-home');
    var loc = App.locOf(m);
    var msg = loc.state === 'packed'
      ? '「' + m.name + '」現在在行李裡。要從行李拿出來，改放在「' + h + '」嗎？'
      : '要把「' + m.name + '」移到「' + h + '」嗎？';
    if (!confirm(msg)) return;
    if (packedItem(m)) st().items = st().items.filter(function (it) { return it.catalogId !== m.id; });
    App.markHome(m, h, App.todayStr(), true);
    App.save();
    var t = picker.get(); t.home = h; picker.render();
    renderLocation(m);
    renderPack();
    App.toast('已移到' + h);
  });

  function renderList() {
    var all = clothes();
    $('#closet-tabs').innerHTML = [{ name: '' }].concat(C.GROUPS).map(function (g) {
      var n = g.name ? all.filter(function (m) { return m.clothing.group === g.name; }).length : all.length;
      return '<button type="button" class="tab' + (g.name === tab ? ' on' : '') + '" data-tab="' + esc(g.name) + '">' +
        (g.name ? esc(shortGroup(g.name)) : '全部') + '<small>' + n + '</small></button>';
    }).join('');

    // 顏色篩選：只列出目前分頁裡有用到的顏色
    var used = [];
    all.forEach(function (m) {
      if (tab && m.clothing.group !== tab) return;
      (m.clothing.colors || []).forEach(function (c) { if (used.indexOf(c) < 0) used.push(c); });
    });
    var colorOpts = C.ALL_COLORS.filter(function (c) { return used.indexOf(c) >= 0; })
      .concat(used.filter(function (c) { return C.ALL_COLORS.indexOf(c) < 0; }));
    if (fColor && colorOpts.indexOf(fColor) < 0) fColor = '';
    $('#closet-f-color').parentElement.hidden = !colorOpts.length;
    $('#closet-f-color').innerHTML = chipRow(colorOpts, fColor, 'data-fcolor', '全部', true);
    $('#closet-f-season').innerHTML = chipRow(C.SEASONS, fSeason, 'data-fseason', '全部');
    $('#closet-f-style').innerHTML = chipRow(C.STYLES, fStyle, 'data-fstyle', '全部');
    // 家：清單裡的每個家；有衣服還沒設定家的話，多一個「未設定」
    var homeOpts = App.homes().slice();
    homeOpts.push('在行李裡');
    if (all.some(function (m) { return App.locOf(m).state === 'none'; })) homeOpts.push('未設定');
    if (fHome && homeOpts.indexOf(fHome) < 0) fHome = '';
    $('#closet-f-home').innerHTML = chipRow(homeOpts, fHome, 'data-fhome', '全部');

    var list = all.filter(function (m) {
      var c = m.clothing;
      return (!tab || c.group === tab) &&
        (!fHome || homeMatch(App.locOf(m), fHome)) &&
        (!fColor || (c.colors || []).indexOf(fColor) >= 0) &&
        (!fSeason || (c.seasons || []).indexOf(fSeason) >= 0) &&
        (!fStyle || (c.styles || []).indexOf(fStyle) >= 0);
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    $('#closet-grid').innerHTML = list.length ? list.map(function (m) {
      var c = m.clothing;
      var packed = packedItem(m);
      var loc = App.locOf(m);
      return '<div class="cloth"><a class="cloth-link" href="#closet/' + encodeURIComponent(m.id) + '">' +
        '<div class="ph">' + (m.photoId ? '<img data-photo="' + esc(m.photoId) + '" alt="' + esc(m.name) + '">' : '') +
        (loc.state === 'pending' ? '<span class="packed pending">待確認</span>' : packed ? '<span class="packed">已打包</span>' : '') + '</div>' +
        '<div class="meta"><span class="t">' + esc(m.name) + '</span><span class="dots">' +
        (c.colors || []).map(function (n) {
          return '<i style="background:' + C.colorHex(n) + '" title="' + esc(n) + '"></i>';
        }).join('') + '</span></div>' +
        '<div class="brand">' + esc([C.typeName(c) !== m.name ? C.typeName(c) : '', c.brand].filter(Boolean).join('・')) + '&nbsp;</div>' +
        '<div class="home' + (loc.state === 'none' ? ' muted' : '') + '">' + esc(App.locText(loc)) + '</div>' +
        '</a>' +
        '<button type="button" class="cloth-pack' + (packed ? ' done' : '') + '" data-pack="' + esc(m.id) + '">' +
        (packed ? '✓ 已打包・' + esc(bagName(packed.bagId)) : '放進行李') + '</button>' +
        '</div>';
    }).join('') : (all.length ? '<p class="empty">沒有符合的衣服</p>' : '');
    Photos.fillThumbs($('#closet-grid'));

    $('#closet-empty').hidden = all.length > 0;
    var info = all.length ? '共 ' + all.length + ' 件' : '';
    $('#closet-storage').textContent = info;
    if (all.length && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        if (e && e.usage) $('#closet-storage').textContent = info + '・照片與資料約 ' + (e.usage / 1024 / 1024).toFixed(1) + ' MB';
      }).catch(function () {});
    }
  }

  $('#closet-list').addEventListener('click', function (e) {
    var pk = e.target.closest('[data-pack]');
    if (pk) { onPackButton(App.entryById(pk.getAttribute('data-pack'))); return; }
    var b = e.target.closest('[data-tab],[data-fhome],[data-fcolor],[data-fseason],[data-fstyle]');
    if (!b) return;
    if (b.hasAttribute('data-fhome')) fHome = b.getAttribute('data-fhome');
    if (b.hasAttribute('data-tab')) tab = b.getAttribute('data-tab');
    if (b.hasAttribute('data-fcolor')) fColor = b.getAttribute('data-fcolor');
    if (b.hasAttribute('data-fseason')) fSeason = b.getAttribute('data-fseason');
    if (b.hasAttribute('data-fstyle')) fStyle = b.getAttribute('data-fstyle');
    renderList();
  });

  // ---------- 卡片上的「放進行李」 ----------
  var sheetEntry = null;

  function onPackButton(m) {
    if (!m) return;
    var item = packedItem(m);
    if (item) {
      if (confirm('「' + m.name + '」已打包在' + bagName(item.bagId) + '。\n要從行李拿出來嗎？')) {
        App.unpackEntry(m);
        App.toast('已從行李拿出來：' + m.name);
        renderList();
      }
      return;
    }
    openBagSheet(m);
  }

  function openBagSheet(m) {
    sheetEntry = m;
    $('#bag-sheet-title').textContent = '「' + m.name + '」放進哪個行李？';
    $('#bag-sheet-list').innerHTML = st().bags.map(function (b) {
      return '<button type="button" class="btn sheet-bag" data-bag="' + esc(b.id) + '">' + esc(b.name) + '</button>';
    }).join('');
    $('#bag-sheet').hidden = false;
  }

  function closeBagSheet() {
    $('#bag-sheet').hidden = true;
    sheetEntry = null;
  }

  $('#bag-sheet').addEventListener('click', function (e) {
    var b = e.target.closest('[data-bag]');
    if (b && sheetEntry) {
      var m = sheetEntry;
      App.packEntry(m, b.getAttribute('data-bag'));
      App.toast('已放進' + bagName(b.getAttribute('data-bag')) + '：' + m.name);
      closeBagSheet();
      renderList();
      return;
    }
    // 點「取消」或視窗外面就關掉
    if (e.target.id === 'bag-sheet' || e.target.id === 'bag-sheet-cancel') closeBagSheet();
  });

  // ---------- 新增／編輯衣服 ----------
  var editing = null;     // 正在編輯的常帶物品 id，新增時為 null
  var newPhoto = null;
  var photoRemoved = false;
  var weightByUser = false;
  var autoName = '';

  var picker = C.createPicker($('#cf-tags'), {
    brands: App.allBrands,
    homes: App.homes,
    addHome: App.addHome,
    customs: App.customs,
    addCustom: App.addCustom,
    watches: function () {
      // 編輯手錶時，不列出自己
      return App.watches().filter(function (w) { return w.id !== editing; });
    },
    onChange: function (tags, key) {
      syncHeavy();
      if (key !== 'group' && key !== 'type' && key !== 'subtype') return;
      var tn = C.typeName(tags);
      var nameEl = $('#cf-name');
      if (tn && (!nameEl.value.trim() || nameEl.value === autoName)) nameEl.value = autoName = tn;
      if (!weightByUser && tn) setWeight(refWeight(tags), true);
    }
  });

  // 鞋子很重：重量欄位特別顯眼
  function syncHeavy() {
    var heavy = picker.get().group === '鞋子';
    $('#cf-weight-label').classList.toggle('weight-strong', heavy);
    $('#cf-heavy-tip').hidden = !heavy;
  }

  // 手錶的詳細頁：列出可以搭配的錶帶
  function renderStraps(m) {
    var box = $('#cf-straps');
    var isWatch = m && m.clothing && m.clothing.group === '配件' && m.clothing.type === '手錶';
    var straps = isWatch ? st().memory.filter(function (x) {
      return x.clothing && x.clothing.type === '錶帶' && (x.clothing.fitsWatches || []).indexOf(m.id) >= 0;
    }) : [];
    box.hidden = !isWatch;
    if (!isWatch) return;
    $('#cf-straps-list').innerHTML = straps.length ? straps.map(function (x) {
      var c = x.clothing;
      return '<a class="pick-tile" href="#closet/' + encodeURIComponent(x.id) + '">' +
        '<span class="pick-ph">' + (x.photoId ? '<img data-photo="' + esc(x.photoId) + '" alt="">' : '') + '</span>' +
        '<span class="pick-name">' + esc(x.name) + '</span>' +
        '<span class="pick-home">' + esc([c.material, (c.colors || []).join('/')].filter(Boolean).join('・') || ' ') + '</span></a>';
    }).join('') : '<p class="muted small">還沒有錶帶。新增錶帶時，在「適用手錶」選這支手錶，就會顯示在這裡。</p>';
    Photos.fillThumbs($('#cf-straps-list'));
  }

  function setWeight(kg, approx) {
    $('#cf-weight').value = kg == null ? '' : Math.round(kg * 1000);
    $('#cf-approx').hidden = !approx;
  }

  $('#cf-weight').addEventListener('input', function () {
    weightByUser = this.value !== '';
    $('#cf-approx').hidden = true;
  });

  function showPhoto(url) {
    $('#cf-photo-img').hidden = !url;
    if (url) $('#cf-photo-img').src = url;
    $('#cf-photo-hint').hidden = !!url;
    $('#cf-photo-change').hidden = !url;
    $('#cf-photo-remove').hidden = !url;
    $('#cf-photo-box').classList.toggle('has-photo', !!url);
  }

  $('#cf-photo').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    App.toast('照片壓縮中…');
    Photos.compress(file).then(function (p) {
      newPhoto = p;
      photoRemoved = false;
      showPhoto(URL.createObjectURL(p.blob));
      App.toast('照片已壓縮為 ' + Math.max(1, Math.round(p.size / 1024)) + ' KB');
    }).catch(function () {
      App.toast('這張照片讀不到，請換一張試試');
    });
  });

  $('#cf-photo-remove').addEventListener('click', function () {
    newPhoto = null;
    photoRemoved = true;
    showPhoto(null);
  });

  function renderPack() {
    var m = App.entryById(editing);
    if (!m) return;
    var item = packedItem(m);
    var bags = st().bags;
    var bag = item && bags.find(function (b) { return b.id === item.bagId; });
    $('#cf-pack-title').textContent = item ? '已放在「' + (bag ? bag.name : '行李') + '」' : '放進行李';
    $('#cf-bag').hidden = !!item;
    $('#cf-bag').innerHTML = bags.map(function (b) {
      return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>';
    }).join('');
    if (m.bagId && bags.some(function (b) { return b.id === m.bagId; })) $('#cf-bag').value = m.bagId;
    $('#cf-pack').textContent = item ? '從行李拿出來' : '放進行李';
    $('#cf-pack').classList.toggle('out', !!item);
  }

  function openForm(id) {
    var m = id && id !== 'new' ? App.entryById(id) : null;
    if (id && id !== 'new' && !m) { location.replace('#closet'); return; }
    editing = m ? m.id : null;
    newPhoto = null;
    photoRemoved = false;
    weightByUser = !!(m && !m.estimated);
    autoName = '';

    $('#cf-title').textContent = m ? '編輯衣服' : '新增衣服';
    $('#cf-name').value = m ? m.name : '';
    picker.set(m ? m.clothing : (tab ? { group: tab } : C.empty()));
    if (m) setWeight(m.weight, !!m.estimated);
    else if (tab) setWeight(refWeight(picker.get()), true);
    else setWeight(null, false);
    if (!m && tab) $('#cf-name').value = autoName = C.typeName(picker.get());

    showPhoto(null);
    if (m && m.photoId) Photos.url(m.photoId).then(function (u) {
      if (editing === m.id && !newPhoto && !photoRemoved) showPhoto(u);
    });

    $('#cf-extra').hidden = !m;
    if (m) renderPack();
    renderStraps(m);
    renderLocation(m);
    syncHeavy();
  }

  $('#closet-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var tags = picker.get();
    if (!tags.group) { App.toast('請先點選單品類別'); return; }
    var name = $('#cf-name').value.trim() || C.typeName(tags);
    var grams = parseFloat($('#cf-weight').value);
    var weight = isFinite(grams) && grams >= 0 ? grams / 1000 : refWeight(tags);

    var isNew = !editing;
    var before = isNew ? null : App.locOf(App.entryById(editing));
    var m = isNew
      ? App.normalizeEntry({ unit: '個', category: '必備品', bagId: st().bags[0] && st().bags[0].id, uses: 0 })
      : App.entryById(editing);
    m.name = name;
    m.weight = weight;
    m.estimated = !weightByUser;
    m.clothing = JSON.parse(JSON.stringify(tags));
    // 睡衣以「一套」為單位；改成別的類別就回到「個」
    if (tags.group === '睡衣') m.unit = '套';
    else if (m.unit === '套') m.unit = '個';
    m.updatedAt = Date.now();
    if (isNew) st().memory.push(m);
    // 「放在哪個家」改了，而且不在行李裡：當作搬到那個家（記一筆移動紀錄）
    if (tags.home) {
      if (isNew) { m.moves = [{ home: tags.home, date: App.todayStr() }]; m.location = { state: 'home', home: tags.home, since: App.todayStr() }; }
      else if (before && before.state !== 'packed' && before.state !== 'pending' && before.home !== tags.home) App.markHome(m, tags.home, App.todayStr(), true);
    }

    var oldPhotoId = null;
    if (photoRemoved && !newPhoto && m.photoId) { oldPhotoId = m.photoId; m.photoId = null; }

    // 已在行李裡的話，同步名稱和重量
    var item = packedItem(m);
    if (item) { item.name = m.name; item.weight = m.weight; }

    var job = Promise.resolve();
    if (newPhoto) {
      m.photoId = m.id;
      job = Photos.put(m.photoId, newPhoto).catch(function () {
        m.photoId = null;
        App.toast('照片存不進去，可能是瀏覽器空間不足');
      });
    }
    job.then(function () {
      App.save();
      App.dropPhotoIfUnused(oldPhotoId);
      App.toast(isNew ? '已加入衣櫃' : '已儲存');
      location.hash = '#closet';
    });
  });

  $('#cf-pack').addEventListener('click', function () {
    var m = App.entryById(editing);
    if (!m) return;
    if (packedItem(m)) {
      App.unpackEntry(m);
      App.toast('已從行李拿出來');
    } else {
      var bagId = $('#cf-bag').value;
      App.packEntry(m, bagId);
      App.toast('已放進' + bagName(bagId) + '：' + m.name);
    }
    renderPack();
    renderLocation(m);
  });

  $('#cf-delete').addEventListener('click', function () {
    var m = App.entryById(editing);
    if (!m || !confirm('要把「' + m.name + '」從衣櫃刪除嗎？照片也會一起刪除。\n（已經放進行李的那件會保留在行李清單裡）')) return;
    var s = st();
    s.memory = s.memory.filter(function (x) { return x !== m; });
    App.save();
    App.dropPhotoIfUnused(m.photoId);
    App.toast('已刪除');
    location.hash = '#closet';
  });

  // ---------- 對外 ----------
  var askedPersist = false;
  function show(param) {
    var inForm = !!param;
    $('#closet-list').hidden = inForm;
    $('#closet-form').hidden = !inForm;
    picker.render();
    if (inForm) openForm(param); else renderList();
    // 請瀏覽器盡量不要自動清掉照片
    if (!askedPersist && navigator.storage && navigator.storage.persist) {
      askedPersist = true;
      navigator.storage.persist().catch(function () {});
    }
  }

  window.Closet = { show: show };
})();
