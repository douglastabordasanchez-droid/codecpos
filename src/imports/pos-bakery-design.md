1. Lo que está mal en el diseño actual

Está pensado como “gestión de productos”.

No tiene carrito visible.

No tiene zona de venta activa.

No está diseñado para uso táctil rápido.

No se siente como caja registradora.

Un cajero de panadería no quiere administrar, quiere vender en 3 clics.

🎯 2. Cómo debe funcionar el POS de Panadería

Te voy a estructurar exactamente cómo debes darle las instrucciones a Figma o al desarrollador.

🧩 ESTRUCTURA IDEAL DEL POS ALIMENTOS Y BEBIDAS
Layout dividido en 2 grandes columnas:
🟦 IZQUIERDA (70%) → Zona de Productos
🟩 DERECHA (30%) → Carrito / Venta Activa
🟦 ZONA IZQUIERDA – CATEGORÍAS

Arriba:

Botón: Nueva Venta

Cliente (opcional)

Tipo de venta (Mostrador / Para llevar / Domicilio)

Debajo:

🔹 Sección de Categorías (botones grandes tipo tarjeta)

Ejemplo:

🥖 Pan

🥐 Pastelería

🥞 Desayunos

🥪 Combos

☕ Bebidas

Cuando se toca una categoría:
→ Se abre el grid de productos de esa categoría.
(NO modal flotante incómodo, sino que reemplaza la vista)

🟦 Al tocar "Pan"

Se abre grid:

| Pan francés | Pan integral | Pan queso | Pan coco |

Botones grandes
Con:

Imagen

Precio

Stock disponible pequeño abajo

Al tocar uno:
→ Se agrega automáticamente al carrito
→ Si necesita variantes (ejemplo tamaño, adicional queso), ahí sí abre modal.

🟩 ZONA DERECHA – CARRITO (CLAVE)

Debe verse siempre.

Contiene:

Lista vertical:

Pan francés x2 $4.000
Pan queso x1 $3.000

Subtotal
Descuento
Total

Botones grandes abajo:

🟢 COBRAR
🟡 Descuento
🔵 Cancelar

Esto es el corazón del POS.

💳 Al tocar COBRAR

Se abre modal de pago:

Opciones grandes:

Efectivo

Transferencia

Tarjeta

Mixto

Al confirmar:

✔ Descuenta inventario
✔ Guarda venta
✔ Suma a reportes
✔ Actualiza dashboard
✔ Imprime (si aplica)

📦 LÓGICA DE INVENTARIO (IMPORTANTE)

Cada producto debe tener:

Stock inicial

Unidad de medida

Al vender → stock = stock - cantidad vendida

Si llega a 0:

Se desactiva automáticamente o muestra "Sin stock"

🧠 FLUJO COMPLETO

Cajero abre nueva venta

Toca categoría

Toca producto

Se agrega al carrito

Cobra

Sistema:

Guarda venta

Descuenta inventario

Actualiza dashboard

Suma ingresos

Eso es integración real.