package com.codecpos.verify.notification

import java.text.Normalizer

/**
 * Decide si un aviso del banco es dinero RECIBIDO, ENVIADO u OTRO antes de
 * que salga del celular. Es la misma lista de `clasificar_aviso_pago` en
 * Postgres (migración 0109), que sigue siendo la que manda: si alguna vez no
 * coinciden, el servidor vuelve a revisar y rechaza.
 *
 * Orden: la evidencia de salida gana siempre; luego los avisos que no son
 * movimientos (solicitudes, códigos, promociones); y por último hace falta una
 * frase de recepción. "Pago exitoso" o el nombre del banco no bastan.
 */
object ClasificadorAviso {

    enum class Clase(val etiqueta: String) { RECIBIDO("RECIBIDO"), ENVIADO("ENVIADO"), OTRO("IGNORADO") }

    data class Resultado(val clase: Clase, val motivo: String)

    private val SALIDA = Regex(
        "(enviaste|has enviado|le enviaste|transferiste|has transferido|transferencia enviada|transferencia realizada|" +
            "transferencia exitosa a|pagaste|pasaste|has pagado|has realizado un pago|realizaste|" +
            "hiciste (un|una) (pago|compra|transferencia|envio|retiro)|pago realizado|pago exitoso|pago aprobado|tu pago|" +
            "recibimos tu|compraste|compra (en|aprobada|rechazada|por|exitosa|realizada)|retiraste|retiro (en|de|por|exitoso)|" +
            "sacaste|se debito|debitamos|debito (de|por|en|automatico)|te cobramos|cobro (de|por)|cuota de manejo|salio de tu|" +
            "salida de dinero|recarga (exitosa|de)|recargaste|fondos insuficientes|saldo insuficiente|rechazad[ao]|" +
            "declinad[ao]|no procesad[ao]|no fue posible|no se pudo|fallid[ao])"
    )

    private val NO_ES_MOVIMIENTO = Regex(
        "(solicitud|te pidi|te esta pidiendo|pidiendo plata|cobrarte|codigo de (seguridad|verificacion|acceso)|tu codigo|" +
            "clave dinamica|contrasena|token|inicio de sesion|iniciaste sesion|ingresaste|nuevo dispositivo|" +
            "alerta de seguridad|promo|descuento|cashback|puntos|bono de|gana |sorteo|credito aprobado|prestamo)"
    )

    private val ENTRADA = Regex(
        "(recibiste|has recibido|te enviaron|te envio|te transfirieron|te transfirio|te llego|te llegaron|te pasaron|" +
            "te paso|te consignaron|te consigno|te abonaron|te abono|te depositaron|te deposito|te pagaron|te pago|" +
            "pago recibido|dinero recibido|plata recibida|transferencia recibida|abono recibido|abono a tu|abonamos|" +
            "consignacion (exitosa|recibida)|entrada de dinero|ingreso de dinero|tu (cuenta|nequi|daviplata|llave) recibio)"
    )

    private val MONTO = Regex("\\$\\s?([0-9][0-9.,]*)")

    fun clasificar(texto: String): Resultado {
        val t = normalizar(texto)
        SALIDA.find(t)?.let { return Resultado(Clase.ENVIADO, "dice \"${it.value}\"") }
        NO_ES_MOVIMIENTO.find(t)?.let { return Resultado(Clase.OTRO, "no es un pago, dice \"${it.value}\"") }
        ENTRADA.find(t)?.let { return Resultado(Clase.RECIBIDO, "dice \"${it.value}\"") }
        return Resultado(Clase.OTRO, "no dice que entró dinero")
    }

    /** Solo para el registro en pantalla: el monto que cuenta lo lee el servidor. */
    fun montoVisible(texto: String): String? = MONTO.find(texto)?.value

    /** Minúsculas, sin tildes ni signos de apertura y con un solo espacio entre palabras. */
    fun normalizar(texto: String): String =
        Normalizer.normalize(texto, Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .lowercase()
            .replace('¡', ' ').replace('¿', ' ')
            .replace(Regex("\\s+"), " ")
}
