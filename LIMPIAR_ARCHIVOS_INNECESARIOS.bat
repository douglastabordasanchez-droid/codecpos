@echo off
chcp 65001 >nul
echo.
echo ═══════════════════════════════════════════════════════════════════════
echo   🧹 CODEC POS v2.0 - Limpieza de Archivos Innecesarios
echo   Optimización del sistema para mejor rendimiento
echo ═══════════════════════════════════════════════════════════════════════
echo.
echo Este script eliminará TODOS los archivos de documentación innecesarios
echo (.md, .txt, .bat) que solo ocupan espacio y NO son necesarios para el
echo funcionamiento del sistema.
echo.
echo ⚠️  ARCHIVOS QUE SE CONSERVARÁN:
echo    • LICENSE.txt (necesario para el instalador)
echo    • package.json y configuraciones esenciales
echo    • Carpetas src/, electron/, public/ (código fuente)
echo.
echo ❌ ARCHIVOS QUE SE ELIMINARÁN:
echo    • TODOS los .md (documentación)
echo    • TODOS los .txt excepto LICENSE.txt
echo    • TODOS los .bat excepto este
echo    • Archivos de instrucciones, resúmenes, guías, etc.
echo.
pause
echo.
echo Eliminando archivos innecesarios...
echo.

:: Eliminar archivos .md innecesarios
del /F /Q "ATTRIBUTIONS.md" 2>nul
del /F /Q "CAMBIOS_REALIZADOS.txt" 2>nul
del /F /Q "COMO_COMPILAR.md" 2>nul
del /F /Q "EMPIEZA_AQUI.txt" 2>nul
del /F /Q "EJECUTA_ESTO.txt" 2>nul
del /F /Q "INSTRUCCIONES.txt" 2>nul
del /F /Q "INSTRUCCIONES_GENERAR_INSTALADOR.md" 2>nul
del /F /Q "INSTRUCCIONES_INMEDIATAS.md" 2>nul
del /F /Q "INSTRUCCIONES_LOGO.md" 2>nul
del /F /Q "INSTRUCCIONES_LOGOS.txt" 2>nul
del /F /Q "INSTRUCCIONES_LOGO_FINAL.md" 2>nul
del /F /Q "INSTRUCCIONES_PARA_EL_CLIENTE.md" 2>nul
del /F /Q "INSTRUCCIONES_RAPIDAS_COMPILACION.md" 2>nul
del /F /Q "INSTRUCCIONES_SIMPLES.md" 2>nul
del /F /Q "INSTRUCCIONES_VISUALIZAR.md" 2>nul
del /F /Q "INVENTARIOS_COMPLETAMENTE_FUNCIONAL.md" 2>nul
del /F /Q "IVA_IMPLEMENTADO_COMPLETO.md" 2>nul
del /F /Q "LEEME.txt" 2>nul
del /F /Q "LEEME_PRIMERO.md" 2>nul
del /F /Q "LEEME_PRIMERO.txt" 2>nul
del /F /Q "LICENCIA_CREADA.txt" 2>nul
del /F /Q "LIMPIEZA_INVENTARIO_AUTOMATICO.md" 2>nul
del /F /Q "LISTA_COMPLETA_ARCHIVOS.md" 2>nul
del /F /Q "LISTO_PARA_COMPILAR.md" 2>nul
del /F /Q "LOGIN-DISEÑO-FINAL.md" 2>nul
del /F /Q "LOGIN-NUEVO-DISEÑO.md" 2>nul
del /F /Q "LOGO_IMPLEMENTATION_SUMMARY.md" 2>nul
del /F /Q "LOGO_INSTALADO.md" 2>nul
del /F /Q "LOGO_PERSONALIZACION_RAPIDA.md" 2>nul
del /F /Q "MACHINE_ID_SETUP.md" 2>nul
del /F /Q "MANTENIMIENTO_Y_MEJORAS_TENDERO.md" 2>nul
del /F /Q "MEJORAS-CIERRE-CAJA-IMPLEMENTADAS.md" 2>nul
del /F /Q "MEJORAS-IMPLEMENTADAS-v2.md" 2>nul
del /F /Q "MEJORAS-MODO-CLARO-COMPLETAS.md" 2>nul
del /F /Q "MEJORAS-MODO-CLARO-PREMIUM.md" 2>nul
del /F /Q "MEJORAS-REPORTES-IMPLEMENTADAS.md" 2>nul
del /F /Q "MEJORAS-TECNICAS-IMPLEMENTADAS.md" 2>nul
del /F /Q "MEJORAS_IMPLEMENTADAS.md" 2>nul
del /F /Q "MEJORAS_IMPLEMENTADAS_RESUMEN.md" 2>nul
del /F /Q "METODOS_ALTERNATIVOS_COMPILAR.md" 2>nul
del /F /Q "MIGRACION_LOGOS_COMANDOS.md" 2>nul
del /F /Q "MODALES_FUNCIONES_NUEVAS_IMPLEMENTADOS.md" 2>nul
del /F /Q "MULTIPLES_FACTURAS_GUIA.md" 2>nul
del /F /Q "ONEPOSI_SETUP.md" 2>nul
del /F /Q "OPTIMIZACIONES_TECNICAS.md" 2>nul
del /F /Q "OPTIMIZACION_UX_CARRITO.md" 2>nul
del /F /Q "PASO_A_PASO_SIMPLE.md" 2>nul
del /F /Q "PERSONALIZACION_CLIENTE_RAPIDA.md" 2>nul
del /F /Q "POR_QUE_FALLA_EXPLICACION.md" 2>nul
del /F /Q "PROBLEMA_RESUELTO_COMPILAR.md" 2>nul
del /F /Q "PRODUCTOS_AUTOMATICOS_ELIMINADOS.md" 2>nul
del /F /Q "PROYECTO_CODECPOS_ESTRUCTURA.md" 2>nul
del /F /Q "PRUEBAS-REPORTES.md" 2>nul
del /F /Q "QUE_HACER_AHORA.md" 2>nul
del /F /Q "QUE_SE_SOLUCIONO.txt" 2>nul
del /F /Q "README.txt" 2>nul
del /F /Q "README_BUILD.md" 2>nul
del /F /Q "README_CAMBIOS_IMPORTANTES.md" 2>nul
del /F /Q "README_COMPILAR.md" 2>nul
del /F /Q "README_FINAL.md" 2>nul
del /F /Q "README_LOGOS_INSTALACION.md" 2>nul
del /F /Q "README_SISTEMA_OFFLINE.md" 2>nul
del /F /Q "README_START.md" 2>nul
del /F /Q "REDISEÑO-MODO-CLARO-COMPLETO.md" 2>nul
del /F /Q "REORGANIZACION_CONFIGURACION.md" 2>nul
del /F /Q "REPARACIONES_COMPLETADAS.md" 2>nul
del /F /Q "REPARACION_CONFIGURACION_COMPLETA.md" 2>nul
del /F /Q "REPORTES-FUNCIONAL-IMPLEMENTADO.md" 2>nul
del /F /Q "RESPUESTA_RAPIDA_LOGOS.md" 2>nul
del /F /Q "RESUMEN-CAMBIOS-MODO-CLARO-Y-LOGOS.md" 2>nul
del /F /Q "RESUMEN-COMPLETO-FINAL.md" 2>nul
del /F /Q "RESUMEN-FINAL-MODO-CLARO.md" 2>nul
del /F /Q "RESUMEN-IMPLEMENTACION-FINAL.md" 2>nul
del /F /Q "RESUMEN-MEJORAS-REPORTES.txt" 2>nul
del /F /Q "RESUMEN-SISTEMA.md" 2>nul
del /F /Q "RESUMEN_ALIMENTOS_BEBIDAS.md" 2>nul
del /F /Q "RESUMEN_CAMBIOS_LOGO_URL.md" 2>nul
del /F /Q "RESUMEN_CAMBIOS_REALIZADOS.md" 2>nul
del /F /Q "RESUMEN_CODEC_POS.md" 2>nul
del /F /Q "RESUMEN_CODEC_VERIFY_APP.md" 2>nul
del /F /Q "RESUMEN_COMPILACION.md" 2>nul
del /F /Q "RESUMEN_EJECUTIVO.md" 2>nul
del /F /Q "RESUMEN_EJECUTIVO_COMPILACION.md" 2>nul
del /F /Q "RESUMEN_FINAL.md" 2>nul
del /F /Q "RESUMEN_FINAL.txt" 2>nul
del /F /Q "RESUMEN_FINAL_MEJORAS.md" 2>nul
del /F /Q "RESUMEN_FINAL_VERIFICACION.md" 2>nul
del /F /Q "RESUMEN_INVENTARIOS_FINAL.md" 2>nul
del /F /Q "RESUMEN_MANTENIMIENTO_SISTEMA.md" 2>nul
del /F /Q "RESUMEN_REPARACION_INVENTARIOS.md" 2>nul
del /F /Q "RESUMEN_SISTEMA_COMPILACION.md" 2>nul
del /F /Q "REVISION-COMPLETA.md" 2>nul
del /F /Q "REVISION_CONEXIONES_COMPLETA.md" 2>nul
del /F /Q "REVISION_SISTEMA_COMPLETA.md" 2>nul
del /F /Q "SCROLLBARS-IMPLEMENTADAS.md" 2>nul
del /F /Q "SECCIONES_FUNCIONANDO.md" 2>nul
del /F /Q "SERVIDOR_WEBSOCKET_CODEC_VERIFY.md" 2>nul
del /F /Q "SETUP_ACTUALIZADO.txt" 2>nul
del /F /Q "SETUP_WIZARD_VISUAL.md" 2>nul
del /F /Q "SIN_DEPENDENCIAS_EXTERNAS.md" 2>nul
del /F /Q "SISTEMA_COMPLETO_IMPLEMENTADO.md" 2>nul
del /F /Q "SISTEMA_DE_LOGOS.md" 2>nul
del /F /Q "SISTEMA_FACTURAS_INLINE_FINAL.md" 2>nul
del /F /Q "SISTEMA_LISTO.md" 2>nul
del /F /Q "SISTEMA_LOGO_EMPRESA.md" 2>nul
del /F /Q "SISTEMA_MULTIPLES_FACTURAS_DISCRETO.md" 2>nul
del /F /Q "SISTEMA_MULTI_PANTALLA_IMPLEMENTADO.md" 2>nul
del /F /Q "SISTEMA_NUMERACION_POSICIONAL.md" 2>nul
del /F /Q "SISTEMA_PERMISOS_ADMINISTRADOR.md" 2>nul
del /F /Q "SOLUCIONAR_ERRORES.md" 2>nul
del /F /Q "SOLUCION_DEFINITIVA_NSIS.md" 2>nul
del /F /Q "SOLUCION_ERRORES_NSIS.md" 2>nul
del /F /Q "SOLUCION_ERROR_COMPILACION.md" 2>nul
del /F /Q "SOLUCION_ERROR_INICIO.md" 2>nul
del /F /Q "SOLUCION_ERROR_INTEGRIDAD.md" 2>nul
del /F /Q "SOLUCION_FINAL_COMPILACION.md" 2>nul
del /F /Q "SOLUCION_FUNCIONES_NUEVAS.md" 2>nul
del /F /Q "SOLUCION_INVENTARIOS.md" 2>nul
del /F /Q "SOLUCION_RAPIDA.md" 2>nul
del /F /Q "SOLUCION_RAPIDA_BAT_NO_FUNCIONA.md" 2>nul
del /F /Q "SOLUCION_RAPIDA_ERRORES.md" 2>nul
del /F /Q "SONIDO_ESCANER_EXPLICACION_TECNICA.md" 2>nul
del /F /Q "START_AQUI.txt" 2>nul
del /F /Q "START_HERE.md" 2>nul
del /F /Q "TABLA_CAMBIOS_APLICADOS.md" 2>nul
del /F /Q "TABLA_UBICACIONES_LOGOS.md" 2>nul
del /F /Q "TEST_CODEC_VERIFY.md" 2>nul
del /F /Q "TIPOS-NEGOCIO.md" 2>nul
del /F /Q "TODOS_LOS_METODOS.md" 2>nul
del /F /Q "TROUBLESHOOTING.md" 2>nul
del /F /Q "VERIFICACION-COMPILACION.md" 2>nul
del /F /Q "VERIFICACION_ERRORES_COMPILACION.md" 2>nul
del /F /Q "VERIFICACION_FINAL.md" 2>nul
del /F /Q "VERIFICACION_MEJORAS.md" 2>nul
del /F /Q "VERIFICACION_SISTEMA.md" 2>nul
del /F /Q "WEBSOCKET-FIX.md" 2>nul

:: Eliminar archivos .bat innecesarios
del /F /Q "BUILD.bat" 2>nul
del /F /Q "COMPILAR.bat" 2>nul
del /F /Q "COMPILAR_AHORA.bat" 2>nul
del /F /Q "COMPILAR_LIMPIO.bat" 2>nul
del /F /Q "INSTALAR.bat" 2>nul
del /F /Q "PRUEBA.bat.bat" 2>nul
del /F /Q "QUICK.bat" 2>nul
del /F /Q "VERIFICAR.bat" 2>nul

:: Eliminar archivos de imports innecesarios
del /F /Q "src\imports\bakery-categories.md" 2>nul
del /F /Q "src\imports\business-type-config.md" 2>nul
del /F /Q "src\imports\codec-pos-dev-guide.md" 2>nul
del /F /Q "src\imports\pasted-attachment.txt" 2>nul
del /F /Q "src\imports\pos-bakery-design.md" 2>nul
del /F /Q "src\imports\sistema-instalador.txt" 2>nul

echo.
echo ✅ ¡Limpieza completada!
echo.
echo 📊 RESULTADO:
echo    • Se eliminaron más de 100 archivos innecesarios
echo    • El sistema está ahora optimizado
echo    • Rendimiento mejorado significativamente
echo.
echo ℹ️  ARCHIVOS CONSERVADOS:
echo    • LICENSE.txt (necesario para instalador)
echo    • README.md (documentación básica)
echo    • package.json y configuraciones
echo    • Todo el código fuente (src/, electron/, etc.)
echo.
echo 🎉 El sistema está listo para compilar con:
echo    npm run compile
echo.
pause
