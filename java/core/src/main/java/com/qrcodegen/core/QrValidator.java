package com.qrcodegen.core;

import com.qrcodegen.core.pix.Pix;
import com.qrcodegen.core.pix.PixException;
import com.qrcodegen.core.pix.PixKey;

/**
 * Validação por categoria. Devolve {@code null} quando está tudo bem, ou uma
 * mensagem de erro em português.
 *
 * <p>As mensagens são específicas do campo: um erro genérico faz o utilizador
 * procurar o problema no sítio errado.
 *
 * <p>Espelha {@code csharp/core/QrValidator.cs}.
 */
public final class QrValidator {

    private QrValidator() {
    }

    public static String validate(QrCategory category, QrFields f) {
        if (f == null) {
            return "Categoria desconhecida.";
        }

        return switch (category) {
            case LINK -> validateLink(f);
            case TEXTO -> validateText(f);
            case EMAIL -> validateEmail(f);
            case TELEFONE -> validatePhone(f, false);
            case SMS -> validatePhone(f, true);
            case WHATSAPP -> validatePhone(f, false);
            case EVENTO -> validateEvent(f);
            case LOCALIZACAO -> validateGeo(f);
            case WIFI -> validateWifi(f);
            case VCARD -> validateVCard(f);
            case PIX -> validatePix(f);
        };
    }

    private static String validateLink(QrFields f) {
        return Normalize.url(f.url()).error();
    }

    private static String validateText(QrFields f) {
        return isBlank(f.texto()) ? "Escreve algum texto." : null;
    }

    private static String validateEmail(QrFields f) {
        if (isBlank(f.mailTo())) {
            return "Indica o destinatário do email.";
        }

        String to = f.mailTo().strip();
        if (!to.contains("@") || to.startsWith("@") || to.endsWith("@") || to.contains(" ")) {
            return "O destinatário não parece um email válido.";
        }
        return null;
    }

    private static String validatePhone(QrFields f, boolean sms) {
        if (isBlank(f.phoneNumber())) {
            return "Indica o número de telefone.";
        }

        if (Normalize.phonePrefix(f.phonePrefix()).isEmpty()) {
            return "Indica o indicativo do país (ex.: +351).";
        }

        if (Normalize.digitsOnly(f.phoneNumber()).length() < 4) {
            return "O número de telefone é curto demais.";
        }

        if (sms && !isBlank(f.smsMessage()) && !QrPayloadBuilder.isSmsSafe(f.smsMessage())) {
            return "A mensagem tem caracteres que um SMS não suporta (ex.: { } [ ] ~ ^ | €).";
        }

        return null;
    }

    private static String validateEvent(QrFields f) {
        if (isBlank(f.eventTitle())) {
            return "Indica o título do evento.";
        }

        if (f.eventStart() != null && f.eventEnd() != null && f.eventEnd().isBefore(f.eventStart())) {
            return "A data de fim não pode ser anterior à de início.";
        }

        return null;
    }

    private static String validateGeo(QrFields f) {
        if (f.geoLat() == null) {
            return "Indica uma latitude válida (ex.: 38.7223).";
        }
        if (f.geoLng() == null) {
            return "Indica uma longitude válida (ex.: -9.1393).";
        }

        // Antes não havia validação de intervalo: qualquer número passava e
        // produzia um geo: que nenhum mapa conseguia abrir.
        if (Double.isNaN(f.geoLat()) || f.geoLat() < -90 || f.geoLat() > 90) {
            return "A latitude tem de estar entre -90 e 90.";
        }
        if (Double.isNaN(f.geoLng()) || f.geoLng() < -180 || f.geoLng() > 180) {
            return "A longitude tem de estar entre -180 e 180.";
        }

        return null;
    }

    private static String validateWifi(QrFields f) {
        if (isBlank(f.wifiSsid())) {
            return "Indica o nome da rede (SSID).";
        }

        String ssid = f.wifiSsid().strip();
        if (ssid.length() > 32) {
            return "O SSID tem mais de 32 caracteres.";
        }

        boolean open = "Aberto".equalsIgnoreCase(f.wifiSec());
        if (open) {
            return null;
        }

        if (f.wifiPass() == null || f.wifiPass().isEmpty()) {
            return "Indica a password da rede.";
        }
        if (f.wifiPass().length() > 63) {
            return "A password tem mais de 63 caracteres.";
        }

        return null;
    }

    private static String validateVCard(QrFields f) {
        if (isBlank(f.vcFirstName()) && isBlank(f.vcLastName()) && isBlank(f.vcPhone())
                && isBlank(f.vcPhone2()) && isBlank(f.vcEmail())) {
            return "Preenche pelo menos um campo do contacto.";
        }

        if (!isBlank(f.vcEmail())) {
            String email = f.vcEmail().strip();
            if (!email.contains("@") || email.startsWith("@") || email.endsWith("@")) {
                return "O email não parece válido.";
            }
        }

        return null;
    }

    private static String validatePix(QrFields f) {
        try {
            PixKey.validate(f.pixKey());
        } catch (PixException e) {
            return e.getMessage();
        }

        if (isBlank(f.pixName())) {
            return "Indica o nome do recebedor (max. %d caracteres).".formatted(Pix.MAX_NAME);
        }

        if (isBlank(f.pixCity())) {
            return "Indica a cidade do recebedor (max. %d caracteres).".formatted(Pix.MAX_CITY);
        }

        try {
            Pix.parseAmount(f.pixAmount());
        } catch (PixException e) {
            return e.getMessage();
        }

        return null;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
