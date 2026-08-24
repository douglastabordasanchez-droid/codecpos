package com.codecpos.verify.data

/** Config del negocio emparejado, recibida vía AndroidNotificationBridge tras el login en la PWA. */
data class NegocioConfig(
    val webhookToken: String,
    val nombreNegocio: String?,
    val entidadesHabilitadas: Set<String>,
)
