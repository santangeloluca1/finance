/* Service worker di Basis: riceve le notifiche push e apre la pagina giusta al tocco.
 * Tiene anche una cache prudente per aprire l'app senza rete: i file statici di Next
 * (con l'hash nel nome, quindi immutabili) e le icone dalla cache; le pagine dalla rete,
 * con la copia salvata se la rete non risponde entro 3 secondi. Non tocca mai /api,
 * /accedi, le richieste non GET, quelle verso altri siti e i payload RSC di Next. */

const VERSION = "v1";
const STATIC_CACHE = `basis-static-${VERSION}`;
const PAGES_CACHE = `basis-pages-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;
// In sviluppo i file di /_next/static non hanno hash: niente cache, si vedrebbe codice vecchio.
const DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGES_CACHE];
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("basis-") && !keep.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  ),
);

/** Solo risposte complete dello stesso sito: niente redirect (es. verso /accedi senza sessione) né errori. */
function cacheable(res) {
  return res && res.status === 200 && res.type === "basic" && !res.redirected;
}

/** Tiene la cache entro un numero di voci, togliendo le più vecchie (keys() segue l'ordine di inserimento). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Senza attendere il salvataggio: la risposta va subito alla pagina.
  if (cacheable(res)) void cache.put(req, res.clone()).then(() => trim(cache, 300), () => {});
  return res;
}

async function networkFirst(event) {
  const req = event.request;
  const cache = await caches.open(PAGES_CACHE);
  const network = fetch(req).then(async (res) => {
    if (cacheable(res)) {
      await cache.put(req, res.clone());
      void trim(cache, 40);
    }
    return res;
  });
  // Se vince la copia salvata, la rete finisce comunque di aggiornare la cache.
  event.waitUntil(network.then(() => undefined, () => undefined));
  // Rete lenta: dopo 3 secondi si mostra la copia salvata (la rete intanto aggiorna la cache).
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS)).then(() => cache.match(req));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return await network;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/accedi" || url.pathname.startsWith("/accedi/")) return;
  // Navigazioni interne di Next (payload RSC): solo rete. In cache servirebbero chiavi per
  // header (RSC, Next-Router-State-Tree) e rischierebbero di mescolare versioni diverse dell'app.
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (!DEV && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || url.pathname.startsWith("/apple-icon"))) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate") event.respondWith(networkFirst(event));
});

self.addEventListener("push", (event) => {
  let msg = { title: "Basis", body: "", url: "/avvisi", tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    if (event.data) msg.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: "/apple-icon",
      badge: "/apple-icon",
      data: { url: msg.url || "/avvisi" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/avvisi", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if ("navigate" in c) return c.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
