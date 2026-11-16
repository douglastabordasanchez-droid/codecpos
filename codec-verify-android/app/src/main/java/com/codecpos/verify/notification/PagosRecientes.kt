package com.codecpos.verify.notification

/**
 * Un mismo pago puede avisarse por tres vías: la app del banco, el SMS y el correo.
 * Aquí se recuerda cada pago registrado (valor y por qué vías llegó) para registrarlo
 * una sola vez. Dos pagos iguales por la MISMA vía sí cuentan como dos pagos.
 *
 * El correo suele llegar varios minutos después del aviso de la app, por eso
 * cuando interviene el correo la ventana es de 20 minutos (app y SMS: 3 minutos).
 */
object PagosRecientes {
    enum class Via { APP, SMS, CORREO }

    private class Registro(val valor: Long, val vias: MutableSet<Via>, val hora: Long)

    private val registros = ArrayDeque<Registro>()

    /** ¿Ese pago ya se registró por otra vía? Si es así, queda anotada también esta vía. */
    fun yaRegistradoPorOtraVia(valor: Long, via: Via): Boolean = synchronized(registros) {
        val ahora = System.currentTimeMillis()
        registros.removeAll { ahora - it.hora > 20 * 60_000 }
        val previo = registros.firstOrNull { r ->
            r.valor == valor && via !in r.vias &&
                ahora - r.hora <= if (via == Via.CORREO || Via.CORREO in r.vias) 20 * 60_000 else 3 * 60_000
        } ?: return false
        previo.vias += via
        true
    }

    fun recordar(valor: Long, via: Via) = synchronized(registros) {
        registros.addLast(Registro(valor, mutableSetOf(via), System.currentTimeMillis()))
        while (registros.size > 40) registros.removeFirst()
    }
}
