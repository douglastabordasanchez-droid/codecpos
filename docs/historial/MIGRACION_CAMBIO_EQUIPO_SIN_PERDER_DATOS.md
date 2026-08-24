# Migración de CODECPOS a otro equipo (sin perder datos)

## Qué está pasando en tu caso

Si en el nuevo computador te sale **"Usuario o contraseña inválidos"** aunque estés seguro de la clave, en este proyecto la causa más común es:

1. **Validación de Machine ID en Supabase** (el equipo nuevo tiene otro identificador)
2. No se migraron correctamente los archivos de datos locales

> En este sistema, cambiar IP o conexión no debería bloquear por sí solo. El bloqueo suele ser por **Machine ID/licencia** o por falta de datos migrados.

---

## Dónde guarda datos CODECPOS

En Windows (Electron), el sistema guarda usuarios y respaldos en:

- `%APPDATA%\codecpos\CODEC_POS_Data\usuarios.json`
- `%APPDATA%\codecpos\CODEC_POS_Data\usuarios_backup.json`

Además, el sistema puede usar información local adicional (IndexedDB/localStorage) en el perfil de usuario de Windows.

---

## Método recomendado (seguro)

### 1) En el equipo viejo: crear respaldo

1. Cierra CODECPOS completamente.
2. Ejecuta: `RESPALDAR_DATOS_CODECPOS.bat`
3. Esto crea una carpeta en el Escritorio con fecha/hora y copia de datos.

### 2) Instala la nueva versión en el equipo nuevo

1. Compila normalmente tu instalador (`npm run compile` o tu flujo habitual).
2. Instala CODECPOS en el equipo nuevo.
3. **No borres datos del equipo viejo hasta validar acceso en el nuevo.**

### 3) Restaurar datos en el equipo nuevo

1. Cierra CODECPOS en el equipo nuevo.
2. Copia la carpeta de respaldo al nuevo equipo.
3. Ejecuta: `RESTAURAR_DATOS_CODECPOS.bat`
4. Sigue la instrucción de pegar la ruta del respaldo cuando el script la solicite.

### 4) Reautorizar Machine ID (clave para tu error actual)

Como el equipo es diferente, debes actualizar `machine_id` del cliente en Supabase:

1. En `clientes_pos`, ubica el cliente.
2. Opción A (recomendada): deja `machine_id` vacío para que en el próximo login se registre automáticamente.
3. Opción B: reemplaza `machine_id` por el del nuevo equipo.

Luego intenta login de nuevo con tu usuario/contraseña.

---

## Checklist de verificación

- Abre el POS en el equipo nuevo
- Inicia sesión con tu usuario
- Verifica productos, ventas, configuración y usuarios
- Si todo está bien, conserva el respaldo por seguridad

---

## Notas importantes

- Si el cliente está `suspendido` o `estado = VENCIDA`, también bloqueará el acceso.
- Si usas internet y Supabase está activo, prevalecen reglas de licencia/estado/machine_id.
- Mantén al menos 2 copias del respaldo antes de cualquier migración.
