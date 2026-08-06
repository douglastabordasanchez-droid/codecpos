📋 Resumen técnico para el desarrollador de CODEC POS
🏗️ Qué es CODEC VERIFY 2.0
Es una PWA móvil en React + Tailwind CSS que funciona como app complementaria del software CODEC POS de escritorio. El usuario la instala en su celular (Android/iOS) como app desde el navegador, o la compila como APK con Android Studio (Capacitor).

🔌 Protocolo de conexión esperado (WebSocket)
La app intenta conectarse vía WebSocket al puerto 3969 de la IP configurada por el usuario:

ws://[IP_DEL_PC]:3969
Handshake de autenticación
App → Servidor POS (al conectar):

{ "tipo": "autenticar_app", "pin": "482756" }
Servidor POS → App (respuesta OK):

{ "tipo": "autenticacion_ok", "tienda": "Minimercado El Éxito" }
Servidor POS → App (respuesta error):

{ "tipo": "autenticacion_error", "mensaje": "PIN incorrecto o expirado" }
📡 Eventos que la app sabe recibir en tiempo real
El servidor POS debe emitir mensajes en este formato:

{
  "tipo": "evento_pos",
  "payload": {
    "evento": "[tipo_de_evento]",
    ...campos específicos
  }
}
evento en payload	Campos esperados	Para qué sirve
venta_completada	total, cajero, metodoPago, productos	Actualiza métricas, muestra notificación
pago_verificado	monto, banco, remitente, referencia	Notificación instantánea de pago SMS
stock_bajo	producto, stockActual, stockMinimo	Alerta de inventario
producto_vencido	producto, fechaVencimiento	Alerta de vencimiento
cierre_caja	cajero, totalEfectivo, totalDigital	Registro de cierre
devolucion_registrada	total, cajero, motivo	Registro de devolución
nuevo_cliente	nombre, telefono	Notificación de nuevo cliente
turno_abierto / turno_cerrado	cajero, hora	Control de turno
Ejemplo de pago verificado:

{
  "tipo": "evento_pos",
  "payload": {
    "evento": "pago_verificado",
    "banco": "nequi",
    "monto": 48700,
    "remitente": "3001234567",
    "referencia": "POS-1743782400"
  }
}
Los bancos soportados actualmente son: nequi, daviplata, bancolombia, bbva, davivienda, dale, efectivo.

🌐 API REST (fallback cuando no hay WebSocket)
Si el WebSocket no responde, la app cae automáticamente a peticiones REST HTTP. El servidor POS debe exponer:

Endpoint	Método	Descripción
/api/health	GET	Verificar que el servidor está vivo
/api/codec-verify/conectar	POST	Autenticar con PIN, devuelve token JWT
/api/dashboard	GET	Métricas del día
/api/ventas	GET	Lista de ventas recientes
/api/inventario	GET	Lista de productos con stock
/api/estadisticas	GET	Ventas por día, top productos
POST /api/codec-verify/conectar:

// Request
{ "pin": "482756" }

// Response OK
{
  "success": true,
  "token": "eyJ...",
  "datosNegocio": {
    "nombre": "Minimercado El Éxito",
    "nit": "900123456-7",
    "direccion": "Calle 123 #45-67",
    "telefono": "3001234567"
  }
}
🔐 Sistema de PIN
El PIN se genera desde el panel de administración del POS (sección "Codec Verify → Generar QR")
El PIN tiene 6 dígitos y según el UI actual se indica que expira en 10 minutos
El QR que escanea la app contiene JSON: { "ip": "192.168.1.100", "puerto": "3969", "pin": "482756" }
📱 Pantallas actuales de la app
Pantalla	Ruta	Estado
Login	/login	✅ Funcional (usuarios locales)
Conexión al POS	/conexion	✅ QR + Manual + Modo Demo
Dashboard	/dashboard	✅ Métricas + feed RT
Ventas	/ventas	✅ Lista con datos REST
Alertas	/alertas	✅ Notificaciones
Inventario	/inventario	✅ Productos con stock
Estadísticas	/estadisticas	✅ Gráficas
Perfil	/perfil	✅ Configuración de negocio
Panel Admin	/admin	✅ Solo usuario Admin
🚀 Mejoras sugeridas para la próxima iteración
Del lado del servidor POS (para el desarrollador de CODEC POS):

Implementar el servidor WebSocket en puerto 3969 con el protocolo de handshake descrito arriba
Generador de QR en el panel POS con JSON firmado + PIN temporal (10 min)
Broadcast de eventos a todos los dispositivos móviles conectados (múltiples cajeros)
Endpoint /api/health que devuelva { "ok": true, "version": "2.0" }
Detección SMS real en el PC servidor: interceptar mensajes de Nequi, DaviPlata, Bancolombia, BBVA, Davivienda y emitirlos como pago_verificado por WebSocket
Del lado de la app (mejoras pendientes):

Pantalla dedicada de pagos en tiempo real — feed filtrable por banco con totales del día
CODEC VERIFY modal mejorado — mostrar historial de pagos SMS detectados
Notificaciones push nativas cuando la app está en segundo plano (Service Worker)
Modo offline con sincronización — almacenar ventas localmente cuando no hay conexión y sincronizar al reconectar
Soporte WSS (WebSocket seguro) para conexiones fuera de la red local por internet