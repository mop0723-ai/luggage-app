/*
 * 雲端：Supabase 登入與同步
 *
 * - 資料先存在這台裝置（localStorage／IndexedDB），有網路時再和雲端同步，所以沒網路也能用。
 * - 雲端資料表 app_state：每個帳號一筆 { user_id, data, version }；data 裡只存照片路徑（photoPath），
 *   照片本身放 Storage 的 item-photos／<帳號 id>／<照片 id>.jpg（上一版的 photos 空間會自動搬過來）
 * - 每個人只能讀寫自己的資料，由 Supabase 的 Row Level Security 保護（設定見 supabase/setup.sql）。
 * - 兩台裝置都改過時，以「上次同步的內容」為基準逐筆合併：
 *     只有一邊改 → 用改過的；兩邊都新增 → 都保留；一邊刪掉、另一邊沒動 → 刪除；兩邊改同一筆 → 用較新的。
 *
 * 下面的金鑰是 publishable（公開）金鑰，本來就可以放在網頁裡；絕對不要把 service_role 金鑰放進程式。
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://yzdpaczdtwdtmqurreut.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_k68Sm2jBOEYfi4OCKfmFRQ_MYzs7x_4';
  var META_KEY = 'luggage-cloud-v1';   // { userId, version, base（上次同步的資料，JSON 字串）}
  var BUCKET = 'item-photos';      // 照片放這裡：item-photos／<帳號 id>／<照片 id>.jpg
  var OLD_BUCKET = 'photos';       // 上一版用的空間：照片搬到 item-photos 並確認後就刪掉
  var DEL_KEY = 'luggage-photo-deletes';   // 等有網路時要從雲端刪掉的照片（照片 id）

  var App = window.App;
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = App.esc;

  var client = null;
  var user = null;
  var syncing = null;      // 進行中的同步（Promise）
  var again = false;       // 同步中又有新變更，結束後再跑一次
  var timer = null;
  var status = { state: 'idle', text: '', at: null };

  // ---------- 小工具 ----------
  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* 空間不足時下次再存 */ }
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function hhmm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  function friendly(err) {
    var m = (err && (err.message || err.error_description || err.msg)) || String(err || '');
    var code = err && err.code;
    if (/Invalid login credentials/i.test(m)) return 'Email 或密碼不正確';
    if (/Email not confirmed/i.test(m)) return '這個帳號還沒確認，請先到信箱點確認連結';
    if (/already registered|already been registered/i.test(m)) return '這個 Email 已經註冊過了，請直接登入';
    if (/Password should be at least/i.test(m)) return '密碼至少要 6 個字';
    if (/rate limit|too many/i.test(m)) return '嘗試太多次了，請稍等幾分鐘再試';
    if (/valid email|invalid.*email/i.test(m)) return 'Email 格式不正確';
    if (code === '42P01' || code === 'PGRST205' || /app_state/.test(m) && /not exist|schema cache/i.test(m)) {
      return '雲端資料表還沒建立，請先在 Supabase 執行設定 SQL';
    }
    if (/Bucket not found/i.test(m)) return '照片空間 item-photos 還沒建立，請先在 Supabase 執行照片設定 SQL';
    if (/row-level security|violates/i.test(m)) return '雲端權限設定不正確，請重新執行設定 SQL';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return '連不上雲端，有網路後會自動再試';
    return m || '發生錯誤';
  }

  // ---------- 合併 ----------
  function byIdArray(arr) {
    return arr.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x) && x.id; });
  }
  function primitiveArray(arr) {
    return arr.every(function (x) { return x === null || typeof x !== 'object'; });
  }

  function mergeById(b, l, r, hasBase) {
    var B = {}, L = {}, R = {};
    b.forEach(function (x) { B[x.id] = x; });
    l.forEach(function (x) { L[x.id] = x; });
    r.forEach(function (x) { R[x.id] = x; });
    function decide(id) {
      var inB = hasBase && id in B, inL = id in L, inR = id in R;
      if (inL && inR) {
        if (eq(L[id], R[id])) return L[id];
        if (inB && eq(L[id], B[id])) return R[id];
        if (inB && eq(R[id], B[id])) return L[id];
        return (R[id].updatedAt || 0) > (L[id].updatedAt || 0) ? R[id] : L[id];
      }
      if (inL) return inB && eq(L[id], B[id]) ? null : L[id];   // 雲端刪掉、這台沒動 → 刪除
      return inB && eq(R[id], B[id]) ? null : R[id];            // 這台刪掉、雲端沒動 → 刪除
    }
    var out = [], seen = {};
    l.forEach(function (x) { seen[x.id] = 1; var v = decide(x.id); if (v) out.push(v); });
    r.forEach(function (x) { if (seen[x.id]) return; var v = decide(x.id); if (v) out.push(v); });
    return out;
  }

  function mergeSet(b, l, r, hasBase) {
    var out = [];
    l.forEach(function (x) {
      if (r.indexOf(x) >= 0 || !(hasBase && b.indexOf(x) >= 0)) { if (out.indexOf(x) < 0) out.push(x); }
    });
    r.forEach(function (x) {
      if (l.indexOf(x) < 0 && !(hasBase && b.indexOf(x) >= 0) && out.indexOf(x) < 0) out.push(x);
    });
    return out;
  }

  function plainObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  // 三方合併：base＝上次同步的內容（第一次同步時是 null，兩邊全部保留）
  // 裡面是物件的欄位（例如回程購物 shopping：plans、purchases、ratio）也逐項合併，兩台都改過時不會整包蓋掉
  function merge3(base, local, remote) {
    var hasBase = !!base;
    base = base || {};
    var out = {};
    var keys = Object.keys(local).concat(Object.keys(remote).filter(function (k) { return !(k in local); }));
    keys.forEach(function (k) {
      var b = base[k], l = local[k], r = remote[k];
      if (l === undefined) { out[k] = r; return; }
      if (r === undefined) { out[k] = l; return; }
      if (Array.isArray(l) && Array.isArray(r)) {
        var both = l.concat(r);
        var bArr = Array.isArray(b) ? b : [];
        if (byIdArray(both)) { out[k] = mergeById(bArr, l, r, hasBase && Array.isArray(b)); return; }
        if (primitiveArray(both)) { out[k] = mergeSet(bArr, l, r, hasBase && Array.isArray(b)); return; }
      }
      if (plainObj(l) && plainObj(r)) { out[k] = merge3(hasBase && plainObj(b) ? b : null, l, r); return; }
      out[k] = hasBase && eq(l, b) ? r : l;
    });
    return out;
  }

  // ---------- 照片 ----------
  // app_state 裡每件物品只存照片的路徑（photoPath）；照片本身在 Storage，
  // iPad 上另外在 IndexedDB 留一份暫存（打開快、沒網路也看得到）。
  function pathFor(uid, id) { return uid + '/' + id + '.jpg'; }
  function tagFor(path) { return BUCKET + '/' + path; }   // 暫存裡記下「已在新空間」
  // 有照片的資料：衣櫃／抽屜物品，加上行李箱
  function withPhoto() { return App.state().memory.concat(App.state().bags || []).filter(function (m) { return m.photoId; }); }

  // 確認照片真的在雲端、而且大小正確
  function verify(path, size) {
    var folder = path.split('/')[0], name = path.split('/').slice(1).join('/');
    return client.storage.from(BUCKET).list(folder, { search: name, limit: 100 }).then(function (res) {
      if (res.error) throw res.error;
      var f = (res.data || []).find(function (x) { return x.name === name; });
      if (!f) throw new Error('照片上傳後在雲端找不到，下次再試');
      var sz = f.metadata && (f.metadata.size != null ? f.metadata.size : f.metadata.contentLength);
      if (sz != null && size != null && Number(sz) !== Number(size)) throw new Error('照片大小不符，下次再試');
    });
  }

  function removeOld(paths) {
    return client.storage.from(OLD_BUCKET).remove(paths).then(function () {}, function () {});
  }

  // 上傳新照片，並把舊空間（photos）的照片搬到 item-photos：上傳 → 確認 → 才刪舊的
  function uploadPhotos(uid) {
    var changed = false, n = 0;
    App.state().memory.forEach(function (m) {
      if (!m.photoId && m.photoPath) { m.photoPath = null; changed = true; }
    });
    return withPhoto().reduce(function (chain, m) {
      return chain.then(function () {
        var id = m.photoId, path = pathFor(uid, id);
        return Photos.get(id).then(function (p) {
          if (p && p.blob && p.cloudUrl === tagFor(path)) {
            if (m.photoPath !== path) { m.photoPath = path; changed = true; }
            return;
          }
          // 本機沒有照片：看看舊空間有沒有（例如這台還沒下載過）
          var source = p && p.blob ? Promise.resolve(p) :
            client.storage.from(OLD_BUCKET).download(path).then(function (r) {
              return r.error || !r.data ? null : { blob: r.data, size: r.data.size, createdAt: Date.now() };
            }, function () { return null; });
          return source.then(function (rec) {
            if (!rec) return;   // 兩邊都沒有：可能已經在新空間，等一下的下載會處理
            n++;
            setStatus('syncing', '照片 ' + n);
            return client.storage.from(BUCKET).upload(path, rec.blob, {
              upsert: true, contentType: rec.blob.type || 'image/jpeg', cacheControl: '31536000'
            }).then(function (res) {
              if (res.error) throw res.error;
              return verify(path, rec.blob.size);
            }).then(function () {
              rec.cloudUrl = tagFor(path);
              return Photos.put(id, rec);
            }).then(function () {
              if (m.photoPath !== path) { m.photoPath = path; changed = true; }
              return removeOld([path]);
            });
          });
        });
      });
    }, Promise.resolve()).then(function () {
      if (changed) App.saveQuiet();
    });
  }

  // 這台沒有的照片：從雲端下載並存一份在本機
  function downloadPhotos(uid) {
    var got = 0;
    return withPhoto().reduce(function (chain, m) {
      return chain.then(function () {
        var id = m.photoId;
        return Photos.get(id).then(function (p) {
          if (p && p.blob) return;
          var path = m.photoPath || pathFor(uid, id);
          return client.storage.from(BUCKET).download(path).then(function (res) {
            if (!res.error && res.data) return { blob: res.data, tag: tagFor(path) };
            return client.storage.from(OLD_BUCKET).download(path).then(function (r2) {
              return !r2.error && r2.data ? { blob: r2.data, tag: path } : null;
            }, function () { return null; });
          }).then(function (r) {
            if (!r) return;   // 雲端也沒有（例如另一台還沒上傳），下次再試
            got++;
            return Photos.put(id, { blob: r.blob, size: r.blob.size, createdAt: Date.now(), cloudUrl: r.tag });
          });
        });
      });
    }, Promise.resolve()).then(function () { return got; });
  }

  // 刪除物品或移除照片：記下來，同步時從雲端刪掉（沒網路時等有網路再刪）
  function loadDel() { try { return JSON.parse(localStorage.getItem(DEL_KEY)) || []; } catch (e) { return []; } }
  function saveDel(list) { try { localStorage.setItem(DEL_KEY, JSON.stringify(list)); } catch (e) { /* 下次再存 */ } }

  function queueDelete(photoId) {
    if (!photoId) return;
    var list = loadDel();
    if (list.indexOf(photoId) < 0) { list.push(photoId); saveDel(list); }
    schedule();
  }

  function processDeletes(uid) {
    var list = loadDel();
    if (!list.length) return Promise.resolve();
    var inUse = withPhoto().map(function (m) { return m.photoId; });
    var todo = list.filter(function (id) { return inUse.indexOf(id) < 0; });   // 又被用回來的不刪
    if (!todo.length) { saveDel([]); return Promise.resolve(); }
    var paths = todo.map(function (id) { return pathFor(uid, id); });
    return client.storage.from(BUCKET).remove(paths).then(function (res) {
      if (res.error) throw res.error;
      return removeOld(paths);
    }).then(function () {
      saveDel(loadDel().filter(function (id) { return todo.indexOf(id) < 0; }));
    });
  }

  // ---------- 同步 ----------
  function setStatus(state, text) {
    status = { state: state, text: text || '', at: state === 'ok' ? new Date() : status.at };
    renderStatus();
  }

  function sync() {
    if (!client || !user) return Promise.resolve();
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
    if (syncing) { again = true; return syncing; }
    setStatus('syncing');
    syncing = run(user.id).then(function () {
      setStatus('ok');
    }).catch(function (err) {
      setStatus(navigator.onLine ? 'error' : 'offline', friendly(err));
    }).then(function () {
      syncing = null;
      if (again) { again = false; schedule(500); }
    });
    return syncing;
  }

  function run(uid) {
    var meta = loadMeta();
    var attempt = 0;
    function loop() {
      if (attempt++ > 5) throw new Error('同步衝突太多次，請稍後再試');
      return client.from('app_state').select('data, version').eq('user_id', uid).maybeSingle().then(function (res) {
        if (res.error) throw res.error;
        var local = clone(App.state());
        var base = meta.userId === uid && meta.base ? JSON.parse(meta.base) : null;

        // 雲端還沒有資料：把這台的資料上傳
        if (!res.data) {
          delete local.pristine;
          return client.from('app_state').insert({ user_id: uid, data: local, version: 1 }).then(function (ins) {
            if (ins.error) {
              if (ins.error.code === '23505') return loop();   // 另一台剛好先建立了，改走合併
              throw ins.error;
            }
            meta = { userId: uid, version: 1, base: JSON.stringify(local) };
            saveMeta(meta);
          });
        }

        var remote = res.data.data || {};
        var rv = res.data.version;
        // 這台是剛裝好、還沒用過的：直接用雲端的資料
        var merged = !base && local.pristine ? clone(remote) : base && rv === meta.version ? local : merge3(base, local, remote);
        delete merged.pristine;

        // 合併期間你剛好又改了資料：重來一次，避免蓋掉
        if (!eq(App.state(), local)) return loop();
        if (!eq(merged, local)) App.replaceState(merged);
        merged = clone(App.state());

        if (eq(merged, remote)) {
          meta = { userId: uid, version: rv, base: JSON.stringify(merged) };
          saveMeta(meta);
          return;
        }
        return client.from('app_state')
          .update({ data: merged, version: rv + 1, updated_at: new Date().toISOString() })
          .eq('user_id', uid).eq('version', rv).select('version')
          .then(function (up) {
            if (up.error) throw up.error;
            if (!up.data || !up.data.length) {          // 另一台剛好也更新了：用最新的再合併一次
              // 基準維持「上次真正同步的內容」，不能換成這次合併的結果，否則這台新增的東西會被當成在別台刪掉
              meta = { userId: uid, version: -1, base: base ? JSON.stringify(base) : null };
              return loop();
            }
            meta = { userId: uid, version: rv + 1, base: JSON.stringify(merged) };
            saveMeta(meta);
          });
      });
    }
    return uploadPhotos(uid).then(loop).then(function () {
      return processDeletes(uid);
    }).then(function () {
      return downloadPhotos(uid);
    }).then(function (got) {
      if (got) App.refreshView();
    });
  }

  // 資料有變更時呼叫：稍等一下再同步，避免一直上傳
  function schedule(ms) {
    if (!client || !user) return;
    clearTimeout(timer);
    timer = setTimeout(sync, ms == null ? 2500 : ms);
  }

  // ---------- 畫面 ----------
  function renderStatus() {
    var el = $('#cloud-status');
    var pill = $('#cloud-pill');
    var text = '', cls = status.state;
    if (!client) { text = '雲端暫時無法使用'; cls = 'off'; }
    else if (!user) { text = '未登入雲端'; cls = 'off'; }
    else if (status.state === 'syncing') text = '同步中…';
    else if (status.state === 'offline') text = '離線中，有網路後會自動同步';
    else if (status.state === 'error') text = '同步失敗：' + status.text;
    else if (status.state === 'ok') text = '已同步 ' + hhmm(status.at);
    else text = '準備同步…';
    if (el) { el.textContent = text; el.className = 'cloud-status ' + cls; }
    if (pill) {
      pill.textContent = (cls === 'ok' ? '☁️ ' : cls === 'error' ? '⚠️ ' : cls === 'syncing' ? '🔄 ' : '☁️ ') +
        (user && cls === 'ok' ? '已同步' : text);
      pill.className = 'cloud-pill ' + cls;
    }
  }

  function render() {
    var box = $('#cloud-box');
    if (!box) return;
    if (!client) {
      box.innerHTML = '<p class="muted small">雲端功能暫時無法使用（可能沒有網路）。資料仍安全地存在這台裝置，有網路後重新整理即可。</p>';
    } else if (!user) {
      var meta = loadMeta();
      box.innerHTML =
        '<div class="field-title">登入雲端</div>' +
        '<p class="muted small">登入後，資料和照片會存到雲端，換裝置也看得到。第一次登入時，這台裝置的資料會自動上傳，不會遺失。</p>' +
        '<label>Email<input id="cl-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com"></label>' +
        '<label>密碼<input id="cl-pass" type="password" autocomplete="current-password" placeholder="至少 6 個字"></label>' +
        '<div class="cloud-btns"><button type="button" id="cl-login" class="btn primary">登入</button>' +
        '<button type="button" id="cl-signup" class="btn ghost">註冊新帳號</button></div>' +
        '<button type="button" id="cl-forgot" class="link small">忘記密碼</button>' +
        (meta.userId ? '<p class="muted small">登出後，資料仍保留在這台裝置。</p>' : '');
    } else {
      box.innerHTML =
        '<div class="cloud-user">已登入：<b>' + esc(user.email || '') + '</b></div>' +
        '<div id="cloud-status" class="cloud-status"></div>' +
        '<div class="cloud-btns"><button type="button" id="cl-sync" class="btn ghost">立即同步</button>' +
        '<button type="button" id="cl-logout" class="btn ghost">登出</button></div>';
    }
    renderStatus();
  }

  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    if (label) btn.textContent = label;
  }

  function creds() {
    var email = ($('#cl-email') || {}).value || '';
    var pass = ($('#cl-pass') || {}).value || '';
    email = email.trim();
    if (!email) { App.toast('請輸入 Email'); return null; }
    if (pass.length < 6) { App.toast('密碼至少要 6 個字'); return null; }
    return { email: email, password: pass };
  }

  function redirectURL() { return location.origin + location.pathname; }

  document.addEventListener('click', function (e) {
    var id = e.target && e.target.id;
    if (!id || id.indexOf('cl-') !== 0) return;
    if (!client) return;
    if (id === 'cl-login') {
      var c = creds(); if (!c) return;
      busy(e.target, true, '登入中…');
      client.auth.signInWithPassword(c).then(function (res) {
        if (res.error) throw res.error;
        App.toast('登入成功，開始同步');
      }).catch(function (err) {
        App.toast(friendly(err));
        busy(e.target, false, '登入');
      });
    }
    if (id === 'cl-signup') {
      var c2 = creds(); if (!c2) return;
      busy(e.target, true, '註冊中…');
      client.auth.signUp({ email: c2.email, password: c2.password, options: { emailRedirectTo: redirectURL() } }).then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.session) App.toast('註冊成功，已登入');
        else alert('已寄出確認信到 ' + c2.email + '。\n請到信箱點信裡的連結確認帳號，再回到這裡用 Email 和密碼登入。');
      }).catch(function (err) {
        App.toast(friendly(err));
      }).then(function () { busy(e.target, false, '註冊新帳號'); });
    }
    if (id === 'cl-forgot') {
      var email = (($('#cl-email') || {}).value || '').trim();
      if (!email) { App.toast('請先在上面輸入 Email'); return; }
      client.auth.resetPasswordForEmail(email, { redirectTo: redirectURL() }).then(function (res) {
        if (res.error) throw res.error;
        alert('已寄出重設密碼的信到 ' + email + '。\n點信裡的連結後，會請你輸入新密碼。');
      }).catch(function (err) { App.toast(friendly(err)); });
    }
    if (id === 'cl-sync') sync();
    if (id === 'cl-logout') {
      if (!confirm('要登出嗎？\n登出後資料仍保留在這台裝置，但不會再和雲端同步。')) return;
      Promise.resolve(syncing).then(function () { return client.auth.signOut(); }).then(function () {
        App.toast('已登出');
      });
    }
  });

  // ---------- 登入狀態 ----------
  var lastUserId = null;
  function onSignedIn() {
    var meta = loadMeta();
    if (meta.userId && meta.userId !== user.id) {
      var ok = confirm('這台裝置上的資料，之前是和另一個帳號同步的。\n要把這些資料合併到目前登入的帳號（' + (user.email || '') + '）嗎？\n\n按「取消」會登出。');
      if (!ok) { client.auth.signOut(); return; }
      saveMeta({});
    }
    sync();
  }

  function init() {
    if (!window.supabase || !window.supabase.createClient) { render(); return; }
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'sb-luggage-auth' }
      });
    } catch (e) { client = null; render(); return; }

    client.auth.onAuthStateChange(function (event, session) {
      user = session ? session.user : null;
      // 不要在這個 callback 裡直接呼叫 Supabase，延後一下再處理
      setTimeout(function () {
        if (event === 'PASSWORD_RECOVERY') {
          window.Clothing.askText('設定新密碼', '至少 6 個字').then(function (pw) {
            if (pw && pw.length >= 6) {
              client.auth.updateUser({ password: pw }).then(function (res) {
                App.toast(res.error ? friendly(res.error) : '密碼已更新');
              });
            } else if (pw !== null) App.toast('密碼至少要 6 個字');
          });
        }
        var uid = user ? user.id : null;
        if (uid !== lastUserId) {
          lastUserId = uid;
          render();
          if (user) onSignedIn();
        }
        // 確認信、重設密碼連結回來時，網址會帶一串登入資訊，清掉
        if (/access_token|refresh_token|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#home');
      }, 0);
    });

    window.addEventListener('online', function () { schedule(300); });
    window.addEventListener('offline', function () { if (user) setStatus('offline'); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') schedule(300);
    });
    // 定期看看另一台裝置有沒有更新
    setInterval(function () { if (document.visibilityState === 'visible') sync(); }, 120000);
    render();
  }

  window.Cloud = { schedule: schedule, sync: sync, queueDelete: queueDelete, merge3: merge3, render: render, status: function () { return status; } };
  init();
})();
