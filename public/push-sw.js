/* Notificaciones push de Codec Verify (pagos recibidos).
 * Lo carga el service worker de la app (vite.config.pwa.ts → workbox.importScripts).
 * Funciona aunque la app esté cerrada: en Android, en computador y en iPhone
 * con la app agregada a la pantalla de inicio (iOS 16.4 o superior).
 * El servidor que envía es la Edge Function `push-pago`.
 */
self.addEventListener('push', (event) => {
  let datos = {};
  try { datos = event.data ? event.data.json() : {}; } catch (e) { datos = { titulo: 'Codec POS', cuerpo: event.data ? event.data.text() : '' }; }

  const titulo = datos.titulo || 'Pago recibido';
  const opciones = {
    body: datos.cuerpo || 'Codec Verify registró un pago.',
    icon: '/app/logo.png',
    badge: '/app/logo.png',
    tag: datos.id ? `pago-${datos.id}` : undefined,
    renotify: true,
    requireInteraction: true,
    vibrate: [450, 150, 450, 150, 700],
    data: { url: datos.url || '/app/pagos', pago: datos },
  };

  event.waitUntil((async () => {
    // Si la app está abierta, también se le pasa el pago para que abra su ventana y diga el monto.
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) v.postMessage({ tipo: 'codecverify-pago', pago: datos });
    // Siempre se muestra la notificación: el iPhone exige mostrar una por cada push.
    await self.registration.showNotification(titulo, opciones);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/app/pagos';
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find((v) => v.url.includes('/app/'));
    if (abierta) {
      await abierta.focus();
      abierta.postMessage({ tipo: 'codecverify-abrir', url: destino, pago: event.notification.data && event.notification.data.pago });
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
