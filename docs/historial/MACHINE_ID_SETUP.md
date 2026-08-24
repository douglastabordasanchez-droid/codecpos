# CODEC POS v2.0 - Sistema de MachineID Real

## 🔑 Obtención del UUID Real del Sistema

Este sistema ahora utiliza el **UUID real del hardware** de tu computadora para generar el MachineID.

### ✅ Cambios Implementados:

1. **`/src/app/utils/machineId.ts`** - Utilidad para obtener el UUID real
2. **`/electron/preload.js`** - Expone las APIs de Electron al renderer
3. **`/electron/main.js`** - Obtiene el UUID usando comandos nativos del SO
4. **`/src/app/contexts/LicenseContext.tsx`** - Actualizado para usar UUID real
5. **`/src/app/components/pos/ConfiguracionPage.tsx`** - Muestra indicador de carga

---

## 🚀 Cómo Ejecutar en Electron

### Método 1: Desarrollo (Recomendado para testing)

```bash
# 1. Asegúrate de estar en el directorio del proyecto
cd codecpos

# 2. Instalar dependencias (si no lo has hecho)
npm install

# 3. Ejecutar en modo desarrollo con Electron
npm run electron:dev
```

### Método 2: Build y Ejecutar

```bash
# 1. Construir la aplicación
npm run electron:build:win

# 2. La aplicación compilada estará en /dist
# Ejecutar el instalador generado
```

---

## ⚡ Permisos de Administrador en Windows

### ¿Por qué se necesitan permisos de administrador?

El comando `wmic csproduct get uuid` en Windows requiere permisos elevados para acceder al UUID del hardware.

### Opción A: Ejecutar como Administrador (Recomendado)

1. **Busca el ejecutable de Electron** (después de hacer build):
   - Ubicación: `dist/win-unpacked/CODEC POS.exe`

2. **Click derecho** → **Ejecutar como administrador**

3. El sistema ahora obtendrá el UUID real: `053AB44C-3059-11B2-A85C-C55A8EBA4E8B`

### Opción B: Durante Desarrollo

```bash
# En PowerShell (como Administrador)
cd codecpos
npm run electron:dev
```

Para abrir PowerShell como administrador:
1. Presiona `Win + X`
2. Selecciona "Windows PowerShell (Administrador)" o "Terminal (Administrador)"
3. Navega al proyecto y ejecuta `npm run electron:dev`

---

## 🖥️ Compatibilidad por Sistema Operativo

### Windows
- **Comando**: `wmic csproduct get uuid`
- **Fallback**: PowerShell con `Get-CimInstance`
- **Requiere**: Permisos de administrador

### macOS
- **Comando**: `system_profiler SPHardwareDataType | grep "Hardware UUID"`
- **No requiere**: Permisos especiales

### Linux
- **Método 1**: `cat /etc/machine-id`
- **Método 2**: `sudo dmidecode -s system-uuid` (requiere root)

---

## 🔍 Verificación del MachineID

### Antes (Fallback del navegador):
```
CODEC-0000-3D1E-2DE6
```

### Después (UUID real):
```
053AB44C-3059-11B2-A85C-C55A8EBA4E8B
```

---

## 📋 Flujo de Generación del MachineID

```
┌─────────────────────────────────────┐
│    Aplicación Electron Inicia       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  LicenseContext se inicializa       │
│  Llama a getRealMachineUUID()       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  ¿Detecta Electron?                 │
├─────────────────────────────────────┤
│  ✅ Sí → Llamar IPC a main process  │
│  ❌ No → Usar fallback (navegador)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Main Process (electron/main.js)    │
│  Ejecuta comando según SO:          │
├─────────────────────────────────────┤
│  Windows: wmic csproduct get uuid   │
│  macOS:   system_profiler           │
│  Linux:   /etc/machine-id           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Retorna UUID al renderer           │
│  Ejemplo: 053AB44C-3059-11B2-A85C   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Guarda en localStorage:            │
│  codecpos_machine_id                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Muestra en Configuración           │
│  Usuario puede copiar para activar  │
└─────────────────────────────────────┘
```

---

## ⚠️ Notas Importantes

1. **Primera ejecución**: El MachineID se genera en el primer inicio
2. **Persistencia**: Se guarda en `localStorage` para consultas futuras
3. **Fallback automático**: Si falla la obtención del UUID real, usa fingerprinting del navegador
4. **Seguridad**: El UUID no es sensible, es como una "matrícula" de la máquina
5. **Unicidad**: Cada computadora tiene un UUID único e inmutable

---

## 🐛 Debugging

### Ver logs en la consola

Abre DevTools en Electron (F12) y busca estos mensajes:

```javascript
✅ UUID de Windows obtenido: 053AB44C-3059-11B2-A85C-C55A8EBA4E8B
🔐 MachineID generado: 053AB44C-3059-11B2-A85C-C55A8EBA4E8B
```

### Si ves esto, hay un problema:

```javascript
⚠️ No se pudo obtener UUID real. Usando fallback.
CODEC-0000-3D1E-2DE6
```

**Solución**: Ejecuta la aplicación con permisos de administrador.

---

## 📞 Soporte

Si tienes problemas con el MachineID:

📱 WhatsApp: +57 323 864 6844  
🏢 Codec Studio

---

## ✨ Características del Sistema de Licencias

- ✅ MachineID basado en UUID real del hardware
- ✅ Protección anti-piratería robusta
- ✅ Vinculación permanente máquina ↔ licencia
- ✅ Sistema de fallback inteligente
- ✅ Compatible con Windows, macOS y Linux
- ✅ Sin dependencias de servidores externos
