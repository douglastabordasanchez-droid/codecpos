package com.codecpos.verify.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.codecpos.verify.notification.EventoCapturado
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun StatusScreen(
    nombreNegocio: String?,
    listenerConectado: Boolean,
    entidadesHabilitadas: Set<String>,
    modoAprendizaje: Boolean,
    eventos: List<EventoCapturado>,
    onToggleEntidad: (String, Boolean) -> Unit,
    onToggleModoAprendizaje: (Boolean) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text(nombreNegocio ?: "Tu negocio", style = MaterialTheme.typography.headlineSmall)

        Spacer(Modifier.height(8.dp))
        Row {
            EstadoPunto(activo = listenerConectado)
            Spacer(Modifier.width(8.dp))
            Text(
                if (listenerConectado) "Escuchando notificaciones" else "Sin conexión al sistema de notificaciones — vuelve a activar el permiso",
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        Spacer(Modifier.height(20.dp))
        Text("Bancos habilitados", style = MaterialTheme.typography.titleMedium)
        listOf("nequi" to "Nequi", "bancolombia" to "Bancolombia (incluye pago por Llave)", "daviplata" to "Daviplata").forEach { (id, label) ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(label, style = MaterialTheme.typography.bodyLarge)
                Switch(checked = id in entidadesHabilitadas, onCheckedChange = { onToggleEntidad(id, it) })
            }
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Modo aprendizaje", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Registra el paquete de CUALQUIER notificación que llegue, sin enviarla — úsalo para descubrir el nombre exacto de una app bancaria.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Switch(checked = modoAprendizaje, onCheckedChange = onToggleModoAprendizaje)
        }

        Spacer(Modifier.height(16.dp))
        Text("Actividad reciente", style = MaterialTheme.typography.titleMedium)

        LazyColumn(modifier = Modifier.weight(1f)) {
            items(eventos) { evento -> EventoRow(evento) }
        }
    }
}

@Composable
private fun EstadoPunto(activo: Boolean) {
    androidx.compose.foundation.Canvas(modifier = Modifier.height(10.dp).width(10.dp)) {
        drawCircle(color = if (activo) Color(0xFF10B981) else Color(0xFFEF4444))
    }
}

@Composable
private fun EventoRow(evento: EventoCapturado) {
    val hora = remember(evento.timestamp) { SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(evento.timestamp)) }
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(evento.entidad, fontWeight = FontWeight.Bold)
                Text(hora, style = MaterialTheme.typography.bodySmall)
            }
            Text(evento.resumen, style = MaterialTheme.typography.bodySmall)
            if (!evento.exitoso) {
                Text(
                    evento.error ?: "No se pudo enviar",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
