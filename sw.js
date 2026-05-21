const CACHE_NAME = "4metube-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./list.html",
  "./setting.html",
  "./watch.html",
  "./css/style.css",
  "./js/store.js",
  "./js/index.js",
  "./js/list.js",
  "./js/setting.js",
  "./js/watch.js",
  "./manifest.webmanifest",
  "./image/4metube_logo_side.png",
  "./image/4metube_icon_192.png",
  "./image/4metube_icon_512.png",
  "./image/play_button.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          const copy = res.clone();

          if (new URL(req.url).origin === location.origin) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy).catch(() => {});
            });
          }

          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
