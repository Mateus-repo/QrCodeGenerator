package com.qrcodegen.core;

import java.nio.charset.StandardCharsets;

/**
 * Capacidade de um QR code em modo byte, por nível de correção de erro
 * (ISO/IEC 18004). É o pior caso: texto com acentos gasta mais bytes.
 */
public final class QrCapacity {

    private QrCapacity() {
    }

    public static int limitFor(EccLevel level) {
        return switch (level) {
            case L -> 2953;
            case M -> 2331;
            case Q -> 1663;
            case H -> 1273;
        };
    }

    /**
     * Valida o tamanho do payload e devolve a capacidade máxima.
     *
     * @throws QrCapacityException se o payload não couber
     */
    public static int check(String payload, EccLevel level) {
        if (payload == null) {
            throw new IllegalArgumentException("payload");
        }

        int used = payload.getBytes(StandardCharsets.UTF_8).length;
        int limit = limitFor(level);

        if (used > limit) {
            throw new QrCapacityException(
                    "O conteúdo ocupa %d bytes e o limite com ECC %s é %d."
                            .formatted(used, level, limit));
        }

        return limit;
    }
}
