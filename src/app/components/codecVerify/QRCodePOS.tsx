import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { QrCode, Copy, CheckCircle2, RefreshCw, Wifi, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import QRCodeGenerator from 'qrcode';

interface ConnectionData {
  type: 'codec_verify_connection';
  version: '1.0';
  terminalId: string;
  ipAddress: string;
  port: number;
  protocol: 'http' | 'https';
  timestamp: number;
  terminalName: string;
}

export function QRCodePOS() {
  const [ipLocal, setIpLocal] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [qrDataURL, setQrDataURL] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null);
  const [canal, setCanal] = useState<'wifi' | 'nube'>('wifi');

  // Detectar IP local
  useEffect(() => {
    const detectarIP = async () => {
      try {
        // Intenta obtener la IP desde el backend de Electron si está disponible
        if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
          // En producción, esto vendría del IPC de Electron
          const ip = await fetch('http://127.0.0.1:3969/api/network/local-ip')
            .then(res => res.json())
            .then(data => data.ip)
            .catch(() => null);
          
          if (ip) {
            setIpLocal(`${ip}:4000`);
            return;
          }
        }

        // Fallback: simular detección de IP local
        // En producción real, esto vendría del backend
        const ip = '192.168.1.105:4000';
        setIpLocal(ip);
      } catch (error) {
        console.error('Error al detectar IP:', error);
        setIpLocal('192.168.1.105:4000');
      }
    };

    detectarIP();
  }, []);

  // Generar datos de conexión
  useEffect(() => {
    if (!ipLocal) return;

    const [ip, portStr] = ipLocal.split(':');
    const port = parseInt(portStr || '4000', 10);

    const data: ConnectionData = {
      type: 'codec_verify_connection',
      version: '1.0',
      terminalId: 'POS-001',
      ipAddress: ip,
      port: port,
      protocol: 'http',
      timestamp: Date.now(),
      terminalName: 'Terminal Principal'
    };

    setConnectionData(data);
  }, [ipLocal]);

  // Generar QR Code
  useEffect(() => {
    if (!connectionData) return;

    const generateQR = async () => {
      try {
        // Convertir datos a JSON
        const jsonData = JSON.stringify(connectionData);

        // Generar QR Code como Data URL
        const dataUrl = await QRCodeGenerator.toDataURL(jsonData, {
          width: 300,
          margin: 2,
          color: {
            dark: '#1f2937',  // Color oscuro (casi negro)
            light: '#ffffff'  // Fondo blanco
          },
          errorCorrectionLevel: 'H' // Alta corrección de errores
        });

        setQrDataURL(dataUrl);
      } catch (error) {
        console.error('Error al generar QR:', error);
        toast.error('Error al generar código QR');
      }
    };

    generateQR();
  }, [connectionData]);

  const copiarIP = () => {
    navigator.clipboard.writeText(ipLocal);
    setCopiado(true);
    toast.success('IP copiada al portapapeles');
    setTimeout(() => setCopiado(false), 2000);
  };

  const regenerarIP = () => {
    // Simular regeneración de IP (en producción esto redetectaría la IP real)
    const random = Math.floor(Math.random() * 255);
    setIpLocal(`192.168.1.${random}:4000`);
    toast.info('IP actualizada');
  };

  const copiarDatosConexion = () => {
    if (!connectionData) return;
    
    const texto = JSON.stringify(connectionData, null, 2);
    navigator.clipboard.writeText(texto);
    toast.success('Datos de conexión copiados');
  };

  return (
    <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-purple-400" />
            <CardTitle className="text-white">
              Sincronización con POS
            </CardTitle>
          </div>
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <Server className="w-3 h-3 mr-1" />
            Activo
          </Badge>
        </div>
        <CardDescription className="text-purple-300">
          Escanea el código QR del terminal de venta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selector de Canal */}
        <div className="grid grid-cols-2 gap-2 p-2 bg-slate-800/50 rounded-lg">
          <button
            onClick={() => setCanal('wifi')}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
              canal === 'wifi'
                ? 'bg-green-600 text-white shadow-lg scale-105'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Wifi className="w-4 h-4" />
            WiFi Local
            {canal === 'wifi' && (
              <span className="text-xs">(Prioritario)</span>
            )}
          </button>
          <button
            onClick={() => setCanal('nube')}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
              canal === 'nube'
                ? 'bg-blue-600 text-white shadow-lg scale-105'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Server className="w-4 h-4" />
            Nube/Datos
            {canal === 'nube' && (
              <span className="text-xs">(Remoto)</span>
            )}
          </button>
        </div>

        {/* QR Code Real */}
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs mx-auto bg-white rounded-2xl p-6 shadow-2xl"
          >
            {qrDataURL ? (
              <img 
                src={qrDataURL} 
                alt="QR Code de Conexión"
                className="w-full h-auto rounded-lg"
              />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center">
                <div className="text-center">
                  <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Generando código QR...</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Efecto de brillo */}
          <motion.div
            animate={{
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
            }}
            className="absolute inset-0 bg-purple-500/20 rounded-2xl blur-xl -z-10"
          />
        </div>

        {/* IP Local */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-400 text-xs">
              {canal === 'wifi' ? '📡 IP Local del Terminal:' : '☁️ Dirección Cloud:'}
            </p>
            <Button
              onClick={copiarDatosConexion}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
            >
              <Copy className="w-3 h-3 mr-1" />
              Copiar JSON
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-white font-mono text-base bg-slate-900 px-3 py-2.5 rounded">
              {canal === 'wifi' 
                ? (ipLocal || 'Detectando...')
                : 'codecverify.cloud/pos-001'
              }
            </code>
            <Button
              onClick={copiarIP}
              size="sm"
              variant="outline"
              className="border-slate-600"
            >
              {copiado ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Información de Conexión */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Terminal ID</p>
            <p className="text-sm font-mono font-bold text-white">
              {connectionData?.terminalId || 'POS-001'}
            </p>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Puerto</p>
            <p className="text-sm font-mono font-bold text-white">
              {connectionData?.port || '4000'}
            </p>
          </div>
        </div>

        {/* Instrucciones */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-blue-400 font-semibold mb-2">📱 Instrucciones:</p>
          <ol className="text-blue-300 text-sm space-y-1 list-decimal list-inside">
            <li>Abre Codec Verify en el celular de Eduardo</li>
            <li>Toca "Escanear Código QR"</li>
            <li>Apunta la cámara a este código</li>
            <li>Espera la confirmación de conexión ✓</li>
          </ol>
        </div>

        {/* Advertencia de Canal */}
        {canal === 'nube' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-amber-400 text-xs">
              ⚠️ <span className="font-semibold">Modo Remoto:</span> Requiere conexión a internet estable. 
              Se recomienda WiFi Local para mejor rendimiento.
            </p>
          </div>
        )}

        {/* Botón regenerar */}
        <Button
          onClick={regenerarIP}
          variant="outline"
          className="w-full border-slate-600 text-slate-300"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Regenerar Código QR
        </Button>
      </CardContent>
    </Card>
  );
}
