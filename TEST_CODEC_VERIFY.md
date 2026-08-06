# 🧪 SCRIPT DE PRUEBAS AUTOMATIZADAS - CODEC VERIFY

## 🎯 TESTS AUTOMATIZADOS PARA VERIFICAR TODO EL SISTEMA

---

## 📋 TEST 1: VERIFICAR BACKEND (Supabase)

### **Comando cURL - Generar PIN**

```bash
#!/bin/bash

echo "🔐 TEST 1: Generando PIN desde servidor..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Reemplaza con tu Project ID real
PROJECT_ID="YOUR_PROJECT_ID"
URL="https://${PROJECT_ID}.supabase.co/functions/v1/make-server-3969f5dd/codecverify/generar-pin"

RESPONSE=$(curl -s -X POST "$URL" -H "Content-Type: application/json")

echo "$RESPONSE" | jq .

# Verificar si tiene PIN
PIN=$(echo "$RESPONSE" | jq -r '.pin')

if [ "$PIN" != "null" ] && [ -n "$PIN" ]; then
  echo "✅ TEST 1 PASÓ: PIN generado = $PIN"
else
  echo "❌ TEST 1 FALLÓ: No se pudo generar PIN"
  exit 1
fi

echo ""
```

**Resultado esperado**:
```json
{
  "success": true,
  "pin": "482917",
  "expira": 1708650000000,
  "mensaje": "PIN generado exitosamente. Válido por 10 minutos."
}
```

---

## 📋 TEST 2: VERIFICAR VALIDACIÓN DE PIN

```bash
#!/bin/bash

echo "🔑 TEST 2: Validando PIN..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PROJECT_ID="YOUR_PROJECT_ID"
PIN="482917" # Usar el PIN del test anterior
URL="https://${PROJECT_ID}.supabase.co/functions/v1/make-server-3969f5dd/codecverify/validar-pin"

RESPONSE=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PIN\"}")

echo "$RESPONSE" | jq .

# Verificar si obtuvo token
TOKEN=$(echo "$RESPONSE" | jq -r '.token')
VALIDO=$(echo "$RESPONSE" | jq -r '.valido')

if [ "$VALIDO" == "true" ] && [ "$TOKEN" != "null" ]; then
  echo "✅ TEST 2 PASÓ: Token obtenido = ${TOKEN:0:20}..."
  echo "$TOKEN" > /tmp/codec_verify_token.txt
else
  echo "❌ TEST 2 FALLÓ: PIN inválido o expirado"
  exit 1
fi

echo ""
```

**Resultado esperado**:
```json
{
  "success": true,
  "valido": true,
  "token": "cv_1708650000000_abc123xyz789",
  "mensaje": "App vinculada exitosamente"
}
```

---

## 📋 TEST 3: VERIFICAR DASHBOARD (Con token)

```bash
#!/bin/bash

echo "📊 TEST 3: Obteniendo Dashboard..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PROJECT_ID="YOUR_PROJECT_ID"
TOKEN=$(cat /tmp/codec_verify_token.txt)
URL="https://${PROJECT_ID}.supabase.co/functions/v1/make-server-3969f5dd/codecverify/dashboard"

RESPONSE=$(curl -s -X GET "$URL" \
  -H "Authorization: Bearer $TOKEN")

echo "$RESPONSE" | jq .

# Verificar que tenga datos
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
  echo "✅ TEST 3 PASÓ: Dashboard obtenido correctamente"
else
  echo "❌ TEST 3 FALLÓ: No se pudo obtener dashboard"
  exit 1
fi

echo ""
```

**Resultado esperado**:
```json
{
  "success": true,
  "negocio": {
    "nombre": "CODEC POS v2.0",
    "nit": "900123456-7"
  },
  "dashboard": {
    "ventasHoy": 450000,
    "ventasMes": 12000000,
    "productosVendidos": 145,
    "bajoStock": 8
  }
}
```

---

## 📋 TEST 4: VERIFICAR WEBSOCKET (Node.js)

Crear archivo `test_websocket.js`:

```javascript
const io = require('socket.io-client');

console.log('🔌 TEST 4: Probando WebSocket...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Leer token del test anterior
const fs = require('fs');
const token = fs.readFileSync('/tmp/codec_verify_token.txt', 'utf8');

const PROJECT_ID = 'YOUR_PROJECT_ID';
const URL = `wss://${PROJECT_ID}.supabase.co/functions/v1/make-server-3969f5dd`;

const socket = io(URL, {
  auth: { token: token },
  transports: ['websocket'],
  reconnection: false,
});

let testPassed = false;

socket.on('connect', () => {
  console.log('✅ Conectado al servidor WebSocket');
  
  // Enviar notificación de prueba
  const payment = {
    id: 'test-001',
    monto: 50000,
    banco: 'nequi',
    remitente: 'JUAN TEST',
    timestamp: new Date().toLocaleTimeString('es-CO'),
  };
  
  console.log('📤 Enviando notificación de pago...');
  
  socket.emit('payment:notification', payment, (response) => {
    if (response.success) {
      console.log('✅ TEST 4 PASÓ: Notificación enviada correctamente');
      testPassed = true;
    } else {
      console.log('❌ TEST 4 FALLÓ: Error enviando notificación');
      console.log('Error:', response.error);
    }
    
    socket.disconnect();
    process.exit(testPassed ? 0 : 1);
  });
});

socket.on('payment:incoming', (payment) => {
  console.log('📥 Pago recibido en POS:', payment);
});

socket.on('connect_error', (error) => {
  console.log('❌ TEST 4 FALLÓ: Error de conexión');
  console.log('Error:', error.message);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('Desconectado:', reason);
});

// Timeout de 10 segundos
setTimeout(() => {
  if (!testPassed) {
    console.log('❌ TEST 4 FALLÓ: Timeout (10s)');
    socket.disconnect();
    process.exit(1);
  }
}, 10000);
```

**Ejecutar**:
```bash
node test_websocket.js
```

**Resultado esperado**:
```
✅ Conectado al servidor WebSocket
📤 Enviando notificación de pago...
✅ TEST 4 PASÓ: Notificación enviada correctamente
```

---

## 📋 TEST 5: PARSER DE SMS (Unit Test)

Crear archivo `test_parser.ts`:

```typescript
import { parseSMS, SMS_EXAMPLES } from '../src/utils/bankPatterns';

console.log('🔍 TEST 5: Probando Parser de SMS...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

let testsPassed = 0;
let testsFailed = 0;

// Test 1: Nequi
const testNequi = parseSMS('NEQUI', SMS_EXAMPLES.nequi);
if (testNequi && testNequi.amount === 50000 && testNequi.bank === 'nequi') {
  console.log('✅ Test Nequi: PASÓ');
  testsPassed++;
} else {
  console.log('❌ Test Nequi: FALLÓ');
  console.log('Esperado: {amount: 50000, bank: "nequi"}');
  console.log('Obtenido:', testNequi);
  testsFailed++;
}

// Test 2: Daviplata
const testDaviplata = parseSMS('DAVIPLATA', SMS_EXAMPLES.daviplata);
if (testDaviplata && testDaviplata.amount === 30000 && testDaviplata.bank === 'daviplata') {
  console.log('✅ Test Daviplata: PASÓ');
  testsPassed++;
} else {
  console.log('❌ Test Daviplata: FALLÓ');
  testsFailed++;
}

// Test 3: Bancolombia
const testBancolombia = parseSMS('BANCOLOMBIA', SMS_EXAMPLES.bancolombia);
if (testBancolombia && testBancolombia.amount === 100000 && testBancolombia.bank === 'bancolombia') {
  console.log('✅ Test Bancolombia: PASÓ');
  testsPassed++;
} else {
  console.log('❌ Test Bancolombia: FALLÓ');
  testsFailed++;
}

// Test 4: Dale
const testDale = parseSMS('DALE', SMS_EXAMPLES.dale);
if (testDale && testDale.amount === 25000 && testDale.bank === 'dale') {
  console.log('✅ Test Dale: PASÓ');
  testsPassed++;
} else {
  console.log('❌ Test Dale: FALLÓ');
  testsFailed++;
}

// Test 5: SMS inválido
const testInvalido = parseSMS('RANDOM', 'Mensaje sin monto');
if (testInvalido === null) {
  console.log('✅ Test SMS Inválido: PASÓ (correctamente rechazado)');
  testsPassed++;
} else {
  console.log('❌ Test SMS Inválido: FALLÓ (debería ser null)');
  testsFailed++;
}

console.log('');
console.log(`📊 Resumen: ${testsPassed} pasados, ${testsFailed} fallados`);

if (testsFailed === 0) {
  console.log('✅ TEST 5 PASÓ: Todos los parsers funcionan correctamente');
  process.exit(0);
} else {
  console.log('❌ TEST 5 FALLÓ: Algunos parsers no funcionan');
  process.exit(1);
}
```

**Ejecutar**:
```bash
npx ts-node test_parser.ts
```

---

## 📋 TEST 6: INTEGRACIÓN COMPLETA (E2E)

Script completo que ejecuta todos los tests:

```bash
#!/bin/bash

echo "╔════════════════════════════════════════════════════╗"
echo "║   CODEC VERIFY - TEST SUITE COMPLETO               ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Generar PIN
echo "━━━ TEST 1/6: Generar PIN ━━━"
./test_generar_pin.sh
if [ $? -eq 0 ]; then
  ((TESTS_PASSED++))
  echo -e "${GREEN}✅ Test 1 PASÓ${NC}"
else
  ((TESTS_FAILED++))
  echo -e "${RED}❌ Test 1 FALLÓ${NC}"
fi
echo ""

# Test 2: Validar PIN
echo "━━━ TEST 2/6: Validar PIN ━━━"
./test_validar_pin.sh
if [ $? -eq 0 ]; then
  ((TESTS_PASSED++))
  echo -e "${GREEN}✅ Test 2 PASÓ${NC}"
else
  ((TESTS_FAILED++))
  echo -e "${RED}❌ Test 2 FALLÓ${NC}"
fi
echo ""

# Test 3: Dashboard
echo "━━━ TEST 3/6: Dashboard ━━━"
./test_dashboard.sh
if [ $? -eq 0 ]; then
  ((TESTS_PASSED++))
  echo -e "${GREEN}✅ Test 3 PASÓ${NC}"
else
  ((TESTS_FAILED++))
  echo -e "${RED}❌ Test 3 FALLÓ${NC}"
fi
echo ""

# Test 4: WebSocket
echo "━━━ TEST 4/6: WebSocket ━━━"
node test_websocket.js
if [ $? -eq 0 ]; then
  ((TESTS_PASSED++))
  echo -e "${GREEN}✅ Test 4 PASÓ${NC}"
else
  ((TESTS_FAILED++))
  echo -e "${RED}❌ Test 4 FALLÓ${NC}"
fi
echo ""

# Test 5: Parser SMS
echo "━━━ TEST 5/6: Parser SMS ━━━"
npx ts-node test_parser.ts
if [ $? -eq 0 ]; then
  ((TESTS_PASSED++))
  echo -e "${GREEN}✅ Test 5 PASÓ${NC}"
else
  ((TESTS_FAILED++))
  echo -e "${RED}❌ Test 5 FALLÓ${NC}"
fi
echo ""

# Test 6: End-to-End (manual)
echo "━━━ TEST 6/6: End-to-End (Manual) ━━━"
echo "Este test requiere intervención manual:"
echo "1. Abrir POS → Codec Verify"
echo "2. Abrir app móvil"
echo "3. Vincular con PIN"
echo "4. Simular pago Nequi"
echo "5. Verificar que aparezca modal en POS"
echo ""
read -p "¿El test E2E pasó? (y/n): " e2e_result

if [ "$e2e_result" == "y" ]; then
  ((TESTS_PASSED++))
  echo -e "${GREEN}✅ Test 6 PASÓ${NC}"
else
  ((TESTS_FAILED++))
  echo -e "${RED}❌ Test 6 FALLÓ${NC}"
fi
echo ""

# Resumen
echo "╔════════════════════════════════════════════════════╗"
echo "║              RESUMEN DE TESTS                      ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo -e "Pasados:  ${GREEN}${TESTS_PASSED}/6${NC}"
echo -e "Fallados: ${RED}${TESTS_FAILED}/6${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 ¡TODOS LOS TESTS PASARON!${NC}"
  echo "✅ Sistema CODEC VERIFY completamente funcional"
  exit 0
else
  echo -e "${RED}⚠️  ALGUNOS TESTS FALLARON${NC}"
  echo "Revisar logs arriba para detalles"
  exit 1
fi
```

**Ejecutar**:
```bash
chmod +x run_all_tests.sh
./run_all_tests.sh
```

---

## 📊 RESULTADOS ESPERADOS

### **Si todos los tests pasan**:

```
╔════════════════════════════════════════════════════╗
║   CODEC VERIFY - TEST SUITE COMPLETO               ║
╚════════════════════════════════════════════════════╝

━━━ TEST 1/6: Generar PIN ━━━
✅ Test 1 PASÓ

━━━ TEST 2/6: Validar PIN ━━━
✅ Test 2 PASÓ

━━━ TEST 3/6: Dashboard ━━━
✅ Test 3 PASÓ

━━━ TEST 4/6: WebSocket ━━━
✅ Test 4 PASÓ

━━━ TEST 5/6: Parser SMS ━━━
✅ Test 5 PASÓ

━━━ TEST 6/6: End-to-End ━━━
✅ Test 6 PASÓ

╔════════════════════════════════════════════════════╗
║              RESUMEN DE TESTS                      ║
╚════════════════════════════════════════════════════╝

Pasados:  6/6
Fallados: 0/6

🎉 ¡TODOS LOS TESTS PASARON!
✅ Sistema CODEC VERIFY completamente funcional
```

---

## 🔧 CONFIGURACIÓN DE CI/CD (Opcional)

### **GitHub Actions**

Crear `.github/workflows/test-codec-verify.yml`:

```yaml
name: Test CODEC VERIFY

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Test Generar PIN
        run: |
          RESPONSE=$(curl -s -X POST "https://${{ secrets.PROJECT_ID }}.supabase.co/functions/v1/make-server-3969f5dd/codecverify/generar-pin")
          PIN=$(echo "$RESPONSE" | jq -r '.pin')
          if [ -z "$PIN" ]; then exit 1; fi
      
      - name: Test Parser SMS
        run: |
          npm install
          npx ts-node test_parser.ts

  test-websocket:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install socket.io-client
      
      - name: Test WebSocket
        run: node test_websocket.js
```

---

## 📝 LOGGING Y DEBUGGING

### **Habilitar logs detallados**

En el servidor (Supabase):

```typescript
// Nivel de log
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

function log(level: string, message: string, data?: any) {
  if (shouldLog(level)) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      data: data,
    }));
  }
}

// Usar en el código
log('info', 'PIN generado', { pin: pin });
log('debug', 'WebSocket conectado', { socketId: socket.id });
log('error', 'Error procesando pago', { error: error.message });
```

### **Ver logs en tiempo real**

```bash
# Supabase logs
supabase functions logs make-server-3969f5dd --follow

# React Native logs
npx react-native log-android

# POS logs (Electron DevTools)
# Presionar F12 en el POS
```

---

## ✅ CHECKLIST FINAL DE TESTING

- [ ] ✅ Test 1: Backend genera PIN
- [ ] ✅ Test 2: Backend valida PIN
- [ ] ✅ Test 3: Backend retorna dashboard
- [ ] ✅ Test 4: WebSocket conecta y envía
- [ ] ✅ Test 5: Parser detecta todos los bancos
- [ ] ✅ Test 6: E2E funciona completo
- [ ] ✅ App móvil compila sin errores
- [ ] ✅ POS recibe notificaciones
- [ ] ✅ Modal aparece correctamente
- [ ] ✅ Confirmación bidireccional funciona
- [ ] ✅ Logs muestran información correcta
- [ ] ✅ Sin errores en consola

---

## 🎯 RESULTADO ESPERADO

Si **TODOS** los tests pasan:

✅ **Tu sistema CODEC VERIFY está 100% operacional y listo para producción**

Puedes proceder con confianza a:
1. Deploy final
2. Publicación en Play Store
3. Documentación de usuario
4. Capacitación de personal

---

**CODEC VERIFY** - Suite de Tests Completa 🧪✅

*Tests automatizados para garantizar calidad y funcionamiento*
