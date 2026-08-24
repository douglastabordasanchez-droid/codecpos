package com.codecpos.verify.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * El acceso a notificaciones NO se puede pedir con un diálogo normal — Android
 * obliga a que el usuario lo active a mano en una pantalla de Ajustes, por
 * seguridad (es un permiso muy sensible: leer TODAS las notificaciones).
 */
@Composable
fun PermissionsScreen(
    accesoNotificacionesConcedido: Boolean,
    exencionBateriaConcedida: Boolean,
    requierePermisoRuntime: Boolean,
    permisoRuntimeConcedido: Boolean,
    onPedirAccesoNotificaciones: () -> Unit,
    onPedirExencionBateria: () -> Unit,
    onPedirPermisoRuntime: () -> Unit,
    onContinuar: () -> Unit,
) {
    val todoListo = accesoNotificacionesConcedido &&
        exencionBateriaConcedida &&
        (!requierePermisoRuntime || permisoRuntimeConcedido)

    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text("Últimos permisos", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Codec Verify necesita estos tres permisos para funcionar de forma confiable, igual que MacroDroid los necesitaba.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(24.dp))

        PermisoItem(
            titulo = "Acceso a notificaciones",
            descripcion = "Para leer las notificaciones de pago de Nequi, Bancolombia y Daviplata.",
            concedido = accesoNotificacionesConcedido,
            onSolicitar = onPedirAccesoNotificaciones,
        )
        Spacer(Modifier.height(16.dp))

        if (requierePermisoRuntime) {
            PermisoItem(
                titulo = "Mostrar notificaciones",
                descripcion = "Permiso de Android 13+ para que la app pueda avisarte si algo falla.",
                concedido = permisoRuntimeConcedido,
                onSolicitar = onPedirPermisoRuntime,
            )
            Spacer(Modifier.height(16.dp))
        }

        PermisoItem(
            titulo = "Sin restricción de batería",
            descripcion = "Si el sistema restringe la batería de la app, deja de recibir notificaciones en segundo plano.",
            concedido = exencionBateriaConcedida,
            onSolicitar = onPedirExencionBateria,
        )

        Spacer(Modifier.height(32.dp))
        Button(onClick = onContinuar, enabled = todoListo, modifier = Modifier.fillMaxWidth()) {
            Text(if (todoListo) "Continuar" else "Concede los permisos para continuar")
        }
    }
}

@Composable
private fun PermisoItem(titulo: String, descripcion: String, concedido: Boolean, onSolicitar: () -> Unit) {
    Column {
        Icon(
            imageVector = if (concedido) Icons.Filled.CheckCircle else Icons.Filled.Warning,
            contentDescription = null,
            tint = if (concedido) Color(0xFF10B981) else Color(0xFFF59E0B),
        )
        Text(titulo, style = MaterialTheme.typography.titleMedium)
        Text(descripcion, style = MaterialTheme.typography.bodySmall)
        if (!concedido) {
            Spacer(Modifier.height(8.dp))
            Button(onClick = onSolicitar) { Text("Activar") }
        }
    }
}
