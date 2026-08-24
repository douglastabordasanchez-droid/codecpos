# 🔌 SERVIDOR WEBSOCKET - CODEC VERIFY

## 🎯 IMPLEMENTACIÓN DEL SERVIDOR PARA NOTIFICACIONES

Este documento detalla cómo implementar el servidor WebSocket en Supabase Edge Functions para que la app móvil CODEC VERIFY envíe notificaciones de pago al POS en tiempo real.

---

## 📁 ESTRUCTURA DEL SERVIDOR ACTUAL

```
/supabase/functions/server/
├── index.tsx                 # Servidor principal Hono
├── kv_store.tsx             # Utilidades de KV storage
└── codec_verify.tsx         # ✅ Ya implementado (PIN, token, dashboard)
```

---

## 🔧 CÓDIGO A AGREGAR EN `index.tsx`

### **1. Importar Socket.io**

Agregar al inicio de `/supabase/functions/server/index.tsx`:

```typescript
import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { Server as SocketIOServer } from 'npm:socket.io@4';
import * as codecVerify from './codec_verify.tsx';
import * as kv from './kv_store.tsx';

const app = new Hono();

// CORS abierto
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.use('*', logger(console.log));
```

---

### **2. Configurar Socket.io Server**

Agregar después de las rutas HTTP:

```typescript
// ============================================================================
// WEBSOCKET SERVER PARA CODEC VERIFY
// ============================================================================

// Almacén en memoria para conexiones activas
const activeConnections = new Map<string, any>();

// Función para inicializar Socket.io
function setupSocketIO(server: any) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', async (socket) => {
    console.log('🔌 Nueva conexión WebSocket:', socket.id);

    // Autenticar conexión
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.error('❌ Conexión sin token rechazada');
      socket.disconnect();
      return;
    }

    // Validar token de Codec Verify
    const isValid = await codecVerify.validarTokenCodecVerify(token);
    
    if (!isValid) {
      console.error('❌ Token inválido rechazado');
      socket.disconnect();
      return;
    }

    console.log('✅ Token válido, conexión autenticada');
    
    // Guardar conexión activa
    activeConnections.set(socket.id, {
      token: token,
      connectedAt: Date.now(),
    });

    // ========================================================================
    // EVENTO: payment:notification (App Móvil → POS)
    // ========================================================================
    socket.on('payment:notification', async (payment, callback) => {
      console.log('💰 Notificación de pago recibida:', payment);

      try {
        // Validar datos del pago
        if (!payment.monto || !payment.banco || !payment.remitente) {
          console.error('❌ Datos de pago incompletos');
          callback({ success: false, error: 'Datos incompletos' });
          return;
        }

        // Guardar notificación en KV store para historial
        const notificationKey = `codecverify:notification:${payment.id}`;
        await kv.set(notificationKey, {
          ...payment,
          receivedAt: new Date().toISOString(),
          status: 'pending',
        });

        // Broadcast a TODOS los clientes POS conectados
        io.emit('payment:incoming', payment);

        console.log('✅ Notificación enviada a POS');
        callback({ success: true });

        // Guardar en historial del día
        const today = new Date().toISOString().split('T')[0];
        const historyKey = `codecverify:history:${today}:${payment.id}`;
        await kv.set(historyKey, payment);

      } catch (error) {
        console.error('❌ Error procesando notificación:', error);
        callback({ success: false, error: 'Error interno del servidor' });
      }
    });

    // ========================================================================
    // EVENTO: payment:confirmed (POS → App Móvil)
    // ========================================================================
    socket.on('payment:confirmed', async (paymentId, callback) => {
      console.log('✅ Pago confirmado por POS:', paymentId);

      try {
        // Actualizar estado en KV store
        const notificationKey = `codecverify:notification:${paymentId}`;
        const notification = await kv.get(notificationKey);

        if (notification) {
          await kv.set(notificationKey, {
            ...notification,
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
          });
        }

        // Notificar a la app móvil
        io.emit('payment:status', {
          id: paymentId,
          status: 'confirmed',
        });

        callback({ success: true });
      } catch (error) {
        console.error('❌ Error confirmando pago:', error);
        callback({ success: false, error: 'Error interno' });
      }
    });

    // ========================================================================
    // EVENTO: payment:discarded (POS → App Móvil)
    // ========================================================================
    socket.on('payment:discarded', async (paymentId, callback) => {
      console.log('🗑️ Pago descartado por POS:', paymentId);

      try {
        const notificationKey = `codecverify:notification:${paymentId}`;
        const notification = await kv.get(notificationKey);

        if (notification) {
          await kv.set(notificationKey, {
            ...notification,
            status: 'discarded',
            discardedAt: new Date().toISOString(),
          });
        }

        io.emit('payment:status', {
          id: paymentId,
          status: 'discarded',
        });

        callback({ success: true });
      } catch (error) {
        console.error('❌ Error descartando pago:', error);
        callback({ success: false, error: 'Error interno' });
      }
    });

    // ========================================================================
    // EVENTO: Desconexión
    // ========================================================================
    socket.on('disconnect', (reason) => {
      console.log('🔌 Cliente desconectado:', socket.id, 'Razón:', reason);
      activeConnections.delete(socket.id);
    });

    // Ping/Pong para mantener conexión viva
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  return io;
}
```

---

### **3. Rutas HTTP para Codec Verify**

Agregar estas rutas en el servidor HTTP:

```typescript
// ============================================================================
// RUTAS CODEC VERIFY
// ============================================================================

// Generar PIN para vincular app móvil
app.post('/make-server-3969f5dd/codecverify/generar-pin', async (c) => {
  try {
    const pin = await codecVerify.generarPIN();
    
    return c.json({
      success: true,
      pin: pin,
      expira: Date.now() + (10 * 60 * 1000), // 10 minutos
      mensaje: 'PIN generado exitosamente. Válido por 10 minutos.',
    });
  } catch (error) {
    console.error('❌ Error generando PIN:', error);
    return c.json({ success: false, error: 'Error interno' }, 500);
  }
});

// Validar PIN y generar token
app.post('/make-server-3969f5dd/codecverify/validar-pin', async (c) => {
  try {
    const { pin } = await c.req.json();

    if (!pin) {
      return c.json({
        success: false,
        valido: false,
        mensaje: 'PIN requerido',
      }, 400);
    }

    // Validar PIN
    const validacion = await codecVerify.validarPIN(pin);

    if (!validacion.valido) {
      return c.json({
        success: false,
        valido: false,
        mensaje: validacion.mensaje,
      });
    }

    // Marcar PIN como usado
    await codecVerify.marcarPINComoUsado(pin);

    // Generar token de autenticación
    const token = await codecVerify.generarTokenCodecVerify();

    return c.json({
      success: true,
      valido: true,
      token: token,
      mensaje: 'App vinculada exitosamente',
    });
  } catch (error) {
    console.error('❌ Error validando PIN:', error);
    return c.json({ success: false, error: 'Error interno' }, 500);
  }
});

// Obtener dashboard (requiere autenticación)
app.get('/make-server-3969f5dd/codecverify/dashboard', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({ success: false, error: 'No autenticado' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const isValid = await codecVerify.validarTokenCodecVerify(token);

    if (!isValid) {
      return c.json({ success: false, error: 'Token inválido' }, 401);
    }

    const dashboard = await codecVerify.obtenerDashboard();
    const negocio = await codecVerify.obtenerDatosNegocio();

    return c.json({
      success: true,
      negocio: negocio,
      dashboard: dashboard,
    });
  } catch (error) {
    console.error('❌ Error obteniendo dashboard:', error);
    return c.json({ success: false, error: 'Error interno' }, 500);
  }
});

// Obtener historial de notificaciones
app.get('/make-server-3969f5dd/codecverify/historial', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({ success: false, error: 'No autenticado' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const isValid = await codecVerify.validarTokenCodecVerify(token);

    if (!isValid) {
      return c.json({ success: false, error: 'Token inválido' }, 401);
    }

    // Obtener historial del día
    const today = new Date().toISOString().split('T')[0];
    const historial = await kv.getByPrefix(`codecverify:history:${today}`);

    const payments = historial.map((item: any) => item.value);

    return c.json({
      success: true,
      fecha: today,
      pagos: payments,
      total: payments.reduce((sum: number, p: any) => sum + (p.monto || 0), 0),
    });
  } catch (error) {
    console.error('❌ Error obteniendo historial:', error);
    return c.json({ success: false, error: 'Error interno' }, 500);
  }
});

// Desvincular token (logout de la app)
app.post('/make-server-3969f5dd/codecverify/desvincular', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({ success: false, error: 'No autenticado' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Eliminar token
    await kv.del(`codecverify:token:${token}`);

    return c.json({
      success: true,
      mensaje: 'App desvinculada exitosamente',
    });
  } catch (error) {
    console.error('❌ Error desvinculando:', error);
    return c.json({ success: false, error: 'Error interno' }, 500);
  }
});
```

---

### **4. Iniciar Servidor**

Al final del archivo `index.tsx`:

```typescript
// Iniciar servidor
const port = 8000;
console.log(`🚀 Servidor iniciando en puerto ${port}...`);

Deno.serve({
  port: port,
  handler: app.fetch,
  onListen: ({ hostname, port }) => {
    console.log(`✅ Servidor escuchando en http://${hostname}:${port}`);
    console.log(`✅ WebSocket disponible en ws://${hostname}:${port}`);
  },
});
```

---

## 📊 FLUJO COMPLETO DE NOTIFICACIONES

### **Diagrama de Secuencia**

```
App Móvil                WebSocket Server              POS Desktop
    |                           |                            |
    |  1. Connect WS            |                            |
    |---------------------------->                            |
    |  (auth: token)            |                            |
    |                           |                            |
    |  2. SMS Recibido          |                            |
    |  "Nequi: $50,000"         |                            |
    |                           |                            |
    |  3. payment:notification  |                            |
    |---------------------------->                            |
    |  {monto, banco, nombre}   |                            |
    |                           |                            |
    |                           |  4. payment:incoming       |
    |                           |--------------------------->|
    |                           |                            |
    |                           |  5. Mostrar Alerta Modal   |
    |                           |                            |
    |                           |  6. Cajero acepta          |
    |                           |                            |
    |                           |  7. payment:confirmed      |
    |                           |<---------------------------|
    |                           |                            |
    |  8. payment:status        |                            |
    |<----------------------------|                            |
    |  {id, status:confirmed}   |                            |
    |                           |                            |
    |  9. Mostrar ✅            |                            |
```

---

## 🧪 TESTING DEL SERVIDOR

### **1. Test de Generación de PIN**

```bash
curl -X POST http://localhost:8000/make-server-3969f5dd/codecverify/generar-pin
```

**Respuesta Esperada**:
```json
{
  "success": true,
  "pin": "482917",
  "expira": 1234567890000,
  "mensaje": "PIN generado exitosamente. Válido por 10 minutos."
}
```

---

### **2. Test de Validación de PIN**

```bash
curl -X POST http://localhost:8000/make-server-3969f5dd/codecverify/validar-pin \
  -H "Content-Type: application/json" \
  -d '{"pin":"482917"}'
```

**Respuesta Esperada**:
```json
{
  "success": true,
  "valido": true,
  "token": "cv_1708650000000_abc123xyz789",
  "mensaje": "App vinculada exitosamente"
}
```

---

### **3. Test de Dashboard**

```bash
curl -X GET http://localhost:8000/make-server-3969f5dd/codecverify/dashboard \
  -H "Authorization: Bearer cv_1708650000000_abc123xyz789"
```

**Respuesta Esperada**:
```json
{
  "success": true,
  "negocio": {
    "nombre": "CODEC POS v2.0",
    "nit": "900123456-7",
    "direccion": "Calle 123 #45-67, Bogotá",
    "telefono": "+57 300 123 4567"
  },
  "dashboard": {
    "ventasHoy": 450000,
    "ventasMes": 12000000,
    "productosVendidos": 145,
    "bajoStock": 8
  }
}
```

---

### **4. Test de WebSocket (Node.js)**

```javascript
const io = require('socket.io-client');

const socket = io('ws://localhost:8000', {
  auth: {
    token: 'cv_1708650000000_abc123xyz789'
  },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Conectado al servidor');
  
  // Simular notificación de pago
  socket.emit('payment:notification', {
    id: 'test-001',
    monto: 50000,
    banco: 'nequi',
    remitente: 'Juan Pérez',
    timestamp: new Date().toLocaleTimeString('es-CO')
  }, (response) => {
    console.log('Respuesta del servidor:', response);
  });
});

socket.on('payment:incoming', (payment) => {
  console.log('💰 Pago recibido en POS:', payment);
});

socket.on('disconnect', () => {
  console.log('🔌 Desconectado');
});
```

---

## 🔒 SEGURIDAD DEL SERVIDOR

### **1. Validación de Token en Cada Evento**

```typescript
socket.on('payment:notification', async (payment, callback) => {
  // Obtener token de esta conexión
  const connection = activeConnections.get(socket.id);
  
  if (!connection) {
    callback({ success: false, error: 'No autenticado' });
    return;
  }
  
  // Re-validar token (por si expiró)
  const isValid = await codecVerify.validarTokenCodecVerify(connection.token);
  
  if (!isValid) {
    callback({ success: false, error: 'Token expirado' });
    socket.disconnect();
    return;
  }
  
  // Procesar notificación...
});
```

---

### **2. Rate Limiting**

```typescript
const rateLimits = new Map<string, number[]>();

function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const requests = rateLimits.get(socketId) || [];
  
  // Limpiar requests antiguos (> 1 minuto)
  const recentRequests = requests.filter(time => now - time < 60000);
  
  // Máximo 60 notificaciones por minuto
  if (recentRequests.length >= 60) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimits.set(socketId, recentRequests);
  
  return true;
}

socket.on('payment:notification', async (payment, callback) => {
  if (!checkRateLimit(socket.id)) {
    callback({ success: false, error: 'Rate limit excedido' });
    return;
  }
  
  // Procesar...
});
```

---

### **3. Validación de Datos**

```typescript
function validatePayment(payment: any): boolean {
  if (!payment.id || typeof payment.id !== 'string') return false;
  if (!payment.monto || typeof payment.monto !== 'number') return false;
  if (payment.monto <= 0 || payment.monto > 100000000) return false; // Máx 100M
  if (!payment.banco || typeof payment.banco !== 'string') return false;
  if (!payment.remitente || typeof payment.remitente !== 'string') return false;
  if (!payment.timestamp || typeof payment.timestamp !== 'string') return false;
  
  return true;
}

socket.on('payment:notification', async (payment, callback) => {
  if (!validatePayment(payment)) {
    callback({ success: false, error: 'Datos inválidos' });
    return;
  }
  
  // Procesar...
});
```

---

## 📈 MONITOREO Y LOGS

### **Logs Estructurados**

```typescript
function logPayment(action: string, payment: any, socketId: string) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    action: action,
    socketId: socketId,
    paymentId: payment.id,
    amount: payment.monto,
    bank: payment.banco,
  }));
}

socket.on('payment:notification', async (payment, callback) => {
  logPayment('notification_received', payment, socket.id);
  
  // Procesar...
  
  logPayment('notification_sent_to_pos', payment, socket.id);
});
```

---

### **Métricas en Tiempo Real**

```typescript
const metrics = {
  totalConnections: 0,
  totalNotifications: 0,
  totalConfirmed: 0,
  totalDiscarded: 0,
  averageResponseTime: 0,
};

io.on('connection', (socket) => {
  metrics.totalConnections++;
  
  socket.on('payment:notification', async (payment, callback) => {
    const startTime = Date.now();
    metrics.totalNotifications++;
    
    // Procesar...
    
    const responseTime = Date.now() - startTime;
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.totalNotifications - 1) + responseTime) 
      / metrics.totalNotifications;
  });
});

// Endpoint para ver métricas
app.get('/make-server-3969f5dd/codecverify/metrics', (c) => {
  return c.json(metrics);
});
```

---

## 🚀 DEPLOY EN SUPABASE

### **1. Configurar Variables de Entorno**

En Supabase Dashboard:
- Settings → Edge Functions → Environment Variables

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

### **2. Deploy de la Edge Function**

```bash
supabase functions deploy server --no-verify-jwt
```

---

### **3. Verificar Deploy**

```bash
curl https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-3969f5dd/codecverify/generar-pin \
  -X POST
```

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

- [ ] Importar Socket.io en `index.tsx`
- [ ] Implementar función `setupSocketIO()`
- [ ] Agregar rutas HTTP de Codec Verify
- [ ] Implementar autenticación de WebSocket
- [ ] Implementar evento `payment:notification`
- [ ] Implementar evento `payment:confirmed`
- [ ] Implementar evento `payment:discarded`
- [ ] Agregar validación de datos
- [ ] Agregar rate limiting
- [ ] Agregar logs estructurados
- [ ] Testing local completo
- [ ] Deploy en Supabase
- [ ] Testing en producción

---

## 🎉 RESULTADO FINAL

Con esta implementación tendrás:

✅ **WebSocket Server** completo y funcional  
✅ **Autenticación segura** con tokens  
✅ **Notificaciones en tiempo real** App → POS  
✅ **Confirmaciones bidireccionales** POS ↔ App  
✅ **Rate limiting** para evitar spam  
✅ **Validación robusta** de datos  
✅ **Logs estructurados** para debugging  
✅ **Métricas en tiempo real**  
✅ **100% compatible** con CODEC POS v2.0  

**Estado**: ✅ **LISTO PARA INTEGRACIÓN**

---

**CODEC VERIFY SERVER** - Sistema de Notificaciones en Tiempo Real 🚀🔌
