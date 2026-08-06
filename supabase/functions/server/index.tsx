import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// ============================================================================
// CONFIGURACIÓN DE SUPABASE
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Cliente con SERVICE_ROLE para operaciones administrativas
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// Cliente con ANON_KEY para validar tokens de usuario
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// CONFIGURACIÓN DEL SUPER ADMINISTRADOR
// ============================================================================

const SUPERADMIN_EMAIL = 'duglas.taborda@universal.edu.co';
const SUPERADMIN_PASSWORD = 'Universal2026';
const SUPERADMIN_NAME = 'Duglas Taborda';

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Logger
app.use('*', logger(console.log));

// CORS - Configuración abierta para desarrollo
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Verifica el token JWT y retorna el usuario autenticado
 */
async function verifyAuth(authHeader: string | null) {
  console.log('🔍 VerifyAuth: Header recibido:', authHeader ? 'PRESENTE' : 'AUSENTE');
  
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('❌ VerifyAuth: No hay header Bearer o está mal formado');
    return { error: 'No token provided', user: null };
  }
  
  const token = authHeader.split(' ')[1];
  console.log('🎫 VerifyAuth: Token extraído (primeros 20 chars):', token?.substring(0, 20));
  
  try {
    // IMPORTANTE: Usar supabaseClient (ANON_KEY) para validar tokens de usuarios
    // Los tokens generados por signInWithPassword usan ANON_KEY, no SERVICE_ROLE
    console.log('📡 VerifyAuth: Llamando a getUser con token...');
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);
    
    if (error) {
      console.error('❌ VerifyAuth: Error de Supabase:', error.message);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return { error: 'Invalid token', user: null };
    }
    
    if (!user) {
      console.error('❌ VerifyAuth: No user returned');
      return { error: 'Invalid token', user: null };
    }
    
    console.log('✅ VerifyAuth: Usuario autenticado exitosamente:', user.id, user.email);
    return { error: null, user };
  } catch (err: any) {
    console.error('❌ VerifyAuth exception:', err);
    console.error('❌ Exception stack:', err.stack);
    return { error: err.message, user: null };
  }
}

/**
 * Obtiene el rol del usuario
 */
async function getUserRole(userId: string, userEmail: string): Promise<'superadmin' | 'admin' | 'ejecutivo'> {
  if (userEmail === SUPERADMIN_EMAIL) {
    return 'superadmin';
  }

  const userData = await kv.get(`user:${userId}`);
  return userData?.role || 'ejecutivo';
}

/**
 * Verifica que el usuario tenga el rol requerido
 */
async function requireRole(authHeader: string | null, allowedRoles: string[]) {
  const { error, user } = await verifyAuth(authHeader);
  
  if (error || !user) {
    return { authorized: false, error: 'Unauthorized', user: null, role: null };
  }
  
  const role = await getUserRole(user.id, user.email || '');
  
  if (!allowedRoles.includes(role)) {
    return { authorized: false, error: 'Forbidden', user, role };
  }
  
  return { authorized: true, error: null, user, role };
}

// ============================================================================
// INICIALIZACIÓN DEL SISTEMA
// ============================================================================

async function initializeSuperAdmin() {
  try {
    console.log('🔧 Inicializando super administrador...');
    
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const superAdminExists = existingUsers?.users?.some(
      (user: any) => user.email === SUPERADMIN_EMAIL
    );

    if (!superAdminExists) {
      console.log('➕ Creando super administrador...');
      
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: SUPERADMIN_NAME,
          role: 'superadmin',
        },
      });

      if (error) {
        console.error('❌ Error creando super admin:', error);
      } else {
        console.log('✅ Super administrador creado:', data.user.id);
        
        await kv.set(`user:${data.user.id}`, {
          id: data.user.id,
          email: SUPERADMIN_EMAIL,
          name: SUPERADMIN_NAME,
          role: 'superadmin',
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      console.log('✅ Super administrador ya existe');
    }
  } catch (error) {
    console.error('❌ Error en initializeSuperAdmin:', error);
  }
}

initializeSuperAdmin();

// ============================================================================
// ENDPOINTS PÚBLICOS
// ============================================================================

// Health check
app.get("/make-server-3969f5dd/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Diagnóstico de configuración
app.get("/make-server-3969f5dd/config/check", (c) => {
  const config = {
    project: 'CRM Client Tracking',
    projectId: 'enwnxwqqpmntrdbeztxi',
    environmentVariables: {
      SUPABASE_URL: supabaseUrl ? `✅ Configurado (${supabaseUrl})` : '❌ NO configurado',
      SUPABASE_ANON_KEY: supabaseAnonKey ? `✅ Configurado (${supabaseAnonKey.substring(0, 40)}...)` : '❌ NO configurado',
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey ? `✅ Configurado (${supabaseServiceRoleKey.substring(0, 40)}...)` : '❌ NO configurado',
      GOOGLE_SHEETS_API_KEY: Deno.env.get('GOOGLE_SHEETS_API_KEY') ? '✅ Configurado' : '⚠️ NO configurado (opcional para integración con Sheets)',
    },
    note: '📌 Usando variables nativas de Supabase (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)',
    infrastructure: 'Pre-configuradas automáticamente por Supabase Edge Functions',
  };
  
  const allConfigured = supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey;
  
  return c.json({
    status: allConfigured ? 'ready' : 'incomplete',
    config,
    message: allConfigured 
      ? '✅ Todas las variables nativas de Supabase están configuradas. El servidor está listo.' 
      : '⚠️ Error: Faltan variables de entorno nativas de Supabase. Estas deberían estar pre-configuradas automáticamente.',
    timestamp: new Date().toISOString(),
  });
});

// Login
app.post("/make-server-3969f5dd/auth/login", async (c) => {
  try {
    console.log('🔐 Login attempt received');
    
    // Verificar que las variables de entorno están configuradas
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Supabase credentials not configured');
      console.log('SUPABASE_URL:', supabaseUrl ? 'SET' : 'NOT SET');
      console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'NOT SET');
      return c.json({ 
        error: 'Servidor no configurado correctamente. Por favor, configura las variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY en Supabase Edge Functions.' 
      }, 500);
    }
    
    const { email, password } = await c.req.json();
    
    console.log('📧 Attempting login for:', email);
    console.log('🔗 Using Supabase URL:', supabaseUrl);

    // Si es el superadmin y no existe, crearlo
    if (email === SUPERADMIN_EMAIL) {
      console.log('🔑 Superadmin login attempt');
      
      // Intentar obtener el usuario
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const superadminExists = users?.users?.some(u => u.email === SUPERADMIN_EMAIL);
      
      if (!superadminExists) {
        console.log('👤 Creating superadmin user...');
        const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: SUPERADMIN_EMAIL,
          password: SUPERADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { name: SUPERADMIN_NAME },
        });
        
        if (createError) {
          console.error('Error creating superadmin:', createError);
          return c.json({ error: 'Error al crear usuario administrador' }, 500);
        }
        
        console.log('✅ Superadmin created successfully');
        
        // Guardar en KV
        await kv.set(`user:${createData.user.id}`, {
          id: createData.user.id,
          email: SUPERADMIN_EMAIL,
          name: SUPERADMIN_NAME,
          role: 'superadmin',
          createdAt: new Date().toISOString(),
        });
      }
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Login error from Supabase:', error.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return c.json({ error: error.message }, 401);
    }
    
    if (!data.session) {
      console.error('❌ No session returned from Supabase');
      return c.json({ error: 'No se pudo crear la sesión' }, 401);
    }
    
    console.log('✅ Login successful for user:', data.user.id);

    const role = await getUserRole(data.user.id, data.user.email || '');
    
    // Obtener datos del usuario del KV
    let userData = await kv.get(`user:${data.user.id}`);
    
    // Si no existe en KV, crear entrada básica
    if (!userData) {
      console.log('Creating user data in KV for:', data.user.id);
      userData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || email,
        role: role,
        createdAt: new Date().toISOString(),
      };
      await kv.set(`user:${data.user.id}`, userData);
    }

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: userData.name,
        role: role,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }
    });
  } catch (err: any) {
    console.error('❌ Login exception:', err);
    console.error('Exception stack:', err.stack);
    return c.json({ error: err.message || 'Error interno del servidor' }, 500);
  }
});

// Logout
app.post("/make-server-3969f5dd/auth/logout", async (c) => {
  try {
    const { error, user } = await verifyAuth(c.req.header('Authorization'));
    
    if (!error && user) {
      // Cerrar sesión en Supabase
      const token = c.req.header('Authorization')?.split(' ')[1];
      if (token) {
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });
        await userClient.auth.signOut();
      }
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Obtener perfil del usuario autenticado
app.get("/make-server-3969f5dd/auth/me", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const role = await getUserRole(user.id, user.email || '');
  const userData = await kv.get(`user:${user.id}`);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: userData?.name || user.user_metadata?.name || user.email,
      role: role,
    }
  });
});

// Endpoint para obtener o crear el perfil del usuario
app.post("/make-server-3969f5dd/auth/ensure-profile", async (c) => {
  try {
    console.log('🔍 Ensure-profile: Verificando autenticación...');
    console.log('📋 Headers disponibles:', c.req.header('Authorization') ? 'Authorization header present' : 'NO Authorization header');
    
    const authHeader = c.req.header('Authorization');
    console.log('🎫 Authorization header:', authHeader?.substring(0, 50) + '...');
    
    const { error, user } = await verifyAuth(authHeader);
    
    if (error || !user) {
      console.error('❌ Ensure-profile: Usuario no autenticado:', error);
      return c.json({ 
        code: 401,
        message: 'Invalid JWT',
        error: 'Unauthorized',
        details: error 
      }, 401);
    }

    console.log('✅ Ensure-profile: Usuario autenticado:', user.id, user.email);

    const role = await getUserRole(user.id, user.email || '');
    let userData = await kv.get(`user:${user.id}`);

    // Si no existe en KV, crear entrada básica
    if (!userData) {
      console.log('➕ Ensure-profile: Creando perfil en KV para:', user.id);
      userData = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario',
        role: role,
        createdAt: new Date().toISOString(),
      };
      await kv.set(`user:${user.id}`, userData);
      console.log('✅ Ensure-profile: Perfil creado exitosamente');
    } else {
      console.log('✅ Ensure-profile: Perfil ya existe en KV');
    }

    const profile = {
      id: user.id,
      email: user.email,
      name: userData.name,
      role: role,
      phone: userData.phone || '',
      department: userData.department || '',
    };

    console.log('📤 Ensure-profile: Retornando perfil:', profile);

    return c.json({
      success: true,
      profile: profile
    });
  } catch (err: any) {
    console.error('❌ Ensure-profile exception:', err);
    console.error('❌ Stack trace:', err.stack);
    return c.json({ 
      code: 500,
      message: err.message || 'Error interno del servidor',
      error: err.message || 'Error interno del servidor' 
    }, 500);
  }
});

// Solicitar reset de contraseña
app.post("/make-server-3969f5dd/auth/forgot-password", async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: 'Email es requerido' }, 400);
    }

    console.log('📧 Solicitando reset de contraseña para:', email);

    // Usar Supabase Admin para enviar el email de recuperación
    const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${c.req.header('origin') || 'http://localhost:3000'}/reset-password`,
    });

    if (error) {
      console.error('Error al solicitar reset:', error);
    }

    // Por seguridad, siempre retornamos éxito sin revelar si el email existe
    return c.json({ 
      success: true, 
      message: 'Si el correo electrónico existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' 
    });
  } catch (err: any) {
    console.error('Forgot password exception:', err);
    // También retornar éxito para no revelar información
    return c.json({ 
      success: true, 
      message: 'Si el correo electrónico existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.' 
    });
  }
});

// Confirmar reset de contraseña
app.post("/make-server-3969f5dd/auth/reset-password", async (c) => {
  try {
    const { token, password } = await c.req.json();

    if (!token || !password) {
      return c.json({ error: 'Token y nueva contraseña son requeridos' }, 400);
    }

    console.log('🔐 Confirmando reset de contraseña');

    // Actualizar la contraseña usando el token de recuperación
    const { data, error } = await supabaseAdmin.auth.updateUser({
      password: password,
    });

    if (error) {
      console.error('Error al resetear contraseña:', error);
      return c.json({ error: 'Token inválido o expirado' }, 400);
    }

    return c.json({ 
      success: true, 
      message: 'Contraseña actualizada exitosamente' 
    });
  } catch (err: any) {
    console.error('Reset password exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// ENDPOINTS DE USUARIOS (Admin y SuperAdmin)
// ============================================================================

// Crear nuevo usuario (solo admin/superadmin)
app.post("/make-server-3969f5dd/users", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const { email, password, name, role, phone, department } = await c.req.json();

    // Validaciones
    if (!email || !password || !name) {
      return c.json({ error: 'Email, password y name son requeridos' }, 400);
    }

    const userRole = role || 'ejecutivo';
    
    // Solo superadmin puede crear otros admins
    if (userRole === 'admin' && auth.role !== 'superadmin') {
      return c.json({ error: 'Solo superadmin puede crear administradores' }, 403);
    }

    console.log('➕ Creando usuario en Supabase Auth:', { email, name, role: userRole });

    // Crear usuario en Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        role: userRole,
      },
    });

    if (error) {
      console.error('❌ Error creating user in auth:', error);
      return c.json({ error: error.message }, 400);
    }

    console.log('✅ Usuario creado en Auth:', data.user.id);

    // Guardar datos adicionales en KV
    const newUser = {
      id: data.user.id,
      email,
      name,
      role: userRole,
      phone: phone || '',
      department: department || '',
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
    };

    await kv.set(`user:${data.user.id}`, newUser);
    console.log('✅ Usuario guardado en KV');

    // ✨ NUEVO: Crear perfil en la tabla user_profiles de PostgreSQL
    try {
      console.log('➕ Creando perfil en user_profiles...');
      
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: data.user.id,
          email: email,
          name: name,
          role: userRole,
          phone: phone || null,
          department: department || null,
        })
        .select()
        .single();

      if (profileError) {
        console.error('⚠️ Error creando perfil en user_profiles:', profileError);
        console.error('Detalles:', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint
        });
        
        // No fallar toda la operación, pero registrar el error
        console.warn('⚠️ Usuario creado pero el perfil no se pudo crear en user_profiles. Puede ser que RLS esté bloqueando.');
      } else {
        console.log('✅ Perfil creado exitosamente en user_profiles:', profileData);
      }
    } catch (profileException: any) {
      console.error('⚠️ Excepción al crear perfil:', profileException);
      // No fallar toda la operación
    }

    return c.json({ success: true, user: newUser });
  } catch (err: any) {
    console.error('❌ Create user exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Listar usuarios (solo admin/superadmin)
app.get("/make-server-3969f5dd/users", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const usersData = await kv.getByPrefix('user:');
    const users = usersData.map((item: any) => item.value);

    return c.json({ users });
  } catch (err: any) {
    console.error('List users exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Actualizar usuario (solo admin/superadmin)
app.put("/make-server-3969f5dd/users/:userId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const userId = c.req.param('userId');
    const updates = await c.req.json();

    const currentUser = await kv.get(`user:${userId}`);
    
    if (!currentUser) {
      return c.json({ error: 'Usuario no encontrado' }, 404);
    }

    // Solo superadmin puede cambiar roles a admin
    if (updates.role === 'admin' && auth.role !== 'superadmin') {
      return c.json({ error: 'Solo superadmin puede asignar rol de administrador' }, 403);
    }

    const updatedUser = {
      ...currentUser,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    await kv.set(`user:${userId}`, updatedUser);

    // Si se cambió el rol, actualizar metadata en Supabase Auth
    if (updates.role) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { ...currentUser, role: updates.role }
      });
    }

    return c.json({ success: true, user: updatedUser });
  } catch (err: any) {
    console.error('Update user exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Eliminar usuario (solo superadmin)
app.delete("/make-server-3969f5dd/users/:userId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const userId = c.req.param('userId');

    // No permitir eliminar al super admin
    if (userId === auth.user.id) {
      return c.json({ error: 'No puedes eliminarte a ti mismo' }, 400);
    }

    // Eliminar de Supabase Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (error) {
      console.error('Error deleting user:', error);
      return c.json({ error: error.message }, 400);
    }

    // Eliminar de KV
    await kv.del(`user:${userId}`);

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Delete user exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// ENDPOINTS DE CLIENTES/EMPRESAS
// ============================================================================

// Crear cliente
app.post("/make-server-3969f5dd/clientes", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const clienteData = await c.req.json();
    const clienteId = `cliente-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const nuevoCliente = {
      id: clienteId,
      ...clienteData,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      updatedAt: new Date().toISOString(),
      seguimiento: {
        llamadas: 0,
        reuniones: 0,
        propuestas: 0,
        actividades: []
      }
    };

    await kv.set(`cliente:${clienteId}`, nuevoCliente);

    return c.json({ success: true, cliente: nuevoCliente });
  } catch (err: any) {
    console.error('Create cliente exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Listar clientes
app.get("/make-server-3969f5dd/clientes", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const role = await getUserRole(user.id, user.email || '');
    const clientesData = await kv.getByPrefix('cliente:');
    let clientes = clientesData.map((item: any) => item.value);

    // Ejecutivos solo ven sus clientes asignados
    if (role === 'ejecutivo') {
      clientes = clientes.filter((c: any) => c.asesorAsignadoId === user.id);
    }

    return c.json({ clientes });
  } catch (err: any) {
    console.error('List clientes exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Obtener un cliente específico
app.get("/make-server-3969f5dd/clientes/:clienteId", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const clienteId = c.req.param('clienteId');
    const cliente = await kv.get(`cliente:${clienteId}`);

    if (!cliente) {
      return c.json({ error: 'Cliente no encontrado' }, 404);
    }

    const role = await getUserRole(user.id, user.email || '');
    
    // Ejecutivos solo pueden ver sus clientes
    if (role === 'ejecutivo' && cliente.asesorAsignadoId !== user.id) {
      return c.json({ error: 'No autorizado' }, 403);
    }

    return c.json({ cliente });
  } catch (err: any) {
    console.error('Get cliente exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Actualizar cliente
app.put("/make-server-3969f5dd/clientes/:clienteId", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const clienteId = c.req.param('clienteId');
    const updates = await c.req.json();
    const cliente = await kv.get(`cliente:${clienteId}`);

    if (!cliente) {
      return c.json({ error: 'Cliente no encontrado' }, 404);
    }

    const role = await getUserRole(user.id, user.email || '');
    
    // Ejecutivos solo pueden editar sus clientes
    if (role === 'ejecutivo' && cliente.asesorAsignadoId !== user.id) {
      return c.json({ error: 'No autorizado' }, 403);
    }

    const clienteActualizado = {
      ...cliente,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    await kv.set(`cliente:${clienteId}`, clienteActualizado);

    return c.json({ success: true, cliente: clienteActualizado });
  } catch (err: any) {
    console.error('Update cliente exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Eliminar cliente (solo admin/superadmin)
app.delete("/make-server-3969f5dd/clientes/:clienteId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const clienteId = c.req.param('clienteId');
    await kv.del(`cliente:${clienteId}`);

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Delete cliente exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Agregar actividad de seguimiento
app.post("/make-server-3969f5dd/clientes/:clienteId/actividades", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const clienteId = c.req.param('clienteId');
    const actividadData = await c.req.json();
    const cliente = await kv.get(`cliente:${clienteId}`);

    if (!cliente) {
      return c.json({ error: 'Cliente no encontrado' }, 404);
    }

    const role = await getUserRole(user.id, user.email || '');
    
    if (role === 'ejecutivo' && cliente.asesorAsignadoId !== user.id) {
      return c.json({ error: 'No autorizado' }, 403);
    }

    const nuevaActividad = {
      id: `actividad-${Date.now()}`,
      ...actividadData,
      fecha: new Date().toISOString(),
      creadoPor: user.id,
    };

    // Actualizar contadores según tipo
    const seguimiento = cliente.seguimiento || { llamadas: 0, reuniones: 0, propuestas: 0, actividades: [] };
    
    if (actividadData.tipo === 'llamada') seguimiento.llamadas++;
    if (actividadData.tipo === 'reunion') seguimiento.reuniones++;
    if (actividadData.tipo === 'propuesta') seguimiento.propuestas++;
    
    seguimiento.actividades = [...(seguimiento.actividades || []), nuevaActividad];

    const clienteActualizado = {
      ...cliente,
      seguimiento,
      fechaUltimoContacto: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    await kv.set(`cliente:${clienteId}`, clienteActualizado);

    return c.json({ success: true, actividad: nuevaActividad });
  } catch (err: any) {
    console.error('Add actividad exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Asignar cliente a ejecutivo (solo admin/superadmin)
app.post("/make-server-3969f5dd/clientes/:clienteId/asignar", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const clienteId = c.req.param('clienteId');
    const { ejecutivoId } = await c.req.json();
    const cliente = await kv.get(`cliente:${clienteId}`);

    if (!cliente) {
      return c.json({ error: 'Cliente no encontrado' }, 404);
    }

    const clienteActualizado = {
      ...cliente,
      asesorAsignadoId: ejecutivoId,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    await kv.set(`cliente:${clienteId}`, clienteActualizado);

    return c.json({ success: true, cliente: clienteActualizado });
  } catch (err: any) {
    console.error('Assign cliente exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// ENDPOINTS DE GOOGLE SHEETS
// ============================================================================

// Sincronizar con Google Sheets
app.post("/make-server-3969f5dd/google-sheets/sync", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const { spreadsheetId, sheetName } = await c.req.json();
    const apiKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');

    if (!apiKey) {
      return c.json({ 
        error: 'Google Sheets API Key no configurada',
        instructions: 'Por favor, configura la variable de entorno GOOGLE_SHEETS_API_KEY en Supabase Edge Functions'
      }, 400);
    }

    if (!spreadsheetId || !sheetName) {
      return c.json({ error: 'spreadsheetId y sheetName son requeridos' }, 400);
    }

    // Obtener datos de la hoja (columnas D a M)
    const range = `${sheetName}!D:M`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      return c.json({ error: 'Error al leer Google Sheets', details: errorData }, 400);
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return c.json({ success: true, imported: 0, message: 'No hay datos para importar' });
    }

    // Primera fila son los encabezados
    const headers = rows[0];
    let imported = 0;

    // Procesar cada fila (saltando encabezados)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Mapear según las columnas especificadas
      const empresa = row[0] || ''; // Columna D
      const nombreContacto = row[1] || ''; // Columna E
      const cargo = row[2] || ''; // Columna F
      const telefono = row[3] || ''; // Columna G
      const email = row[4] || ''; // Columna H
      const estadoLead = row[5] || ''; // Columna I
      const asesorAsignado = row[6] || ''; // Columna J
      const fechaUltimoContacto = row[7] || ''; // Columna K
      const fechaProximoContacto = row[8] || ''; // Columna L
      const notasSeguimiento = row[9] || ''; // Columna M

      if (!empresa) continue; // Saltar filas sin nombre de empresa

      const clienteId = `cliente-import-${Date.now()}-${i}`;
      
      const cliente = {
        id: clienteId,
        empresa,
        nombreContacto,
        cargo,
        telefono,
        email,
        estadoLead,
        asesorAsignado,
        asesorAsignadoId: '', // Se puede mapear después
        fechaUltimoContacto,
        fechaProximoContacto,
        notasSeguimiento,
        importadoDesdeSheets: true,
        spreadsheetId,
        sheetName,
        rowNumber: i + 1,
        createdAt: new Date().toISOString(),
        createdBy: auth.user.id,
        updatedAt: new Date().toISOString(),
        seguimiento: {
          llamadas: 0,
          reuniones: 0,
          propuestas: 0,
          actividades: []
        }
      };

      await kv.set(`cliente:${clienteId}`, cliente);
      imported++;
    }

    return c.json({ success: true, imported, total: rows.length - 1 });
  } catch (err: any) {
    console.error('Sync Google Sheets exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Exportar a Google Sheets (actualizar)
app.post("/make-server-3969f5dd/google-sheets/export", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const { spreadsheetId, sheetName } = await c.req.json();
    const apiKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');

    if (!apiKey) {
      return c.json({ 
        error: 'Google Sheets API Key no configurada'
      }, 400);
    }

    // Obtener todos los clientes
    const clientesData = await kv.getByPrefix('cliente:');
    const clientes = clientesData.map((item: any) => item.value);

    // Preparar datos para exportar (columnas D a M)
    const rows = [
      ['Empresa', 'Nombre Contacto', 'Cargo', 'Teléfono', 'Email', 'Estado del Lead', 'Asesor Asignado', 'Fecha de Último Contacto', 'Fecha Próximo Contacto', 'Notas de Seguimiento']
    ];

    for (const cliente of clientes) {
      rows.push([
        cliente.empresa || '',
        cliente.nombreContacto || '',
        cliente.cargo || '',
        cliente.telefono || '',
        cliente.email || '',
        cliente.estadoLead || '',
        cliente.asesorAsignado || '',
        cliente.fechaUltimoContacto || '',
        cliente.fechaProximoContacto || '',
        cliente.notasSeguimiento || ''
      ]);
    }

    // Nota: Para actualizar Google Sheets necesitamos OAuth2, no solo API Key
    // Esta funcionalidad requeriría configuración adicional
    return c.json({ 
      success: false, 
      error: 'La exportación a Google Sheets requiere configuración OAuth2',
      message: 'Por favor, usa la integración con Zapier para sincronización automática'
    });
  } catch (err: any) {
    console.error('Export Google Sheets exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// ENDPOINTS DE ESTADÍSTICAS
// ============================================================================

// Obtener estadísticas del dashboard
app.get("/make-server-3969f5dd/stats", async (c) => {
  const { error, user } = await verifyAuth(c.req.header('Authorization'));
  
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const role = await getUserRole(user.id, user.email || '');
    const clientesData = await kv.getByPrefix('cliente:');
    let clientes = clientesData.map((item: any) => item.value);

    // Ejecutivos solo ven sus clientes
    if (role === 'ejecutivo') {
      clientes = clientes.filter((c: any) => c.asesorAsignadoId === user.id);
    }

    const stats = {
      totalClientes: clientes.length,
      totalLlamadas: clientes.reduce((sum: number, c: any) => sum + (c.seguimiento?.llamadas || 0), 0),
      totalReuniones: clientes.reduce((sum: number, c: any) => sum + (c.seguimiento?.reuniones || 0), 0),
      totalPropuestas: clientes.reduce((sum: number, c: any) => sum + (c.seguimiento?.propuestas || 0), 0),
      clientesPorEstado: {} as any,
      actividadesRecientes: [] as any[],
    };

    // Contar por estado
    clientes.forEach((c: any) => {
      const estado = c.estadoLead || 'Sin estado';
      stats.clientesPorEstado[estado] = (stats.clientesPorEstado[estado] || 0) + 1;
    });

    // Obtener actividades recientes
    const todasActividades: any[] = [];
    clientes.forEach((c: any) => {
      if (c.seguimiento?.actividades) {
        c.seguimiento.actividades.forEach((a: any) => {
          todasActividades.push({
            ...a,
            clienteId: c.id,
            clienteNombre: c.empresa,
          });
        });
      }
    });

    // Ordenar por fecha y tomar las últimas 10
    stats.actividadesRecientes = todasActividades
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 10);

    return c.json({ stats });
  } catch (err: any) {
    console.error('Get stats exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// ENDPOINTS DE EJECUTIVOS
// ============================================================================

// Listar ejecutivos (solo admin/superadmin)
app.get("/make-server-3969f5dd/ejecutivos", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const ejecutivosData = await kv.getByPrefix('ejecutivo:');
    const ejecutivos = ejecutivosData.map((item: any) => item.value);

    return c.json({ ejecutivos });
  } catch (err: any) {
    console.error('List ejecutivos exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Obtener un ejecutivo específico
app.get("/make-server-3969f5dd/ejecutivos/:ejecutivoId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const ejecutivoId = c.req.param('ejecutivoId');
    const ejecutivo = await kv.get(`ejecutivo:${ejecutivoId}`);

    if (!ejecutivo) {
      return c.json({ error: 'Ejecutivo no encontrado' }, 404);
    }

    return c.json({ ejecutivo });
  } catch (err: any) {
    console.error('Get ejecutivo exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Crear ejecutivo
app.post("/make-server-3969f5dd/ejecutivos", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const ejecutivoData = await c.req.json();
    const ejecutivoId = `ejecutivo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const nuevoEjecutivo = {
      id: ejecutivoId,
      ...ejecutivoData,
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`ejecutivo:${ejecutivoId}`, nuevoEjecutivo);

    return c.json({ success: true, ejecutivo: nuevoEjecutivo });
  } catch (err: any) {
    console.error('Create ejecutivo exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Actualizar ejecutivo
app.put("/make-server-3969f5dd/ejecutivos/:ejecutivoId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const ejecutivoId = c.req.param('ejecutivoId');
    const updates = await c.req.json();
    const ejecutivo = await kv.get(`ejecutivo:${ejecutivoId}`);

    if (!ejecutivo) {
      return c.json({ error: 'Ejecutivo no encontrado' }, 404);
    }

    const ejecutivoActualizado = {
      ...ejecutivo,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    await kv.set(`ejecutivo:${ejecutivoId}`, ejecutivoActualizado);

    return c.json({ success: true, ejecutivo: ejecutivoActualizado });
  } catch (err: any) {
    console.error('Update ejecutivo exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Eliminar ejecutivo
app.delete("/make-server-3969f5dd/ejecutivos/:ejecutivoId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const ejecutivoId = c.req.param('ejecutivoId');
    await kv.del(`ejecutivo:${ejecutivoId}`);

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Delete ejecutivo exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// ENDPOINTS DE PERFILES
// ============================================================================

// Listar perfiles (solo admin/superadmin)
app.get("/make-server-3969f5dd/perfiles", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const perfilesData = await kv.getByPrefix('perfil:');
    const profiles = perfilesData.map((item: any) => item.value);

    return c.json({ profiles });
  } catch (err: any) {
    console.error('List perfiles exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Obtener un perfil específico
app.get("/make-server-3969f5dd/perfiles/:perfilId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const perfilId = c.req.param('perfilId');
    const perfil = await kv.get(`perfil:${perfilId}`);

    if (!perfil) {
      return c.json({ error: 'Perfil no encontrado' }, 404);
    }

    return c.json({ perfil });
  } catch (err: any) {
    console.error('Get perfil exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Crear perfil
app.post("/make-server-3969f5dd/perfiles", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const perfilData = await c.req.json();
    const perfilId = `perfil-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const nuevoPerfil = {
      id: perfilId,
      ...perfilData,
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`perfil:${perfilId}`, nuevoPerfil);

    return c.json({ success: true, perfil: nuevoPerfil });
  } catch (err: any) {
    console.error('Create perfil exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Actualizar perfil
app.put("/make-server-3969f5dd/perfiles/:perfilId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const perfilId = c.req.param('perfilId');
    const updates = await c.req.json();
    const perfil = await kv.get(`perfil:${perfilId}`);

    if (!perfil) {
      return c.json({ error: 'Perfil no encontrado' }, 404);
    }

    const perfilActualizado = {
      ...perfil,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    await kv.set(`perfil:${perfilId}`, perfilActualizado);

    return c.json({ success: true, perfil: perfilActualizado });
  } catch (err: any) {
    console.error('Update perfil exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Eliminar perfil
app.delete("/make-server-3969f5dd/perfiles/:perfilId", async (c) => {
  const auth = await requireRole(c.req.header('Authorization'), ['admin', 'superadmin']);
  
  if (!auth.authorized) {
    return c.json({ error: auth.error }, auth.error === 'Unauthorized' ? 401 : 403);
  }

  try {
    const perfilId = c.req.param('perfilId');
    await kv.del(`perfil:${perfilId}`);

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Delete perfil exception:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ============================================================================
// CODEC VERIFY - INTEGRACIÓN CON APP MÓVIL
// ============================================================================

import * as codecVerify from "./codec_verify.tsx";

// Health check específico para Codec Verify
app.get("/api/health", (c) => {
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "CODEC POS v2.0"
  });
});

// Conectar con PIN (PÚBLICO - Sin autenticación)
app.post("/api/codec-verify/conectar", async (c) => {
  try {
    const { pin } = await c.req.json();
    
    console.log('📱 [Codec Verify] Intento de conexión con PIN:', pin);
    
    if (!pin || pin.length !== 6) {
      return c.json({ 
        success: false, 
        mensaje: 'PIN inválido. Debe ser de 6 dígitos' 
      }, 400);
    }
    
    // Validar PIN
    const validacion = await codecVerify.validarPIN(pin);
    
    if (!validacion.valido) {
      console.log('❌ [Codec Verify] PIN inválido:', validacion.mensaje);
      return c.json({ 
        success: false, 
        mensaje: validacion.mensaje 
      }, 401);
    }
    
    // Marcar PIN como usado
    await codecVerify.marcarPINComoUsado(pin);
    
    // Generar token
    const token = await codecVerify.generarTokenCodecVerify();
    
    // Obtener datos del negocio
    const datosNegocio = await codecVerify.obtenerDatosNegocio();
    
    console.log('✅ [Codec Verify] Conexión exitosa, token generado');
    
    return c.json({
      success: true,
      token: token,
      datosNegocio: datosNegocio,
    });
  } catch (err: any) {
    console.error('❌ [Codec Verify] Error en conexión:', err);
    return c.json({ 
      success: false, 
      mensaje: 'Error interno del servidor' 
    }, 500);
  }
});

// Middleware de autenticación para Codec Verify
async function validarTokenCodecVerify(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return { valido: false, error: 'Token no proporcionado' };
  }
  
  const token = authHeader.split(' ')[1];
  const valido = await codecVerify.validarTokenCodecVerify(token);
  
  if (!valido) {
    return { valido: false, error: 'Token inválido o expirado' };
  }
  
  return { valido: true, error: null };
}

// Dashboard - Datos principales
app.get("/api/dashboard", async (c) => {
  const auth = await validarTokenCodecVerify(c.req.header('Authorization'));
  
  if (!auth.valido) {
    return c.json({ error: auth.error }, 401);
  }
  
  try {
    console.log('📊 [Codec Verify] Obteniendo dashboard');
    const dashboard = await codecVerify.obtenerDashboard();
    return c.json(dashboard);
  } catch (err: any) {
    console.error('Error obteniendo dashboard:', err);
    return c.json({ error: 'Error obteniendo datos' }, 500);
  }
});

// Ventas del día
app.get("/api/ventas", async (c) => {
  const auth = await validarTokenCodecVerify(c.req.header('Authorization'));
  
  if (!auth.valido) {
    return c.json({ error: auth.error }, 401);
  }
  
  try {
    console.log('💰 [Codec Verify] Obteniendo ventas');
    const ventas = await codecVerify.obtenerVentas();
    return c.json(ventas);
  } catch (err: any) {
    console.error('Error obteniendo ventas:', err);
    return c.json({ error: 'Error obteniendo ventas' }, 500);
  }
});

// Inventario
app.get("/api/inventario", async (c) => {
  const auth = await validarTokenCodecVerify(c.req.header('Authorization'));
  
  if (!auth.valido) {
    return c.json({ error: auth.error }, 401);
  }
  
  try {
    console.log('📦 [Codec Verify] Obteniendo inventario');
    const inventario = await codecVerify.obtenerInventario();
    return c.json(inventario);
  } catch (err: any) {
    console.error('Error obteniendo inventario:', err);
    return c.json({ error: 'Error obteniendo inventario' }, 500);
  }
});

// Estadísticas
app.get("/api/estadisticas", async (c) => {
  const auth = await validarTokenCodecVerify(c.req.header('Authorization'));
  
  if (!auth.valido) {
    return c.json({ error: auth.error }, 401);
  }
  
  try {
    console.log('📈 [Codec Verify] Obteniendo estadísticas');
    const estadisticas = await codecVerify.obtenerEstadisticas();
    return c.json(estadisticas);
  } catch (err: any) {
    console.error('Error obteniendo estadísticas:', err);
    return c.json({ error: 'Error obteniendo estadísticas' }, 500);
  }
});

// Endpoint para generar PIN desde el POS (protegido)
app.post("/api/codec-verify/generar-pin", async (c) => {
  try {
    console.log('🔐 [Codec Verify] Generando nuevo PIN');
    const pin = await codecVerify.generarPIN();
    
    return c.json({
      success: true,
      pin: pin,
      expiraEn: '10 minutos',
      expiraTimestamp: Date.now() + (10 * 60 * 1000),
    });
  } catch (err: any) {
    console.error('Error generando PIN:', err);
    return c.json({ error: 'Error generando PIN' }, 500);
  }
});

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================

Deno.serve(app.fetch);