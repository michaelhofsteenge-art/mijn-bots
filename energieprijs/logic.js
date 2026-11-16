// Prijslogica voor Energieprijs. Werkt in de browser (window.Energieprijs) en in Node.
// Energiebelasting gecontroleerd op 16 november 2026 bij de Belastingdienst
// (tabel "Belasting op elektriciteit", jaar 2026, schijf 0 t/m 10.000 kWh): € 0,09161 per kWh excl. btw.
// Belastingvermindering 2026 voor een aansluiting met verblijfsfunctie: € 519,80 per jaar excl. btw.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Energieprijs = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TZ = "Europe/Amsterdam";
  var VAT = 0.21;
  var OFFICIAL_TAX_EXCL = 0.09161;
  var TAX_CREDIT_EXCL = 519.80;

  function amsterdamParts(date) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    var map = {};
    fmt.formatToParts(date).forEach(function (p) {
      if (p.type !== "literal") map[p.type] = p.value;
    });
    if (map.hour === "24") map.hour = "00";
    return map;
  }

  function amsterdamDate(date) {
    var p = amsterdamParts(date);
    return p.year + "-" + p.month + "-" + p.day;
  }

  function addCalendarDays(dateStr, n) {
    var parts = dateStr.split("-").map(Number);
    return amsterdamDate(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n, 12, 0, 0)));
  }

  function formatTime(date) {
    var p = amsterdamParts(date);
    return p.hour + ":" + p.minute;
  }

  function formatUpdated(date) {
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TZ,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function euro(n, digits) {
    if (digits == null) digits = 4;
    if (n == null || !isFinite(n)) return "—";
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(n);
  }

  function zonedMidnight(dateStr) {
    var parts = dateStr.split("-").map(Number);
    function offset(ms) {
      var p = amsterdamParts(new Date(ms));
      var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, 0);
      return asUtc - ms;
    }
    var guess = Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
    var off = offset(guess);
    var start = guess - off;
    var off2 = offset(start);
    if (off2 !== off) start = guess - off2;
    return new Date(start);
  }

  function localDayRange(dateStr) {
    return { from: zonedMidnight(dateStr), till: zonedMidnight(addCalendarDays(dateStr, 1)) };
  }

  function isoMillis(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, ".000Z");
  }

  function durationLabel(minutes) {
    minutes = Math.round(minutes);
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (h && m) return h + " uur " + m + " min";
    if (h) return h + " uur";
    return m + " min";
  }

  function endLabel(from, till) {
    var end = new Date(till.getTime());
    if (amsterdamDate(from) !== amsterdamDate(end) && formatTime(end) === "00:00") return "24:00";
    return formatTime(end);
  }

  function rangeLabel(from, till) {
    return formatTime(from) + "–" + endLabel(from, till);
  }

  function taxMatchesOfficial(taxExcl) {
    return taxExcl != null && isFinite(taxExcl) && Math.abs(taxExcl - OFFICIAL_TAX_EXCL) < 0.00002;
  }

  function finalize(slot) {
    var market = slot.marketExcl;
    var tax = slot.taxExcl;
    var markup = slot.markupExcl;
    if (tax != null && taxMatchesOfficial(tax)) tax = OFFICIAL_TAX_EXCL;
    var marketIncl = market * (1 + VAT);
    var allIn = slot.allIn;
    if (tax != null && markup != null) allIn = (market + tax + markup) * (1 + VAT);
    else if (allIn == null && tax != null && markup == null) allIn = (market + tax) * (1 + VAT);
    return {
      from: slot.from,
      till: slot.till,
      minutes: slot.till && slot.from ? Math.round((slot.till - slot.from) / 60000) : slot.minutes,
      marketExcl: market,
      marketIncl: marketIncl,
      taxExcl: tax,
      taxIncl: tax == null ? null : tax * (1 + VAT),
      markupExcl: markup,
      markupIncl: markup == null ? null : markup * (1 + VAT),
      allIn: allIn,
      markupKnown: markup != null
    };
  }

  function withDuration(slots) {
    var sorted = slots.filter(Boolean).slice().sort(function (a, b) { return a.from - b.from; });
    var step = null;
    if (sorted.length >= 2) step = sorted[1].from - sorted[0].from;
    for (var i = 0; i < sorted.length; i++) {
      if (!sorted[i].till) {
        var gap = sorted[i + 1] ? sorted[i + 1].from - sorted[i].from : step;
        sorted[i].till = new Date(sorted[i].from.getTime() + (gap || 3600000));
      }
      sorted[i].minutes = Math.round((sorted[i].till - sorted[i].from) / 60000);
    }
    return sorted.map(finalize);
  }

  function normalizeFrank(list) {
    var slots = [];
    (list || []).forEach(function (p) {
      if (p.perUnit && String(p.perUnit).toUpperCase() !== "KWH") return;
      var market = Number(p.marketPrice);
      if (!isFinite(market) || !p.from || !p.till) return;
      var taxIncl = Number(p.energyTaxPrice);
      var markupIncl = Number(p.sourcingMarkupPrice);
      var allIn = Number(p.allInPrice);
      slots.push({
        from: new Date(p.from),
        till: new Date(p.till),
        marketExcl: market,
        taxExcl: isFinite(taxIncl) ? taxIncl / (1 + VAT) : null,
        markupExcl: isFinite(markupIncl) ? markupIncl / (1 + VAT) : null,
        allIn: isFinite(allIn) ? allIn : null
      });
    });
    return withDuration(slots);
  }

  function costFromList(costs) {
    var tax = null;
    var markup = null;
    (costs || []).forEach(function (c) {
      var name = String(c.name || "").toLowerCase();
      var v = Number(c.priceExcl != null ? c.priceExcl : c.price);
      if (!isFinite(v)) return;
      if (name.indexOf("tax") >= 0 || name.indexOf("belasting") >= 0) tax = v;
      else if (name.indexOf("purchas") >= 0 || name.indexOf("inkoop") >= 0 || name.indexOf("opslag") >= 0 || name.indexOf("markup") >= 0 || name.indexOf("sourcing") >= 0) markup = v;
    });
    return { taxExcl: tax, markupExcl: markup };
  }

  function normalizeEnergyZeroGraphql(list) {
    var slots = [];
    (list || []).forEach(function (p) {
      var market = Number(p.energyPriceExcl);
      if (!isFinite(market) || !p.from) return;
      var costs = costFromList(p.additionalCosts);
      slots.push({
        from: new Date(p.from),
        till: p.till ? new Date(p.till) : null,
        marketExcl: market,
        taxExcl: costs.taxExcl,
        markupExcl: costs.markupExcl,
        allIn: null
      });
    });
    return withDuration(slots);
  }

  function normalizeEnergyZeroRest(list) {
    var slots = [];
    (list || []).forEach(function (p) {
      var market = Number(p.price);
      var from = p.readingDate || p.from;
      if (!isFinite(market) || !from) return;
      slots.push({
        from: new Date(from),
        till: p.till ? new Date(p.till) : null,
        marketExcl: market,
        taxExcl: null,
        markupExcl: null,
        allIn: null
      });
    });
    return withDuration(slots);
  }

  function constantCost(slots) {
    function one(key) {
      var vals = [];
      slots.forEach(function (s) {
        if (s[key] != null && isFinite(s[key])) vals.push(s[key]);
      });
      if (!vals.length) return null;
      var same = vals.every(function (v) { return Math.abs(v - vals[0]) < 0.00002; });
      return { value: vals[0], constant: same };
    }
    return { tax: one("taxExcl"), markup: one("markupExcl") };
  }

  function applyCosts(slots, taxExcl, markupExcl) {
    return withDuration(slots.map(function (s) {
      return {
        from: s.from,
        till: s.till,
        marketExcl: s.marketExcl,
        taxExcl: s.taxExcl != null ? s.taxExcl : taxExcl,
        markupExcl: s.markupExcl != null ? s.markupExcl : markupExcl,
        allIn: null
      };
    }));
  }

  function granularityLabel(slots) {
    if (!slots.length || !slots[0].minutes) return "tijdvak";
    var m = slots[0].minutes;
    if (m <= 20) return "kwartier";
    if (m <= 75) return "uur";
    return "tijdvak";
  }

  function slotsOnDate(slots, dateStr) {
    return slots.filter(function (s) { return amsterdamDate(s.from) === dateStr; });
  }

  function currentSlot(slots, now) {
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].from <= now && now < slots[i].till) return slots[i];
    }
    return null;
  }

  function quantile(values, p) {
    var s = values.filter(function (v) { return isFinite(v); }).slice().sort(function (a, b) { return a - b; });
    if (!s.length) return NaN;
    var i = Math.ceil(p * s.length) - 1;
    if (i < 0) i = 0;
    if (i >= s.length) i = s.length - 1;
    return s[i];
  }

  function dayThresholds(slots) {
    var byDay = {};
    slots.forEach(function (s) {
      var d = amsterdamDate(s.from);
      (byDay[d] || (byDay[d] = [])).push(s.marketExcl);
    });
    var out = {};
    Object.keys(byDay).forEach(function (d) { out[d] = quantile(byDay[d], 0.25); });
    return out;
  }

  function isCheap(slot, thresholds) {
    var t = thresholds[amsterdamDate(slot.from)];
    return isFinite(t) && slot.marketExcl <= t + 1e-9;
  }

  function nextCheapWindow(slots, now) {
    if (!slots.length) return null;
    var thresholds = dayThresholds(slots);
    var runs = [];
    var run = null;
    for (var i = 0; i < slots.length; i++) {
      var cheap = isCheap(slots[i], thresholds);
      var adjacent = run && Math.abs(slots[i].from - run.till) < 2000;
      if (cheap && adjacent) {
        run.slots.push(slots[i]);
        run.till = slots[i].till;
      } else if (cheap) {
        if (run) runs.push(run);
        run = { from: slots[i].from, till: slots[i].till, slots: [slots[i]] };
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
    if (run) runs.push(run);
    var minMinutes = slots[0].minutes >= 45 ? slots[0].minutes : 45;
    var upcoming = runs.filter(function (r) { return r.till > now; }).map(function (r) {
      var sum = 0;
      r.slots.forEach(function (s) { sum += s.marketExcl; });
      return {
        from: r.from,
        till: r.till,
        slots: r.slots,
        avg: sum / r.slots.length,
        minutes: Math.round((r.till - r.from) / 60000),
        active: r.from <= now && now < r.till
      };
    });
    var longEnough = upcoming.filter(function (r) { return r.minutes + 0.1 >= minMinutes; });
    return longEnough[0] || upcoming[0] || null;
  }

  function extremes(slots) {
    if (!slots.length) return null;
    var min = slots[0].marketExcl;
    var max = min;
    slots.forEach(function (s) {
      if (s.marketExcl < min) min = s.marketExcl;
      if (s.marketExcl > max) max = s.marketExcl;
    });
    return {
      min: min,
      max: max,
      cheapest: slots.filter(function (s) { return Math.abs(s.marketExcl - min) < 1e-9; }),
      dearest: slots.filter(function (s) { return Math.abs(s.marketExcl - max) < 1e-9; })
    };
  }

  function band(slot, daySlots) {
    if (!slot || !daySlots.length) return "normaal";
    var values = daySlots.map(function (s) { return s.marketExcl; });
    var low = quantile(values, 0.25);
    var high = quantile(values, 0.75);
    if (slot.marketExcl <= low + 1e-9) return "laag";
    if (slot.marketExcl >= high - 1e-9) return "hoog";
    return "midden";
  }

  function average(slots) {
    if (!slots.length) return null;
    var sum = 0;
    slots.forEach(function (s) { sum += s.marketExcl; });
    return sum / slots.length;
  }

  function revive(rawSlots) {
    return withDuration((rawSlots || []).map(function (s) {
      return {
        from: new Date(s.from),
        till: new Date(s.till),
        marketExcl: s.marketExcl,
        taxExcl: s.taxExcl,
        markupExcl: s.markupExcl,
        allIn: s.allIn
      };
    }));
  }

  return {
    TZ: TZ,
    VAT: VAT,
    OFFICIAL_TAX_EXCL: OFFICIAL_TAX_EXCL,
    TAX_CREDIT_EXCL: TAX_CREDIT_EXCL,
    amsterdamDate: amsterdamDate,
    addCalendarDays: addCalendarDays,
    formatTime: formatTime,
    formatUpdated: formatUpdated,
    euro: euro,
    zonedMidnight: zonedMidnight,
    localDayRange: localDayRange,
    isoMillis: isoMillis,
    durationLabel: durationLabel,
    rangeLabel: rangeLabel,
    taxMatchesOfficial: taxMatchesOfficial,
    normalizeFrank: normalizeFrank,
    normalizeEnergyZeroGraphql: normalizeEnergyZeroGraphql,
    normalizeEnergyZeroRest: normalizeEnergyZeroRest,
    constantCost: constantCost,
    applyCosts: applyCosts,
    granularityLabel: granularityLabel,
    slotsOnDate: slotsOnDate,
    currentSlot: currentSlot,
    nextCheapWindow: nextCheapWindow,
    extremes: extremes,
    band: band,
    average: average,
    revive: revive
  };
});
