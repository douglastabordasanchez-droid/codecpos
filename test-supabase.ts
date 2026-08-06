/**
 * 🧪 SCRIPT DE PRUEBA - CONEXIÓN SUPABASE
 * Prueba la conexión y crea un usuario administrador de prueba
 */

import { getSupabaseClient, testSupabaseConnection } from './src/app/lib/supabase/config';
import { getHardwareId } from './src/app/lib/supabase/hardwareService';

async function testConnection() {
  console.log('🔍 INICIANDO PRUEBA DE CONEXIÓN A SUPABASE...\n');

  // 1. Verificar conexión
  console.log('1️⃣ Probando conexión...');
  const connected = await testSupabaseConnection();

  if (!connected) {
    console.error('❌ ERROR: No se pudo conectar a Supabase');
    console.error('   Verifica que las credenciales en config.ts sean correctas');
    process.exit(1);
  }

  console.log('✅ Conexión exitosa a Supabase\n');

  // 2. Obtener Hardware ID
  console.log('2️⃣ Obteniendo Hardware ID...');
  const hardwareId = await getHardwareId();
  console.log('✅ Hardware ID:', hardwareId, '\n');

  // 3. Verificar si ya existe el usuario admin
  const client = getSupabaseClient();
  if (!client) {
    console.error('❌ Cliente de Supabase no disponible');
    process.exit(1);
  }

  console.log('3️⃣ Verificando si existe usuario admin@codec.com...');
  const { data: existingUsers, error: searchError } = await client
    .from('usuarios_pos')
    .select('*')
    .eq('username', 'admin@codec.com');

  if (searchError) {
    console.error('❌ Error buscando usuario:', searchError.message);
    process.exit(1);
  }

  if (existingUsers && existingUsers.length > 0) {
    console.log('✅ Usuario admin@codec.com ya existe');
    console.log('   ID:', existingUsers[0].id);
    console.log('   Nombre:', existingUsers[0].nombre_completo);
    console.log('   Hardware Autorizado:', existingUsers[0].hardware_id_autorizado || 'any');
    console.log('   Activo:', existingUsers[0].activo ? 'Sí' : 'No');
    console.log('\n🎉 PRUEBA COMPLETA - Sistema listo para usar');
    process.exit(0);
  }

  // 4. Crear usuario administrador
  console.log('⚙️ Creando usuario administrador...');

  const adminUser = {
    username: 'admin@codec.com',
    password_hash: btoa('Noruega2025++*'), // Base64 de la contraseña
    nombre_completo: 'Administrador CODEC',
    cedula: '1000000000',
    rol: 'super_usuario',
    activo: true,
    hardware_id_autorizado: 'any', // Puede iniciar en cualquier equipo
    permisos: {
      dashboard: true,
      ventas: true,
      productos: true,
      alertas: true,
      configuracion: true,
      usuarios: true,
      cierreCaja: true,
      reportes: true,
      gastos: true,
      codecVerify: true,
      devoluciones: true,
      empleados: true,
      multitienda: true,
      fidelizacion: true,
    },
  };

  const { data: newUser, error: insertError } = await client
    .from('usuarios_pos')
    .insert([adminUser])
    .select()
    .single();

  if (insertError) {
    console.error('❌ Error creando usuario:', insertError.message);
    process.exit(1);
  }

  console.log('✅ Usuario administrador creado exitosamente');
  console.log('   ID:', newUser.id);
  console.log('   Username: admin@codec.com');
  console.log('   Password: Noruega2025++*');
  console.log('   Rol: Super Usuario');
  console.log('   Hardware Autorizado: any (cualquier equipo)');

  console.log('\n🎉 CONFIGURACIÓN COMPLETA');
  console.log('\n📝 Credenciales de acceso:');
  console.log('   Usuario: admin@codec.com');
  console.log('   Contraseña: Noruega2025++*');
  console.log('\n✅ Ahora puedes iniciar sesión en CODEC POS');
}

// Ejecutar prueba
testConnection().catch(err => {
  console.error('❌ ERROR FATAL:', err);
  process.exit(1);
});

// Función btoa para Node.js (si no existe)
if (typeof btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}
