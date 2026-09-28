package com.qrcodegen.core;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
     * <p>A spec usa nomes snake_case; aqui são camelCase. Esta é a única
     * tradução entre a spec e o código — e por isso é o ponto onde um
     * descuido produz um falso "divergimos".
     */
    public static QrFields toFields(Map<String, String> campos) {
        QrFields fields = new QrFields()
                .pixKey(campos.get("key"))
                .pixName(campos.get("name"))
                .pixCity(campos.get("city"))
                .pixAmount(orEmpty(campos.get("amount")))
                .pixTxid(orEmpty(campos.get("txid")))
                .pixPostcode(orEmpty(campos.get("postcode")))
                .pixDescription(orEmpty(campos.get("description")))
                .pixSingleUse("true".equalsIgnoreCase(campos.get("single_use")));

        return fields;
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
