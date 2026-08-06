/**
 * Hook para conectar con Codec Verify vía WebSocket
 * Conexión en tiempo real con el servidor local puerto 3969
 * ⚡ OPTIMIZADO: Conexión lazy, sin loops, con cleanup perfecto
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface CodecVerifyMessage {
  type: string;
  [key: string]: any;
}

interface UseCodecVerifyWebSocketReturn {
  connected: boolean;
  lastMessage: CodecVerifyMessage | null;
  sendMessage: (message: CodecVerifyMessage) => void;
  connectionError: string | null;
  connect: () => void;      // ⚡ NUEVO: Conexión manual
  disconnect: () => void;   // ⚡ NUEVO: Desconexión manual
}

const WS_URL = 'ws://localhost:3969/ws';
const CONNECTION_TIMEOUT = 2000; // ⚡ 2 segundos (antes 3)
const HEARTBEAT_INTERVAL = 30000; // ⚡ Ping cada 30s para mantener viva

export function useCodecVerifyWebSocket(): UseCodecVerifyWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<CodecVerifyMessage | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false); // ⚡ NUEVO: Control de habilitación
  
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const connectionTimeoutRef = useRef<NodeJS.Timeout>();
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);

  // ⚡ VERIFICAR SI CODEC VERIFY ESTÁ HABILITADO
  useEffect(() => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const codecVerifyConfig = JSON.parse(localStorage.getItem('codecverify_config') || '{}');
      
      // Verificar si está habilitado globalmente Y el servidor está configurado
      const enabled = codecVerifyConfig.enabled === true && codecVerifyConfig.serverUrl;
      setIsEnabled(enabled);
      
      if (!enabled) {
        console.log('ℹ️ [CodecVerify] Deshabilitado o no configurado');
      }
    } catch (error) {
      console.error('❌ [CodecVerify] Error leyendo configuración:', error);
      setIsEnabled(false);
    }
  }, []);

  // ⚡ FUNCIÓN DE CONEXIÓN OPTIMIZADA
  const connect = useCallback(() => {
    // No conectar si ya estamos conectando o conectados
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // No conectar si no está habilitado
    if (!isEnabled) {
      return;
    }

    // No conectar si el componente fue desmontado
    if (!isMountedRef.current) {
      return;
    }

    try {
      isConnectingRef.current = true;
      
      const ws = new WebSocket(WS_URL);
      
      // ⚡ Timeout de conexión reducido
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          isConnectingRef.current = false;
          setConnectionError('Timeout de conexión');
        }
      }, CONNECTION_TIMEOUT);
      
      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }

        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }

        console.log('✅ [CodecVerify] WebSocket conectado');
        setConnected(true);
        setConnectionError(null);
        isConnectingRef.current = false;
        
        // ⚡ Iniciar heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (error) {
              console.error('❌ [CodecVerify] Error en heartbeat:', error);
            }
          }
        }, HEARTBEAT_INTERVAL);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;

        try {
          const message: CodecVerifyMessage = JSON.parse(event.data);
          
          // ⚡ Solo actualizar estado si no es pong
          if (message.type !== 'pong') {
            setLastMessage(message);
          }
        } catch (error) {
          console.error('❌ [CodecVerify] Error parseando mensaje:', error);
        }
      };

      ws.onerror = () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        isConnectingRef.current = false;
        setConnectionError('Error de conexión');
      };

      ws.onclose = () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        
        if (isMountedRef.current && connected) {
          console.log('📱 [CodecVerify] WebSocket desconectado');
        }
        
        setConnected(false);
        wsRef.current = null;
        isConnectingRef.current = false;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ [CodecVerify] Error creando WebSocket:', error);
      setConnectionError('Error al crear conexión');
      isConnectingRef.current = false;
    }
  }, [isEnabled, connected]);

  // ⚡ FUNCIÓN DE DESCONEXIÓN
  const disconnect = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    isConnectingRef.current = false;
  }, []);

  // ⚡ FUNCIÓN DE ENVÍO OPTIMIZADA
  const sendMessage = useCallback((message: CodecVerifyMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ [CodecVerify] Error enviando mensaje:', error);
      }
    }
  }, []);

  // ⚡ CLEANUP AL DESMONTAR
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    connected,
    lastMessage,
    sendMessage,
    connectionError,
    connect,      // ⚡ NUEVO
    disconnect,   // ⚡ NUEVO
  };
}