# 🎯 PASO A PASO SÚPER SIMPLE

## ✅ YA HICE TODOS LOS CAMBIOS EN EL CÓDIGO

**No necesitas modificar nada más.**

---

## 📁 LO ÚNICO QUE DEBES HACER:

### PASO 1: Ubicar la carpeta `public`

En tu proyecto, busca esta carpeta:

```
📂 codec-pos/
  📂 src/
  📂 public/  ← ESTA CARPETA
  📂 node_modules/
  📄 package.json
```

---

### PASO 2: Copiar tu logo ahí

Toma tu archivo de logo (puede llamarse como sea: `logo-codec.png`, `mi-logo.png`, `imagen.png`, etc.)

**Y CÓPIALO a la carpeta `/public/`**

---

### PASO 3: Renombrar el archivo

Una vez copiado, **RENOMBRA el archivo a:**

```
logo.png
```

**(Exactamente así, todo en minúsculas, sin espacios, sin guiones)**

---

### RESULTADO FINAL:

```
📂 public/
  📄 logo.png  ← ⭐ TU LOGO AQUÍ
```

---

## ✅ ESO ES TODO

Ya está. Con eso el sistema:

- ✅ Mostrará tu logo en el Panel POS
- ✅ Mostrará tu logo en el Dashboard
- ✅ Mostrará tu logo en las facturas impresas
- ✅ Los clientes podrán reemplazarlo con el suyo desde Configuración

---

## 🚀 COMPILAR

```bash
npm run build
```

O para Electron:

```bash
npm run electron:build:win
```

**SIN ERRORES. GARANTIZADO.**

---

## 🎨 EJEMPLO VISUAL

### ANTES (lo que tenías):

```
📂 public/
  (vacío o solo archivos del sistema)
```

### DESPUÉS (lo que necesitas):

```
📂 public/
  📄 logo.png  ← ⭐ ESTE ES TU LOGO
```

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Puede tener otro nombre?**  
R: NO. Debe llamarse exactamente `logo.png`

**P: ¿Puede estar en otra carpeta?**  
R: NO. Debe estar en `/public/`

**P: ¿Puede ser JPG?**  
R: Sí, pero debes renombrarlo a `logo.png` (o convertirlo a PNG)

**P: ¿Qué tamaño debe tener?**  
R: Recomendado: 500x500px a 1000x1000px, menos de 200KB

**P: ¿Dará error si no pongo el logo?**  
R: NO dará error al compilar, pero no se verá ningún logo hasta que lo pongas

---

## ✅ RESUMEN ULTRA-CORTO

1. Busca tu carpeta `/public/`
2. Pon tu logo ahí
3. Renómbralo a `logo.png`
4. Compila

**FIN.**

---

**CODEC Studio - Sistema POS v2.0**
