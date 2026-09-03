import { config } from 'dotenv';
config();
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// 1) Archivos confirmados YA aplicados en la BD real (objetos de esquema
//    verificados uno por uno) -- solo se registran, NO se re-ejecutan (una
//    de ellas, 0055, define registrar_instalacion con la firma vieja; ya la
//    reemplazó 0059 -- re-ejecutar 0055 la regresaría a la versión vieja).
const soloRegistrar = [
  '0025_comandas_cocina_bar.sql', '0026_app_movil_habilitada.sql', '0027_menu_inferior_pwa.sql',
  '0028_promociones_proveedores_pwa.sql', '0029_fidelizacion_ingresos_pwa.sql', '0030_tiendas_pwa.sql',
  '0031_devoluciones_local_id.sql', '0032_perfil_empleado.sql', '0033_artes_graficas.sql',
  '0035_papeleria_pinateria.sql', '0038_productos_multi_foto.sql', '0039_artes_graficas_categoria_foto.sql',
  '0041_codec_verify_estado_dispositivo.sql', '0043_registrar_pago_automatico_texto_sms.sql',
  '0044_registrar_pago_automatico_notificaciones_push.sql', '0045_multi_tienda_acceso_lectura.sql',
  '0045_registrar_pago_automatico_fix_bancolombia.sql', '0047_motor_comercial_planes_precios_licencias.sql',
  '0049_admin_web_roles_auditoria_soporte.sql', '0050_seguridad_grants_anon_perfil_negocio_trial.sql',
  '0052_registro_publico_prueba_gratuita.sql', '0053_expirar_pruebas_gratuitas.sql',
  '0054_dashboard_pruebas_vencidas.sql', '0055_registro_extendido_e_instalaciones.sql',
  '0056_admin_detalle_instalaciones.sql', '0057_tiendas_tipo.sql', '0058_respaldos_nube.sql',
];

// 2) Idempotentes por diseño (UPDATE/INSERT con guardas WHERE NOT EXISTS,
//    bucket con ON CONFLICT DO NOTHING, REVOKE) -- ninguna toca funciones
//    tocadas por 0059, así que es seguro ejecutarlas de verdad ahora mismo
//    en vez de adivinar si ya corrieron antes. 0046 (login staff) también
//    entra aquí: confirmada como genuinamente no aplicada.
const ejecutarYRegistrar = [
  '0034_backfill_licencia_artes_graficas.sql',
  '0036_backfill_licencia_papeleria_pinateria.sql',
  '0037_menu_inferior_reemplaza_menu_por_producto.sql',
  '0040_artes_graficas_fotos_bucket.sql',
  '0042_backfill_venta_items_producto_id.sql',
  '0048_backfill_clientes_legacy_a_licencias.sql',
  '0051_revoca_escritura_anon_clientes_pos.sql',
  '0046_login_usuario_staff.sql',
];

const already = new Set((await client.query('select name from public._migrations')).rows.map((r) => r.name));

console.log('--- Registrando (sin re-ejecutar) ---');
for (const file of soloRegistrar) {
  if (already.has(file)) { console.log(`- ${file} ya registrada`); continue; }
  await client.query('insert into public._migrations (name) values ($1)', [file]);
  console.log(`OK registrada: ${file}`);
}

console.log('\n--- Ejecutando y registrando ---');
for (const file of ejecutarYRegistrar) {
  if (already.has(file)) { console.log(`- ${file} ya registrada`); continue; }
  const sql = fs.readFileSync(path.resolve('supabase/migrations', file), 'utf8');
  try {
    await client.query(sql);
    await client.query('insert into public._migrations (name) values ($1)', [file]);
    console.log(`OK aplicada y registrada: ${file}`);
  } catch (err) {
    console.error(`FALLO ${file}:`, err.message);
    process.exitCode = 1;
  }
}

const totalFiles = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length;
const totalRegistradas = (await client.query('select count(*) from public._migrations')).rows[0].count;
console.log(`\nTotal archivos: ${totalFiles} | Total registradas en _migrations: ${totalRegistradas}`);

await client.end();
