/**
 * CODEC POS v2.0 - Backend Server
 * Servidor Node.js que se ejecuta en segundo plano
 * 
 * Puerto: 3969
 * Base de datos: %APPDATA%/CodecPOS/data.db
 * WebSocket: ws://localhost:3969 (Codec Verify)
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3969;
const DB_PATH = process.env.DB_PATH || path.join(process.env.APPDATA || '/tmp', 'CodecPOS', 'data.db');

// Crear servidor HTTP
const server = createServer(app);

// ============================================
// WEBSOCKET SERVER PARA CODEC VERIFY
// ============================================
const wss = new WebSocketServer({ server, path: '/ws' });

// Clientes conectados (dispositivos móviles con Codec Verify)
const codecVerifyClients = new Set();

wss.on('connection', (ws, req) => {
  console.log('📱 Nuevo cliente Codec Verify conectado');
  codecVerifyClients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 Mensaje recibido:', data);

      // Responder al cliente
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }

      if (data.type === 'auth') {
        ws.send(JSON.stringify({ 
          type: 'auth_success', 
          message: 'Autenticado correctamente',
          posId: 'POS-001'
        }));
      }
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
    }
  });

  ws.on('close', () => {
    console.log('📱 Cliente Codec Verify desconectado');
    codecVerifyClients.delete(ws);
  });

  // Enviar estado inicial
  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'Conectado a CODEC POS',
    timestamp: Date.now()
  }));
});

// Función para notificar a todos los clientes de Codec Verify
function notifyCodecVerifyClients(data) {
  const message = JSON.stringify(data);
  codecVerifyClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
  console.log(`📢 Notificación enviada a ${codecVerifyClients.size} clientes`);
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// BASE DE DATOS LOCAL (JSON)
// ============================================
class LocalDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (error) {
      console.error('Error al cargar DB:', error);
    }
    return {
      ventas: [],
      productos: [],
      usuarios: [],
      configuracion: {},
      cola_sync: [], // Ventas pendientes de sincronizar
    };
  }

  saveData() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      console.log('✅ Datos guardados');
      return true;
    } catch (error) {
      console.error('❌ Error al guardar DB:', error);
      return false;
    }
  }

  // CRUD genérico
  get(collection, id) {
    return this.data[collection]?.find(item => item.id === id);
  }

  getAll(collection) {
    return this.data[collection] || [];
  }

  add(collection, item) {
    if (!this.data[collection]) {
      this.data[collection] = [];
    }
    this.data[collection].push(item);
    return this.saveData();
  }

  update(collection, id, updates) {
    const index = this.data[collection]?.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data[collection][index] = { ...this.data[collection][index], ...updates };
      return this.saveData();
    }
    return false;
  }

  delete(collection, id) {
    const index = this.data[collection]?.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data[collection].splice(index, 1);
      return this.saveData();
    }
    return false;
  }
}

const db = new LocalDatabase(DB_PATH);
console.log('💾 Base de datos cargada:', DB_PATH);

// ============================================
// RUTAS - SALUD DEL SERVIDOR
// ============================================
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'CODEC POS Backend v2.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    db_path: DB_PATH,
    ventas_count: db.getAll('ventas').length,
    productos_count: db.getAll('productos').length,
    codec_verify_clients: codecVerifyClients.size,
  });
});

// ============================================
// RUTAS - CODEC VERIFY
// ============================================
app.get('/api/codecverify/info', (req, res) => {
  res.json({
    success: true,
    ip: req.socket.localAddress,
    port: PORT,
    clients_connected: codecVerifyClients.size,
    websocket_url: `ws://localhost:${PORT}/ws`,
  });
});

app.post('/api/codecverify/test-notification', (req, res) => {
  const { monto, banco, remitente } = req.body;
  
  // Notificar a todos los clientes
  notifyCodecVerifyClients({
    type: 'pago_entrante',
    id: `pago_${Date.now()}`,
    monto: monto || 50000,
    banco: banco || 'nequi',
    remitente: remitente || 'Test User',
    timestamp: new Date().toISOString(),
  });

  res.json({ 
    success: true, 
    message: 'Notificación enviada',
    clients_notified: codecVerifyClients.size 
  });
});

// ============================================
// RUTAS - VENTAS
// ============================================
app.get('/api/ventas', (req, res) => {
  const ventas = db.getAll('ventas');
  res.json({ success: true, data: ventas });
});

app.post('/api/ventas', (req, res) => {
  const venta = {
    ...req.body,
    id: `venta_${Date.now()}`,
    fecha: new Date().toISOString(),
    sincronizado: false,
  };
  
  const success = db.add('ventas', venta);
  
  // Agregar a cola de sincronización
  db.add('cola_sync', { tipo: 'venta', data: venta });
  
  // NOTIFICAR A CODEC VERIFY
  notifyCodecVerifyClients({
    type: 'venta_nueva',
    venta: venta,
    timestamp: Date.now(),
  });
  
  res.json({ success, data: venta });
});

// ============================================
// RUTAS - SIMULAR PAGO ENTRANTE
// ============================================
app.post('/api/codecverify/simular-pago', (req, res) => {
  const { monto, banco, remitente } = req.body;
  
  const bancos = ['nequi', 'daviplata', 'bancolombia', 'dale'];
  const remitentes = ['Juan Pérez', 'María García', 'Carlos López', 'Ana Martínez'];
  
  const pago = {
    id: `pago_${Date.now()}`,
    monto: monto || Math.floor(Math.random() * 500000) + 10000,
    banco: banco || bancos[Math.floor(Math.random() * bancos.length)],
    remitente: remitente || remitentes[Math.floor(Math.random() * remitentes.length)],
    timestamp: new Date().toLocaleTimeString('es-CO'),
  };
  
  // Notificar a todos los clientes POS
  notifyCodecVerifyClients({
    type: 'pago_entrante',
    ...pago,
  });
  
  console.log('💰 Pago simulado:', pago);
  
  res.json({ success: true, pago });
});

// ============================================
// RUTAS - PRODUCTOS
// ============================================
app.get('/api/productos', (req, res) => {
  const productos = db.getAll('productos');
  res.json({ success: true, data: productos });
});

app.post('/api/productos', (req, res) => {
  const producto = {
    ...req.body,
    id: `prod_${Date.now()}`,
  };
  
  const success = db.add('productos', producto);
  res.json({ success, data: producto });
});

// ============================================
// RUTAS - SINCRONIZACIÓN
// ============================================
app.get('/api/sync/pending', (req, res) => {
  const pendientes = db.getAll('cola_sync');
  res.json({ 
    success: true, 
    count: pendientes.length,
    data: pendientes 
  });
});

app.post('/api/sync/execute', async (req, res) => {
  console.log('🔄 Ejecutando sincronización...');
  
  const pendientes = db.getAll('cola_sync');
  
  // Simular sincronización con Caja Maestra
  try {
    // TODO: Implementar lógica real de sincronización
    // const response = await fetch('http://caja-maestra.local:3969/api/sync', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ data: pendientes })
    // });
    
    // Por ahora, marcar como sincronizado localmente
    pendientes.forEach(item => {
      if (item.tipo === 'venta') {
        const venta = db.get('ventas', item.data.id);
        if (venta) {
          db.update('ventas', venta.id, { sincronizado: true });
        }
      }
    });
    
    // Limpiar cola
    db.data.cola_sync = [];
    db.saveData();
    
    res.json({ 
      success: true, 
      message: `${pendientes.length} elementos sincronizados` 
    });
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// RUTAS - HARDWARE
// ============================================
app.post('/api/hardware/print', (req, res) => {
  const { tipo, datos } = req.body;
  
  console.log(`🖨️ Imprimiendo ${tipo}:`, datos);
  
  // TODO: Implementar comunicación con impresora térmica vía SerialPort
  
  res.json({ 
    success: true, 
    message: 'Impresión enviada' 
  });
});

app.post('/api/hardware/scale', (req, res) => {
  console.log('⚖️ Leyendo báscula...');
  
  // TODO: Implementar lectura de báscula vía SerialPort
  
  res.json({ 
    success: true, 
    peso: 0.0 
  });
});

// ============================================
// MANEJO DE ERRORES
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message 
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
server.listen(PORT, '127.0.0.1', () => {
  console.log('==========================================');
  console.log('🚀 CODEC POS Backend Server');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`💾 Base de datos: ${DB_PATH}`);
  console.log('✅ Servidor iniciado correctamente');
  console.log('==========================================');
});

// Manejo de cierre limpio
process.on('SIGTERM', () => {
  console.log('⏹️ Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⏹️ Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

export default app;