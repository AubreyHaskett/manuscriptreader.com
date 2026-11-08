const SW_VERSION = 2;

const CACHE_NAME = `kokoro-model-v${SW_VERSION}`;

const MODEL_PATTERNS = [ "huggingface.co", "cdn-lfs", ".onnx", "kokoro" ];

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("kokoro-model-") && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = event.request.url;
  const isModelRequest = MODEL_PATTERNS.some(pattern => url.includes(pattern));
  if (isModelRequest) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        throw error;
      }
    }));
  }
});

self.addEventListener("message", event => {
  if (event.data.type === "CLEAR_CACHE") {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({
        success: true
      });
    });
  }
});
