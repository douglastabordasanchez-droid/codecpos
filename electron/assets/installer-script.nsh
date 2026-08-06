; CODEC POS v2.0 - Script NSIS Personalizado
; Este script preserva los datos del usuario durante actualizaciones

!macro customInstall
  ; Verificar si existe instalación previa
  IfFileExists "$APPDATA\CodecPOS\*.*" 0 NoBackup
    DetailPrint "Preservando datos del usuario..."
    
    ; Crear backup temporal de la base de datos
    CreateDirectory "$TEMP\CodecPOS_Backup"
    CopyFiles /SILENT "$APPDATA\CodecPOS\*.*" "$TEMP\CodecPOS_Backup"
    
    DetailPrint "Backup creado en: $TEMP\CodecPOS_Backup"
  NoBackup:
!macroend

!macro customUnInstall
  ; Preguntar si desea eliminar los datos del usuario
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "¿Desea eliminar también los datos del usuario (ventas, usuarios, configuración)?$\n$\nSi planea reinstalar CODEC POS, seleccione NO para conservar sus datos." \
    IDYES DeleteData IDNO KeepData
    
  DeleteData:
    DetailPrint "Eliminando datos del usuario..."
    RMDir /r "$APPDATA\CodecPOS"
    Goto Done
    
  KeepData:
    DetailPrint "Conservando datos del usuario en: $APPDATA\CodecPOS"
    
  Done:
!macroend

!macro customHeader
  ; Mensaje personalizado en el instalador
  !define MUI_WELCOMEPAGE_TITLE "Bienvenido a CODEC POS v2.0"
  !define MUI_WELCOMEPAGE_TEXT "Este asistente le guiará en la instalación de CODEC POS, el sistema de punto de venta profesional desarrollado por Codec Studio.$\n$\nSe recomienda cerrar todas las demás aplicaciones antes de continuar."
  
  !define MUI_FINISHPAGE_TITLE "¡CODEC POS instalado correctamente!"
  !define MUI_FINISHPAGE_TEXT "CODEC POS v2.0 se ha instalado en su equipo.$\n$\nPresione Finalizar para cerrar el asistente y ejecutar la aplicación."
  
  !define MUI_FINISHPAGE_RUN "$INSTDIR\CODEC POS.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Ejecutar CODEC POS ahora"
!macroend
