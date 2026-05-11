/* Kennedy Driver PWA Service Worker
 * 策略:
 *   - 静态资源 (JS/CSS/图标): stale-while-revalidate，让司机启动更快。
 *   - 文档 (HTML/driver 页面): network-first，离线时回退缓存的壳，保证看到 UI。
 *   - API 请求 (supabase, samsara 等): 全部不走缓存，避免看到过期数据。
 * 版本号: 改动时 bump，强制旧 SW 失效。
 */
const VERSION = 'driver-v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

// 最小 shell，安装时预热一次，离线打开不至于白屏
const SHELL_URLS = ['/driver/login', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('samsara.com') ||
    url.hostname.includes('googleapis.com')
  );
}

function isAssetRequest(request, url) {
  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font') {
    return true;
  }
  return /\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 仅处理同源；跨域只拦 API（用于统计/兜底）
  if (url.origin !== self.location.origin) {
    if (isApiRequest(url)) return; // 让浏览器直接走网络
    return;
  }

  // API: 直接网络
  if (isApiRequest(url)) return;

  // 资源: stale-while-revalidate
  if (isAssetRequest(request, url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 文档 (navigate 请求): network-first，离线回落 shell
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (_err) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(request)) || (await cache.match('/driver/login'));
          if (cached) return cached;
          return new Response('离线且无缓存', { status: 503, statusText: 'Offline' });
        }
      })()
    );
  }
});
