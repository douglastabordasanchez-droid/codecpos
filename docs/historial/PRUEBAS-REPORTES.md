# 🧪 CODEC POS v2.0 - Guía de Pruebas de Reportes

## 🎯 Cómo Probar el Sistema de Reportes Funcional

---

## PASO 1: Preparar Datos de Prueba

### Opción A: Usar datos existentes del sistema
Si ya tienes ventas, productos, gastos o cierres de caja registrados, el sistema los usará automáticamente.

### Opción B: Generar datos de prueba rápidamente

Abre la **Consola del Navegador** (F12) y ejecuta:

```javascript
// 1. CREAR PRODUCTOS DE PRUEBA
const productos = [
  {
    id: '1',
    codigo: '7702001000011',
    nombre: 'Coca Cola 1.5L',
    categoria: 'Bebidas',
    precio: 4500,
    stock: 25,
    minStock: 10,
    costo: 3000,
    fechaVencimiento: '2026-12-31'
  },
  {
    id: '2',
    codigo: '7702002000012',
    nombre: 'Pan Tajado',
    categoria: 'Panadería',
    precio: 3200,
    stock: 5,
    minStock: 15,
    costo: 2000,
    fechaVencimiento: '2026-02-25'
  },
  {
    id: '3',
    codigo: '7702003000013',
    nombre: 'Arroz Diana 500g',
    categoria: 'Granos',
    precio: 2800,
    stock: 100,
    minStock: 20,
    costo: 1800
  }
];
localStorage.setItem('pos-productos', JSON.stringify(productos));

// 2. CREAR VENTAS DE PRUEBA
const ventas = [];
for (let i = 0; i < 20; i++) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - i);
  
  ventas.push({
    id: `venta-${i}`,
    fecha: fecha.toISOString(),
    total: Math.random() * 100000 + 50000,
    metodoPago: ['Efectivo', 'Tarjeta', 'Transferencia', 'Nequi', 'Daviplata'][Math.floor(Math.random() * 5)],
    cajero: 'Usuario Demo',
    items: [
      {
        nombre: productos[Math.floor(Math.random() * 3)].nombre,
        cantidad: Math.floor(Math.random() * 5) + 1,
        precio: productos[Math.floor(Math.random() * 3)].precio
      }
    ]
  });
}
localStorage.setItem('pos-ventas', JSON.stringify(ventas));

// 3. CREAR GASTOS DE PRUEBA
const gastos = [
  {
    id: '1',
    fecha: new Date(2026, 1, 15).toISOString(),
    monto: 50000,
    categoria: 'Servicios Públicos',
    descripcion: 'Pago de luz',
    autorizadoPor: 'Gerente'
  },
  {
    id: '2',
    fecha: new Date(2026, 1, 18).toISOString(),
    monto: 120000,
    categoria: 'Compras',
    descripcion: 'Compra de inventario',
    autorizadoPor: 'Gerente'
  },
  {
    id: '3',
    fecha: new Date(2026, 1, 19).toISOString(),
    monto: 30000,
    categoria: 'Mantenimiento',
    descripcion: 'Reparación de nevera',
    autorizadoPor: 'Admin'
  }
];
localStorage.setItem('pos-gastos', JSON.stringify(gastos));

// 4. CREAR CIERRES DE CAJA
const cierres = [
  {
    id: '1',
    fecha: new Date(2026, 1, 19).toISOString(),
    totalEfectivo: 250000,
    totalTarjeta: 180000,
    totalTransferencia: 90000,
    totalNequi: 50000,
    totalDaviplata: 30000,
    totalMixto: 20000,
    totalVentas: 620000,
    diferencia: 0,
    cajero: 'Juan Pérez'
  },
  {
    id: '2',
    fecha: new Date(2026, 1, 18).toISOString(),
    totalEfectivo: 300000,
    totalTarjeta: 150000,
    totalTransferencia: 60000,
    totalNequi: 40000,
    totalDaviplata: 20000,
    totalMixto: 10000,
    totalVentas: 580000,
    diferencia: -5000,
    cajero: 'María López'
  }
];
localStorage.setItem('pos-cierres-caja', JSON.stringify(cierres));

console.log('✅ Datos de prueba creados exitosamente!');
```

---

## PASO 2: Acceder al Módulo de Reportes

1. Abre CODEC POS v2.0
2. En el **Sidebar**, haz clic en **"📊 Reportes"**
3. Verás la pantalla de Reportes Avanzados

---

## PASO 3: Generar Reporte de Ventas

### 3.1 Configuración Rápida

1. Tab: **"Generar Reporte"**
2. Tipo de Reporte: **"Reporte de Ventas"** (ya seleccionado por defecto)
3. Haz clic en el botón: **"7 días"**
4. Haz clic en: **"Generar Reporte"**

### 3.2 Resultado Esperado

- ✅ Toast de éxito: "¡Reporte generado!"
- ✅ Descripción: "Reporte de Ventas (fecha-inicio a fecha-fin) - X registros"
- ✅ El reporte aparece en la pestaña "Historial"

---

## PASO 4: Ver Reporte Generado

1. Cambia a la pestaña: **"Historial (1)"**
2. Verás una tarjeta con:
   - ✅ Nombre del reporte
   - ✅ Badge: "VENTAS"
   - ✅ Badge: "X registros"
   - ✅ Fecha de generación
   - ✅ "Expira en 30 días"
   - ✅ Barra de progreso verde (100%)
   - ✅ Botones: PDF, Excel, Eliminar

---

## PASO 5: Descargar PDF

1. Haz clic en el botón: **📄 (PDF)**
2. Resultado:
   - ✅ Se descarga archivo: `ventas_2026-02-13_2026-02-20.pdf`
   - ✅ Toast: "PDF descargado"
3. Abre el PDF descargado:
   - ✅ Encabezado: "CODEC POS v2.0"
   - ✅ Título: "Reporte de Ventas (fecha a fecha)"
   - ✅ Resumen de ventas
   - ✅ Tabla de ventas por método de pago
   - ✅ Top 10 productos
   - ✅ Pie de página con numeración

---

## PASO 6: Descargar Excel

1. Haz clic en el botón: **📊 (Excel)**
2. Resultado:
   - ✅ Se descarga archivo: `ventas_2026-02-13_2026-02-20.xlsx`
   - ✅ Toast: "Excel descargado"
3. Abre el Excel descargado:
   - ✅ Hoja 1: "Resumen" (metadata del reporte)
   - ✅ Hoja 2: "Ventas" (tabla de todas las ventas)
   - ✅ Hoja 3: "Top Productos" (ranking)
   - ✅ Datos formateados y listos para análisis

---

## PASO 7: Generar Otros Tipos de Reportes

### 7.1 Reporte de Inventario

1. Tab: "Generar Reporte"
2. Tipo: **"Reporte de Inventario"**
3. Clic en: **"Generar Reporte"**
4. Resultado:
   - ✅ Analiza todos los productos
   - ✅ Identifica stock bajo
   - ✅ Identifica próximos a vencer
   - ✅ Calcula valor del inventario

### 7.2 Reporte de Gastos

1. Tipo: **"Reporte de Gastos"**
2. Período: **"30 días"**
3. Generar
4. Resultado:
   - ✅ Lista de todos los gastos
   - ✅ Agrupación por categoría
   - ✅ Total y promedio

### 7.3 Reporte de Cierres de Caja

1. Tipo: **"Reporte de Cierres de Caja"**
2. Período: **"15 días"**
3. Generar
4. Resultado:
   - ✅ Análisis de cierres
   - ✅ Faltantes y sobrantes
   - ✅ Método de pago más usado

### 7.4 Reporte Financiero

1. Tipo: **"Reporte Financiero Consolidado"**
2. Período: **"Mes Actual"**
3. Generar
4. Resultado:
   - ✅ Ingresos vs Gastos
   - ✅ Utilidad neta
   - ✅ Margen de utilidad

---

## PASO 8: Probar Validaciones

### 8.1 Período Inválido

1. Fecha Inicio: `2026-02-20`
2. Fecha Fin: `2026-02-15` (anterior a inicio)
3. Generar
4. Resultado esperado:
   - ❌ Toast error: "Período inválido"

### 8.2 Período Mayor a 30 Días

1. Fecha Inicio: `2026-01-01`
2. Fecha Fin: `2026-02-20` (más de 30 días)
3. Generar
4. Resultado esperado:
   - ❌ Toast error: "Período máximo: 30 días"

### 8.3 Sin Fechas

1. Borra ambas fechas
2. Generar
3. Resultado esperado:
   - ❌ Toast error: "Selecciona el período"

---

## PASO 9: Probar Auto-Eliminación (Simulación)

### Método 1: Modificar Fecha de Expiración Manualmente

```javascript
// En consola del navegador
const reportes = JSON.parse(localStorage.getItem('pos-reportes-generados'));
reportes[0].fechaExpiracion = new Date('2020-01-01').toISOString(); // Fecha pasada
localStorage.setItem('pos-reportes-generados', JSON.stringify(reportes));

// Recarga la página
location.reload();

// Resultado esperado:
// ✅ Toast: "Se eliminaron 1 reportes expirados"
// ✅ Reporte desaparece del historial
```

### Método 2: Verificar Advertencias de Expiración

```javascript
// Crear reporte que expira en 5 días
const reportes = JSON.parse(localStorage.getItem('pos-reportes-generados') || '[]');
const expiracion = new Date();
expiracion.setDate(expiracion.getDate() + 5);

reportes[0].fechaExpiracion = expiracion.toISOString();
localStorage.setItem('pos-reportes-generados', JSON.stringify(reportes));

// Recarga la página
location.reload();

// Resultado esperado:
// ✅ Texto en el reporte: "⚠️ Expira en 5 días - ¡Descarga pronto!"
// ✅ Barra de progreso ROJA
// ✅ Texto en color ROJO
```

---

## PASO 10: Eliminar Reporte Manualmente

1. En historial, localiza un reporte
2. Haz clic en el botón: **🗑️ (Eliminar)**
3. Resultado:
   - ✅ Toast: "Reporte eliminado"
   - ✅ Reporte desaparece del historial
   - ✅ Contador se actualiza

---

## PASO 11: Probar Múltiples Reportes

1. Genera 5 reportes diferentes:
   - Ventas (7 días)
   - Inventario
   - Gastos (15 días)
   - Cierres (30 días)
   - Financiero (Mes Actual)

2. Ve al historial
3. Resultado esperado:
   - ✅ "Historial (5)"
   - ✅ 5 tarjetas, cada una con su color
   - ✅ Ordenadas por fecha (más reciente primero)
   - ✅ Cada una con sus propios datos

---

## PASO 12: Verificar Consola

Abre la consola del navegador y verifica los logs:

```
📊 5 reportes cargados
✅ Reporte guardado: Reporte de Ventas (2026-02-13 a 2026-02-20)
📄 PDF generado: ventas_2026-02-13_2026-02-20.pdf
📊 Excel generado: ventas_2026-02-13_2026-02-20.xlsx
🗑️ Reporte eliminado: reporte-xxx
```

---

## PASO 13: Verificar LocalStorage

En la consola:

```javascript
// Ver reportes guardados
console.log(JSON.parse(localStorage.getItem('pos-reportes-generados')));

// Ver estructura de un reporte
const reportes = JSON.parse(localStorage.getItem('pos-reportes-generados'));
console.log(reportes[0]);

// Resultado esperado:
/*
{
  id: "reporte-1708459200000-abc123",
  tipo: "ventas",
  nombre: "Reporte de Ventas (2026-02-13 a 2026-02-20)",
  fechaGeneracion: "2026-02-20T12:00:00.000Z",
  fechaExpiracion: "2026-03-22T12:00:00.000Z",
  periodo: {
    inicio: "2026-02-13",
    fin: "2026-02-20"
  },
  datos: { ... },
  metadata: {
    totalRegistros: 20,
    generadoPor: "Sistema POS"
  }
}
*/
```

---

## PASO 14: Probar con Datos Reales

1. Ve a "📊 Punto de Venta"
2. Realiza 3-5 ventas reales
3. Ve a "💰 Gastos"
4. Registra 2-3 gastos
5. Regresa a "📊 Reportes"
6. Genera reporte de ventas (Hoy)
7. Genera reporte de gastos (Hoy)
8. Descarga PDFs
9. Verifica que contengan las ventas y gastos recién registrados

---

## ✅ CHECKLIST DE PRUEBAS

### Generación
- [ ] Reporte de Ventas generado correctamente
- [ ] Reporte de Inventario generado correctamente
- [ ] Reporte de Gastos generado correctamente
- [ ] Reporte de Cierres generado correctamente
- [ ] Reporte Financiero generado correctamente
- [ ] Períodos rápidos funcionan
- [ ] Fechas personalizadas funcionan
- [ ] Toast de éxito aparece

### Validaciones
- [ ] Período inválido (fin < inicio) rechazado
- [ ] Período > 30 días rechazado
- [ ] Campos vacíos rechazados
- [ ] Mensajes de error claros

### Almacenamiento
- [ ] Reportes guardados en localStorage
- [ ] Estructura de datos correcta
- [ ] Metadata completa
- [ ] Fecha de expiración calculada (+30 días)

### Historial
- [ ] Reportes listados correctamente
- [ ] Ordenados por fecha (reciente primero)
- [ ] Información completa visible
- [ ] Contador actualizado

### Expiración
- [ ] Días restantes calculados correctamente
- [ ] Advertencia aparece (< 7 días)
- [ ] Barra de progreso funciona
- [ ] Colores según urgencia
- [ ] Auto-eliminación funciona

### Exportación PDF
- [ ] PDF se descarga
- [ ] Nombre de archivo correcto
- [ ] Encabezado presente
- [ ] Datos correctos
- [ ] Tablas formateadas
- [ ] Paginación correcta

### Exportación Excel
- [ ] Excel se descarga
- [ ] Nombre de archivo correcto
- [ ] Múltiples hojas
- [ ] Datos correctos
- [ ] Formato apropiado

### Interfaz
- [ ] Tabs funcionan
- [ ] Selectores funcionan
- [ ] Botones responden
- [ ] Estados de carga funcionan
- [ ] Scrollbar visible y funcional

### Eliminación
- [ ] Eliminar manualmente funciona
- [ ] Toast de confirmación
- [ ] Reporte desaparece
- [ ] Contador se actualiza

---

## 🐛 PROBLEMAS COMUNES Y SOLUCIONES

### Problema 1: "No hay reportes generados"
**Causa:** No hay datos en localStorage  
**Solución:** Ejecuta el script de datos de prueba (Paso 1)

### Problema 2: PDF/Excel no se descarga
**Causa:** Bloqueador de ventanas emergentes  
**Solución:** Permite descargas en el navegador

### Problema 3: Reportes sin datos
**Causa:** Fechas incorrectas o sin datos en ese período  
**Solución:** Verifica fechas o genera datos de prueba

### Problema 4: Error al generar reporte
**Causa:** Datos corruptos en localStorage  
**Solución:** Limpia localStorage y regenera datos

```javascript
// Limpiar todo
localStorage.removeItem('pos-ventas');
localStorage.removeItem('pos-productos');
localStorage.removeItem('pos-gastos');
localStorage.removeItem('pos-cierres-caja');
localStorage.removeItem('pos-reportes-generados');
```

---

## 📊 DATOS ESPERADOS EN REPORTES

### Reporte de Ventas
- Total de ventas: Suma de todos los totales
- Transacciones: Cantidad de ventas
- Ticket promedio: Total / Transacciones
- Métodos de pago: Agrupado por método
- Top productos: Los 10 más vendidos

### Reporte de Inventario
- Total productos: Cantidad de productos
- Valor inventario: Σ(precio × stock)
- Valor costo: Σ(costo × stock)
- Stock bajo: Productos donde stock ≤ minStock
- Por vencer: Productos con vencimiento ≤ 7 días

### Reporte de Gastos
- Total gastos: Suma de montos
- Por categoría: Agrupado por categoría
- Promedio: Total / Cantidad

### Reporte de Cierres
- Total recaudado: Suma de totalVentas
- Diferencias: Suma de |diferencia|
- Método más usado: Mayor suma

### Reporte Financiero
- Utilidad neta: Ingresos - Gastos
- Margen: (Utilidad / Ingresos) × 100

---

## 🎉 CONFIRMACIÓN FINAL

Si completaste todos los pasos y verificaste el checklist, el Sistema de Reportes está funcionando al 100%.

### Indicadores de Éxito:
- ✅ 5 tipos de reportes se generan correctamente
- ✅ Datos reales del sistema son procesados
- ✅ PDFs y Excels se descargan con formato correcto
- ✅ Reportes se almacenan y listan
- ✅ Advertencias de expiración funcionan
- ✅ Auto-eliminación a los 30 días funciona
- ✅ Validaciones previenen errores
- ✅ Interfaz es intuitiva y responsiva

---

**¡Sistema de Reportes Funcional 100% Verificado!** 🎊

Desarrollado por **Codec Studio**  
CODEC POS v2.0
