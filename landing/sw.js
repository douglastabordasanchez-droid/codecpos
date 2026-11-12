// La app del celular vivió en la raíz del dominio antes de pasar a /app/.
// Los celulares que la instalaron entonces siguen con este service worker
// registrado; cuando /sw.js daba 404 el navegador lo dejaba activo para
// siempre. Este archivo lo reemplaza, borra su caché y se desinstala.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => !k.includes('/app/')).map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
