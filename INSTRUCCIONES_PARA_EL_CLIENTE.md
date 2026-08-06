# 📦 CODEC POS v2.0 - Instalación y Primeros Pasos

## 🎯 Bienvenido a CODEC POS

**CODEC POS v2.0** es el sistema de punto de venta más completo para minimercados en Colombia. Diseñado para funcionar 100% offline, con integración de hardware, facturación electrónica DIAN y control total de inventario.

---

## 💾 INSTALACIÓN

### **Requisitos Mínimos del Equipo:**

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| **Sistema Operativo** | Windows 10 (64 bits) | Windows 11 (64 bits) |
| **Procesador** | Intel Core i3 | Intel Core i5 |
| **RAM** | 4 GB | 8 GB |
| **Disco Duro** | 2 GB libres | 10 GB libres |
| **Pantalla** | 1366×768 px | 1920×1080 px |

---

### **Paso 1: Ejecutar el Instalador**

1. **Doble click** en `CODECPOS-Setup-2.0.0.exe`
2. Windows puede mostrar una advertencia de seguridad:
   - Click en **"Más información"**
   - Click en **"Ejecutar de todas formas"**

---

### **Paso 2: Asistente de Instalación**

El instalador tiene **5 pantallas** profesionales:

#### **Pantalla 1: Bienvenida**
```
¡Bienvenido a CODEC POS v2.0!

Este asistente le guiará en la instalación...
[Siguiente >]
```
→ Click en **"Siguiente"**

---

#### **Pantalla 2: Términos y Condiciones**
```
Lea los términos y condiciones de uso...
[✓] Acepto los términos y condiciones
[Acepto >]
```
→ Marcar la casilla y click en **"Acepto"**

---

#### **Pantalla 3: Ubicación de Instalación**
```
Carpeta de destino:
C:\Program Files\CODECPOS\
[Examinar...]  [Siguiente >]
```
→ Dejar la ubicación por defecto (recomendado)
→ Click en **"Siguiente"**

---

#### **Pantalla 4: Progreso de Instalación**
```
Instalando CODEC POS v2.0...
████████████████████ 100%

✓ Verificando requisitos del sistema
✓ Instalando archivos principales
✓ Configurando estructura de datos
✓ Creando accesos directos
```
→ Esperar a que termine (1-2 minutos)

---

#### **Pantalla 5: Finalización**
```
¡Instalación Completada!

[✓] Ejecutar CODEC POS ahora
[✓] Crear acceso directo en Escritorio

[Finalizar]
```
→ Marcar ambas casillas (recomendado)
→ Click en **"Finalizar"**

---

## 🚀 PRIMER USO

### **Paso 1: Inicio de Sesión**

Al abrir CODEC POS por primera vez verás la pantalla de login:

```
┌─────────────────────────────────────┐
│        CODEC POS v2.0               │
│                                     │
│  Usuario:  [Admin_______________]  │
│  Contraseña: [******************]  │
│                                     │
│         [Iniciar Sesión]            │
└─────────────────────────────────────┘
```

**Credenciales por defecto:**
- **Usuario:** `Admin`
- **Contraseña:** `Noruega2025++*`

⚠️ **IMPORTANTE:** Cambia esta contraseña inmediatamente después del primer inicio.

---

### **Paso 2: Activación de Licencia**

Después del login, el sistema pedirá activación:

```
┌─────────────────────────────────────┐
│   Activar Licencia de CODEC POS     │
├─────────────────────────────────────┤
│                                     │
│  Clave de Licencia:                 │
│  [__________________________]       │
│                                     │
│  Plan: ○ BÁSICO  ● PREMIUM          │
│  Duración: ● 1 Año  ○ Vitalicia     │
│                                     │
│           [Activar]                 │
└─────────────────────────────────────┘
```

**Tu clave de licencia:**
```
──────────────────────────────────────
CODEC-XXXX-XXXX-XXXX-XXXX
──────────────────────────────────────
```

**Planes disponibles:**
- **BÁSICO:** Funcionalidades esenciales
- **PREMIUM:** Todas las funcionalidades + CODEC Verify

**Duraciones:**
- **1 Año:** Renovación anual
- **Vitalicia:** Uso permanente (pago único)

---

### **Paso 3: Configuración Inicial**

Después de activar, configura tu negocio:

#### **3.1 Datos del Negocio**
```
Nombre del Negocio: ________________
NIT/RUT: ___________________________
Dirección: _________________________
Teléfono: __________________________
Email: _____________________________
```

#### **3.2 Tipo de Negocio**
```
○ Minimercado / Tienda de Barrio
○ Supermercado
○ Panadería
○ Cafetería
○ Farmacia
○ Otro: _______________
```

#### **3.3 Configuración Fiscal** (para facturación DIAN)
```
Régimen Tributario:
○ Régimen Común
○ Régimen Simplificado

IVA por defecto: [19%]
Resolución DIAN: ___________________
```

---

## 📊 PRIMEROS PASOS

### **1️⃣ Crear Usuarios**

**Ubicación:** Menú lateral → 👥 **Usuarios**

**Tipos de usuario:**
- **Administrador:** Acceso total al sistema
- **Cajero:** Solo punto de venta y ventas

**Crear usuario:**
1. Click en **"+ Nuevo Usuario"**
2. Llenar datos:
   - Nombre completo
   - Cédula
   - Usuario (para login)
   - Contraseña
3. Asignar permisos
4. Click en **"Guardar"**

---

### **2️⃣ Agregar Productos**

**Ubicación:** Menú lateral → 📦 **Productos**

**Opción A: Agregar Manual**
1. Click en **"+ Nuevo Producto"**
2. Llenar información:
   - Código de barras (opcional)
   - Nombre del producto
   - Categoría
   - Precio de compra
   - Precio de venta
   - Stock inicial
   - Fecha de vencimiento (opcional)
3. Click en **"Guardar"**

**Opción B: Importar desde Excel/CSV**
1. Click en **"📥 Importar CSV"**
2. Descargar plantilla de ejemplo
3. Llenar la plantilla con tus productos
4. Subir el archivo
5. Verificar y confirmar

---

### **3️⃣ Realizar Ventas**

**Ubicación:** Menú lateral → 💰 **Punto de Venta**

**Proceso de venta:**
1. **Agregar productos:**
   - Escanear código de barras, O
   - Buscar por nombre
   - Click en el producto

2. **Ajustar cantidad:**
   - Click en **+** / **-** para modificar

3. **Aplicar descuento** (opcional):
   - Click en el ícono de descuento
   - Ingresar porcentaje o monto fijo

4. **Seleccionar método de pago:**
   - 💵 Efectivo
   - 💳 Tarjeta
   - 📱 Nequi (Premium)
   - 🏦 Transferencia
   - 💰 Daviplata
   - 🎫 Fiado

5. **Finalizar venta:**
   - Click en **"Finalizar Venta"**
   - Imprimir ticket (opcional)

---

### **4️⃣ Consultar Reportes**

**Ubicación:** Menú lateral → 📊 **Reportes**

**Reportes disponibles:**

| Reporte | Información |
|---------|-------------|
| **Ventas del día** | Total de ventas, productos más vendidos |
| **Inventario** | Stock actual, productos por vencer |
| **Flujo de caja** | Ingresos, egresos, balance |
| **Productos** | Análisis de rotación, margen de ganancia |
| **Clientes** | Ventas por cliente, fidelización |

**Exportar reportes:**
- 📄 PDF
- 📊 Excel
- 📧 Email (requiere configuración)

---

## 🔧 FUNCIONALIDADES PRINCIPALES

### **✅ Gestión de Inventario**
- Alta/baja/modificación de productos
- Control de stock en tiempo real
- Alertas de productos bajo stock
- Control de vencimientos
- Importación masiva CSV/Excel

### **✅ Punto de Venta**
- Interface rápida y eficiente
- Búsqueda instantánea de productos
- Múltiples métodos de pago
- Descuentos y promociones
- Impresión de tickets

### **✅ Facturación Electrónica**
- Compatible con estándares DIAN
- Generación de facturas en PDF
- Numeración automática
- Cálculo de impuestos

### **✅ Control Anti-Mermas**
- Alertas de productos próximos a vencer
- Sugerencias de promociones
- Control de pérdidas
- Reportes de mermas

### **✅ Sistema Multi-Tienda** (Premium)
- Gestión de múltiples sucursales
- Sincronización de inventario
- Reportes consolidados
- Control centralizado

### **✅ CODEC Verify** (Premium)
- Verificación de pagos Nequi
- Alertas de pago recibido
- Integración con POS
- Auditoría digital

---

## ⚙️ CONFIGURACIÓN AVANZADA

### **Cambiar Contraseña de Administrador**

1. Menú lateral → 🔐 **Desarrollador**
2. Tab **"🔒 Seguridad"**
3. Ingresar contraseña actual
4. Ingresar nueva contraseña (mínimo 6 caracteres)
5. Confirmar nueva contraseña
6. Click en **"Cambiar Contraseña"**

---

### **Configurar Impresora Térmica**

1. Menú lateral → ⚙️ **Configuración**
2. Tab **"🖨️ Dispositivos"**
3. Click en **"+ Agregar Dispositivo"**
4. Seleccionar tipo: **Impresora Térmica**
5. Configurar:
   - Puerto (USB/COM/IP)
   - Modelo (ESC/POS compatible)
   - Ancho de papel (58mm o 80mm)
6. Click en **"Probar Conexión"**
7. Click en **"Guardar"**

---

### **Realizar Backup Manual**

1. Menú lateral → ⚙️ **Configuración**
2. Tab **"💾 Backup"**
3. Click en **"Crear Backup Ahora"**
4. Seleccionar ubicación (USB recomendado)
5. Click en **"Guardar"**

**Backups automáticos:**
- Se crean automáticamente cada 24 horas
- Se guardan en: `C:\Users\[Usuario]\AppData\Roaming\codecpos\backups\`
- Se recomienda copiarlos a USB semanalmente

---

## 🎓 CAPACITACIÓN Y SOPORTE

### **Tutoriales en Video**
- 🎬 Canal de YouTube: [CODEC POS Tutoriales]
- 📺 Curso completo: 15 videos de 5-10 minutos

### **Manual de Usuario**
- 📖 PDF descargable desde el sistema
- 📚 Guía paso a paso con capturas de pantalla

### **Soporte Técnico**

**Horario de atención:**
- Lunes a Viernes: 8:00 AM - 6:00 PM
- Sábados: 9:00 AM - 2:00 PM

**Canales de contacto:**
- 📱 WhatsApp: **+57 323 864 6844** (soporte prioritario)
- 📧 Email: contacto@codecstudio.com
- 🌐 Web: https://codecstudio.online/soporte
- 💬 Chat en vivo: Desde el sistema (Premium)

---

## ❓ PREGUNTAS FRECUENTES

### **¿Necesito internet para usar CODEC POS?**
No. El sistema funciona 100% offline. Solo necesitas internet para:
- Descargar actualizaciones (opcional)
- Usar CODEC Verify (Premium)
- Enviar reportes por email

### **¿Puedo instalar CODEC POS en varios equipos?**
Cada licencia es para **un equipo**. Si necesitas usar en varios equipos, debes adquirir licencias adicionales.

### **¿Qué pasa si cambio de computador?**
Contacta a soporte para transferir la licencia. El proceso toma 24 horas.

### **¿Los datos se respaldan automáticamente?**
Sí, el sistema crea backups automáticos cada 24 horas. Pero se recomienda hacer backups manuales semanales en USB.

### **¿Puedo usar con impresora normal (no térmica)?**
Sí, pero se recomienda impresora térmica para tickets más profesionales y rápidos.

### **¿CODEC POS es compatible con DIAN?**
Sí, genera facturas compatibles con los estándares DIAN. Para facturación electrónica oficial, necesitas contratar un PAC (Proveedor Autorizado de Certificación).

### **¿Cómo actualizo a la última versión?**
Las actualizaciones se notifican dentro del sistema. Simplemente descarga el nuevo instalador y ejecuta. Tus datos se conservan.

---

## 🔒 SEGURIDAD Y PRIVACIDAD

### **Protección de Datos**
- ✅ Todos los datos se almacenan **localmente**
- ✅ **No se envía información** a servidores externos
- ✅ El usuario tiene **control total** de su información
- ✅ Sistema **offline** por defecto

### **Respaldos**
- ✅ Backups automáticos diarios
- ✅ Exportación manual a USB
- ✅ Cifrado opcional de backups (Premium)

### **Acceso Seguro**
- ✅ Sistema de usuarios con contraseñas
- ✅ Permisos diferenciados por rol
- ✅ Registro de acciones (auditoría)

---

## 📞 INFORMACIÓN DE CONTACTO

**Codec Studio**
- 🏢 Empresa: Codec Studio - Colombia
- 🌐 Web: https://codecstudio.online/
- 📧 Email: contacto@codecstudio.com
- 📱 WhatsApp: +57 323 864 6844
- 📍 Ubicación: Colombia

**Redes Sociales:**
- 📘 Facebook: /codecstudio
- 📸 Instagram: @codecstudio
- 🐦 Twitter: @codecstudio

---

## 🎉 ¡GRACIAS POR ELEGIR CODEC POS!

Estamos comprometidos en brindarte el mejor sistema POS para tu negocio.

**Si tienes alguna duda o sugerencia, no dudes en contactarnos.**

---

*CODEC POS v2.0 - Sistema de Punto de Venta Profesional*
*Copyright © 2026 Codec Studio - Todos los derechos reservados*
*Última actualización: Marzo 7, 2026*
