package com.qrcodegen.core;

import java.text.Normalizer;

/**
 * Normalização de texto partilhada por todos os tipos de payload.
 *
 * <p>O comprimento de um payload é contado em caracteres, mas muitos leitores e
 * protocolos contam bytes. Acentos e emojis são a causa número um de payloads
 * que "parecem certos" e são recusados, por isso normalizamos para ASCII sempre
 * que o formato o exigir.
 *
 * <p>Espelha {@code csharp/core/Text/Text.cs} e {@code web/payloads/text.js}.
 * Alterar aqui é alterar lá.
 */
public final class Text {

    private Text() {
    }

    /**
     * Converte para ASCII sem acentos, sem caracteres de controlo e sem repetir
     * espaços.
     *
     * @param collapse {@code false} preserva os espaços tal como estão — é o
     *                 que o leitor de PIX precisa, para não mexer nos
     *                 comprimentos declarados.
     */
    public static String toAscii(String value, boolean collapse) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD);

        StringBuilder ascii = new StringBuilder(normalized.length());
        for (int i = 0; i < normalized.length(); i++) {
            char ch = normalized.charAt(i);
            if (Character.getType(ch) == Character.NON_SPACING_MARK) {
                continue; // o acento decomposto sai aqui
            }
            if (ch < 128) {
                ascii.append(ch);
            }
        }

        String result = ascii.toString();
        if (!collapse) {
            return result;
        }
        return result.trim().replaceAll("\\s+", " ");
    }

    public static String toAscii(String value) {
        return toAscii(value, true);
    }

    /** Normaliza, colapsa espaços e corta ao limite indicado. */
    public static String clean(String value, int maxLength) {
        String ascii = toAscii(value);
        return ascii.length() <= maxLength ? ascii : ascii.substring(0, maxLength).strip();
    }

    /**
     * Escapa texto de iCalendar / vCard: {@code \}, {@code ;}, {@code ,} e
     * quebras de linha.
     */
    public static String escapeICal(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        StringBuilder out = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            switch (ch) {
                case '\\' -> out.append("\\\\");
                case ';' -> out.append("\\;");
                case ',' -> out.append("\\,");
                case '\r' -> { /* CRLF é um par */ }
                case '\n' -> out.append("\\n");
                default -> out.append(ch);
            }
        }
        return out.toString();
    }

    /** Escapa um valor WiFi: {@code \}, {@code ;}, {@code ,}, {@code :}, {@code "}. */
    public static String escapeWifi(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        StringBuilder out = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '\\' || ch == ';' || ch == ',' || ch == ':' || ch == '"') {
                out.append('\\');
            }
            out.append(ch);
        }
        return out.toString();
    }

    /**
     * Percent-encoding para query strings. {@link java.net.URLEncoder} dá
     * {@code +} no espaço, que não é o mesmo que {@code %20} — e {@code +} num
     * query string é um espaço apenas em formulários, não em qualquer leitor.
     */
    public static String urlEncode(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        StringBuilder out = new StringBuilder(value.length() * 3);
        for (byte b : value.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            int c = b & 0xFF;
            boolean unreserved = (c >= 'A' && c <= 'Z')
                    || (c >= 'a' && c <= 'z')
                    || (c >= '0' && c <= '9')
                    || c == '-' || c == '_' || c == '.' || c == '~';
            if (unreserved) {
                out.append((char) c);
            } else {
                out.append('%');
                out.append(Character.toUpperCase(Character.forDigit((c >> 4) & 0xF, 16)));
                out.append(Character.toUpperCase(Character.forDigit(c & 0xF, 16)));
            }
        }
        return out.toString();
    }
}
