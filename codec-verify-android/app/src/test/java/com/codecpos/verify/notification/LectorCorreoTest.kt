package com.codecpos.verify.notification

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LectorCorreoTest {

    @Test
    fun dominiosDeBancoReales() {
        assertTrue(LectorCorreo.esDominioBanco("bancolombia.com.co"))
        assertTrue(LectorCorreo.esDominioBanco("an.notificacionesbancolombia.com"))
        assertTrue(LectorCorreo.esDominioBanco("nequi.com.co"))
        assertTrue(LectorCorreo.esDominioBanco("davivienda.com"))
        assertTrue(LectorCorreo.esDominioBanco("nu.com.co"))
        assertTrue(LectorCorreo.esDominioBanco("mail.nu.com.co"))
    }

    @Test
    fun dominiosFalsosParecidosNoCuentan() {
        assertFalse(LectorCorreo.esDominioBanco("bancolombia-pagos.com"))
        assertFalse(LectorCorreo.esDominioBanco("mibancolombia.net"))
        assertFalse(LectorCorreo.esDominioBanco("gmail.com"))
        assertFalse(LectorCorreo.esDominioBanco("menu.com.co"))
        assertFalse(LectorCorreo.esDominioBanco("nequi-soporte.xyz"))
    }

    @Test
    fun firmaDelBanco() {
        assertTrue(LectorCorreo.firmaDelRemitente("mx.google.com; dkim=pass header.i=@bancolombia.com.co; spf=pass; dmarc=pass (p=REJECT)", "bancolombia.com.co"))
        assertTrue(LectorCorreo.firmaDelRemitente("mx.google.com; dkim=pass header.i=@notificacionesbancolombia.com header.s=s1", "an.notificacionesbancolombia.com"))
        // Firmado por otro dominio y DMARC fallido: es un correo falso.
        assertFalse(LectorCorreo.firmaDelRemitente("mx.google.com; dkim=pass header.i=@estafa.com; spf=fail; dmarc=fail", "bancolombia.com.co"))
        assertFalse(LectorCorreo.firmaDelRemitente("mx.google.com; spf=softfail; dmarc=fail", "nequi.com.co"))
    }

    @Test
    fun recortaAlrededorDelValor() {
        val cuerpo = "Hola Juan. ".repeat(40) + "Recibiste una transferencia por \$50.000 de MARIA PEREZ en tu cuenta de ahorros. " + "Texto legal. ".repeat(40)
        val texto = LectorCorreo.recortarAviso("Recibiste una transferencia", cuerpo)
        assertTrue(texto.startsWith("Recibiste una transferencia | "))
        assertTrue(texto.contains("\$50.000"))
        assertTrue(texto.length < 380)
    }

    @Test
    fun servidorSegunElCorreo() {
        assertEquals("imap.gmail.com", LectorCorreo.servidorPara("tienda@gmail.com"))
        assertEquals("outlook.office365.com", LectorCorreo.servidorPara("tienda@hotmail.com"))
    }
}
