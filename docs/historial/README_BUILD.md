# 🚀 COMPILAR CODEC POS v2.0 A EJECUTABLE (.EXE)

## ⚡ INICIO ULTRA-RÁPIDO

### **¿Primera vez compilando? Sigue estos 3 pasos:**

```powershell
# 1️⃣ Crear icono (si no existe)
# Descarga: https://www.iconarchive.com/download/i103476/paomedia/small-n-flat/shop.ico
# Guardar en: electron/assets/icon.ico

# 2️⃣ Ejecutar compilador (PowerShell como Administrador)
.\scripts\build.ps1

# 3️⃣ Obtener instalador
# Ubicación: dist-electron/CODECPOS-Setup-2.0.0.exe
```

**⏱️ Tiempo total: ~15 minutos**

---

## 📚 DOCUMENTACIÓN COMPLETA

| Documento | Para qué sirve | Lectura |
|-----------|----------------|---------|
| **[BUILD_QUICKSTART.md](BUILD_QUICKSTART.md)** | Guía rápida de compilación | 5 min |
| **[COMPILACION.md](COMPILACION.md)** | Guía completa y detallada | 15 min |
| **[RESUMEN_COMPILACION.md](RESUMEN_COMPILACION.md)** | Resumen ejecutivo | 3 min |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Solución de problemas | Referencia |
| **[scripts/generate-icon.md](scripts/generate-icon.md)** | Crear icono de la app | 5 min |

---

## 🎯 COMANDOS PRINCIPALES

```bash
# ⚡ BUILD COMPLETO (Recomendado)
npm run electron:build:win

# 🚀 BUILD RÁPIDO (Sin instalador)
npm run compile:quick

# 🧹 LIMPIAR + BUILD
npm run compile:clean

# 📦 SOLO EMPAQUETAR (Testing)
npm run pack

# 🔄 SCRIPT AUTOMATIZADO
npm run compile
```

---

## 🛠️ HERRAMIENTAS DISPONIBLES

### **1. Script PowerShell (Recomendado para Windows)**
```powershell
# Build completo
.\scripts\build.ps1

# Build rápido
.\scripts\build.ps1 -Quick

# Limpiar antes
.\scripts\build.ps1 -Clean

# Logs detallados
.\scripts\build.ps1 -Verbose
```

### **2. Script Node.js (Multiplataforma)**
```bash
npm run compile
```

### **3. Comandos NPM Directos**
```bash
npm run electron:build:win     # Solo Windows
npm run electron:build:all     # Todas las plataformas
```

---

## ✅ REQUISITOS PREVIOS

Antes de compilar, necesitas:

- ✅ **Node.js 18+** → https://nodejs.org/
- ✅ **npm 9+** (incluido con Node.js)
- ✅ **Windows 10/11** (para compilar .exe)
- ✅ **PowerShell como Administrador**
- ✅ **Icono de la app** → `electron/assets/icon.ico`

---

## 🎨 CREAR EL ICONO

El icono es **OBLIGATORIO**. Tres opciones:

### **Opción 1: Herramienta Online (Más Rápido)**
```
1. Ir a: https://icoconvert.com/
2. Subir imagen PNG 512x512 o mayor
3. Marcar todos los tamaños
4. Descargar icon.ico
5. Guardar en: electron/assets/icon.ico
```

### **Opción 2: Descargar Icono Genérico**
```
https://www.iconarchive.com/download/i103476/paomedia/small-n-flat/shop.ico
Renombrar a: icon.ico
Guardar en: electron/assets/icon.ico
```

### **Opción 3: Crear con GIMP/Photoshop**
Ver guía completa: [scripts/generate-icon.md](scripts/generate-icon.md)

---

## 📦 RESULTADO DE LA COMPILACIÓN

Después del build exitoso encontrarás:

```
📁 dist-electron/
├── 🎁 CODECPOS-Setup-2.0.0.exe          ← INSTALADOR FINAL
│   ├── Tamaño: ~150-250 MB
│   └── Distribuir este archivo a clientes
│
└── 📂 win-unpacked/                      ← Para testing
    └── CODECPOS.exe                      ← Ejecutable directo
        └── Tamaño: ~450-650 MB
```

---

## 🐛 ERRORES COMUNES

### **❌ "icon.ico not found"**
```bash
# Crear el icono - Ver instrucciones arriba
```

### **❌ "node-gyp not found"**
```bash
npm install -g node-gyp windows-build-tools
```

### **❌ "serialport binding failed"**
```bash
npm run rebuild
```

### **❌ "Out of memory"**
```powershell
$env:NODE_OPTIONS="--max-old-space-size=8192"
npm run electron:build:win
```

### **❌ Antivirus bloquea el build**
```
1. Desactivar Windows Defender temporalmente
2. Agregar excepción para la carpeta del proyecto
3. Ejecutar como Administrador
```

**Para más soluciones:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## ⏱️ TIEMPOS ESTIMADOS

| Comando | Tiempo | Descripción |
|---------|--------|-------------|
| `.\scripts\build.ps1` | ~15 min | Build completo |
| `npm run compile:quick` | ~8 min | Build rápido |
| `npm run pack` | ~5 min | Solo empaquetar |

**💡 Factores que afectan el tiempo:**
- CPU (más núcleos = más rápido)
- SSD vs HDD (2-3x diferencia)
- RAM disponible
- Antivirus activo

---

## 🎯 TESTING DEL BUILD

### **Test Rápido (Sin instalar):**
```bash
# 1. Build rápido
npm run pack

# 2. Ejecutar directamente
cd dist-electron/win-unpacked
./CODECPOS.exe
```

### **Test Completo (Instalador):**
```bash
# 1. Build completo
npm run electron:build:win

# 2. Instalar en máquina limpia
dist-electron/CODECPOS-Setup-2.0.0.exe

# 3. Probar funcionalidades clave
- Login (admin/admin123)
- Nueva venta
- Impresora Oneposi 85
- Margen de ganancia personalizado
- Dashboard
```

---

## 📊 CHECKLIST POST-COMPILACIÓN

Después de compilar, verificar:

- [ ] ✅ El instalador se ejecuta sin errores
- [ ] ✅ La aplicación inicia correctamente
- [ ] ✅ Login funciona (8 usuarios de prueba)
- [ ] ✅ Impresora Oneposi 85 detectada
- [ ] ✅ Sistema de margen personalizado operativo
- [ ] ✅ Dashboard muestra estadísticas en tiempo real
- [ ] ✅ Gestión de turnos funciona
- [ ] ✅ MachineID correcto: `053AB44C-3059-11B2-A85C-C55A8EBA4E8B`
- [ ] ✅ WhatsApp actualizado: `+573238646844`

---

## 🔐 FIRMA DE CÓDIGO (Opcional)

Para distribución profesional sin advertencias de seguridad:

```javascript
// Actualizar electron/builder-config.js
win: {
  certificateFile: 'path/to/certificate.pfx',
  certificatePassword: process.env.CERTIFICATE_PASSWORD,
  signAndEditExecutable: true
}
```

**Certificados recomendados:**
- DigiCert EV Code Signing (~$250/año)
- Sectigo Code Signing (~$150/año)

---

## 💻 REQUISITOS DEL CLIENTE FINAL

Para instalar CODEC POS v2.0, el cliente necesita:

- **Sistema Operativo:** Windows 10/11 (64-bit)
- **Procesador:** Intel Core i3 o equivalente
- **RAM:** 4 GB mínimo (8 GB recomendado)
- **Disco:** 500 MB libres
- **Puerto USB:** Para impresora térmica Oneposi 85
- **Permisos:** Administrador (para instalación)

---

## 📞 SOPORTE

### **Recursos:**
- 📖 Documentación: Ver archivos `.md` en la raíz
- 🐛 Problemas: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- 🎨 Iconos: [scripts/generate-icon.md](scripts/generate-icon.md)

### **Contacto:**
- 📧 Email: soporte@codecstudio.com
- 💬 WhatsApp: **+573238646844**
- 🌐 Web: https://codecstudio.com

---

## 🎉 LISTO PARA COMPILAR

```powershell
# ¡Ejecuta esto AHORA!
.\scripts\build.ps1
```

**En ~15 minutos tendrás:**
- ✅ Instalador profesional NSIS
- ✅ Icono personalizado
- ✅ Listo para distribuir
- ✅ Compatible con Windows 10/11

---

## 📈 PRÓXIMOS PASOS

Después de compilar exitosamente:

1. **Probar en máquina limpia** (sin herramientas de desarrollo)
2. **Validar impresora Oneposi 85**
3. **Configurar usuarios de prueba**
4. **Distribuir a clientes**
5. **Recopilar feedback**
6. **Planear v2.1** con mejoras

---

## 🏆 CARACTERÍSTICAS DE CODEC POS v2.0

**Recién implementadas:**
- ✅ Sistema de margen de ganancia personalizado
- ✅ Cálculo automático por porcentaje del costo
- ✅ Integración completa con Dashboard
- ✅ Toggle activable/desactivable
- ✅ Persistencia en localStorage

**Todas las funcionalidades:**
- ✅ Múltiples facturas simultáneas
- ✅ Sistema de turnos para cajeros
- ✅ Panel de empleados completo
- ✅ 8 usuarios de prueba configurados
- ✅ MachineID real del hardware
- ✅ WhatsApp actualizado
- ✅ Facturación electrónica DIAN
- ✅ 6 métodos de pago colombianos
- ✅ Anti-mermas con control de vencimientos
- ✅ Impresora Oneposi 85 nativa

---

**Desarrollado con ❤️ por Codec Studio**
**Sistema POS #1 para Minimercados en Colombia 🇨🇴**

---

## 🚀 SIGUIENTE PASO

```powershell
# Copia y pega esto en PowerShell (como Administrador):
.\scripts\build.ps1

# ¿No funciona? Lee la documentación:
Get-Content BUILD_QUICKSTART.md
```

**¡Vamos a compilar CODEC POS v2.0!** 🎯
