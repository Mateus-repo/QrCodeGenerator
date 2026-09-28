package com.qrcodegen.core.pix;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Campo TLV do BR Code: identificador de 2 dígitos, comprimento de 2 dígitos
 * (com zeros à esquerda) e valor.
 *
 * <p>Os campos {@code 26} e {@code 62} são templates: o seu valor é outra
 * sequência TLV e o parser tem de ser recursivo nesses dois.
 */
public record Tlv(String id, String value) {

    @Override
    public String toString() {
        return "%s%02d%s".formatted(id, value.length(), value);
    }

    /** Leitor/escritor de sequências TLV. */
    public static final class Sequence {

        private Sequence() {
        }

        /** Concatena campos numa string BR Code. */
        public static String build(Tlv... fields) {
            StringBuilder out = new StringBuilder();
            for (Tlv field : fields) {
                out.append(field);
            }
            return out.toString();
        }

        /**
         * Lê uma sequência TLV, validando cada comprimento declarado.
         *
         * @throws PixException se um comprimento não bater certo
         */
        public static List<Tlv> parse(String data) {
            List<Tlv> fields = new ArrayList<>();
            int i = 0;

            while (i < data.length()) {
                if (i + 4 > data.length()) {
                    throw new PixException("Payload truncado (TLV incompleto).");
                }

                String id = data.substring(i, i + 2);
                if (!id.chars().allMatch(Character::isDigit)) {
                    throw new PixException("Tag inválida: '" + id + "'.");
                }

                String rawLength = data.substring(i + 2, i + 4);
                if (!rawLength.chars().allMatch(Character::isDigit)) {
                    throw new PixException("Campo " + id + " tem comprimento inválido: '" + rawLength + "'.");
                }

                int length = Integer.parseInt(rawLength);
                int end = Math.min(i + 4 + length, data.length());
                String value = data.substring(i + 4, end);

                if (value.length() != length) {
                    throw new PixException("Campo %s tem comprimento declarado %d mas contém %d caracteres"
                            + " — payload truncado ou corrompido."
                            .formatted(id, length, value.length()));
                }

                fields.add(new Tlv(id, value));
                i += 4 + length;
            }

            return fields;
        }

        /** Lê uma sequência TLV e devolve os campos por identificador. */
        public static Map<String, String> parseToMap(String data) {
            Map<String, String> map = new LinkedHashMap<>();
            for (Tlv field : parse(data)) {
                map.put(field.id(), field.value());
            }
            return map;
        }
    }
}
