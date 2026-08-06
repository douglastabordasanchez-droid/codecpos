#!/usr/bin/env node

/**
 * 🔧 Script de configuración para Codec Verify
 * Configura las opciones de conexión y habilitación del sistema
 */

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  🔧 CONFIGURACIÓN DE CODEC VERIFY');
console.log('═══════════════════════════════════════════════════════════════\n');

// Configuración por defecto
const defaultConfig = {
  enabled: false, // Deshabilitado por defecto
  serverUrl: 'ws://localhost:3969/ws',
  autoConnect: false, // No conectar automáticamente
  showNotifications: true,
  playSound: true,
  timeout: 2000, // 2 segundos
  heartbeatInterval: 30000, // 30 segundos
};

console.log('📋 Configuración por defecto:\n');
console.log(JSON.stringify(defaultConfig, null, 2));

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  ℹ️  INSTRUCCIONES');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('1️⃣  Para HABILITAR Codec Verify:');
console.log('   → Ir a Configuración > Codec Verify en el POS');
console.log('   → Activar "Habilitar Codec Verify"');
console.log('   → Configurar URL del servidor (por defecto: ws://localhost:3969/ws)\n');

console.log('2️⃣  Para probar la conexión:');
console.log('   → Iniciar el servidor de Codec Verify:');
console.log('     cd server && npm start');
console.log('   → El POS se conectará automáticamente si está habilitado\n');

console.log('3️⃣  Para deshabilitarlo:');
console.log('   → Ir a Configuración > Codec Verify');
console.log('   → Desactivar "Habilitar Codec Verify"\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ✅ CONFIGURACIÓN LISTA');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('Codec Verify está configurado para conexión MANUAL.');
console.log('Esto evita loops infinitos y optimiza el rendimiento.\n');

console.log('Para más información, consulta:');
console.log('  /OPTIMIZACIONES_CODECVERIFY.md\n');
