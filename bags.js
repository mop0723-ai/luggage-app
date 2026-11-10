/*
 * 我的行李箱（在「打包」裡）
 * 每個行李箱：{ id, name, kind(checked 托運／carry 手提／personal 背包), size, style, material, tare(空箱 kg),
 *              limit(沒填航班額度時的上限), home(放在哪個家), photoId, photoPath }
 * 位置：箱子裡有東西＝跟著旅程出門；空的＝在它的家（見 app.js bagLocOf）
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;

  var SIZES = ['20 吋', '24 吋', '26 吋', '28 吋', '31 吋'];
  var STYLES = ['胖胖箱', '一般五五開箱'];
  var MATERIALS = ['硬箱', '布箱'];
  var OTHER = '其他';

  function st() { return App.state(); }
  function kindName(k) { return (App.bagKinds().find(function (x) { return x[0] === k; }) || [, ''])[1]; }
  function fmt(n) { return (Math.round((Number(n) || 0) * 10) / 10).toFixed(1); }

  function locText(b) {
    var loc = App.bagLocOf(b);
    if (loc.state === 'out') return '🧳 跟著旅程出門' + (loc.fromHome ? '（從' + loc.fromHome + '）' : '') + '・裡面 ' + loc.count + ' 件';
    if (loc.state === 'home') return '📍 ' + loc.home;
    return '📍 未設定家';
  }

  // ---------- 列表 ----------
  function render() {
    var bags = st().bags;
    var order = App.homes().concat(['']);
    var html = order.map(function (h) {
      var list = bags.filter(function (b) {
        return h ? (b.home === h) : (!b.home || App.homes().indexOf(b.home) < 0);
      });
      if (!list.length) return '';
      return '<div class="bg-group"><div class="bp-cat">' + (h ? esc(h) : '未設定家') + '</div>' + list.map(function (b) {
        var spec = [kindName(b.kind), b.size, b.style, b.material].filter(Boolean).join('・');
        return '<button type="button" class="bg-row" data-bag-edit="' + esc(b.id) + '">' +
          (b.photoId ? '<img class="bg-thumb" data-photo="' + esc(b.photoId) + '" alt="">' : '<span class="bg-thumb none"></span>') +
          '<span class="bg-info"><b>' + esc(b.name) + '</b><span class="muted small">' + esc(spec) + '</span>' +
          '<span class="muted small">' + esc(locText(b)) + '</span></span>' +
          '<span class="bg-tare"><span class="muted small">空箱</span>' + fmt(b.tare) + ' kg</span></button>';
      }).join('') + '</div>';
    }).join('');
    $('#bg-list').innerHTML = html || '<p class="empty-big">還沒有行李箱。</p>';
    Photos.fillThumbs($('#bg-list'));
  }

  // ---------- 編輯 ----------
  var cur = null, isNew = false, newPhoto = null, photoRemoved = false;

  function chips(el, list, value, attr) {
    var opts = list.slice();
    if (value && opts.indexOf(value) < 0) opts.push(value);
    el.innerHTML = opts.map(function (o) {
      return '<button type="button" class="chip' + (o === value ? ' on' : '') + '" ' + attr + '="' + esc(o) + '">' + esc(o) + '</button>';
    }).join('') + '<button type="button" class="chip" ' + attr + '="' + OTHER + '">' + OTHER + '</button>';
  }

  function renderForm() {
    $('#bge-title').textContent = isNew ? '新增行李箱' : '編輯行李箱';
    $('#bge-kind').innerHTML = App.bagKinds().map(function (k) {
      return '<button type="button" class="' + (cur.kind === k[0] ? 'on' : '') + '" data-bge-kind="' + k[0] + '">' + k[1] + '</button>';
    }).join('');
    chips($('#bge-size'), SIZES, cur.size, 'data-bge-size');
    chips($('#bge-style'), STYLES, cur.style, 'data-bge-style');
    chips($('#bge-material'), MATERIALS, cur.material, 'data-bge-material');
    $('#bge-home').innerHTML = App.homes().map(function (h) {
      return '<button type="button" class="chip' + (cur.home === h ? ' on' : '') + '" data-bge-home="' + esc(h) + '">' + esc(h) + '</button>';
    }).join('');
    $('#bge-loc').textContent = isNew ? '' : locText(cur);
    $('#bge-delete').hidden = isNew;
  }

  function showPhoto(url) {
    $('#bge-photo-img').hidden = !url;
    if (url) $('#bge-photo-img').src = url;
    $('#bge-photo-label').textContent = url ? '換一張照片' : '加入照片（選填）';
    $('#bge-photo-remove').hidden = !url;
  }

  function open(id) {
    var b = id && App.bagById(id);
    isNew = !b;
    cur = b ? JSON.parse(JSON.stringify(b)) : { name: '', kind: 'checked', size: '', style: '', material: '', tare: '', home: App.homes()[0] || '', limit: 23 };
    newPhoto = null; photoRemoved = false;
    $('#bge-name').value = cur.name || '';
    $('#bge-tare').value = cur.tare !== '' && cur.tare != null ? cur.tare : '';
    renderForm();
    showPhoto(null);
    if (b && b.photoId) Photos.url(b.photoId).then(function (u) { if (!newPhoto && !photoRemoved) showPhoto(u); });
    $('#bge-sheet').hidden = false;
    $('#bge-sheet .org-panel').scrollTop = 0;
  }

  function pickOther(field, label) {
    window.Clothing.askText('自己輸入「' + label + '」', '').then(function (v) {
      v = (v || '').trim().slice(0, 20);
      if (v) { cur[field] = v; renderForm(); }
    });
  }

  $('#bge-sheet').addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-bge-kind]'))) { cur.kind = el.getAttribute('data-bge-kind'); renderForm(); return; }
    var map = [['data-bge-size', 'size', '尺寸'], ['data-bge-style', 'style', '款式'], ['data-bge-material', 'material', '材質']];
    for (var i = 0; i < map.length; i++) {
      if ((el = t.closest('[' + map[i][0] + ']'))) {
        var v = el.getAttribute(map[i][0]);
        if (v === OTHER) pickOther(map[i][1], map[i][2]);
        else { cur[map[i][1]] = cur[map[i][1]] === v ? '' : v; renderForm(); }
        return;
      }
    }
    if ((el = t.closest('[data-bge-home]'))) { cur.home = el.getAttribute('data-bge-home'); renderForm(); return; }
    if (t.id === 'bge-photo-remove') { newPhoto = null; photoRemoved = true; showPhoto(null); return; }
    if (t.id === 'bge-save') { save(); return; }
    if (t.id === 'bge-delete') { remove(); return; }
    if (t.id === 'bge-sheet' || t.id === 'bge-cancel') $('#bge-sheet').hidden = true;
  });

  $('#bge-photo').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    Photos.compress(file).then(function (p) {
      newPhoto = p; photoRemoved = false;
      showPhoto(URL.createObjectURL(p.blob));
    }).catch(function () { App.toast('這張照片讀不到，請換一張試試'); });
  });

  function save() {
    var name = $('#bge-name').value.trim();
    if (!name) { App.toast('請輸入名稱'); return; }
    var tare = parseFloat($('#bge-tare').value);
    var b = isNew ? App.normalizeBag({ id: App.uid() }) : App.bagById(cur.id);
    b.name = name;
    b.kind = cur.kind;
    b.size = cur.size; b.style = cur.style; b.material = cur.material;
    b.tare = isFinite(tare) && tare >= 0 ? tare : 0;
    b.home = cur.home || '';
    if (isNew) { b.limit = b.kind === 'checked' ? 23 : b.kind === 'carry' ? 7 : 5; st().bags.push(b); }
    var job = Promise.resolve();
    if (newPhoto) {
      b.photoId = 'bag-' + b.id;
      job = Photos.put(b.photoId, newPhoto).catch(function () { b.photoId = null; App.toast('照片存不進去'); });
    } else if (photoRemoved && b.photoId) {
      var old = b.photoId;
      b.photoId = null; b.photoPath = null;
      Photos.del(old).catch(function () {});
      if (window.Cloud) window.Cloud.queueDelete(old);
    }
    job.then(function () {
      App.save();
      $('#bge-sheet').hidden = true;
      App.toast(isNew ? '已新增行李箱' : '已儲存');
      render();
    });
  }

  function remove() {
    var b = App.bagById(cur.id);
    if (!b) return;
    if (App.bagLocOf(b).state === 'out') { App.toast('箱子裡還有東西，請先拿出來或換到別的箱子'); return; }
    if (st().bags.length <= 1) { App.toast('至少要保留一個行李箱'); return; }
    if (!confirm('要刪除行李箱「' + b.name + '」嗎？')) return;
    st().bags = st().bags.filter(function (x) { return x !== b; });
    (st().packLists || []).forEach(function (l) {
      Object.keys(l.zones || {}).forEach(function (z) { if (l.zones[z].bagId === b.id) { l.zones[z].bagId = null; l.zones[z].on = false; } });
    });
    if (b.photoId) { Photos.del(b.photoId).catch(function () {}); if (window.Cloud) window.Cloud.queueDelete(b.photoId); }
    App.save();
    $('#bge-sheet').hidden = true;
    App.toast('已刪除');
    render();
  }

  $('#view-bags').addEventListener('click', function (e) {
    var el = e.target.closest('[data-bag-edit]');
    if (el) { open(el.getAttribute('data-bag-edit')); return; }
    if (e.target.id === 'bg-add') open(null);
  });

  window.Bags = { show: render, open: open };
})();
