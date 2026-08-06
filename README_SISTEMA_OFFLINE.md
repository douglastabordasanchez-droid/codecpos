# 📦 CODECPOS v2.0 - Sistema Offline-First con Sincronización Multi-Punto

## 🎯 Características Implementadas

### ✅ Sistema de Almacenamiento Local Robusto (IndexedDB)
- **Capacidad**: Almacenamiento masivo (> 50MB, hasta varios GB según el navegador)
- **Persistencia**: Los datos se mantienen incluso sin conexión a internet
- **Velocidad**: Acceso ultrarrápido a productos y ventas
- **Stores implementados**:
  - `productos` - Inventario completo con índices por código y categoría
  - `ventas` - Registro completo de transacciones
  - `usuarios` - Base de datos local de usuarios
  - `config` - Configuración del punto de venta
  - `sync_queue` - Cola de sincronización para cambios pendientes
  - `logs` - Registro de eventos y errores

### ✅ Sincronización Automática
- **Intervalo**: Sincroniza cada 30 segundos cuando hay conexión
- **Inteligente**: Solo sincroniza cambios pendientes (optimizado)
- **Resiliente**: Reintenta hasta 3 veces si falla una sincronización
- **Bidireccional**:
  - **Descarga** productos actualizados del administrador
  - **Sube** ventas locales al servidor central
  - **Detecta** conflictos automáticamente

### ✅ Modo Offline Completo
- **Funciona sin internet**: El POS opera completamente offline
- **Cola automática**: Los cambios se guardan en cola para sincronizar después
- **Indicador visual**: Muestra claramente el estado online/offline
- **Notificaciones**: Avisa cuando se pierde/recupera conexión

### ✅ Sistema Multi-Punto
- **ID único**: Cada punto de venta tiene identificador único
- **Sincronización central**: Todos los puntos se sincronizan con un servidor central
- **Panel administrador**: Control remoto desde cualquier lugar
- **Actualización en tiempo real**: Cambios se propagan a todos los puntos

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    PANEL ADMINISTRADOR                       │
│         (En la casa del dueño - acceso remoto)              │
│                                                              │
│  • Gestión de productos                                     │
│  • Ver ventas de todos los puntos                          │
│  • Actualizar inventario                                    │
│  • Estadísticas en tiempo real                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Internet (cuando hay conexión)
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼──────┐    ┌───────▼──────┐    ┌──────────────┐
│  PUNTO #1    │    │  PUNTO #2    │    │  PUNTO #N    │
│              │    │              │    │              │
│ IndexedDB    │    │ IndexedDB    │    │ IndexedDB    │
│ (Offline)    │    │ (Offline)    │    │ (Offline)    │
│              │    │              │    │              │
│ Sincroniza   │    │ Sincroniza   │    │ Sincroniza   │
│ c/ 30 seg    │    │ c/ 30 seg    │    │ c/ 30 seg    │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## 📁 Archivos Creados

### 1. `/src/app/lib/indexedDB.ts`
**Base de datos local completa**
- Gestión de productos, ventas, usuarios, configuración
- Cola de sincronización
- Sistema de logs
- API completa de operaciones CRUD

### 2. `/src/app/lib/syncService.ts`
**Servicio de sincronización automática**
- Sincronización bidireccional (productos ↓, ventas ↑)
- Cola de reintentos automáticos
- Detección de conflictos
- Eventos para listeners

### 3. `/src/app/hooks/useNetworkStatus.ts`
**Hook de monitoreo de red**
- Detecta cambios online/offline
- Fuerza sincronización cuando se restaura conexión
- Estado de sincronización en tiempo real

### 4. `/src/app/components/electron/SyncStatusIndicator.tsx`
**Indicador visual de sincronización**
- Badge de estado (online/offline/sincronizando)
- Contador de items pendientes
- Popover con estadísticas detalladas
- Botón de sincronización manual

---

## 🚀 Cómo Funciona

### Flujo Normal (CON internet):
1. Vendedor realiza una venta
2. **Se guarda en IndexedDB local** (instantáneo)
3. Se marca como `syncStatus: 'pending'`
4. A los 30 segundos (o menos), el servicio de sincronización:
   - Sube la venta al servidor central
   - Marca como `syncStatus: 'synced'`
5. El administrador ve la venta en tiempo real

### Flujo Offline (SIN internet):
1. Vendedor realiza una venta
2. **Se guarda en IndexedDB local** (instantáneo)
3. Se marca como `syncStatus: 'pending'`
4. **Venta queda en cola de sincronización**
5. Cuando se restaura la conexión:
   - Sincronización automática se activa
   - Todas las ventas pendientes se suben al servidor
   - Productos actualizados se descargan

### Administrador Remoto:
1. Dueño desde su casa agrega/actualiza productos
2. Productos se guardan en servidor central con `updatedAt`
3. Cada punto de venta descarga productos nuevos/actualizados
4. IndexedDB local se actualiza automáticamente
5. **Productos disponibles inmediatamente** en el POS

---

## 💾 Almacenamiento Disponible

| Navegador | Capacidad IndexedDB |
|-----------|-------------------|
| Chrome    | Hasta 60% del disco disponible |
| Firefox   | Hasta 50% del disco disponible |
| Edge      | Hasta 60% del disco disponible |
| Safari    | ~1GB (limitado) |

**Ejemplo práctico**:
- 10,000 productos = ~5MB
- 100,000 ventas = ~50MB
- **Total: ~55MB** (cabe perfectamente en cualquier navegador)

---

## 🎛️ Panel de Administrador (Próximo a implementar)

```typescript
// Rutas del Panel Admin
/admin/dashboard        // Estadísticas generales
/admin/productos        // CRUD de productos
/admin/puntos-venta     // Gestión de puntos
/admin/ventas           // Ver ventas de todos los puntos
/admin/inventario       // Control de stock global
/admin/usuarios         // Gestión de usuarios

// Características:
✅ Actualización de productos en todos los puntos
✅ Ver ventas en tiempo real de todas las cajas
✅ Control de inventario centralizado
✅ Dashboard con métricas consolidadas
✅ Gestión remota de usuarios y permisos
```

---

## 🔄 Configuración Inicial

### 1. Configurar el Servicio de Sincronización

```typescript
// En tu App.tsx o componente principal
import { syncService } from './lib/syncService';

useEffect(() => {
  // Configurar al iniciar la aplicación
  syncService.initialize({
    apiUrl: 'https://tu-servidor.com/api',  // URL del servidor central
    puntoVentaId: 'POS-001',                // ID único de este punto
    authToken: 'token-de-autenticacion'     // Token de seguridad (opcional)
  });
}, []);
```

### 2. Obtener ID del Punto de Venta

```typescript
// Opción 1: Generado automáticamente en la configuración inicial
const puntoVentaId = `POS-${Date.now()}`;

// Opción 2: Configurado manualmente por el administrador
// Desde la página de configuración del POS
```

### 3. Backend Requerido

El backend debe tener estos endpoints:

```typescript
// Descargar productos actualizados
GET /productos/sync
Response: {
  productos: Producto[]
}

// Subir ventas locales
POST /ventas/sync
Body: Venta
Response: { success: boolean }

// Procesar cola de sincronización
POST /:store/:operation
Body: { data: any }
Response: { success: boolean }
```

---

## 📊 Monitoreo y Debugging

### Ver Estado de Sincronización
```typescript
import { syncService } from './lib/syncService';

// Obtener estadísticas
const stats = await syncService.getSyncStats();
console.log(stats);
// {
//   totalProductos: 1500,
//   productosPendientes: 0,
//   totalVentas: 250,
//   ventasPendientes: 5,  // <- Ventas offline esperando subir
//   colaLength: 2,
//   isOnline: true
// }
```

### Ver Logs del Sistema
```typescript
import { dbManager } from './lib/indexedDB';

// Ver últimos 100 eventos
const logs = await dbManager.getRecentLogs(100);
console.table(logs);
```

### Forzar Sincronización Manual
```typescript
// Desde el indicador de sincronización
// O programáticamente:
await syncService.forceSyncNow();
```

---

## 🎨 Indicador Visual

El componente `SyncStatusIndicator` muestra:

### Estados:
- 🟢 **Verde** - Sincronizado exitosamente
- 🔵 **Azul** - Sincronizando ahora
- 🟠 **Naranja** - Sin conexión (modo offline)
- 🔴 **Rojo** - Error en sincronización

### Información detallada:
- Total de productos
- Productos pendientes de sincronizar
- Total de ventas
- Ventas pendientes de subir
- Elementos en cola
- Última sincronización exitosa

---

## ⚡ Ventajas del Sistema

### Para el Vendedor:
✅ **Velocidad**: No espera por internet, todo es instantáneo
✅ **Confiabilidad**: Funciona aunque se caiga internet
✅ **Simplicidad**: No nota diferencia entre online/offline

### Para el Dueño:
✅ **Control remoto**: Actualiza productos desde su casa
✅ **Visibilidad**: Ve ventas de todos los puntos en tiempo real
✅ **Seguridad**: Los datos están respaldados en servidor central
✅ **Escalabilidad**: Puede agregar más puntos de venta fácilmente

### Para el Negocio:
✅ **Sin pérdidas**: Ninguna venta se pierde por falta de internet
✅ **Reportes centralizados**: Estadísticas de todos los puntos
✅ **Inventario sincronizado**: Stock actualizado en todas las cajas
✅ **Reducción de costos**: No requiere infraestructura de red robusta

---

## 🔐 Seguridad

- ✅ Autenticación con token JWT
- ✅ Cada punto de venta tiene ID único
- ✅ Los datos locales están encriptados en IndexedDB
- ✅ Sincronización solo con servidor autorizado
- ✅ Logs completos de todas las operaciones

---

## 📱 Próximas Mejoras

- [ ] Panel de administrador web completo
- [ ] WebSocket para actualizaciones en tiempo real
- [ ] Compresión de datos para sincronización más rápida
- [ ] Backup automático local cada noche
- [ ] Exportación de datos a Excel/PDF
- [ ] Notificaciones push al administrador
- [ ] Dashboard con gráficas en tiempo real
- [ ] Soporte para múltiples monedas

---

## 🆘 Solución de Problemas

### Problema: Sincronización no funciona
**Solución**:
1. Verificar que `apiUrl` sea correcta
2. Verificar que el servidor esté en línea
3. Revisar los logs: `await dbManager.getRecentLogs(20)`
4. Forzar sincronización manual

### Problema: Datos no se guardan
**Solución**:
1. Verificar espacio en disco
2. Limpiar caché del navegador
3. Verificar permisos de IndexedDB
4. Revisar consola del navegador

### Problema: Productos desactualizados
**Solución**:
1. Forzar sincronización manual
2. Verificar conexión a internet
3. Verificar que servidor tenga productos actualizados

---

## 📞 Soporte

Para problemas o consultas:
- Email: soporte@codecstudio.co
- WhatsApp: +57 XXX XXX XXXX
- Documentación: https://docs.codecpos.com

---

**CodecPOS v2.0** - Sistema POS Offline-First Multi-Punto  
© 2025 Codec Studio - Todos los derechos reservados
