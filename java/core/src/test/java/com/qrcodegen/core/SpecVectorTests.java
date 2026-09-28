package com.qrcodegen.core;

import com.qrcodegen.core.pix.Pix;
import com.qrcodegen.core.pix.PixKey;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Nível 1 da paridade: os mesmos campos têm de produzir exatamente a mesma
 * string que as stacks C#, Python e web. Se este teste falhar, uma das quatro
 * está errada.
 */
class SpecVectorTests {

    private final SpecFixture spec = new SpecFixture();

    @Test
    @DisplayName("a spec tem o tipo pix")
    void aSpecTemOTipoPix() {
        assertTrue(spec.vectors().size() >= 10, "esperados pelo menos 10 vetores");
        assertTrue(spec.vectorsOfType("pix").size() >= 10);
    }

    @Test
    @DisplayName("bate com a spec, para todos os vetores")
    void bateComASpec() {
        for (SpecFixture.Vector vector : spec.vectorsOfType("pix")) {
            QrFields fields = SpecFixture.toFields(vector.campos());

            String error = QrValidator.validate(QrCategory.PIX, fields);
            assertNull(error, vector.id() + ": validação disse " + error);

            assertEquals(vector.payload(), QrPayloadBuilder.build(QrCategory.PIX, fields),
                    vector.id() + ": payload divergente");
        }
    }

    @Test
    @DisplayName("round-trip preserva o payload")
    void roundTrip() {
        for (SpecFixture.Vector vector : spec.vectorsOfType("pix")) {
            Pix.Parsed parsed = Pix.parse(vector.payload());

            assertTrue(parsed.crcValid(), vector.id() + ": CRC inválido");
            assertEquals(vector.payload(), Pix.build(parsed.payload()),
                    vector.id() + ": rebuild não devolve o mesmo payload");
        }
    }

    @Test
    @DisplayName("comprimentos declarados batem certo")
    void comprimentosDeclaradosBatem() {
        for (SpecFixture.Vector vector : spec.vectorsOfType("pix")) {
            assertTlvLengths(vector.payload(), "");
        }
    }

    @Test
    @DisplayName("os campos normalizados sobrevivem ao round-trip")
    void camposNormalizadosSobrevivem() {
        for (SpecFixture.Vector vector : spec.vectorsOfType("pix")) {
            Pix.Parsed parsed = Pix.parse(vector.payload());
            assertEquals(PixKey.validate(vector.campos().get("key")), parsed.payload().key(),
                    vector.id() + ": a chave não sobrevive ao round-trip");
        }
    }

    @Test
    @DisplayName("o vetor do Banco Central está na spec")
    void oVetorDoBancoCentralEstaNaSpec() {
        SpecFixture.Vector vector = spec.vectorsOfType("pix").stream()
                .filter(v -> v.id().equals("pix_uuid_sem_valor"))
                .findFirst()
                .orElse(null);

        assertNotNull(vector, "falta o vetor pix_uuid_sem_valor");
        assertTrue(vector.payload().endsWith("63041D3D"),
                "o exemplo do BCB termina em 63041D3D");
        assertTrue(vector.fonte().contains("Banco Central"));
    }

    private static void assertTlvLengths(String data, String path) {
        int i = 0;
        while (i < data.length()) {
            String tag = data.substring(i, i + 2);
            int declared = Integer.parseInt(data.substring(i + 2, i + 4));
            String value = data.substring(i + 4, i + 4 + declared);

            assertEquals(declared, value.length(),
                    "campo " + path + tag + " com comprimento errado");

            if (tag.equals("26") || tag.equals("62")) {
                assertTlvLengths(value, path + tag + ".");
            }

            i += 4 + declared;
        }
    }
}
