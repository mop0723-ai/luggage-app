/*
 * 匯出／匯入備份：把瀏覽器裡的所有資料（含照片）存成一個 .json 檔
 *
 * 檔案內容：
 *   { app: 'luggage-app', format: 1, exportedAt,
 *     localStorage: { 鍵: 值 }   以 luggage- 開頭的資料（不含登入憑證）
 *     photos: [{ id, type, data(base64), width, height, size, createdAt, cloudUrl }] }
 */
(function () {
  'use strict';

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var downloadURL = null;

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, type) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || 'image/jpeg' });
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function localData() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('luggage-') === 0) out[k] = localStorage.getItem(k);
    }
    return out;
  }

  // 第一步：準備備份檔（讀照片要一點時間）
  function prepare() {
    $('#backup-export').disabled = true;
    $('#backup-export').textContent = '準備中…';
    $('#backup-download').hidden = true;
    var data;
    try { data = localData(); } catch (e) { data = {}; }
    return Photos.list().catch(function () { return []; }).then(function (photos) {
      return Promise.all(photos.map(function (p) {
        var ph = p.photo || {};
        if (!ph.blob) return null;
        return blobToBase64(ph.blob).then(function (b64) {
          return { id: p.id, type: ph.blob.type || 'image/jpeg', data: b64, width: ph.width || null, height: ph.height || null,
            size: ph.blob.size, createdAt: ph.createdAt || null, cloudUrl: ph.cloudUrl || null };
        });
      }));
    }).then(function (photos) {
      photos = photos.filter(Boolean);
      var json = JSON.stringify({
        app: 'luggage-app', format: 1, exportedAt: new Date().toISOString(),
        localStorage: data, photos: photos
      });
      var blob = new Blob([json], { type: 'application/json' });
      if (downloadURL) URL.revokeObjectURL(downloadURL);
      downloadURL = URL.createObjectURL(blob);
      var a = $('#backup-download');
      a.href = downloadURL;
      a.download = 'luggage-backup-' + stamp() + '.json';
      var size = blob.size < 1024 * 1024 ? Math.max(1, Math.round(blob.size / 1024)) + ' KB' : (blob.size / 1024 / 1024).toFixed(1) + ' MB';
      a.textContent = '⬇️ 下載備份檔（' + size + '，含 ' + photos.length + ' 張照片）';
      a.hidden = false;
      App.toast('備份檔準備好了，請點「下載備份檔」');
    }).catch(function () {
      App.toast('備份失敗，請再試一次');
    }).then(function () {
      $('#backup-export').disabled = false;
      $('#backup-export').textContent = '匯出備份';
    });
  }

  // 匯入：用備份檔取代這台裝置上的資料
  function restore(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var b;
      try { b = JSON.parse(reader.result); } catch (e) { b = null; }
      if (!b || b.app !== 'luggage-app' || !b.localStorage) { App.toast('這不是行李規劃的備份檔'); return; }
      var when = b.exportedAt ? new Date(b.exportedAt).toLocaleString('zh-TW') : '不明時間';
      if (!confirm('要用 ' + when + ' 的備份，取代這台裝置上目前的資料嗎？\n（照片 ' + (b.photos || []).length + ' 張）\n\n有登入雲端的話，還原後會再和雲端同步。')) return;
      try {
        Object.keys(b.localStorage).forEach(function (k) {
          if (k.indexOf('luggage-') === 0 && k !== 'luggage-cloud-v1') localStorage.setItem(k, b.localStorage[k]);
        });
      } catch (e) { App.toast('空間不足，無法還原'); return; }
      Promise.all((b.photos || []).map(function (p) {
        return Photos.put(p.id, {
          blob: base64ToBlob(p.data, p.type), width: p.width, height: p.height, size: p.size,
          createdAt: p.createdAt, cloudUrl: null
        });
      })).then(function () {
        App.toast('還原完成，重新載入中…');
        setTimeout(function () { location.reload(); }, 800);
      }).catch(function () {
        App.toast('部分照片無法還原，可能是空間不足');
        setTimeout(function () { location.reload(); }, 1500);
      });
    };
    reader.readAsText(file);
  }

  $('#backup-export').addEventListener('click', prepare);
  $('#backup-import').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (f) restore(f);
  });

  window.Backup = { prepare: prepare };
})();
