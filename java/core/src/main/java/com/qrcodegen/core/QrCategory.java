package com.qrcodegen.core;

/** Categoria do QR code. A ordem define a ordem na interface. */
public enum QrCategory {

    LINK("Link"),
    TEXTO("Texto"),
    EMAIL("Email"),
    TELEFONE("Telefone"),
    SMS("SMS"),
    WHATSAPP("WhatsApp"),
    EVENTO("Evento"),
    LOCALIZACAO("Localização"),
    WIFI("WiFi"),
    VCARD("VCard"),
    PIX("PIX");

    private final String label;

    QrCategory(String label) {
        this.label = label;
    }

    /** Nome de apresentação, em português. */
    public String label() {
        return label;
    }
}
