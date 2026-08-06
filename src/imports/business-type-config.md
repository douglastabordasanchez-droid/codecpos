Nueva funcionalidad – Configuración de Tipo de Negocio
1️⃣ Nueva opción en Configuración

Agregar un campo obligatorio llamado:

Tipo de Negocio

Con las siguientes opciones:

Retail

Servicios

Bar

Panadería

Cafetería

Salón de onces

Restaurante

Otros

2️⃣ Activación condicional de módulo

Si el usuario selecciona:

Bar, Panadería, Cafetería, Salón de onces o Restaurante

Entonces:

En el menú lateral izquierdo debe aparecer automáticamente un nuevo módulo llamado:

🍽 Alimentos y Bebidas

Si el tipo de negocio es diferente:

Este módulo NO debe mostrarse.

3️⃣ Diseño del nuevo módulo “Alimentos y Bebidas”

Este módulo debe:

Tener interfaz tipo grid (similar a la imagen actual del POS).

Permitir crear productos con:

Imagen

Categoría

Precio

Variaciones (tamaño, ingredientes, extras)

Tiempo estimado de preparación

Área de producción (Cocina / Bar / Panadería)

4️⃣ Funcionalidad especializada

Este módulo debe incluir:

Gestión de comandas.

Estados de pedido:

Pendiente

En preparación

Listo

Entregado

Posibilidad de enviar pedido a:

Pantalla de cocina

Impresora de cocina

Impresora de bar

5️⃣ Integración con POS actual

El módulo:

Debe conectarse con inventario.

Debe descontar materia prima automáticamente.

Debe integrarse con facturación actual.

Debe sumar al total general del POS sin alterar la lógica financiera actual.

6️⃣ Personalización

Este módulo debe ser configurable por el usuario:

Crear categorías personalizadas.

Crear estaciones (Cocina, Barra, etc).

Activar o desactivar control de preparación.

Definir tiempos estimados.

🧱 Arquitectura clave (muy importante)

No modificar:

Flujo actual del POS.

Sistema de pagos.

Sistema de clientes.

Sistema de reportes.

Solo agregar un módulo adicional activado por condición.