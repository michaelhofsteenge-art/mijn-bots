/* node tests/airesearch.test.js
   AI-rubriek: vorm, PIN 1234, 390 en desktop, licht/donker, regressie Acties en Onderzoek.
   Puppeteer-core moet bereikbaar zijn (lokaal of /tmp/airesearch-test). */
"use strict";

var assert = require("assert");
var fs = require("fs");
var http = require("http");
var path = require("path");
var { spawn } = require("child_process");

var ROOT = path.join(__dirname, "..");
var REPORT = path.join(ROOT, "updates/airesearch/2026-11-01T00-00.md");
var SHOTS = process.env.AI_SHOTS || "/tmp/ai-onderzoek-shots";
var PORT = Number(process.env.AI_PORT || 8766);

function loadPuppeteer() {
  try { return require("puppeteer-core"); } catch (e) {}
  return require("/tmp/airesearch-test/node_modules/puppeteer-core");
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

async function prepare(page, theme) {
  await page.evaluateOnNewDocument(function (mode) {
    try {
      localStorage.clear();
      localStorage.setItem("ond-theme", mode);
    } catch (e) {}
  }, theme);
  await page.setRequestInterception(true);
  page.on("request", function (req) {
    var u = req.url();
    if (/mijnbots-api\.vercel\.app|googleapis|gstatic/.test(u)) req.abort();
    else req.continue();
  });
}

async function unlock(page, base) {
  page.on("pageerror", function (err) { console.log("PAGEERROR", err && err.message ? err.message : err); });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(function () { return document.getElementById("lock") && !document.getElementById("lock").hidden; }, { timeout: 8000 });
  } catch (err) {
    var info = await page.evaluate(function () {
      var lock = document.getElementById("lock");
      return { href: location.href, hidden: !!(lock && lock.hidden), text: (document.body && document.body.innerText || "").slice(0, 240) };
    });
    console.log("UNLOCK-STATE", JSON.stringify(info));
    throw err;
  }
  for (var i = 0; i < 4; i++) await page.click("#keypad button[data-k='" + "1234"[i] + "']");
  await page.waitForSelector("#home:not([hidden])");
  await page.waitForFunction(function () {
    return document.getElementById("botList") && document.getElementById("botList").textContent.indexOf("AI") >= 0;
  });
}

function names(page) {
  return page.$$eval(".bot-name", function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
}

(async function () {
  fs.mkdirSync(SHOTS, { recursive: true });
  var py = spawn("python3", [path.join(ROOT, "tests/check_ai_report.py"), REPORT], { stdio: "inherit" });
  var pyCode = await new Promise(function (resolve) { py.on("exit", resolve); });
  assert.strictEqual(pyCode, 0, "vormcheck faalde");

  var sh = fs.readFileSync(path.join(ROOT, "publish.sh"), "utf8");
  assert.ok(sh.indexOf("airesearch") >= 0 && sh.indexOf("/workspace/ai-research") >= 0, "publish.sh mist de AI-bron");
  assert.ok(sh.indexOf("git push") >= 0, "publish-routine onverwacht gewijzigd");
  assert.strictEqual((sh.match(/blockchain/g) || []).length, 0, "publish.sh hoort Blockchain niet te dupliceren");

  var report = fs.readFileSync(REPORT, "utf8");
  var themes = report.split("\n").filter(function (ln) { return /^## [1-8]\. /.test(ln); }).map(function (ln) { return ln.replace(/^## \d+\. /, ""); });
  assert.strictEqual(themes.length, 8);

  var puppeteer = loadPuppeteer();
  var server = await startServer();
  var browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: "new",
    userDataDir: fs.mkdtempSync("/tmp/ai-chrome-"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--disable-features=ServiceWorker"]
  });
  var base = "http://127.0.0.1:" + PORT;
  var failures = [];

  async function shot(page, name) {
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  }

  async function overflow(page) {
    return page.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
  }

  try {
    var cases = [
      { app: "onderzoek", w: 390, h: 844, theme: "light", tag: "390-light" },
      { app: "onderzoek", w: 390, h: 844, theme: "dark", tag: "390-dark" },
      { app: "onderzoek", w: 1280, h: 800, theme: "light", tag: "desktop-light" },
      { app: "onderzoek", w: 1280, h: 800, theme: "dark", tag: "desktop-dark" }
    ];
    for (var c = 0; c < cases.length; c++) {
      var cs = cases[c];
      var page = await browser.newPage();
      page.on("pageerror", function (err) { failures.push(String(err)); });
      await page.setViewport({ width: cs.w, height: cs.h, deviceScaleFactor: 1 });
      await prepare(page, cs.theme);
      await unlock(page, base + "/onderzoek/");
      var themeAttr = await page.$eval("html", function (el) { return el.getAttribute("data-theme"); });
      assert.strictEqual(themeAttr, cs.theme, "thema " + cs.tag);
      var homeNames = await names(page);
      assert.ok(homeNames.indexOf("AI") >= 0, "AI ontbreekt op Onderzoek");
      assert.strictEqual(homeNames.filter(function (n) { return n === "Blockchain Update"; }).length, 1, "Blockchain gedupliceerd");
      assert.ok(homeNames.indexOf("GV Research") >= 0 && homeNames.indexOf("Parkinson-onderzoek") >= 0);
      var aiDate = await page.$$eval(".bot-btn", function (els) {
        var b = els.filter(function (el) { return el.querySelector(".bot-name") && el.querySelector(".bot-name").textContent.trim() === "AI"; })[0];
        return b.querySelector(".bot-date").textContent;
      });
      assert.ok(/1 nov/i.test(aiDate), "AI-tegel hoort 1 november te tonen, kreeg: " + aiDate);
      assert.ok(!/9 nov/i.test(aiDate), "AI-tegel mag niet op 9 november staan: " + aiDate);
      await page.click(".mgmt-summary > summary");
      var ms = await page.$eval(".mgmt-summary", function (el) { return el.innerText; });
      var aiMs = await page.$eval(".mgmt-summary", function (el) {
        var item = [].slice.call(el.querySelectorAll(".ms-item")).filter(function (n) {
          return n.querySelector(".ms-head").textContent.indexOf("🤖 AI") >= 0;
        })[0];
        return item ? item.innerText : "";
      });
      assert.ok(aiMs.indexOf("De gecontroleerde selectie") >= 0, "managementsamenvatting mist de AI-alinea");
      assert.ok(aiMs.indexOf("Nog geen update") < 0, "AI hoort in de samenvatting te staan met inhoud");
      var over = await overflow(page);
      assert.ok(over < 2, "horizontale overflow " + cs.tag + ": " + over);
      if (cs.tag === "390-light" || cs.tag === "desktop-dark") await shot(page, "onderzoek-home-" + cs.tag + ".png");

      await page.evaluate(function () {
        var btn = [].slice.call(document.querySelectorAll(".bot-btn")).filter(function (el) {
          return el.querySelector(".bot-name") && el.querySelector(".bot-name").textContent.trim() === "AI";
        })[0];
        btn.click();
      });
      await page.waitForSelector(".summary-fold");
      await page.waitForSelector(".topic-chip:not(.topic-all)");
      var detail = await page.$eval("#detailName", function (el) { return el.textContent.trim(); });
      assert.strictEqual(detail, "AI");
      var summary = await page.$eval(".summary-fold", function (el) { return el.innerText; });
      assert.ok(summary.indexOf("Samenvatting en conclusies") >= 0);
      assert.ok(summary.indexOf("Conclusie:") >= 0);
      assert.ok(summary.indexOf("Afbakening") >= 0);
      assert.ok(summary.indexOf("periode-einde") >= 0 || summary.indexOf("einddatum van de verslagperiode") >= 0);
      var chips = await page.$$eval(".topic-chip:not(.topic-all)", function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
      assert.strictEqual(chips.length, 8, "verwacht 8 themablokken, kreeg " + chips.length + ": " + chips.join(" | "));
      themes.forEach(function (title, i) {
        assert.ok(chips[i].indexOf(title) >= 0, "chip " + (i + 1) + " mist " + title + " (" + chips[i] + ")");
      });
      assert.ok(await page.$(".topic-all"), "Alles lezen ontbreekt");
      over = await overflow(page);
      assert.ok(over < 2, "detail-overflow " + cs.tag + ": " + over);
      await shot(page, "ai-samenvatting-" + cs.tag + ".png");

      if (cs.tag === "390-light" || cs.tag === "desktop-light") {
        await page.click("#detailBody .topic-chip:not(.topic-all)");
        await page.waitForSelector(".topic-back");
        var hrefs = await page.$$eval("#detailBody a[href]", function (els) { return els.map(function (a) { return a.getAttribute("href"); }); });
        assert.ok(hrefs.some(function (h) { return h && h.indexOf("https://help.openai.com/") === 0; }), "bronlink in blok 1 ontbreekt");
        await shot(page, "ai-blok1-" + cs.tag + ".png");
        await page.evaluate(function () { document.querySelector("#detailBody [data-topic-back]").click(); });
        await page.waitForSelector(".topic-all");
        await page.evaluate(function () { document.querySelector(".topic-all").click(); });
        await page.waitForFunction(function () { return location.hash.indexOf("/alles") >= 0; });
        var titles = await page.$$eval("h2.topic-title", function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
        var numbered = titles.filter(function (t) { return /^[1-8]\. /.test(t); });
        assert.strictEqual(numbered.length, 8, "Alles lezen toont niet 8 blokken: " + titles.join(" | "));
        var allText = await page.$eval("#detailBody", function (el) { return el.innerText; });
        assert.ok(allText.split("Geen geverifieerde punten voor deze periode opgenomen.").length >= 3, "lege blokken 5 en 6 ontbreken");
        assert.ok(allText.indexOf("aidaily") < 0 && allText.indexOf("AIMap") < 0);
        var linkCount = await page.$$eval("#detailBody a[href^='https://']", function (els) { return els.length; });
        assert.ok(linkCount >= 6, "te weinig bronlinks in Alles lezen: " + linkCount);
        await shot(page, "ai-alles-" + cs.tag + ".png");
      }
      await page.close();
    }

    // Regressie App Acties, licht 390 en donker desktop.
    var actieCases = [
      { w: 390, h: 844, theme: "light", tag: "390-light" },
      { w: 1280, h: 800, theme: "dark", tag: "desktop-dark" }
    ];
    for (var a = 0; a < actieCases.length; a++) {
      var ac = actieCases[a];
      var ap = await browser.newPage();
      await ap.setViewport({ width: ac.w, height: ac.h, deviceScaleFactor: 1 });
      await prepare(ap, ac.theme);
      await ap.goto(base + "/acties/", { waitUntil: "domcontentloaded" });
      await ap.waitForFunction(function () { return document.getElementById("lock") && !document.getElementById("lock").hidden; });
      for (var k = 0; k < 4; k++) await ap.click("#keypad button[data-k='" + "1234"[k] + "']");
      await ap.waitForSelector("#home:not([hidden])");
      await ap.waitForFunction(function () { return document.body.innerText.indexOf("Email Reageren") >= 0; });
      var actNames = await names(ap);
      assert.deepStrictEqual(actNames, ["Email Reageren", "Herinneringen", "Geestelijk Verzorger Vacatures", "Crypto Adviseur"]);
      assert.strictEqual(await ap.$eval("html", function (el) { return el.getAttribute("data-theme"); }), ac.theme);
      await shot(ap, "acties-home-" + ac.tag + ".png");
      await ap.evaluate(function () {
        [].slice.call(document.querySelectorAll(".bot-btn")).filter(function (el) {
          return el.querySelector(".bot-name").textContent.indexOf("Email") >= 0;
        })[0].click();
      });
      await ap.waitForSelector("#detail:not([hidden])");
      var emailBody = await ap.$eval("#detailBody", function (el) { return el.innerText; });
      assert.ok(emailBody.length > 40, "Email-detail leeg");
      assert.strictEqual(await ap.$(".topic-chip"), null, "Acties mag geen onderzoekschips tonen");
      await ap.close();
    }

    // Regressie bestaand onderzoek: GV Research en Blockchain.
    var reg = await browser.newPage();
    await reg.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await prepare(reg, "light");
    await unlock(reg, base + "/onderzoek/");
    await reg.evaluate(function () {
      [].slice.call(document.querySelectorAll(".bot-btn")).filter(function (el) {
        return el.querySelector(".bot-name").textContent.trim() === "GV Research";
      })[0].click();
    });
    await reg.waitForSelector(".topic-all");
    assert.ok((await reg.$eval(".summary-fold", function (el) { return el.innerText; })).indexOf("Samenvatting") >= 0);
    await shot(reg, "regressie-gvresearch-390-light.png");
    await reg.click("#backBtn");
    await reg.waitForSelector("#home:not([hidden])");
    await reg.evaluate(function () {
      [].slice.call(document.querySelectorAll(".bot-btn")).filter(function (el) {
        return el.querySelector(".bot-name").textContent.trim() === "Blockchain Update";
      })[0].click();
    });
    await reg.waitForFunction(function () { return document.getElementById("detailName").textContent.indexOf("Blockchain") >= 0; });
    var bc = await reg.$eval("#detailBody", function (el) { return el.innerText; });
    assert.ok(bc.length > 80, "Blockchain-detail leeg");
    assert.strictEqual(await reg.$eval("#detailName", function (el) { return el.textContent.trim(); }), "Blockchain Update");
    var bcButtons = await reg.$$eval(".bot-name", function (els) {
      return els.filter(function (el) { return el.textContent.trim() === "Blockchain Update"; }).length;
    });
    assert.strictEqual(bcButtons, 1, "Blockchain-knop hoort één keer voor te komen");
    await shot(reg, "regressie-blockchain-390-light.png");
    await reg.click("#backBtn");
    await reg.waitForSelector("#home:not([hidden])");
    async function openBot(label) {
      await reg.evaluate(function (name) {
        [].slice.call(document.querySelectorAll(".bot-btn")).filter(function (el) {
          return el.querySelector(".bot-name").textContent.trim() === name;
        })[0].click();
      }, label);
      await reg.waitForFunction(function (name) {
        return document.getElementById("detailName").textContent.trim() === name;
      }, {}, label);
    }
    await openBot("Klimaat Kritisch Onderzoek – Algemeen");
    await reg.waitForSelector(".code-legend, .topic-all");
    var klimaatLegend = await reg.$$eval(".code-legend", function (els) { return els.length; });
    assert.ok(klimaatLegend >= 1, "legenda ontbreekt bij klimaat");
    await shot(reg, "regressie-klimaat-legenda-390-light.png");
    await reg.click("#backBtn");
    await reg.waitForSelector("#home:not([hidden])");
    await openBot("Klimaat Kritisch Onderzoek – Clintel");
    var clintelLegend = await reg.$$eval(".code-legend", function (els) { return els.length; });
    assert.ok(clintelLegend >= 1, "legenda ontbreekt bij Clintel");
    await shot(reg, "regressie-clintel-legenda-390-light.png");
    await reg.close();

    assert.deepStrictEqual(failures, [], "paginafouten: " + failures.join("\n"));
    console.log("OK AI-rubriek, screenshots in " + SHOTS);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
