// ============================================================
//  Mijn Bots — configuratie (dit is de ENIGE plek om aan te passen)
// ============================================================
//  PIN wijzigen:
//    1. Kies een nieuwe 4-cijferige PIN, bv. 4821
//    2. Bereken de SHA-256 hash:
//         echo -n 4821 | sha256sum
//       (of: python3 -c "import hashlib;print(hashlib.sha256(b'4821').hexdigest())")
//    3. Plak de hash hieronder bij PIN_SHA256.
//    4. Verhoog CONFIG_VERSION, dan moet iedereen opnieuw ontgrendelen.
//
//  Huidige (tijdelijke) PIN: 1234
//  LET OP: dit is lichte bescherming, geen echte beveiliging (zie README).
// ============================================================
window.BOTS_CONFIG = {
  PIN_SHA256: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
  PIN_LENGTH: 4,
  CONFIG_VERSION: 1,
  DATA_URL: "data.json"
};
