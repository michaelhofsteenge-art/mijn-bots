// Energieprijs — actuele day-ahead stroomprijs voor Nederland.
(function () {
  "use strict";
  var EP = window.Energieprijs;
  var REFRESH_MS = 5 * 60 * 1000;
  var TICK_MS = 30 * 1000;
  var CACHE_KEY = "energieprijs-v1";
  var THEME_KEY = "energieprijs-theme";
  var FRANK_URL = "https://graphql.frankenergie.nl/";
  var EZ_REST = "https://api.energyzero.nl/v1/energyprices";
  var EZ_GQL = "https://api.energyzero.nl/v1/gql";
  var FRANK_QUERY = "query MarketPrices($date: String!, $resolution: PriceResolution!) { marketPrices(date: $date, resolution: $resolution) { electricityPrices { from till marketPrice marketPriceTax allInPrice energyTaxPrice sourcingMarkupPrice perUnit } } }";
  var EZ_QUERY = "query EnergyMarketPrices($input: EnergyMarketPricesInput!) { energyMarketPrices(input: $input) { prices { energyPriceExcl energyPriceIncl from till additionalCosts { name priceExcl priceIncl } } } }";

  var state = {
    payload: null,
    error: null,
    loading: false,
    fromCache: false,
    day: null,
    listScroll: null,
    focusNow: false
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fetchTimeout(url, opts, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 12000);
    var options = Object.assign({ cache: "no-store" }, opts || {});
    if (ctrl) options.signal = ctrl.signal;
    return fetch(url, options).finally(function () { clearTimeout(timer); });
  }

  function readCache() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!raw || !raw.slots || !raw.slots.length) return null;
      return {
        source: raw.source,
        fetchedAt: new Date(raw.fetchedAt),
        slots: EP.revive(raw.slots)
      };
    } catch (e) {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        source: payload.source,
        fetchedAt: payload.fetchedAt.toISOString(),
        slots: payload.slots.map(function (s) {
          return {
            from: s.from.toISOString(),
            till: s.till.toISOString(),
            marketExcl: s.marketExcl,
            taxExcl: s.taxExcl,
            markupExcl: s.markupExcl,
            allIn: s.allIn
          };
        })
      }));
    } catch (e) {}
  }

  function frankDay(dateStr) {
    return fetchTimeout(FRANK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        operationName: "MarketPrices",
        query: FRANK_QUERY,
        variables: { date: dateStr, resolution: "PT15M" }
      })
    }).then(function (res) {
      if (!res.ok) throw new Error("frank-http");
      return res.json();
    }).then(function (body) {
      var list = body && body.data && body.data.marketPrices && body.data.marketPrices.electricityPrices;
      if (!list) {
        var msg = body && body.errors && body.errors[0] && body.errors[0].message || "";
        if (/No marketprices/i.test(msg)) return [];
        throw new Error("frank");
      }
      return EP.normalizeFrank(list).filter(function (s) { return EP.amsterdamDate(s.from) === dateStr; });
    });
  }

  function energyZeroRest(from, till, interval) {
    var url = EZ_REST + "?fromDate=" + encodeURIComponent(EP.isoMillis(from)) +
      "&tillDate=" + encodeURIComponent(EP.isoMillis(till)) +
      "&interval=" + interval + "&usageType=1&inclBtw=false";
    return fetchTimeout(url, { headers: { "Accept": "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("ez-http");
      return res.json();
    }).then(function (body) {
      return EP.normalizeEnergyZeroRest(body && body.Prices).filter(function (s) {
        return s.from >= from && s.from < till;
      });
    });
  }

  function energyZeroGraphql(from, till) {
    return fetchTimeout(EZ_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        operationName: "EnergyMarketPrices",
        query: EZ_QUERY,
        variables: { input: { from: EP.isoMillis(from), till: EP.isoMillis(till), intervalType: "Hourly", type: "Electricity" } }
      })
    }).then(function (res) {
      if (!res.ok) throw new Error("ez-gql");
      return res.json();
    }).then(function (body) {
      var list = body && body.data && body.data.energyMarketPrices && body.data.energyMarketPrices.prices;
      if (!list || !list.length) throw new Error("ez-leeg");
      return EP.normalizeEnergyZeroGraphql(list).filter(function (s) { return s.from >= from && s.from < till; });
    });
  }

  function frankBoth(today, tomorrow) {
    return Promise.all([
      frankDay(today),
      frankDay(tomorrow).catch(function () { return []; })
    ]).then(function (parts) {
      if (!parts[0].length) throw new Error("geen vandaag");
      return { source: "frank", slots: parts[0].concat(parts[1]) };
    });
  }

  function hourlyEnergyZero(spanFrom, spanTill, today) {
    return energyZeroGraphql(spanFrom, spanTill).then(function (slots) {
      if (!EP.slotsOnDate(slots, today).length) throw new Error("ez zonder vandaag");
      return { source: "energyzero", slots: slots };
    });
  }

  function loadRemote(now) {
    var today = EP.amsterdamDate(now);
    var tomorrow = EP.addCalendarDays(today, 1);
    var spanFrom = EP.localDayRange(today).from;
    var spanTill = EP.localDayRange(tomorrow).till;
    function fromFrankOrHourly() {
      return frankBoth(today, tomorrow).catch(function () {
        return hourlyEnergyZero(spanFrom, spanTill, today);
      });
    }
    return energyZeroRest(spanFrom, spanTill, 3).then(function (quarters) {
      if (quarters.length < 8) return fromFrankOrHourly();
      return energyZeroGraphql(spanFrom, spanTill).then(function (hourly) {
        var costs = EP.constantCost(hourly);
        var tax = costs.tax && costs.tax.constant ? costs.tax.value : EP.OFFICIAL_TAX_EXCL;
        var markup = costs.markup && costs.markup.constant ? costs.markup.value : null;
        return { source: "energyzero", slots: EP.applyCosts(quarters, tax, markup) };
      }).catch(function () {
        return { source: "energyzero", slots: EP.applyCosts(quarters, EP.OFFICIAL_TAX_EXCL, null) };
      });
    }).catch(fromFrankOrHourly);
  }

  function selectedDate(now) {
    var today = EP.amsterdamDate(now);
    var tomorrow = EP.addCalendarDays(today, 1);
    if (state.day !== today && state.day !== tomorrow) state.day = today;
    return state.day;
  }

  function sourceCopy(source, slots) {
    var grain = EP.granularityLabel(slots);
    if (source === "frank") {
      return {
        name: "Frank Energie",
        grain: grain,
        line: "Bron: Frank Energie, openbare day-aheadprijs voor Nederland (" + grain + "prijzen, EPEX). Geen API-sleutel. EnergyZero laat een verzoek van deze site toe, maar geeft op dit moment geen kwartierprijzen terug — alleen uurprijzen. Daarom staat hier de kwartierprijs."
      };
    }
    return {
      name: "EnergyZero",
      grain: grain,
      line: "Bron: EnergyZero (api.energyzero.nl), openbare day-aheadprijs voor Nederland, zonder API-sleutel. De reeks die de bron nu teruggeeft, is per " + grain + "."
    };
  }

  function assumptionHtml(payload, slot) {
    var costs = EP.constantCost(payload.slots);
    var tax = slot && slot.taxExcl != null ? slot.taxExcl : (costs.tax ? costs.tax.value : EP.OFFICIAL_TAX_EXCL);
    var official = EP.taxMatchesOfficial(tax);
    var taxLine = official
      ? "Energiebelasting 2026, schijf tot 10.000 kWh: " + EP.euro(EP.OFFICIAL_TAX_EXCL, 5) + " per kWh excl. btw (Belastingdienst). Met 21% btw is dat " + EP.euro(EP.OFFICIAL_TAX_EXCL * 1.21, 5) + ". Een gewoon huishouden blijft in deze schijf. De ODE zit sinds 2023 in de energiebelasting."
      : "De bron geeft energiebelasting van " + EP.euro(tax, 5) + " per kWh excl. btw. Het tarief van de Belastingdienst voor 2026 (schijf tot 10.000 kWh) is " + EP.euro(EP.OFFICIAL_TAX_EXCL, 5) + ". Deze schatting gebruikt het bedrag van de bron.";
    var markup = slot ? slot.markupExcl : (costs.markup ? costs.markup.value : null);
    var markupLine;
    if (markup == null) {
      markupLine = "Leveranciersopslag is niet meegenomen: de bron stuurde geen opslag mee. Er is geen bedrag verzonnen.";
    } else if (payload.source === "frank") {
      markupLine = "Opslag: " + EP.euro(markup, 5) + " per kWh excl. btw (" + EP.euro(markup * 1.21, 5) + " incl. btw). Dit is de inkoopopslag die Frank Energie in deze openbare prijs zet, geen landelijk gemiddelde. Jouw leverancier kan een andere opslag rekenen.";
    } else {
      markupLine = "Opslag: " + EP.euro(markup, 5) + " per kWh excl. btw (" + EP.euro(markup * 1.21, 5) + " incl. btw). Dit zijn de inkoopkosten die EnergyZero bij de marktprijs publiceert, geen gemiddelde van alle leveranciers.";
    }
    var creditIncl = EP.TAX_CREDIT_EXCL * (1 + EP.VAT);
    var outside = "Niet meegerekend: netbeheerkosten (meestal een vast bedrag per aansluiting, niet per kWh) en de belastingvermindering van " + EP.euro(EP.TAX_CREDIT_EXCL, 2) + " per jaar excl. btw (" + EP.euro(Math.round(creditIncl * 100) / 100, 2) + " incl. btw) voor een aansluiting met verblijfsfunctie (Belastingdienst 2026).";
    var formula = markup == null
      ? "Schatting zonder opslag = (kale marktprijs + energiebelasting) × 1,21."
      : "Schatting all-in = (kale marktprijs + energiebelasting + opslag) × 1,21.";
    return "<h2>Zo is de schatting opgebouwd</h2><ul><li>" + formula + "</li><li>" + taxLine + "</li><li>" + markupLine + "</li><li>" + outside + "</li><li>Incl. 21% btw hierboven is alleen de marktprijs plus btw, nog zonder energiebelasting en opslag.</li></ul>";
  }

  function mix(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function barColor(t) {
    var stops = [[5, 150, 105], [217, 119, 6], [220, 38, 38]];
    var x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(x));
    var f = x - i;
    return "rgb(" + mix(stops[i][0], stops[i + 1][0], f) + "," + mix(stops[i][1], stops[i + 1][1], f) + "," + mix(stops[i][2], stops[i + 1][2], f) + ")";
  }

  function chartSvg(daySlots, nowSlot, windowSlots, ext) {
    if (!daySlots.length || !ext) return "";
    var n = daySlots.length;
    var min = ext.min;
    var max = ext.max;
    var span = max - min || 1;
    var w = 100;
    var h = 42;
    var gap = n > 40 ? 0.15 : 0.35;
    var bw = w / n;
    var parts = [];
    daySlots.forEach(function (s, i) {
      var t = (s.marketExcl - min) / span;
      var bh = Math.max(0.8, t * (h - 2));
      var inWindow = windowSlots.some(function (w) { return w.from.getTime() === s.from.getTime(); });
      var isNow = nowSlot && nowSlot.from.getTime() === s.from.getTime();
      var y = h - bh;
      parts.push('<rect class="' + (isNow ? "is-now" : "") + (inWindow ? " is-window" : "") + '" x="' + (i * bw + gap / 2).toFixed(3) + '" y="' + y.toFixed(3) + '" width="' + Math.max(0.2, bw - gap).toFixed(3) + '" height="' + bh.toFixed(3) + '" rx="0.35" fill="' + barColor(t) + '"/>');
    });
    var label = "Prijzen van " + EP.amsterdamDate(daySlots[0].from) + ", van " + EP.euro(min) + " tot " + EP.euro(max) + " per kWh.";
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '" preserveAspectRatio="none">' + parts.join("") + "</svg>";
  }

  function timesLabel(slots) {
    if (!slots.length) return "";
    var first = EP.formatTime(slots[0].from);
    if (slots.length === 1) return first;
    return first + " en nog " + (slots.length - 1) + (slots.length === 2 ? " moment" : " momenten");
  }

  function rowClass(s, nowSlot, ext, windowSlots) {
    var cls = "slot";
    if (nowSlot && s.from.getTime() === nowSlot.from.getTime()) cls += " is-now";
    if (ext && Math.abs(s.marketExcl - ext.min) < 1e-9) cls += " is-low";
    if (ext && Math.abs(s.marketExcl - ext.max) < 1e-9) cls += " is-high";
    if (windowSlots.some(function (w) { return w.from.getTime() === s.from.getTime(); })) cls += " is-window";
    return cls;
  }

  function render() {
    var root = $("app");
    var now = new Date();
    var payload = state.payload;
    if (!payload) {
      root.innerHTML = '<p class="panel empty">' + (state.error ? esc(state.error) : "Prijzen ophalen…") +
        (state.error ? '<button type="button" class="retry" id="retryBtn">Opnieuw proberen</button>' : "") + "</p>";
      var retry = $("retryBtn");
      if (retry) retry.addEventListener("click", function () { load(true); });
      $("updated").textContent = state.error ? "Niet gelukt" : "Laden…";
      return;
    }

    var today = EP.amsterdamDate(now);
    var tomorrow = EP.addCalendarDays(today, 1);
    var date = selectedDate(now);
    var slots = payload.slots;
    var grain = EP.granularityLabel(slots);
    var nowSlot = EP.currentSlot(slots, now);
    var daySlots = EP.slotsOnDate(slots, date);
    var todaySlots = EP.slotsOnDate(slots, today);
    var ext = EP.extremes(daySlots);
    var win = EP.nextCheapWindow(slots, now);
    var copy = sourceCopy(payload.source, slots);
    var band = EP.band(nowSlot, todaySlots);
    var bandText = band === "laag" ? "Laag voor vandaag" : band === "hoog" ? "Hoog voor vandaag" : "Midden voor vandaag";
    var stamp = "Laatst bijgewerkt: " + EP.formatUpdated(payload.fetchedAt) + (state.fromCache ? " · offline" : "") + (state.loading ? " · verversen…" : "") + (state.staleError ? " · verversen mislukt" : "");
    $("updated").textContent = stamp;

    var hero = "";
    if (!nowSlot) {
      hero = '<section class="hero"><p class="kicker">Nu</p><p class="price">—</p><p class="unit">Geen prijs voor dit tijdstip.</p></section>';
    } else {
      var breakdown = "";
      if (nowSlot.taxExcl != null) {
        var parts = EP.euro(nowSlot.marketExcl) + " markt";
        parts += " + " + EP.euro(nowSlot.taxExcl, 5) + " belasting";
        if (nowSlot.markupKnown) parts += " + " + EP.euro(nowSlot.markupExcl, 5) + " opslag";
        parts += " = " + EP.euro((nowSlot.marketExcl + nowSlot.taxExcl + (nowSlot.markupExcl || 0))) + " excl. btw";
        breakdown = '<p class="breakdown">' + parts + "</p>";
      }
      var allInLabel = nowSlot.markupKnown ? "Schatting all-in" : "Schatting zonder opslag";
      hero = '<section class="hero" aria-live="polite">' +
        '<p class="kicker">Nu · ' + EP.rangeLabel(nowSlot.from, nowSlot.till) + " · " + grain + "</p>" +
        '<p class="price">' + EP.euro(nowSlot.marketExcl) + "</p>" +
        '<p class="unit">per kWh · kale marktprijs, excl. btw</p>' +
        '<p class="band band-' + band + '">' + bandText + "</p>" +
        '<dl class="figures">' +
        "<div><dt>Markt incl. 21% btw</dt><dd>" + EP.euro(nowSlot.marketIncl) + "</dd></div>" +
        "<div><dt>" + allInLabel + "</dt><dd>" + EP.euro(nowSlot.allIn) + "</dd></div>" +
        "</dl>" + breakdown +
        (ext && ext.min < 0 ? '<p class="note">Er is een negatieve marktprijs. Op de kale prijs zou je dan geld toe krijgen; belasting en opslag blijven.</p>' : "") +
        "</section>";
    }

    var winHtml;
    if (!win) {
      winHtml = '<section class="window"><h2>Volgende goedkope periode</h2><p>Geen goedkope periode meer in de prijzen die nu bekend zijn.</p></section>';
    } else {
      var when = EP.rangeLabel(win.from, win.till);
      var dayNote = EP.amsterdamDate(win.from) === tomorrow ? "morgen " : (EP.amsterdamDate(win.from) === today ? "" : EP.amsterdamDate(win.from) + " ");
      winHtml = '<section class="window' + (win.active ? " is-active" : "") + '"><h2>' + (win.active ? "Goedkope periode nu" : "Volgende goedkope periode") + "</h2>" +
        '<p class="window-when">' + dayNote + when + "</p>" +
        "<p>gemiddeld " + EP.euro(win.avg) + " per kWh excl. btw · " + EP.durationLabel(win.minutes) + "</p>" +
        '<p class="hint">Goedkoop betekent: elk ' + grain + " hoort bij de goedkoopste 25% van die dag. Een periode is minstens " + (slots[0].minutes >= 45 ? EP.durationLabel(slots[0].minutes) : "45 min") + ".</p></section>";
    }

    var tabs = '<div class="tabs" role="tablist">' +
      '<button type="button" class="tab' + (date === today ? " is-on" : "") + '" id="tabToday" role="tab" aria-selected="' + (date === today) + '">Vandaag</button>' +
      '<button type="button" class="tab' + (date === tomorrow ? " is-on" : "") + '" id="tabTomorrow" role="tab" aria-selected="' + (date === tomorrow) + '">Morgen</button>' +
      "</div>";

    var body;
    if (!daySlots.length) {
      body = '<p class="panel empty">' + (date === tomorrow
        ? "Morgen is nog niet bekend. De prijzen verschijnen meestal tussen 13:00 en 14:00."
        : "Geen prijzen voor deze dag.") + "</p>";
    } else {
      var neg = ext.min < 0 ? '<p class="note">Laagste prijs is negatief.</p>' : "";
      var stats = '<div class="stats"><div><h3>Goedkoopste</h3><p class="stat-price">' + EP.euro(ext.min) + '</p><p>' + timesLabel(ext.cheapest) + '</p></div>' +
        "<div><h3>Duurste</h3><p class=\"stat-price\">" + EP.euro(ext.max) + "</p><p>" + timesLabel(ext.dearest) + "</p></div>" +
        "<div><h3>Gemiddeld</h3><p class=\"stat-price\">" + EP.euro(EP.average(daySlots)) + "</p><p>kale prijs, deze dag</p></div></div>";
      var rows = "";
      var lastHour = "";
      daySlots.forEach(function (s) {
        var hour = EP.formatTime(s.from).slice(0, 2);
        if (hour !== lastHour) {
          rows += '<li class="hour">' + hour + ":00</li>";
          lastHour = hour;
        }
        var id = nowSlot && s.from.getTime() === nowSlot.from.getTime() ? ' id="slotNow"' : "";
        rows += '<li class="' + rowClass(s, nowSlot, ext, win ? win.slots : []) + '"' + id + "><span>" + EP.rangeLabel(s.from, s.till) + "</span><span>" + EP.euro(s.marketExcl) + "</span><span>" + EP.euro(s.allIn) + "</span></li>";
      });
      body = '<section class="day">' + chartSvg(daySlots, date === today ? nowSlot : null, win ? win.slots : [], ext) +
        '<p class="legend"><span><i class="swatch low"></i> goedkoop</span><span><i class="swatch mid"></i> midden</span><span><i class="swatch high"></i> duur</span></p>' +
        stats + neg +
        '<ol class="slot-list" id="slotList"><li class="head"><span>Tijd</span><span>Kaal</span><span>Schatting</span></li>' + rows + "</ol></section>";
    }

    var list = $("slotList");
    var previousDate = state.renderedDate;
    if (list && previousDate === date) state.listScroll = list.scrollTop;

    root.innerHTML = hero + winHtml + tabs + body +
      '<section class="assumptions">' + assumptionHtml(payload, nowSlot) + "</section>" +
      '<p class="source">' + esc(copy.line) + "</p>" +
      '<p class="install" id="installTip" hidden>Chrome op de iPhone opent deze pagina als tab. Voor een icoon op het beginscherm: open de site in Safari, tik op Deel en kies Zet op beginscherm.</p>';
    state.renderedDate = date;

    $("tabToday").addEventListener("click", function () { state.day = today; state.focusNow = true; render(); });
    $("tabTomorrow").addEventListener("click", function () { state.day = tomorrow; state.focusNow = false; render(); });
    var slotList = $("slotList");
    var nowRow = $("slotNow");
    if (nowRow && slotList && state.focusNow) {
      var listRect = slotList.getBoundingClientRect();
      var rowRect = nowRow.getBoundingClientRect();
      slotList.scrollTop += rowRect.top - listRect.top - slotList.clientHeight / 2 + rowRect.height / 2;
      state.focusNow = false;
    } else if (slotList && previousDate === date && state.listScroll != null) {
      slotList.scrollTop = state.listScroll;
    }
    showChromeTip();
  }

  function showChromeTip() {
    var ua = navigator.userAgent || "";
    var chromeIos = /CriOS/i.test(ua);
    var tip = $("installTip");
    if (tip) tip.hidden = !chromeIos;
  }

  function paintTheme() {
    var root = document.documentElement;
    var dark = root.getAttribute("data-theme") === "dark";
    var btn = $("themeBtn");
    if (btn) {
      btn.textContent = dark ? "☀️" : "🌙";
      btn.setAttribute("aria-label", dark ? "Lichte modus" : "Donkere modus");
    }
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute("content", dark ? "#0E1113" : "#0F766E");
      m.removeAttribute("media");
    });
  }

  function load(manual) {
    if (state.loading) return Promise.resolve();
    var first = !state.payload;
    state.loading = true;
    state.staleError = false;
    if (state.payload) $("updated").textContent = "Bezig met verversen…";
    else if (!$("app").innerHTML) render();
    var btn = $("refreshBtn");
    if (manual && btn) btn.classList.add("spin");
    return loadRemote(new Date()).then(function (remote) {
      state.payload = { source: remote.source, fetchedAt: new Date(), slots: remote.slots };
      state.error = null;
      state.fromCache = false;
      state.staleError = false;
      state.focusNow = !!manual || first;
      writeCache(state.payload);
    }).catch(function () {
      if (!state.payload) {
        var cached = readCache();
        if (cached) {
          state.payload = cached;
          state.fromCache = true;
          state.error = null;
          state.focusNow = true;
        } else {
          state.error = "Kan de prijzen niet ophalen. Controleer je internetverbinding en tik op vernieuwen.";
        }
      } else {
        state.staleError = true;
      }
    }).then(function () {
      state.loading = false;
      if (btn) btn.classList.remove("spin");
      render();
    });
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var theme = saved === "light" || saved === "dark" ? saved : (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    paintTheme();
    $("themeBtn").addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      paintTheme();
    });
  }

  function registerSw() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
        reg.update();
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) reg.update();
        });
      }).catch(function () {});
    });
  }

  initTheme();
  state.focusNow = true;
  var cached = readCache();
  if (cached) {
    state.payload = cached;
    state.fromCache = true;
    render();
  }
  load(false);
  setInterval(function () {
    if (!document.hidden) load(false);
  }, REFRESH_MS);
  setInterval(function () {
    if (state.payload && !state.loading) render();
  }, TICK_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load(false);
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) load(false);
  });
  $("refreshBtn").addEventListener("click", function () { load(true); });
  registerSw();
})();
