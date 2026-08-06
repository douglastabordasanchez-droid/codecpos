# 🎨 INSTRUCCIONES: Colocar Logo Personalizado

## 📍 TU LOGO (Rayo Amarillo con "C")

He visto tu logo: **Rayo amarillo/naranja con letra "C" gris**.

---

## ✅ CÓMO COLOCARLO

### **Paso 1: Guardar tu logo**

Guarda la imagen de tu logo (la del rayo amarillo) en tu computadora.

### **Paso 2: Renombrarlo**

Renombra el archivo a exactamente:

```
logo.png
```

(minúsculas, sin espacios)

### **Paso 3: Copiarlo al proyecto**

Copia `logo.png` a esta ubicación:

```
codecpos/public/logo.png
```

**Comando Windows:**
```powershell
Copy-Item "C:\Descargas\logo.png" "public\logo.png"
```

**Comando Linux/Mac:**
```bash
cp ~/Descargas/logo.png public/logo.png
```

### **Paso 4: Verificar**

Verifica que el archivo existe:

**Windows:**
```powershell
Test-Path "public\logo.png"
# Debe decir: True
```

**Linux/Mac:**
```bash
ls -lh public/logo.png
# Debe mostrar: logo.png
```

---

## 🚀 COMPILAR CON TU LOGO

Una vez colocado el logo:

```bash
npm run electron:build
```

El instalador incluirá tu logo automáticamente.

---

## 📦 DÓNDE APARECERÁ TU LOGO

- ✅ Sidebar izquierdo
- ✅ Header superior
- ✅ Pantalla de login
- ✅ Icono de la aplicación
- ✅ Instalador NSIS

---

## ⚠️ IMPORTANTE

**Nombre exacto:** `logo.png` (minúsculas)  
**Ubicación exacta:** `/public/logo.png`  
**Tamaño recomendado:** 512×512 px o más  
**Formato:** PNG con transparencia

---

**¿Necesitas ayuda?**  
Contacta: contacto@codecstudio.com
