/* node tests/legend.test.js
   Legenda: alleen codes die in de tekst staan, geen verzonnen betekenissen. */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

require(path.join(__dirname, "..", "legend.js"));
var L = global.ReportLegend;

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}
function terms(key, md) {
  return L.matches(key, md).map(function (it) { return it.term; });
}
function hasTerm(list, term) {
  assert.ok(list.indexOf(term) >= 0, "mist " + term + " in " + list.join(", "));
}
function lacks(list, term) {
  assert.ok(list.indexOf(term) < 0, "onterecht aanwezig: " + term);
}

var klimaat = read("updates/klimaatonderzoek/2026-11-02T07-10.md");
var diep = read("updates/klimaatonderzoek/2026-11-02T07-11.md");
var clintel = read("updates/clintel/2026-11-02T07-10.md");
var dossier = read("updates/clintel/2026-10-20T10-33.md");
var parkinson = read("updates/parkinson/2026-11-02T09-25.md");
var quantum = read("updates/quantum/2026-10-26T08-09.md");
var tcs = read("updates/tcs/2026-11-01T09-05.md");
var statines = read("updates/statines/2026-11-02T09-01.md");
var covid = read("updates/covid/2026-11-02T08-17.md");
var blockchain = read("updates/blockchain/2026-11-06T08-23.md");
var gv = read("updates/gvresearch/2026-11-06T09-14.md");
var congres = read("updates/congres/2026-11-04T09-13.md");

var kTerms = terms("klimaatonderzoek", klimaat);
["A–E", "ECS", "IPCC", "WMO", "NOAA", "ppm", "ppb", "K1.1", "K2.2", "K3.1", "K7.2", "VPD", "LCA", "ACM", "ACER", "LNG", "UNEP", "COP"].forEach(function (t) {
  hasTerm(kTerms, t);
});
["RONI", "TCR", "GOTORK", "AGGI", "K9.9", "K1.2", "Claim 5"].forEach(function (t) { lacks(kTerms, t); });
assert.ok(kTerms.indexOf("K5.1") >= 0, "K5.1 staat in het weekrapport en is in een eerder rapport omschreven");

var blok5 = klimaat.split(/^## 5\./m)[1].split(/^## 6\./m)[0];
var b5 = terms("klimaatonderzoek", blok5);
hasTerm(b5, "A–E");
hasTerm(b5, "K5.1");
lacks(b5, "ECS");
lacks(b5, "K1.1");
lacks(b5, "RONI");

var dTerms = terms("klimaatonderzoek", diep);
["A–E", "ECS", "EEI", "AR6", "K1.1", "K1.2", "CERES", "W/m²"].forEach(function (t) { hasTerm(dTerms, t); });
lacks(dTerms, "RONI");
lacks(dTerms, "TCR");

var cTerms = terms("clintel", clintel);
["A–E", "ECS", "RCP8.5", "K7.3", "Claim 3", "Claim 5", "Claim 6", "Claim 10", "RIVM", "IPCC"].forEach(function (t) {
  hasTerm(cTerms, t);
});
lacks(cTerms, "Claim 1");
lacks(cTerms, "WCD");
lacks(cTerms, "RONI");
var grade = L.matches("clintel", clintel).filter(function (it) { return it.term === "A–E"; })[0];
assert.ok(/sterk/.test(grade.text) && /niet verifieerbaar/.test(grade.text));
var k73 = L.matches("clintel", clintel).filter(function (it) { return it.term === "K7.3"; })[0];
assert.ok(/Clintel/.test(k73.text));

var dos = terms("clintel", dossier);
["Claim 1", "Claim 7", "WCD", "RCP8.5", "SSP5-8.5", "K1.1", "K1.3"].forEach(function (t) { hasTerm(dos, t); });

assert.deepStrictEqual(terms("congres", congres), []);
assert.deepStrictEqual(terms("congres", "**A** (B) ECS K1.1"), []);
assert.deepStrictEqual(terms("email", klimaat), []);
assert.deepStrictEqual(terms("gv", klimaat), []);
assert.deepStrictEqual(terms("crypto", "**A** [F] ECS"), []);
assert.deepStrictEqual(terms("klimaatonderzoek", ""), []);

assert.strictEqual(L.gradeHit("El Niño, Barnes, ACER, AR6, NOAA, NASA en CO₂."), false);
assert.strictEqual(L.gradeHit("Bewijs: **A** voor de concentraties."), true);
assert.strictEqual(L.gradeHit("niet gecontroleerd (E)."), true);
assert.strictEqual(L.gradeHit("prestatieclaims (D/E)."), true);

var pTerms = terms("parkinson", parkinson);
["✅ / ⚠️", "n.g.", "DBS", "iPS", "MDS-UPDRS", "RCT", "GBA1", "off-periode", "EMA"].forEach(function (t) {
  hasTerm(pTerms, t);
});
lacks(pTerms, "A–E");
lacks(pTerms, "[F]");

var qTerms = terms("quantum", quantum);
["[F]", "[C]", "[P]", "[S]", "[O]", "FTQC", "QEC", "Λ", "PQC"].forEach(function (t) { hasTerm(qTerms, t); });
var qC = L.matches("quantum", quantum).filter(function (it) { return it.term === "[C]"; })[0];
assert.ok(/bedrijf/.test(qC.text));
assert.ok(!/voorlopig/.test(qC.text));
lacks(qTerms, "A–E");

var tTerms = terms("tcs", tcs);
["[F]", "[S]", "[O]", "FY", "ESG", "crore"].forEach(function (t) { hasTerm(tTerms, t); });
var tF = L.matches("tcs", tcs).filter(function (it) { return it.term === "[F]"; })[0];
assert.ok(/TCS-persbericht|primaire bron/.test(tF.text));
lacks(tTerms, "[C]");
lacks(tTerms, "[P]");

var sTerms = terms("statines", statines);
["LDL", "RCT", "OR", "HbA1c", "CK", "HMGCR"].forEach(function (t) { hasTerm(sTerms, t); });
lacks(sTerms, "A–E");

var cov = terms("covid", covid);
["VAERS", "SIRVA", "DOI", "HPV"].forEach(function (t) { hasTerm(cov, t); });
var vaers = L.matches("covid", covid).filter(function (it) { return it.term === "VAERS"; })[0];
assert.ok(/vrijwillig/.test(vaers.text) && /geen oorzaak/.test(vaers.text));

var bTerms = terms("blockchain", blockchain);
["DLT", "MiCA", "ESMA", "EVM", "BaFin"].forEach(function (t) { hasTerm(bTerms, t); });
lacks(bTerms, "A–E");

var gTerms = terms("gvresearch", gv);
hasTerm(gTerms, "DOI");
assert.ok(gTerms.length <= 2, "GV-legenda blijft klein: " + gTerms.join(", "));

var html = L.legendHtml("klimaatonderzoek", blok5, { nested: true });
assert.ok(html.indexOf("<details class=\"code-legend code-legend--nested\">") === 0);
assert.ok(html.indexOf("<summary>🔤 Legenda – afkortingen en codes</summary>") > 0);
assert.ok(html.indexOf("<dt>A–E</dt>") > 0);
assert.ok(html.indexOf("ECS") < 0);
assert.strictEqual(L.legendHtml("congres", klimaat), "");
assert.strictEqual(L.legendHtml("klimaatonderzoek", "geen codes hier, alleen een zin."), "");

var ck = read("updates/covidkritisch/2026-11-09T12-59.md");
var ckTerms = terms("covidkritisch", ck);
["A–E", "Houdt stand", "Gedeeltelijk / deels", "Houdt geen stand", "Open", "[P]", "[PR]", "[PP]", "[RET]", "[K]", "[S]", "[O]", "[?]", "T1–T8", "Healthy vaccinee effect", "EudraVigilance", "VAERS", "DOI"].forEach(function (t) { hasTerm(ckTerms, t); });
lacks(ckTerms, "[F]");
lacks(ckTerms, "ECS");
var ckT6 = ck.split(/^## Autopsie \(T6\)/m)[1].split(/^## /m)[0];
var ck6 = terms("covidkritisch", ckT6);
hasTerm(ck6, "[RET]");
lacks(ck6, "IgG4");
lacks(terms("covid", ck), "[RET]");

var app = read("app.js");
assert.ok(app.indexOf("codeLegendHtml") > 0);
assert.ok(/bot\.key === "congres"/.test(app));
assert.ok(app.indexOf("overviewLegend") > 0, "legenda staat los boven de samenvatting");
assert.ok(!/<summary>📋 Samenvatting en conclusies<\/summary>' \+ \(plain \? "" : codeLegendHtml/.test(app));
assert.ok(app.indexOf("ReportLegend") > 0);

console.log("legend.test.js: ok");
console.log("klimaat week:", kTerms.length, "termen");
console.log("clintel week:", cTerms.join(" | "));
console.log("blok 5:", b5.join(" | "));
