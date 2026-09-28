package com.qrcodegen.core.pix;

import java.nio.charset.StandardCharsets;

/**
 * CRC-16/CCITT-FALSE: polinómio 0x1021, valor inicial 0xFFFF, sem reflexão de
 * bits e sem XOR final.
 *
 * <p>O detalhe que derruba a maioria das implementações é a ordem: concatena-se
 * {@code "6304"} ao fim da string <em>antes</em> de calcular, e o resultado
 * ocupa os quatro caracteres seguintes.
 */
public final class Crc16 {

    /** Vetor de validação canónico. */
    public static final String SELF_TEST_INPUT = "123456789";
    public static final int SELF_TEST_EXPECTED = 0x29B1;

    private Crc16() {
    }

    public static int of(String data) {
        if (data == null) {
            throw new IllegalArgumentException("data");
        }

        int crc = 0xFFFF;
        for (byte raw : data.getBytes(StandardCharsets.ISO_8859_1)) {
            crc ^= (raw & 0xFF) << 8;
            for (int i = 0; i < 8; i++) {
                if ((crc & 0x8000) != 0) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        return crc;
    }

    /** CRC em 4 caracteres hexadecimais maiúsculos. */
    public static String hex(String data) {
        return String.format("%04X", of(data));
    }
}
