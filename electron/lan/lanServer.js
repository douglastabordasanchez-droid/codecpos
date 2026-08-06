// CODEC POS v2.0 — LAN Server (Modo Administrador)
// Protocolo: NDJSON sobre TCP (sin dependencias externas)
// Descubrimiento: UDP broadcast en puerto 4001
// Enrutamiento: por userId con cola offline para terminales desconectadas

import net from 'net';
import dgram from 'dgram';
import http from 'http';
import os from 'os';
import { EventEmitter } from 'events';
import bcrypt from 'bcryptjs';

// Las contraseñas en `authData` pueden llegar como hash bcrypt (instalaciones
// ya migradas) o, en cuentas legadas aún no logueadas una sola vez en su
// terminal de origen, como texto plano — soporta ambas.
function passwordCoincide(passwordPlano, almacenado) {
  if (!almacenado) return false;
  if (/^\$2[aby]?\$/.test(almacenado)) return bcrypt.compareSync(passwordPlano, almacenado);
  return passwordPlano === almacenado;
}

const PORT_TCP = 4000;
const PORT_UDP = 4001;
const PORT_HTTP = 4002; // API REST para tablets/dispositivos externos (comandas)
const MAX_QUEUE_PER_USER = 50;

class LanServer extends EventEmitter {
  constructor() {
    super();
    this.tcp              = null;
    this.udp              = null;
    this.udpTimer         = null;
    this.httpServer       = null; // API REST para tablets/dispositivos externos
    this.clients          = new Map(); // terminalId -> { socket, info, lastSeen }
    this.userToTerminal   = new Map(); // userId -> terminalId (lookup inverso para routing)
    this.pendingQueues    = new Map(); // userId -> LanEvent[] (cola offline)
    this.authData         = [];        // Lista de empleados del admin (sincronizada desde el renderer)
    this.activeTerminals  = new Map(); // ip -> { nombre, rol, username, loginAt, terminalId, hostname }
    this.running          = false;
  }

  get httpPort() { return PORT_HTTP; }

  get localIp() {
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const i of ifaces) {
        if (i.family === 'IPv4' && !i.internal) return i.address;
      }
    }
    return '127.0.0.1';
  }

  start() {
    if (this.running) return Promise.resolve({ ip: this.localIp, port: PORT_TCP });
    this.running = true;
    return new Promise((resolve, reject) => {
      this.tcp = net.createServer((s) => this._onSocket(s));
      this.tcp.on('error', (err) => {
        this.running = false;
        console.error('[LAN Server] Error TCP:', err.message);
        reject(err);
      });
      this.tcp.listen(PORT_TCP, '0.0.0.0', () => {
        console.log(`[LAN Server] Escuchando en ${this.localIp}:${PORT_TCP}`);
        this._startUDP();
        resolve({ ip: this.localIp, port: PORT_TCP });
      });
    });
  }

  stop() {
    this.running = false;
    clearInterval(this.udpTimer);
    this.udpTimer = null;
    this.stopHttp(); // Detener API REST junto con el TCP
    try { this.udp?.close(); } catch {}
    this.udp = null;
    this.clients.forEach(({ socket }) => { try { socket.destroy(); } catch {} });
    this.clients.clear();
    this.userToTerminal.clear();
    this.activeTerminals.clear();
    // Conservar pendingQueues: si el servidor reinicia, la cola sigue válida
    try { this.tcp?.close(); } catch {}
    this.tcp = null;
    console.log('[LAN Server] Detenido.');
  }

  // ─── Auth centralizado ───────────────────────────────────────────────────────

  /** Almacena la lista de empleados enviada por el renderer del Admin */
  setAuthData(employees) {
    this.authData = Array.isArray(employees) ? employees : [];
    console.log(`[LAN Auth] ${this.authData.length} empleado(s) disponibles para autenticación de red`);
  }

  /** Retorna las terminales autenticadas vía HTTP (antes de conectarse por TCP) */
  getActiveTerminals() {
    return [...this.activeTerminals.values()];
  }

  /** Verifica si un userId tiene socket TCP activo y escribible */
  isUserConnected(userId) {
    const terminalId = this.userToTerminal.get(userId);
    if (!terminalId) return false;
    const c = this.clients.get(terminalId);
    return !!(c?.socket?.writable);
  }

  /** Retorna la URL del HTTP push server del técnico si está conectado */
  getTechPushUrl(userId) {
    const terminalId = this.userToTerminal.get(userId);
    if (!terminalId) return null;
    const c = this.clients.get(terminalId);
    if (!c?.socket?.writable) return null;
    const ip = c.info?.cajeroIp;
    const port = c.info?.pushPort || 4003;
    if (!ip) return null;
    return `http://${ip}:${port}/`;
  }

  // ─── API REST (HTTP) para tablets y dispositivos externos ──────────────────

  startHttp() {
    if (this.httpServer) return Promise.resolve({ port: PORT_HTTP, ip: this.localIp });
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this._handleHttp(req, res));
      this.httpServer.on('error', (err) => {
        console.error('[LAN HTTP] Error:', err.message);
        this.httpServer = null;
        reject(err);
      });
      this.httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
        console.log(`[LAN HTTP] API REST activa en ${this.localIp}:${PORT_HTTP}`);
        resolve({ port: PORT_HTTP, ip: this.localIp });
      });
    });
  }

  stopHttp() {
    if (!this.httpServer) return;
    try { this.httpServer.close(); } catch {}
    this.httpServer = null;
    console.log('[LAN HTTP] Detenida.');
  }

  _handleHttp(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = (req.url ?? '/').split('?')[0];

    // GET /health — verificación de estado
    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, ip: this.localIp, tcp: PORT_TCP, http: PORT_HTTP, ts: Date.now() }));
      return;
    }

    // GET /terminals — lista de terminales conectadas
    if (req.method === 'GET' && url === '/terminals') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, terminals: this.getClients() }));
      return;
    }

    // POST /comanda — recibe una comanda desde tablet/mesero externo
    if (req.method === 'POST' && url === '/comanda') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const comanda = JSON.parse(body);
          if (!comanda.destino || !Array.isArray(comanda.items)) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'Faltan campos requeridos: destino, items' }));
            return;
          }
          const event = {
            type: 'COMANDA_NUEVA',
            terminalId: comanda.terminalId || `http_${Date.now()}`,
            cajeroNombre: comanda.meseroNombre || 'Tablet externo',
            cajeroIp: (req.socket?.remoteAddress ?? 'unknown').replace('::ffff:', ''),
            timestamp: new Date().toISOString(),
            payload: { ...comanda, comandaId: comanda.comandaId || `cmd_${Date.now()}` },
          };
          if (comanda.targetUserId) {
            this._routeToUser(comanda.targetUserId, event);
          } else {
            this.broadcast(event);
          }
          this.emit('event', event);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, comandaId: event.payload.comandaId }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
        }
      });
      return;
    }

    // POST /ping — diagnóstico de conectividad desde tablet
    if (req.method === 'POST' && url === '/ping') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, ts: Date.now(), ip: this.localIp }));
      return;
    }

    // POST /api/auth/network-login — autenticación centralizada desde terminales esclavas
    if (req.method === 'POST' && url === '/api/auth/network-login') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { usuario, password, terminalInfo } = JSON.parse(body);
          if (!usuario || !password) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'usuario y password son requeridos' }));
            return;
          }
          if (this.authData.length === 0) {
            res.writeHead(503);
            res.end(JSON.stringify({ ok: false, error: 'El servidor administrador aún no ha sincronizado los usuarios. Espera un momento.' }));
            return;
          }
          const empleado = this.authData.find(
            e => e.username === usuario.trim() && e.activo && passwordCoincide(password, e.password)
          );
          if (!empleado) {
            res.writeHead(401);
            res.end(JSON.stringify({ ok: false, error: 'Credenciales inválidas o usuario no autorizado en esta red' }));
            return;
          }
          const clientIp = (req.socket?.remoteAddress ?? 'unknown').replace('::ffff:', '');
          const terminal = {
            ip: clientIp,
            nombre: empleado.nombreCompleto,
            username: empleado.username,
            rol: empleado.rol,
            loginAt: new Date().toISOString(),
            terminalId: terminalInfo?.terminalId || `net_${Date.now()}`,
            hostname: terminalInfo?.hostname || '',
          };
          this.activeTerminals.set(clientIp, terminal);
          this.emit('event', {
            type: 'TERMINAL_AUTENTICADA',
            terminalId: terminal.terminalId,
            cajeroNombre: empleado.nombreCompleto,
            cajeroIp: clientIp,
            cajeroRol: empleado.rol,
            timestamp: terminal.loginAt,
            payload: terminal,
          });
          // Retornar usuario sin contraseña
          const { password: _pass, ...usuarioSeguro } = empleado;
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            usuario: usuarioSeguro,
            serverIp: this.localIp,
            sessionToken: `tok_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          }));
          console.log(`[LAN Auth] ✅ Login de red: ${empleado.nombreCompleto} (${empleado.rol}) desde ${clientIp}`);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
        }
      });
      return;
    }

    // GET /api/terminals/active — lista de terminales autenticadas vía red
    if (req.method === 'GET' && url === '/api/terminals/active') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, terminals: this.getActiveTerminals() }));
      return;
    }

    // POST /api/network/receive-file — transferencia de datos entre terminales POS
    if (req.method === 'POST' && url === '/api/network/receive-file') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const transfer = JSON.parse(body);
          if (!transfer.modulo || !transfer.tipo) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'Faltan campos: modulo, tipo' }));
            return;
          }
          const event = {
            type: 'TRANSFERENCIA_RECIBIDA',
            terminalId: transfer.origenTerminalId || `http_${Date.now()}`,
            cajeroNombre: transfer.origenNombre || 'Terminal externa',
            cajeroIp: (req.socket?.remoteAddress ?? 'unknown').replace('::ffff:', ''),
            timestamp: new Date().toISOString(),
            payload: transfer,
          };
          // Enrutar a usuario específico si viene targetUserId; si no, emitir al renderer del Admin
          if (transfer.targetUserId) {
            this._routeToUser(transfer.targetUserId, event);
          }
          this.emit('event', event);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, mensaje: `Transferencia recibida para módulo: ${transfer.modulo}` }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'Ruta no encontrada' }));
  }

  // ─── TCP ────────────────────────────────────────────────────────────────────

  _onSocket(socket) {
    let terminalId = null;
    let buf = '';

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { this._handlePacket(socket, JSON.parse(line), (id) => { terminalId = id; }); }
        catch { /* ignorar JSON malformado */ }
      }
    });

    socket.on('close', () => {
      if (!terminalId) return;
      const info = this.clients.get(terminalId)?.info ?? {};
      // Limpiar lookup userId → terminalId si apunta a esta terminal
      const userId = info.userId;
      if (userId && this.userToTerminal.get(userId) === terminalId) {
        this.userToTerminal.delete(userId);
      }
      this.clients.delete(terminalId);
      this.emit('disconnected', { terminalId, ...info });
      console.log(`[LAN Server] Terminal desconectada: ${terminalId} (${info.cajeroNombre || '?'})`);
    });

    socket.on('error', () => socket.destroy());
    socket.setTimeout(30000, () => {
      socket.destroy();
    });
  }

  _handlePacket(socket, pkt, setId) {
    switch (pkt.type) {
      case 'IDENTITY': {
        const id     = pkt.terminalId;
        const userId = pkt.payload?.userId;
        setId(id);
        this.clients.set(id, { socket, info: pkt.payload ?? {}, lastSeen: Date.now() });

        // Registrar lookup userId → terminalId y vaciar cola pendiente
        if (userId) {
          this.userToTerminal.set(userId, id);
          this._flushPendingQueue(userId, socket);
        }

        this._write(socket, { type: 'IDENTITY_ACK', serverIp: this.localIp, ts: Date.now() });
        this.emit('connected', { terminalId: id, ...(pkt.payload ?? {}) });
        console.log(`[LAN Server] Terminal conectada: ${id} (${pkt.payload?.cajeroNombre}) userId=${userId}`);
        break;
      }

      case 'HEARTBEAT': {
        const c = this.clients.get(pkt.terminalId);
        if (c) c.lastSeen = Date.now();
        this._write(socket, { type: 'HEARTBEAT_ACK', ts: Date.now() });
        break;
      }

      default:
        // Si el evento tiene destinatario explícito, enrutar; si no, emitir al contexto React local
        if (pkt.targetUserId) {
          this._routeToUser(pkt.targetUserId, pkt);
        } else {
          // Emitir al proceso renderer del Admin (MonitoreoTerminalesPage)
          this.emit('event', pkt);
          // Retransmitir eventos de broadcast a todas las terminales conectadas.
          // CAJA_CIERRE/CAJA_APERTURA/VENTA_NUEVA se suman aquí para que, con más
          // de un cajero conectado, el cierre de turno de uno se refleje también
          // en las demás terminales (antes solo llegaba al Admin).
          if (
            pkt.type === 'TALLER_ORDEN' ||
            pkt.type === 'TALLER_ORDEN_NUEVA' ||
            pkt.type === 'SINCRONIZAR_USUARIO' ||
            pkt.type === 'SINCRONIZAR_METODOS_PAGO' ||
            pkt.type === 'CAJA_CIERRE' ||
            pkt.type === 'CAJA_APERTURA' ||
            pkt.type === 'VENTA_NUEVA'
          ) {
            this.broadcast(pkt, pkt.terminalId); // skipId evita eco a quien lo envió
          }
        }
    }
  }

  _write(socket, data) {
    try { if (socket?.writable) socket.write(JSON.stringify(data) + '\n'); } catch {}
  }

  // ─── Routing dirigido por userId ─────────────────────────────────────────────

  /**
   * Envía `data` al socket del usuario `userId`.
   * Si el usuario está offline, encola el mensaje para entregarlo cuando conecte.
   */
  _routeToUser(userId, data) {
    const terminalId = this.userToTerminal.get(userId);
    if (terminalId) {
      const c = this.clients.get(terminalId);
      if (c?.socket?.writable) {
        this._write(c.socket, data);
        console.log(`[LAN Server] ${data.type} → userId=${userId} (${terminalId})`);
        return;
      }
    }

    // Usuario offline — encolar con límite de 50 mensajes por usuario
    if (!this.pendingQueues.has(userId)) {
      this.pendingQueues.set(userId, []);
    }
    const q = this.pendingQueues.get(userId);
    q.push(data);
    if (q.length > MAX_QUEUE_PER_USER) q.shift();
    console.log(`[LAN Server] userId=${userId} offline — ${data.type} encolado (${q.length} pendientes)`);
  }

  /**
   * Envía todos los mensajes pendientes de `userId` al socket recién conectado
   * y elimina la cola.
   */
  _flushPendingQueue(userId, socket) {
    const q = this.pendingQueues.get(userId);
    if (!q?.length) return;
    console.log(`[LAN Server] Vaciando cola de ${q.length} mensajes para userId=${userId}`);
    for (const pkt of q) {
      this._write(socket, pkt);
    }
    this.pendingQueues.delete(userId);
  }

  // ─── API pública ─────────────────────────────────────────────────────────────

  /**
   * Envía un evento dirigido a un usuario específico por userId.
   * Usado cuando el Admin (servidor) emite directamente a un técnico/cajero.
   * Si el usuario está offline, el mensaje queda en cola hasta que conecte.
   */
  routeToUser(userId, data) {
    this._routeToUser(userId, data);
  }

  sendTo(terminalId, data) {
    const c = this.clients.get(terminalId);
    if (c) this._write(c.socket, data);
  }

  broadcast(data, skipId = null) {
    const msg = JSON.stringify(data) + '\n';
    this.clients.forEach(({ socket }, id) => {
      if (id !== skipId) try { if (socket?.writable) socket.write(msg); } catch {}
    });
  }

  getClients() {
    return [...this.clients.entries()].map(([terminalId, { info, lastSeen }]) => ({
      terminalId, lastSeen, ...info,
    }));
  }

  getPendingQueueSizes() {
    const result = {};
    this.pendingQueues.forEach((q, userId) => { result[userId] = q.length; });
    return result;
  }

  // ─── UDP broadcast de descubrimiento ────────────────────────────────────────

  /** Calcula todas las direcciones de broadcast de las interfaces activas */
  _getSubnetBroadcasts() {
    const broadcasts = new Set();
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const ip   = iface.address.split('.').map(Number);
          const mask = iface.netmask.split('.').map(Number);
          const bcast = ip.map((b, i) => (b & mask[i]) | (~mask[i] & 0xFF));
          broadcasts.add(bcast.join('.'));
        }
      }
    }
    return [...broadcasts];
  }

  _startUDP() {
    try {
      this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.udp.on('error', () => {});

      this.udp.bind(0, () => {
        try { this.udp.setBroadcast(true); } catch {}

        const announce = () => {
          if (!this.running) return;
          const msg = Buffer.from(JSON.stringify({
            tipo: 'CODEC_POS_SERVER',
            type: 'CODECPOS_SERVER',
            port: PORT_TCP,
            ip:   this.localIp,
          }));

          // Broadcast limitado (alcanza la misma subred en la mayoría de routers)
          this.udp?.send(msg, PORT_UDP, '255.255.255.255', () => {});

          // Broadcast dirigido a cada subred de las interfaces activas
          // Esto mejora la detección cuando Admin y Trabajador están en rangos /24 distintos
          for (const addr of this._getSubnetBroadcasts()) {
            this.udp?.send(msg, PORT_UDP, addr, () => {});
          }
        };

        announce();
        this.udpTimer = setInterval(announce, 3000);
        console.log('[LAN Server] UDP broadcast activo en puerto', PORT_UDP,
          '→ subredes:', this._getSubnetBroadcasts().join(', '));
      });
    } catch (e) {
      console.warn('[LAN Server] UDP broadcast no disponible:', e.message);
    }
  }
}

export const lanServer = new LanServer();
