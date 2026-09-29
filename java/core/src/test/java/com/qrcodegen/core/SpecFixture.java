package com.qrcodegen.core;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Carrega a spec partilhada — a mesma que as stacks C#, Python e web consomem.
 *
 * <p>A spec é procurada a subir a árvore até à raiz do repositório, para que os
 * testes não dependam do sítio de onde foram lançados.
 */
public final class SpecFixture {

    /** Um vetor de teste: campos de entrada e a string esperada. */
    public record Vector(
            String id,
            String tipo,
            String descricao,
            String fonte,
            Map<String, String> campos,
            String payload,
            int bytes) {
    }

    private final List<Vector> vectors;

    public SpecFixture() {
        this.vectors = load(findSpec());
    }

    public List<Vector> vectors() {
        return vectors;
    }

    public List<Vector> vectorsOfType(String tipo) {
        return vectors.stream().filter(v -> v.tipo().equals(tipo)).toList();
    }

    /**
     * Constrói os campos da spec no modelo do Java.
     *
     * <p><b>O PIX é uma tradução e os outros dez não.</b> Os campos do PIX
     * chamam-se {@code key}, {@code name} e {@code city} — são os do
     * {@code PixPayload} do Banco Central, não os da interface, e é a razão de
     * serem oito linhas. Os dez tipos de transporte usam os campos do navegador
     * tal como estão, e por isso que o resto deste método é atribuição directa.
     *
     * <p><b>A data do evento é lida como {@link LocalDateTime}, e não como
     * {@code ZonedDateTime}.</b> A spec traz {@code "2026-09-29T18:30"}, sem
     * fuso, porque o {@code datetime-local} da interface não tem fuso. Converter
     * para UTC punha uma hora a mais no payload — e foi exactamente o que o C#
     * fazia, até o vector do evento o expor.
     */
    public static QrFields toFields(Map<String, String> campos) {
        QrFields fields = new QrFields()
                // Transporte: os nomes são os do navegador.
                .url(orEmpty(campos.get("url")))
                .texto(orEmpty(campos.get("texto")))
                .mailTo(orEmpty(campos.get("mailTo")))
                .mailSubject(orEmpty(campos.get("mailSubject")))
                .mailBody(orEmpty(campos.get("mailBody")))
                .phonePrefix(orEmpty(campos.get("phonePrefix")))
                .phoneNumber(orEmpty(campos.get("phoneNumber")))
                .smsMessage(orEmpty(campos.get("smsMessage")))
                .waMessage(orEmpty(campos.get("waMessage")))
                .eventTitle(orEmpty(campos.get("eventTitle")))
                .eventDescription(orEmpty(campos.get("eventDescription")))
                .eventLocation(orEmpty(campos.get("eventLocation")))
                .geoLat(number(campos.get("geoLat")))
                .geoLng(number(campos.get("geoLng")))
                .wifiSsid(orEmpty(campos.get("wifiSsid")))
                .wifiPass(orEmpty(campos.get("wifiPass")))
                .wifiSec(campos.getOrDefault("wifiSec", "WPA/WPA2"))
                .wifiHidden("true".equalsIgnoreCase(campos.get("wifiHidden")))
                .vcFirstName(orEmpty(campos.get("vcFirstName")))
                .vcLastName(orEmpty(campos.get("vcLastName")))
                .vcPhone(orEmpty(campos.get("vcPhone")))
                .vcPhone2(orEmpty(campos.get("vcPhone2")))
                .vcEmail(orEmpty(campos.get("vcEmail")))
                .vcOrg(orEmpty(campos.get("vcOrg")))
                .vcRole(orEmpty(campos.get("vcRole")))
                .vcStreet(orEmpty(campos.get("vcStreet")))
                .vcCity(orEmpty(campos.get("vcCity")))
                .vcZip(orEmpty(campos.get("vcZip")))
                .vcCountry(orEmpty(campos.get("vcCountry")));

        // A data só é posta quando existe: o valor por omissão é
        // `LocalDateTime.now()`, e um caso sem data ficaria com a hora de hoje.
        when(campos.get("eventStart")).ifPresent(fields::eventStart);
        when(campos.get("eventEnd")).ifPresent(fields::eventEnd);

        // O PIX: os nomes são os do PixPayload.
        return fields
                .pixKey(campos.get("key"))
                .pixName(campos.get("name"))
                .pixCity(campos.get("city"))
                .pixAmount(orEmpty(campos.get("amount")))
                .pixTxid(orEmpty(campos.get("txid")))
                .pixPostcode(orEmpty(campos.get("postcode")))
                .pixDescription(orEmpty(campos.get("description")))
                .pixSingleUse("true".equalsIgnoreCase(campos.get("single_use")));
    }

    /**
     * A hora do formulário, que não tem fuso.
     *
     * <p><b>Um {@code null} em vez de um erro, e a razão de ser um
     * {@code Optional}.</b> Um caso sem data não pode receber a hora de hoje: o
     * payload saía com um carimbo que mudava de execução para execução, e um
     * teste que passa com data e falha sem ela é pior do que nenhum.
     */
    private static Optional<LocalDateTime> when(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(LocalDateTime.parse(raw.trim()));
    }

    /**
     * Um número da spec, com vírgula ou ponto decimal.
     *
     * <p><b>A vírgula conta, porque o formulário aceita as duas.</b> O campo da
     * latitude é escrito {@code 38,7223} por quem está em Portugal, e um
     * {@code null} silencioso é pior do que um erro: o payload saía com
     * {@code geo:} e nada mais.
     */
    private static Double number(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return Double.valueOf(raw.trim().replace(',', '.'));
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

    /** Caminho para {@code spec/vectors.json}, procurado a subir a árvore. */
    public static Path findSpec() {
        Path dir = Path.of("").toAbsolutePath();

        while (dir != null) {
            Path candidate = dir.resolve("spec").resolve("vectors.json");
            if (Files.exists(candidate)) {
                return candidate;
            }
            dir = dir.getParent();
        }

        throw new IllegalStateException(
                "spec/vectors.json não encontrado. Corre os testes a partir de java/core, "
                        + "ou a partir da raiz do repositório.");
    }

    private static List<Vector> load(Path spec) {
        try (Reader reader = Files.newBufferedReader(spec, StandardCharsets.UTF_8)) {
            JsonObject root = new Gson().fromJson(reader, JsonObject.class);
            JsonArray array = root.getAsJsonArray("vectors");

            List<Vector> vectors = new ArrayList<>();
            for (JsonElement element : array) {
                JsonObject o = element.getAsJsonObject();

                Map<String, String> campos = new LinkedHashMap<>();
                for (Map.Entry<String, JsonElement> entry : o.getAsJsonObject("campos").entrySet()) {
                    JsonElement value = entry.getValue();
                    if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
                        campos.put(entry.getKey(), value.getAsString());
                    } else if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isBoolean()) {
                        campos.put(entry.getKey(), String.valueOf(value.getAsBoolean()));
                    } else if (!value.isJsonNull()) {
                        campos.put(entry.getKey(), value.toString());
                    }
                }

                vectors.add(new Vector(
                        o.get("id").getAsString(),
                        o.get("tipo").getAsString(),
                        o.get("descricao").getAsString(),
                        o.get("fonte").getAsString(),
                        campos,
                        o.get("payload").getAsString(),
                        o.get("bytes").getAsInt()));
            }

            return vectors;
        } catch (IOException e) {
            throw new IllegalStateException("Não foi possível ler " + spec, e);
        }
    }
}
