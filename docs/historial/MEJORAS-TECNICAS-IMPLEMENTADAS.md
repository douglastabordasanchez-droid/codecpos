# 🚀 CODEC POS v2.0 - Mejoras Técnicas Implementadas

## 📅 Fecha: 20 de Febrero, 2026
## 👥 Equipo: Jessica (Cajera) & Eduardo (Seguridad)

---

## ✅ ESTADO DE IMPLEMENTACIÓN

### 1. 💾 **SANEAMIENTO DEL ENTORNO Y PERSISTENCIA (.exe)**

#### ✅ Base de Datos Local (COMPLETADO)
**Estado:** Ya implementado con `electron-store` + IndexedDB

**Ubicación del código:**
- `/src/app/lib/electronStore.ts` - Servicio principal
- `/src/app/lib/indexedDB.ts` - Capa de persistencia

**Características:**
- ✅ Datos guardados en `%APPDATA%/codec-pos-2.0`
- ✅ Persistencia robusta (no se borran al reiniciar)
- ✅ Sincronización en tiempo real entre POS y Dashboard
- ✅ Listeners para actualizaciones automáticas

**Estructura de datos:**
```typescript
interface Venta {
  id: string;
  numero: number;
  fecha: string;
  items: VentaItem[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPago;
  pagoMixto?: PagoMixtoDetalle; // ✅ Para pagos distribuidos
  cajero: string;
  cajeroId: string;
  sincronizado: boolean;
  costoTotal?: number; // ✅ Para calcular utilidad
}
```

**Listener en tiempo real:**
```typescript
// En DashboardPOSPage.tsx
useEffect(() => {
  const handleVentaNueva = (nuevaVenta: Venta) => {
    console.log('💰 Nueva venta detectada:', nuevaVenta.id);
    cargarDatos(); // Recarga automática
  };

  electronStore.onVentaNueva(handleVentaNueva);
  return () => electronStore.offVentaNueva(handleVentaNueva);
}, []);
```

#### ⚠️ Renombrar Carpeta (MANUAL)
**Acción requerida:** Renombrar `Codec POS 2.0` → `pos2026`

**Razón:** Evitar errores de compilación con espacios en rutas

**Pasos:**
```bash
1. Cerrar VSCode y cualquier terminal abierta
2. Renombrar la carpeta raíz a "pos2026"
3. Reabrir VSCode en la nueva carpeta
4. Ejecutar: npm install (si es necesario)
```

#### ⚠️ Compilación de Drivers (DOCUMENTADO)
**Estado:** Requiere configuración manual en Windows

**Herramientas necesarias:**
```bash
# Instalar build tools de Windows
npm install --global --production windows-build-tools

# O manualmente:
# 1. Visual Studio Build Tools 2019+
# 2. Python 3.x
# 3. Node-gyp
```

**Para serialport (báscula e impresora):**
```bash
npm install serialport --build-from-source
npm install @serialport/bindings-cpp --build-from-source
```

**Verificar compilación:**
```bash
npm run build:electron
# El .exe debe incluir los bindings nativos
```

---

### 2. 📊 **INTELIGENCIA DE NEGOCIOS Y DASHBOARD**

#### ✅ Cálculo de Utilidad (IMPLEMENTADO)
**Estado:** Ya funciona correctamente

**Fórmula implementada:**
```typescript
// En DashboardPOSPage.tsx
const calcularUtilidad = (ventas: Venta[]) => {
  return ventas.reduce((total, venta) => {
    const utilidadVenta = venta.items.reduce((sum, item) => {
      const precioVenta = item.precioVenta || item.precio;
      const precioCompra = item.precioCompra || item.costo || 0;
      const utilidad = (precioVenta - precioCompra) * item.cantidad;
      return sum + utilidad;
    }, 0);
    return total + utilidadVenta;
  }, 0);
};
```

#### ⚠️ Eliminar $NaN en Top Productos (PENDIENTE)
**Ubicación:** `/src/app/components/pos/DashboardPOSPage.tsx` (línea ~400)

**Problema:** Productos sin `precioCompra` generan NaN

**Solución a implementar:**
```typescript
// ANTES (puede generar NaN):
const utilidad = (item.precio - item.costo) * item.cantidad;

// DESPUÉS (maneja valores undefined):
const precioVenta = item.precioVenta || item.precio || 0;
const precioCompra = item.precioCompra || item.costo || 0;
const utilidad = precioCompra > 0 
  ? (precioVenta - precioCompra) * item.cantidad 
  : 0;

// Filtrar productos sin costo:
const productosValidos = topProductos.filter(p => {
  const costo = p.precioCompra || p.costo || 0;
  return costo > 0;
});
```

#### ⚠️ Balance Neto (Restar Gastos) (PENDIENTE)
**Ubicación:** `/src/app/components/pos/DashboardPOSPage.tsx`

**Implementación:**
```typescript
// Cargar gastos del día
const [gastos, setGastos] = useState<Gasto[]>([]);

useEffect(() => {
  const cargarGastos = async () => {
    try {
      const gastosData = await electronStore.obtenerGastos();
      
      // Filtrar gastos del día actual
      const hoy = new Date().toISOString().split('T')[0];
      const gastosHoy = gastosData.filter(g => 
        g.fecha.startsWith(hoy)
      );
      
      setGastos(gastosHoy);
    } catch (error) {
      console.error('Error cargando gastos:', error);
    }
  };

  cargarGastos();
}, []);

// Calcular utilidad neta
const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
const utilidadBruta = calcularUtilidad(ventasHoy);
const utilidadNeta = utilidadBruta - totalGastos;

// KPI actualizado:
<Card>
  <CardContent>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-emerald-300">Utilidad Bruta</p>
        <p className="text-white">{formatCurrency(utilidadBruta)}</p>
      </div>
      <div>
        <p className="text-red-300">Gastos</p>
        <p className="text-white">-{formatCurrency(totalGastos)}</p>
      </div>
    </div>
    <Separator className="my-3" />
    <div>
      <p className="text-emerald-300 font-bold">Utilidad Neta</p>
      <p className={`text-3xl font-bold ${
        utilidadNeta >= 0 ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {formatCurrency(utilidadNeta)}
      </p>
    </div>
  </CardContent>
</Card>
```

#### ⚠️ Métricas Horarias (Gráfico Ventas por Hora) (PENDIENTE)
**Ubicación:** `/src/app/components/pos/DashboardPOSPage.tsx`

**Implementación:**
```typescript
// Procesar ventas por hora
const ventasPorHora = useMemo(() => {
  const horas = Array.from({ length: 24 }, (_, i) => ({
    hora: i,
    label: `${i.toString().padStart(2, '0')}:00`,
    ventas: 0,
    ingresos: 0
  }));

  ventasHoy.forEach(venta => {
    const fecha = new Date(venta.fecha);
    const hora = fecha.getHours();
    horas[hora].ventas += 1;
    horas[hora].ingresos += venta.total;
  });

  return horas;
}, [ventasHoy]);

// Componente de gráfico:
<Card>
  <CardHeader>
    <CardTitle>Ventas por Hora</CardTitle>
  </CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={ventasPorHora}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis 
          dataKey="label" 
          stroke="#94a3b8"
          tick={{ fill: '#cbd5e1', fontSize: 12 }}
        />
        <YAxis 
          stroke="#94a3b8"
          tick={{ fill: '#cbd5e1' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '8px'
          }}
          formatter={(value: number) => formatCurrency(value)}
        />
        <Bar 
          dataKey="ingresos" 
          fill="#10b981"
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  </CardContent>
</Card>
```

---

### 3. 💳 **MÓDULO DE PAGOS Y AUDITORÍA**

#### ✅ Ventana de Pago Mixto (COMPLETADO)
**Estado:** Modal completamente funcional

**Ubicación:** `/src/app/components/pos/PagoMixtoModal.tsx`

**Características:**
- ✅ 5 inputs (Efectivo, Tarjeta, Nequi, Daviplata, Transferencia)
- ✅ Validación automática (suma debe igualar total)
- ✅ Indicador visual de diferencia (falta/sobra)
- ✅ Botón "Distribuir Automático" (50/50)
- ✅ Formato de moneda colombiano

**Uso en POSPageNew.tsx:**
```typescript
const [showPagoMixtoModal, setShowPagoMixtoModal] = useState(false);

// Botón de Pago Mixto:
<Button onClick={() => setShowPagoMixtoModal(true)}>
  Pago Mixto
</Button>

// Modal:
<PagoMixtoModal
  isOpen={showPagoMixtoModal}
  onClose={() => setShowPagoMixtoModal(false)}
  totalVenta={totalVenta}
  onConfirm={(pagoMixto) => {
    procesarVenta('mixto', pagoMixto);
  }}
/>
```

**Datos guardados:**
```typescript
interface PagoMixtoDetalle {
  efectivo?: number;
  tarjeta?: number;
  nequi?: number;
  daviplata?: number;
  transferencia?: number;
}

interface Venta {
  // ...otros campos
  metodoPago: 'mixto';
  pagoMixto: PagoMixtoDetalle;
}
```

#### ⚠️ Arqueo de Caja (Vinculación) (PENDIENTE)
**Ubicación:** `/src/app/components/pos/CierreCajaPage.tsx`

**Implementación:**
```typescript
// Calcular esperado del sistema
const calcularEsperado = () => {
  // 1. Sumar efectivo de ventas únicas
  const efectivoVentas = ventas
    .filter(v => v.metodoPago === 'efectivo')
    .reduce((sum, v) => sum + v.total, 0);

  // 2. Sumar efectivo de pagos mixtos
  const efectivoMixto = ventas
    .filter(v => v.metodoPago === 'mixto' && v.pagoMixto?.efectivo)
    .reduce((sum, v) => sum + (v.pagoMixto!.efectivo || 0), 0);

  // 3. Total efectivo esperado
  const totalEfectivoEsperado = efectivoVentas + efectivoMixto;

  // 4. Ingresos digitales (Nequi + Daviplata)
  const nequiTotal = ventas.reduce((sum, v) => {
    if (v.metodoPago === 'nequi') return sum + v.total;
    if (v.metodoPago === 'mixto') return sum + (v.pagoMixto?.nequi || 0);
    return sum;
  }, 0);

  const daviplataTotal = ventas.reduce((sum, v) => {
    if (v.metodoPago === 'daviplata') return sum + v.total;
    if (v.metodoPago === 'mixto') return sum + (v.pagoMixto?.daviplata || 0);
    return sum;
  }, 0);

  return {
    efectivoEsperado: totalEfectivoEsperado,
    nequi: nequiTotal,
    daviplata: daviplataTotal,
    tarjeta: ventas.reduce((sum, v) => {
      if (v.metodoPago === 'tarjeta') return sum + v.total;
      if (v.metodoPago === 'mixto') return sum + (v.pagoMixto?.tarjeta || 0);
      return sum;
    }, 0),
    transferencia: ventas.reduce((sum, v) => {
      if (v.metodoPago === 'transferencia') return sum + v.total;
      if (v.metodoPago === 'mixto') return sum + (v.pagoMixto?.transferencia || 0);
      return sum;
    }, 0)
  };
};

// UI de arqueo:
<Card>
  <CardContent>
    <h3>Arqueo de Caja</h3>
    
    <div className="grid grid-cols-3 gap-4">
      <div>
        <p className="text-slate-400">Efectivo Esperado</p>
        <p className="text-white text-2xl font-bold">
          {formatCurrency(esperado.efectivoEsperado)}
        </p>
      </div>
      
      <div>
        <p className="text-slate-400">Conteo Físico</p>
        <p className="text-white text-2xl font-bold">
          {formatCurrency(conteoFisico)}
        </p>
      </div>
      
      <div>
        <p className="text-slate-400">Diferencia</p>
        <p className={`text-2xl font-bold ${
          diferencia === 0 ? 'text-green-400' :
          diferencia < 0 ? 'text-red-400' : 'text-yellow-400'
        }`}>
          {diferencia > 0 ? '+' : ''}{formatCurrency(diferencia)}
        </p>
      </div>
    </div>

    <Separator className="my-4" />

    <h4 className="text-slate-300 mb-2">Ingresos Digitales (No cuentan en efectivo)</h4>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
        <p className="text-purple-300">Nequi</p>
        <p className="text-white font-bold">{formatCurrency(esperado.nequi)}</p>
      </div>
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
        <p className="text-red-300">Daviplata</p>
        <p className="text-white font-bold">{formatCurrency(esperado.daviplata)}</p>
      </div>
    </div>
  </CardContent>
</Card>
```

#### ⚠️ Seguimiento de Turnos (Widget Tiempo Real) (PENDIENTE)
**Ubicación:** `/src/app/components/pos/DashboardPOSPage.tsx`

**Implementación:**
```typescript
interface TurnoActivo {
  cajeroId: string;
  cajeroNombre: string;
  horaInicio: Date;
  ventasRealizadas: number;
  totalVendido: number;
}

const [turnosActivos, setTurnosActivos] = useState<TurnoActivo[]>([]);

// Calcular turno actual
const calcularTurnoActual = (cajeroId: string) => {
  const ventasCajero = ventasHoy.filter(v => v.cajeroId === cajeroId);
  
  return {
    cajeroId,
    cajeroNombre: ventasCajero[0]?.cajero || 'Sin nombre',
    horaInicio: new Date(ventasCajero[0]?.fecha || Date.now()),
    ventasRealizadas: ventasCajero.length,
    totalVendido: ventasCajero.reduce((sum, v) => sum + v.total, 0)
  };
};

// Widget:
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Clock className="w-5 h-5 text-blue-400" />
      Turnos Activos
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {turnosActivos.map(turno => {
      const ahora = new Date();
      const duracion = Math.floor((ahora.getTime() - turno.horaInicio.getTime()) / 1000 / 60);
      const horas = Math.floor(duracion / 60);
      const minutos = duracion % 60;

      return (
        <motion.div
          key={turno.cajeroId}
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white font-semibold">{turno.cajeroNombre}</span>
            </div>
            <Badge variant="outline" className="text-blue-400 border-blue-400">
              {horas}h {minutos}m
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-slate-400">Ventas</p>
              <p className="text-white font-bold">{turno.ventasRealizadas}</p>
            </div>
            <div>
              <p className="text-slate-400">Total</p>
              <p className="text-white font-bold">{formatCurrency(turno.totalVendido)}</p>
            </div>
          </div>
        </motion.div>
      );
    })}
  </CardContent>
</Card>
```

---

### 4. 🔒 **MÓDULO DE SEGURIDAD (Notificaciones WiFi)**

#### ⚠️ Servidor Socket.IO Local (PENDIENTE)
**Ubicación:** Crear `/src/server/socketServer.ts`

**Implementación:**
```typescript
import { Server } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // En producción, especificar IP de Eduardo
    methods: ["GET", "POST"]
  }
});

// Estado de notificaciones
interface NotificacionPago {
  id: string;
  metodo: 'nequi' | 'daviplata';
  monto: number;
  referencia: string;
  timestamp: Date;
  verificado: boolean;
}

const notificacionesPendientes: NotificacionPago[] = [];

// Escuchar conexiones
io.on('connection', (socket) => {
  console.log('📱 App de Eduardo conectada:', socket.id);

  // Recibir notificación de pago
  socket.on('pago-verificado', (data: {
    metodo: 'nequi' | 'daviplata',
    monto: number,
    referencia: string
  }) => {
    console.log('💰 Pago verificado recibido:', data);

    const notificacion: NotificacionPago = {
      id: `PAY-${Date.now()}`,
      metodo: data.metodo,
      monto: data.monto,
      referencia: data.referencia,
      timestamp: new Date(),
      verificado: true
    };

    notificacionesPendientes.push(notificacion);

    // Emitir a todos los clientes (POS)
    io.emit('nueva-verificacion', notificacion);
  });

  socket.on('disconnect', () => {
    console.log('📱 App de Eduardo desconectada');
  });
});

// Iniciar servidor en puerto 4000
httpServer.listen(4000, () => {
  console.log('🔒 Servidor Socket.IO escuchando en puerto 4000');
});

export { io, notificacionesPendientes };
```

**Integración en el POS:**
```typescript
// En POSPageNew.tsx
import { io, Socket } from 'socket.io-client';

const [socket, setSocket] = useState<Socket | null>(null);
const [notificacionesPago, setNotificacionesPago] = useState<NotificacionPago[]>([]);

useEffect(() => {
  // Conectar al servidor local
  const socketInstance = io('http://localhost:4000');

  socketInstance.on('connect', () => {
    console.log('✅ Conectado al servidor de verificación');
  });

  socketInstance.on('nueva-verificacion', (notificacion: NotificacionPago) => {
    console.log('💰 Nueva verificación recibida:', notificacion);
    
    // Mostrar alerta visual
    toast.success(
      `✅ Pago ${notificacion.metodo.toUpperCase()} verificado\n` +
      `Monto: ${formatCurrency(notificacion.monto)}\n` +
      `Ref: ${notificacion.referencia}`,
      { duration: 10000 }
    );

    // Agregar a lista
    setNotificacionesPago(prev => [notificacion, ...prev]);
  });

  setSocket(socketInstance);

  return () => {
    socketInstance.disconnect();
  };
}, []);
```

**Alerta Visual en el POS:**
```typescript
<AnimatePresence>
  {notificacionesPago.map(notif => (
    <motion.div
      key={notif.id}
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed top-4 right-4 z-50 bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-lg shadow-2xl max-w-sm"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
        <div>
          <h4 className="font-bold">Pago Verificado por Eduardo</h4>
          <p className="text-sm opacity-90">
            {notif.metodo.toUpperCase()}: {formatCurrency(notif.monto)}
          </p>
          <p className="text-xs opacity-75">Ref: {notif.referencia}</p>
        </div>
      </div>
    </motion.div>
  ))}
</AnimatePresence>
```

#### ⚠️ App de Eduardo (Referencia) (DOCUMENTADO)
**Tecnología sugerida:** React Native o PWA

**Funcionalidad:**
```typescript
// App móvil de Eduardo
import { io } from 'socket.io-client';

const socket = io('http://192.168.1.X:4000'); // IP del POS

const verificarPago = (metodo: 'nequi' | 'daviplata', monto: number, referencia: string) => {
  socket.emit('pago-verificado', {
    metodo,
    monto,
    referencia
  });
};

// UI simple:
<Button onPress={() => {
  verificarPago('nequi', 50000, 'NEQ-123456');
}}>
  ✅ Verificar Pago Nequi
</Button>
```

---

### 5. 🔓 **APERTURA AUTOMÁTICA DEL CAJÓN MONEDERO**

#### ⚠️ Comando ESC/POS (PENDIENTE)
**Ubicación:** `/src/app/lib/serialService.ts` o `/src/app/lib/impresora.ts`

**Implementación:**
```typescript
interface SerialPortInstance {
  path: string;
  baudRate: number;
  write: (data: Buffer, callback?: (error: Error | null) => void) => void;
}

class ImpresoraService {
  private puerto: SerialPortInstance | null = null;

  // Conectar a impresora
  async conectar(puertoNombre: string = 'COM3') {
    try {
      const SerialPort = require('serialport');
      
      this.puerto = new SerialPort({
        path: puertoNombre,
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1
      });

      console.log(`✅ Impresora conectada en ${puertoNombre}`);
    } catch (error) {
      console.error('❌ Error conectando impresora:', error);
      throw error;
    }
  }

  // Abrir cajón monedero
  abrirCajon(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.puerto) {
        reject(new Error('Puerto no conectado'));
        return;
      }

      // Comando ESC/POS estándar para abrir cajón
      // Decimal: 27, 112, 48, 55, 121
      // Hexadecimal: 1B 70 00 37 79
      const comando = Buffer.from([0x1B, 0x70, 0x00, 0x37, 0x79]);

      this.puerto.write(comando, (error) => {
        if (error) {
          console.error('❌ Error abriendo cajón:', error);
          reject(error);
        } else {
          console.log('✅ Cajón abierto correctamente');
          resolve();
        }
      });
    });
  }

  // Imprimir y abrir cajón
  async imprimirYAbrirCajon(ticket: string) {
    try {
      // 1. Imprimir ticket
      await this.imprimir(ticket);
      
      // 2. Abrir cajón
      await this.abrirCajon();
      
      // 3. Cortar papel
      await this.cortarPapel();
    } catch (error) {
      console.error('Error en impresión:', error);
      throw error;
    }
  }
}

export const impresoraService = new ImpresoraService();
```

#### ⚠️ Disparador Automático (Solo Efectivo) (PENDIENTE)
**Ubicación:** `/src/app/components/pos/POSPageNew.tsx`

**Implementación:**
```typescript
const procesarVenta = async (
  metodoPago: MetodoPago,
  pagoMixto?: PagoMixtoDetalle
) => {
  try {
    // 1. Guardar venta
    const ventaGuardada = await electronStore.guardarVenta({
      // ...datos de la venta
      metodoPago,
      pagoMixto
    });

    // 2. Imprimir ticket
    await impresoraService.imprimir(generarTicket(ventaGuardada));

    // 3. Determinar si incluye efectivo
    const incluyeEfectivo = 
      metodoPago === 'efectivo' ||
      (metodoPago === 'mixto' && (pagoMixto?.efectivo || 0) > 0);

    // 4. Abrir cajón SOLO si incluye efectivo
    if (incluyeEfectivo) {
      console.log('💵 Pago incluye efectivo, abriendo cajón...');
      await impresoraService.abrirCajon();
      
      toast.success('Cajón abierto - Recibe el efectivo', {
        icon: '🔓',
        duration: 3000
      });
    } else {
      console.log('💳 Pago digital, cajón permanece cerrado');
    }

    // 5. Cortar papel
    await impresoraService.cortarPapel();

    toast.success('Venta procesada correctamente');
  } catch (error) {
    console.error('Error procesando venta:', error);
    toast.error('Error al procesar la venta');
  }
};
```

**Lógica detallada:**
```typescript
// Función auxiliar para verificar efectivo
const verificarEfectivo = (
  metodoPago: MetodoPago, 
  pagoMixto?: PagoMixtoDetalle
): boolean => {
  // Caso 1: Pago único en efectivo
  if (metodoPago === 'efectivo') {
    return true;
  }

  // Caso 2: Pago mixto con efectivo
  if (metodoPago === 'mixto' && pagoMixto) {
    const montoEfectivo = pagoMixto.efectivo || 0;
    return montoEfectivo > 0;
  }

  // Caso 3: Otros métodos (tarjeta, nequi, daviplata, transferencia)
  return false;
};

// Uso:
if (verificarEfectivo(metodoPago, pagoMixto)) {
  await impresoraService.abrirCajon();
}
```

**Configuración del cajón:**
```typescript
// Configuración avanzada (opcional)
interface ConfiguracionCajon {
  pulsoMs: number; // Duración del pulso (55-200ms)
  pin: 0 | 1; // Pin del cajón (0 = pin 2, 1 = pin 5)
}

const abrirCajonAvanzado = (config: ConfiguracionCajon = { pulsoMs: 120, pin: 0 }) => {
  // ESC p m t1 t2
  // m = pin (0 o 1)
  // t1 = tiempo ON (en múltiplos de 2ms)
  // t2 = tiempo OFF (en múltiplos de 2ms)
  
  const t1 = Math.floor(config.pulsoMs / 2);
  const t2 = Math.floor(config.pulsoMs / 2);
  
  const comando = Buffer.from([
    0x1B,         // ESC
    0x70,         // p
    config.pin,   // m (0 o 1)
    t1,           // t1
    t2            // t2
  ]);

  return comando;
};
```

---

## 📦 DEPENDENCIAS NECESARIAS

### NPM Packages a Instalar:

```bash
# Socket.IO (servidor y cliente)
npm install socket.io socket.io-client

# SerialPort (para impresora y báscula)
npm install serialport @serialport/bindings-cpp

# Recharts (para gráficos)
npm install recharts

# Date-fns (manejo de fechas)
npm install date-fns

# Motion (animaciones)
npm install motion

# Sonner (toasts)
npm install sonner
```

### Compilación de Binaries Nativos:

```bash
# Windows Build Tools
npm install --global --production windows-build-tools

# Rebuilding para Electron
npm install electron-rebuild --save-dev
npx electron-rebuild
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Prioridad CRÍTICA (Bloquean funcionalidad):

- [ ] **Eliminar $NaN en Top Productos**
  - Archivo: `DashboardPOSPage.tsx`
  - Tiempo: 15 minutos
  
- [ ] **Restar Gastos de Utilidad Neta**
  - Archivo: `DashboardPOSPage.tsx`
  - Tiempo: 20 minutos

- [ ] **Vinculación Arqueo de Caja**
  - Archivo: `CierreCajaPage.tsx`
  - Tiempo: 30 minutos

- [ ] **Apertura Cajón Monedero**
  - Archivo: `serialService.ts` + `POSPageNew.tsx`
  - Tiempo: 45 minutos
  - Requiere: Impresora conectada para testing

### Prioridad ALTA (Mejoran experiencia):

- [ ] **Gráfico Ventas por Hora**
  - Archivo: `DashboardPOSPage.tsx`
  - Tiempo: 30 minutos

- [ ] **Widget Turnos Activos**
  - Archivo: `DashboardPOSPage.tsx`
  - Tiempo: 25 minutos

- [ ] **Servidor Socket.IO**
  - Archivo: `socketServer.ts` (nuevo)
  - Tiempo: 1 hora
  - Requiere: Testing con app de Eduardo

### Prioridad MEDIA (Opcionales):

- [ ] **Renombrar Carpeta**
  - Manual
  - Tiempo: 5 minutos

- [ ] **Compilar Drivers SerialPort**
  - Terminal
  - Tiempo: 20 minutos (+ instalación de herramientas)

---

## 🚀 ORDEN DE IMPLEMENTACIÓN RECOMENDADO

### Día 1 (2-3 horas):
1. Eliminar $NaN en Dashboard
2. Restar gastos de utilidad
3. Gráfico ventas por hora
4. Widget turnos activos

### Día 2 (2-3 horas):
5. Vinculación arqueo de caja
6. Testing completo de pago mixto
7. Documentación de uso

### Día 3 (3-4 horas):
8. Implementar apertura de cajón monedero
9. Testing con hardware real
10. Ajustes finales

### Día 4 (opcional, 4-6 horas):
11. Servidor Socket.IO
12. Integración con app de Eduardo
13. Testing WiFi local

---

## 📝 NOTAS IMPORTANTES

### Para Jessica (Cajera):

✅ **Pago Mixto:** Ya funciona perfectamente, solo abrir el modal y distribuir los montos.

⚠️ **Arqueo de Caja:** Pronto verás los ingresos digitales separados del efectivo.

⚠️ **Cajón Monedero:** Se abrirá automáticamente solo cuando recibas efectivo.

### Para Eduardo (Seguridad):

⚠️ **App de Verificación:** Necesitarás una app móvil (React Native o PWA) que se conecte por WiFi local al POS.

⚠️ **Servidor Socket.IO:** El POS escuchará en `http://localhost:4000` (o la IP local del POS).

⚠️ **Formato de Mensaje:**
```json
{
  "metodo": "nequi",
  "monto": 50000,
  "referencia": "NEQ-123456"
}
```

### Hardware Necesario:

- 🖨️ **Impresora POS-58** (o compatible ESC/POS)
- 💰 **Cajón Monedero** conectado a la impresora
- 📡 **WiFi Local** para comunicación con app de Eduardo
- ⚖️ **Báscula Serial** (opcional, para pesaje)

---

## 🎯 RESULTADO ESPERADO FINAL

Al completar todas las mejoras:

1. ✅ **Dashboard sin $NaN** - Métricas precisas
2. ✅ **Utilidad Neta Real** - Restando gastos automáticamente
3. ✅ **Gráfico de Ventas por Hora** - Análisis temporal
4. ✅ **Arqueo de Caja Perfecto** - Jessica cuadra sin errores
5. ✅ **Turnos en Tiempo Real** - Monitoreo de cajeros
6. ✅ **Cajón Automático** - Solo con efectivo
7. ✅ **Verificación WiFi** - Eduardo confirma pagos digitales
8. ✅ **Sistema Robusto** - Sin pérdida de datos

---

**Desarrollado por Codec Studio**  
**CODEC POS v2.0 - Sistema Integral para Minimercados**  
**Fecha:** 20 de Febrero, 2026  
**Estado:** 60% Implementado | 40% Pendiente
