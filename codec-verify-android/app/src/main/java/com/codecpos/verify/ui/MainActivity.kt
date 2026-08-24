package com.codecpos.verify.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.codecpos.verify.data.Prefs
import com.codecpos.verify.notification.AndroidNotificationBridge
import com.codecpos.verify.notification.PermissionsHelper
import com.codecpos.verify.ui.screens.PermissionsScreen
import com.codecpos.verify.ui.screens.StatusScreen
import com.codecpos.verify.ui.theme.CodecVerifyTheme

/** Misma URL que ya usa el POS/PWA para invitar al celular (ver PWA_URL en CodecVerifyConexionPage.tsx). */
private const val PWA_APP_URL = "https://codecpos.vercel.app/app/"

class MainActivity : ComponentActivity() {

    private val viewModel: CodecVerifyViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CodecVerifyTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
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

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    addJavascriptInterface(AndroidNotificationBridge(viewModel.prefs), "AndroidCodecVerify")
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
                    }
                    loadUrl(PWA_APP_URL)
                    webView = this
                }
            },
        )

        FloatingActionButton(
            onClick = { mostrarAjustes = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
        ) {
            Icon(Icons.Filled.Settings, contentDescription = "Notificaciones automáticas")
        }
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

    // Refresca al reabrir el panel (ej. tras volver de Ajustes del sistema).
    LaunchedEffect(Unit) {
        accesoNotifOk = PermissionsHelper.tieneAccesoNotificaciones(context)
        bateriaOk = PermissionsHelper.tieneExencionBateria(context)
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
