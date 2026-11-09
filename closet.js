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

  function packedItem(m) {
    return st().items.find(function (it) { return it.catalogId === m.id; });
  }

  function refWeight(tags) {
    var ref = App.findRef(C.typeName(tags));
    return ref ? ref.weight : 0.2;
  }

  // ---------- 衣櫃列表 ----------
  var tab = '';
  var fColor = '', fSeason = '', fStyle = '';

  function chipRow(values, current, attr, allLabel, withSwatch) {
    return [''].concat(values).map(function (v) {
      var name = typeof v === 'string' ? v : v.name;
      return '<button type="button" class="chip' + (name === current ? ' on' : '') + '" ' + attr + '="' + esc(name) + '">' +
        (withSwatch && name ? '<i class="sw" style="background:' + C.colorHex(name) + '"></i>' : '') +
        (name ? esc(name) : allLabel) + '</button>';
    }).join('');
  }

  function renderList() {
    var all = clothes();
    $('#closet-tabs').innerHTML = [{ name: '' }].concat(C.GROUPS).map(function (g) {
      var n = g.name ? all.filter(function (m) { return m.clothing.group === g.name; }).length : all.length;
      return '<button type="button" class="tab' + (g.name === tab ? ' on' : '') + '" data-tab="' + esc(g.name) + '">' +
        (g.name ? esc(shortGroup(g.name)) : '全部') + '<small>' + n + '</small></button>';
    }).join('');

    $('#closet-f-color').innerHTML = chipRow(C.COLORS, fColor, 'data-fcolor', '全部', true);
    $('#closet-f-season').innerHTML = chipRow(C.SEASONS, fSeason, 'data-fseason', '全部');
    $('#closet-f-style').innerHTML = chipRow(C.STYLES, fStyle, 'data-fstyle', '全部');

    var list = all.filter(function (m) {
      var c = m.clothing;
      return (!tab || c.group === tab) &&
        (!fColor || (c.colors || []).indexOf(fColor) >= 0) &&
        (!fSeason || (c.seasons || []).indexOf(fSeason) >= 0) &&
        (!fStyle || (c.styles || []).indexOf(fStyle) >= 0);
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    $('#closet-grid').innerHTML = list.length ? list.map(function (m) {
      var c = m.clothing;
      return '<a class="cloth" href="#closet/' + encodeURIComponent(m.id) + '">' +
        '<div class="ph">' + (m.photoId ? '<img data-photo="' + esc(m.photoId) + '" alt="' + esc(m.name) + '">' : '') +
        (packedItem(m) ? '<span class="packed">已放進行李</span>' : '') + '</div>' +
        '<div class="meta"><span class="t">' + esc(m.name) + '</span><span class="dots">' +
        (c.colors || []).map(function (n) {
          return '<i style="background:' + C.colorHex(n) + '" title="' + esc(n) + '"></i>';
        }).join('') + '</span></div>' +
        '<div class="brand">' + esc([C.typeName(c) !== m.name ? C.typeName(c) : '', c.brand].filter(Boolean).join('・')) + '&nbsp;</div>' +
        '</a>';
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
    var b = e.target.closest('[data-tab],[data-fcolor],[data-fseason],[data-fstyle]');
    if (!b) return;
    if (b.hasAttribute('data-tab')) tab = b.getAttribute('data-tab');
    if (b.hasAttribute('data-fcolor')) fColor = b.getAttribute('data-fcolor');
    if (b.hasAttribute('data-fseason')) fSeason = b.getAttribute('data-fseason');
    if (b.hasAttribute('data-fstyle')) fStyle = b.getAttribute('data-fstyle');
    renderList();
  });

  // ---------- 新增／編輯衣服 ----------
  var editing = null;     // 正在編輯的常帶物品 id，新增時為 null
  var newPhoto = null;
  var photoRemoved = false;
  var weightByUser = false;
  var autoName = '';

  var picker = C.createPicker($('#cf-tags'), {
    brands: App.allBrands,
    onChange: function (tags, key) {
      if (key !== 'group' && key !== 'type') return;
      var tn = C.typeName(tags);
      var nameEl = $('#cf-name');
      if (tn && (!nameEl.value.trim() || nameEl.value === autoName)) nameEl.value = autoName = tn;
      if (!weightByUser && tn) setWeight(refWeight(tags), true);
    }
  });

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
  }

  $('#closet-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var tags = picker.get();
    if (!tags.group) { App.toast('請先點選衣服種類'); return; }
    var name = $('#cf-name').value.trim() || C.typeName(tags);
    var grams = parseFloat($('#cf-weight').value);
    var weight = isFinite(grams) && grams >= 0 ? grams / 1000 : refWeight(tags);

    var isNew = !editing;
    var m = isNew
      ? App.normalizeEntry({ unit: '個', category: '必備品', bagId: st().bags[0] && st().bags[0].id, uses: 0 })
      : App.entryById(editing);
    m.name = name;
    m.weight = weight;
    m.estimated = !weightByUser;
    m.clothing = JSON.parse(JSON.stringify(tags));
    m.updatedAt = Date.now();
    if (isNew) st().memory.push(m);

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
    var s = st();
    var item = packedItem(m);
    if (item) {
      s.items = s.items.filter(function (it) { return it !== item; });
      App.toast('已從行李拿出來');
    } else {
      var bagId = $('#cf-bag').value;
      s.items.push({
        id: App.uid(), name: m.name, weight: m.weight, qty: 1, unit: m.unit || '個',
        category: m.category || '必備品', bagId: bagId, catalogId: m.id
      });
      m.bagId = bagId;
      m.uses = (m.uses || 0) + 1;
      var bag = s.bags.find(function (b) { return b.id === bagId; });
      App.toast('已放進' + (bag ? bag.name : '行李') + '：' + m.name);
    }
    App.save();
    renderPack();
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
