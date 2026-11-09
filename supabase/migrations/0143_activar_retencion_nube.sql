-- 0143 · ENCIENDE el borrado automático en la nube (2 a 4:45 a. m. de Colombia).
--
-- No aplicar hasta que los clientes tengan instalada la versión de Electron
-- que avisa que también se borra de la nube, y revisar antes la simulación:
--   select public.ejecutar_retencion_nube(true);
-- Para apagarlo: select cron.unschedule('retencion-nube');

select cron.schedule('retencion-nube', '*/15 7-9 * * *', 'select public.ejecutar_retencion_nube(false)');
