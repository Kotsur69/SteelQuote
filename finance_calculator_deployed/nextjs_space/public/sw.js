// Minimal service worker: exists only to satisfy Chrome's Android PWA
// installability requirement (a controlling SW with a fetch handler).
// No caching strategy — every request just passes through to the network.
self.addEventListener('fetch', () => {});
