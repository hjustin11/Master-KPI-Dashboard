// Minimaler Service Worker, ausschließlich um Installierbarkeitskriterien für
// PWA zu erfüllen (Chrome/Edge/Android verlangen einen registrierten SW mit
// fetch-Handler, sonst feuert `beforeinstallprompt` nicht).
// Bewusst KEIN Caching — wir wollen, dass die Daten immer live aus dem Netz
// kommen (Dashboard-Charakter mit Live-API-Calls). Falls später Offline-
// Fähigkeit gewünscht: hier eine workbox- oder stale-while-revalidate-
// Strategie ergänzen.

self.addEventListener("install", (event) => {
  // Direkter Wechsel zum aktivierten Worker — kein "waiting"-State.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Sofort die Kontrolle über alle Clients übernehmen.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through. Erfüllt das fetch-Handler-Kriterium für Installierbarkeit
  // ohne tatsächlich was zu cachen.
  event.respondWith(fetch(event.request));
});
