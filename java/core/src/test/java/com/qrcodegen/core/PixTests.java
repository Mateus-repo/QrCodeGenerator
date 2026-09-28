package com.qrcodegen.core;

import com.qrcodegen.core.pix.Crc16;
import com.qrcodegen.core.pix.Pix;
import com.qrcodegen.core.pix.PixException;
import com.qrcodegen.core.pix.PixKey;
import com.qrcodegen.core.pix.PixPayload;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PixTests {

    private static final String BCB_KEY = "123e4567-e12b-12d1-a456-426655440000";

    private static final String BCB_PAYLOAD =
            "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000"
            + "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

    // --- CRC ---------------------------------------------------------------

    @Test
    @DisplayName("CRC-16 tem o vetor canónico")
    void crcTemOVetorCanonico() {
        assertEquals(0x29B1, Crc16.of("123456789"));
        assertEquals("29B1", Crc16.hex("123456789"));
    }

    @Test
    @DisplayName("CRC-16 bate com o exemplo do Banco Central")
    void crcBateComOBancoCentral() {
        assertEquals("1D3D", Crc16.hex(BCB_PAYLOAD.substring(0, BCB_PAYLOAD.length() - 4)));
    }

    @Test
    @DisplayName("exemplo oficial do Banco Central")
    void exemploOficial() {
        assertEquals(BCB_PAYLOAD, Pix.build(new PixPayload(BCB_KEY, "Fulano de Tal", "BRASILIA")));
    }

    // --- Campos ------------------------------------------------------------

    @Test
    @DisplayName("nome com acento normalizado")
    void nomeComAcento() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "José Antônio Café", "São Paulo"));
        assertTrue(brcode.contains("5917Jose Antonio Cafe"), brcode);
        assertTrue(brcode.contains("6009Sao Paulo"), brcode);
    }

    @Test
    @DisplayName("nome acima de 25 cortado")
    void nomeAcimaDe25() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "A".repeat(40), "Recife"));
        assertTrue(brcode.contains("5925" + "A".repeat(25)), brcode);
    }

    @Test
    @DisplayName("cidade acima de 15 cortada")
    void cidadeAcimaDe15() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana", "B".repeat(30)));
        assertTrue(brcode.contains("6015" + "B".repeat(15)), brcode);
    }

    @Test
    @DisplayName("espaços duplos colapsados")
    void espacosDuplos() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana   Maria", "Recife"));
        assertTrue(brcode.contains("5909Ana Maria"), brcode);
    }

    @Test
    @DisplayName("txid sem caracteres válidos vira placeholder")
    void txidInvalido() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana", "Recife", null, "#$%&", "", "", false));
        assertTrue(brcode.contains("62070503***"), brcode);
    }

    @Test
    @DisplayName("txid longo cortado")
    void txidLongo() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana", "Recife", null, "a".repeat(40), "", "", false));
        assertTrue(brcode.contains("62290525" + "a".repeat(25)), brcode);
    }

    @Test
    @DisplayName("a descrição nunca parte o teto do template 26")
    void descricaoNuncaParteOTeto() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana", "Recife", null, null, "x".repeat(200), "", false));
        String template = field(brcode, "26");

        assertEquals(Pix.MAX_TEMPLATE_26, template.length());
        assertTrue(template.contains(BCB_KEY), "a chave nunca é cortada");
    }

    @Test
    @DisplayName("a descrição é cortada ao espaço disponível")
    void descricaoCortadaAoEspaco() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana", "Recife", null, null, "y".repeat(40), "", false));
        String template = field(brcode, "26");

        assertEquals(Pix.MAX_TEMPLATE_26, template.length());
        // 99 - (4+14) - (4+36) - 4 = 37 caracteres
        assertTrue(template.endsWith("0237" + "y".repeat(37)), template);
    }

    @Test
    @DisplayName("valor ausente omite o campo 54")
    void valorAusente() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana", "Recife"));
        assertFalse(brcode.contains("5405"), brcode);
    }

    /**
     * Todos os valores andam entre aspas: a vírgula é o separador do CsvSource
     * e "25,75" sem aspas chega partido em dois parâmetros.
     */
    @ParameterizedTest(name = "\"{0}\" -> {1}")
    @CsvSource({
            "'25,75',    25.75",
            "'25.75',    25.75",
            "'25',       25.00",
            "'0.01',     0.01",
            "'1.234,56', 1234.56",
            "'1234.56',  1234.56",
            "'R$ 10,00', 10.00",
            "'  7,5  ', 7.50",
            "'1000',     1000.00",
    })
    @DisplayName("parse de valores")
    void parseDeValores(String raw, String expected) {
        assertEquals(new BigDecimal(expected), Pix.parseAmount(raw));
    }

    @Test
    @DisplayName("valor negativo é recusado")
    void valorNegativo() {
        assertThrows(PixException.class, () -> Pix.parseAmount("-1,00"));
    }

    @Test
    @DisplayName("valor lixo é recusado")
    void valorLixo() {
        assertThrows(PixException.class, () -> Pix.parseAmount("abc"));
    }

    // --- Chave -------------------------------------------------------------

    @ParameterizedTest(name = "\"{0}\" -> \"{1}\"")
    @CsvSource({
            "'529.982.247-25',                      '52998224725'",
            "'11.222.333/0001-81',                   '11222333000181'",
            "'+55 11 96666-6666',                    '+5511966666666'",
            "'55 11 96666 6666',                     '+5511966666666'",
            "'+5511966666666',                       '+5511966666666'",
            "'Fulano@Example.com',                   'fulano@example.com'",
            "'123E4567-E12B-12D1-A456-426655440000', '123e4567-e12b-12d1-a456-426655440000'",
    })
    @DisplayName("chaves válidas são normalizadas")
    void chavesValidas(String raw, String expected) {
        assertEquals(expected, PixKey.validate(raw));
    }

    @ParameterizedTest(name = "\"{0}\" -> {1}")
    @CsvSource({
            "529.982.247-25,         CPF",
            "11.222.333/0001-81,      CNPJ",
            "+5511966666666,          PHONE",
            "fulano@example.com,      EMAIL",
            "123e4567-e12b-12d1-a456-426655440000, RANDOM",
    })
    @DisplayName("tipo de chave")
    void tipoDeChave(String raw, String expected) {
        assertEquals(PixKey.Type.valueOf(expected), PixKey.typeOf(raw));
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {
            "111.111.111-11",
            "11.111.111/1111-11",
            "11966666666",
            "fulano@exemplo",
            "   ",
            "não é chave",
    })
    @DisplayName("chaves inválidas são recusadas")
    void chavesInvalidas(String raw) {
        assertThrows(PixException.class, () -> PixKey.validate(raw));
    }

    @Test
    @DisplayName("CPF com dígitos verificadores errados")
    void cpfComDigitosErrados() {
        assertFalse(PixKey.isValidCpf("11111111111"));
        assertTrue(PixKey.isValidCpf("52998224725"));
    }

    @Test
    @DisplayName("CNPJ com dígitos verificadores errados")
    void cnpjComDigitosErrados() {
        assertTrue(PixKey.isValidCnpj("11222333000181"));
        assertFalse(PixKey.isValidCnpj("11111111111111"));
    }

    // --- Obrigatórios ------------------------------------------------------

    @Test
    @DisplayName("nome é obrigatório")
    void nomeObrigatorio() {
        assertThrows(PixException.class, () -> Pix.build(new PixPayload(BCB_KEY, "  ", "Recife")));
    }

    @Test
    @DisplayName("cidade é obrigatória")
    void cidadeObrigatoria() {
        assertThrows(PixException.class, () -> Pix.build(new PixPayload(BCB_KEY, "Ana", "")));
    }

    // --- Leitura -----------------------------------------------------------

    @Test
    @DisplayName("parse deteta CRC inválido")
    void parseDetetaCrcInvalido() {
        String broken = BCB_PAYLOAD.substring(0, BCB_PAYLOAD.length() - 4) + "0000";
        assertFalse(Pix.parse(broken).crcValid());
    }

    @Test
    @DisplayName("fixCrc recupera um payload corrompido")
    void fixCrc() {
        assertEquals(BCB_PAYLOAD, Pix.fixCrc(BCB_PAYLOAD.substring(0, BCB_PAYLOAD.length() - 4) + "0000"));
    }

    @Test
    @DisplayName("fixCrc remove quebras de linha mas mantém espaços")
    void fixCrcRemoveQuebras() {
        StringBuilder wrapped = new StringBuilder();
        for (int i = 0; i < BCB_PAYLOAD.length(); i += 40) {
            if (i > 0) {
                wrapped.append('\n');
            }
            wrapped.append(BCB_PAYLOAD, i, Math.min(i + 40, BCB_PAYLOAD.length()));
        }
        assertEquals(BCB_PAYLOAD, Pix.fixCrc(wrapped.toString()));
    }

    @Test
    @DisplayName("parse recusa lixo")
    void parseRecusaLixo() {
        assertThrows(PixException.class, () -> Pix.parse("isto nao e um pix"));
    }

    @Test
    @DisplayName("parse recusa GUI errada")
    void parseRecusaGuiErrado() {
        String wrong = BCB_PAYLOAD.replace("br.gov.bcb.pix", "br.gov.bcb.XXX");
        assertEquals(BCB_PAYLOAD.length(), wrong.length());

        PixException e = assertThrows(PixException.class, () -> Pix.parse(Pix.fixCrc(wrong)));
        assertTrue(e.getMessage().contains("GUI"), e.getMessage());
    }

    @Test
    @DisplayName("parse dá erro claro em payload truncado")
    void parseTruncado() {
        PixException e = assertThrows(PixException.class,
                () -> Pix.parse(BCB_PAYLOAD.substring(0, BCB_PAYLOAD.length() - 20)));
        assertTrue(e.getMessage().contains("comprimento"), e.getMessage());
    }

    /** Regressão: um strip de whitespace genérico desalinhava os TLV. */
    @Test
    @DisplayName("espaços dentro do nome sobrevivem à leitura")
    void espacosSobrevivem() {
        String brcode = Pix.build(new PixPayload(BCB_KEY, "Ana Maria", "Recife"));
        assertTrue(brcode.contains("5909Ana Maria"), brcode);
        assertEquals("Ana Maria", Pix.parse(brcode).payload().name());
    }

    // --- Portabilidade -----------------------------------------------------

    @Test
    @DisplayName("o CRC não depende do locale do sistema")
    void crcNaoDependeDoLocale() {
        // Em turco, toUpperCase() sem locale produz caracteres diferentes. O
        // hex() usa String.format com Locale.ROOT precisamente por isso.
        Locale original = Locale.getDefault();
        try {
            for (Locale locale : new Locale[]{Locale.ROOT, new Locale("tr", "TR"), Locale.GERMANY}) {
                Locale.setDefault(locale);
                assertEquals("1D3D", Crc16.hex(BCB_PAYLOAD.substring(0, BCB_PAYLOAD.length() - 4)),
                        "CRC mudou com locale " + locale);
                assertEquals(BCB_PAYLOAD, Pix.build(new PixPayload(BCB_KEY, "Fulano de Tal", "BRASILIA")),
                        "payload mudou com locale " + locale);
            }
        } finally {
            Locale.setDefault(original);
        }
    }

    @Test
    @DisplayName("o payload não depende do fim de linha do sistema")
    void payloadNaoDependeDoFimDeLinha() {
        // O iCalendar fixava Environment.NewLine (C#) ou lineSeparator() (Java),
        // o que fazia o payload diferir entre Windows e Linux/macOS. Aqui é
        // \r\n explícito e o teste corre igual em qualquer SO.
        String ical = QrPayloadBuilder.build(QrCategory.EVENTO, new QrFields()
                .eventTitle("Reunião")
                .eventStart(java.time.LocalDateTime.of(2026, 9, 30, 10, 0))
                .eventEnd(java.time.LocalDateTime.of(2026, 9, 30, 11, 0)));

        assertTrue(ical.contains("BEGIN:VCALENDAR\r\n"));
        assertTrue(ical.endsWith("END:VCALENDAR\r\n"));
        assertFalse(ical.replace("\r\n", "").contains("\n"), "não pode sobrar LF solto");
    }

    private static String field(String brcode, String tag) {
        int start = brcode.indexOf(tag) + 4;
        int length = Integer.parseInt(brcode.substring(start - 2, start));
        return brcode.substring(start, start + length);
    }
}
