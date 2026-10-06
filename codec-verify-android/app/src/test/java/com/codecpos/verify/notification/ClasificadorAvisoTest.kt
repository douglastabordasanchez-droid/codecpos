package com.codecpos.verify.notification

import org.junit.Assert.assertEquals
import org.junit.Test

/** Mismos casos con los que se probó clasificar_aviso_pago en Postgres (migración 0109). */
class ClasificadorAvisoTest {

    private val casos = listOf(
        "recibido" to "Nequi | ¡Te enviaron plata! | JUAN PEREZ te envió $25.000",
        "recibido" to "Te enviaron plata por Bre-B | Recibiste $50.000 de MARIA",
        "recibido" to "Nequi | Recibiste un envío por Transfiya de $10.000",
        "recibido" to "DaviPlata | Transaccion exitosa: Recibiste Plata de otra entidad usando Llaves por $20.000",
        "recibido" to "DaviPlata | Te pasaron plata: $15.000 de CARLOS",
        "recibido" to "Bancolombia: Recibiste una transferencia de KAREN DAYANA BENAVIDES GUZMAN por $41,000.00 en tu cuenta *1234",
        "recibido" to "Davivienda | Abono a tu cuenta de ahorros por $30.000",
        "recibido" to "BBVA | Transferencia recibida por $12.500",
        "recibido" to "Nu | Te llegó plata con tu llave Bre-B: $8.000",
        "enviado" to "Nequi | Tu pago ha sido exitoso | Pagaste $50.000 en TIENDA X",
        "enviado" to "Pago exitoso de $50.000",
        "enviado" to "Has realizado un pago de $25.000",
        "enviado" to "Nequi | Enviaste $20.000 a JUAN PEREZ",
        "enviado" to "Bancolombia: MICHAEL, transferiste $40.000 a la llave @juan",
        "enviado" to "Compra aprobada en EXITO por $35.000",
        "enviado" to "Compra rechazada por fondos insuficientes $80.000",
        "enviado" to "Transacción declinada por $10.000",
        "enviado" to "Recibimos tu pago de la tarjeta por $100.000",
        "enviado" to "Se debitó $5.000 de tu cuenta",
        "enviado" to "Hiciste una transferencia de $25.000 por Bre-B",
        "otro" to "Nequi | JUAN te está pidiendo plata: $25.000",
        "otro" to "Te enviaron una solicitud de plata por $10.000",
        "otro" to "Nequi | Aprovecha esta promo: 20% de descuento",
        "otro" to "Tu código de seguridad es 123456",
        "otro" to "Iniciaste sesión en un nuevo dispositivo",
        "otro" to "Nequi | Transferencia exitosa | $25.000",
        "otro" to "Bancolombia: movimiento en tu cuenta $25.000",
        "enviado" to "Compra rechazada con Tarjeta Nequi | Fondos insuficientes para pagar 154.914,42 en WORKANA",
        "enviado" to "DaviPlata | Transaccion exitosa: Pasaste $50 a Duglas Taborda usando Llaves. Conoce mas desde los movimientos de tu DaviPlata.",
        "enviado" to "Pago exitoso por PSE | Hiciste un pago en FONDO DE INVERSIÓN COLECTIVA ACCIVAL VISTA por $20.230 y todo salió bien.",
        "otro" to "Envío de plata exitoso | Te contamos que el envío de plata por $50 fue exitoso. Puedes revisar en tus movimientos el detalle del envío.",
        "otro" to "DaviPlata | Su DaviPlata sigue abierto. Aún no ha salido de la aplicación",
        "otro" to "¿Ya activaste tus tarjetas virtuales? | Hazlo y úsalas para hacer tus compras digitales y suscripciones en línea.",
        "recibido" to "Envío | INGRID DURAN te envió 50, ¡lo mejor!",
        "recibido" to "Te enviaron plata por Bre-B | Te enviaron $50. Entra a tu app y revisa tu saldo.",
        "recibido" to "85888 | Recibiste $50. Para saber mas, consulta tus movimientos.",
        "recibido" to "DaviPlata | Transaccion exitosa: Recibiste Plata de otra entidad usando Llaves, consulta el detalle de tus movimientos desde el app DaviPlata.",
    )

    @Test
    fun clasificaComoElServidor() {
        val mal = casos.filter { (esperado, texto) ->
            ClasificadorAviso.clasificar(texto).clase.name.lowercase() != esperado
        }
        assertEquals("Casos mal clasificados: $mal", emptyList<Pair<String, String>>(), mal)
    }

    @Test
    fun smsDeBancoSoloDesdeCodigoCortoOContacto() {
        assertEquals("daviplata", ClasificadorAviso.entidadDeSms("85888", "Recibiste $50. Para saber mas"))
        assertEquals("nequi", ClasificadorAviso.entidadDeSms("85954", "Nequi: recibiste $20.000"))
        assertEquals("sms_banco", ClasificadorAviso.entidadDeSms("89123", "Recibiste $20.000"))
        assertEquals("bancolombia", ClasificadorAviso.entidadDeSms("Bancolombia", "Recibiste una transferencia por $41,000.00"))
        // Un celular cualquiera que diga "Recibiste $500.000" es una estafa común: nunca cuenta.
        assertEquals(null, ClasificadorAviso.entidadDeSms("+57 300 123 4567", "Recibiste $500.000 de DaviPlata"))
        assertEquals(null, ClasificadorAviso.entidadDeSms("Mamá", "Recibiste $50.000"))
    }

    @Test
    fun valorDelAviso() {
        assertEquals(false, ClasificadorAviso.tieneValor("DaviPlata | Transaccion exitosa: Recibiste Plata de otra entidad usando Llaves"))
        assertEquals(50L, ClasificadorAviso.valorEnPesos("85888 | Recibiste $50. Para saber mas"))
        assertEquals(50L, ClasificadorAviso.valorEnPesos("Envío | INGRID DURAN te envió 50, ¡lo mejor!"))
        assertEquals(41000L, ClasificadorAviso.valorEnPesos("Recibiste una transferencia de KAREN por $41,000.00"))
        assertEquals(25000L, ClasificadorAviso.valorEnPesos("Te enviaron $25.000"))
    }

    @Test
    fun otrosBancosSoloSiHablaDeDinero() {
        // Bancos y billeteras fuera de la lista
        assertEquals(true, ClasificadorAviso.hablaDeDinero("Lulo Bank | Recibiste $20.000 de CARLOS"))
        assertEquals(true, ClasificadorAviso.hablaDeDinero("Nu | Te llegó plata por Bre-B: 35.000"))
        assertEquals(true, ClasificadorAviso.hablaDeDinero("Banco de Bogotá | Recibiste una transferencia de 15000 pesos"))
        assertEquals(ClasificadorAviso.Clase.RECIBIDO, ClasificadorAviso.clasificar("Lulo Bank | Recibiste $20.000 de CARLOS").clase)
        // No son dinero: juegos y apps de puntos
        assertEquals(false, ClasificadorAviso.hablaDeDinero("Candy Crush | Recibiste 500 vidas"))
        assertEquals(ClasificadorAviso.Clase.OTRO, ClasificadorAviso.clasificar("Juego | Recibiste 500 monedas de oro").clase)
        assertEquals(ClasificadorAviso.Clase.OTRO, ClasificadorAviso.clasificar("Aerolínea | Recibiste 2.000 millas").clase)
    }
}
