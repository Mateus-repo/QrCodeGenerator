package com.qrcodegen.core.pix;

import com.qrcodegen.core.Normalize;
import com.qrcodegen.core.Text;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Geração e leitura de payloads PIX (BR Code, EMV-QRCPS-MPM).
 *
 * <p>Espelha {@code csharp/core/Pix/Pix.cs} e
 * {@code python/qrcode_core/pix.py}. Os três têm de produzir exatamente a mesma
 * string para os mesmos campos — é isso que os vetores de
 * {@code spec/vectors.json} verificam.
 *
 * <p>Referência: Banco Central do Brasil, "Manual de Padrões para Iniciação do
 * Pix".
 *
 * <h2>Portabilidade</h2>
 * Este código tem de dar exatamente a mesma string em Windows, macOS e Linux.
 * Três coisas traem isso:
 * <ul>
 *   <li><b>Linhas:</b> o payload do iCalendar usa {@code \r\n} explícito, nunca
 *       {@code System.lineSeparator()}. Era esse o bug que fazia a versão
 *       original do C# dar payloads diferentes por sistema operativo.</li>
 *   <li><b>Caso:</b> {@code toUpperCase()} sem locale falha em grego e
 *       turco: {@code "i"} passa a {@code "İ"} e o payload sai errado. Todos os
 *       {@code toUpperCase}/{@code toLowerCase} levam {@link Locale#ROOT}.</li>
 *   <li><b>Números:</b> {@code BigDecimal} e {@code String.format} são
 *       sensíveis à locale. Tudo o que toque no payload fixa o
 *       {@link Locale#ROOT}.</li>
 * </ul>
 */
public final class Pix {

    public static final String GUI = "br.gov.bcb.pix";
    public static final String PLACEHOLDER_TXID = "***";
    public static final int MAX_NAME = 25;
    public static final int MAX_CITY = 15;
    public static final int MAX_TXID = 25;
    public static final int MAX_POSTCODE = 9;
    public static final int MAX_TEMPLATE_26 = 99;

    private static final String CRC_TAG = "6304";

    /** Só conta como milhar quando tem 3 dígitos a seguir e não no fim. */
    private static final Pattern THOUSANDS = Pattern.compile("\\.\\d{3}(?!\\d)");

    private Pix() {
    }

    // --- Valor ------------------------------------------------------------

    /**
     * Aceita {@code 25,75} (pt-BR) e {@code 25.75}. O ponto só é separador de
     * milhar quando seguido de exatamente 3 dígitos e não no fim do valor.
     *
     * @return {@code null} se não houver valor
     */
    public static BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }

        String text = Text.toAscii(raw).strip()
                .replaceAll("(?i)R\\$", "")
                .replace(" ", "");

        if (text.isEmpty()) {
            return null;
        }

        if (text.contains(",")) {
            text = text.replace(".", "").replace(',', '.');
        } else if (THOUSANDS.matcher(text).find()) {
            text = text.replace(".", "");
        }

        BigDecimal value;
        try {
            value = new BigDecimal(text);
        } catch (NumberFormatException e) {
            throw new PixException("Valor inválido: '%s'.".formatted(raw));
        }

        if (value.signum() < 0) {
            throw new PixException("O valor não pode ser negativo.");
        }

        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static String formatAmount(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String cleanTxid(String raw) {
        String txid = Text.toAscii(raw).replaceAll("[^A-Za-z0-9]", "");
        if (txid.length() > MAX_TXID) {
            txid = txid.substring(0, MAX_TXID);
        }
        return txid.isEmpty() ? PLACEHOLDER_TXID : txid;
    }

    /**
     * Monta o template 26, truncando a descrição para respeitar o teto de 99
     * caracteres. A chave nunca é cortada.
     */
    private static String merchantAccountTemplate(String key, String description) {
        // StringBuilder.append(Object) chama o toString() do Tlv; o operador +
        // não chamaria, e esse era o erro.
        StringBuilder template = new StringBuilder();
        template.append(new Tlv("00", GUI)).append(new Tlv("01", key));

        if (description == null || description.isBlank()) {
            return template.toString();
        }

        int room = MAX_TEMPLATE_26 - template.length() - 4; // -4 = tag+length de "02"
        if (room <= 0) {
            return template.toString();
        }

        String text = Text.clean(description, room);
        if (text.isEmpty()) {
            return template.toString();
        }

        return template.append(new Tlv("02", text)).toString();
    }

    // --- Geração ----------------------------------------------------------

    /** Gera a string BR Code (PIX copia e cola). */
    public static String build(PixPayload payload) {
        if (payload == null) {
            throw new IllegalArgumentException("payload");
        }

        String key = PixKey.validate(payload.key());

        String name = Text.clean(payload.name(), MAX_NAME);
        if (name.isEmpty()) {
            throw new PixException("Indica o nome do recebedor (max. %d caracteres).".formatted(MAX_NAME));
        }

        String city = Text.clean(payload.city(), MAX_CITY);
        if (city.isEmpty()) {
            throw new PixException("Indica a cidade do recebedor (max. %d caracteres).".formatted(MAX_CITY));
        }

        String postcode = Normalize.digitsOnly(payload.postcode());
        if (postcode.length() > MAX_POSTCODE) {
            postcode = postcode.substring(0, MAX_POSTCODE);
        }

        List<Tlv> fields = new ArrayList<>();
        fields.add(new Tlv("00", "01"));

        if (payload.singleUse()) {
            fields.add(new Tlv("01", "12"));
        }

        fields.add(new Tlv("26", merchantAccountTemplate(key, payload.description())));
        fields.add(new Tlv("52", "0000"));
        fields.add(new Tlv("53", "986"));

        if (payload.amount() != null) {
            fields.add(new Tlv("54", formatAmount(payload.amount())));
        }

        fields.add(new Tlv("58", "BR"));
        fields.add(new Tlv("59", name));
        fields.add(new Tlv("60", city));

        if (!postcode.isEmpty()) {
            fields.add(new Tlv("61", postcode));
        }

        fields.add(new Tlv("62", new Tlv("05", cleanTxid(payload.txid())).toString()));

        String body = Tlv.Sequence.build(fields.toArray(new Tlv[0])) + CRC_TAG;
        return body + Crc16.hex(body);
    }

    // --- Leitura ----------------------------------------------------------

    /** Leitura de um BR Code já existente. */
    public record Parsed(
            PixPayload payload,
            boolean crcValid,
            String raw,
            String pointOfInitiation,
            String url) {
    }

    /**
     * Remove quebras de linha e tabulações — <em>nunca</em> os espaços.
     *
     * <p>Um {@code replaceAll("\\s", "")} genérico destrói o espaço dentro de
     * "Fulano de Tal" e desalinha todos os comprimentos declarados a partir
     * dali, produzindo um payload que parece válido e é recusado pelo banco.
     */
    private static String stripWrapping(String brcode) {
        return Text.toAscii(brcode, false)
                .replace("\r", "")
                .replace("\n", "")
                .replace("\t", "")
                .strip();
    }

    /**
     * Lê um BR Code. Com CRC inválido não lança: devolve
     * {@code crcValid == false}, para que a UI possa explicar o que está errado.
     */
    public static Parsed parse(String brcode) {
        String cleaned = stripWrapping(brcode);

        if (!cleaned.startsWith("0002")) {
            throw new PixException("Isto não parece um PIX copia e cola (falta o campo 00).");
        }

        List<Tlv> fields = Tlv.Sequence.parse(cleaned);

        String crcValue = null;
        for (Tlv field : fields) {
            if (field.id().equals("63")) {
                crcValue = field.value();
            }
        }
        if (crcValue == null) {
            throw new PixException("O payload não tem o campo 63 (CRC16).");
        }

        int tagStart = cleaned.lastIndexOf(CRC_TAG);
        String body = cleaned.substring(0, tagStart + CRC_TAG.length());
        boolean crcValid = crcValue.equals(Crc16.hex(body));

        String raw26 = null;
        for (Tlv field : fields) {
            if (field.id().equals("26")) {
                raw26 = field.value();
            }
        }
        if (raw26 == null) {
            throw new PixException("O payload não tem o campo 26 (informação da conta).");
        }

        Map<String, String> template26 = Tlv.Sequence.parseToMap(raw26);
        if (!GUI.equals(template26.get("00"))) {
            throw new PixException("GUI inválido: '%s' (esperado %s).".formatted(template26.get("00"), GUI));
        }

        Map<String, String> template62 = Map.of();
        for (Tlv field : fields) {
            if (field.id().equals("62")) {
                template62 = Tlv.Sequence.parseToMap(field.value());
            }
        }

        String txid = template62.get("05");

        BigDecimal amount = null;
        for (Tlv field : fields) {
            if (field.id().equals("54")) {
                amount = new BigDecimal(field.value());
            }
        }

        PixPayload payload = new PixPayload(
                template26.getOrDefault("01", ""),
                get(fields, "59"),
                get(fields, "60"),
                amount,
                txid == null || txid.isEmpty() ? PLACEHOLDER_TXID : txid,
                template26.getOrDefault("02", ""),
                get(fields, "61"),
                "12".equals(get(fields, "01")));

        return new Parsed(
                payload,
                crcValid,
                cleaned,
                get(fields, "01"),
                template26.get("25"));
    }

    private static String get(List<Tlv> fields, String id) {
        for (Tlv field : fields) {
            if (field.id().equals(id)) {
                return field.value();
            }
        }
        return null;
    }

    /** Recalcula o CRC de um payload (útil para recuperar códigos colados). */
    public static String fixCrc(String brcode) {
        String cleaned = stripWrapping(brcode);
        int index = cleaned.lastIndexOf(CRC_TAG);
        if (index < 0) {
            throw new PixException("O payload não tem o campo 63 (CRC16).");
        }

        String body = cleaned.substring(0, index + CRC_TAG.length());
        return body + Crc16.hex(body);
    }

    /** Locale raiz, para quem precisar de formatar números fora daqui. */
    static Locale locale() {
        return Locale.ROOT;
    }
}
