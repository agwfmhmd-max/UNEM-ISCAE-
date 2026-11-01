// UNEM ISCAE Service Worker
// ملاحظة: التطبيق يقرأ رقم الإصدار من CACHE_NAME لعرض رسالة التحديث المناسبة.
const CACHE_NAME = 'unem-iscae-v39';
const PRECACHE = ['/', '/manifest.json', '/icon-192.png'];

self.addEventListener('install', (event) => {
  // التخزين المسبق لا يجوز أن يؤخر تفعيل الـ Service Worker: على الشبكات البطيئة (iPhone/Samsung)
  // كان تحميل الصفحة الرئيسية الكبيرة يُبقي الـ SW في حالة installing فتفشل خدمة الإشعارات.
  const precache = caches.open(CACHE_NAME).then((cache) =>
    Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {})))
  ).catch(() => {});
  const cap = new Promise((resolve) => setTimeout(resolve, 3000));
  event.waitUntil(Promise.race([precache, cap]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) self.skipWaiting();
});

/* ===================== إشعارات Push حقيقية ====================== *
 * تصل هذه الأحداث من متصفح المستخدم حتى لو كان الموقع مغلقاً تماماً،
 * لأن Service Worker يبقى نشطاً في الخلفية طالما الاشتراك قائم.
 * ================================================================= */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'UNEM ISCAE', body: (event.data && event.data.text()) || '' };
  }

  const title = data.title || 'UNEM ISCAE';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || 'unem-iscae-notification',
    renotify: true,
    data: { url: data.url || '/' },
  };

  // إشعارات الرسائل/المنشورات العادية (quiet) لا تظهر إن كان التطبيق مفتوحًا أمام الطالب؛ الإشارات والإعلانات تظهر دائمًا.
  const show = async () => {
    if (data.quiet) {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((c) => c.visibilityState === 'visible')) return;
    }
    return self.registration.showNotification(title, options);
  };
  event.waitUntil(show());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
      for (const client of allClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // لا نخزن نداءات الـ API إطلاقاً
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
  );
});
