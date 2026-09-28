package com.qrcodegen.core.pix;

import java.math.BigDecimal;

/**
 * Dados de um QR PIX estático.
 *
 * @param key        CPF, CNPJ, telefone com +55, email ou chave aleatória (UUID)
 * @param name       nome do recebedor — máximo 25 caracteres, acentos normalizados
 * @param city       cidade do recebedor — máximo 15 caracteres
 * @param amount     valor em reais, ou {@code null} para o pagador escolher
 * @param txid       identificador da transação — máximo 25 alfanuméricos
 * @param description campo opcional 26.02
 * @param postcode   CEP (campo 61)
 * @param singleUse  QR de uso único (campo 01 = 12)
 */
public record PixPayload(
        String key,
        String name,
        String city,
        BigDecimal amount,
        String txid,
        String description,
        String postcode,
        boolean singleUse) {

    public PixPayload {
        name = name == null ? "" : name;
        city = city == null ? "" : city;
        txid = txid == null || txid.isBlank() ? Pix.PLACEHOLDER_TXID : txid;
        description = description == null ? "" : description;
        postcode = postcode == null ? "" : postcode;
    }

    /** Construtor sem os campos opcionais. */
    public PixPayload(String key, String name, String city) {
        this(key, name, city, null, null, null, null, false);
    }

    public PixPayload withKey(String newKey) {
        return new PixPayload(newKey, name, city, amount, txid, description, postcode, singleUse);
    }

    public PixPayload withAmount(BigDecimal newAmount) {
        return new PixPayload(key, name, city, newAmount, txid, description, postcode, singleUse);
    }
}
