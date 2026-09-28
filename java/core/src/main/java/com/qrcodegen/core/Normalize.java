package com.qrcodegen.core;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Normalização de telefone e de URL, partilhada por várias categorias.
 *
 * <p>Espelha {@code csharp/core/Normalize.cs}.
 */
public final class Normalize {

    private static final Pattern SCHEME_AT_START = Pattern.compile("^([A-Za-z][A-Za-z0-9+.\\-]*):");

    private static final Set<String> ALLOWED_SCHEMES =
            Set.of("http", "https", "mailto", "tel", "sms", "geo", "wifi");

    private static final Set<String> DANGEROUS_SCHEMES =
            Set.of("javascript", "data", "file", "vbscript", "about", "blob");

    private Normalize() {
    }

    /**
     * Normaliza o indicativo de país: {@code 00} ou {@code 351} → {@code +351}.
     *
     * <p>Antes só era convertido quando o {@code 00} estivesse exatamente no
     * início da string, o que fazia o mesmo número dar resultados diferentes
     * conforme a maneira como era colado.
     */
    public static String phonePrefix(String raw) {
        String p = Text.toAscii(raw).strip();
        if (p.isEmpty()) {
            return "";
        }

        if (p.startsWith("00")) {
            p = "+" + p.substring(2);
        } else if (!p.startsWith("+")) {
            p = "+" + p;
        }

        // Só podem sobrar dígitos depois do '+'.
        int plus = p.indexOf('+');
        String afterPlus = plus >= 0 ? p.substring(plus + 1) : p;
        String onlyDigits = afterPlus.replaceAll("\\D", "");
        if (onlyDigits.isEmpty()) {
            return "";
        }

        return plus >= 0 ? "+" + onlyDigits : onlyDigits;
    }

    /** Número de telefone só com dígitos, já com o indicativo. */
    public static String phone(String prefix, String number) {
        return phonePrefix(prefix) + digitsOnly(number);
    }

    /** Só dígitos, para o WhatsApp ({@code wa.me} não aceita o {@code +}). */
    public static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    /** Resultado da validação de um link: a URL ou o erro. */
    public record UrlResult(String url, String error) {

        public boolean ok() {
            return error == null;
        }
    }

    /**
     * Acrescenta o esquema em falta e recusa esquemas que possam executar
     * código no leitor.
     */
    public static UrlResult url(String raw) {
        String url = raw == null ? "" : raw.strip();

        if (url.isEmpty()) {
            return new UrlResult(null, "Indica um link.");
        }

        Matcher matcher = SCHEME_AT_START.matcher(url);
        if (!matcher.find()) {
            return new UrlResult("https://" + url, null);
        }

        String scheme = matcher.group(1).toLowerCase(java.util.Locale.ROOT);

        if (DANGEROUS_SCHEMES.contains(scheme)) {
            return new UrlResult(null, "O esquema '" + scheme + ":' não é permitido num QR code.");
        }

        if (!ALLOWED_SCHEMES.contains(scheme)) {
            return new UrlResult(null, "Esquema '" + scheme
                    + ":' não suportado. Usa " + String.join(", ", ALLOWED_SCHEMES.stream().map(s -> s + ":").toList())
                    + ".");
        }

        return new UrlResult(url, null);
    }
}
