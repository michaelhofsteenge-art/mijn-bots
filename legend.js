/* Legenda voor rapportcodes. Alleen betekenissen die in de rapporten zelf staan
   of een vaste, eenduidige standaardnaam zijn. Codes zonder zo'n basis ontbreken. */
(function (root) {
  "use strict";

  var CLIMATE = { klimaatonderzoek: 1, clintel: 1, klimaat: 1 };

  function gradeHit(text) {
    if (/\*\*\s*[A-E](?:\s*\/\s*[A-E])?\s*\*\*/.test(text)) return true;
    if (/\([A-E](?:\s*\/\s*[A-E])?/.test(text)) return true;
    if (/[^A-Za-z0-9*][A-E]\s*\/\s*[A-E](?:[^A-Za-z0-9]|$)/.test(text)) return true;
    if (/(?:^|\n|\|)\s*[A-E]\s*(?:\||$)/m.test(text)) return true;
    if (/(?:bewijs|bewijsklasse|klasse|band)\s*[:=]?\s*\**\s*[A-E]\b/i.test(text)) return true;
    return false;
  }

  function claimHit(n, text) {
    return new RegExp("(?:\\b(?:dossier)?claim\\s*" + n + "\\b|\\|\\s*" + n + "\\s)", "i").test(text);
  }

  function tagHit(letter, text) {
    var L = letter.replace("?", "\\?");
    return new RegExp("\\[" + L + "(?:\\/[A-Z?]+)?\\]|\\[[A-Z?]\\/" + L + "\\]|(?:^|[^A-Za-z])" + L + "\\/[A-Z?]").test(text);
  }

  /* Elk item: keys (of "*"), term, text, hit(text) -> boolean */
  var ITEMS = [
    {
      keys: CLIMATE,
      term: "A–E",
      text: "Bewijsklasse. A = sterk, B = redelijk sterk, C = voorlopig, D = zwak, E = niet verifieerbaar. Zo staat het in de leeswijzer van de nulmeting (19 oktober 2026). A/B of B/C zit tussen die twee klassen in.",
      hit: gradeHit
    },
    {
      keys: CLIMATE,
      term: "AUTEURSCLAIM",
      text: "Conclusie van de auteurs zelf, nog niet het oordeel van de monitor. De nulmeting definieert dit label zo.",
      hit: function (t) { return /\bAUTEURSCLAIM\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "GEVERIFIEERD",
      text: "In de bron gecontroleerd (ook als ‘geverifieerde bevinding’). De nulmeting zet dit tegenover de auteursclaim.",
      hit: function (t) { return /\bGEVERIFIEERD/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ONZEKERHEID",
      text: "Punt dat de monitor als open of onzeker markeert. De nulmeting gebruikt dit label naast geverifieerd en auteursclaim.",
      hit: function (t) { return /\bONZEKERHEID\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ECS",
      text: "Evenwichtsklimaatgevoeligheid: de opwarming bij een verdubbeling van CO₂. Zo legt het verdiepingsrapport van november 2026 het uit.",
      hit: function (t) { return /\bECS\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "EEI",
      text: "Energie-onbalans van de aarde: het verschil tussen ingaande en uitgaande straling. Zo legt het verdiepingsrapport van november 2026 het uit.",
      hit: function (t) { return /\bEEI\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "IPCC",
      text: "Klimaatpanel van de VN. De rapporten vergelijken studies met de IPCC-band en met AR6 (2021).",
      hit: function (t) { return /\bIPCC\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "AR6",
      text: "Zesde IPCC-rapport (2021). Het verdiepingsrapport schrijft ‘IPCC (AR6, 2021)’.",
      hit: function (t) { return /\bAR6\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "AR7",
      text: "Volgende IPCC-rapport. Het verdiepingsrapport zegt dat de tijdlijn onzeker is na de geschorste zitting IPCC-65.",
      hit: function (t) { return /\bAR7\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "WMO",
      text: "Wereld Meteorologische Organisatie. De rapporten citeren het broeikasgasbulletin van de WMO.",
      hit: function (t) { return /\bWMO\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "NOAA",
      text: "Amerikaanse dienst voor oceaan en atmosfeer. De rapporten citeren NOAA voor El Niño en voor broeikasgascijfers.",
      hit: function (t) { return /\bNOAA\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ENSO",
      text: "De afwisseling van El Niño en La Niña. NOAA publiceert daar de ENSO-discussie over; de rapporten gebruiken die voor de sterkte van El Niño.",
      hit: function (t) { return /\bENSO\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "CPC",
      text: "Onderdeel van NOAA dat de ENSO-discussie publiceert. Het rapport schrijft ‘NOAA CPC — ENSO Diagnostic Discussion’ en schrijft CPC niet uit.",
      hit: function (t) { return /\bCPC\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ppm",
      text: "Delen per miljoen. Eenheid van de CO₂-concentratie, bijvoorbeeld 426,8 ppm in het WMO-bulletin.",
      hit: function (t) { return /\bppm\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ppb",
      text: "Delen per miljard. Eenheid van methaan en lachgas in het WMO-bulletin.",
      hit: function (t) { return /\bppb\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "CO₂",
      text: "Koolstofdioxide, het broeikasgas waar de concentratie, de uitstoot en de klimaatgevoeligheid in deze rapporten om draaien.",
      hit: function (t) { return /CO₂|CO2/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "CH₄",
      text: "Methaan. Het WMO-bulletin geeft de concentratie als CH₄ in ppb; de samenvatting noemt het methaan.",
      hit: function (t) { return /CH₄|CH4/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "N₂O",
      text: "Lachgas. Het WMO-bulletin geeft de concentratie als N₂O in ppb; de samenvatting noemt het lachgas.",
      hit: function (t) { return /N₂O|N2O/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "W/m²",
      text: "Watt per vierkante meter. Eenheid van stralingsforcering en van de energie-onbalans.",
      hit: function (t) { return /W\/m²|W\/m2/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "RCP8.5",
      text: "Hoog emissiescenario. De rapporten noemen het onwaarschijnlijk en zeggen dat het te vaak als ‘business as usual’ is gebruikt.",
      hit: function (t) { return /\bRCP8\.5\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "SSP5-8.5",
      text: "Hoge scenario-variant, in het Clintel-dossier in één adem genoemd met RCP8.5. SSP is de familie Shared Socioeconomic Pathways.",
      hit: function (t) { return /\bSSP5-8\.5\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "VPD",
      text: "Dampdrukdeficit: hoe ‘dorstig’ de lucht is. Zo legt het weekrapport van 2 november 2026 het uit bij de vegetatiestudie.",
      hit: function (t) { return /\bVPD\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "NDVI",
      text: "Satellietmaat voor hoe groen de vegetatie is (Normalized Difference Vegetation Index). Het weekrapport noemt satelliet-NDVI bij Li e.a. en schrijft de Engelse naam niet uit.",
      hit: function (t) { return /\bNDVI\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "LCA",
      text: "Levenscyclusanalyse: uitstoot over de hele levensduur, niet alleen tijdens het rijden. De nulmeting werkt dat uit voor elektrische auto’s; weekrapporten korten het af tot LCA.",
      hit: function (t) { return /\bLCA\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "CCS",
      text: "Afvang en opslag van CO₂. De rapporten gebruiken CCS bij de projecten Porthos en Aramis.",
      hit: function (t) { return /\bCCS\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "SMR",
      text: "Kleine modulaire kernreactor (small modular reactor). De nulmeting zegt dat er veel ontwerpen zijn en dat er in het Westen nog geen is gebouwd.",
      hit: function (t) { return /\bSMR\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "CERES",
      text: "Satellietmetingen van de stralingsbalans. Het verdiepingsrapport noemt CERES naast Argo bij de energie-onbalans.",
      hit: function (t) { return /\bCERES\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "Argo",
      text: "Meetnet voor de oceaan. Het verdiepingsrapport schrijft ‘Argo-oceaanmetingen’ naast CERES.",
      hit: function (t) { return /\bArgo\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "MODIS",
      text: "Satellietinstrument in de scheepssporenmethode van Yuan e.a. De rapporten schrijven de naam niet uit.",
      hit: function (t) { return /\bMODIS\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ESSD",
      text: "Tijdschrift Earth System Science Data. Forster e.a. 2025 staat daar; de nulmeting noteert ESSD 17:2641.",
      hit: function (t) { return /\bESSD\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "IMO",
      text: "Internationale scheepvaartorganisatie. Het verdiepingsrapport noemt de IMO-zwavelregels van 2020 voor schepen, waardoor aerosolen daalden.",
      hit: function (t) { return /\bIMO\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "LNG",
      text: "Vloeibaar aardgas. Het weekrapport gebruikt LNG voor de gasimport, onder meer uit Qatar en de Verenigde Staten.",
      hit: function (t) { return /\bLNG\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "TTF",
      text: "Nederlandse gasbeurs (Title Transfer Facility). Het rapport noemt de TTF-termijnprijs in euro per megawattuur.",
      hit: function (t) { return /\bTTF\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "MWh",
      text: "Megawattuur. De TTF-gasprijs staat in euro per MWh.",
      hit: function (t) { return /\bMWh\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "Gt",
      text: "Gigaton (miljard ton). Het UNEP-rapport gebruikt Gt bij CO₂-verwijdering.",
      hit: function (t) { return /\bGt\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ACER",
      text: "Europees agentschap van energietoezichthouders. Het weekrapport citeert ACER voor de gasopslag en de extra importkosten.",
      hit: function (t) { return /\bACER\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "ACM",
      text: "Autoriteit Consument & Markt. De rapporten citeren de ACM over nettarieven, gasprijzen voor huishoudens en congestiebesluiten.",
      hit: function (t) { return /\bACM\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "PBL",
      text: "Planbureau voor de Leefomgeving. De nulmeting noemt het Planbureau bij de Klimaat- en Energieverkenning.",
      hit: function (t) { return /\bPBL\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "CPB",
      text: "Centraal Planbureau. De rapporten noemen het CPB bij een ontbrekende integrale raming van de systeemkosten.",
      hit: function (t) { return /\bCPB\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "KEV",
      text: "Klimaat- en Energieverkenning van het PBL.",
      hit: function (t) { return /\bKEV\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "RIVM",
      text: "Rijksinstituut voor Volksgezondheid en Milieu. De rapporten citeren het RIVM bij hittedoden en de uitstootinventarisatie.",
      hit: function (t) { return /\bRIVM\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "KNMI",
      text: "Koninklijk Nederlands Meteorologisch Instituut.",
      hit: function (t) { return /\bKNMI\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "UNEP",
      text: "Milieuprogramma van de VN. De rapporten citeren het UNEP Emissions Gap Report.",
      hit: function (t) { return /\bUNEP\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "COP",
      text: "Jaarlijkse klimaatconferentie van de VN. Het weekrapport noemt COP31 (9–20 november, Antalya).",
      hit: function (t) { return /\bCOP\d*\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "LSHTM",
      text: "London School of Hygiene & Tropical Medicine. Het rapport noemt LSHTM samen met Imperial College bij de hittestudie van Barnes e.a.",
      hit: function (t) { return /\bLSHTM\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "WCD",
      text: "World Climate Declaration, de verklaring van Clintel. Het dossier van 20 oktober 2026 schrijft de naam voluit.",
      hit: function (t) { return /\bWCD\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "DOI",
      text: "Vast nummer van een publicatie. Een link met doi.org of doi: wijst daarmee naar het artikel.",
      hit: function (t) { return /\bdoi\s*:|doi\.org/i.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K1.1",
      text: "Open controverse over hoe hoog de klimaatgevoeligheid (ECS) is. Het weekrapport van 2 november koppelt K1.1 aan het geschil tussen Yuan e.a. 2026 en Park & Soden 2025 en zegt dat het open blijft.",
      hit: function (t) { return /\bK1\.1\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K1.2",
      text: "Samen met K1.1 genoemd als open ECS-controverse in het verdiepingsrapport van november 2026 (versnelt de opwarming, en wat betekent dat voor de gevoeligheid?). Een aparte titel voor alleen K1.2 staat niet in de rapporten.",
      hit: function (t) { return /\bK1\.2\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K1.3",
      text: "Controverse over het scenario RCP8.5. Het Clintel-rapport van 26 oktober 2026 koppelt K1.3 aan dat scenario.",
      hit: function (t) { return /\bK1\.3\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K2.2",
      text: "Controverse over vergroening. Het weekrapport van 2 november 2026 zet ‘(vergroening)’ achter K2.2.",
      hit: function (t) { return /\bK2\.2\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K2.5",
      text: "Open geschil over de Amazone-CO₂-metingen van Gatti e.a.: wel of niet corrigeren. Het weekrapport van 26 oktober 2026 noemt dit een nieuwe controverse.",
      hit: function (t) { return /\bK2\.5\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K3.1",
      text: "Netcongestie: komt die door te weinig kabels, of ook door benutting, data en regels? Zo omschrijft het weekrapport van 26 oktober 2026 K3.1.",
      hit: function (t) { return /\bK3\.1\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K3.2",
      text: "Systeemkosten volgens CPB en PBL. De weekrapporten zetten dat tussen haakjes bij K3.2 en melden dat er nog geen kernstudie is.",
      hit: function (t) { return /\bK3\.2\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K4.1",
      text: "Klimaatwinst van elektrische auto’s over de hele levensduur: volgens het weekrapport van 2 november ‘robuust in de EU, kleiner bij kolenstroom of een grote accu’.",
      hit: function (t) { return /\bK4\.1\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K5.1",
      text: "Brandrisico van e-bikes en thuisaccu’s. Zo noemt het weekrapport van 26 oktober 2026 K5.1.",
      hit: function (t) { return /\bK5\.1\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K6.1",
      text: "Kosten van kernenergie. Het weekrapport van 2 november zet bij K6.1: €20–30 miljard voor twee centrales.",
      hit: function (t) { return /\bK6\.1\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K6.2",
      text: "Vertraging bij CCS en waterstof. Zo zet het weekrapport van 2 november 2026 het achter K6.2.",
      hit: function (t) { return /\bK6\.2\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K7.1",
      text: "Waterbedeffect: een nationaal klimaatdoel naast het Europese emissiehandelssysteem (ETS). De rapporten melden dat er nog geen kernstudie is.",
      hit: function (t) { return /\bK7\.1\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K7.2",
      text: "Betrouwbaarheid van schadecijfers. Het weekrapport van 2 november 2026 zet die woorden achter K7.2.",
      hit: function (t) { return /\bK7\.2\b/.test(t); }
    },
    {
      keys: CLIMATE,
      term: "K7.3",
      text: "Betrouwbaarheid van Clintel. De Clintel-rapporten zetten die woorden achter K7.3.",
      hit: function (t) { return /\bK7\.3\b/.test(t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 1",
      text: "Clintel-claim: het KNMI heeft hittegolven vóór 1950 in De Bilt ten onrechte weggecorrigeerd. Uit de claimtabel in het dossier van 20 oktober 2026.",
      hit: function (t) { return claimHit(1, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 2",
      text: "Clintel-claim: er is geen trend in het aantal tropische orkanen. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(2, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 3",
      text: "Clintel-claim: RCP8.5 is onwaarschijnlijk en wordt te veel gebruikt. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(3, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 4",
      text: "Clintel-claim: de sterfte door weerrampen is sterk gedaald sinds 1920. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(4, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 5",
      text: "Clintel-claim: genormaliseerde rampschade is niet gestegen. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(5, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 6",
      text: "Clintel-claim: de ECS ligt waarschijnlijk onder 2 °C. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(6, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 7",
      text: "Clintel-claim: de zeespiegelstijging versnelt niet wezenlijk. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(7, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 8",
      text: "Clintel-claim: het IPCC zou de middeleeuwse warme periode wegpoetsen. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(8, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 9",
      text: "Clintel-claim: de rol van de zon wordt onderschat. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(9, t); }
    },
    {
      keys: { clintel: 1 },
      term: "Claim 10",
      text: "Clintel-claim: er is geen klimaatnoodtoestand. Uit de claimtabel in het dossier.",
      hit: function (t) { return claimHit(10, t); }
    },

    {
      keys: { parkinson: 1 },
      term: "✅ / ⚠️",
      text: "Bronwaarde boven de parkinsonrapporten: ✅ = peer-reviewed, ⚠️ = niet peer-reviewed (persbericht, congres, nieuws of register).",
      hit: function (t) { return /✅|⚠️/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "n.g.",
      text: "‘Datum n.g.’ betekent dat de exacte publicatiedatum niet is geverifieerd. Zo staat het in de legenda boven de parkinsonrapporten.",
      hit: function (t) { return /\bn\.g\./.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "DBS",
      text: "Deep brain stimulation: diepe hersenstimulatie. Het rapport schrijft die Engelse naam in de kop van het DBS-onderdeel.",
      hit: function (t) { return /\bDBS\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "STN",
      text: "Nucleus subthalamicus, de hersenkern bij STN-DBS. Het rapport schrijft STN niet uit.",
      hit: function (t) { return /\bSTN\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "iPS",
      text: "Geïnduceerde pluripotente stamcellen. Het rapport beschrijft dopamine-voorlopercellen uit iPS-cellen van donoren en schrijft de letters niet uit.",
      hit: function (t) { return /\biPS\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "MDS-UPDRS",
      text: "Standaardscorelijst voor parkinsonsymptomen (Movement Disorder Society). Het rapport noemt de score, niet de volledige naam.",
      hit: function (t) { return /\bMDS-UPDRS\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "RCT",
      text: "Gerandomiseerde gecontroleerde studie, met een controlegroep.",
      hit: function (t) { return /\bRCT\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "PD",
      text: "Ziekte van Parkinson, zoals in ‘46 PD’.",
      hit: function (t) { return /\bPD\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "GBA1",
      text: "Erfelijke risicofactor. Het rapport zegt dat zelf bij de DBS-studie.",
      hit: function (t) { return /\bGBA1\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "EEG",
      text: "Hersenfilmpje. Het rapport noemt een EEG-studie over ritmeverwerking.",
      hit: function (t) { return /\bEEG\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "off-periode",
      text: "Uren waarin de parkinsonmedicatie onvoldoende werkt. Het rapport gebruikt off-tijd en off-periode bij inhaleerbare levodopa.",
      hit: function (t) { return /off-tijd|off-periode|off-period/i.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "EMA",
      text: "Europees Geneesmiddelenbureau.",
      hit: function (t) { return /\bEMA\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "FDA",
      text: "Amerikaanse geneesmiddelenautoriteit.",
      hit: function (t) { return /\bFDA\b/.test(t); }
    },
    {
      keys: { parkinson: 1 },
      term: "n",
      text: "Aantal deelnemers of patiënten, bijvoorbeeld n=7 of n=60.",
      hit: function (t) { return /\bn\s*=\s*\d/.test(t); }
    },

    {
      keys: { covid: 1 },
      term: "VAERS",
      text: "Amerikaans systeem voor vrijwillige meldingen van vermoede vaccinbijwerkingen. Het rapport zegt dat zo’n melding geen oorzaak bewijst.",
      hit: function (t) { return /\bVAERS\b/.test(t); }
    },
    {
      keys: { covid: 1 },
      term: "SIRVA",
      text: "Schouderletsel door de injectie. Het rapport schrijft die woorden in de kop bij SIRVA.",
      hit: function (t) { return /\bSIRVA\b/.test(t); }
    },
    {
      keys: { covid: 1 },
      term: "HPV",
      text: "Humaan papillomavirus. Het rapport vergelijkt met het HPV-vaccin.",
      hit: function (t) { return /\bHPV\b/.test(t); }
    },
    {
      keys: { covid: 1 },
      term: "DOI",
      text: "Vast nummer van een publicatie. Een link met doi.org of doi: wijst daarmee naar het artikel.",
      hit: function (t) { return /\bdoi\s*:|doi\.org/i.test(t); }
    },
    {
      keys: { covid: 1 },
      term: "n",
      text: "Aantal mensen in de studie, bijvoorbeeld n = 60.",
      hit: function (t) { return /\bn\s*=\s*\d/.test(t); }
    },
    {
      keys: { covid: 1 },
      term: "mRNA",
      text: "Boodschappermolecuul waarop een deel van de COVID-vaccins berust. De rapporten schrijven mRNA-vaccin.",
      hit: function (t) { return /\bmRNA\b/.test(t); }
    },

    {
      keys: { quantum: 1 },
      term: "[F]",
      text: "Geverifieerd feit uit een primaire bron. Zo staat het in de leeswijzer van de quantumrapporten.",
      hit: function (t) { return tagHit("F", t); }
    },
    {
      keys: { quantum: 1 },
      term: "[C]",
      text: "Claim van een bedrijf, nog niet onafhankelijk gecontroleerd. Zo staat het in de leeswijzer van de quantumrapporten.",
      hit: function (t) { return tagHit("C", t); }
    },
    {
      keys: { quantum: 1 },
      term: "[P]",
      text: "Preprint: nog niet peer-reviewed. Zo staat het in de leeswijzer van het quantumweekrapport.",
      hit: function (t) { return tagHit("P", t); }
    },
    {
      keys: { quantum: 1 },
      term: "[S]",
      text: "Secundaire bron, zoals pers of een verzamelsite. Zo staat het in de leeswijzer.",
      hit: function (t) { return tagHit("S", t); }
    },
    {
      keys: { quantum: 1 },
      term: "[O]",
      text: "Eigen oordeel van de analist. Zo staat het in de leeswijzer.",
      hit: function (t) { return tagHit("O", t); }
    },
    {
      keys: { quantum: 1 },
      term: "[?]",
      text: "Onbekend of niet te controleren. Zo staat het in de leeswijzer van de quantum-nulmeting.",
      hit: function (t) { return /\[\?\]|\*\*\?\*\*/.test(t); }
    },
    {
      keys: { quantum: 1 },
      term: "FTQC",
      text: "Fouttolerante quantumcomputer. Het weekrapport zet FTQC naast de Engelse woorden fault-tolerant.",
      hit: function (t) { return /\bFTQC\b/.test(t); }
    },
    {
      keys: { quantum: 1 },
      term: "QEC",
      text: "Quantumfoutcorrectie. Het rapport telt de logische fout per QEC-ronde.",
      hit: function (t) { return /\bQEC\b/.test(t); }
    },
    {
      keys: { quantum: 1 },
      term: "Λ",
      text: "Onderdrukkingsfactor. Het weekrapport van 26 oktober 2026 zegt: een hogere Λ betekent dat per logische qubit veel minder fysieke qubits nodig zijn.",
      hit: function (t) { return /Λ/.test(t); }
    },
    {
      keys: { quantum: 1 },
      term: "PQC",
      text: "Post-quantumcryptografie: beveiliging die ook tegen een grote quantumcomputer moet houden. De rapporten gebruiken PQC bij migratieplannen; een bronlink schrijft post-quantum.",
      hit: function (t) { return /\bPQC\b/.test(t); }
    },
    {
      keys: { quantum: 1 },
      term: "QKD",
      text: "Quantum-sleutelverdeling voor een beveiligde verbinding. Het rapport noemt QKD-netwerken en een QKD-testbed en schrijft de letters niet uit.",
      hit: function (t) { return /\bQKD\b/.test(t); }
    },

    {
      keys: { tcs: 1 },
      term: "[F]",
      text: "Feit uit een primaire bron: TCS-persbericht, beursdeponering of officiële publicatie. Zo staat het in de leeswijzer van het TCS-rapport.",
      hit: function (t) { return tagHit("F", t); }
    },
    {
      keys: { tcs: 1 },
      term: "[S]",
      text: "Secundaire bron, zoals pers of een koerssite. Zo staat het in de leeswijzer van het TCS-rapport.",
      hit: function (t) { return tagHit("S", t); }
    },
    {
      keys: { tcs: 1 },
      term: "[O]",
      text: "Eigen oordeel. Zo staat het in de leeswijzer van het TCS-rapport.",
      hit: function (t) { return tagHit("O", t); }
    },
    {
      keys: { tcs: 1 },
      term: "FY",
      text: "Boekjaar. Het TCS-rapport zegt dat het boekjaar van april tot maart loopt.",
      hit: function (t) { return /\bFY\d*\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "TCV",
      text: "Totale waarde van nieuwe contracten. Het rapport zet TCV bij de kwartaalcijfers en schrijft de letters niet uit.",
      hit: function (t) { return /\bTCV\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "GCC",
      text: "Grote bedrijfsvestiging, vaak in India. Het rapport gaat over de overname van de Best Buy-GCC en schrijft de letters niet uit.",
      hit: function (t) { return /\bGCC\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "ESG",
      text: "Milieu, sociaal beleid en bestuur. Het rapport noemt een ESG-score.",
      hit: function (t) { return /\bESG\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "H-1B",
      text: "Amerikaans werkvisum. Het rapport noemt de H-1B-loterij van TCS.",
      hit: function (t) { return /\bH-1B\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "DPDP",
      text: "Indiase privacywet (Digital Personal Data Protection). Het rapport noemt DPDP bij de registratie van consent managers.",
      hit: function (t) { return /\bDPDP\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "crore",
      text: "Indiase rekeneenheid: 1 crore = 10 miljoen. Het rapport gebruikt crore bij bedragen in roepies.",
      hit: function (t) { return /\bcrore\b/i.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "RBI",
      text: "Centrale bank van India. Het rapport noemt RBI-regels voor Tata Sons.",
      hit: function (t) { return /\bRBI\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "NBFC",
      text: "Financiële instelling die geen bank is. Het rapport noemt upper-layer NBFC’s bij de regels voor een beursgang van Tata Sons.",
      hit: function (t) { return /\bNBFC\b/.test(t); }
    },
    {
      keys: { tcs: 1 },
      term: "SP Group",
      text: "Aandeelhouder van Tata Sons. Het rapport noemt de SP Group (18,4%) en een voorstel om die deels uit te kopen.",
      hit: function (t) { return /SP Group|SP-uitkoop/.test(t); }
    },

    {
      keys: { statines: 1 },
      term: "LDL",
      text: "Het cholesterol dat statines verlagen. Het rapport noemt een LDL van 0,7.",
      hit: function (t) { return /\bLDL\b/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "RCT",
      text: "Gerandomiseerde gecontroleerde studie (trial), met een controlegroep.",
      hit: function (t) { return /\bRCT/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "OR",
      text: "Odds ratio: verhouding van kansen. Onder 1 komt iets minder vaak voor, boven 1 vaker. Het rapport geeft bijvoorbeeld OR 0,79 bij delier.",
      hit: function (t) { return /\bOR\s+\d/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "HR",
      text: "Hazard ratio: verhouding van het tempo waarin iets gebeurt. Onder 1 langzamer, boven 1 sneller. Het rapport gebruikt HR bij botbreuken.",
      hit: function (t) { return /\bHR\s+\d/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "HbA1c",
      text: "Langetermijnbloedsuiker. Het rapport schrijft die uitleg zelf tussen haakjes.",
      hit: function (t) { return /\bHbA1c\b/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "CK",
      text: "Spierenzym. Het rapport noemt ‘spierenzym CK’.",
      hit: function (t) { return /\bCK\b/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "HMGCR",
      text: "Gen dat het doelwit van statines is. Het rapport zegt dat zelf.",
      hit: function (t) { return /\bHMGCR\b/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "IC",
      text: "Intensive care. Het rapport schrijft IC-patiënten.",
      hit: function (t) { return /\bIC\b/.test(t); }
    },
    {
      keys: { statines: 1 },
      term: "BCRP / OATP",
      text: "Transporteiwitten. Het rapport zegt dat ticagrelor via BCRP en OATP de afvoer van rosuvastatine remt. De letters worden niet uitgeschreven.",
      hit: function (t) { return /\bBCRP\b|\bOATP\b/.test(t); }
    },

    {
      keys: { blockchain: 1 },
      term: "DLT",
      text: "Digitale grootboektechniek (distributed ledger), de familie waar blockchain onder valt. Het rapport gebruikt DLT bij de beurs 21X en bij ‘DLT-native’.",
      hit: function (t) { return /\bDLT\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "EVM",
      text: "De rekenmachine van Ethereum (Ethereum Virtual Machine). Het rapport vergelijkt een snelheid met een institutionele EVM-basis.",
      hit: function (t) { return /\bEVM\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "MiCA",
      text: "Europese cryptoregelgeving (Markets in Crypto-Assets). Het rapport noemt het MiCA-register.",
      hit: function (t) { return /\bMiCA\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "ESMA",
      text: "Europese effectentoezichthouder. Het rapport noemt het ESMA-bestand bij MiCA.",
      hit: function (t) { return /\bESMA\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "BaFin",
      text: "Duitse financiële toezichthouder. Het rapport noemt 21X een beurs onder BaFin-toezicht.",
      hit: function (t) { return /\bBaFin\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "ECB",
      text: "Europese Centrale Bank. Oudere updates noemen een obligatie die als ECB-onderpand mag dienen.",
      hit: function (t) { return /\bECB\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "AFM",
      text: "Autoriteit Financiële Markten, Nederlandse toezichthouder.",
      hit: function (t) { return /\bAFM\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "DNB",
      text: "De Nederlandsche Bank.",
      hit: function (t) { return /\bDNB\b/.test(t); }
    },
    {
      keys: { blockchain: 1 },
      term: "HKMA",
      text: "Hongkongse monetaire autoriteit. Een update noemt HKMA de centrale bank van Hongkong.",
      hit: function (t) { return /\bHKMA\b/.test(t); }
    },

    {
      keys: { gvresearch: 1, statines: 1, parkinson: 1, tcs: 1, blockchain: 1, quantum: 1 },
      term: "DOI",
      text: "Vast nummer van een publicatie. Een link met doi.org of doi: wijst daarmee naar het artikel.",
      hit: function (t) { return /\bdoi\s*:|doi\.org/i.test(t); }
    }
  ];

  function forKey(key) {
    return ITEMS.filter(function (it) { return it.keys[key]; });
  }

  function matches(key, markdown) {
    var text = String(markdown || "");
    if (!key || key === "congres") return [];
    return forKey(key).filter(function (it) { return it.hit(text); }).map(function (it) {
      return { term: it.term, text: it.text };
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function legendHtml(key, markdown, opt) {
    opt = opt || {};
    var items = matches(key, markdown);
    if (!items.length) return "";
    var cls = "code-legend" + (opt.nested ? " code-legend--nested" : " card");
    var rows = items.map(function (it) {
      return "<div><dt>" + esc(it.term) + "</dt><dd>" + esc(it.text) + "</dd></div>";
    }).join("");
    return '<details class="' + cls + '"><summary>Legenda – afkortingen en codes</summary><dl class="code-legend-list">' + rows + "</dl></details>";
  }

  root.ReportLegend = {
    matches: matches,
    legendHtml: legendHtml,
    gradeHit: gradeHit
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
