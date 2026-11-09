/* node tests/order.test.js
   Tegelvolgorde en gastmodus van App Onderzoek.
   Puppeteer-core: lokaal of /tmp/onderzoek-order-test. */
"use strict";

var assert = require("assert");
var fs = require("fs");
var http = require("http");
var path = require("path");
var { spawn } = require("child_process");

var ROOT = path.join(__dirname, "..");
var SHOTS = process.env.ORDER_SHOTS || "/tmp/onderzoek-order-shots";
var PORT = Number(process.env.ORDER_PORT || 8771);

function logicApi() {
  var src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  var block = src.split("// <onderzoekOrder>")[1].split("// </onderzoekOrder>")[0];
  return new Function(block + "\nreturn { applyBotOrder: applyBotOrder, applyHidden: applyHidden, botOrderId: botOrderId, mergeVisibleOrder: mergeVisibleOrder };")();
}

function bot(key) { return { key: key, id: key, name: key }; }

function logicTests() {
  var api = logicApi();
  var bots = ["statines", "blockchain", "covid", "ai"].map(bot);
  assert.deepStrictEqual(api.applyBotOrder(bots, null).map(api.botOrderId), ["statines", "blockchain", "covid", "ai"]);
  assert.deepStrictEqual(api.applyBotOrder(bots, []).map(api.botOrderId), ["statines", "blockchain", "covid", "ai"]);
  assert.deepStrictEqual(
    api.applyBotOrder(bots, ["covid", "does-not-exist", "statines", "covid"]).map(api.botOrderId),
    ["covid", "statines", "blockchain", "ai"]
  );
  assert.deepStrictEqual(api.applyBotOrder(bots, ["weg", "ookweg"]).map(api.botOrderId), ["statines", "blockchain", "covid", "ai"]);
  var split = api.applyHidden(api.applyBotOrder(bots, ["ai", "statines"]), ["covid", "weg"]);
  assert.deepStrictEqual(split.visible.map(api.botOrderId), ["ai", "statines", "blockchain"]);
  assert.deepStrictEqual(split.hidden.map(api.botOrderId), ["covid"]);
  assert.deepStrictEqual(api.applyHidden(bots, []).visible.map(api.botOrderId), ["statines", "blockchain", "covid", "ai"]);
  assert.deepStrictEqual(
    api.mergeVisibleOrder(["ai", "statines", "blockchain"], ["covid"], ["statines", "covid", "blockchain", "ai"]),
    ["ai", "covid", "statines", "blockchain"]
  );
  var app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.ok(app.indexOf('GUEST_MAIL = "michael.hofsteenge@outlook.com"') > 0);
  assert.ok(app.indexOf("onderzoek-tile-order") > 0);
  assert.ok(app.indexOf("onderzoek-guest-order") > 0);
  assert.ok(app.indexOf("onderzoek-guest-hidden") > 0);
  assert.ok(app.indexOf('APP === "onderzoek"') > 0);
  ["v53", "v32", "v34"].forEach(function (v, i) {
    var file = ["sw.js", "onderzoek/sw.js", "acties/sw.js"][i];
    assert.ok(fs.readFileSync(path.join(ROOT, file), "utf8").indexOf('VERSION = "' + v + '"') > 0, file);
  });
  ["index.html", "onderzoek/index.html", "acties/index.html"].forEach(function (file) {
    assert.ok(fs.readFileSync(path.join(ROOT, file), "utf8").indexOf("20261109a") > 0, file);
    assert.ok(fs.readFileSync(path.join(ROOT, file), "utf8").indexOf("20261108d") < 0, file);
  });
  console.log("order logic: ok");
}

function loadPuppeteer() {
  try { return require("puppeteer-core"); } catch (e) {}
  return require("/tmp/onderzoek-order-test/node_modules/puppeteer-core");
}

function chromePath() {
  var candidates = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  for (var i = 0; i < candidates.length; i++) if (fs.existsSync(candidates[i])) return candidates[i];
  throw new Error("Chrome niet gevonden");
}

function startServer() {
  return new Promise(function (resolve, reject) {
    var child = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
    var tries = 0;
    (function ping() {
      var req = http.get("http://127.0.0.1:" + PORT + "/onderzoek/", function (res) {
        res.resume();
        resolve(child);
      });
      req.on("error", function () {
        if (++tries > 40) reject(new Error("server start niet gelukt"));
        else setTimeout(ping, 100);
      });
    })();
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function prepare(page, theme) {
  await page.evaluateOnNewDocument(function (mode) {
    try {
      if (sessionStorage.getItem("keep-storage") !== "1") localStorage.clear();
      localStorage.setItem("ond-theme", mode);
    } catch (e) {}
  }, theme);
  page.on("pageerror", function (err) { page.__errors = (page.__errors || []).concat([String(err)]); });
}

async function settled(page) {
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(function () {});
}

async function pin(page) {
  await page.waitForFunction(function () { return document.getElementById("lock") && !document.getElementById("lock").hidden; }, { timeout: 8000 });
  for (var i = 0; i < 4; i++) await page.click("#keypad button[data-k='" + "1234"[i] + "']");
  await page.waitForSelector("#home:not([hidden])");
}

async function keys(page) {
  return page.$$eval(".tile-wrap", function (els) { return els.map(function (el) { return el.getAttribute("data-key"); }); });
}

async function tap(page, sel) {
  var box = await page.evaluate(function (s) {
    var el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  assert.ok(box && box.y > 0, "niet tikbaar: " + sel);
  await page.mouse.click(box.x, box.y);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}

(async function () {
  logicTests();
  fs.mkdirSync(SHOTS, { recursive: true });
  var data = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8"));
  var actiesKeys = { email: 1, gv: 1, crypto: 1 };
  var defaultKeys = data.bots.map(function (b) { return b.key; }).filter(function (k) { return !actiesKeys[k]; });

  var puppeteer = loadPuppeteer();
  var server = await startServer();
  var browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: "new",
    userDataDir: fs.mkdtempSync("/tmp/order-chrome-"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--disable-features=ServiceWorker"]
  });
  var base = "http://127.0.0.1:" + PORT;

  try {
    var owner = await browser.newPage();
    await owner.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await prepare(owner, "dark");
    await owner.goto(base + "/onderzoek/", { waitUntil: "domcontentloaded" });
    await pin(owner);
    await owner.waitForFunction(function () { return document.querySelectorAll(".tile-wrap").length >= 11; });
    await settled(owner);
    assert.deepStrictEqual(await keys(owner), defaultKeys, "standaardvolgorde");
    assert.strictEqual(await owner.$("#guestSuggest"), null, "eigenaar ziet geen suggestieformulier");
    assert.strictEqual(await owner.$(".order-hide"), null);
    assert.ok(await owner.$("#pinChangeBtn"));
    assert.ok(await owner.$("#lockBtn"));
    assert.strictEqual(await owner.$eval("#orderBtn", function (el) { return el.textContent; }), "⇅ Volgorde aanpassen");
    assert.strictEqual(await owner.$eval("html", function (el) { return el.getAttribute("data-theme"); }), "dark");
    var over = await owner.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    assert.ok(over < 2, "overflow eigenaar " + over);
    await shot(owner, "owner-overview-390-dark.png");

    await owner.click('.tile-wrap[data-key="blockchain"] .bot-btn');
    await owner.waitForFunction(function () { return document.getElementById("detailName").textContent.indexOf("Blockchain") >= 0; });
    await owner.click("#backBtn");
    await owner.waitForSelector("#home:not([hidden])");
    assert.deepStrictEqual(await keys(owner), defaultKeys, "tikken opent en de volgorde blijft");

    await owner.evaluate(function () { return sessionStorage.setItem("keep-storage", "1"); });
    await owner.evaluate(function () {
      localStorage.setItem("onderzoek-tile-order", JSON.stringify(["covid", "does-not-exist", "statines"]));
      localStorage.setItem("onderzoek-guest-hidden", JSON.stringify(["blockchain"]));
    });
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForSelector("#home:not([hidden])");
    await owner.waitForFunction(function () { return document.querySelectorAll(".tile-wrap").length >= 11; });
    await settled(owner);
    var expected = ["covid", "statines"].concat(defaultKeys.filter(function (k) { return k !== "covid" && k !== "statines"; }));
    assert.deepStrictEqual(await keys(owner), expected, "nieuwe bots achteraan, verwijderde sleutel negeren, gast-verbergen raakt eigenaar niet");
    await owner.click(".mgmt-summary > summary");
    var tileNames = await owner.$$eval(".tile-wrap .bot-name", function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
    var msNames = await owner.$$eval(".ms-head", function (els) { return els.map(function (e) { return e.textContent; }); });
    assert.strictEqual(msNames.length, tileNames.length);
    tileNames.forEach(function (name, i) { assert.ok(msNames[i].indexOf(name) >= 0, "samenvatting " + name); });

    await tap(owner, "#orderBtn");
    await owner.waitForSelector(".order-bar");
    assert.strictEqual(await owner.$(".order-hide"), null, "eigenaar heeft geen Verberg");
    var beforeArrow = await keys(owner);
    await tap(owner, '.tile-wrap[data-key="' + beforeArrow[0] + '"] [data-order-move="1"]');
    var afterArrow = await keys(owner);
    assert.strictEqual(afterArrow[0], beforeArrow[1], "pijl omlaag");
    assert.strictEqual(afterArrow[1], beforeArrow[0]);
    await tap(owner, "#orderReset");
    await owner.waitForFunction(function (n) { return document.querySelectorAll(".tile-wrap").length === n; }, {}, defaultKeys.length);
    assert.deepStrictEqual(await keys(owner), defaultKeys, "standaardvolgorde hersteld");
    var stored = await owner.evaluate(function () { return localStorage.getItem("onderzoek-tile-order"); });
    assert.strictEqual(stored, null);
    await tap(owner, "#orderBtn");
    assert.deepStrictEqual(owner.__errors || [], []);
    await owner.close();

    var desk = await browser.newPage();
    await desk.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await prepare(desk, "light");
    await desk.goto(base + "/onderzoek/", { waitUntil: "domcontentloaded" });
    await pin(desk);
    await desk.waitForFunction(function () { return document.querySelectorAll(".tile-wrap").length >= 11; });
    await settled(desk);
    var deskBefore = await keys(desk);
    var fromKey = deskBefore[0], toKey = deskBefore[4];
    await desk.evaluate(function () { window.scrollTo(0, 0); });
    var boxes = await desk.evaluate(function (a, b) {
      function box(key) {
        var el = document.querySelector('.tile-wrap[data-key="' + key + '"]');
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom };
      }
      return { from: box(a), to: box(b), h: window.innerHeight };
    }, fromKey, toKey);
    assert.ok(boxes.from.y > 0 && boxes.from.y < boxes.h && boxes.to.y > 0 && boxes.to.y < boxes.h, "sleeppunten buiten beeld");
    await desk.mouse.move(boxes.from.x, boxes.from.y);
    await desk.mouse.down();
    await desk.mouse.move(boxes.to.x, boxes.to.y, { steps: 18 });
    await desk.mouse.up();
    await sleep(200);
    var deskAfter = await keys(desk);
    assert.notStrictEqual(deskAfter.join(), deskBefore.join(), "muis-slepen verandert de volgorde: " + deskAfter.join(","));
    assert.ok(deskAfter.indexOf(fromKey) !== deskBefore.indexOf(fromKey));
    assert.strictEqual(await desk.$eval("#home", function (el) { return el.hidden; }), false, "slepen opent geen rapport");
    await desk.evaluate(function () { return sessionStorage.setItem("keep-storage", "1"); });
    var savedOrder = await desk.evaluate(function () { return localStorage.getItem("onderzoek-tile-order"); });
    assert.ok(savedOrder && savedOrder.indexOf(fromKey) > 0);
    await desk.reload({ waitUntil: "domcontentloaded" });
    await desk.waitForSelector("#home:not([hidden])");
    assert.deepStrictEqual(await keys(desk), deskAfter, "volgorde blijft na herladen");
    await shot(desk, "owner-drag-1280-light.png");
    assert.deepStrictEqual(desk.__errors || [], []);
    await desk.close();

    var phone = await browser.newPage();
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await prepare(phone, "dark");
    await phone.goto(base + "/onderzoek/?gast=1", { waitUntil: "domcontentloaded" });
    await phone.waitForSelector("#home:not([hidden])");
    await phone.waitForSelector("#guestSuggest");
    await phone.waitForFunction(function () { return document.querySelectorAll(".tile-wrap").length >= 11; });
    await settled(phone);
    var lockHidden = await phone.$eval("#lock", function (el) { return el.hidden; });
    assert.strictEqual(lockHidden, true, "gast komt binnen zonder pincode");
    assert.strictEqual(await phone.$("#pinChangeBtn") && await phone.$eval("#pinChangeBtn", function (el) { return getComputedStyle(el).display; }), "none");
    assert.strictEqual(await phone.$eval("#lockBtn", function (el) { return getComputedStyle(el).display; }), "none");
    assert.ok((await phone.$eval(".guest-note", function (el) { return el.textContent; })).indexOf("Gedeeld overzicht") >= 0);
    var guestKeys = await keys(phone);
    assert.deepStrictEqual(guestKeys, defaultKeys);
    over = await phone.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    assert.ok(over < 2, "overflow gast " + over);
    await shot(phone, "guest-overview-390-dark.png");

    await phone.evaluate(function () { window.scrollTo(0, 280); });
    var scrollBefore = await phone.evaluate(function () { return window.scrollY; });
    await phone.touchscreen.touchStart(200, 620);
    await phone.touchscreen.touchMove(200, 540);
    await phone.touchscreen.touchMove(200, 420);
    await phone.touchscreen.touchEnd();
    await sleep(250);
    assert.deepStrictEqual(await keys(phone), guestKeys, "snel vegen herschikt de tegels niet");
    var scrollAfter = await phone.evaluate(function () { return window.scrollY; });
    assert.ok(scrollAfter > scrollBefore + 20, "snel vegen scrollt de pagina (" + scrollBefore + " → " + scrollAfter + ")");

    var tapPoint = await phone.evaluate(function () {
      var el = document.querySelector('.tile-wrap[data-key="parkinson"] .bot-btn');
      el.scrollIntoView({ block: "center" });
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 36 };
    });
    await phone.touchscreen.touchStart(tapPoint.x, tapPoint.y);
    await sleep(40);
    await phone.touchscreen.touchEnd();
    await phone.waitForFunction(function () { return document.getElementById("detailName") && document.getElementById("detailName").textContent.indexOf("Parkinson") >= 0; }, { timeout: 4000 });
    await phone.click("#backBtn");
    await phone.waitForSelector("#home:not([hidden])");

    var dragFrom = guestKeys[0], dragTo = guestKeys[2];
    await phone.evaluate(function (key) {
      document.querySelector('.tile-wrap[data-key="' + key + '"]').scrollIntoView({ block: "center" });
    }, dragFrom);
    var dragBoxes = await phone.evaluate(function (a, b) {
      function box(key) {
        var el = document.querySelector('.tile-wrap[data-key="' + key + '"]');
        var r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), bottom: r.bottom };
      }
      return { from: box(a), to: box(b), h: window.innerHeight };
    }, dragFrom, dragTo);
    assert.ok(dragBoxes.from.y > 80 && dragBoxes.from.y < dragBoxes.h - 20, "start van het slepen buiten beeld");
    assert.ok(dragBoxes.to.y > 0 && dragBoxes.to.y < dragBoxes.h, "doel van het slepen buiten beeld");
    await phone.touchscreen.touchStart(dragBoxes.from.x, dragBoxes.from.y);
    await sleep(620);
    var steps = 10, s;
    for (s = 1; s <= steps; s++) {
      var x = dragBoxes.from.x + (dragBoxes.to.x - dragBoxes.from.x) * s / steps;
      var y = dragBoxes.from.y + (dragBoxes.to.y - dragBoxes.from.y) * s / steps;
      await phone.touchscreen.touchMove(Math.round(x), Math.round(y));
      await sleep(40);
    }
    await phone.touchscreen.touchEnd();
    await sleep(300);
    var afterTouch = await keys(phone);
    assert.notStrictEqual(afterTouch.join(), guestKeys.join(), "lang ingedrukt slepen verandert de volgorde: " + afterTouch.join(","));
    assert.strictEqual(await phone.$eval("#home", function (el) { return el.hidden; }), false, "lang indrukken opent het rapport niet");
    var guestStored = await phone.evaluate(function () {
      return {
        guest: localStorage.getItem("onderzoek-guest-order"),
        owner: localStorage.getItem("onderzoek-tile-order"),
        flag: localStorage.getItem("onderzoek-guest")
      };
    });
    assert.strictEqual(guestStored.flag, "1");
    assert.ok(guestStored.guest, "gastvolgorde opgeslagen");
    assert.strictEqual(guestStored.owner, null, "gast sleept niet in de volgorde van de eigenaar");

    await phone.evaluate(function () { sessionStorage.setItem("keep-storage", "1"); });
    await phone.goto(base + "/onderzoek/", { waitUntil: "domcontentloaded" });
    await phone.waitForSelector("#guestSuggest");
    assert.strictEqual(await phone.$eval("#lock", function (el) { return el.hidden; }), true, "gastmodus blijft zonder ?gast=1");
    assert.deepStrictEqual(await keys(phone), afterTouch, "gastvolgorde blijft");

    await tap(phone, "#orderBtn");
    await phone.waitForSelector(".order-hide");
    await tap(phone, '.tile-wrap[data-key="covid"] .order-hide');
    await phone.waitForFunction(function () { return !document.querySelector('.tile-wrap[data-key="covid"]'); });
    assert.ok((await keys(phone)).indexOf("covid") < 0);
    await phone.evaluate(function () { document.querySelector(".mgmt-summary > summary").click(); });
    var msText = await phone.$eval(".mgmt-summary", function (el) { return el.innerText; });
    assert.ok(msText.indexOf("Covid") < 0, "verborgen tegel staat niet in de samenvatting");
    await phone.evaluate(function () { document.querySelector(".mgmt-summary > summary").click(); });
    var hiddenText = await phone.$eval(".guest-hidden", function (el) { return el.innerText; });
    assert.ok(hiddenText.indexOf("Covid") >= 0);
    await phone.evaluate(function () {
      var el = document.querySelector(".guest-hidden");
      var top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - (window.innerHeight - el.offsetHeight - 12)));
    });
    await phone.screenshot({ path: path.join(SHOTS, "guest-hide-reorder-390-dark.png") });
    await phone.reload({ waitUntil: "domcontentloaded" });
    await phone.waitForSelector("#home:not([hidden])");
    await settled(phone);
    assert.ok((await keys(phone)).indexOf("covid") < 0, "verbergen blijft na herladen");
    await tap(phone, "#orderBtn");
    await phone.waitForSelector('[data-order-show="covid"]');
    await tap(phone, '[data-order-show="covid"]');
    await phone.waitForSelector('.tile-wrap[data-key="covid"]');
    await tap(phone, '.tile-wrap[data-key="blockchain"] .order-hide');
    await phone.waitForSelector("#orderShowAll");
    await tap(phone, "#orderShowAll");
    await phone.waitForSelector('.tile-wrap[data-key="blockchain"]');
    await tap(phone, "#orderReset");
    await phone.waitForFunction(function (n) { return document.querySelectorAll(".tile-wrap").length === n; }, {}, defaultKeys.length);
    assert.deepStrictEqual(await keys(phone), defaultKeys, "standaardweergave toont alles in de oorspronkelijke volgorde");
    await tap(phone, "#orderDone");
    await phone.waitForFunction(function () { return document.getElementById("toast").hidden; });

    await phone.evaluate(function () {
      document.getElementById("guestSuggestion").value = "Stilte in de stad";
      document.getElementById("guestRemarks").value = "De tegels mogen iets groter.";
      document.getElementById("guestName").value = "Ada";
      ["guestSuggestion", "guestRemarks", "guestName"].forEach(function (id) {
        document.getElementById(id).dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    await phone.evaluate(function () {
      document.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("#guestSend")) e.preventDefault();
      }, true);
    });
    await phone.evaluate(function () { document.getElementById("guestSuggest").scrollIntoView({ block: "center" }); });
    await phone.screenshot({ path: path.join(SHOTS, "guest-suggestion-390-dark.png") });
    await tap(phone, "#guestSend");
    var href = await phone.$eval("#guestSend", function (el) { return el.href; });
    assert.ok(href.indexOf("mailto:michael.hofsteenge@outlook.com") === 0, href);
    assert.ok(decodeURIComponent(href).indexOf("App Onderzoek: suggestie") >= 0, href);
    assert.ok(decodeURIComponent(href).indexOf("Stilte in de stad") >= 0, href);
    assert.ok(decodeURIComponent(href).indexOf("De tegels mogen iets groter.") >= 0);
    assert.ok(decodeURIComponent(href).indexOf("Ada") >= 0);
    assert.ok(decodeURIComponent(href).indexOf("Onderzoekssuggestie:") >= 0);
    assert.ok(decodeURIComponent(href).indexOf("Op- en aanmerkingen:") >= 0);
    await phone.evaluate(function () {
      document.getElementById("guestSuggestion").value = "";
      document.getElementById("guestRemarks").value = "";
      document.getElementById("guestName").value = "";
      ["guestSuggestion", "guestRemarks", "guestName"].forEach(function (id) {
        document.getElementById(id).dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    await tap(phone, "#guestSend");
    var toast = await phone.$eval("#toast", function (el) { return el.hidden ? "" : el.textContent; });
    assert.ok(toast.indexOf("suggestie") >= 0, "lege mail wordt tegengehouden");
    over = await phone.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    assert.ok(over < 2, "overflow formulier " + over);

    await phone.goto(base + "/onderzoek/?gast=0", { waitUntil: "domcontentloaded" });
    await phone.waitForFunction(function () { return document.getElementById("lock") && !document.getElementById("lock").hidden; });
    assert.deepStrictEqual(phone.__errors || [], []);
    await phone.close();

    var acties = await browser.newPage();
    await acties.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await prepare(acties, "light");
    await acties.goto(base + "/acties/", { waitUntil: "domcontentloaded" });
    await pin(acties);
    await acties.waitForFunction(function () { return document.body.innerText.indexOf("Email Reageren") >= 0; });
    var actNames = await acties.$$eval(".bot-name", function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
    assert.deepStrictEqual(actNames, ["Email Reageren", "Herinneringen", "Geestelijk Verzorger Vacatures", "Crypto Adviseur"]);
    assert.strictEqual(await acties.$("#orderBtn"), null);
    assert.strictEqual(await acties.$("#guestSuggest"), null);
    assert.strictEqual(await acties.$(".tile-wrap"), null);
    assert.ok(await acties.$("#pinChangeBtn"));
    await shot(acties, "acties-unchanged-390-light.png");
    await acties.close();

    var root = await browser.newPage();
    await root.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await prepare(root, "light");
    await root.goto(base + "/", { waitUntil: "domcontentloaded" });
    await pin(root);
    await root.waitForFunction(function () { return document.body.innerText.indexOf("Akties Michael") >= 0; });
    assert.strictEqual(await root.$("#orderBtn"), null);
    assert.strictEqual(await root.$("#guestSuggest"), null);
    assert.strictEqual(await root.$$eval("a.launch-btn", function (els) { return els.length; }), 2);
    await root.close();

    console.log("OK volgorde en gastmodus, screenshots in " + SHOTS);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
