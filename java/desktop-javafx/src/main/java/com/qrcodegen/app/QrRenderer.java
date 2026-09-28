package com.qrcodegen.app;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.qrcodegen.core.EccLevel;
import com.qrcodegen.core.QrCapacityException;
import com.qrcodegen.core.QrCategory;
import com.qrcodegen.core.QrFields;
import com.qrcodegen.core.QrPayloadBuilder;
import com.qrcodegen.core.QrValidator;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.Map;

/**
 * Desenha o QR. É a única parte que depende de bibliotecas de imagem, por isso
 * vive aqui e não no core.
 *
 * <p>Usa {@code java.awt} e o ZXing, e não nada de específico do Windows: o
 * mesmo código dá PNG em qualquer sistema operativo, e {@code jpackage} gera o
 * instalador para cada um a partir daqui.
 */
public final class QrRenderer {

    private QrRenderer() {
    }

    /** Resultado de uma geração: a imagem, ou o erro. */
    public record Result(byte[] png, String payload, int modules, String error) {

        public boolean ok() {
            return error == null;
        }
    }

    /**
     * Gera o payload, valida e devolve o PNG.
     *
     * <p>Nunca devolve {@code null} para o erro: as mensagens são as mesmas que
     * as do core, para que a UI e a CLI digam a mesma coisa.
     */
    public static Result generate(QrCategory category, QrFields fields, int targetPx, EccLevel level) {
        String error = QrValidator.validate(category, fields);
        if (error != null) {
            return new Result(null, null, 0, error);
        }

        try {
            String payload = QrPayloadBuilder.build(category, fields);
            com.qrcodegen.core.QrCapacity.check(payload, level);

            byte[] png = toPng(payload, targetPx, level);
            int modules = moduleCount(payload, level);

            return new Result(png, payload, modules, null);
        } catch (QrCapacityException | IOException e) {
            return new Result(null, null, 0, e.getMessage());
        } catch (WriterException e) {
            return new Result(null, null, 0, "Não foi possível gerar o QR code: " + e.getMessage());
        } catch (RuntimeException e) {
            return new Result(null, null, 0, e.getMessage());
        }
    }

    /** PNG do QR, com a zona silenciosa de 4 módulos que a norma exige. */
    public static byte[] toPng(String payload, int size, EccLevel level) throws IOException, WriterException {
        Map<EncodeHintType, Object> hints = hints(level);

        BitMatrix matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, size, size, hints);

        // MatrixToImageWriter é a via multiplataforma do ZXing. Em Windows dava
        // para usar a classe de java.desktop, mas esta funciona em todo o lado.
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            MatrixToImageWriter.writeToStream(matrix, "PNG", out);
            return out.toByteArray();
        }
    }

    /**
     * SVG do QR — escala sem perda e ficheiro pequeno, para imprimir.
     *
     * <p>Escrito à mão em vez de usar {@code MatrixToImageWriter}: o SVG do ZXing
     * sai com um rect por módulo, o que num QR de 1000 módulos dá um ficheiro
     * enorme. Um único {@code path} com um comando por módulo dá menos de 1 KB.
     */
    public static String toSvg(String payload, EccLevel level) throws WriterException {
        Map<EncodeHintType, Object> hints = hints(level);
        int size = 512;

        BitMatrix matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, size, size, hints);

        int border = 4;
        int dimension = matrix.getHeight() + border * 2;

        StringBuilder path = new StringBuilder();
        for (int y = 0; y < matrix.getHeight(); y++) {
            for (int x = 0; x < matrix.getWidth(); x++) {
                if (matrix.get(x, y)) {
                    path.append("M").append(x + border).append(',').append(y + border).append("h1v1h-1z");
                }
            }
        }

        return """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges">\
                <rect width="%d" height="%d" fill="white"/>\
                <path d="%s" fill="black"/>\
                </svg>"""
                .formatted(dimension, dimension, dimension, dimension, path);
    }

    /** Grava o PNG num ficheiro. */
    public static void writePng(Path target, byte[] png) throws IOException {
        // O nome vem da categoria, não do utilizador: evita problemas de
        // caracteres ilegais em Windows e de separadores em qualquer SO.
        Files.write(target, png);
    }

    public static void writeText(Path target, String text) throws IOException {
        // UTF-8 explícito: sem isto, o ficheiro sai na codificação padrão da
        // plataforma e os acentos quebram no macOS e no Linux.
        Files.write(target, text.getBytes(StandardCharsets.UTF_8));
    }

    private static int moduleCount(String payload, EccLevel level) {
        try {
            BitMatrix matrix = new QRCodeWriter()
                    .encode(payload, BarcodeFormat.QR_CODE, 1, 1, hints(level));
            return matrix.getHeight();
        } catch (WriterException e) {
            return 0;
        }
    }

    private static Map<EncodeHintType, Object> hints(EccLevel level) {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, switch (level) {
            case L -> ErrorCorrectionLevel.L;
            case M -> ErrorCorrectionLevel.M;
            case Q -> ErrorCorrectionLevel.Q;
            case H -> ErrorCorrectionLevel.H;
        });
        hints.put(EncodeHintType.MARGIN, 4);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        return hints;
    }
}
