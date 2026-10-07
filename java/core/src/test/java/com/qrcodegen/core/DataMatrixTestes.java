package com.qrcodegen.core;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.qrcodegen.core.simbologias.CodigoMatriz;
import com.qrcodegen.core.simbologias.DataMatrix;
import com.qrcodegen.core.simbologias.SimbologiaException;
import com.qrcodegen.core.simbologias.TabelasDataMatrix;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Nivel 2 do Data Matrix em Java: <strong>o Java desenha e o ZXing le</strong>.
 *
 * <p><strong>E' uma classe a parte, e nao mais um {@code @Nested} dentro de
 * {@link SimbologiasTestes}.</strong> Nao e' por ser mais codigo: e' porque o
 * desenho e' outro. Um codigo de barras desenha-se com guardas que descem, uma
 * altura de 90 pixele e uma margem de dez modulos; um Data Matrix tem as guias em
 * L dentro da propria matriz e uma zona muda de <strong>um</strong> modulo.
 * {@link SimbologiasTestes} tem um {@code ler()} so, e ele esta' a fazer o que o
 * Data Matrix nao quer.
 *
 * <p><strong>E' o que {@link SimbologiasTestes} ensina, repetido:</strong> um
 * encoder so entra no repositorio depois de o ZXing devolver a cadeia certa. Nao
 * ha "quase" - na fase dos codigos de barras, quatro encoders pareceram certos
 * durante a escrita e nao eram.
 *
 * <h2>Os bytes, nunca o texto</h2>
 *
 * <p><strong>A comparacao e' por {@code getRawBytes()} e nao por
 * {@code getText()}.</strong> O {@code text} do ZXing, na ausencia de ECI, assume
 * ISO-8859-1 — e um Data Matrix nao tem ECI. O mesmo caso com o PDF417 falhava em
 * todos os payloads com acentos e dava a impressao de que o modo estava partido.
 * <strong>Quando um leitor devolve duas representacoes, a que se compara e' a
 * cr��a</strong>; a outra e' para mostrar a uma pessoa.
 *
 * <h2>O nome da classe conta</h2>
 *
 * <p>Chama-se {@code DataMatrixTestes} e nao {@code DataMatrixNested}, porque o
 * filtro do JUnit no {@code build.sh} e' {@code .*(Test|Tests|Teste|Testes)$}. Uma
 * classe que nao bate nao e' descoberta, nao corre, e o build passa a dizer que
 * passou.
 */
@DisplayName("Data Matrix: o Java desenha e o ZXing le")
class DataMatrixTestes {

    /**
     * Quantos pixele por modulo.
     *
     * <p><strong>Quatro, e nao um.</strong> O ZXing detecta o simbolo por contraste
     * e a um pixele por modulo um codigo pequeno da problemas de amostragem nos
     * cantos tracejados, que sao a unica coisa de que o leitor se serve para se
     * orientar. Um codigo de 10x10 a um pixele e' uma grelha que se parece com as
     * outras e nao e' lida.
     */
    private static final int ESCALA = 4;

    /**
     * A zona muda, em modulos.
     *
     * <p><strong>Um, e nao dez como no EAN.</strong> O leitor orienta-se pelos
     * cantos tracejados, e sem margem a deteccao falha. Quatro nao arranjam, e um
     * Data Matrix desenhado com a margem do EAN fica maior do que a precisa e nao
     * e' por isso que nao se lê.
     */
    private static final int ZONA_MUDA = 1;

    private static Arguments caso(String esperado, Supplier<CodigoMatriz> construcao) {
        return Arguments.of(esperado, construcao);
    }

    // --- os casos ------------------------------------------------------------

    static Stream<Arguments> dataMatrix() {
        return Stream.of(
                // O minimo e' o maximo: um unico caractere e' o 10x10.
                caso("A", () -> DataMatrix.dataMatrix("A")),
                caso("AB", () -> DataMatrix.dataMatrix("AB")),
                caso("MAST-2024-0001", () -> DataMatrix.dataMatrix("MAST-2024-0001")),
                caso("4531234567890123", () -> DataMatrix.dataMatrix("4531234567890123")),

                // **Os digitos aos pares**, que e' a compressao de que o Data
                // Matrix tira o nome: 32 digitos sao 16 codewords e nao 32.
                caso("12345678901234567890123456789012",
                        () -> DataMatrix.dataMatrix("12345678901234567890123456789012")),
                caso("0000000000000000000000000",
                        () -> DataMatrix.dataMatrix("0000000000000000000000000")),

                // **O deslocamento para ASCII estendido.** Cada acento custa dois
                // codewords, e o ZXing devolve-os byte a byte. **Foi com estes dois
                // que o `b - 128` do web dava um "r" onde estava um "c"** — e so
                // nos com acentos, que e' a assinatura de um erro que so aparece
                // no canto.
                caso("Fatura nº 2026/09 — açúcar, €45,80",
                        () -> DataMatrix.dataMatrix("Fatura nº 2026/09 — açúcar, €45,80")),
                caso("Lote ✅ 42 — pronto 🚀",
                        () -> DataMatrix.dataMatrix("Lote ✅ 42 — pronto 🚀")),

                // **Payloads que passam por simbolos com mais do que um bloco de
                // correccao**, que e' onde o entrelacamento se ve. Um simbolo com
                // um bloco so nao tem entrelacamento nenhum, e um teste com um
                // deles nunca tocaria nessa parte do encoder.
                caso("X".repeat(120), () -> DataMatrix.dataMatrix("X".repeat(120))),
                caso("Y".repeat(400), () -> DataMatrix.dataMatrix("Y".repeat(400))),
                caso("Z".repeat(900), () -> DataMatrix.dataMatrix("Z".repeat(900))),
                caso("9".repeat(1400), () -> DataMatrix.dataMatrix("9".repeat(1400))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("dataMatrix")
    @DisplayName("Data Matrix: o ZXing le o codigo que o Java desenhou")
    void dataMatrixElegivel(String esperado, Supplier<CodigoMatriz> construcao) {
        assertEquals(DataMatrix.compactar(esperado.getBytes(StandardCharsets.UTF_8)).length,
                ler(construcao.get(), esperado).length);
    }

    @Test
    @DisplayName("o texto do ZXing e' o certo, e so no ASCII e' comparavel")
    void oTextoSoEComparavelNoAscii() {
        // **O `getText()` funciona, e e' por isso que o teste de texto nao esta'
        // nos casos com acentos.** Um "ç" em UTF-8 e' `0xC3 0xA7`; o ZXing, sem
        // ECI, devolve os dois caracteres ISO-8859-1 correspondentes. O texto
        // devolvido **nao e' o texto escrito**, e um teste que comparasse os dois
        // falharia por uma razao que nao tem nada a ver com o encoder.
        //
        // **Por isso aqui so ASCII, e o `ler` de codewords mede o resto.** Um caso
        // de leitura que so passa para metade dos caracteres e' pior do que
        // nenhum: da a impressao de que o leitor sabe ler o formato.
        assertEquals("MAST-2024-0001",
                descodificar(DataMatrix.dataMatrix("MAST-2024-0001")).getText());
        assertEquals("4531234567890123",
                descodificar(DataMatrix.dataMatrix("4531234567890123")).getText());
    }

    @Test
    @DisplayName("o ZXing le como Data Matrix e nao como outra coisa")
    void oZxingLeComoDataMatrix() {
        // **Um leitor que devolve o texto certo na formatacao errada passa num
        // teste so de texto.** E ja aconteceu neste repositorio: o ITF sem
        // `PURE_BARCODE` e' lido como Code 128, porque o ITF tem sempre digitos e
        // uma moldura compativel. O `ler()` acima ja confirma a formatacao; este
        // existe para que a falha aponte para aqui e nao para o caso.
        assertEquals(BarcodeFormat.DATA_MATRIX, lerFormato(DataMatrix.dataMatrix("MAST-2024-0001")));
    }

    // --- a estrutura, que e' o que a leitura sozinha nao diz ---------------

    @Test
    @DisplayName("a guia de baixo e a da esquerda sao cheias, e a de cima e' tracejada")
    void asGuiasSaoDiferentes() {
        // **A assimetria das guias e' a assinatura do Data Matrix**, e e' a coisa de
        // que o leitor se serve para se orientar. As quatro iguais nao e' lido.
        boolean[][] modulos = DataMatrix.dataMatrix("MAST-2024-0001").modulos();

        for (boolean[] linha : modulos) {
            assertTrue(linha[0], "a guia da esquerda e' o vertical do L e e' cheia");
        }
        for (boolean modulo : modulos[modulos.length - 1]) {
            assertTrue(modulo, "a guia de baixo e' o horizontal do L e e' cheia");
        }

        // **A de cima alterna com a posicao**, e nao com a linha: um modulo par e'
        // escuro, um impar e' claro.
        boolean[] topo = modulos[0];
        for (int i = 0; i < topo.length; i++) {
            assertEquals(i % 2 == 0, topo[i], "a guia de cima alterna com a posicao: coluna " + i);
        }
    }

    @Test
    @DisplayName("o codigo nao tem guardas nem legenda, e nao tem como ter")
    void naoTemGuardasNemLegenda() throws Exception {
        // **Um 2D nao tem as duas coisas, e nao deve poder fingir que tem.** Um
        // `guardas` vazio seria um campo que o desenho le e nao usa, e uma legenda
        // vazia seria um codigo que o leitor funciona e a folha impressa nao bate -
        // que e' o pior caso numa etiqueta.
        //
        // **A verificacao e' por reflexao, e nao por leitura do codigo.** Ler o
        // `CodigoMatriz` e ver que nao ha `legenda()` prova que nao ha
        // `legenda()` **hoje**; a reflexao prova que nao ha nenhum metodo com
        // esse nome, e um metodo acrescentado a breaking change e' apanhado por
        // este teste em vez de por quem desenhhar e descobrir que o campo esta
        // vazio.
        for (java.lang.reflect.Method metodo : CodigoMatriz.class.getMethods()) {
            String nome = metodo.getName().toLowerCase();

            assertTrue(!nome.contains("legenda") && !nome.contains("guarda"),
                    "o CodigoMatriz tem `" + metodo.getName() + "()`, e um codigo 2D nao tem "
                            + "nem legenda nem guardas: as guias em L estao na propria matriz");
        }

        CodigoMatriz codigo = DataMatrix.dataMatrix("MAST-2024-0001");
        assertEquals(16, codigo.colunas());
        assertEquals(16, codigo.linhas());
        assertEquals(codigo.linhas(), codigo.modulos().length);
        assertEquals(codigo.colunas(), codigo.modulos()[0].length);
    }

    @Test
    @DisplayName("a matriz tem uma densidade de tinta de codigo de barras")
    void densidadeDeTinta() {
        // **Nem tudo nem nada.** Um encoder que deixasse a regiao de dados toda
        // branca desenha-se como um Data Matrix com um quadrado no meio e nao e'
        // lido; um que a deixasse toda preta tambem. **Um `boolean[][]` nao
        // permite outros valores, por isso que a pergunta nao e' "tem 0 e 1" mas
        // "tem a mistura certa"** — e uma pergunta que um `assertTrue(m || !m)`
        // nunca responderia.
        for (String texto : new String[] {"A", "MAST-2024-0001", "9".repeat(900)}) {
            CodigoMatriz codigo = DataMatrix.dataMatrix(texto);

            int escuros = 0;
            int total = codigo.linhas() * codigo.colunas();
            for (boolean[] linha : codigo.modulos()) {
                for (boolean modulo : linha) {
                    if (modulo) {
                        escuros++;
                    }
                }
            }

            double densidade = (double) escuros / total;
            assertTrue(densidade > 0.2 && densidade < 0.8,
                    "'" + texto + "' saiu com " + Math.round(densidade * 100) + "% de tinta, e um "
                            + "codigo de barras fica entre 20% e 80%:\n" + codigo.comoTexto());
        }
    }

    @Test
    @DisplayName("o 144x144 tem dez blocos e a conta fecha")
    void oMaiorSimboloTemDezBlocos() {
        // **8 x 156 + 2 x 155 = 1558.** Com 154 dava 1556, e dois codewords a menos
        // num codigo de 1558 e' o tipo de erro que o leitor acusa como corrupcao e
        // nao como tabela errada.
        int capacidade = TabelasDataMatrix.SIMBOLOS[23][0];

        assertEquals(10, TabelasDataMatrix.ULTIMO_BLOCOS);
        assertEquals(8, TabelasDataMatrix.ULTIMO_CHEIOS);
        assertEquals(1558, capacidade);
        assertEquals(capacidade,
                TabelasDataMatrix.ULTIMO_CHEIOS * TabelasDataMatrix.ULTIMO_DADOSCHEIO
                        + (TabelasDataMatrix.ULTIMO_BLOCOS - TabelasDataMatrix.ULTIMO_CHEIOS)
                                * TabelasDataMatrix.ULTIMO_DADOSULTIMOS);
        assertEquals(1558, DataMatrix.CAPACIDADE_MAXIMA);
    }

    @Test
    @DisplayName("a chave dos factores e' o comprimento do conjunto")
    void aChaveDosFactoresEOComprimento() {
        // **A chave e' o numero de codewords de correccao, que e' o comprimento do
        // conjunto.** Os primeiros indices e os primeiros comprimentos coincidem por
        // acaso e os ultimos nao - e o Java e' a unica das cinco stacks em que a
        // tabela nao escreve a chave, porque um `int[][]` implica a ordem.
        assertEquals(16, TabelasDataMatrix.FATORES.length);

        int[] esperados = {5, 7, 10, 11, 12, 14, 18, 20, 24, 28, 36, 42, 48, 56, 62, 68};
        for (int i = 0; i < TabelasDataMatrix.FATORES.length; i++) {
            assertEquals(esperados[i], TabelasDataMatrix.FATORES[i].length,
                    "FATORES[" + i + "] tem comprimento errado");
        }
    }

    // --- o que o encoder recusa ---------------------------------------------

    @Test
    @DisplayName("o Data Matrix recusa texto vazio")
    void recusaVazio() {
        assertThrows(SimbologiaException.class, () -> DataMatrix.dataMatrix(""));
    }

    @Test
    @DisplayName("o Data Matrix recusa o que nao cabe, e a mensagem diz o limite")
    void recusaAcimaDoLimite() {
        SimbologiaException erro = assertThrows(SimbologiaException.class,
                () -> DataMatrix.dataMatrix("A".repeat(4000)));
        assertTrue(erro.getMessage().contains("1558"),
                "a mensagem tem de dizer o limite, para nao se adivinhar: " + erro.getMessage());
    }

    @Test
    @DisplayName("o Data Matrix aceita o que um codigo de barras recusa")
    void aceitaOQueUmCodigoDeBarrasRecusa() {
        // **E' a grande diferenca entre os dois.** Um Code 39 recusa o emoji e o
        // Code 93 recusa tudo acima de 127; aqui qualquer UTF-8 cabe, porque cada
        // byte alto custa dois codewords em vez de ser recusado.
        CodigoMatriz codigo = DataMatrix.dataMatrix("ação 🚀");

        assertTrue(codigo.usado() <= codigo.dados(),
                "cinco caracteres nao podem ocupar mais do que a capacidade");

        int[] esperado = DataMatrix.compactar("ação 🚀".getBytes(StandardCharsets.UTF_8));
        assertTrue(esperado.length > 9,
                "sao cinco caracteres e " + esperado.length + " codewords: cada byte de "
                        + "um acento custa dois, e e' esse o preco de nao recusar");
        assertEquals(esperado.length, ler(codigo, "ação 🚀").length);
    }

    @Test
    @DisplayName("um espaco e' conteudo valido")
    void espacoEConteudo() {
        // **O que se recusa e' a cadeia vazia, e nao o texto sem caracteres
        // visiveis.** Um espaco numa etiqueta de peca e' normal, e recusar um
        // espaco seria recusar uma etiqueta valida.
        assertEquals(1, DataMatrix.dataMatrix(" ").usado());
    }

    // --- a leitura -----------------------------------------------------------

    /**
     * Desenha a matriz e devolve <strong>os codewords que o ZXing leu</strong>.
     *
     * <p><strong>E' o {@code getRawBytes()} e nao o {@code getText()}, e a razao
     * nao e' uma preferencia - e' que o {@code getText()} nao pode ser
     * comparado.</strong> O ZXing em Java, na ausencia de ECI, assume ISO-8859-1:
     * um {@code ç} que em UTF-8 sao os bytes {@code 0xC3 0xA7} volta como dois
     * caracteres, {@code Ä} e {@code ¨}. <strong>O texto devolvido nao e' o
     * texto que foi escrito</strong>, e comparar as duas coisas daria um teste
     * que so passa para ASCII.
     *
     * <p><strong>Os bytes crus sao os codewords, um por byte</strong> - o que se
     * confirma pelo payload mais curto: {@code A} e' o codeword 66, e 66 em
     * ASCII e' a letra {@code B}. Foi essa discrepancia que mostrou o que o
     * metodo devolvia. **Um teste que le um campo e recebe outra coisa nao
     * falha: devolve outra coisa e o teste passa se comparar na coisa errada.**
     *
     * <p><strong>Os codewords lidos sao os que o encoder compactou, e nao o que
     * o texto ficou.** Por isso o teste compara com
     * {@link DataMatrix#compactar(byte[])} e nao com a cadeia. Isso mede a
     * colocacao, a correccao de erros e as regras de compactacao **pelas tres
     * pontas ao mesmo tempo**, e e' por isso que um acento aparece num teste de
     * leitura em vez de ficar de fora.
     */
    private static int[] ler(CodigoMatriz codigo, String esperado) {
        Result resultado = descodificar(codigo);

        assertEquals(BarcodeFormat.DATA_MATRIX, resultado.getBarcodeFormat(),
                "o ZXing leu outra formatacao");

        byte[] crus = resultado.getRawBytes();
        assertTrue(crus != null && crus.length > 0,
                "o ZXing nao devolveu os bytes crus; sem eles o texto assume ISO-8859-1 "
                        + "e um payload com acentos nao pode ser comparado");

        int[] esperadoCodewords = DataMatrix.compactar(esperado.getBytes(StandardCharsets.UTF_8));

        assertTrue(crus.length >= esperadoCodewords.length,
                "o ZXing leu " + crus.length + " codewords e o encoder mandou "
                        + esperadoCodewords.length);

        int[] lidos = new int[esperadoCodewords.length];
        for (int i = 0; i < esperadoCodewords.length; i++) {
            lidos[i] = crus[i] & 0xFF;
            assertEquals(esperadoCodewords[i], lidos[i],
                    "o codeword " + i + " difere: o encoder mandou "
                            + esperadoCodewords[i] + " e o ZXing leu " + lidos[i]
                            + "\nA matriz era:\n" + codigo.comoTexto());
        }

        return lidos;
    }

    /** Como o ZXing le. */
    private static BarcodeFormat lerFormato(CodigoMatriz codigo) {
        return descodificar(codigo).getBarcodeFormat();
    }

    private static Result descodificar(CodigoMatriz codigo) {
        boolean[][] modulos = codigo.modulos();
        int largura = (codigo.colunas() + 2 * ZONA_MUDA) * ESCALA;
        int altura = (codigo.linhas() + 2 * ZONA_MUDA) * ESCALA;

        BufferedImage imagem = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB);

        // O fundo branco e' o explicitado: um TYPE_INT_RGB novo e' preto, e um
        // Data Matrix preto sobre preto nao le.
        for (int x = 0; x < largura; x++) {
            for (int y = 0; y < altura; y++) {
                imagem.setRGB(x, y, 0xFFFFFFFF);
            }
        }

        for (int y = 0; y < modulos.length; y++) {
            for (int x = 0; x < modulos[y].length; x++) {
                if (!modulos[y][x]) {
                    continue;
                }
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
            var source = new BufferedImageLuminanceSource(imagem);
            var bitmap = new BinaryBitmap(new HybridBinarizer(source));

            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);

            return new MultiFormatReader().decode(bitmap, hints);
        } catch (Exception e) {
            throw new AssertionError("Falha ao descodificar com o ZXing: " + e.getMessage()
                    + "\nA matriz era:\n" + codigo.comoTexto(), e);
        }
    }
}