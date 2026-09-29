package com.qrcodegen.core;

import com.qrcodegen.core.pix.Pix;
import com.qrcodegen.core.pix.PixKey;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Locale;

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
    @DisplayName("a spec tem os onze tipos, e cada um com pelo menos um vetor")
    void aSpecTemOsOnzeTipos() {
        assertTrue(spec.vectors().size() >= 30,
                "a spec tem " + spec.vectors().size() + " vetores");

        java.util.Set<String> vistos = new java.util.HashSet<>();
        spec.vectors().forEach(v -> vistos.add(v.tipo()));

        for (QrCategory categoria : QrCategory.values()) {
            assertTrue(vistos.contains(nomeDaCategoria(categoria)),
                    "a spec nao tem nenhum vetor do tipo " + categoria);
        }

        // E nao pode haver aqui um tipo que o Java nao conheca: o teste de baixo
        // saltava-o e a contagem diria que ha cobertura onde nao ha.
        assertEquals(QrCategory.values().length, vistos.size(),
                "a spec tem tipos que o Java nao conhece");
        assertTrue(spec.vectorsOfType("pix").size() >= 10,
                "esperados pelo menos 10 vectores de PIX");
    }

    /**
     * O nome da spec para cada categoria.
     *
     * <p>E' a mesma lista duas vezes -- aqui e no {@code QrCategory} -- e por isso
     * que o teste de cima compara as duas em vez de uma delas assumir. A razao
     * e' a que o {@code AGENTS.md} da: duas listas do mesmo conjunto divergem em
     * silencio, e aqui o preco seria um tipo inteiro sem cobertura.
     */
    private static String nomeDaCategoria(QrCategory categoria) {
        return switch (categoria) {
            case SMS -> "sms";
            case WHATSAPP -> "whatsapp";
            case LOCALIZACAO -> "localizacao";
            case WIFI -> "wifi";
            case VCARD -> "vcard";
            default -> categoria.name().toLowerCase();
        };
    }

    @Test
    @DisplayName("bate com a spec, para todos os vectores")
    void bateComASpec() {
        for (SpecFixture.Vector vector : spec.vectors()) {
            // As constantes do enum sao exactamente o nome da spec em maiusculas,
            // e `sms`/`whatsapp`/`localizacao`/`wifi`/`vcard` nao precisam de
            // tratamento nenhum. O `toUpperCase` sem `Locale` e' o que dá problemas
            // com a letra turca; aqui so ha ASCII, e o comentario fica para quem
            // acrescentar um tipo.
            QrCategory categoria = QrCategory.valueOf(
                    vector.tipo().toUpperCase(Locale.ROOT));
            QrFields fields = SpecFixture.toFields(vector.campos());

            String error = QrValidator.validate(categoria, fields);
            assertNull(error, vector.id() + ": validacao disse " + error);

            assertEquals(vector.payload(), QrPayloadBuilder.build(categoria, fields),
                    vector.id() + ": payload divergente");
        }
    }

    /**
     * O round-trip so existe para o PIX, porque so o PIX tem parser.
     *
     * <p>Prova que o que omite o {@code parse} e' reconstruivel a partir do que o
     * {@code build} produziu. Escrever um parser para "voltar a partir da string"
     * de um link seria escrever um segundo encoder, e dois encoders errados
     * concordam um com o outro.
     */
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

    /**
     * Os comprimentos declarados batem -- <b>somente no PIX</b>, que e' o unico
     * com TLV. Um {@code evento} e' iCalendar e um {@code link} e' um link: nao
     * declaram nada.
     */
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
