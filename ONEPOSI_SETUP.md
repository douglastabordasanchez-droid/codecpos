# 🖨️ Configuración Impresora Oneposi 85

## 📋 Guía Rápida de Instalación

### ✅ Tu impresora Oneposi 85 ya está soportada

CODEC POS v2.0 incluye soporte nativo para la impresora **Oneposi 85 (80mm)**.

---

## 🔌 Conexión de la Impresora

### Paso 1: Conectar físicamente
1. Conecta la impresora Oneposi 85 al puerto USB de tu computadora
2. Enciende la impresora
3. Espera a que Windows reconozca el dispositivo (instalará drivers automáticamente)

### Paso 2: Verificar puerto COM
1. Abre el **Administrador de dispositivos** de Windows (Win + X → Administrador de dispositivos)
2. Busca en **Puertos (COM y LPT)**
3. Deberías ver algo como:
   - `USB-SERIAL CH340 (COM3)` o
   - `USB Serial Port (COM5)` o
   - `Prolific USB-to-Serial (COM4)`
4. **Anota el número de puerto** (ej: COM3, COM5, etc.)

---

## 🚀 Detección Automática en CODEC POS

### Método 1: Detección Automática
1. Abre CODEC POS v2.0
2. Ve a **Dispositivos** en el menú lateral
3. El sistema escaneará automáticamente cada 5 segundos
4. Tu Oneposi 85 debería aparecer automáticamente como:
   ```
   ✅ Oneposi 85 (80mm)
   📍 Puerto: COM3 (ejemplo)
   🏭 Fabricante: Oneposi
   🔌 Estado: Conectado
   ```

### Método 2: Escaneo Manual
1. En la página de **Dispositivos**, haz clic en el botón **"Escanear"**
2. El sistema buscará todos los dispositivos conectados
3. La Oneposi 85 se agregará automáticamente a tu lista

---

## 🧪 Probar la Impresora

Una vez detectada:
1. Haz clic en el botón **"Probar"** en la tarjeta de tu impresora
2. La impresora debería imprimir un ticket de prueba con:
   - Logo CODEC POS
   - Confirmación de conexión
   - Puerto y configuración
   - Fecha y hora

### Ticket de Prueba Esperado:
```
   ═══════════════════════════
        CODEC POS
   ═══════════════════════════
     PRUEBA DE IMPRESION
   ═══════════════════════════
   
   ✓ Impresora conectada
   ✓ Puerto: COM3
   ✓ Ancho: 80mm
   ✓ Fecha: 24/02/2026 15:30
   
   ───────────────────────────
   Oneposi 85 Compatible ✓
   ESC/POS estándar
   
   
   
```

---

## 🔧 Configuración Avanzada

### Cambiar Parámetros de Comunicación
Si la impresora no funciona, ajusta estos parámetros:

1. Haz clic en **"Configurar"** en la tarjeta de la impresora
2. Ajusta:
   - **Velocidad (Baud Rate)**: `9600` (predeterminado) o `115200`
   - **Bits de Datos**: `8`
   - **Bits de Parada**: `1`
   - **Paridad**: `Ninguna`

### Identificadores de Hardware

Tu Oneposi 85 puede tener uno de estos VID/PID:

| Chip | Vendor ID | Product ID | Descripción |
|------|-----------|------------|-------------|
| NXP Original | `1fc9` | `2016` | Oneposi 85 (80mm) original |
| NXP 58mm | `1fc9` | `2015` | Oneposi 58 (58mm) |
| CH340 | `4348` | `5584` | Oneposi con chip CH340 |
| CH340 Alt | `1a86` | `7584` | Oneposi genérica |

---

## ❓ Solución de Problemas

### 🔴 Problema: La impresora no se detecta

**Solución 1: Verificar drivers USB**
```
1. Desconecta la impresora
2. Descarga drivers CH340:
   https://www.catalog.update.microsoft.com/Search.aspx?q=CH340
3. Instala los drivers
4. Reconecta la impresora
5. Escanea nuevamente en CODEC POS
```

**Solución 2: Verificar puerto manualmente**
```
1. Ve a Dispositivos > Ver log de consola (F12)
2. Busca líneas que digan:
   "❓ Dispositivo desconocido: VID=xxxx PID=yyyy"
3. Anota estos valores
4. Contacta soporte con esta información
```

### 🔴 Problema: La impresora se detecta pero no imprime

**Solución:**
1. Verifica que el papel esté bien colocado
2. Prueba cambiar el Baud Rate a `115200`
3. Asegúrate de que el puerto COM sea el correcto
4. Reinicia la aplicación CODEC POS

### 🔴 Problema: Imprime caracteres raros

**Solución:**
1. Configura la impresora
2. Cambia **Encoding** a `UTF-8`
3. Si persiste, prueba con `ISO-8859-1`

---

## 📞 Soporte Técnico

Si tu Oneposi 85 no se detecta después de seguir estos pasos:

1. **Captura de pantalla** del Administrador de Dispositivos
2. **Log de consola** (F12 en CODEC POS, sección Console)
3. **Número de serie** de la impresora (parte trasera)

Envía esta información a: **soporte@codecstudio.co**

---

## 🎯 Funcionalidades Soportadas

Tu Oneposi 85 soporta:

- ✅ Impresión de tickets de venta
- ✅ Corte automático de papel
- ✅ Códigos de barras
- ✅ Códigos QR
- ✅ Apertura de cajón monedero (si está conectado)
- ✅ Logos y gráficos
- ✅ Texto en negrita y diferentes tamaños
- ✅ Alineación (izquierda, centro, derecha)

---

## 📐 Especificaciones Técnicas

**Impresora Oneposi 85**
- Ancho de papel: 80mm (3 pulgadas)
- Velocidad: hasta 250mm/s
- Resolución: 203 DPI
- Interfaz: USB (Serial emulado)
- Protocolo: ESC/POS estándar
- Drivers: CH340 o compatibles
- Sistema operativo: Windows 7/8/10/11

---

## 🔐 Configuración Recomendada

```json
{
  "puerto": "COM3",
  "baudRate": 9600,
  "dataBits": 8,
  "stopBits": 1,
  "parity": "none",
  "ancho": 80,
  "encoding": "UTF-8"
}
```

---

## 🎉 ¡Listo!

Tu impresora Oneposi 85 está lista para usar con CODEC POS v2.0.

**Próximo paso:** Ve a la sección **Ventas** y realiza una venta de prueba para imprimir tu primer ticket.

---

*Documento actualizado: Febrero 24, 2026*
*CODEC POS v2.0 - Codec Studio*
