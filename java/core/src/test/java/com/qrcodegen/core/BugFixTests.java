package com.qrcodegen.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regressões para os defeitos que estavam no {@code QrService.cs} original.
 * Cada teste descreve o bug que impede.
 */
class BugFixTests {

    // --- Bug 1/2: iCalendar com CRLF e escaping ---------------------------

    @Test
    @DisplayName("iCal usa CRLF e nunca o fim de linha do sistema")
    void iCalUsaCrlf() {
        String ical = build(new QrFields()
                .eventTitle("Reuniao")
                .eventStart(LocalDateTime.of(2026, 9, 30, 10, 0))
                .eventEnd(LocalDateTime.of(2026, 9, 30, 11, 0)));

        assertTrue(ical.contains("BEGIN:VCALENDAR\r\n"));
        assertTrue(ical.endsWith("END:VCALENDAR\r\n"));

        // Não pode sobrar um LF sem o CR à frente: era o bug do
        // Environment.NewLine / lineSeparator() a dar payloads diferentes
        // por sistema operativo.
        String semCr = ical.replace("\r\n", "");
        assertFalse(semCr.contains("\n"), "sobrou um LF solto");
        assertFalse(semCr.contains("\r"), "sobrou um CR solto");
    }

    @Test
    @DisplayName("iCal escapa vírgulas, pontos e vírgulas e barras")
    void iCalEscapa() {
        String ical = build(new QrFields()
                .eventTitle("Reuniao, trimestre; 1\\2")
                .eventLocation("Rua A; 3, Lisboa")
                .eventStart(LocalDateTime.of(2026, 1, 1, 0, 0))
                .eventEnd(LocalDateTime.of(2026, 1, 1, 1, 0)));

        assertTrue(ical.contains("SUMMARY:Reuniao\\, trimestre\\; 1\\\\2"), ical);
        assertTrue(ical.contains("LOCATION:Rua A\\; 3\\, Lisboa"), ical);
    }

    @Test
    @DisplayName("iCal escapa quebras de linha")
    void iCalEscapaQuebras() {
        String ical = build(new QrFields()
                .eventTitle("Primeira linha\nsegunda")
                .eventStart(LocalDateTime.of(2026, 1, 1, 0, 0))
                .eventEnd(LocalDateTime.of(2026, 1, 1, 1, 0)));

        assertTrue(ical.contains("SUMMARY:Primeira linha\\nsegunda"), ical);
    }

    @Test
    @DisplayName("iCal tem os campos obrigatórios")
    void iCalTemCamposObrigatorios() {
        // **Este teste já não fixa o fuso, e essa é a parte importante.**
        //
        // A versão anterior fazia `TimeZone.setDefault(UTC)` à volta de tudo, com
        // um comentário a dizer que sem isso "este teste passa no meu portátil e
        // falha noutro computador ou na CI". Era o symptomatico honesto do bug: o
        // payload dependia da máquina, e a única forma de o testar era Guests
        // prender o fuso para o resultado ser estável.
        //
        // Corrigido, a hora sai como foi escrita e o fuso da máquina é irrelevante
        // — que é o que se verifica aqui, sem tocar em nada.

        String ical = build(new QrFields()
                .eventTitle("X")
                .eventStart(LocalDateTime.of(2026, 9, 30, 10, 0))
                .eventEnd(LocalDateTime.of(2026, 9, 30, 11, 0)));

        assertTrue(ical.contains("VERSION:2.0"), ical);
        assertTrue(ical.contains("DTSTART:20260930T100000"), ical);
        assertTrue(ical.contains("DTEND:20260930T110000"), ical);
        assertTrue(ical.contains("BEGIN:VEVENT"), ical);
    }

    /**
     * A hora do evento sai <b>igual em qualquer fuso</b>, e sem {@code Z}.
     *
     * <p>Este teste existia ao contrário, e é a razão de estar aqui com este
     * nome. Chamava-se {@code horaDoEventoConvertidaParaUtc} e afirmava que 10h00
     * em Lisboa davam 09h00Z — ou seja, <b>documentava o bug como comportamento
     * desejado</b>.
     *
     * <p>O sintoma em uso real era uma hora de diferença: quem marcava uma reunião
     * às 18h30 em Portugal via o evento às 17h30 no calendário, e a culpa ia para o
     * calendário e não para o gerador.
     *
     * <p><b>Um horário flutuante é o que o calendário de cada pessoa interpreta na
     * hora de cada pessoa.</b> Um encontro marcado numa biblioteca é exactamente
     * esse caso: com {@code TZID} marcava a hora num sítio e quem estivesse noutro
     * via-o à hora errada.
     */
    @Test
    @DisplayName("a hora do evento não é convertida para UTC")
    void horaDoEventoNaoEConvertidaParaUtc() {
        java.util.TimeZone original = java.util.TimeZone.getDefault();
        try {
            // Lisboa no verão é UTC+1. A hora escrita tem de continuar a ser a
            // hora escrita, e não 09h00.
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Lisbon"));

            String ical = build(new QrFields()
                    .eventTitle("X")
                    .eventStart(LocalDateTime.of(2026, 9, 30, 10, 0))
                    .eventEnd(LocalDateTime.of(2026, 9, 30, 11, 0)));

            assertTrue(ical.contains("DTSTART:20260930T100000"), ical);
            assertFalse(ical.contains("T100000Z"), ical);
        } finally {
            java.util.TimeZone.setDefault(original);
        }
    }

    /**
     * O payload do evento não depende da máquina que o gerou.
     *
     * <p>É a mesma propriedade do teste de cima, vista pelo outro lado: dois
     * fusos, o mesmo payload. Um gerador cujo payload muda com o fuso do
     * utilizador não é determinístico, e determinismo é o que permite ter uma
     * spec com vectors.
     */
    @Test
    @DisplayName("o payload do evento é igual em qualquer fuso")
    void oPayloadDoEventoEhIgualEmQualquerFuso() {
        java.util.TimeZone original = java.util.TimeZone.getDefault();
        try {
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Lisbon"));
            String emLisboa = build(new QrFields()
                    .eventTitle("X")
                    .eventStart(LocalDateTime.of(2026, 9, 30, 10, 0))
                    .eventEnd(LocalDateTime.of(2026, 9, 30, 11, 0)));

            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("America/New_York"));
            String emNovaYork = build(new QrFields()
                    .eventTitle("X")
                    .eventStart(LocalDateTime.of(2026, 9, 30, 10, 0))
                    .eventEnd(LocalDateTime.of(2026, 9, 30, 11, 0)));

            assertEquals(emLisboa, emNovaYork,
                    "o payload nao pode depender do fuso da maquina");
        } finally {
            java.util.TimeZone.setDefault(original);
        }
    }
    @Test
    @DisplayName("vCard gera a morada")
    void vCardGeraAMorada() {
        // Antes todos os parâmetros de endereço passavam "" e o ADR não saía.
        String vcard = build(new QrFields()
                .vcFirstName("Ana")
                .vcLastName("Silva")
                .vcOrg("Empresa")
                .vcRole("Diretora")
                .vcPhone("+351912345678")
                .vcEmail("ana@exemplo.pt")
                .vcStreet("Rua A 1")
                .vcCity("Lisboa")
                .vcZip("1000-001")
                .vcCountry("Portugal"));

        assertTrue(vcard.contains("ADR;TYPE=work:;;Rua A 1;Lisboa;;1000-001;Portugal"), vcard);
    }

    @Test
    @DisplayName("vCard usa escaping nos campos de texto")
    void vCardEscapa() {
        String vcard = build(new QrFields()
                .vcFirstName("Ana, Maria")
                .vcLastName("Silva; Costa")
                .vcCity("Porto"));

        assertTrue(vcard.contains("FN:Ana\\, Maria Silva\\; Costa"), vcard);
        assertTrue(vcard.contains("N:Silva\\; Costa;Ana\\, Maria;;;"), vcard);
    }

    @Test
    @DisplayName("vCard põe a família primeiro em N")
    void vCardFamiliaPrimeiro() {
        String vcard = build(new QrFields().vcFirstName("Ana").vcLastName("Silva"));

        assertTrue(vcard.contains("VERSION:4.0"), vcard);
        assertTrue(vcard.contains("FN:Ana Silva"), vcard);
        assertTrue(vcard.contains("N:Silva;Ana;;;"), vcard);
    }

    @Test
    @DisplayName("vCard aceita dois telefones com tipo")
    void vCardDoisTelefones() {
        String vcard = build(new QrFields()
                .vcFirstName("Ana")
                .vcPhone("+351912345678")
                .vcPhone2("+351213456789"));

        assertTrue(vcard.contains("TEL;TYPE=cell:+351912345678"), vcard);
        assertTrue(vcard.contains("TEL;TYPE=work:+351213456789"), vcard);
    }

    // --- Bug 4: coordenadas sem validação de intervalo ---------------------

    @ParameterizedTest(name = "lat={0} lng={1}")
    @CsvSource({"91,0", "-90.5,0", "0,181", "0,-180.5"})
    @DisplayName("geo rejeita coordenadas fora do intervalo")
    void geoRejeitaForaDoIntervalo(double lat, double lng) {
        assertNotNull(QrValidator.validate(QrCategory.LOCALIZACAO,
                new QrFields().geoLat(lat).geoLng(lng)));
    }

    @Test
    @DisplayName("geo aceita os limites")
    void geoAceitaLimites() {
        assertNull(QrValidator.validate(QrCategory.LOCALIZACAO, new QrFields().geoLat(90.0).geoLng(180.0)));
        assertNull(QrValidator.validate(QrCategory.LOCALIZACAO, new QrFields().geoLat(-90.0).geoLng(-180.0)));
    }

    @Test
    @DisplayName("geo usa ponto decimal invariante")
    void geoPontoDecimal() {
        assertEquals("geo:38.7223,-9.1393",
                QrPayloadBuilder.build(QrCategory.LOCALIZACAO,
                        new QrFields().geoLat(38.7223).geoLng(-9.1393)));
    }

    // --- Bug 5: links perigosos passavam -----------------------------------

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {
            "javascript:alert(1)",
            "data:text/html;base64,PHNjcmlwdD4=",
            "file:///C:/Windows/System32",
            "vbscript:msgbox",
    })
    @DisplayName("link recusa esquemas perigosos")
    void linkRecusaEsquemasPerigosos(String url) {
        assertNotNull(QrValidator.validate(QrCategory.LINK, new QrFields().url(url)), url);
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {
            "exemplo.pt",
            "http://exemplo.pt",
            "https://exemplo.pt/pt",
            "mailto:ana@exemplo.pt",
            "tel:+351912345678",
    })
    @DisplayName("link normaliza e aceita")
    void linkNormalizaEAceita(String url) {
        QrFields fields = new QrFields().url(url);
        assertNull(QrValidator.validate(QrCategory.LINK, fields), url);
        assertNotNull(QrPayloadBuilder.build(QrCategory.LINK, fields));
    }

    @Test
    @DisplayName("link sem esquema ganha https")
    void linkGanhaHttps() {
        assertEquals("https://exemplo.pt",
                QrPayloadBuilder.build(QrCategory.LINK, new QrFields().url("exemplo.pt")));
    }

    // --- Bug 6: normalização de telefone inconsistente ---------------------

    @ParameterizedTest(name = "\"{0}\" -> \"{1}\"")
    @CsvSource({
            "00351,        +351",
            "351,          +351",
            "+351,         +351",
            "'+ 351',      +351",
            "'00 351 (PT)', +351",
    })
    @DisplayName("indicativo normalizado")
    void indicativoNormalizado(String input, String expected) {
        assertEquals("tel:" + expected + "912345678",
                QrPayloadBuilder.build(QrCategory.TELEFONE,
                        new QrFields().phonePrefix(input).phoneNumber("912345678")));
    }

    @Test
    @DisplayName("indicativo só com o prefixo internacional fica vazio")
    void indicativoSoComPrefixo() {
        assertEquals("", Normalize.phonePrefix("00"));
        assertEquals("", Normalize.phonePrefix("+"));
    }

    @Test
    @DisplayName("telefone monta com indicativo e número")
    void telefoneMonta() {
        assertEquals("+351912345678", Normalize.phone("+351", "912 345 678"));
        assertEquals("+351912345678", Normalize.phone("00351", "912345678"));
    }

    // --- Bug 7: WiFi e SMS sem limites -------------------------------------

    @Test
    @DisplayName("WiFi escapa o símbolo de separador")
    void wifiEscapaSeparador() {
        String wifi = build(new QrFields()
                .wifiSsid("Cafe;bar:1")
                .wifiPass("a:b;c")
                .wifiSec("WPA/WPA2"));

        assertTrue(wifi.contains("S:Cafe\\;bar\\:1;"), wifi);
        assertTrue(wifi.contains("P:a\\:b\\;c;"), wifi);
    }

    @Test
    @DisplayName("WiFi aberto não escreve password e termina com ;;")
    void wifiAberto() {
        assertEquals("WIFI:T:nopass;S:Rede;;",
                QrPayloadBuilder.build(QrCategory.WIFI, new QrFields().wifiSsid("Rede").wifiSec("Aberto")));
    }

    @Test
    @DisplayName("WiFi oculta marca H:true")
    void wifiOculta() {
        String wifi = build(new QrFields()
                .wifiSsid("Rede").wifiPass("x").wifiSec("WPA/WPA2").wifiHidden(true));
        assertTrue(wifi.contains("H:true;"), wifi);
    }

    @Test
    @DisplayName("SSID longo é recusado")
    void ssidLongo() {
        assertNotNull(QrValidator.validate(QrCategory.WIFI, new QrFields().wifiSsid("A".repeat(33))));
    }

    @Test
    @DisplayName("SMS recusa caracteres que o protocolo não suporta")
    void smsRecusaCaracteres() {
        assertNotNull(QrValidator.validate(QrCategory.SMS, new QrFields()
                .phonePrefix("+351")
                .phoneNumber("912345678")
                .smsMessage("olá {braces}")));
    }

    // --- Email -------------------------------------------------------------

    @Test
    @DisplayName("email usa mailto minúsculo e percent-encoding")
    void emailPercentEncoding() {
        String mail = build(new QrFields()
                .mailTo("ana@exemplo.pt")
                .mailSubject("Faturação #1")
                .mailBody("olá & bem-vindo"));

        assertTrue(mail.startsWith("mailto:ana@exemplo.pt?subject="), mail);
        assertTrue(mail.contains("Fatura%C3%A7%C3%A3o%20%231"), mail);
        assertTrue(mail.contains("%26"), mail);
        // O espaço tem de ser %20, nunca +: num query string o + só é espaço
        // em formulários, e muitos leitores de QR não o descodificam.
        assertTrue(!mail.contains("+"), mail);
    }

    @Test
    @DisplayName("email sem assunto nem mensagem não tem interrogação")
    void emailSemQuery() {
        assertEquals("mailto:ana@exemplo.pt",
                QrPayloadBuilder.build(QrCategory.EMAIL, new QrFields().mailTo("ana@exemplo.pt")));
    }

    @Test
    @DisplayName("email recusa destinatário inválido")
    void emailRecusaDestinatario() {
        assertNotNull(QrValidator.validate(QrCategory.EMAIL, new QrFields().mailTo("ana@")));
    }

    // --- WhatsApp ----------------------------------------------------------

    @Test
    @DisplayName("WhatsApp usa só dígitos e codifica a mensagem")
    void whatsapp() {
        String wa = build(new QrFields()
                .phonePrefix("+351")
                .phoneNumber("912 345 678")
                .waMessage("olá & bem-vindo"));

        assertTrue(wa.startsWith("https://wa.me/351912345678?text="), wa);
        assertTrue(wa.contains("%26"), wa);
    }

    // --- Capacidade --------------------------------------------------------

    @Test
    @DisplayName("capacidade avisa com números concretos")
    void capacidadeAvisa() {
        var e = assertThrows(QrCapacityException.class,
                () -> QrCapacity.check("x".repeat(3000), EccLevel.L));
        assertTrue(e.getMessage().contains("2953"), e.getMessage());
    }

    @Test
    @DisplayName("limite medido por elevação de custo")
    void limiteMedidoPorElevacao() {
        assertTrue(QrCapacity.limitFor(EccLevel.L) > QrCapacity.limitFor(EccLevel.M));
        assertTrue(QrCapacity.limitFor(EccLevel.M) > QrCapacity.limitFor(EccLevel.Q));
        assertTrue(QrCapacity.limitFor(EccLevel.Q) > QrCapacity.limitFor(EccLevel.H));
    }

    @Test
    @DisplayName("o payload é reprodutível")
    void payloadRepetivel() {
        // Um UID aleatório ou um timestamp de "agora" tornariam o payload
        // irreprodutível, e a spec não poderia ser verificada.
        QrFields fields = new QrFields()
                .eventTitle("X")
                .eventStart(LocalDateTime.of(2026, 9, 30, 10, 0))
                .eventEnd(LocalDateTime.of(2026, 9, 30, 11, 0));

        assertEquals(QrPayloadBuilder.build(QrCategory.EVENTO, fields),
                QrPayloadBuilder.build(QrCategory.EVENTO, fields));

        assertEquals(QrPayloadBuilder.build(QrCategory.PIX,
                        new QrFields().pixKey("529.982.247-25").pixName("Ana").pixCity("Recife")),
                QrPayloadBuilder.build(QrCategory.PIX,
                        new QrFields().pixKey("529.982.247-25").pixName("Ana").pixCity("Recife")));
    }

    @Test
    @DisplayName("conteúdo diferente dá payload diferente")
    void conteudoDiferente() {
        assertNotEquals(
                QrPayloadBuilder.build(QrCategory.LINK, new QrFields().url("exemplo.pt")),
                QrPayloadBuilder.build(QrCategory.LINK, new QrFields().url("outro.pt")));
    }

    /** Valida e constrói, para os testes não repetirem a validação. */
    private static String build(QrFields fields) {
        QrCategory category = categoryOf(fields);
        String error = QrValidator.validate(category, fields);
        assertNull(error, "validação: " + error);
        return QrPayloadBuilder.build(category, fields);
    }

    /** Descobre a categoria a partir do único campo preenchido. */
    private static QrCategory categoryOf(QrFields f) {
        if (!f.eventTitle().isEmpty()) return QrCategory.EVENTO;
        if (!f.vcFirstName().isEmpty() || !f.vcLastName().isEmpty()) return QrCategory.VCARD;
        if (!f.wifiSsid().isEmpty()) return QrCategory.WIFI;
        if (f.geoLat() != null || f.geoLng() != null) return QrCategory.LOCALIZACAO;
        if (!f.mailTo().isEmpty()) return QrCategory.EMAIL;
        if (!f.waMessage().isEmpty()) return QrCategory.WHATSAPP;
        if (!f.smsMessage().isEmpty()) return QrCategory.SMS;
        if (!f.phoneNumber().isEmpty()) return QrCategory.TELEFONE;
        if (!f.url().isEmpty()) return QrCategory.LINK;
        return QrCategory.PIX;
    }
}
