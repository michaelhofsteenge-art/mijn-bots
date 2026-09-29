(function () {
  "use strict";
  var CFG = window.BOTS_CONFIG;
  var TZ = "Europe/Amsterdam";
  var UNLOCK_KEY = "mijnbots-unlock";
  var PIN_HASH_KEY = "mijnbots-pin-hash";
  var DATA_KEY = "mijnbots-data";
  var CRYPTO_TRADES_KEY = "mijnbots-crypto-trades";
  var CRYPTO_BOT_ID = "49692e76-c77b-46ae-9328-2144b4d7eb96";
  var REFRESH_MS = 60000;
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    data: null, pin: "", fetchedAt: null, fromCache: false,
    pinFlow: null, // null | { step, current, firstNew }
    refreshTimer: null
  };

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
  function todayInputValue() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- Detectie Chrome op iOS ----------
  function isChromeIOS() {
    var ua = navigator.userAgent || "";
    return /CriOS/i.test(ua) || (/iPhone|iPad|iPod/i.test(ua) && /Chrome/i.test(ua) && !/Safari\/\d/i.test(ua.replace(/CriOS.*/, "")));
  }
  function showChromeTips() {
    var show = isChromeIOS();
    var lockTip = $("lockChromeTip");
    var homeTip = $("homeChromeTip");
    if (lockTip) lockTip.hidden = !show;
    if (homeTip) homeTip.hidden = !show;
  }

  // ---------- PIN ----------
  function getStoredPinHash() {
    try { return localStorage.getItem(PIN_HASH_KEY) || null; } catch (e) { return null; }
  }
  function expectedPinHash() {
    return getStoredPinHash() || CFG.PIN_SHA256;
  }
  function unlockToken() { return expectedPinHash() + ":" + CFG.CONFIG_VERSION; }
  function isUnlocked() { try { return localStorage.getItem(UNLOCK_KEY) === unlockToken(); } catch (e) { return false; } }
  function drawDots(el, len) {
    var h = "";
    for (var i = 0; i < CFG.PIN_LENGTH; i++) h += '<span class="dot' + (i < len ? " on" : "") + '"></span>';
    el.innerHTML = h;
  }
  function showLock() {
    state.pin = ""; drawDots($("pinDots"), 0);
    $("lockHint").textContent = "Voer je pincode in";
    $("lock").hidden = false; $("home").hidden = true; $("detail").hidden = true;
    closePinModal();
    stopHomeRefresh();
    showChromeTips();
  }
  function pressKey(k) {
    if (k === "del") { state.pin = state.pin.slice(0, -1); drawDots($("pinDots"), state.pin.length); return; }
    if (state.pin.length >= CFG.PIN_LENGTH) return;
    state.pin += k; drawDots($("pinDots"), state.pin.length);
    if (state.pin.length === CFG.PIN_LENGTH) {
      var tried = state.pin;
      sha256(tried).then(function (h) {
        if (h === expectedPinHash()) {
          try { localStorage.setItem(UNLOCK_KEY, unlockToken()); } catch (e) {}
          $("lock").hidden = true; route();
        } else {
          var dots = $("pinDots"); dots.classList.add("shake");
          $("lockHint").textContent = "Onjuiste pincode, probeer opnieuw";
          if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) {}
          setTimeout(function () { dots.classList.remove("shake"); state.pin = ""; drawDots($("pinDots"), 0); }, 450);
        }
      });
    }
  }
  $("keypad").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (b) pressKey(b.getAttribute("data-k"));
  });
  document.addEventListener("keydown", function (e) {
    if (!$("pinModal").hidden) {
      if (/^[0-9]$/.test(e.key)) pinModalPress(e.key);
      else if (e.key === "Backspace") pinModalPress("del");
      else if (e.key === "Escape") closePinModal();
      return;
    }
    if ($("lock").hidden) return;
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    else if (e.key === "Backspace") pressKey("del");
  });
  $("lockBtn").addEventListener("click", function () {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (e) {}
    showLock();
  });

  // ---------- PIN wijzigen ----------
  function openPinModal() {
    state.pinFlow = { step: "current", buf: "", firstNew: "" };
    $("pinModalHint").textContent = "Voer je huidige pincode in";
    drawDots($("pinModalDots"), 0);
    $("pinModal").hidden = false;
  }
  function closePinModal() {
    state.pinFlow = null;
    $("pinModal").hidden = true;
  }
  function pinModalPress(k) {
    var flow = state.pinFlow; if (!flow) return;
    if (k === "del") { flow.buf = flow.buf.slice(0, -1); drawDots($("pinModalDots"), flow.buf.length); return; }
    if (flow.buf.length >= CFG.PIN_LENGTH) return;
    flow.buf += k; drawDots($("pinModalDots"), flow.buf.length);
    if (flow.buf.length < CFG.PIN_LENGTH) return;
    var entered = flow.buf;
    if (flow.step === "current") {
      sha256(entered).then(function (h) {
        if (h !== expectedPinHash()) {
          $("pinModalDots").classList.add("shake");
          $("pinModalHint").textContent = "Onjuiste pincode, probeer opnieuw";
          if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) {}
          setTimeout(function () {
            $("pinModalDots").classList.remove("shake");
            flow.buf = ""; drawDots($("pinModalDots"), 0);
          }, 450);
          return;
        }
        flow.step = "new1"; flow.buf = "";
        $("pinModalHint").textContent = "Kies een nieuwe 4-cijferige pincode";
        drawDots($("pinModalDots"), 0);
      });
    } else if (flow.step === "new1") {
      flow.firstNew = entered; flow.step = "new2"; flow.buf = "";
      $("pinModalHint").textContent = "Herhaal de nieuwe pincode";
      drawDots($("pinModalDots"), 0);
    } else if (flow.step === "new2") {
      if (entered !== flow.firstNew) {
        $("pinModalDots").classList.add("shake");
        $("pinModalHint").textContent = "Pincodes komen niet overeen, opnieuw";
        setTimeout(function () {
          $("pinModalDots").classList.remove("shake");
          flow.step = "new1"; flow.buf = ""; flow.firstNew = "";
          $("pinModalHint").textContent = "Kies een nieuwe 4-cijferige pincode";
          drawDots($("pinModalDots"), 0);
        }, 450);
        return;
      }
      sha256(entered).then(function (h) {
        try {
          localStorage.setItem(PIN_HASH_KEY, h);
          localStorage.removeItem(UNLOCK_KEY);
        } catch (e) {}
        closePinModal();
        toast("Pincode gewijzigd — voer hem opnieuw in");
        showLock();
      });
    }
  }
  $("pinModalKeypad").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (b) pinModalPress(b.getAttribute("data-k"));
  });
  $("pinChangeBtn").addEventListener("click", openPinModal);
  $("lockPinChangeBtn").addEventListener("click", openPinModal);
  $("pinModalCancel").addEventListener("click", closePinModal);

  // ---------- Data ----------
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function loadData(manual) {
    var url = CFG.DATA_URL + (CFG.DATA_URL.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
    return fetch(url, { cache: "no-store", credentials: "same-origin" })
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
  function isCryptoBot(b) {
    if (!b) return false;
    if (b.id === CRYPTO_BOT_ID) return true;
    return /crypto/i.test(b.name || "") || b.key === "crypto";
  }

  // ---------- Crypto trades (localStorage) ----------
  function loadCryptoTrades() {
    try {
      var list = JSON.parse(localStorage.getItem(CRYPTO_TRADES_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveCryptoTrades(list) {
    try { localStorage.setItem(CRYPTO_TRADES_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function cryptoPanelHtml() {
    var trades = loadCryptoTrades();
    var listHtml;
    if (!trades.length) {
      listHtml = '<p class="trade-empty">Nog geen posities of verkopen opgeslagen.</p>';
    } else {
      listHtml = '<ul class="trade-list">' + trades.map(function (t, i) {
        var parts = [esc(t.actie), esc(t.asset)];
        if (t.bedrag) parts.push("€ " + esc(t.bedrag));
        if (t.hoeveelheid) parts.push(esc(t.hoeveelheid));
        if (t.datum) parts.push(esc(t.datum));
        return '<li class="trade-item" data-i="' + i + '">' +
          '<div class="trade-main"><strong>' + parts.join(" · ") + "</strong>" +
          (t.notitie ? '<span class="trade-note">' + esc(t.notitie) + "</span>" : "") +
          "</div>" +
          '<button type="button" class="trade-del" data-del="' + i + '" aria-label="Verwijderen">×</button></li>';
      }).join("") + "</ul>";
    }
    return '<div class="card trade-panel" id="cryptoTradePanel">' +
      '<h2 class="trade-title">Positie / verkoop doorgeven</h2>' +
      '<p class="trade-intro">Noteer een koop of verkoop hier. Daarna kun je een bericht kopiëren om in de Crypto Adviseur-chat te plakken (deze site kan zelf niets naar de bot sturen).</p>' +
      '<form class="trade-form" id="cryptoTradeForm">' +
      '<label>Asset<select name="asset" required><option value="BTC">BTC</option><option value="XRP">XRP</option></select></label>' +
      '<label>Actie<select name="actie" required><option value="koop">koop</option><option value="verkoop">verkoop</option></select></label>' +
      '<label>Bedrag (€)<input type="number" name="bedrag" inputmode="decimal" step="0.01" min="0" placeholder="optioneel"></label>' +
      '<label>Hoeveelheid<input type="text" name="hoeveelheid" inputmode="decimal" placeholder="optioneel"></label>' +
      '<label class="full">Notitie<input type="text" name="notitie" placeholder="optioneel"></label>' +
      '<label class="full">Datum<input type="date" name="datum" required></label>' +
      '<button type="submit" class="primary-btn full">Opslaan</button>' +
      "</form>" +
      '<div class="trade-actions">' +
      '<button type="button" class="primary-btn" id="cryptoShareBtn">Bericht voor Crypto Adviseur</button>' +
      "</div>" +
      '<h3 class="trade-sub">Opgeslagen</h3>' + listHtml +
      "</div>";
  }
  function buildCryptoMessage(trades) {
    var lines = ["Bericht voor Crypto Adviseur", "Posities / verkopen (via Mijn Bots):", ""];
    if (!trades.length) {
      lines.push("(geen openstaande records)");
    } else {
      trades.forEach(function (t, i) {
        var bits = [(i + 1) + ".", (t.actie || "").toUpperCase(), t.asset || "?"];
        if (t.bedrag) bits.push("€" + t.bedrag);
        if (t.hoeveelheid) bits.push("qty " + t.hoeveelheid);
        if (t.datum) bits.push("op " + t.datum);
        lines.push(bits.join(" "));
        if (t.notitie) lines.push("   Notitie: " + t.notitie);
      });
    }
    lines.push("", "— verzonden vanuit Mijn Bots (kopieer/plak in de chat)");
    return lines.join("\n");
  }
  function copyOrShare(text) {
    var done = function () { toast("Bericht gekopieerd — plak in Crypto Adviseur"); };
    if (navigator.share) {
      navigator.share({ title: "Crypto Adviseur", text: text }).then(done).catch(function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
        } else { fallbackCopy(text); done(); }
      });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  function wireCryptoPanel() {
    var form = $("cryptoTradeForm");
    if (!form) return;
    var dateInput = form.querySelector('[name="datum"]');
    if (dateInput && !dateInput.value) dateInput.value = todayInputValue();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var entry = {
        id: String(Date.now()),
        asset: String(fd.get("asset") || "").trim(),
        actie: String(fd.get("actie") || "").trim(),
        bedrag: String(fd.get("bedrag") || "").trim(),
        hoeveelheid: String(fd.get("hoeveelheid") || "").trim(),
        notitie: String(fd.get("notitie") || "").trim(),
        datum: String(fd.get("datum") || "").trim(),
        createdAt: new Date().toISOString()
      };
      if (!entry.asset || !entry.actie) return;
      var list = loadCryptoTrades();
      list.unshift(entry);
      saveCryptoTrades(list);
      toast("Opgeslagen");
      // herteken alleen het crypto-panel in detail
      var m = location.hash.match(/^#\/bot\/(.+)$/);
      if (m) renderDetail(decodeURIComponent(m[1]));
    });
    var panel = $("cryptoTradePanel");
    if (panel) {
      panel.addEventListener("click", function (e) {
        var del = e.target.closest("[data-del]");
        if (del) {
          var i = parseInt(del.getAttribute("data-del"), 10);
          var list = loadCryptoTrades();
          if (!isNaN(i) && i >= 0 && i < list.length) {
            list.splice(i, 1);
            saveCryptoTrades(list);
            var m = location.hash.match(/^#\/bot\/(.+)$/);
            if (m) renderDetail(decodeURIComponent(m[1]));
          }
          return;
        }
      });
    }
    var shareBtn = $("cryptoShareBtn");
    if (shareBtn) {
      shareBtn.addEventListener("click", function () {
        copyOrShare(buildCryptoMessage(loadCryptoTrades()));
      });
    }
  }

  // ---------- Weergave ----------
  function renderHome() {
    var d = state.data;
    var r = $("refreshed");
    if (!d) {
      r.textContent = "Geen gegevens";
      $("botList").innerHTML = '<p class="empty">Kan de updates nu niet laden. Controleer je internetverbinding en tik op ↻.</p>';
      return;
    }
    var stamp = d.generated_at ? fmtDate(d.generated_at) : "onbekend";
    r.textContent = "Laatst bijgewerkt: " + stamp + (state.fromCache ? " · offline" : "");
    $("botList").innerHTML = d.bots.map(function (b) {
      var u = b.updates && b.updates[0];
      return '<button type="button" class="bot-btn" style="--c:' + esc(b.color || "#666") + '" data-id="' + esc(b.id) + '">' +
        '<span class="bot-emoji">' + esc(b.emoji || "🤖") + "</span>" +
        '<span class="bot-text"><span class="bot-name">' + esc(b.name) + "</span>" +
        '<span class="bot-sub">' + esc(b.subtitle || "") + "</span>" +
        '<span class="bot-date">' + (u ? "🕒 " + esc(fmtDate(u.date)) : "Nog geen update beschikbaar") + "</span></span>" +
        '<span class="bot-chev">›</span></button>';
    }).join("");
    showChromeTips();
  }
  function renderDetail(id) {
    var b = findBot(id);
    if (!b) { location.hash = ""; return; }
    $("detailBar").style.setProperty("--c", b.color || "#666");
    $("detailEmoji").textContent = b.emoji || "🤖";
    $("detailName").textContent = b.name;
    var ups = b.updates || [], h = "";
    if (isCryptoBot(b)) h += cryptoPanelHtml();
    if (!ups.length) {
      h += '<div class="card empty-card"><p class="big-empty">Nog geen update beschikbaar</p><p>Deze bot heeft nog geen rapport gestuurd. Kom later terug.</p></div>';
    } else {
      h += '<article class="card latest"><div class="card-date">Laatste update · ' + esc(fmtDate(ups[0].date, true)) + '</div><div class="md">' + window.renderMarkdown(ups[0].markdown) + "</div></article>";
      if (ups.length > 1) {
        h += '<h2 class="hist-title">Eerdere updates</h2>';
        h += ups.slice(1).map(function (u) {
          return '<details class="card hist"><summary>' + esc(fmtDate(u.date, true)) + '</summary><div class="md">' + window.renderMarkdown(u.markdown) + "</div></details>";
        }).join("");
      }
    }
    $("detailBody").innerHTML = h;
    if (isCryptoBot(b)) wireCryptoPanel();
  }
  function startHomeRefresh() {
    stopHomeRefresh();
    state.refreshTimer = setInterval(function () {
      if (!$("home").hidden && isUnlocked() && !document.hidden) loadData(false);
    }, REFRESH_MS);
  }
  function stopHomeRefresh() {
    if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  }
  function route() {
    if (!isUnlocked()) { if ($("lock").hidden) showLock(); return; }
    var m = location.hash.match(/^#\/bot\/(.+)$/);
    if (m && state.data) {
      renderDetail(decodeURIComponent(m[1]));
      $("home").hidden = true; $("detail").hidden = false; window.scrollTo(0, 0);
      stopHomeRefresh();
    } else {
      renderHome();
      $("detail").hidden = true; $("home").hidden = false;
      startHomeRefresh();
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
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && isUnlocked()) loadData(false);
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted || isUnlocked()) loadData(false);
  });

  // Lichte pull-to-refresh op startscherm (werkt in Chrome + Safari)
  (function setupPullRefresh() {
    var startY = 0, pulling = false;
    var home = $("home");
    home.addEventListener("touchstart", function (e) {
      if (home.hidden || window.scrollY > 2) { pulling = false; return; }
      startY = e.touches[0].clientY; pulling = true;
    }, { passive: true });
    home.addEventListener("touchend", function (e) {
      if (!pulling) return;
      pulling = false;
      var dy = e.changedTouches[0].clientY - startY;
      if (dy > 70 && window.scrollY < 4) {
        var btn = $("refreshBtn"); btn.classList.add("spin");
        loadData(true).then(function () { btn.classList.remove("spin"); });
      }
    }, { passive: true });
  })();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // Start
  try {
    var c = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (c && c.data) { state.data = c.data; state.fetchedAt = new Date(c.fetchedAt); state.fromCache = true; }
  } catch (e) {}
  showChromeTips();
  route();
  loadData(false);
})();
