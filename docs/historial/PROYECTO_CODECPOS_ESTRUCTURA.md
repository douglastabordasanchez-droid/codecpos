# 🖥️ CODECPOS v2.0 - ESTRUCTURA DEL PROYECTO
## Sistema POS Completo para Minimercados de Alto Tráfico en Colombia

---

## 📁 ESTRUCTURA DE ARCHIVOS DEL PROYECTO

```
codecpos-v2/
│
├── public/                          # Archivos públicos
│   └── index.html
│
├── src/
│   ├── app/
│   │   ├── App.tsx                 # ✅ Componente principal (RouterProvider)
│   │   │
│   │   ├── routes.ts               # ✅ Configuración de rutas (React Router)
│   │   │
│   │   ├── components/
│   │   │   │
│   │   │   ├── pos/                # 🏪 Componentes del POS
│   │   │   │   ├── POSPageNew.tsx                # Interfaz principal de venta
│   │   │   │   ├── POSLayoutSidebar.tsx          # Layout con sidebar
│   │   │   │   ├── ProtectedLayout.tsx           # Protección de rutas
│   │   │   │   ├── LoginPage.tsx                 # Pantalla de login
│   │   │   │   ├── ConfiguracionPage.tsx         # ⚙️ Configuración (con personalización de tirilla)
│   │   │   │   ├── ProductosPage.tsx             # Gestión de productos
│   │   │   │   ├── InventarioPage.tsx            # Control de inventario
│   │   │   │   ├── VentasPage.tsx                # Historial de ventas
│   │   │   │   ├── ReportesPage.tsx              # Reportes y análisis
│   │   │   │   ├── CierreCajaPage.tsx            # Cierre de caja
│   │   │   │   ├── AlertasPage.tsx               # Alertas y notificaciones
│   │   │   │   └── NotFoundPage.tsx              # Página 404
│   │   │   │
│   │   │   ├── codecVerify/        # 🛡️ Componentes de Codec Verify
│   │   │   │   ├── CodecVerifyDemoPage.tsx       # Página principal del sistema
│   │   │   │   ├── CodecVerifyMobile.tsx         # Vista móvil
│   │   │   │   ├── CodecVerifyWidget.tsx         # Widget para POS
│   │   │   │   ├── AlertaPagoEntrante.tsx        # Sistema de alertas
│   │   │   │   ├── AuditoriaDigital.tsx          # Auditoría de transacciones
│   │   │   │   ├── EsperandoSeñal.tsx            # Estado de espera
│   │   │   │   ├── ConfiguradorParser.tsx        # Configuración de parsers
│   │   │   │   └── QRCodePOS.tsx                 # Generador de QR
│   │   │   │
│   │   │   ├── usuarios/           # 👥 Gestión de usuarios
│   │   │   │   ├── UsuariosPage.tsx              # Lista de usuarios
│   │   │   │   ├── ModalCrearUsuario.tsx         # Crear usuario
│   │   │   │   ├── ModalEditarUsuario.tsx        # Editar usuario
│   │   │   │   └── ModalPermisos.tsx             # Gestión de permisos
│   │   │   │
│   │   │   ├── electron/           # 🖥️ Integración Electron
│   │   │   │   ├── ElectronBridge.tsx            # Bridge con Electron
│   │   │   │   ├── PrinterService.tsx            # Servicio de impresión
│   │   │   │   ├── BarCodeScanner.tsx            # Lector de códigos
│   │   │   │   └── SyncStatusCard.tsx            # Estado de sincronización
│   │   │   │
│   │   │   └── ui/                 # 🎨 Componentes UI reutilizables
│   │   │       ├── button.tsx                    # Botón personalizado
│   │   │       ├── card.tsx                      # Tarjeta
│   │   │       ├── input.tsx                     # ✅ Input (con forwardRef)
│   │   │       ├── label.tsx                     # Etiqueta
│   │   │       ├── textarea.tsx                  # Área de texto
│   │   │       ├── dialog.tsx                    # Modal/Dialog
│   │   │       ├── select.tsx                    # Selector
│   │   │       ├── checkbox.tsx                  # Checkbox
│   │   │       ├── badge.tsx                     # Badge
│   │   │       └── utils.ts                      # Utilidades (cn)
│   │   │
│   │   └── contexts/               # 🔄 Contextos globales
│   │       ├── POSContext.tsx                    # Estado global del POS
│   │       └── AuthContext.tsx                   # Autenticación
│   │
│   ├── styles/
│   │   ├── theme.css               # 🎨 Variables CSS de Tailwind v4
│   │   ├── fonts.css               # Fuentes personalizadas
│   │   └── index.css               # Estilos globales
│   │
│   └── imports/                    # 📦 Assets importados de Figma
│       └── (imágenes y SVGs)
│
├── package.json                    # ✅ Dependencias del proyecto
├── tsconfig.json                   # Configuración de TypeScript
└── README.md                       # Documentación del proyecto
```

---

## 📱 ARCHIVOS CLAVE DEL PROYECTO

### **1. Componente Principal**
**Archivo:** `/src/app/App.tsx`
- Punto de entrada de la aplicación
- Configura `RouterProvider` de React Router
- Envuelve la app con `AuthProvider` y `POSProvider`

### **2. Rutas**
**Archivo:** `/src/app/routes.ts`
- Define todas las rutas de la aplicación
- Rutas protegidas con autenticación
- Lazy loading de componentes

### **3. Contextos Globales**

#### **POSContext** (`/src/app/contexts/POSContext.tsx`)
Estado global que maneja:
- Carrito de compras
- Productos
- Inventario
- Configuración del sistema
- Modo oscuro/claro
- Métodos de pago
- Facturación

#### **AuthContext** (`/src/app/contexts/AuthContext.tsx`)
Maneja:
- Login/Logout
- Usuarios activos
- Permisos
- Sesiones

### **4. Páginas Principales**

#### **POSPageNew** - Interfaz de Venta
```
┌─────────────────────────────────────────────────┐
│  BÚSQUEDA DE PRODUCTOS                          │
├──────────────────┬──────────────────────────────┤
│                  │  CARRITO                     │
│  PRODUCTOS       │  - Producto 1    $10,000    │
│  - Arroz         │  - Producto 2    $15,000    │
│  - Aceite        │  ───────────────────────     │
│  - Azúcar        │  TOTAL:          $25,000    │
│                  │  [EFECTIVO] [TARJETA]        │
│                  │  [TRANSFERENCIA] [NEQUI]     │
│                  │  [DAVIPLATA] [MIXTO]         │
└──────────────────┴──────────────────────────────┘
```

#### **ConfiguracionPage** - Configuración del Sistema
Incluye:
- ✅ Información de la empresa
- ✅ Configuración de impresora
- ✅ **Personalización de tirilla** (mensajes personalizados)
- ✅ Estado de sincronización
- ✅ Facturación electrónica DIAN (preparado para futuro)

#### **CodecVerifyDemoPage** - Sistema de Verificación
Sistema completo de verificación de pagos con:
- Vista demo
- App móvil simulada
- Widget POS
- Configuración de parsers

---

## 🔑 CARACTERÍSTICAS PRINCIPALES

### **💳 6 Métodos de Pago Locales**
1. **Efectivo** - Cálculo automático de cambio
2. **Tarjeta** - Integración con datáfono
3. **Transferencia** - Bancaria
4. **Nequi** - Billetera digital
5. **Daviplata** - Billetera digital
6. **Mixto** - Combinación de métodos

### **🖨️ Integración de Hardware**
- Báscula serial (COM/USB)
- Impresora térmica (58mm/80mm)
- Cajón de dinero
- Display cliente
- Escáner de códigos de barras
- Lector de tarjetas

### **📊 Gestión Completa**
- Control de inventario
- Alertas de stock mínimo
- Vencimientos de productos
- Historial de ventas
- Reportes diarios/mensuales
- Cierre de caja

### **🛡️ Codec Verify**
- Verificación de pagos en tiempo real
- App móvil para receptores
- Notificaciones push
- Auditoría digital completa
- Integración WebSocket

### **🎨 Interfaz Moderna**
- Glassmorphism design
- Modo oscuro/claro
- Responsive design
- Touch-friendly
- Animaciones con Motion

---

## 🚀 DEPENDENCIAS PRINCIPALES

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-router": "^7.x.x",
    "motion": "latest",
    "lucide-react": "latest",
    "sonner": "latest",
    "@radix-ui/react-*": "latest"
  }
}
```

---

## 💾 ALMACENAMIENTO

### **LocalStorage**
- Configuración de la empresa
- Productos y catálogo
- Historial de ventas
- Usuarios y permisos
- Configuración de tirilla

### **Session Storage**
- Carrito actual
- Usuario activo
- Estado de la sesión

---

## 🔐 SISTEMA DE AUTENTICACIÓN

### **Usuarios Predefinidos**
```javascript
// Usuario administrador
username: "admin"
password: "admin123"

// Usuario cajero
username: "cajero"
password: "cajero123"
```

### **Niveles de Permisos**
- Dashboard
- Ventas
- Inventario
- Productos
- Alertas
- Configuración
- Usuarios
- Cierre de caja
- Reportes
- Codec Verify

---

## 📄 PERSONALIZACIÓN DE TIRILLA

### **Campos Configurables**
1. **Mensaje de Despedida**
   - Ejemplo: "¡Gracias por su compra!"
   - Máximo: 50 caracteres

2. **Eslogan Comercial**
   - Ejemplo: "Tu tienda de confianza"
   - Máximo: 60 caracteres

### **Vista Previa en Tiempo Real**
La página de configuración muestra una tirilla de ejemplo que se actualiza mientras escribes.

---

## 🌐 INTEGRACIÓN CON CODEC VERIFY

### **Sistema de 3 Capas**

```
┌─────────────────┐
│   APP MÓVIL     │  (React Native + Expo)
│   (Receptores)  │
└────────┬────────┘
         │
         │ WebSocket
         ▼
┌─────────────────┐
│   SERVIDOR      │  (Node.js + Express + WebSocket)
│   (Backend)     │
└────────┬────────┘
         │
         │ API REST
         ▼
┌─────────────────┐
│   POS WEB       │  (React + TypeScript)
│   (Emisor)      │
└─────────────────┘
```

### **Flujo de Verificación**
1. Cajero procesa pago → Solicitud enviada
2. Servidor notifica → Receptores móviles
3. Receptor aprueba/rechaza → Respuesta
4. POS recibe confirmación → Completa venta

---

## 🎯 PRÓXIMAS FUNCIONALIDADES

### **Facturación Electrónica DIAN**
- ✅ UI preparada
- ⏳ Integración API DIAN
- ⏳ Generación de XML
- ⏳ Firma digital
- ⏳ Envío automático

### **Sincronización Multi-Terminal**
- ⏳ Base de datos centralizada
- ⏳ Sync en tiempo real
- ⏳ Modo offline

---

## 📱 APP MÓVIL CODEC VERIFY

**Documentación completa:** Ver archivo `CODEC_VERIFY_APP_MOBILE.md`

La aplicación móvil permite a los administradores:
- ✅ Recibir notificaciones de pagos en tiempo real
- ✅ Aprobar/rechazar pagos remotamente
- ✅ Ver historial de transacciones
- ✅ Estadísticas diarias
- ✅ Conexión estable con reconexión automática

---

## 🛠️ COMANDOS DE DESARROLLO

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Preview de producción
npm run preview
```

---

## 📂 RESUMEN

### **Sistema POS (Web)**
- ✅ Todos los archivos están en el proyecto actual
- ✅ No requiere archivos adicionales
- ✅ Configuración completada

### **App Móvil Codec Verify**
- ✅ Código completo en: `CODEC_VERIFY_APP_MOBILE.md`
- ✅ Instrucciones de instalación incluidas
- ✅ Listo para desarrollo en Expo

---

## 📞 SOPORTE

**Desarrollado por:** Codec Studio  
**Web:** https://codecstudio.online/  
**Versión:** 2.0.0  
**Licencia:** Propietaria

---

**© 2026 Codec Studio - CODECPOS v2.0**

---

## ✨ NOTAS IMPORTANTES

1. **El sistema POS está completo** - Todos los archivos ya están en el proyecto
2. **La app móvil está documentada** - Ver `CODEC_VERIFY_APP_MOBILE.md`
3. **Personalización de tirilla agregada** - Disponible en Configuración
4. **Input component corregido** - Ahora usa `React.forwardRef`
5. **Codec Verify con botón Volver** - Navegación mejorada

---

**🎉 ¡Proyecto listo para producción!**
