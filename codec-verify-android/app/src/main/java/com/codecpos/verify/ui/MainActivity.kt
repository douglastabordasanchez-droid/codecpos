package com.codecpos.verify.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.codecpos.verify.BuildConfig
import com.codecpos.verify.notification.AndroidNotificationBridge
import com.codecpos.verify.notification.PermissionsHelper
import com.codecpos.verify.ui.screens.PermissionsScreen
import com.codecpos.verify.ui.screens.StatusScreen
import com.codecpos.verify.ui.theme.CodecVerifyTheme

/** Misma URL que ya usa el POS/PWA para invitar al celular (ver PWA_URL en CodecVerifyConexionPage.tsx). */
private const val PWA_APP_URL = "https://codecpos.vercel.app/app/"

/** Mismo azul-marino oscuro que theme_color/background_color del manifest de la PWA (vite.config.pwa.ts). */
private val FondoApp = Color(0xFF0F172A)

class MainActivity : ComponentActivity() {

    private val viewModel: CodecVerifyViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 🔎 Permite inspeccionar la WebView en vivo desde chrome://inspect en un
        // PC conectado por USB — solo en builds debug, nunca en release.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        // 🩹 FIX "barras desajustadas arriba/abajo": con targetSdk 35 (Android 15),
        // el sistema OBLIGA a dibujar edge-to-edge (el contenido pasa por debajo
        // de la barra de estado y la de navegación) — antes esto no se
        // compensaba con ningún padding nativo, así que la WebView (y el
        // TopBar/BottomNav propios de la PWA) quedaban montados debajo de esas
        // barras del sistema en vez de respetarlas. safeDrawingPadding() en el
        // Compose de abajo resuelve el resto; esto solo pone los íconos de la
        // barra de estado en blanco para que se vean sobre el fondo oscuro.
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false

        setContent {
            CodecVerifyTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = FondoApp) {
                    CodecVerifyApp(viewModel)
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun CodecVerifyApp(viewModel: CodecVerifyViewModel) {
    val context = LocalContext.current
    val eventos by viewModel.eventos.collectAsStateWithLifecycle()
    val listenerConectado by viewModel.listenerConectado.collectAsStateWithLifecycle()

    var webView by remember { mutableStateOf<WebView?>(null) }
    var mostrarAjustes by remember { mutableStateOf(false) }
    var pendingPermissionRequest by remember { mutableStateOf<PermissionRequest?>(null) }

    // La PWA (EscanerPage) ya trae su propio escáner de código de barras vía
    // cámara del navegador (getUserMedia) — el WebView necesita reenviar ese
    // permiso una vez que Android ya lo concedió a nivel de app.
    val cameraPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { concedido ->
        val solicitud = pendingPermissionRequest
        if (solicitud != null) {
            if (concedido) solicitud.grant(solicitud.resources) else solicitud.deny()
            pendingPermissionRequest = null
        }
    }

    BackHandler(enabled = webView?.canGoBack() == true) {
        webView?.goBack()
    }

    // 🩹 safeDrawingPadding() reserva el espacio real de la barra de estado,
    // la barra/gesto de navegación y cualquier notch — sin esto (y con
    // targetSdk 35 forzando edge-to-edge) la WebView dibujaba debajo de esas
    // barras y el TopBar/BottomNav propios de la PWA quedaban amontonados
    // con los íconos del sistema.
    Box(modifier = Modifier.fillMaxSize().background(FondoApp).safeDrawingPadding()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    // La PWA trae su propio meta viewport (width=device-width) y su
                    // propio breakpoint de escritorio (≥1024px) — sin esto el WebView
                    // puede quedarse con un ancho virtual de escritorio por defecto y
                    // mostrar el layout de sidebar en vez del de celular (bottom nav).
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = true
                    addJavascriptInterface(
                        AndroidNotificationBridge(viewModel.prefs, onAbrirAjustes = { mostrarAjustes = true }),
                        "AndroidCodecVerify",
                    )
                    webChromeClient = object : WebChromeClient() {
                        override fun onPermissionRequest(request: PermissionRequest) {
                            val pideCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                            val yaConcedido = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
                                PackageManager.PERMISSION_GRANTED
                            when {
                                pideCamera && yaConcedido -> request.grant(request.resources)
                                pideCamera -> {
                                    pendingPermissionRequest = request
                                    cameraPermLauncher.launch(Manifest.permission.CAMERA)
                                }
                                else -> request.deny()
                            }
                        }

                        // 🔎 Vuelca los console.log/error/warn de la PWA al logcat de
                        // Android (filtrar con `adb logcat -s CodecVerifyWebView`) —
                        // clave para diagnosticar sin depender de chrome://inspect.
                        override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                            Log.d(
                                "CodecVerifyWebView",
                                "[${consoleMessage.messageLevel()}] ${consoleMessage.message()} " +
                                    "(${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})",
                            )
                            return true
                        }
                    }
                    loadUrl(PWA_APP_URL)
                    webView = this
                }
            },
        )
        // 🔧 Ya no hay ícono flotante propio (⚙️) — dos lugares de ajustes
        // (este + la sección de Configuración en la PWA) confundían al
        // usuario. Ahora Configuración tiene su propio botón que llama a
        // AndroidNotificationBridge.abrirAjustesNotificaciones(), que pone
        // mostrarAjustes = true — un solo lugar de entrada.
    }

    if (mostrarAjustes) {
        AjustesNotificaciones(
            viewModel = viewModel,
            eventos = eventos,
            listenerConectado = listenerConectado,
            onDismiss = { mostrarAjustes = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AjustesNotificaciones(
    viewModel: CodecVerifyViewModel,
    eventos: List<com.codecpos.verify.notification.EventoCapturado>,
    listenerConectado: Boolean,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var accesoNotifOk by remember { mutableStateOf(PermissionsHelper.tieneAccesoNotificaciones(context)) }
    var bateriaOk by remember { mutableStateOf(PermissionsHelper.tieneExencionBateria(context)) }
    var runtimeOk by remember {
        mutableStateOf(
            !PermissionsHelper.requierePermisoNotificacionesRuntime() ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val runtimePermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { concedido -> runtimeOk = concedido }

    // Refresca al abrir el panel...
    LaunchedEffect(Unit) {
        accesoNotifOk = PermissionsHelper.tieneAccesoNotificaciones(context)
        bateriaOk = PermissionsHelper.tieneExencionBateria(context)
    }

    // ...y otra vez cada vez que la Activity vuelve a primer plano — el panel
    // sigue montado (como hoja modal) mientras el usuario está en Ajustes de
    // Android concediendo el permiso, así que sin esto el botón "Activar"
    // se quedaba mostrando el estado viejo al volver.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        accesoNotifOk = PermissionsHelper.tieneAccesoNotificaciones(context)
        bateriaOk = PermissionsHelper.tieneExencionBateria(context)
        runtimeOk = !PermissionsHelper.requierePermisoNotificacionesRuntime() ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    val todoListo = accesoNotifOk && bateriaOk && runtimeOk

    ModalBottomSheet(onDismissRequest = onDismiss) {
        if (!todoListo) {
            PermissionsScreen(
                accesoNotificacionesConcedido = accesoNotifOk,
                exencionBateriaConcedida = bateriaOk,
                requierePermisoRuntime = PermissionsHelper.requierePermisoNotificacionesRuntime(),
                permisoRuntimeConcedido = runtimeOk,
                onPedirAccesoNotificaciones = { context.startActivity(PermissionsHelper.intentAccesoNotificaciones()) },
                onPedirExencionBateria = { context.startActivity(PermissionsHelper.intentExencionBateria(context)) },
                onPedirPermisoRuntime = { runtimePermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
                onContinuar = {
                    accesoNotifOk = PermissionsHelper.tieneAccesoNotificaciones(context)
                    bateriaOk = PermissionsHelper.tieneExencionBateria(context)
                },
            )
        } else {
            StatusScreen(
                nombreNegocio = viewModel.prefs.nombreNegocio,
                listenerConectado = listenerConectado,
                entidadesHabilitadas = viewModel.prefs.entidadesHabilitadas,
                modoAprendizaje = viewModel.prefs.modoAprendizaje,
                eventos = eventos,
                onToggleEntidad = viewModel::setEntidadHabilitada,
                onToggleModoAprendizaje = viewModel::setModoAprendizaje,
            )
        }
    }
}
