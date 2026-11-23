// 课迹 Service Worker
// 缓存应用壳，让页面离线也能打开；联网时优先取最新版本，避免部署后手机还停留在旧页面。
const CACHE_NAME = 'keji-v9';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  // 页面导航不设超时：首次访问或网络慢时，等网络比直接失败更好。
  const isNavigation = request.mode === 'navigate';
  const controller = isNavigation ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT) : null;
  try {
    const response = await fetch(request, controller ? { signal: controller.signal } : undefined);
    if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // 只接管同源静态资源；CDN、字体等第三方请求交给浏览器。
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
