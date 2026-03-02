// Service Worker for Manuscript Reader
// Caches the Kokoro TTS model for faster subsequent loads

const CACHE_NAME = 'kokoro-model-v1';
const MODEL_PATTERNS = [
  'huggingface.co',
  'cdn-lfs',
  '.onnx',
  'kokoro'
];

// Install event - just activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event - cache model files
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Check if this is a model-related request
  const isModelRequest = MODEL_PATTERNS.some(pattern => url.includes(pattern));

  if (isModelRequest) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Try to get from cache first
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache - fetch and cache
        try {
          const networkResponse = await fetch(event.request);

          // Only cache successful responses
          if (networkResponse.ok) {
            // Clone the response since we need to use it twice
            cache.put(event.request, networkResponse.clone());
          }

          return networkResponse;
        } catch (error) {
          // Network failed and not in cache - throw error
          throw error;
        }
      })
    );
  }
  // For non-model requests, let the browser handle normally
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});
