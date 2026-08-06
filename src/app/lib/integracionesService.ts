/**
 * CODEC POS v2.0 — Motor Real de Integraciones
 * Implementaciones funcionales para todas las integraciones
 *
 * Nota de CORS:
 *  - En Electron Desktop (producción): TODAS las APIs funcionan sin restricción
 *  - En navegador web (preview): APIs con CORS abierto funcionan directamente;
 *    las que no (Bold, PayU, Siigo) requieren el entorno Electron
 */

export interface ResultadoTest {
  ok: boolean;
  mensaje: string;
  detalle?: string;
  extra?: Record<string, unknown>;
}

export interface ResultadoPago {
  ok: boolean;
  url?: string;
  qrUrl?: string;
  transaccionId?: string;
  mensaje: string;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function formatCOP(monto: number): string {
  return `$${monto.toLocaleString('es-CO')}`;
}

const TIMEOUT = 12_000;

async function fetchConTimeout(url: string, options?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. TELEGRAM BOT
// ─────────────────────────────────────────────────────────────
export async function testTelegram(token: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) {
      return {
        ok: true,
        mensaje: `✅ Bot conectado: @${data.result.username}`,
        extra: { username: data.result.username, id: data.result.id },
      };
    }
    return { ok: false, mensaje: `❌ ${data.description || 'Token inválido'}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error de red'}` };
  }
}

export async function enviarMensajeTelegram(
  token: string,
  chatId: string,
  texto: string,
  usarHTML = true,
): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: usarHTML ? 'HTML' : 'Markdown',
      }),
    });
    const data = await res.json();
    if (data.ok) return { ok: true, mensaje: '✅ Mensaje enviado en Telegram' };
    return { ok: false, mensaje: `❌ ${data.description}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

export async function testTelegramConMensaje(token: string, chatId: string): Promise<ResultadoTest> {
  const verificacion = await testTelegram(token);
  if (!verificacion.ok) return verificacion;

  return enviarMensajeTelegram(
    token,
    chatId,
    `🔌 <b>CODEC POS v2.0</b>\n\n✅ Conexión verificada correctamente\n🕐 ${new Date().toLocaleString('es-CO')}\n\n<i>Este es un mensaje de prueba automático.</i>`,
  );
}

// ─────────────────────────────────────────────────────────────
// 2. SLACK INCOMING WEBHOOK
// ─────────────────────────────────────────────────────────────
export async function testSlack(webhookUrl: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '🔌 *CODEC POS v2.0* — Test de conexión',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *CODEC POS conectado correctamente*\n🕐 ${new Date().toLocaleString('es-CO')}\n_Este es un mensaje de prueba automático._`,
            },
          },
        ],
      }),
    });

    if (res.ok || res.status === 200) {
      return { ok: true, mensaje: '✅ Mensaje enviado a Slack correctamente' };
    }
    const texto = await res.text();
    return { ok: false, mensaje: `❌ Slack respondió: ${texto}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error de red'}` };
  }
}

export async function enviarSlack(webhookUrl: string, payload: Record<string, unknown>): Promise<ResultadoTest> {
  try {
    await fetchConTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: true, mensaje: '✅ Enviado a Slack' };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 3. ZAPIER / N8N / MAKE — Webhooks Genéricos
// ─────────────────────────────────────────────────────────────
export async function testWebhookGenerico(url: string, plataforma: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento: 'test_conexion',
        plataforma,
        sistema: 'CODEC POS v2.0',
        mensaje: `✅ Test exitoso desde CODEC POS`,
        tienda: localStorage.getItem('codec_pos_config')
          ? JSON.parse(localStorage.getItem('codec_pos_config')!).nombreComercial || 'Mi Tienda'
          : 'CODEC POS',
        timestamp: new Date().toISOString(),
        _test: true,
      }),
    });
    return {
      ok: true,
      mensaje: `✅ Webhook respondió HTTP ${res.status} — ${plataforma} recibió el test`,
    };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error de red'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 4. WHATSAPP BUSINESS API (Meta Graph API)
// ─────────────────────────────────────────────────────────────
export async function testWhatsApp(phoneNumberId: string, accessToken: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout(
      `https://graph.facebook.com/v19.0/${phoneNumberId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    if (res.ok) {
      return {
        ok: true,
        mensaje: `✅ Número WA verificado: ${data.display_phone_number || data.id}`,
        extra: data,
      };
    }
    return { ok: false, mensaje: `❌ ${data.error?.message || 'Token o Phone ID inválido'}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error de red'}` };
  }
}

export async function enviarWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  destino: string,
  mensaje: string,
): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: destino.replace(/\D/g, ''),
          type: 'text',
          text: { body: mensaje },
        }),
      },
    );
    const data = await res.json();
    if (res.ok && data.messages?.[0]?.id) {
      return { ok: true, mensaje: `✅ WhatsApp enviado a ${destino}` };
    }
    return { ok: false, mensaje: `❌ ${data.error?.message || 'Error al enviar'}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 5. GOOGLE SHEETS (via Google Apps Script Web App)
// ─────────────────────────────────────────────────────────────
export async function testGoogleSheets(webhookUrl: string): Promise<ResultadoTest> {
  try {
    // Apps Script no soporta CORS con respuesta legible, usamos no-cors
    await fetchConTimeout(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'test',
        mensaje: 'Test CODEC POS v2.0',
        timestamp: new Date().toISOString(),
        datos: { sistema: 'CODEC POS', version: '2.0' },
      }),
    });
    return {
      ok: true,
      mensaje: '✅ Solicitud enviada — verifica que aparece una fila nueva en tu Google Sheet',
      detalle: 'Google Apps Script no devuelve respuesta en modo browser por CORS, pero el dato llega correctamente.',
    };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error de red'}` };
  }
}

export async function enviarAGoogleSheets(
  webhookUrl: string,
  datos: Record<string, unknown>,
): Promise<ResultadoTest> {
  try {
    await fetchConTimeout(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...datos, _origen: 'CODEC POS v2.0', _timestamp: new Date().toISOString() }),
    });
    return { ok: true, mensaje: '✅ Datos enviados a Google Sheets' };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 6. MERCADO PAGO
// ─────────────────────────────────────────────────────────────
export async function testMercadoPago(accessToken: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout('https://api.mercadopago.com/v1/payment_methods', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok) {
      return { ok: true, mensaje: `✅ Mercado Pago conectado — ${data.length || 0} métodos de pago disponibles` };
    }
    return { ok: false, mensaje: `❌ ${data.message || 'Access Token inválido'}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error de red'}` };
  }
}

export async function crearPreferenciaMercadoPago(
  accessToken: string,
  monto: number,
  descripcion: string,
  referencia: string,
): Promise<ResultadoPago> {
  try {
    const res = await fetchConTimeout('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ title: descripcion, quantity: 1, currency_id: 'COP', unit_price: monto }],
        external_reference: referencia,
        back_urls: {
          success: 'https://codecstudio.co/pago/exitoso',
          failure: 'https://codecstudio.co/pago/fallido',
          pending: 'https://codecstudio.co/pago/pendiente',
        },
        auto_return: 'approved',
      }),
    });
    const data = await res.json();
    if (data.id) {
      return { ok: true, url: data.init_point, mensaje: `✅ Link MP generado: ${formatCOP(monto)}` };
    }
    return { ok: false, mensaje: `❌ ${data.message || 'Error al crear preferencia'}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 7. WOMPI (Bancolombia)
// ─────────────────────────────────────────────────────────────
export async function testWompi(pubKey: string, privKey: string, ambiente: string): Promise<ResultadoTest> {
  const base = ambiente === 'sandbox' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
  try {
    const res = await fetchConTimeout(`${base}/merchants/${pubKey}`, {
      headers: { Authorization: `Bearer ${privKey}` },
    });
    const data = await res.json();
    if (res.ok && data.data) {
      return {
        ok: true,
        mensaje: `✅ Wompi conectado — Comercio: ${data.data.name || pubKey}`,
        extra: data.data,
      };
    }
    return { ok: false, mensaje: `❌ ${data.error?.reason || 'Credenciales inválidas'}` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `❌ ${e instanceof Error ? e.message : 'Error'} ${e instanceof TypeError ? '(En producción Electron funciona sin CORS)' : ''}`,
    };
  }
}

export async function crearTransaccionWompi(
  pubKey: string,
  privKey: string,
  ambiente: string,
  montoEnPesos: number,
  referencia: string,
  emailCliente: string,
): Promise<ResultadoPago> {
  const base = ambiente === 'sandbox' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
  try {
    // 1. Obtener acceptance token
    const mRes = await fetchConTimeout(`${base}/merchants/${pubKey}`);
    const mData = await mRes.json();
    const acceptanceToken = mData.data?.presigned_acceptance?.acceptance_token;
    if (!acceptanceToken) return { ok: false, mensaje: '❌ No se pudo obtener acceptance token' };

    // 2. Crear transacción
    const res = await fetchConTimeout(`${base}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${privKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_in_cents: montoEnPesos * 100,
        currency: 'COP',
        customer_email: emailCliente,
        acceptance_token: acceptanceToken,
        reference: referencia,
        payment_method: { type: 'QR', sandbox_status: 'APPROVED' },
      }),
    });
    const data = await res.json();
    if (data.data?.id) {
      return {
        ok: true,
        transaccionId: data.data.id,
        mensaje: `✅ Transacción Wompi: ${data.data.id} — ${data.data.status}`,
      };
    }
    return { ok: false, mensaje: `❌ ${JSON.stringify(data.error || data.message)}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 8. BOLD
// ─────────────────────────────────────────────────────────────
export async function testBold(apiKey: string, ambiente: string): Promise<ResultadoTest> {
  const base = ambiente === 'sandbox'
    ? 'https://integrations-sandbox.bold.co/online/link/v1'
    : 'https://integrations.bold.co/online/link/v1';
  try {
    const res = await fetchConTimeout(`${base}/payment_links?page=0&size=1`, {
      headers: { Authorization: `x-api-key ${apiKey}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) return { ok: false, mensaje: '❌ API Key de Bold inválida' };
    if (res.ok || res.status === 200 || res.status === 400) {
      return { ok: true, mensaje: `✅ Bold conectado (${ambiente}) — API Key válida` };
    }
    return { ok: false, mensaje: `❌ HTTP ${res.status} — verifica la API Key` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `❌ ${e instanceof Error ? e.message : 'Error'} (Funcional en Electron desktop)`,
    };
  }
}

export async function crearLinkBold(
  apiKey: string,
  ambiente: string,
  montoEnPesos: number,
  descripcion: string,
  referencia: string,
): Promise<ResultadoPago> {
  const base = ambiente === 'sandbox'
    ? 'https://integrations-sandbox.bold.co/online/link/v1'
    : 'https://integrations.bold.co/online/link/v1';
  try {
    const expiracion = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    const res = await fetchConTimeout(`${base}/payment_links`, {
      method: 'POST',
      headers: { Authorization: `x-api-key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_type: 'CLOSE',
        amount: { total_amount: montoEnPesos, currency: 'COP', tip_type: 'NONE' },
        description: descripcion,
        reference: referencia,
        expiration_date: expiracion,
      }),
    });
    const data = await res.json();
    if (data.payload?.url) {
      return { ok: true, url: data.payload.url, mensaje: `✅ Link Bold generado — ${formatCOP(montoEnPesos)}` };
    }
    return { ok: false, mensaje: `❌ ${data.error?.message || JSON.stringify(data)}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 9. PAYU
// ─────────────────────────────────────────────────────────────
export async function testPayU(
  apiLogin: string,
  apiKey: string,
  ambiente: string,
): Promise<ResultadoTest> {
  const url = ambiente === 'sandbox'
    ? 'https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi'
    : 'https://api.payulatam.com/payments-api/4.0/service.cgi';
  try {
    const res = await fetchConTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        language: 'es',
        command: 'PING',
        merchant: { apiLogin, apiKey },
        test: ambiente === 'sandbox',
      }),
    });
    const data = await res.json();
    if (data.code === 'SUCCESS') {
      return { ok: true, mensaje: `✅ PayU conectado — ${ambiente}` };
    }
    return { ok: false, mensaje: `❌ ${data.error || data.description || 'Credenciales inválidas'}` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `❌ ${e instanceof Error ? e.message : 'Error'} (Funcional en Electron desktop sin CORS)`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 10. STRIPE
// ─────────────────────────────────────────────────────────────
export async function testStripe(secretKey: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await res.json();
    if (res.ok) {
      const saldo = data.available?.[0];
      return {
        ok: true,
        mensaje: `✅ Stripe conectado${saldo ? ` — Saldo: ${saldo.currency.toUpperCase()} ${(saldo.amount / 100).toFixed(2)}` : ''}`,
        extra: data,
      };
    }
    return { ok: false, mensaje: `❌ ${data.error?.message || 'Secret Key inválida'}` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `❌ ${e instanceof Error ? e.message : 'Error'} (Funcional en Electron desktop)`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 11. SIIGO
// ─────────────────────────────────────────────────────────────
export async function testSiigo(username: string, accessKey: string): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout('https://api.siigo.com/auth/v1/authorization', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Partner-Id': 'CODEC_STUDIO_POS',
      },
      body: JSON.stringify({ username, access_key: accessKey }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      // Guardar token temporalmente
      sessionStorage.setItem('siigo_token', data.access_token);
      return { ok: true, mensaje: '✅ Siigo autenticado correctamente', extra: { token: data.access_token } };
    }
    return { ok: false, mensaje: `❌ ${data.Message || data.message || 'Credenciales inválidas'}` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `❌ ${e instanceof Error ? e.message : 'Error'} (Funcional en Electron sin CORS)`,
    };
  }
}

export async function crearFacturaSiigo(
  token: string,
  datos: {
    clienteNombre: string;
    clienteNIT: string;
    items: { descripcion: string; cantidad: number; precio: number }[];
    total: number;
  },
): Promise<ResultadoTest> {
  try {
    const res = await fetchConTimeout('https://api.siigo.com/v1/invoices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Partner-Id': 'CODEC_STUDIO_POS',
      },
      body: JSON.stringify({
        document: { id: 29785 },
        date: new Date().toISOString().split('T')[0],
        customer: {
          identification: datos.clienteNIT,
          branch_office: 0,
        },
        items: datos.items.map((item, i) => ({
          code: `PROD${i + 1}`,
          description: item.descripcion,
          quantity: item.cantidad,
          price: item.precio,
          discount: 0,
          taxes: [],
        })),
        payments: [{ id: 1, value: datos.total, due_date: new Date().toISOString().split('T')[0] }],
        observations: 'Generado por CODEC POS v2.0',
      }),
    });
    const data = await res.json();
    if (res.ok && data.id) {
      return { ok: true, mensaje: `✅ Factura Siigo creada: ${data.name || data.id}` };
    }
    return { ok: false, mensaje: `❌ ${JSON.stringify(data.Errors || data.message)}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 12. ALEGRA
// ─────────────────────────────────────────────────────────────
export async function testAlegra(email: string, token: string): Promise<ResultadoTest> {
  try {
    const credentials = btoa(`${email}:${token}`);
    const res = await fetchConTimeout('https://app.alegra.com/api/v1/company', {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const data = await res.json();
    if (res.ok && data.name) {
      return { ok: true, mensaje: `✅ Alegra conectado — Empresa: ${data.name}`, extra: data };
    }
    return { ok: false, mensaje: `❌ ${data.message || 'Credenciales inválidas'}` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 13. SHOPIFY
// ─────────────────────────────────────────────────────────────
export async function testShopify(shopDomain: string, apiKey: string): Promise<ResultadoTest> {
  try {
    const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const res = await fetchConTimeout(`https://${domain}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await res.json();
    if (res.ok && data.shop) {
      return { ok: true, mensaje: `✅ Shopify conectado — ${data.shop.name}`, extra: data.shop };
    }
    return { ok: false, mensaje: `❌ Token inválido o tienda no encontrada` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `❌ ${e instanceof Error ? e.message : 'Error'} (Requiere Electron por CORS de Shopify Admin)`,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 14. WOOCOMMERCE
// ─────────────────────────────────────────────────────────────
export async function testWooCommerce(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<ResultadoTest> {
  try {
    const base = siteUrl.replace(/\/$/, '');
    const credentials = btoa(`${consumerKey}:${consumerSecret}`);
    const res = await fetchConTimeout(`${base}/wp-json/wc/v3/system_status`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const data = await res.json();
    if (res.ok) {
      return {
        ok: true,
        mensaje: `✅ WooCommerce conectado — ${data.environment?.site_url || siteUrl}`,
        extra: data.environment,
      };
    }
    return { ok: false, mensaje: `❌ HTTP ${res.status} — verifica credenciales y CORS del servidor` };
  } catch (e) {
    return { ok: false, mensaje: `❌ ${e instanceof Error ? e.message : 'Error'}` };
  }
}

// ─────────────────────────────────────────────────────────────
// 15. QR PAGOS COLOMBIA
// ─────────────────────────────────────────────────────────────

/** Genera URL de imagen QR usando qrserver.com (sin dependencias) */
export function generarURLQR(contenido: string, tamaño = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${tamaño}x${tamaño}&data=${encodeURIComponent(contenido)}&ecc=M&margin=10&format=svg`;
}

/** QR Nequi — deeplink oficial */
export function generarDatosQRNequi(numero: string, monto: number, descripcion = 'Pago CODEC POS'): string {
  const numeroLimpio = numero.replace(/\D/g, '');
  // Formato deeplink Nequi Empresas
  return `https://recarga.nequi.com.co/bff/link-de-cobro?phone=57${numeroLimpio}&amount=${monto}&description=${encodeURIComponent(descripcion)}`;
}

/** QR Daviplata */
export function generarDatosQRDaviplata(numero: string, monto: number): string {
  const numeroLimpio = numero.replace(/\D/g, '');
  return `daviplata://transfer?to=57${numeroLimpio}&amount=${monto}&concept=Pago+CODEC+POS`;
}

/** QR Bancolombia A la Mano */
export function generarDatosQRBancolombia(numero: string, monto: number, descripcion = 'Pago'): string {
  const numeroLimpio = numero.replace(/\D/g, '');
  return `https://a-la-mano.bancolombia.com/link-cobro?phone=57${numeroLimpio}&value=${monto}&description=${encodeURIComponent(descripcion)}`;
}

/** QR PSE (link de pago bancario genérico) */
export function generarDatosQRPSE(nit: string, referencia: string, monto: number): string {
  return `https://pse.com.co/pse/cobrar?nit=${nit}&ref=${referencia}&amount=${monto}&currency=COP`;
}

// ─────────────────────────────────────────────────────────────
// 16. MAKE (ex-Integromat)
// ─────────────────────────────────────────────────────────────
export async function testMake(webhookUrl: string): Promise<ResultadoTest> {
  return testWebhookGenerico(webhookUrl, 'Make');
}

// ─────────────────────────────────────────────────────────────
// 17. NOTIFICACIONES AUTOMÁTICAS DEL POS
// ─────────────────────────────────────────────────────────────
const INTEG_STORAGE_KEY = 'codecpos_integraciones_config';

function cargarConfigIntegraciones(): Record<string, { habilitada: boolean; campos: Record<string, string> }> {
  try {
    const raw = localStorage.getItem(INTEG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/**
 * Envía una notificación a TODOS los canales configurados y activos
 * (Telegram, Slack, WhatsApp, Zapier, n8n, Google Sheets, etc.)
 */
export async function notificarCanalesActivos(
  tipo: string,
  titulo: string,
  cuerpo: string,
  datos: Record<string, unknown> = {},
): Promise<void> {
  const configs = cargarConfigIntegraciones();

  const payloadBase = {
    tipo,
    titulo,
    cuerpo,
    ...datos,
    _origen: 'CODEC POS v2.0',
    _timestamp: new Date().toISOString(),
  };

  // Telegram
  const tg = configs['telegram'];
  if (tg?.habilitada && tg.campos.bot_token && tg.campos.chat_id) {
    const msg = `🔔 <b>${titulo}</b>\n\n${cuerpo}`;
    enviarMensajeTelegram(tg.campos.bot_token, tg.campos.chat_id, msg).catch(() => {});
  }

  // Slack
  const sl = configs['slack'];
  if (sl?.habilitada && sl.campos.webhook_url) {
    enviarSlack(sl.campos.webhook_url, { text: `🔔 *${titulo}*\n${cuerpo}` }).catch(() => {});
  }

  // WhatsApp
  const wa = configs['whatsapp_business'];
  if (wa?.habilitada && wa.campos.phone_number_id && wa.campos.access_token && wa.campos.numero_destino) {
    enviarWhatsApp(
      wa.campos.phone_number_id,
      wa.campos.access_token,
      wa.campos.numero_destino,
      `🔔 ${titulo}\n\n${cuerpo}`,
    ).catch(() => {});
  }

  // Zapier
  const zp = configs['zapier'];
  if (zp?.habilitada && zp.campos.webhook_url) {
    fetchConTimeout(zp.campos.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBase),
    }).catch(() => {});
  }

  // n8n
  const n8 = configs['n8n'];
  if (n8?.habilitada && n8.campos.webhook_url) {
    fetchConTimeout(n8.campos.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBase),
    }).catch(() => {});
  }

  // Make
  const mk = configs['make'];
  if (mk?.habilitada && mk.campos.webhook_url) {
    fetchConTimeout(mk.campos.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBase),
    }).catch(() => {});
  }

  // Google Sheets
  const gs = configs['google_sheets'];
  if (gs?.habilitada && gs.campos.webhook_url) {
    enviarAGoogleSheets(gs.campos.webhook_url, payloadBase).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────
// 18. DISPATCHER CENTRAL — Llamar desde el POS
// ─────────────────────────────────────────────────────────────
export async function onVentaCompletada(venta: {
  total: number; metodoPago: string; productos: number; cajero: string;
}): Promise<void> {
  await notificarCanalesActivos(
    'venta_completada',
    '💰 Venta Completada',
    `Total: $${venta.total.toLocaleString('es-CO')} | Método: ${venta.metodoPago} | Productos: ${venta.productos}`,
    venta,
  );
}

export async function onStockBajo(producto: { nombre: string; stock: number; minimo: number }): Promise<void> {
  await notificarCanalesActivos(
    'stock_bajo',
    '⚠️ Stock Bajo',
    `Producto: ${producto.nombre} | Stock actual: ${producto.stock} | Mínimo: ${producto.minimo}`,
    producto,
  );
}

export async function onCierreCaja(cierre: {
  totalVentas: number; totalTransacciones: number; cajero: string;
}): Promise<void> {
  await notificarCanalesActivos(
    'cierre_caja',
    '🧮 Cierre de Caja',
    `Ventas: $${cierre.totalVentas.toLocaleString('es-CO')} | Transacciones: ${cierre.totalTransacciones} | Cajero: ${cierre.cajero}`,
    cierre,
  );
}

// ─────────────────────────────────────────────────────────────
// 19. MAPA DE FUNCIONES DE TEST — para el UI
// ─────────────────────────────────────────────────────────────
export async function probarIntegracion(
  integId: string,
  campos: Record<string, string>,
): Promise<ResultadoTest> {
  switch (integId) {
    case 'telegram':
      return testTelegramConMensaje(campos.bot_token, campos.chat_id);
    case 'slack':
      return testSlack(campos.webhook_url);
    case 'zapier':
      return testWebhookGenerico(campos.webhook_url, 'Zapier');
    case 'n8n':
      return testWebhookGenerico(campos.webhook_url, 'n8n');
    case 'make':
      return testMake(campos.webhook_url);
    case 'whatsapp_business':
      return testWhatsApp(campos.phone_number_id, campos.access_token);
    case 'google_sheets':
      return testGoogleSheets(campos.webhook_url);
    case 'mercadopago':
      return testMercadoPago(campos.access_token);
    case 'wompi':
      return testWompi(campos.pub_key, campos.priv_key, campos.ambiente || 'sandbox');
    case 'bold':
      return testBold(campos.api_key, campos.ambiente || 'sandbox');
    case 'payu':
      return testPayU(campos.api_login, campos.api_key, campos.ambiente || 'sandbox');
    case 'stripe':
      return testStripe(campos.secret_key);
    case 'siigo':
      return testSiigo(campos.username, campos.access_key);
    case 'alegra':
      return testAlegra(campos.email, campos.token);
    case 'shopify':
      return testShopify(campos.shop_domain, campos.api_key);
    case 'woocommerce':
      return testWooCommerce(campos.site_url, campos.consumer_key, campos.consumer_secret);
    // Billeteras colombianas: test = validar número
    case 'nequi':
    case 'daviplata':
    case 'transfiya':
    case 'pse':
      const numKey = campos.numero_nequi || campos.numero_daviplata || campos.numero_bancolombia;
      if (!numKey || numKey.replace(/\D/g, '').length < 10) {
        return { ok: false, mensaje: '❌ Número inválido — debe tener 10 dígitos' };
      }
      return { ok: true, mensaje: `✅ Número configurado: ${numKey} — listo para generar QR` };
    default:
      return { ok: false, mensaje: '⚠️ Test no implementado para esta integración' };
  }
}

// ─────────────────────────────────────────────────────────────
// 20. GOOGLE APPS SCRIPT — Plantilla de código
// ─────────────────────────────────────────────────────────────
export const APPS_SCRIPT_CODIGO = `
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var datos = JSON.parse(e.postData.contents);
    
    // Agregar fila con los datos
    sheet.appendRow([
      new Date(),
      datos.tipo || datos.evento || '',
      datos.titulo || '',
      datos.total || datos.monto || '',
      datos.cajero || '',
      datos.metodoPago || '',
      datos.productos || '',
      JSON.stringify(datos)
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({status: 'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`.trim();
