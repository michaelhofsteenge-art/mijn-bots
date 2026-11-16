/* node tests/energieprijs.test.js */
"use strict";

var assert = require("assert");
var EP = require("../energieprijs/logic.js");

function slot(iso, minutes, price) {
  var from = new Date(iso);
  return { from: from, till: new Date(from.getTime() + minutes * 60000), marketExcl: price, taxExcl: 0.09161, markupExcl: 0.015, allIn: null };
}

function logicTests() {
  var winter = EP.zonedMidnight("2026-11-16");
  assert.strictEqual(winter.toISOString(), "2026-11-15T23:00:00.000Z");
  var summer = EP.zonedMidnight("2026-07-16");
  assert.strictEqual(summer.toISOString(), "2026-07-15T22:00:00.000Z");
  assert.strictEqual(EP.amsterdamDate(new Date("2026-11-16T20:32:00.000Z")), "2026-11-16");
  assert.strictEqual(EP.amsterdamDate(new Date("2026-11-16T23:30:00.000Z")), "2026-11-17");
  assert.strictEqual(EP.addCalendarDays("2026-11-16", 1), "2026-11-17");

  var frank = EP.normalizeFrank([
    {
      from: "2026-11-16T20:30:00.000Z",
      till: "2026-11-16T20:45:00.000Z",
      marketPrice: 0.21361,
      marketPriceTax: 0.04486,
      energyTaxPrice: 0.11085,
      sourcingMarkupPrice: 0.01815,
      allInPrice: 0.38747,
      perUnit: "KWH"
    }
  ]);
  assert.strictEqual(frank.length, 1);
  assert.strictEqual(frank[0].minutes, 15);
  assert.ok(Math.abs(frank[0].marketIncl - 0.21361 * 1.21) < 1e-9);
  assert.ok(EP.taxMatchesOfficial(frank[0].taxExcl));
  assert.ok(Math.abs(frank[0].markupExcl - 0.015) < 1e-9);
  assert.ok(Math.abs(frank[0].allIn - 0.38747) < 0.00002);
  assert.strictEqual(EP.granularityLabel(frank), "kwartier");

  var ez = EP.normalizeEnergyZeroGraphql([
    {
      from: "2026-11-15T23:00:00Z",
      till: "2026-11-16T00:00:00Z",
      energyPriceExcl: 0.1355225,
      additionalCosts: [
        { name: "Energy tax", priceExcl: 0.09161 },
        { name: "Purchasing cost", priceExcl: 0.01853 }
      ]
    }
  ]);
  assert.strictEqual(ez[0].minutes, 60);
  assert.strictEqual(EP.granularityLabel(ez), "uur");
  assert.ok(Math.abs(ez[0].allIn - (0.1355225 + 0.09161 + 0.01853) * 1.21) < 1e-9);

  var rest = EP.normalizeEnergyZeroRest([
    { readingDate: "2026-11-15T23:00:00Z", price: 0.1 },
    { readingDate: "2026-11-16T00:00:00Z", price: 0.2 }
  ]);
  assert.strictEqual(rest[0].minutes, 60);
  assert.strictEqual(rest[1].minutes, 60);

  var base = new Date("2026-11-16T10:00:00.000Z");
  var slots = [];
  var prices = [0.2, 0.05, 0.05, 0.05, 0.2, 0.3, 0.04, 0.2];
  for (var i = 0; i < prices.length; i++) slots.push(slot(new Date(base.getTime() + i * 15 * 60000).toISOString(), 15, prices[i]));
  slots = EP.revive(slots.map(function (s) {
    return { from: s.from.toISOString(), till: s.till.toISOString(), marketExcl: s.marketExcl, taxExcl: s.taxExcl, markupExcl: s.markupExcl, allIn: null };
  }));
  var now = new Date(base.getTime() + 5 * 60000);
  var cur = EP.currentSlot(slots, now);
  assert.strictEqual(cur.marketExcl, 0.2);
  var win = EP.nextCheapWindow(slots, now);
  assert.ok(win);
  assert.strictEqual(win.minutes, 45);
  assert.strictEqual(win.slots[0].marketExcl, 0.05);
  assert.strictEqual(win.active, false);
  var inside = EP.nextCheapWindow(slots, new Date(base.getTime() + 20 * 60000));
  assert.strictEqual(inside.active, true);
  var after = EP.nextCheapWindow(slots, new Date(base.getTime() + 70 * 60000));
  assert.strictEqual(after.slots[0].marketExcl, 0.04);
  assert.strictEqual(after.minutes, 15);

  var ext = EP.extremes(slots);
  assert.strictEqual(ext.min, 0.04);
  assert.strictEqual(ext.max, 0.3);
  assert.strictEqual(EP.band(slots[1], slots), "laag");
  assert.strictEqual(EP.rangeLabel(slots[0].from, slots[0].till), EP.formatTime(slots[0].from) + "–" + EP.formatTime(slots[0].till));
  console.log("energieprijs logic: ok");
}

function liveTests() {
  var today = EP.amsterdamDate(new Date());
  var tomorrow = EP.addCalendarDays(today, 1);
  var query = "query MarketPrices($date: String!, $resolution: PriceResolution!) { marketPrices(date: $date, resolution: $resolution) { electricityPrices { from till marketPrice marketPriceTax allInPrice energyTaxPrice sourcingMarkupPrice perUnit } } }";
  return fetch("https://graphql.frankenergie.nl/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Origin": "https://michaelhofsteenge-art.github.io"
    },
    body: JSON.stringify({ operationName: "MarketPrices", query: query, variables: { date: today, resolution: "PT15M" } })
  }).then(function (res) {
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://michaelhofsteenge-art.github.io");
    return res.json();
  }).then(function (body) {
    var slots = EP.normalizeFrank(body.data.marketPrices.electricityPrices);
    assert.ok(slots.length >= 90, "verwacht kwartieren, kreeg " + slots.length);
    assert.strictEqual(EP.granularityLabel(slots), "kwartier");
    var now = EP.currentSlot(slots, new Date());
    assert.ok(now, "geen huidig kwartier");
    assert.ok(now.marketExcl > -0.5 && now.marketExcl < 2, "onwerkelijke prijs " + now.marketExcl);
    assert.ok(EP.taxMatchesOfficial(now.taxExcl), "belasting wijkt af: " + now.taxExcl);
    assert.ok(now.allIn > now.marketExcl);
    console.log("live frank", today, "nu", EP.rangeLabel(now.from, now.till), EP.euro(now.marketExcl), "all-in", EP.euro(now.allIn), "n", slots.length);
    return fetch("https://api.energyzero.nl/v1/energyprices?fromDate=" + encodeURIComponent(EP.isoMillis(EP.localDayRange(today).from)) + "&tillDate=" + encodeURIComponent(EP.isoMillis(EP.localDayRange(tomorrow).till)) + "&interval=4&usageType=1&inclBtw=false", {
      headers: { "Origin": "https://michaelhofsteenge-art.github.io", "Accept": "application/json" }
    });
  }).then(function (res) {
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://michaelhofsteenge-art.github.io");
    return res.json();
  }).then(function (body) {
    var slots = EP.normalizeEnergyZeroRest(body.Prices || []);
    assert.ok(slots.length >= 24, "energyzero uurprijzen ontbreken");
    console.log("live energyzero uur n", slots.length, "cors ok");
  });
}

logicTests();
liveTests().catch(function (err) {
  console.error(err);
  process.exit(1);
});
