(function () {
  "use strict";
  var CFG = window.BOTS_CONFIG;
  var TZ = "Europe/Amsterdam";
  var UNLOCK_KEY = "mijnbots-unlock";
  var DATA_KEY = "mijnbots-data";
  var $ = function (id) { return document.getElementById(id); };
  var state = { data: null, pin: "", fetchedAt: null, fromCache: false };

  // ---------- SHA-256 (WebCrypto, met JS-fallback voor niet-HTTPS testen) ----------
  function sha256Fallback(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), result = "", words = [], bitLen = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0, isComposite = {};
    for (var c = 2; primeCounter < 64; c++) {
      if (!isComposite[c]) {
        for (var i = 0; i < 313; i += c) isComposite[i] = c;
        hash[primeCounter] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (var j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? "0" : "") + b.toString(16); }
    return result;
  }
  function sha256(text) {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    return Promise.resolve(sha256Fallback(text));
  }

  // ---------- Datum-opmaak ----------
  function dayKey(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  function timeStr(d) { return new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d); }
  function fmtDate(iso, long) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    var now = new Date(), yest = new Date(now.getTime() - 864e5);
    if (!long) {
      if (dayKey(d) === dayKey(now)) return "vandaag " + timeStr(d);
      if (dayKey(d) === dayKey(yest)) return "gisteren " + timeStr(d);
    }
    return new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: long ? "long" : "short", day: "numeric", month: long ? "long" : "short", year: long ? "numeric" : undefined, hour: "2-digit", minute: "2-digit" }).format(d);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- PIN ----------
  function unlockToken() { return CFG.PIN_SHA256 + ":" + CFG.CONFIG_VERSION; }
  function isUnlocked() { try { return localStorage.getItem(UNLOCK_KEY) === unlockToken(); } catch (e) { return false; } }
  function drawDots() {
    var h = "";
    for (var i = 0; i < CFG.PIN_LENGTH; i++) h += '<span class="dot' + (i < state.pin.length ? " on" : "") + '"></span>';
    $("pinDots").innerHTML = h;
  }
  function showLock() {
    state.pin = ""; drawDots();
    $("lockHint").textContent = "Voer je pincode in";
    $("lock").hidden = false; $("home").hidden = true; $("detail").hidden = true;
  }
  function pressKey(k) {
    if (k === "del") { state.pin = state.pin.slice(0, -1); drawDots(); return; }
    if (state.pin.length >= CFG.PIN_LENGTH) return;
    state.pin += k; drawDots();
    if (state.pin.length === CFG.PIN_LENGTH) {
      var tried = state.pin;
      sha256(tried).then(function (h) {
        if (h === CFG.PIN_SHA256) {
          try { localStorage.setItem(UNLOCK_KEY, unlockToken()); } catch (e) {}
          $("lock").hidden = true; route();
        } else {
          var dots = $("pinDots"); dots.classList.add("shake");
          $("lockHint").textContent = "Onjuiste pincode, probeer opnieuw";
          if (navigator.vibrate) navigator.vibrate(120);
          setTimeout(function () { dots.classList.remove("shake"); state.pin = ""; drawDots(); }, 450);
        }
      });
    }
  }
  $("keypad").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (b) pressKey(b.getAttribute("data-k"));
  });
  document.addEventListener("keydown", function (e) {
    if ($("lock").hidden) return;
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    else if (e.key === "Backspace") pressKey("del");
  });
  $("lockBtn").addEventListener("click", function () {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (e) {}
    showLock();
  });

  // ---------- Data ----------
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function loadData(manual) {
    var url = CFG.DATA_URL + "?t=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (d.offline || !Array.isArray(d.bots) || !d.bots.length) throw new Error("offline");
        state.data = d; state.fetchedAt = new Date(); state.fromCache = false;
        try { localStorage.setItem(DATA_KEY, JSON.stringify({ data: d, fetchedAt: state.fetchedAt.toISOString() })); } catch (e) {}
        if (manual) toast("Bijgewerkt ✓");
      })
      .catch(function () {
        try {
          var c = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
          if (c && c.data) { state.data = c.data; state.fetchedAt = new Date(c.fetchedAt); state.fromCache = true; }
        } catch (e) {}
        toast(state.data ? "Offline – laatst opgeslagen gegevens" : "Kan gegevens niet laden");
      })
      .then(render);
  }
  function findBot(id) { return state.data && state.data.bots.filter(function (b) { return b.id === id; })[0]; }

  // ---------- Weergave ----------
  function renderHome() {
    var d = state.data;
    var r = $("refreshed");
    if (!d) { r.textContent = "Geen gegevens"; $("botList").innerHTML = '<p class="empty">Kan de updates nu niet laden. Controleer je internetverbinding en tik op ↻.</p>'; return; }
    r.textContent = "Bijgewerkt: " + fmtDate(d.generated_at) + (state.fromCache ? " · offline" : "");
    $("botList").innerHTML = d.bots.map(function (b) {
      var u = b.updates && b.updates[0];
      return '<button class="bot-btn" style="--c:' + esc(b.color || "#666") + '" data-id="' + esc(b.id) + '">' +
        '<span class="bot-emoji">' + esc(b.emoji || "🤖") + "</span>" +
        '<span class="bot-text"><span class="bot-name">' + esc(b.name) + "</span>" +
        '<span class="bot-sub">' + esc(b.subtitle || "") + "</span>" +
        '<span class="bot-date">' + (u ? "🕒 " + esc(fmtDate(u.date)) : "Nog geen update beschikbaar") + "</span></span>" +
        '<span class="bot-chev">›</span></button>';
    }).join("");
  }
  function renderDetail(id) {
    var b = findBot(id);
    if (!b) { location.hash = ""; return; }
    $("detailBar").style.setProperty("--c", b.color || "#666");
    $("detailEmoji").textContent = b.emoji || "🤖";
    $("detailName").textContent = b.name;
    var ups = b.updates || [], h = "";
    if (!ups.length) {
      h = '<div class="card empty-card"><p class="big-empty">Nog geen update beschikbaar</p><p>Deze bot heeft nog geen rapport gestuurd. Kom later terug.</p></div>';
    } else {
      h = '<article class="card latest"><div class="card-date">Laatste update · ' + esc(fmtDate(ups[0].date, true)) + '</div><div class="md">' + window.renderMarkdown(ups[0].markdown) + "</div></article>";
      if (ups.length > 1) {
        h += '<h2 class="hist-title">Eerdere updates</h2>';
        h += ups.slice(1).map(function (u) {
          return '<details class="card hist"><summary>' + esc(fmtDate(u.date, true)) + '</summary><div class="md">' + window.renderMarkdown(u.markdown) + "</div></details>";
        }).join("");
      }
    }
    $("detailBody").innerHTML = h;
  }
  function route() {
    if (!isUnlocked()) { if ($("lock").hidden) showLock(); return; }
    var m = location.hash.match(/^#\/bot\/(.+)$/);
    if (m && state.data) {
      renderDetail(decodeURIComponent(m[1]));
      $("home").hidden = true; $("detail").hidden = false; window.scrollTo(0, 0);
    } else {
      renderHome();
      $("detail").hidden = true; $("home").hidden = false;
    }
  }
  function render() { route(); }

  $("botList").addEventListener("click", function (e) {
    var b = e.target.closest(".bot-btn"); if (b) location.hash = "#/bot/" + encodeURIComponent(b.getAttribute("data-id"));
  });
  $("backBtn").addEventListener("click", function () {
    if (history.length > 1 && /^#\/bot\//.test(location.hash)) history.back(); else location.hash = "";
  });
  $("refreshBtn").addEventListener("click", function () {
    var btn = $("refreshBtn"); btn.classList.add("spin");
    loadData(true).then(function () { btn.classList.remove("spin"); });
  });
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) loadData(false); });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // Start
  try {
    var c = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (c && c.data) { state.data = c.data; state.fetchedAt = new Date(c.fetchedAt); state.fromCache = true; }
  } catch (e) {}
  route();
  loadData(false);
})();
