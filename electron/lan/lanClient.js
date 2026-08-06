// CODEC POS v2.0 — LAN Client (Modo Cajero/Operario)
// Descubrimiento automático via UDP + reconexión cada 5s sin bloquear la UI

import net from 'net';
import dgram from 'dgram';
import http from 'http';
import os from 'os';
import { EventEmitter } from 'events';

const PORT_TCP = 4000;
const PORT_UDP = 4001;
const HEARTBEAT_MS = 5000;
const RECONNECT_MS = 5000;
const CONNECT_TIMEOUT_MS = 10000;

class LanClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.udp = null;
    this.hbTimer = null;
    this.rcTimer = null;
    this.identity = null;
    this.serverIp = null;
    this.serverPort = PORT_TCP;
    this.running = false;
    this.connected = false;
    this.buf = '';
    this._connectingLock = false;
    this.httpPushServer = null;
    this.localPushPort = 4003;
  }

  get localIp() {
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const i of ifaces) {
        if (i.family === 'IPv4' && !i.internal) return i.address;
      }
    }
    return '127.0.0.1';
  }

  start(identity, serverIp = null) {
    if (this.running) return;
    this.identity = identity;
    this.serverIp = serverIp;
    this.running = true;

    this.startPushServer();

    if (serverIp) {
      this._connect(serverIp, PORT_TCP);
    } else {
      this._discover();
    }
  }

  stop() {
    this.running = false;
    this.connected = false;
    this._connectingLock = false;
    clearInterval(this.hbTimer);
    clearTimeout(this.rcTimer);
    this.hbTimer = null;
    this.rcTimer = null;
    this.stopPushServer();
    try { this.udp?.close(); } catch {}
    this.udp = null;
    try { this.socket?.destroy(); } catch {}
    this.socket = null;
    console.log('[LAN Client] Detenido.');
  }

  // ─── HTTP Push Server (recibe órdenes directas del admin) ────────────────────

  startPushServer() {
    if (this.httpPushServer) return;
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      let body = '';
      req.on('data', c => { body += c.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          this.emit('server-event', data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false }));
        }
      });
    });

    server.listen(this.localPushPort, '0.0.0.0', () => {
      console.log(`[LAN Client] HTTP push server escuchando en puerto ${this.localPushPort}`);
    });

    server.on('error', (err) => {
      console.warn('[LAN Client] HTTP push server error:', err.message);
      this.httpPushServer = null;
    });

    this.httpPushServer = server;
  }

  stopPushServer() {
    try { this.httpPushServer?.close(); } catch {}
    this.httpPushServer = null;
  }

  // Envía un evento al servidor (Admin)
  send(event) {
    try {
      if (this.socket?.writable && this.connected) {
        this.socket.write(JSON.stringify(event) + '\n');
      }
    } catch {}
  }

  // ─── Descubrimiento UDP ──────────────────────────────────────────────────────

  _discover() {
    this.emit('status', { state: 'discovering' });

    try {
      this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.udp.on('error', () => this._scheduleReconnect());

      this.udp.bind(PORT_UDP, () => {
        try { this.udp.setBroadcast(true); } catch {}
        console.log('[LAN Client] Escuchando UDP en puerto', PORT_UDP);
      });

      this.udp.on('message', (msg, rinfo) => {
        if (!this.running || this.connected || this._connectingLock) return;
        // Ignorar broadcast propio
        if (rinfo.address === this.localIp) return;
        try {
          const data = JSON.parse(msg.toString());
          if (data.type === 'CODECPOS_SERVER') {
            console.log(`[LAN Client] Servidor encontrado en ${rinfo.address}:${data.port}`);
            this.serverIp = rinfo.address;
            this.serverPort = data.port ?? PORT_TCP;
            // Cerrar UDP antes de conectar por TCP
            try { this.udp?.close(); } catch {}
            this.udp = null;
            this._connect(this.serverIp, this.serverPort);
          }
        } catch {}
      });
    } catch (e) {
      console.warn('[LAN Client] UDP no disponible:', e.message);
      this._scheduleReconnect();
    }
  }

  // ─── Conexión TCP ────────────────────────────────────────────────────────────

  _connect(ip, port) {
    if (!this.running || this.connected || this._connectingLock) return;
    this._connectingLock = true;

    this.emit('status', { state: 'connecting', serverIp: ip });
    this.socket = new net.Socket();
    this.buf = '';

    // Timeout de conexión
    const connectTimeout = setTimeout(() => {
      if (!this.connected) {
        this.socket?.destroy();
      }
    }, CONNECT_TIMEOUT_MS);

    this.socket.on('connect', () => {
      clearTimeout(connectTimeout);
      this._connectingLock = false;
      this.connected = true;
      console.log(`[LAN Client] Conectado al servidor ${ip}:${port}`);
      this.emit('status', { state: 'connected', serverIp: ip });

      // Anunciarse al servidor
      this.send({
        type: 'IDENTITY',
        terminalId: this.identity.terminalId,
        payload: {
          ...this.identity,
          cajeroIp: this.localIp,
          pushPort: this.localPushPort,
          connectedAt: new Date().toISOString(),
        },
      });

      // Heartbeat cada 5 segundos
      this.hbTimer = setInterval(() => {
        this.send({
          type: 'HEARTBEAT',
          terminalId: this.identity.terminalId,
          ts: Date.now(),
        });
      }, HEARTBEAT_MS);
    });

    this.socket.on('data', (chunk) => {
      this.buf += chunk.toString('utf8');
      const lines = this.buf.split('\n');
      this.buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { this._handlePacket(JSON.parse(line)); } catch {}
      }
    });

    this.socket.on('close', () => {
      clearTimeout(connectTimeout);
      this._onDisconnect();
    });

    this.socket.on('error', (err) => {
      clearTimeout(connectTimeout);
      console.warn('[LAN Client] Error socket:', err.message);
      this.socket?.destroy();
      this._onDisconnect();
    });

    this.socket.connect(port, ip);
  }

  _handlePacket(pkt) {
    switch (pkt.type) {
      case 'IDENTITY_ACK':
        console.log('[LAN Client] Identidad aceptada por el servidor');
        this.emit('identity-ack', pkt);
        break;
      case 'HEARTBEAT_ACK':
        // Conexión sana — no hacer nada
        break;
      case 'AUDIT_REQUEST':
        this.emit('audit-request', pkt);
        break;
      default:
        this.emit('server-event', pkt);
    }
  }

  _onDisconnect() {
    if (!this.running) return;
    this.connected = false;
    this._connectingLock = false;
    clearInterval(this.hbTimer);
    this.hbTimer = null;
    console.log('[LAN Client] Desconectado — reintentando en', RECONNECT_MS / 1000, 's...');
    this.emit('status', { state: 'disconnected' });
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    clearTimeout(this.rcTimer);
    this.rcTimer = setTimeout(() => {
      if (!this.running) return;
      if (this.serverIp) {
        this._connect(this.serverIp, this.serverPort);
      } else {
        this._discover();
      }
    }, RECONNECT_MS);
  }
}

export const lanClient = new LanClient();
