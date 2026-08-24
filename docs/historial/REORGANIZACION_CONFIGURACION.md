# Reorganización de Configuración del Sistema

## Cambios Solicitados:

### Nuevo Orden de Secciones:
1. ✅ **Información Básica** (empresa, NIT, logo, etc.)
2. ✅ **Tipo de Negocio** (configuración según tipo de negocio)
3. ✅ **Mensajes Personalizados** (eslogan, mensaje de despedida)
4. ✅ **Configuración IVA**
5. ✅ **Margen de Ganancia Automático**
6. ✅ **Facturación Electrónica** (SIN mencionar Siigo)
7. ✅ **Plan** (corregir para mostrar Premium correctamente)

### Secciones a ELIMINAR:
- ❌ Información del Sistema (MachineID) - mover a otra página
- ❌ Configuración de Impresora - mover a otra página

### Correcciones Específicas:
1. **Facturación Electrónica**: Quitar toda referencia a "Siigo" - solo mostrar "Configuración DIAN"
2. **Plan**: Corregir la detección para que muestre correctamente "Plan Premium" cuando corresponda
3. **Estado de secciones**: Información Básica abierta por defecto, el resto cerradas

## Implementación:
- Estado de sectionsOpen actualizado correctamente
- Orden de renderizado de componentes reorganizado
- Descripciones actualizadas
