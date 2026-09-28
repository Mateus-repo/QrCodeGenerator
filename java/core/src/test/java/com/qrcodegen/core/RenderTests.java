package com.qrcodegen.core;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Nível 2 da paridade: gerar a imagem e descodificá-la com um leitor.
 *
 * <p>O Nível 1 (payload) apanha bugs de lógica. Este apanha bugs de biblioteca
 * — um payload perfeitamente válido que ninguém consegue ler também é um bug.
 *
 * <p>É a biblioteca ZXing a gerar e a ler. Não é o mesmo processo a fazer as
 * duas coisas, que é o que torna o teste útil: se estivesse a gerar e a ler com
 * o mesmo código, um erro comum aos dois passava despercebido.
 */
class RenderTests {

    private static final int SCALE = 4;
    private static final int BORDER = 4;

    private final SpecFixture spec = new SpecFixture();

    static List<String> payloads() {
        SpecFixture spec = new SpecFixture();
        return spec.vectorsOfType("pix").stream().map(SpecFixture.Vector::payload).toList();
    }

    @Test
    @DisplayName("o vetor do Banco Central é legível")
    void vetorDoBancoCentral() {
        String payload = spec.vectorsOfType("pix").stream()
                .filter(v -> v.id().equals("pix_uuid_sem_valor"))
                .map(SpecFixture.Vector::payload)
                .findFirst()
                .orElseThrow();

        assertEquals(payload, decode(render(payload, ErrorCorrectionLevel.H)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("payloads")
    @DisplayName("todos os vetores da spec são legíveis por um leitor real")
    void todosOsVetoresSaoLegiveis(String payload) {
        assertEquals(payload, decode(render(payload, ErrorCorrectionLevel.M)));
    }

    @Test
    @DisplayName("os payloads novos também são legíveis")
    void payloadsNovosSaoLegiveis() {
        // vCard com morada e iCalendar com CRLF/escaping dependem de escaping
        // correto, que é onde os leitores costumam falhar.
        String vcard = QrPayloadBuilder.build(QrCategory.VCARD, new QrFields()
                .vcFirstName("Ana")
                .vcLastName("Silva")
                .vcPhone("+351912345678")
                .vcEmail("ana@exemplo.pt")
                .vcStreet("Rua A, 1")
                .vcCity("Lisboa")
                .vcZip("1000-001")
                .vcCountry("Portugal"));

        assertEquals(vcard, decode(render(vcard, ErrorCorrectionLevel.M)));

        String ical = QrPayloadBuilder.build(QrCategory.EVENTO, new QrFields()
                .eventTitle("Reunião")
                .eventStart(java.time.LocalDateTime.of(2026, 9, 30, 10, 0))
                .eventEnd(java.time.LocalDateTime.of(2026, 9, 30, 11, 0))
                .eventDescription("Linha 1\nLinha 2"));

        assertEquals(ical, decode(render(ical, ErrorCorrectionLevel.M)));
    }

    @Test
    @DisplayName("todos os níveis de correção são legíveis")
    void todosOsNiveis() {
        String payload = spec.vectorsOfType("pix").stream()
                .filter(v -> v.id().equals("pix_cpf_com_valor"))
                .map(SpecFixture.Vector::payload)
                .findFirst()
                .orElseThrow();

        for (ErrorCorrectionLevel level : ErrorCorrectionLevel.values()) {
            assertEquals(payload, decode(render(payload, level)), "nível " + level);
        }
    }

    // --- implementado ------------------------------------------------------

    private static BufferedImage render(String payload, ErrorCorrectionLevel level) {
        try {
            return renderUnsafe(payload, level);
        } catch (com.google.zxing.WriterException e) {
            throw new AssertionError("O ZXing não conseguiu gerar o QR: " + e.getMessage(), e);
        }
    }

    private static BufferedImage renderUnsafe(String payload, ErrorCorrectionLevel level)
            throws com.google.zxing.WriterException {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, level);
        hints.put(EncodeHintType.MARGIN, BORDER);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");

        var matrix = new QRCodeWriter()
                .encode(payload, BarcodeFormat.QR_CODE, 512, 512, hints);

        BufferedImage image = new BufferedImage(
                matrix.getWidth(), matrix.getHeight(), BufferedImage.TYPE_INT_RGB);

        int width = matrix.getWidth();
        for (int y = 0; y < matrix.getHeight(); y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, matrix.get(x, y) ? 0xFF000000 : 0xFFFFFFFF);
            }
        }
        return image;
    }

    private static String decode(BufferedImage image) {
        try {
            var source = new com.google.zxing.client.j2se.BufferedImageLuminanceSource(image);
            var bitmap = new BinaryBitmap(new HybridBinarizer(source));

            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);

            Result result = new MultiFormatReader().decode(bitmap, hints);
            assertNotNull(result, "o ZXing não conseguiu ler a imagem");
            return result.getText();
        } catch (Exception e) {
            throw new AssertionError("Falha ao descodificar: " + e.getMessage(), e);
        }
    }

    /** Só para confirmar que o ImageIO está disponível (usado no CLI). */
    @Test
    @DisplayName("a imagem sabe ser escrita em PNG")
    void sabeEscreverPng() throws Exception {
        var out = new java.io.ByteArrayOutputStream();
        assertTrue(ImageIO.write(render("teste", ErrorCorrectionLevel.M), "PNG", out));
        assertTrue(out.size() > 0);
    }
}
