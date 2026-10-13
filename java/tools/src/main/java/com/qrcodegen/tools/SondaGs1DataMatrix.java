package com.qrcodegen.tools;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.qrcodegen.core.simbologias.CodigoGs1Matriz;
import com.qrcodegen.core.simbologias.Gs1_DataMatrix;
import java.awt.image.BufferedImage;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;

/**
 * Desenha um GS1 DataMatrix e mostra **tudo** o que o ZXing devolve.
 *
 * <p>Este ficheiro nao e' um teste: e' uma **sonda**, e a razao de existir e' a mesma
 * que o `AGENTS.md` da para as leituras — **o que se compara tem de ser medido antes
 * do encoder existir**, e nao assumido. Assumi que o `getText()` devolvia a forma
 * humana e os bytes a forma de maquina, e **nenhum dos dois era verdade**.
 *
 * <p>Corre com: {@code ./build.sh sonda-gdm}
 */
public final class SondaGs1DataMatrix {

    private static final int ESCALA = 4;
    private static final int ZONA_MUDA = 10;

    public static void main(String[] argumentos) throws Exception {
        String[] casos = {
            "(01)04012345678901",
            "(01)04012345678901(10)LOTE-A1",
            "(01)04012345678901(10)LOTE-A1(17)270630",
            "(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630",
        };

        for (String texto : casos) {
            CodigoGs1Matriz codigo = Gs1_DataMatrix.gs1DataMatrix(texto);
            Result resultado = descodificar(codigo);

            System.out.println("=== " + texto);
            System.out.println("  o encoder diz:");
            System.out.println("    legenda  " + codigo.legenda());
            System.out.println("    payload  " + printable(codigo.payload()));
            System.out.println("    gs1      " + printable(codigo.gs1()));
            System.out.println("    sep      " + codigo.separadores());
            System.out.println("    codewords " + Arrays.toString(codigo.codigo().codewords()));

            System.out.println("  o ZXing devolve:");
            System.out.println("    text     " + printable(resultado.getText()));
            System.out.println("    format   " + resultado.getBarcodeFormat());
            System.out.println("    bytes    " + printable(new String(resultado.getRawBytes(), "ISO-8859-1")));
            System.out.println("    byteshex " + hex(resultado.getRawBytes()));
            System.out.println("    payloadhex " + hex(codigo.payload().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            System.out.println("    symbology " + printable(String.valueOf(
                    resultado.getResultMetadata().get(ResultMetadataType.SYMBOLOGY_IDENTIFIER))));
            System.out.println();
        }
    }

    private static String hex(byte[] dados) {
        StringBuilder s = new StringBuilder();
        for (byte b : dados) s.append(String.format("%02X ", b));
        return s.toString().trim();
    }

    private static String printable(String valor) {
        return valor.replace("\u001d", "<GS>").replace("\n", "\\n");
    }

    private static Result descodificar(CodigoGs1Matriz codigo) {
        boolean[][] modulos = codigo.codigo().modulos();
        int largura = (codigo.codigo().colunas() + 2 * ZONA_MUDA) * ESCALA;
        int altura = (codigo.codigo().linhas() + 2 * ZONA_MUDA) * ESCALA;

        BufferedImage imagem = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < largura; x++) {
            for (int y = 0; y < altura; y++) {
                imagem.setRGB(x, y, 0xFFFFFFFF);
            }
        }
        for (int y = 0; y < modulos.length; y++) {
            for (int x = 0; x < modulos[y].length; x++) {
                if (!modulos[y][x]) continue;
                int x0 = (x + ZONA_MUDA) * ESCALA;
                int y0 = (y + ZONA_MUDA) * ESCALA;
                for (int dx = 0; dx < ESCALA; dx++) {
                    for (int dy = 0; dy < ESCALA; dy++) {
                        imagem.setRGB(x0 + dx, y0 + dy, 0xFF000000);
                    }
                }
            }
        }

        try {
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            return new MultiFormatReader().decode(
                    new BinaryBitmap(new HybridBinarizer(
                            new BufferedImageLuminanceSource(imagem))), hints);
        } catch (Exception e) {
            throw new AssertionError("nao leu: " + e.getMessage(), e);
        }
    }
}