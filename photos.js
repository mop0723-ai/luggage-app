/*
 * 照片：先壓縮，再存進瀏覽器的 IndexedDB（容量比 localStorage 大很多）
 *
 * IndexedDB 資料庫 luggage-photos／photos，以照片 id 為鍵。
 * 每筆內容：{ blob, width, height, size, createdAt, cloudUrl }
 *   - cloudUrl：已上傳到雲端時記下位置（'item-photos/<帳號 id>/<照片 id>.jpg'）；
 *     這裡是照片的本機暫存，讓衣櫃打開快、沒網路也看得到
 * 上一版存的是單純的 Blob，讀取時兩種格式都支援。
 */
(function () {
  'use strict';

  var MAX_SIDE = 600;              // 最長邊像素
  var QUALITIES = [0.7, 0.6, 0.5]; // 太大就逐步降低畫質
  var TARGET_BYTES = 100 * 1024;   // 盡量在 100KB 以內

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

  function put(id, photo) {
    return tx('readwrite', function (s) { return s.put(photo, id); }).then(function () { forget(id); });
  }
  function get(id) {
    return tx('readonly', function (s) { return s.get(id); }).then(function (v) {
      if (!v) return null;
      return v instanceof Blob ? { blob: v } : v;
    });
  }
  function del(id) {
    forget(id);
    return tx('readwrite', function (s) { return s.delete(id); });
  }

  var urlCache = {};
  function url(id) {
    if (!id) return Promise.resolve(null);
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return get(id).then(function (p) {
      if (!p || !p.blob) return null;
      urlCache[id] = URL.createObjectURL(p.blob);
      return urlCache[id];
    }).catch(function () { return null; });
  }
  function forget(id) {
    if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('無法讀取照片')); };
      img.src = u;
    });
  }

  // 縮小到最長邊 600 像素，存成 JPEG（品質 0.7，太大再降）
  function compress(file) {
    return loadImage(file).then(function (img) {
      var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      function attempt(i) {
        return new Promise(function (resolve) {
          canvas.toBlob(resolve, 'image/jpeg', QUALITIES[i]);
        }).then(function (blob) {
          if (!blob) throw new Error('壓縮失敗');
          if (blob.size > TARGET_BYTES && i < QUALITIES.length - 1) return attempt(i + 1);
          return {
            blob: blob, width: canvas.width, height: canvas.height, size: blob.size,
            createdAt: Date.now(), cloudUrl: null
          };
        });
      }
      return attempt(0);
    });
  }

  // 把 <img data-photo="照片id"> 填上照片
  function fillThumbs(root) {
    root.querySelectorAll('img[data-photo]').forEach(function (img) {
      url(img.getAttribute('data-photo')).then(function (u) {
        if (u) { img.src = u; img.classList.remove('no-photo'); }
        else img.classList.add('no-photo');
      });
    });
  }

  // 列出所有照片（備份用）：[{ id, photo }]
  function list() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = [];
        var t = db.transaction('photos', 'readonly');
        var req = t.objectStore('photos').openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) return;
          var v = cur.value;
          out.push({ id: cur.key, photo: v instanceof Blob ? { blob: v } : v });
          cur.continue();
        };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  window.Photos = { compress: compress, put: put, get: get, del: del, url: url, fillThumbs: fillThumbs, list: list };
})();
