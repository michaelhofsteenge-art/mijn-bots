(function () {
  "use strict";
  var CFG = window.BOTS_CONFIG;
  var TZ = "Europe/Amsterdam";
  var UNLOCK_KEY = "mijnbots-unlock";
  var PIN_HASH_KEY = "mijnbots-pin-hash";
  var DATA_KEY = "mijnbots-data";
  var CRYPTO_TRADES_KEY = "mijnbots-crypto-trades";
  var EMAIL_CHECKS_KEY = "mijnbots-email-checks-v2";
  var EMAIL_CHECKS_KEY_OLD = "mijnbots-email-checks";
  var CRYPTO_BOT_ID = "49692e76-c77b-46ae-9328-2144b4d7eb96";
  var EMAIL_BOT_ID = "afa86a2a-0022-43ff-ac11-88663fbceb34";
  var KLIMAAT_BOT_ID = "80ec10c0-457b-46f7-b152-23e19cba262a";
  var NO_ACTION_RE = /geen\s+actie|niets\s+te\s+doen|geen\s+mails?|stil|geen\s+reactie\s+nodig/i;
  var REFRESH_MS = 60000;
  // ---- app-split: één codebase, twee apps (acties/ en onderzoek/); root = keuzescherm ----
  var APP = window.APP_VARIANT || "root";           // "acties" | "onderzoek" | "root"
  var APP_BASE = window.APP_BASE || "";              // pad naar de gedeelde bestanden ("../" in submappen)
  var ACTIES_KEYS = ["email", "gv", "crypto"];       // + Herinneringen; al het andere = Onderzoek
  function appForBot(b) { return b && ACTIES_KEYS.indexOf(b.key) >= 0 ? "acties" : "onderzoek"; }
  function botInApp(b) { return APP === "root" || appForBot(b) === APP; }
  function appUrl(app) { return (APP === "root" ? "" : "../") + app + "/"; }
  var DATA_URL = APP_BASE + CFG.DATA_URL;
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    data: null, pin: "", fetchedAt: null, fromCache: false,
    pinFlow: null, // null | { step, current, firstNew }
    refreshTimer: null,
    klimaatTopic: null,
    emailShowHidden: false
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
    var url = DATA_URL + (DATA_URL.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
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
      .then(function () { return remLoad(); })
      .then(function () { return mailLoad(); })
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
  function isEmailBot(b) {
    if (!b) return false;
    if (b.id === EMAIL_BOT_ID) return true;
    return b.key === "email" || /email\s*reageren/i.test(b.name || "");
  }
  /** Top-level markdown list items: lines starting with "- ". */
  function parseEmailActionItems(md) {
    var items = [];
    String(md || "").replace(/\r\n/g, "\n").split("\n").forEach(function (line) {
      var m = line.match(/^\s*-\s+(.+)$/);
      if (m) items.push(m[1].replace(/\s+/g, " ").trim());
    });
    return items;
  }
  // ---- email-identity:start (pure helpers; also exercised by a node test) ----
  function hashItemText(s) {
    var h = 5381, t = String(s || "");
    for (var i = 0; i < t.length; i++) h = ((h << 5) + h) ^ t.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  /** Lowercase, strip accents/punctuation, collapse whitespace. */
  function normalizeEmailLabel(s) {
    var t = String(s || "");
    if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  var EMAIL_ID_TAG_RE = /\s*\[id:\s*([^\]]+?)\s*\]\s*/i;
  /**
   * Stable identity for one email action line (not date-bound):
   *  - "[id:slug]" tag → slug (tag is removed from the display text);
   *  - else normalized label before the first " (" or ":".
   * legacyHash = old-style djb2 hash of the exact raw text (secondary match).
   */
  function emailItemInfo(rawText) {
    var raw = String(rawText || "").replace(/\s+/g, " ").trim();
    var display = raw, ident = "";
    var m = raw.match(EMAIL_ID_TAG_RE);
    if (m) {
      ident = m[1].trim().toLowerCase();
      display = raw.replace(EMAIL_ID_TAG_RE, " ").replace(/\s+/g, " ").trim();
    }
    if (!ident) {
      var cut = display.length;
      var p = display.indexOf(" ("), c = display.indexOf(":");
      if (p >= 0 && p < cut) cut = p;
      if (c >= 0 && c < cut) cut = c;
      ident = normalizeEmailLabel(display.slice(0, cut));
      if (!ident) ident = "#" + hashItemText(normalizeEmailLabel(display));
    }
    return { raw: raw, display: display, ident: ident, legacyHash: hashItemText(raw) };
  }
  // ---- email-identity:end ----
  /** v2 store: { identity: { checkedOn: "YYYY-MM-DD" } }; legacy hashes stored as "h:<hash>". */
  function loadEmailChecks() {
    try {
      var o = JSON.parse(localStorage.getItem(EMAIL_CHECKS_KEY) || "{}");
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  function saveEmailChecks(obj) {
    try { localStorage.setItem(EMAIL_CHECKS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function emailCheckedOn(store, rec) {
    if (!rec || typeof rec !== "object") return "";
    var d = rec.checkedOn;
    return (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : "";
  }
  /** Drop checks older than 30 days; carry over recent old-style checks as legacy-hash matches. */
  function cleanupEmailChecks() {
    var cutoff = dayKey(new Date(Date.now() - 30 * 864e5));
    var store = loadEmailChecks(), out = {};
    Object.keys(store).forEach(function (k) {
      var d = emailCheckedOn(store, store[k]);
      if (d && d >= cutoff) out[k] = { checkedOn: d };
    });
    try {
      if (localStorage.getItem(EMAIL_CHECKS_KEY) == null) {
        var old = JSON.parse(localStorage.getItem(EMAIL_CHECKS_KEY_OLD) || "{}");
        if (old && typeof old === "object") {
          Object.keys(old).forEach(function (k) {
            var m = /^(\d{4}-\d{2}-\d{2})\|([0-9a-z]+)$/.exec(k);
            if (m && old[k] && m[1] >= cutoff) {
              var hk = "h:" + m[2];
              if (!out[hk] || out[hk].checkedOn < m[1]) out[hk] = { checkedOn: m[1] };
            }
          });
        }
      }
    } catch (e) {}
    saveEmailChecks(out);
  }
  /** "open" | "today" (checked today, still shown) | "done" (checked earlier, hidden). */
  function emailItemStatus(info, store, today) {
    store = store || loadEmailChecks();
    today = today || dayKey(new Date());
    var a = emailCheckedOn(store, store[info.ident]);
    var b = emailCheckedOn(store, store["h:" + info.legacyHash]);
    var d = a > b ? a : b;
    if (!d) return "open";
    return d >= today ? "today" : "done";
  }
  function setEmailItemChecked(ident, legacyHash, checked) {
    var o = loadEmailChecks();
    if (checked) {
      var rec = { checkedOn: dayKey(new Date()) };
      if (ident) o[ident] = rec;
      if (legacyHash) o["h:" + legacyHash] = { checkedOn: rec.checkedOn };
    } else {
      if (ident) delete o[ident];
      if (legacyHash) delete o["h:" + legacyHash];
    }
    saveEmailChecks(o);
  }
  function renderEmailChecklist(entries) {
    return '<ul class="email-checklist" role="list">' + entries.map(function (en) {
      var on = en.status !== "open";
      return '<li class="email-check-row' + (on ? " is-checked" : "") + '">' +
        '<label class="email-check-box" aria-label="Afvinken">' +
        '<input type="checkbox" class="email-check" data-ident="' + esc(en.info.ident) +
        '" data-hash="' + esc(en.info.legacyHash) + '"' +
        (on ? " checked" : "") + "></label>" +
        '<div class="email-check-text md">' + window.renderMarkdown(en.info.display) + "</div>" +
        "</li>";
    }).join("") + "</ul>";
  }
  var EMAIL_HEADER_RE = /^\s*\*\*[^*]+\*\*\s*:?\s*$/;
  /** Newest Email Reageren update: list items become tickable rows; items done on earlier days are hidden. */
  function renderEmailLatest(u) {
    var store = loadEmailChecks(), today = dayKey(new Date());
    var showHidden = !!state.emailShowHidden;
    var lines = String(u.markdown || "").replace(/\r\n/g, "\n").split("\n");
    var parts = [], buf = [], hiddenCount = 0, hintIdx = -1;
    function flushBuf() {
      if (!buf.length) return;
      var chunk = buf.join("\n").trim();
      buf = [];
      if (chunk) parts.push('<div class="md">' + window.renderMarkdown(chunk) + "</div>");
    }
    function dropTrailingHeader() {
      var j = buf.length - 1;
      while (j >= 0 && !buf[j].trim()) j--;
      if (j >= 0 && EMAIL_HEADER_RE.test(buf[j])) buf.splice(j);
    }
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*-\s+/.test(lines[i])) {
        var entries = [];
        while (i < lines.length) {
          var m = lines[i].match(/^\s*-\s+(.+)$/);
          if (!m) break;
          var info = emailItemInfo(m[1]);
          entries.push({ info: info, status: emailItemStatus(info, store, today) });
          i++;
        }
        i--;
        var visible = entries.filter(function (en) {
          if (en.status !== "done") return true;
          hiddenCount++;
          return showHidden;
        });
        if (!visible.length) dropTrailingHeader();
        flushBuf();
        if (visible.length) parts.push(renderEmailChecklist(visible));
        hintIdx = parts.length;
      } else {
        buf.push(lines[i]);
      }
    }
    flushBuf();
    if (hiddenCount > 0 && hintIdx >= 0) {
      var label = showHidden
        ? (hiddenCount === 1 ? "1 eerder afgevinkte actie getoond" : hiddenCount + " eerder afgevinkte acties getoond")
        : (hiddenCount === 1 ? "1 afgevinkte actie verborgen" : hiddenCount + " afgevinkte acties verborgen");
      parts.splice(hintIdx, 0, '<p class="email-hidden-note">' + esc(label) +
        ' · <button type="button" class="email-hidden-toggle" data-email-toggle-hidden>' +
        (showHidden ? "Verberg" : "Toon") + "</button></p>");
    }
    return '<article class="card latest"><div class="card-date">Laatste update · ' +
      esc(fmtDate(u.date, true)) + "</div>" + parts.join("") + "</article>";
  }
  /** Email Reageren: pulse when newest update is today and still has visible unchecked list items
   *  (or, with zero list items, when text is not clearly "nothing to do"). */
  function emailNeedsAction(b) {
    if (!isEmailBot(b)) return false;
    if (mailOnline()) return mailOpenItems().length > 0;
    var u = b.updates && b.updates[0];
    if (!u || !u.date) return false;
    var d = new Date(u.date);
    if (isNaN(d)) return false;
    var today = dayKey(new Date());
    if (dayKey(d) !== today) return false;
    var md = String(u.markdown || "");
    var items = parseEmailActionItems(md);
    if (items.length > 0) {
      var store = loadEmailChecks();
      return items.some(function (t) { return emailItemStatus(emailItemInfo(t), store, today) === "open"; });
    }
    if (NO_ACTION_RE.test(md)) return false;
    return true;
  }

  function isKlimaatBot(b) {
    if (!b) return false;
    if (b.id === KLIMAAT_BOT_ID) return true;
    return b.key === "klimaat";
  }
  /** Fixed Klimaat categories — always show all five, independent of today's markdown. */
  var KLIMAAT_CATEGORIES = [
    { n: 1, title: "Kritische of ambigue empirie" },
    { n: 2, title: "Relativering en context" },
    { n: 3, title: "NL-energievoorziening" },
    { n: 4, title: "Elektrische auto's wereldwijd" },
    { n: 5, title: "Accu's" }
  ];
  /** Parse **BLOK N: title** bodies from newest digest (no top-level Samenvatting). */
  function parseKlimaatBlocks(md) {
    var text = String(md || "").replace(/\r\n/g, "\n");
    var lines = text.split("\n");
    var blokRe = /^\*\*BLOK\s+(\d+)\s*:\s*(.+?)\*\*\s*$/i;
    var byNum = {};
    var curNum = null;
    var curLines = null;
    function pushCur() {
      if (curNum == null) return;
      byNum[curNum] = curLines.join("\n").trim();
      curNum = null;
      curLines = null;
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(blokRe);
      if (m) {
        pushCur();
        curNum = parseInt(m[1], 10);
        curLines = [];
        continue;
      }
      if (curLines) curLines.push(line);
    }
    pushCur();
    return byNum;
  }
  /**
   * Split block body into summary + rest.
   * Prefers a **Samenvatting** heading; else first paragraph before a blank line
   * or before numbered papers (**N. …).
   */
  function splitKlimaatBlock(md) {
    var text = String(md || "").replace(/\r\n/g, "\n").trim();
    if (!text) return { summary: "", conclusion: "", body: "" };
    var lines = text.split("\n");
    var paperRe = /^\s*\*\*\d+\.\s/;
    var blockRe = /^\s*\*\*BLOK\b/i;

    // Accept both **Samenvatting** and **Samenvatting:** text forms.
    function sectionHeading(line) {
      var t = line.trim();
      var m = t.match(/^\*\*(Samenvatting|Conclusie)\s*:\s*\*\*\s*(.*)$/i);
      if (m) return { kind: m[1].toLowerCase(), inline: m[2] || "" };
      m = t.match(/^\*\*(Samenvatting|Conclusie)\s*\*\*\s*:?\s*(.*)$/i);
      if (m) return { kind: m[1].toLowerCase(), inline: m[2] || "" };
      return null;
    }
    function isBoundary(line) {
      return !!sectionHeading(line) || blockRe.test(line) || paperRe.test(line);
    }

    // Extract all labeled sections first, so their display order is stable.
    var sections = [];
    for (var i = 0; i < lines.length; i++) {
      var heading = sectionHeading(lines[i]);
      if (!heading) continue;
      var end = i + 1;
      while (end < lines.length && !isBoundary(lines[end])) end++;
      var sectionLines = [];
      if (heading.inline) sectionLines.push(heading.inline);
      for (var j = i + 1; j < end; j++) sectionLines.push(lines[j]);
      sections.push({ kind: heading.kind, start: i, end: end, text: sectionLines.join("\n").trim() });
      i = end - 1;
    }
    if (sections.length) {
      var removed = {};
      sections.forEach(function (section) {
        for (var k = section.start; k < section.end; k++) removed[k] = true;
      });
      var bodyLines = [];
      for (var b = 0; b < lines.length; b++) {
        if (!removed[b]) bodyLines.push(lines[b]);
      }
      return {
        summary: sections.filter(function (s) { return s.kind === "samenvatting"; })
          .map(function (s) { return s.text; }).filter(Boolean).join("\n\n"),
        conclusion: sections.filter(function (s) { return s.kind === "conclusie"; })
          .map(function (s) { return s.text; }).filter(Boolean).join("\n\n"),
        body: bodyLines.join("\n").trim()
      };
    }

    // Legacy files may have an unlabeled introductory summary.
    var summary = [];
    var restStart = 0;
    var started = false;
    for (i = 0; i < lines.length; i++) {
      if (paperRe.test(lines[i])) {
        restStart = i;
        break;
      }
      if (lines[i].trim() === "") {
        if (started) {
          restStart = i + 1;
          while (restStart < lines.length && lines[restStart].trim() === "") restStart++;
          break;
        }
        restStart = i + 1;
        continue;
      }
      started = true;
      summary.push(lines[i]);
      restStart = i + 1;
    }
    if (!started) return { summary: "", conclusion: "", body: text };
    var sumText = summary.join("\n").trim();
    if (!sumText) return { summary: "", conclusion: "", body: text };
    // Italic-only subsection headers (*…*) are not a summary — keep them in the body.
    var onlyItalicHeads = sumText.split("\n").every(function (ln) {
      var t = ln.trim();
      return !t || /^\*[^*\n]+\*$/.test(t);
    });
    if (onlyItalicHeads) return { summary: "", conclusion: "", body: text };
    return {
      summary: sumText,
      conclusion: "",
      body: lines.slice(restStart).join("\n").trim()
    };
  }

  function allBtnHtml(on) { return '<button type="button" class="topic-chip topic-all' + (on ? " is-active" : "") + '" data-topic="alles"' + (on ? ' aria-current="true"' : "") + '>📖 Alles lezen</button>'; }
  function isParkinsonBot(b) { return !!b && (b.key === "parkinson" || b.key === "covid" || b.key === "quantum" || b.key === "klimaatonderzoek" || b.key === "clintel" || /parkinson|covid|quantum|klimaat/i.test(b.name || "")); }
  function parseParkinson(md) {
    var lines = String(md || "").replace(/\r\n/g, "\n").split("\n"), blocks = [], cur = null, sec = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*$/);
      if (m && !/^###/.test(l)) { cur = { title: m[1], secs: {}, order: [], intro: [] }; blocks.push(cur); sec = null; continue; }
      if (!cur) continue;
      var s = l.match(/^###\s+(.+?)\s*$/);
      if (s) { sec = s[1]; cur.order.push(sec); cur.secs[sec] = []; continue; }
      (sec ? cur.secs[sec] : cur.intro).push(l);
    }
    return blocks;
  }
  function renderParkinsonLatest(u) {
    var all = parseParkinson(u.markdown), top = "", blocks = all.filter(function (bl) {
      if (/^(samenvatting|conclusie van de week)$/i.test(bl.title)) {
        var t = bl.intro.join("\n").trim();
        if (t) top += '<div class="' + (/conclusie/i.test(bl.title) ? "topic-conclusion" : "topic-summary") + '"><div class="topic-section-label">' + esc(bl.title) + '</div><div class="md">' + window.renderMarkdown(t) + "</div></div>";
        return false;
      }
      return true;
    });
    var pre = String(u.markdown || "").replace(/\r\n/g, "\n").split(/\n(?=##\s)/)[0];
    pre = /^##\s/.test(pre) ? "" : pre.replace(/^#\s+.*\n?/, "").trim();
    if (pre && blocks.length) top = '<div class="topic-summary"><div class="md">' + window.renderMarkdown(pre) + "</div></div>" + top;
    if (top) top = '<div class="card">' + top + "</div>";
    if (!blocks.length) return '<article class="card latest"><div class="card-date">Laatste update · ' + esc(fmtDate(u.date, true)) + '</div><div class="md">' + window.renderMarkdown(u.markdown) + "</div></article>";
    var blockHtml = function (bl, i) {
      var x = '<h2 class="topic-title">' + esc((i + 1) + ". " + bl.title) + "</h2>";
      var intro = bl.intro.join("\n").trim();
      if (intro) x += '<div class="md">' + window.renderMarkdown(intro) + "</div>";
      bl.order.forEach(function (name) {
        var t = bl.secs[name].join("\n").trim(); if (!t) return;
        var cls = /samenvatting/i.test(name) ? "topic-summary" : /conclusie/i.test(name) ? "topic-conclusion" : "topic-section";
        x += '<div class="' + cls + '"><div class="topic-section-label">' + esc(name) + '</div><div class="md">' + window.renderMarkdown(t) + "</div></div>";
      });
      return x;
    };
    if (state.klimaatTopic === "alles") {
      return '<div class="card klimaat-topics"><div class="card-date">Laatste update · ' + esc(fmtDate(u.date, true)) + '</div><button type="button" class="topic-back" data-topic-back="1">‹ Alle onderwerpen</button><h2 class="topic-title">📖 Volledig rapport</h2></div>' +
        top + blocks.map(function (bl, i) { return '<div class="card full-block">' + blockHtml(bl, i) + "</div>"; }).join("");
    }
    var active = state.klimaatTopic, idx = active ? parseInt(String(active).replace(/^blok-/, ""), 10) - 1 : -1;
    if (!(idx >= 0 && idx < blocks.length)) idx = -1;
    var nav = '<nav class="topic-nav" aria-label="Onderwerpen">' + blocks.map(function (bl, i) {
      var id = "blok-" + (i + 1), on = i === idx, label = (i + 1) + "  " + bl.title;
      return '<button type="button" class="topic-chip' + (on ? " is-active" : "") + '" data-topic="' + id + '"' + (on ? ' aria-current="true"' : "") + ' title="' + esc(label) + '">' + esc(label) + "</button>";
    }).join("") + "</nav>";
    var h = (idx < 0 && top ? allBtnHtml(false) + '<details class="card summary-fold"><summary>📋 Samenvatting &amp; conclusie</summary>' + top.replace(/^<div class="card">/, "<div>") + "</details>" : "") + '<div class="card klimaat-topics"><div class="card-date">Laatste update · ' + esc(fmtDate(u.date, true)) + "</div>" +
      (idx < 0 ? allBtnHtml(false) : "") + '<p class="topic-hint">' + (idx >= 0 ? "Onderwerp" : "Kies een onderwerp") + "</p>" + nav;
    if (idx < 0) return h + '<p class="topic-empty">Tik op een onderwerp om alleen dat blok te lezen.</p></div>';
    var bl = blocks[idx];
    h += '<button type="button" class="topic-back" data-topic-back="1">‹ Alle onderwerpen</button>' + blockHtml(bl, idx);
    return h + "</div>";
  }
  function klimaatTopicsHtml(activeId) {
    return '<nav class="topic-nav" aria-label="Onderwerpen">' +
      KLIMAAT_CATEGORIES.map(function (c) {
        var id = "blok-" + c.n;
        var on = id === activeId;
        var label = c.n + "  " + c.title;
        return '<button type="button" class="topic-chip' + (on ? " is-active" : "") +
          '" data-topic="' + esc(id) + '"' + (on ? ' aria-current="true"' : "") +
          ' title="' + esc(label) + '">' + esc(label) + "</button>";
      }).join("") + "</nav>";
  }
  function renderKlimaatLatest(u) {
    var byNum = parseKlimaatBlocks(u.markdown);
    var active = state.klimaatTopic;
    var catHtml = function (cat) {
      var raw = (byNum[cat.n] || "").trim(), x = '<h2 class="topic-title">' + esc(cat.n + ". " + cat.title) + "</h2>";
      if (!raw) return x + '<p class="topic-empty-cat">Nog niets in deze categorie vandaag.</p>';
      var parts = splitKlimaatBlock(raw);
      if (parts.summary) x += '<div class="topic-summary"><div class="topic-section-label">Samenvatting</div><div class="md">' + window.renderMarkdown(parts.summary) + "</div></div>";
      if (parts.conclusion) x += '<div class="topic-conclusion"><div class="topic-section-label">Conclusie</div><div class="md">' + window.renderMarkdown(parts.conclusion) + "</div></div>";
      if (parts.body) x += '<div class="md">' + window.renderMarkdown(parts.body) + "</div>";
      return x;
    };
    if (active === "alles") {
      return '<div class="card klimaat-topics"><div class="card-date">Laatste update · ' + esc(fmtDate(u.date, true)) + '</div><button type="button" class="topic-back" data-topic-back="1">‹ Alle onderwerpen</button><h2 class="topic-title">📖 Volledig rapport</h2></div>' +
        KLIMAAT_CATEGORIES.map(function (c) { return '<div class="card full-block">' + catHtml(c) + "</div>"; }).join("");
    }
    var valid = KLIMAAT_CATEGORIES.some(function (c) { return "blok-" + c.n === active; });
    if (!valid) active = null;
    var h = '<div class="card klimaat-topics">' +
      '<div class="card-date">Laatste update · ' + esc(fmtDate(u.date, true)) + "</div>" +
      (active ? "" : allBtnHtml(false)) + '<p class="topic-hint">' + (active ? "Onderwerp" : "Kies een onderwerp") + "</p>" +
      klimaatTopicsHtml(active);
    if (!active) {
      h += '<p class="topic-empty">Tik op een onderwerp om alleen dat blok te lezen.</p></div>';
      return h;
    }
    var n = parseInt(String(active).replace(/^blok-/, ""), 10);
    var cat = KLIMAAT_CATEGORIES.filter(function (c) { return c.n === n; })[0];
    var raw = (byNum[n] || "").trim();
    h += '<button type="button" class="topic-back" data-topic-back="1">‹ Alle onderwerpen</button>';
    h += '<h2 class="topic-title">' + esc(n + ". " + cat.title) + "</h2>";
    if (!raw) {
      h += '<p class="topic-empty-cat">Nog niets in deze categorie vandaag.</p></div>';
      return h;
    }
    var parts = splitKlimaatBlock(raw);
    if (parts.summary) {
      h += '<div class="topic-summary"><div class="topic-section-label">Samenvatting</div><div class="md">' + window.renderMarkdown(parts.summary) + "</div></div>";
    }
    if (parts.conclusion) {
      h += '<div class="topic-conclusion"><div class="topic-section-label">Conclusie</div><div class="md">' + window.renderMarkdown(parts.conclusion) + "</div></div>";
    }
    if (parts.body) {
      h += '<div class="md">' + window.renderMarkdown(parts.body) + "</div>";
    } else if (!parts.summary && !parts.conclusion) {
      h += '<p class="topic-empty-cat">Nog niets in deze categorie vandaag.</p>';
    }
    h += "</div>";
    return h;
  }


  // ---- reminders:start ----
  // Herinneringen staan centraal in de Mijn Bots-API (Vercel). data.json is alleen terugval.
  var REM_KEY = "mijnbots-reminders"; // oude lokale opslag (mailto-tijdperk), wordt eenmalig gemigreerd
  var REM_ID = "__herinneringen";
  function remPad(n) { return ("0" + n).slice(-2); }
  function remWhen(due) {
    var p = due.split(/[-T:]/).map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    var wd = new Intl.DateTimeFormat("nl-NL", { weekday: "long", timeZone: "UTC" }).format(d);
    var mo = new Intl.DateTimeFormat("nl-NL", { month: "long", timeZone: "UTC" }).format(d);
    return wd + " " + p[2] + " " + mo + " " + p[0] + " " + remPad(p[3]) + ":" + remPad(p[4]);
  }
  function loadLocalRems() { try { var a = JSON.parse(localStorage.getItem(REM_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function remKey(r) { return String(r.text || "").trim().toLowerCase().replace(/\s+/g, " ") + "|" + String(r.due || "").slice(0, 16); }
  function nowAmsLocal() {
    var d = new Date();
    return dayKey(d) + "T" + new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  }
  function remApi(method, path, body) {
    if (!CFG.REM_API) return Promise.reject(new Error("geen API"));
    var opt = { method: method, headers: { "X-Mijnbots-Key": CFG.REM_KEY || "" }, cache: "no-store" };
    if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(CFG.REM_API + (path || ""), opt).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  // Oude lokale herinneringen die nooit verstuurd zijn: één keer naar de server, daarna wissen.
  function remMigrateLocal(server) {
    var locals = loadLocalRems();
    if (!locals.length) return Promise.resolve(false);
    var seen = {};
    server.forEach(function (r) { seen[remKey(r)] = 1; });
    var todo = locals.filter(function (r) { return r && r.text && r.due && !seen[remKey(r)]; });
    return Promise.all(todo.map(function (r) { return remApi("POST", "", { text: r.text, due: String(r.due).slice(0, 16) }); }))
      .then(function () { try { localStorage.removeItem(REM_KEY); } catch (e) {} return todo.length > 0; });
  }
  function remLoad() {
    return remApi("GET").then(function (list) {
      return remMigrateLocal(list).then(function (added) { return added ? remApi("GET") : list; }, function () { return list; });
    }).then(function (list) {
      state.rems = Array.isArray(list) ? list : []; state.remsOffline = false;
    }, function () { state.remsOffline = true; });
  }
  function remRefreshView() {
    return remLoad().then(function () {
      render();
      if (state.remDraft && $("remText")) { $("remText").value = state.remDraft.text; $("remDate").value = state.remDraft.date; $("remTime").value = state.remDraft.time; }
      state.remDraft = null;
    });
  }
  function remFind(id) { return (state.rems || []).filter(function (x) { return x.id === id; })[0]; }
  // Optimistisch bijwerken; bij fout terugzetten + melding.
  function remOptimistic(id, patch, apply) {
    var it = remFind(id); if (!it) return;
    var backup = JSON.parse(JSON.stringify(it));
    apply(it); renderRemindersDetail();
    remApi("PATCH", "/" + encodeURIComponent(id), patch).then(function (srv) {
      var cur = remFind(id); if (cur && srv && srv.id) { Object.keys(cur).forEach(function (k) { delete cur[k]; }); Object.assign(cur, srv); }
      if (location.hash.indexOf(REM_ID) >= 0 && !state.remEditId) renderRemindersDetail();
    }, function () {
      var cur = remFind(id); if (cur) { Object.keys(cur).forEach(function (k) { delete cur[k]; }); Object.assign(cur, backup); }
      renderRemindersDetail(); toast("Opslaan mislukt – wijziging teruggezet");
    });
  }
  function allReminders() {
    var src = (!state.remsOffline && Array.isArray(state.rems)) ? state.rems
      : ((state.data && Array.isArray(state.data.reminders)) ? state.data.reminders : []);
    var out = [];
    src.forEach(function (r) { if (r && r.due) out.push({ id: r.id, text: r.text, due: String(r.due).slice(0, 16), status: r.status || "gepland", reopenedAt: r.reopenedAt || null }); });
    out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    return out;
  }
  function isRemDone(r, now) { return r.status === "afgerond" || (r.status === "herinnerd" && r.due < now && !r.reopenedAt); }
  function upcomingReminders() { var now = nowAmsLocal(); return allReminders().filter(function (r) { return !isRemDone(r, now) && r.status !== "herinnerd"; }); }
  function remDueTodayPending() { var now = nowAmsLocal(), t = now.slice(0, 10); return upcomingReminders().some(function (r) { return r.due.slice(0, 10) === t && r.due >= now; }); }
  function tomorrowKey() { var d = new Date(Date.now() + 864e5); return dayKey(d); }
  function remOnline() { return !state.remsOffline && Array.isArray(state.rems); }
  function remRowHtml(r, now) {
    if (state.remEditId === r.id && remOnline()) {
      var dd = r.due.slice(0, 10), tt = r.due.slice(11, 16);
      return '<li class="rem-row"><form class="rem-form rem-editform" data-rem-editform="' + esc(r.id) + '">' +
        '<label class="rem-lbl">Wat moet je doen?<input type="text" name="text" required value="' + esc(r.text) + '"></label>' +
        '<div class="rem-dt"><label class="rem-lbl">Datum<input type="date" name="date" required value="' + dd + '"></label>' +
        '<label class="rem-lbl">Tijd<input type="time" name="time" required value="' + tt + '"></label></div>' +
        '<div class="rem-editbtns"><button type="submit" class="rem-submit">Opslaan</button><button type="button" class="rem-cancel" data-rem-cancel="1">Annuleren</button></div>' +
        "</form></li>";
    }
    var st = r.status === "afgerond" ? "Afgerond" : (r.status === "herinnerd" ? "Herinnerd" : "Gepland");
    var extra = "";
    if (remOnline()) {
      extra += ' <label class="rem-donelbl"><input type="checkbox" class="rem-done" data-rem-done="' + esc(r.id) + '"' + (r.status === "afgerond" ? " checked" : "") + "> Afgerond</label>";
      extra += ' <button type="button" class="rem-edit" data-rem-edit="' + esc(r.id) + '">Wijzigen</button>';
      extra += ' <button type="button" class="rem-del" data-rem-del="' + esc(r.id) + '">Verwijderen</button>';
    }
    return '<li class="rem-row"><div class="rem-when">' + esc(remWhen(r.due)) + '</div><div class="rem-text">' + esc(r.text) +
      '</div><div class="rem-meta"><span class="rem-status rem-status--' + esc(r.status) + '">' + st + "</span>" + extra + "</div></li>";
  }
  function renderRemindersDetail() {
    $("detailBar").style.setProperty("--c", "#C2410C");
    $("detailEmoji").textContent = "⏰";
    $("detailName").textContent = "Herinneringen";
    var tm = tomorrowKey();
    var h = '<form class="card rem-form" id="remForm"><label class="rem-lbl">Wat moet je doen?<input type="text" id="remText" required placeholder="Bijv. Peter een appje sturen"></label>' +
      '<div class="rem-dt"><label class="rem-lbl">Datum<input type="date" id="remDate" required value="' + tm + '"></label>' +
      '<label class="rem-lbl">Tijd<input type="time" id="remTime" required value="12:00"></label></div>' +
      '<button type="submit" class="rem-submit"' + (state.remBusy ? " disabled" : "") + ">" + (state.remBusy ? "Opslaan…" : "Herinnering aanmaken") + "</button>" +
      "</form>";
    if (state.remsOffline) h += '<p class="rem-note">Offline: je ziet de laatst bekende lijst. Aanmaken en wijzigen kan weer zodra er verbinding is.</p>';
    else if (!Array.isArray(state.rems)) h += '<p class="rem-note">Laden…</p>';
    var now = nowAmsLocal(), all = allReminders();
    var open = all.filter(function (r) { return !isRemDone(r, now); });
    var done = all.filter(function (r) { return isRemDone(r, now); });
    h += '<h2 class="hist-title">Gepland</h2>';
    h += open.length ? '<ul class="card rem-list">' + open.map(function (r) { return remRowHtml(r, now); }).join("") + "</ul>" : '<p class="topic-empty-cat">Geen geplande herinneringen.</p>';
    if (done.length) h += '<details class="card hist"' + (state.remDoneOpen ? " open" : "") + ' id="remDoneDetails"><summary>Afgerond (' + done.length + ')</summary><ul class="rem-list">' + done.map(function (r) { return remRowHtml(r, now); }).join("") + "</ul></details>";
    $("detailBody").innerHTML = h;
  }
  function emailRemindersHtml() {
    var t = nowAmsLocal().slice(0, 10), tm = tomorrowKey(), now = nowAmsLocal();
    var list = allReminders().filter(function (r) { var d = r.due.slice(0, 10); return (d === t || d === tm) && !isRemDone(r, now); });
    if (!list.length) return "";
    return '<h2 class="hist-title">Herinneringen</h2><ul class="card rem-list">' + list.map(function (r) { return remRowHtml(r, now); }).join("") + "</ul>";
  }
  function remHomeButtonHtml() {
    var n = upcomingReminders().length, today = remDueTodayPending();
    var badge = today ? '<span class="bot-badge" aria-label="Vandaag">Vandaag</span>' : (n ? '<span class="rem-count">' + n + "</span>" : "");
    return '<button type="button" class="bot-btn' + (today ? " bot-btn--action" : "") + '" style="--c:#C2410C" data-id="' + REM_ID + '">' +
      '<span class="bot-emoji" aria-hidden="true">⏰</span><span class="bot-text"><span class="bot-name-row"><span class="bot-name">Herinneringen</span>' + badge + "</span>" +
      '<span class="bot-sub">Actiepunt aanmaken · ik herinner je</span>' +
      '<span class="bot-date">' + (n ? n + " gepland" : "Niets gepland") + "</span></span>" +
      '<span class="bot-chev" aria-hidden="true">›</span></button>';
  }
  // ---- reminders:end ----

  // ---- mailacties:start ----
  // Openstaande mails staan centraal in de Mijn Bots-API (/api/mailacties); de markdown is alleen terugval.
  var MAIL_MIGRATED_KEY = "mijnbots-email-checks-migrated";
  function mailApi(method, path, body) {
    if (!CFG.MAIL_API) return Promise.reject(new Error("geen API"));
    var opt = { method: method, headers: { "X-Mijnbots-Key": CFG.REM_KEY || "" }, cache: "no-store" };
    if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(CFG.MAIL_API + (path || ""), opt).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  // Eenmalig: vinkjes uit de oude telefoonopslag als 'done' naar de server, daarna die sleutel niet meer gebruiken.
  function mailMigrateChecks(list) {
    try { if (localStorage.getItem(MAIL_MIGRATED_KEY)) return Promise.resolve(false); } catch (e) { return Promise.resolve(false); }
    var store = loadEmailChecks();
    var todo = list.filter(function (it) {
      if (it.status !== "open") return false;
      var keys = [it.id, String(it.id).replace(/-/g, " "), normalizeEmailLabel(it.sender || "")];
      return keys.some(function (k) { return k && emailCheckedOn(store, store[k]); });
    });
    return Promise.all(todo.map(function (it) { return mailApi("PATCH", "/" + encodeURIComponent(it.id), { status: "done" }); }))
      .then(function () {
        try { localStorage.setItem(MAIL_MIGRATED_KEY, new Date().toISOString()); localStorage.removeItem(EMAIL_CHECKS_KEY); localStorage.removeItem(EMAIL_CHECKS_KEY_OLD); } catch (e) {}
        return todo.length > 0;
      });
  }
  function mailLoad() {
    return mailApi("GET").then(function (list) {
      list = Array.isArray(list) ? list : [];
      return mailMigrateChecks(list).then(function (ch) { return ch ? mailApi("GET") : list; }, function () { return list; });
    }).then(function (list) { state.mail = Array.isArray(list) ? list : []; state.mailOffline = false; },
      function () { state.mailOffline = true; });
  }
  function mailOnline() { return !state.mailOffline && Array.isArray(state.mail); }
  function mailCmp(a, b) { var x = String(a.firstSeen || ""), y = String(b.firstSeen || ""); return x < y ? -1 : x > y ? 1 : 0; }
  function mailOpenItems() { return (state.mail || []).filter(function (it) { return it.status === "open"; }).sort(mailCmp); }
  function mailArchItems() {
    return (state.mail || []).filter(function (it) { return it.status === "done" || it.status === "weg"; })
      .sort(function (a, b) { var x = a.doneAt || a.goneAt || "", y = b.doneAt || b.goneAt || ""; return x < y ? 1 : x > y ? -1 : 0; });
  }
  function mailShortDate(ts) {
    var p = String(ts || "").split(/[-T:]/).map(Number);
    if (!p[0] || !p[2]) return "";
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    var wd = new Intl.DateTimeFormat("nl-NL", { weekday: "short", timeZone: "UTC" }).format(d).replace(".", "");
    var mo = new Intl.DateTimeFormat("nl-NL", { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
    return wd + " " + p[2] + " " + mo;
  }
  // Alleen het vakje archiveert. Het is een losse knop, geen <label> om de rij, zodat een tik op de
  // zin nooit het vinkje raakt. De zin opent de mail in de app.
  function mailRowHtml(it) {
    var on = it.status !== "open", meta;
    if (it.status === "done") meta = "afgevinkt " + mailShortDate(it.doneAt);
    else if (it.status === "weg") meta = "niet meer in Outlook · " + mailShortDate(it.goneAt);
    else meta = "sinds " + mailShortDate(it.firstSeen);
    if (it.deadline) meta += " · deadline " + it.deadline;
    var who = (it.sender || "") + (it.mailbox ? " (" + it.mailbox + ")" : "");
    var box = '<button type="button" class="email-check-box" data-mail-id="' + esc(it.id) + '" aria-pressed="' + (on ? "true" : "false") +
      '" aria-label="' + (on ? "Terugzetten: " : "Afvinken: ") + esc(it.sender || "mail") + '">' +
      '<span class="mail-check' + (on ? " on" : "") + '" aria-hidden="true"></span></button>';
    var inner = "<strong>" + esc(who) + "</strong> " + esc(it.text) + '<br><span class="mail-meta">' + esc(meta) + "</span>";
    var body = '<button type="button" class="email-check-text mail-open" data-mail-open="' + esc(it.id) + '">' + inner +
      '<span class="mail-open-cue">Bekijk mail ›</span></button>';
    return '<li class="email-check-row' + (on ? " is-checked" : "") + '">' + box + body + "</li>";
  }
  function mailById(id) { return (state.mail || []).filter(function (x) { return x.id === id; })[0]; }
  function mailViewHtml(it) {
    var link = mailSafeLink(it.link);
    var when = it.received ? mailShortDate(it.received) + " " + String(it.received).slice(11, 16) : "";
    var meta;
    if (it.status === "done") meta = "afgevinkt " + mailShortDate(it.doneAt);
    else if (it.status === "weg") meta = "niet meer in Outlook · " + mailShortDate(it.goneAt);
    else meta = "openstaand sinds " + mailShortDate(it.firstSeen);
    if (it.deadline) meta += " · deadline " + it.deadline;
    var h = '<article class="card mail-view">';
    h += '<p class="mail-view-from"><span>Van</span> ' + esc(it.sender || "(onbekende afzender)") + "</p>";
    if (it.mailbox || when) h += '<p class="mail-view-meta">' + esc([it.mailbox, when].filter(Boolean).join(" · ")) + "</p>";
    h += "<h3>" + esc(it.text || "(geen onderwerp)") + "</h3>";
    h += '<p class="mail-meta">' + esc(meta) + "</p>";
    if (it.body) h += '<div class="mail-view-body">' + esc(it.body) + "</div>" +
      '<p class="mail-view-note">Dit is het begin van de mail. Open in Outlook voor de volledige tekst en bijlagen.</p>';
    else h += '<p class="mail-view-note">De mailtekst is (nog) niet beschikbaar in de app. Open de mail in Outlook om hem te lezen.</p>';
    // Altijd een knop: opgeslagen link, anders zoeken op afzender in Outlook web.
    var q = String(it.sender || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
    var url = link || ("https://outlook.live.com/mail/0/" + (q ? "search?q=" + encodeURIComponent(q) : "inbox"));
    h += '<a class="mail-view-outlook" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Openen in Outlook</a>';
    if (!link) h += '<p class="mail-view-note">Geen directe link bewaard: de knop zoekt op de afzender in Outlook.</p>';
    if (it.status === "open") h += '<button type="button" class="mail-view-done" data-mail-done="' + esc(it.id) + '">✓ Afgerond</button>';
    h += "</article>";
    return h;
  }
  function mailSafeLink(u) {
    if (!u) return "";
    try { var x = new URL(String(u)); return (x.protocol === "https:" && /^(outlook\.live\.com|outlook\.office(365)?\.com|mail\.google\.com)$/.test(x.hostname)) ? x.href : ""; }
    catch (e) { return ""; }
  }
  function mailListHtml() {
    var open = mailOpenItems(), arch = mailArchItems();
    var h = '<h2 class="hist-title">Openstaand (' + open.length + ")</h2>";
    h += open.length ? '<ul class="card email-checklist" role="list">' + open.map(mailRowHtml).join("") + "</ul>"
      : '<p class="topic-empty-cat">Geen openstaande mails 🎉</p>';
    if (arch.length) {
      h += '<details class="card hist" id="mailArchDetails"' + (state.mailArchOpen ? " open" : "") + "><summary>Archief (" + arch.length + ")</summary>" +
        '<p class="email-hidden-note">Wordt na 7 dagen verwijderd. Vinkje weghalen zet een mail terug.</p>' +
        '<ul class="email-checklist" role="list">' + arch.map(mailRowHtml).join("") + "</ul></details>";
    }
    return h;
  }
  function mailDigestHtml(u) {
    if (!u) return "";
    return '<details class="card hist" id="mailDigestDetails"' + (state.mailDigestOpen ? " open" : "") + "><summary>Laatste mailupdate · " + esc(fmtDate(u.date, true)) +
      '</summary><div class="md">' + window.renderMarkdown(u.markdown) + "</div></details>";
  }
  function mailOfflineNote() { if (!state.mailOffline) return ""; return '<p class="rem-note">Offline: lijst kon niet worden geladen. Je ziet de laatste mailupdate; vinkjes worden alleen op dit toestel bewaard.</p>'; }
  function mailRerender() { var m = location.hash.match(/^#\/bot\/(.+)$/); if (m) renderDetail(decodeURIComponent(m[1])); }
  function mailConfirmDelete() { return window.confirm("Weet je zeker dat je deze e-mail wilt verwijderen?"); }
  function mailOpen(id) { state.mailOpenId = id; mailRerender(); window.scrollTo(0, 0); }
  function mailToggle(id, checked) {
    var it = (state.mail || []).filter(function (x) { return x.id === id; })[0]; if (!it) return;
    var backup = JSON.parse(JSON.stringify(it)), now = nowAmsLocal();
    var dz = $("mailArchDetails"); if (dz) state.mailArchOpen = dz.open;
    if (checked) { it.status = "done"; it.doneAt = now; delete it.goneAt; } else { it.status = "open"; delete it.doneAt; delete it.goneAt; }
    setTimeout(mailRerender, 250);
    // Afvinken = ook in Outlook naar Verwijderde items (uitgevoerd door de mail-routine, herstelbaar).
    mailApi("PATCH", "/" + encodeURIComponent(id), checked ? { status: "done", deleteInOutlook: true } : { status: "open" }).then(function (srv) {
      if (srv && srv.id) { Object.keys(it).forEach(function (k) { delete it[k]; }); Object.assign(it, srv); }
    }, function () {
      Object.keys(it).forEach(function (k) { delete it[k]; }); Object.assign(it, backup);
      mailRerender(); toast("Opslaan mislukt – vinkje teruggezet");
    });
  }
  // ---- mailacties:end ----

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
    if (APP === "root") { $("botList").innerHTML = launcherHtml(d); showChromeTips(); return; }
    // Email Reageren always first; preserve relative order of the rest.
    var bots = d.bots.filter(botInApp).sort(function (a, b) {
      var ae = isEmailBot(a) ? 0 : 1;
      var be = isEmailBot(b) ? 0 : 1;
      return ae - be;
    });
    var remInserted = false;
    $("botList").innerHTML = bots.map(function (b) {
      var html = botBtnHtml(b);
      if (!remInserted && isEmailBot(b)) { remInserted = true; html += remHomeButtonHtml(); }
      return html;
    }).join("") + (remInserted || APP !== "acties" ? "" : remHomeButtonHtml());
    showChromeTips();
  }
  function launcherHtml(d) {
    var acties = d.bots.filter(function (b) { return appForBot(b) === "acties"; });
    var onderzoek = d.bots.filter(function (b) { return appForBot(b) === "onderzoek"; });
    var needs = acties.some(emailNeedsAction) || remDueTodayPending();
    function btn(app, cls, emoji, name, sub, list, flag) {
      return '<a class="bot-btn launch-btn' + (flag ? " bot-btn--action" : "") + '" style="--c:' + cls + '" href="' + appUrl(app) + '">' +
        '<span class="bot-emoji" aria-hidden="true">' + emoji + '</span><span class="bot-text"><span class="bot-name-row"><span class="bot-name">' + esc(name) + "</span>" +
        (flag ? '<span class="bot-badge" aria-label="Actie nodig">Actie</span>' : "") + "</span>" +
        '<span class="bot-sub">' + esc(sub) + '</span><span class="bot-date">' + esc(list) + "</span></span>" +
        '<span class="bot-chev" aria-hidden="true">›</span></a>';
    }
    return '<p class="launch-intro">Mijn Bots is opgesplitst in twee apps. Kies er één (en zet hem eventueel op je beginscherm):</p>' +
      btn("acties", "#C2410C", "✅", "Acties Michael", "Mails, herinneringen, vacatures & crypto",
        acties.sort(function (a, b) { return ACTIES_KEYS.indexOf(a.key) - ACTIES_KEYS.indexOf(b.key); })
          .map(function (b) { return b.name; }).reduce(function (o, n, i) { return i === 0 ? [n, "Herinneringen"] : o.concat([n]); }, []).join(" · "), needs) +
      btn("onderzoek", "#1F6FB2", "🔬", "Onderzoek", "Alle onderzoeks- en nieuwsbots",
        onderzoek.map(function (b) { return b.name; }).join(" · "), false);
  }
  function botBtnHtml(b) {
    return (function (b) {
      var u = b.updates && b.updates[0];
      var needs = emailNeedsAction(b);
      var cls = "bot-btn" + (needs ? " bot-btn--action" : "");
      var badge = needs ? '<span class="bot-badge" aria-label="Actie nodig">Actie</span>' : "";
      return '<button type="button" class="' + cls + '" style="--c:' + esc(b.color || "#666") + '" data-id="' + esc(b.id) + '"' +
        (needs ? ' aria-description="Actie vandaag"' : "") + '>' +
        '<span class="bot-emoji" aria-hidden="true">' + esc(b.emoji || "🤖") + "</span>" +
        '<span class="bot-text"><span class="bot-name-row"><span class="bot-name">' + esc(b.name) + "</span>" + badge + "</span>" +
        '<span class="bot-sub">' + esc(b.subtitle || "") + "</span>" +
        '<span class="bot-date">' + (u ? esc(fmtDate(u.date)) : "Nog geen update") + "</span></span>" +
        '<span class="bot-chev" aria-hidden="true">›</span></button>';
    })(b);
  }
  function renderDetail(id) {
    if (id === REM_ID) { renderRemindersDetail(); return; }
    var b = findBot(id);
    if (!b) { location.hash = ""; return; }
    $("detailBar").style.setProperty("--c", b.color || "#666");
    $("detailEmoji").textContent = b.emoji || "🤖";
    $("detailName").textContent = b.name;
    var ups = b.updates || [], h = "";
    var klimaat = isKlimaatBot(b);
    var parkinson = isParkinsonBot(b);
    if (!klimaat && !parkinson) state.klimaatTopic = null;
    if (isCryptoBot(b)) h += cryptoPanelHtml();
    if (!ups.length && isEmailBot(b) && mailOnline()) {
      h += emailRemindersHtml() + mailListHtml();
    } else if (!ups.length) {
      h += '<div class="card empty-card"><p class="big-empty">Nog geen update beschikbaar</p><p>Deze bot heeft nog geen rapport gestuurd. Kom later terug.</p></div>';
    } else {
      if (klimaat) {
        h += renderKlimaatLatest(ups[0]);
      } else if (parkinson) {
        h += renderParkinsonLatest(ups[0]);
      } else if (isEmailBot(b)) {
        h += emailRemindersHtml() + (mailOnline() ? mailListHtml() + mailDigestHtml(ups[0]) : mailOfflineNote() + renderEmailLatest(ups[0]));
      } else {
        h += '<article class="card latest"><div class="card-date">Laatste update · ' + esc(fmtDate(ups[0].date, true)) + '</div><div class="md">' + window.renderMarkdown(ups[0].markdown) + "</div></article>";
      }
      if (ups.length > 1) {
        h += '<h2 class="hist-title">Eerdere updates</h2>';
        h += ups.slice(1).map(function (u) {
          return '<details class="card hist"><summary>' + esc(fmtDate(u.date, true)) + '</summary><div class="md">' + window.renderMarkdown(u.markdown) + "</div></details>";
        }).join("");
      }
    }
    if (isEmailBot(b) && state.mailOpenId) {
      var mv = mailById(state.mailOpenId);
      if (mv) h = mailViewHtml(mv); else state.mailOpenId = null;
    }
    $("detailBody").innerHTML = h;
    $("topicsBtn").hidden = !((klimaat || parkinson) && state.klimaatTopic && ups.length);
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
    if (!/^#\/bot\//.test(location.hash)) state.mailOpenId = null;
    if (!isUnlocked()) { if ($("lock").hidden) showLock(); return; }
    var m = location.hash.match(/^#\/bot\/([^\/]+)(?:\/(blok-\d+|alles))?$/);
    if (m && state.data) {
      var botId = decodeURIComponent(m[1]);
      // Link naar een bot die in de andere app (of op het keuzescherm) hoort: daarheen doorsturen.
      var target = botId === REM_ID ? "acties" : (findBot(botId) ? appForBot(findBot(botId)) : null);
      if (target && target !== APP) { location.replace(appUrl(target) + location.hash); return; }
      if (state._detailBotId !== botId) {
        state.mailOpenId = null;
        state.klimaatTopic = null;
        state._detailBotId = botId;
        state.emailShowHidden = false;
        state.remNote = false;
      }
      state.klimaatTopic = m[2] || null;
      renderDetail(botId);
      $("home").hidden = true; $("detail").hidden = false; window.scrollTo(0, 0);
      stopHomeRefresh();
    } else {
      state.klimaatTopic = null;
      state._detailBotId = null;
      state.emailShowHidden = false;
      renderHome();
      $("detail").hidden = true; $("home").hidden = false;
      startHomeRefresh();
    }
  }
  function render() { route(); }

  $("detailBody").addEventListener("toggle", function (e) {
    if (e.target && e.target.id === "remDoneDetails") state.remDoneOpen = e.target.open;
    if (e.target && e.target.id === "mailArchDetails") state.mailArchOpen = e.target.open;
    if (e.target && e.target.id === "mailDigestDetails") state.mailDigestOpen = e.target.open;
  }, true);
  $("topicsBtn").addEventListener("click", function () {
    var m = location.hash.match(/^#\/bot\/([^\/]+)/);
    if (!m) return;
    if (history.state && history.state.topicFrom === m[1]) history.back();
    else location.hash = "#/bot/" + m[1];
  });
  $("detailBody").addEventListener("click", function (e) {
    var redit = e.target.closest("[data-rem-edit]");
    if (redit) { state.remEditId = redit.getAttribute("data-rem-edit"); renderRemindersDetail(); return; }
    if (e.target.closest("[data-rem-cancel]")) { state.remEditId = null; renderRemindersDetail(); return; }
    var rdel = e.target.closest("[data-rem-del]");
    if (rdel) {
      var rid = rdel.getAttribute("data-rem-del");
      if (!window.confirm("Deze herinnering verwijderen?")) return;
      rdel.disabled = true;
      remApi("DELETE", "/" + encodeURIComponent(rid)).then(function () { toast("Verwijderd ✓"); }, function () { toast("Verwijderen mislukt – probeer opnieuw"); }).then(remRefreshView);
      return;
    }
    var hidTog = e.target.closest("[data-email-toggle-hidden]");
    if (hidTog) {
      e.preventDefault();
      state.emailShowHidden = !state.emailShowHidden;
      var mh = location.hash.match(/^#\/bot\/(.+)$/);
      if (mh) renderDetail(decodeURIComponent(mh[1]));
      return;
    }
    var back = e.target.closest("[data-topic-back]");
    if (back) {
      var m = location.hash.match(/^#\/bot\/([^\/]+)/);
      if (m) {
        if (history.state && history.state.topicFrom === m[1]) history.back();
        else location.hash = "#/bot/" + m[1];
      }
      return;
    }
    var chip = e.target.closest(".topic-chip");
    if (chip) {
      var m2 = location.hash.match(/^#\/bot\/([^\/]+)/);
      if (m2) {
        var nh = "#/bot/" + m2[1] + "/" + chip.getAttribute("data-topic");
        if (state.klimaatTopic) history.replaceState({ topicFrom: m2[1] }, "", nh);
        else history.pushState({ topicFrom: m2[1] }, "", nh);
        route();
      }
    }
  });
  $("detailBody").addEventListener("submit", function (e) {
    var ef = e.target.closest && e.target.closest("form.rem-editform");
    if (ef) {
      e.preventDefault();
      var eid = ef.getAttribute("data-rem-editform");
      var et = ef.elements.text.value.trim().replace(/\s+/g, " ").replace(/\|/g, "/");
      var edt = ef.elements.date.value, etm = (ef.elements.time.value || "12:00").slice(0, 5);
      if (!et || !edt) return;
      var edue = edt + "T" + etm, enow = nowAmsLocal();
      state.remEditId = null;
      remOptimistic(eid, { text: et, due: edue }, function (it) {
        var changed = it.due !== edue;
        it.text = et; it.due = edue;
        if (changed && edue > enow) { it.status = "gepland"; it.remindedAt = null; delete it.reopenedAt; delete it.doneAt; }
      });
      return;
    }
    if (e.target.id !== "remForm") return;
    e.preventDefault();
    var text = $("remText").value.trim().replace(/\s+/g, " ").replace(/\|/g, "/");
    var date = $("remDate").value, time = $("remTime").value || "12:00";
    if (!text || !date) return;
    var due = date + "T" + time.slice(0, 5);
    state.remBusy = true; renderRemindersDetail();
    remApi("POST", "", { text: text, due: due }).then(function () {
      state.remBusy = false; toast("Herinnering opgeslagen ✓");
    }, function () {
      state.remBusy = false; state.remDraft = { text: text, date: date, time: time };
      window.alert("Opslaan mislukt (geen verbinding?). Probeer het zo opnieuw.");
    }).then(remRefreshView);
  });
  $("detailBody").addEventListener("change", function (e) {
    var rd = e.target.closest("input.rem-done");
    if (rd) {
      var did = rd.getAttribute("data-rem-done"), on = rd.checked, nw = nowAmsLocal();
      var dz = $("remDoneDetails"); if (dz) state.remDoneOpen = dz.open;
      remOptimistic(did, { status: on ? "afgerond" : "gepland" }, function (it) {
        if (on) { it.status = "afgerond"; delete it.reopenedAt; }
        else { it.status = (it.due < nw && it.remindedAt) ? "herinnerd" : "gepland"; it.reopenedAt = nw; delete it.doneAt; }
      });
      return;
    }
    var cb = e.target.closest("input.email-check");
    if (!cb) return;
    setEmailItemChecked(cb.getAttribute("data-ident") || "", cb.getAttribute("data-hash") || "", cb.checked);
    var row = cb.closest(".email-check-row");
    if (row) row.classList.toggle("is-checked", cb.checked);
  });

  $("detailBody").addEventListener("click", function (e) {
    var mc = e.target.closest("button.email-check-box[data-mail-id]");
    if (mc) {
      var mid = mc.getAttribute("data-mail-id"), turnOn = mc.getAttribute("aria-pressed") !== "true";
      if (turnOn && !mailConfirmDelete()) return;
      mailToggle(mid, turnOn); return;
    }
    var md = e.target.closest("[data-mail-done]");
    if (md) {
      if (!mailConfirmDelete()) return;
      var did = md.getAttribute("data-mail-done");
      state.mailOpenId = null; mailToggle(did, true); mailRerender(); return;
    }
    var op = e.target.closest("[data-mail-open]");
    if (op) { mailOpen(op.getAttribute("data-mail-open")); return; }
  });
  $("botList").addEventListener("click", function (e) {
    var b = e.target.closest(".bot-btn[data-id]"); if (b) location.hash = "#/bot/" + encodeURIComponent(b.getAttribute("data-id"));
  });
  $("backBtn").addEventListener("click", function () {
    if (state.mailOpenId) { state.mailOpenId = null; mailRerender(); return; }
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
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController || reloaded) { hadController = true; return; }
      reloaded = true; location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
        reg.update();
        document.addEventListener("visibilitychange", function () { if (!document.hidden) reg.update(); });
      }).catch(function () {});
    });
  }

  // Start
  try { if (!localStorage.getItem(MAIL_MIGRATED_KEY)) cleanupEmailChecks(); } catch (e) {}
  try {
    var c = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
    if (c && c.data) { state.data = c.data; state.fetchedAt = new Date(c.fetchedAt); state.fromCache = true; }
  } catch (e) {}
  showChromeTips();
  route();
  loadData(false);
})();
