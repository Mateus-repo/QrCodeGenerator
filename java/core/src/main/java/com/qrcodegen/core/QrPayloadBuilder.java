package com.qrcodegen.core;

import com.qrcodegen.core.pix.Pix;
import com.qrcodegen.core.pix.PixPayload;

import java.util.Locale;

/**
 * Payload e validação de cada categoria.
 *
 * <p>Espelha {@code csharp/core/QrPayloadBuilder.cs} e
 * {@code web/payloads/types.js}. O formato de cada tipo está descrito em
 * {@code docs/TIPOS-QR.md}; se as três stacks divergirem, é bug.
 *
 * <p>Os payloads são escritos à mão, e não gerados por uma biblioteca: era aí
 * que estavam os defeitos de iCalendar (fim de linha e escaping) e de vCard
 * (morada sempre vazia).
 */
public final class QrPayloadBuilder {

    /**
     * Linha de registo iCalendar. A RFC 5545 exige CRLF — sempre, em qualquer
     * sistema operativo.
     *
     * <p>Não usar {@code System.lineSeparator()}: era exatamente isso que fazia
     * o payload diferir entre Windows (CRLF) e Linux/macOS (LF).
     */
    public static final String ICAL_NEWLINE = "\r\n";

    private QrPayloadBuilder() {
    }

    /** Constrói o payload da categoria. Lança se algo estiver errado. */
    public static String build(QrCategory category, QrFields fields) {
        if (fields == null) {
            throw new IllegalArgumentException("fields");
        }

        return switch (category) {
            case LINK -> Normalize.url(fields.url()).url();
            case TEXTO -> fields.texto() == null ? "" : fields.texto().strip();
            case EMAIL -> buildEmail(fields);
            case TELEFONE -> "tel:" + Normalize.phone(fields.phonePrefix(), fields.phoneNumber());
            case SMS -> buildSms(fields);
            case WHATSAPP -> buildWhatsApp(fields);
            case EVENTO -> buildICalEvent(fields);
            case LOCALIZACAO -> buildGeo(fields);
            case WIFI -> buildWifi(fields);
            case VCARD -> buildVCard(fields);
            case PIX -> buildPix(fields);
        };
    }

    // --- Email ------------------------------------------------------------

    private static String buildEmail(QrFields f) {
        String to = f.mailTo() == null ? "" : f.mailTo().strip();
        StringBuilder query = new StringBuilder();

        if (notBlank(f.mailSubject())) {
            append(query, "subject=" + Text.urlEncode(f.mailSubject().strip()));
        }
        if (notBlank(f.mailBody())) {
            append(query, "body=" + Text.urlEncode(f.mailBody().strip()));
        }

        return query.isEmpty() ? "mailto:" + to : "mailto:" + to + "?" + query;
    }

    // --- SMS / WhatsApp ---------------------------------------------------

    private static String buildSms(QrFields f) {
        // O corpo do SMSTO vai até ao fim da string: um ':' ou uma quebra de
        // linha fariam os leitores interpretarem mal (validado antes).
        String message = f.smsMessage() == null ? "" : f.smsMessage();
        return "SMSTO:" + Normalize.phone(f.phonePrefix(), f.phoneNumber()) + ":" + message;
    }

    private static String buildWhatsApp(QrFields f) {
        String number = Normalize.digitsOnly(Normalize.phone(f.phonePrefix(), f.phoneNumber()));
        String message = f.waMessage() == null ? "" : f.waMessage();

        return message.isEmpty()
                ? "https://wa.me/" + number
                : "https://wa.me/" + number + "?text=" + Text.urlEncode(message);
    }

    // --- Evento (iCalendar) -----------------------------------------------

    private static String buildICalEvent(QrFields f) {
        StringBuilder out = new StringBuilder();

        var start = utc(f.eventStart());
        var end = utc(f.eventEnd());

        out.append("BEGIN:VCALENDAR").append(ICAL_NEWLINE);
        append(out, "VERSION", "2.0");
        append(out, "PRODID", "-//QrCodeGenerator//PT");
        append(out, "CALSCALE", "GREGORIAN");
        out.append("BEGIN:VEVENT").append(ICAL_NEWLINE);

        // Sem UID aleatório: o payload tem de ser reproduzível para passar nos
        // vetores de spec/vectors.json.
        append(out, "DTSTAMP", stamp(start));
        append(out, "DTSTART", stamp(start));
        append(out, "DTEND", stamp(end));
        append(out, "SUMMARY", Text.escapeICal(f.eventTitle() == null ? "" : f.eventTitle().strip()));
        append(out, "LOCATION", Text.escapeICal(f.eventLocation() == null ? "" : f.eventLocation().strip()));
        append(out, "DESCRIPTION", Text.escapeICal(f.eventDescription() == null ? "" : f.eventDescription().strip()));

        out.append("END:VEVENT").append(ICAL_NEWLINE);
        out.append("END:VCALENDAR").append(ICAL_NEWLINE);
        return out.toString();
    }

    private static java.time.ZonedDateTime utc(java.time.LocalDateTime value) {
        // O DateTimePicker dá hora local; o iCalendar quer UTC, e o fuso do
        // utilizador não pode mudar o payload entre máquinas.
        return (value == null ? java.time.LocalDateTime.now() : value)
                .atZone(java.time.ZoneId.systemDefault())
                .withZoneSameInstant(java.time.ZoneOffset.UTC);
    }

    private static String stamp(java.time.ZonedDateTime value) {
        return value.format(java.time.format.DateTimeFormatter
                .ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT));
    }

    // --- Localização ------------------------------------------------------

    private static String buildGeo(QrFields f) {
        // A latitude e a longitude chegam validadas por QrValidator.
        return "geo:" + round7(f.geoLat()) + "," + round7(f.geoLng());
    }

    private static String round7(double value) {
        java.math.BigDecimal rounded = java.math.BigDecimal.valueOf(value)
                .setScale(7, java.math.RoundingMode.HALF_UP)
                // setScale preenche com zeros à direita: 38.7223 virava
                // 38.7223000, e isso é uma divergência real face ao C# e ao
                // Python, que não acrescentam casas vazias.
                .stripTrailingZeros();

        // toPlainString não usa separadores de milhar nem notação científica.
        return rounded.toPlainString();
    }

    // --- WiFi -------------------------------------------------------------

    private static String buildWifi(QrFields f) {
        String auth = switch (f.wifiSec() == null ? "WPA" : f.wifiSec()) {
            case "WEP" -> "WEP";
            case "Aberto" -> "nopass";
            default -> "WPA";
        };

        StringBuilder out = new StringBuilder("WIFI:");
        out.append("T:").append(auth).append(';');
        out.append("S:").append(Text.escapeWifi(f.wifiSsid() == null ? "" : f.wifiSsid().strip())).append(';');

        if (!auth.equals("nopass")) {
            out.append("P:").append(Text.escapeWifi(f.wifiPass() == null ? "" : f.wifiPass())).append(';');
        }

        if (f.wifiHidden()) {
            out.append("H:true;");
        }

        out.append(';'); // terminador vazio obrigatório
        return out.toString();
    }

    // --- VCard ------------------------------------------------------------

    private static String buildVCard(QrFields f) {
        String first = f.vcFirstName() == null ? "" : f.vcFirstName().strip();
        String last = f.vcLastName() == null ? "" : f.vcLastName().strip();
        String fullName = (first + " " + last).strip();

        StringBuilder out = new StringBuilder();
        line(out, "BEGIN:VCARD");
        line(out, "VERSION:4.0");
        line(out, "FN:" + Text.escapeICal(fullName));
        // N: família;given;extra;prefixo;sufixo — a família vem primeiro.
        line(out, "N:" + Text.escapeICal(last) + ';' + Text.escapeICal(first) + ";;;");
        line(out, "PRODID:-//QrCodeGenerator//PT");

        if (notBlank(f.vcOrg())) {
            line(out, "ORG:" + Text.escapeICal(f.vcOrg().strip()));
        }
        if (notBlank(f.vcRole())) {
            line(out, "TITLE:" + Text.escapeICal(f.vcRole().strip()));
        }

        if (notBlank(f.vcPhone())) {
            line(out, "TEL;TYPE=cell:" + f.vcPhone().strip());
        }
        if (notBlank(f.vcPhone2())) {
            line(out, "TEL;TYPE=work:" + f.vcPhone2().strip());
        }
        if (notBlank(f.vcEmail())) {
            line(out, "EMAIL:" + f.vcEmail().strip());
        }

        // ADR;TYPE=work:;;rua;localidade;região;código postal;país
        String street = f.vcStreet() == null ? "" : f.vcStreet().strip();
        String city = f.vcCity() == null ? "" : f.vcCity().strip();
        String zip = f.vcZip() == null ? "" : f.vcZip().strip();
        String country = f.vcCountry() == null ? "" : f.vcCountry().strip();

        if (!street.isEmpty() || !city.isEmpty() || !zip.isEmpty() || !country.isEmpty()) {
            line(out, "ADR;TYPE=work:;;"
                    + Text.escapeICal(street) + ';'
                    + Text.escapeICal(city) + ";;"
                    + Text.escapeICal(zip) + ';'
                    + Text.escapeICal(country));
        }

        line(out, "END:VCARD");
        return out.toString();
    }

    // --- PIX --------------------------------------------------------------

    private static String buildPix(QrFields f) {
        return Pix.build(new PixPayload(
                f.pixKey(),
                f.pixName(),
                f.pixCity(),
                Pix.parseAmount(f.pixAmount()),
                f.pixTxid(),
                f.pixDescription(),
                f.pixPostcode(),
                f.pixSingleUse()));
    }

    // --- Utilitários ------------------------------------------------------

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static void line(StringBuilder out, String value) {
        out.append(value).append(ICAL_NEWLINE);
    }

    private static void append(StringBuilder out, String name, String value) {
        out.append(name).append(':').append(value).append(ICAL_NEWLINE);
    }

    private static void append(StringBuilder query, String pair) {
        if (!query.isEmpty()) {
            query.append('&');
        }
        query.append(pair);
    }

    /**
     * Caracteres aceites no corpo de um SMS: GSM 03.38 mais as extensões que os
     * operadores aceitam.
     */
    private static final java.util.Set<Character> SMS_SAFE = buildSmsAlphabet();

    private static java.util.Set<Character> buildSmsAlphabet() {
        String alphabet = "0123456789"
                + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                + "abcdefghijklmnopqrstuvwxyz"
                + " -.,!?()'*+/:&%£$€¥=#@\"_<>;";

        java.util.Set<Character> set = new java.util.HashSet<>();
        for (int i = 0; i < alphabet.length(); i++) {
            set.add(alphabet.charAt(i));
        }
        return set;
    }

    public static boolean isSmsSafe(String message) {
        if (message == null || message.isEmpty()) {
            return true;
        }
        for (int i = 0; i < message.length(); i++) {
            if (!SMS_SAFE.contains(message.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}
