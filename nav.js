/*
 * 導覽：中間的「＋」選單、首頁「放進更多東西」、之後才做的功能入口
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;

  // ---------- 「＋」選單 ----------
  function closePlus() { $('#plus-sheet').hidden = true; }

  $('#plus-btn').addEventListener('click', function () { $('#plus-sheet').hidden = false; });
  $('#plus-sheet').addEventListener('click', function (e) {
    var a = e.target.closest('.plus-item');
    if (a) {
      closePlus();
      var focus = a.getAttribute('data-focus');
      if (focus) setTimeout(function () { var el = document.getElementById(focus); if (el) el.focus(); }, 300);
      return;
    }
    if (e.target.id === 'plus-sheet' || e.target.id === 'plus-close') closePlus();
  });

  // ---------- 之後才做的功能 ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-soon]');
    if (b) App.toast('「' + b.getAttribute('data-soon') + '」即將推出');
  });

  // ---------- 首頁：放進更多東西 ----------
  var moreBag = null, moreTab = 'closet';

  function openMore(bagId) {
    moreBag = bagId;
    var bag = App.bagById(bagId);
    $('#more-title').textContent = '放進「' + (bag ? bag.name : '行李') + '」';
    $('#more-search').value = '';
    renderMore();
    $('#more-sheet').hidden = false;
  }

  function renderMore() {
    document.querySelectorAll('[data-more-tab]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-more-tab') === moreTab);
    });
    var q = App.norm($('#more-search').value || '');
    var list = App.state().memory.filter(function (m) {
      if ((moreTab === 'closet') !== App.isCloth(m)) return false;
      if (App.packedItem(m)) return false;
      return !q || App.norm(m.name).indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.uses || 0) - (a.uses || 0) || a.name.localeCompare(b.name, 'zh-Hant'); });
    $('#more-list').innerHTML = list.length ? list.map(function (m) {
      var loc = App.locOf(m);
      return '<button type="button" class="more-row" data-more-pick="' + esc(m.id) + '">' +
        (m.photoId ? '<img class="bp-thumb" data-photo="' + esc(m.photoId) + '" alt="">' : '<span class="bp-thumb none"></span>') +
        '<span class="more-name">' + esc(m.name) + '<span class="muted small">' + esc(App.locText(loc)) + '・' + esc(App.fmtWeight(m.weight || 0)) + '</span></span>' +
        '<span class="more-add">＋</span></button>';
    }).join('') : '<p class="muted small">' + (moreTab === 'closet' ? '衣櫃' : '抽屜') + '裡沒有還沒打包的東西。</p>';
    Photos.fillThumbs($('#more-list'));
  }

  $('#more-sheet').addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-more-tab]'))) { moreTab = el.getAttribute('data-more-tab'); renderMore(); return; }
    if ((el = t.closest('[data-more-pick]'))) {
      var m = App.entryById(el.getAttribute('data-more-pick'));
      if (m && moreBag) {
        App.packEntry(m, moreBag);
        App.toast('已放進：' + m.name);
        renderMore();
        App.renderHome();
      }
      return;
    }
    if (t.closest('.more-add-link')) { $('#more-sheet').hidden = true; return; }
    if (t.id === 'more-sheet' || t.id === 'more-close') $('#more-sheet').hidden = true;
  });
  $('#more-search').addEventListener('input', renderMore);

  window.Nav = { openMore: openMore };
})();
