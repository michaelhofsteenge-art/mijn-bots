// ============================================================
//  Mijn Bots — configuratie (dit is de ENIGE plek voor defaults)
// ============================================================
//  Standaard-PIN (eerste gebruik): 1234
//  Na ontgrendelen kun je in de app zelf een nieuwe PIN instellen
//  (⚙️ Pincode wijzigen). Die wordt als SHA-256 in localStorage
//  bewaard (niet remote). Ontbreekt die, dan geldt PIN_SHA256 hier.
//
//  Standaard-hash opnieuw zetten (bv. na reset):
//    echo -n 1234 | sha256sum
//  Verhoog CONFIG_VERSION om iedereen opnieuw te laten ontgrendelen.
//
//  LET OP: lichte bescherming, geen echte beveiliging (zie README).
// ============================================================
window.BOTS_CONFIG = {
  PIN_SHA256: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
  PIN_LENGTH: 4,
  CONFIG_VERSION: 1,
  DATA_URL: "data.json"
};
