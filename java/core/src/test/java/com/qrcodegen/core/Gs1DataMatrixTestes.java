package com.qrcodegen.core;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.qrcodegen.core.simbologias.CodigoGs1;
import com.qrcodegen.core.simbologias.CodigoGs1Matriz;
import com.qrcodegen.core.simbologias.Gs1_128;
import com.qrcodegen.core.simbologias.Gs1_DataMatrix;
import com.qrcodegen.core.simbologias.SimbologiaException;
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

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Os testes do GS1 DataMatrix em Java.
 *
 * <p><strong>O encoder desenha e o ZXing le</strong>, que e' o nivel 2 e a versao que
 * apanha o que os testes estrutural nao apanham. A `AGENTS.md` diz que um encoder que
 * so passa nos testes proprios nao esta verificado, e que um teste de leitura tem de
 * existir ao mesmo tempo que o encoder.
 *
 * <p><strong>Este ficheiro e' a leitura; a paridade com o Python e' no
 * {@code ParidadeGs1DataMatrix}.</strong> O encoder em Java so entra no repositorio
 * depois de o ZXing devolver a string certa — e nao antes.
 *
 * <h2>As diferencas em relacao ao GS1-128, e porquê</h2>
 *
 * <p>O GS1-128 e' um codigo de barras e o GS1 DataMatrix e' uma matriz, e **as
 * afirmacoes de leitura nao sao as mesmas**:
 *
 * <ul>
 *   <li>No <strong>GS1-128</strong>, {@code getText()} devolve o payload sem os
 *       separadores, e o {@code }C1} so aparece no {@code SYMBOLOGY_IDENTIFIER}.</li>
 *   <li>No <strong>GS1 DataMatrix</strong>, o ZXing <em>parseia</em> o GS1 e devolve
 *       os AIs <strong>entre parenteses</strong> no {@code getText()}, que e' a forma
 *       humana — e o {@code SYMBOLOGY_IDENTIFIER} deve ser {@code ]d2} (com FNC1 no
 *       inicio) em vez de {@code ]d1}.</li>
 * </ul>
 *
 * <p><strong>Por isso que as afirmacoes de Java nao sao a traducao das de Python:</strong>
 * os dois leitores nao concordam sobre o mesmo formato, e forcar o Python a ler-se
 * como o Java seria mentir sobre um dos dois.
 */
class Gs1DataMatrixTestes {

    /** Quantos pixele por modulo. **Quatro**, como no {@code DataMatrixTestes}. */
    private static final int ESCALA = 4;

    /** A zona muda, em modulos. A norma ISO/IEC 16022 pede um. **Dez como no outro.** */
    private static final int ZONA_MUDA = 10;

    private static Arguments caso(String texto, Supplier<CodigoGs1Matriz> construcao) {
        return Arguments.of(texto, construcao);
    }

    // --- os casos ---------------------------------------------------------------

    static Stream<Arguments> gs1() {
        return Stream.of(
                // O GTIN sozinho: um campo fixo, o caso mais simples.
                caso("(01)04012345678901", () -> Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901")),

                // GTIN e um lote ao fim: o "10" vai em digitos, o valor em ASCII.
                caso("(01)04012345678901(10)LOTE-A1",
                        () -> Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1")),

                // O lote no meio: recebe o separador antes do (17).
                caso("(01)04012345678901(10)LOTE-A1(17)270630",
                        () -> Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1(17)270630")),

                // Tres campos: dois variaveis (10 e 21) e um fixo no fim (17).
                caso("(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630",
                        () -> Gs1_DataMatrix.gs1DataMatrix(
                                "(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630")),

                // O AI 415, um GLN de treze digitos.
                caso("(415)0123456789012(10)LOTE-B2",
                        () -> Gs1_DataMatrix.gs1DataMatrix("(415)0123456789012(10)LOTE-B2")),

                // A posicao decimal implicita: o 3103.
                caso("(3103)000123", () -> Gs1_DataMatrix.gs1DataMatrix("(3103)000123")));
    }

    private static Arguments recusa(String texto, String palavra) {
        return Arguments.of(texto, palavra);
    }

    static Stream<Arguments> recusas() {
        return Stream.of(
                // GTIN com treze em vez de catorze: a mensagem diz os dois numeros.
                recusa("(01)9501101530003", "13"),
                // Mes 56: o regex da GS1 recusa, e o leitor de um sistema GS1 tambem.
                recusa("(11)155630", "GS1"),
                // AI que a GS1 nao publica.
                recusa("(888)ABC", "nao existe"),
                // Campo sem valor.
                recusa("(01)", "valor"));
    }

    // --- nivel 0: os codewords, antes de gerar imagem nenhuma -------------------

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o ZXing le a forma humana, com os AIs entre parenteses")
    void oZxingLeAFormaHumana(String texto, Supplier<CodigoGs1Matriz> construcao)
            throws Exception {
        CodigoGs1Matriz codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **`getText()` devolve `<GS>` mais o payload**, e nada mais — medido com o
         * `build.sh sonda-gdm`, e nao assumido.
         *
         * **Esta suposicao estava errada.** O que o ZXing devolve para
         * `(01)04012345678901(10)LOTE-A1` e' `<GS>010401234567890110LOTE-A1`: o
         * separador do inicio e o payload sem parenteses e **sem** os separadores do
         * meio. Nem a forma humana do encoder, nem o payload dele.
         *
         * **Sao tres leitores e tres formatos, e nao se traduzem uns nos outros:**
         *
         * | leitor | o que devolve no `text` |
         * |---|---|
         * | `zxingcpp` (Python) | `(01)0401…` — os AIs **entre parenteses** |
         * | ZXing em Java, GS1-128 | o payload **sem separadores** |
         * | ZXing em Java, GS1 DataMatrix | **`<GS>` + o payload** |
         *
         * **A razao do `<GS>` a frente e' o FNC1 do inicio**, que o ZXing consome e
         * escreve como separador em vez de o marcar so no identificador. E' por isso
         * que o `]d2` e' uma afirmacao a parte — e a que mais apanha.
         */
        // **O `payload()` ja' tem os separadores no sitio certo** — e' a forma de
        // maquina. O ZXing escreve isso **mais o `GS` do inicio a frente**, que e' o
        // FNC1 que ele consome e escreve como separador em vez de marcar so no
        // identificador.
        //
        // **A sonda mediu isto com um caso que tem separador no meio**, e a diferenca
        // para um caso que nao tem e' so o `GS` da frente — pelo que a correccao e'
        // juntar o `GS` ao payload e nao reescrever a comparacao caso a caso.
        String esperado = Gs1_DataMatrix.GS + codigo.payload();

        assertEquals(esperado, resultado.getText(),
                "o texto que o ZXing leu nao e' o GS inicial mais o payload sem separadores");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o ZXing viu o FNC1 do inicio: ]d2 e nao ]d1")
    void oZxingViuOFnc1DoInicio(String texto, Supplier<CodigoGs1Matriz> construcao)
            throws Exception {
        CodigoGs1Matriz codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **O `]d2` e' o sintoma do FNC1 do inicio.** Um `]d1` e' um Data Matrix normal,
         * e o codigo seria lido sem queixa nenhuma — o utilizador nunca ve a diferenca,
         * so o leitor de um sistema GS1. **E a razao de o encoder emitir o FNC1 como
         * primeiro codeword**: e' o que o torna identificavel como GS1.
         *
         * **O identificador e' a coisa mais forte que se pode afirmar aqui**, porque
         * o `getText()` devolve a forma humana tanto com FNC1 como sem.
         */
        // O `getResultMetadata()` devolve `Map<?, Object>`, e o valor e' um `Object`.
        // **O cast e' necessario e e' o que o `Gs1_128Testes` tambem faz.**
        String identificador = (String) resultado.getResultMetadata()
                .get(ResultMetadataType.SYMBOLOGY_IDENTIFIER);

        assertEquals("]d2", identificador,
                "o ZXing nao reconheceu o FNC1 do inicio: ]d2 diz GS1 e ]d1 diz Data Matrix normal");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o ZXing viu exactamente os FNC1 que o encoder emitiu")
    void oZxingViuOsFnc1(String texto, Supplier<CodigoGs1Matriz> construcao) throws Exception {
        CodigoGs1Matriz codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **Contar os 232 nos codewords que o ZXING DEVOLVE** seria zero, porque
         * ele consome os dois — o do inicio e os separadores. **A medicao disse isso
         * e a primeira versao deste teste contou nos `getRawBytes()`, que e' o texto
         * descodificado e nao os codewords.**
         *
         * **O que confirma os separadores e' o `getText()`**, que traz o `<GS>` do
         * inicio, mais o `]d2` que diz que o ZXing os consumiu como GS1. E o
         * `separadores()` do encoder, que e' uma afirmacao a parte: um separador a
         * mais nao muda o numero de modulos, e o ZXing le o codigo do mesmo modo — a
         * falha so aparece na comparacao.
         */
        int vistos = 0;
        for (int i = 0; i < resultado.getText().length(); i++) {
            if (resultado.getText().charAt(i) == 0x1D) {
                vistos++;
            }
        }

        // **No `text` estao TODOS os `GS`** — o do inicio e os do meio. A medicao
        // mostra `LOTE-A1<GS>17270630` num caso com um separador, e o do inicio a
        // frente de tudo. **E sao exactamente os que o encoder contou**, e por isso
        // que a conta bate sem nenhuma correccao: e' a mesma regra, vista dos dois
        // lados.
        int esperados = codigo.separadores();
        assertEquals(esperados, vistos,
                "o encoder emitiu " + esperados + " separadores (alem do FNC1 do inicio) "
                        + "e o leitor viu " + vistos);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("os getRawBytes do ZXing sao os CODEWORDS, nao os caracteres")
    void osBytesSaoOsCodewords(String texto, Supplier<CodigoGs1Matriz> construcao)
            throws Exception {
        CodigoGs1Matriz codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **`getRawBytes()` de um Data Matrix sao os CODEWORDS, um por byte, e sao o
         * PREFIXO do que o encoder escreveu.** Medido com o `build.sh sonda-gdm`:
         *
         *     encoder  232 131 134 131 153 175 197 219 131           (9)
         *     ZXing    E8  83  86  83  99  AF  C5  DB  83  81  FB  93  (12)
         *
         * **Os primeiros 9 batem** (`E8`=232, `83`=131=`01`+130, `86`=134=`04`+130) e
         * o ZXing devolve mais tres. **O que sobra e' o enchimento**: o
         * {@code encher} acrescenta pads aleatorizados ate a capacidade do simbolo, e
         * o ZXing devolve-os tambem.
         *
         * **E por isso que a comparacao e' de prefixo e nao de igualdade.** O
         * `encher` e' aleatorio por desenho, o numero de pads nao e' um contrato, e
         * uma igualdade falharia com o enchimento — que nao e' um bug de GS1. **Um
         * teste que confunda o enchimento com um bug de GS1 ou falha sempre ou
         * deixa de apanhar o bug de GS1.**
         *
         * **Esta suposicao foi errada duas vezes**, e a razao e' a mesma que o
         * `AGENTS.md` da com o Code 93: no Code 128 os `getRawBytes()` quase sao os
         * caracteres, e no Data Matrix **nao**. O aviso esta' escrito no
         * `Gs1_128Testes` — *"os `getRawBytes()` sao mesmo os codewords de dados"* — e
         * eu li o aviso e nao o apliquei.
         *
         * **E sao duas afirmacoes porque sao duas coisas:** o `getText()` diz o que a
         * pessoa le, e os codewords dizem o formato de fio. **As duas tem de bater**,
         * e cada uma apanha o que a outra nao apanha: os codewords apanham um
         * separador a mais, e o texto apanha um `numerico` errado.
         */
        int[] meus = codigo.codigo().codewords();
        byte[] lidos = resultado.getRawBytes();

        assertTrue(lidos.length >= meus.length,
                "o ZXing leu " + lidos.length + " codewords e o encoder emitiu "
                        + meus.length);

        for (int i = 0; i < meus.length; i++) {
            assertEquals(meus[i], lidos[i] & 0xFF,
                    "o codeword " + i + " e' " + meus[i] + " e o ZXing leu "
                            + (lidos[i] & 0xFF));
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o texto do ZXing e' o payload com o GS do inicio e todos os separadores")
    void oTextoEOPayloadMaisOsSeparadores(String texto, Supplier<CodigoGs1Matriz> construcao)
            throws Exception {
        CodigoGs1Matriz codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **O `getText()` e' a comparacao dos caracteres**, e e' o `GS` do inicio a
         * frente do payload. **Este e' o unico sitio onde se compara o que a pessoa
         * le**, e por isso que o `zxingcpp` de Python — que devolve os AIs entre
         * parenteses — **nao pode servir de traducao**: sao tres leitores e tres
         * formatos.
         */
        assertEquals(Gs1_DataMatrix.GS + codigo.payload(), resultado.getText(),
                "o texto que o ZXing leu nao e' o GS inicial mais o payload");
    }

    // --- o separador, que e' a regra que mais vezes se engana -------------------

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o separador so vai num campo variavel que nao seja o ultimo")
    void oSeparadorSoNoFimDeUmVariavel(String texto, Supplier<CodigoGs1Matriz> construcao) {
        CodigoGs1Matriz codigo = construcao.get();

        /*
         * **A regra do separador e' a do GS1-128 e tem a mesma excepcao**: no fim de
         * um campo de comprimento variavel, **menos no ultimo**. Um separador no fim
         * nao separa de nada e o leitor accounta-o como parte do campo seguinte.
         *
         * **A contagem de separadores e' uma afirmacao a parte**, porque o numero de
         * modulos nao a apanha: o mesmo texto com um separador a mais da um simbolo
         * possivelmente do mesmo tamanho, e o ZXing le-o do mesmo modo — a falha so
         * aparece na comparacao dos bytes.
         */
        int variaveis = 0;
        for (CodigoGs1.Campo campo : codigo.campos()) {
            if (campo.separador() && campo != codigo.campos().get(codigo.campos().size() - 1)) {
                variaveis++;
            }
        }

        assertEquals(variaveis + 1, codigo.separadores(),
                "um separador por campo variavel que nao seja o ultimo, mais o do inicio");
    }

    // --- nivel 0: os codewords, que e' o formato de fio -------------------------

    @Test
    @DisplayName("o GTIN-14 vai no modo de digitos: sete codewords, e nao catorze")
    void oValorNumericoVaiNoModoDeDigitos() {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901");

        /*
         * **Este e' o que apanha o `numerico` errado, e nao da erro nenhum se falhar.**
         *
         * O AI `01` vai no modo de digitos porque o encoder tem uma linha a parte
         * para o AI, que nunca esteve dependente do `numerico`. **O `numerico` decide
         * do VALOR**, e um valor numerico em ASCII desenha-se certo, le-se certo, e
         * **ocupa o dobro do espaco** — o GTIN-14 daria 17 codewords em vez de 9 e o
         * simbolo sairia maior do que devia.
         *
         * O `131` e' o `01` em digitos (`1 + 130`) e os **sete** seguintes sao o
         * GTIN aos pares. A mesma razao pela qual o `GS1-128` nao usa o modo de
         * digitos: o, e' so o AI que decide, e o `10` (o lote) e' alfanumerico.
         */
        assertArrayEquals(
                new int[] {232, 131, 134, 131, 153, 175, 197, 219, 131},
                codigo.codigo().codewords(),
                "o GTIN-14 em sete codewords aos pares, e nao catorze em ASCII");

        assertEquals(9, codigo.codigo().usado(),
                "o FNC1, o AI e sete codewords de valor");
    }

    @Test
    @DisplayName("o valor de um AI alfanumerico vai em ASCII, um codeword por caractere")
    void oValorAlfanumericoVaiEmAscii() {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.gs1DataMatrix("(01)04012345678901(10)LOTE-A1");

        /*
         * **O outro ramo da mesma decisao.** O `LOTE-A1` sao sete codewords, e nao
         * quatro — que e' o que aconteceria se o `numerico` estivesse a dizer que sim
         * para todo o mundo. **Um ramo sem caso e' um ramo onde um erro custa meses**,
         * e os dois ramos precisam de um caso cada um.
         */
        int pos10 = -1;
        int[] cw = codigo.codigo().codewords();
        for (int i = 0; i < cw.length; i++) {
            if (cw[i] == 140) { // 10 + 130, o "10" do AI em digitos
                pos10 = i;
                break;
            }
        }

        assertTrue(pos10 > 0, "o AI 10 esta no modo de digitos, como 140");

        String lote = "";
        for (int i = pos10 + 1; i <= pos10 + 7; i++) {
            lote += (char) (cw[i] - 1);
        }
        assertEquals("LOTE-A1", lote, "os sete caracteres do lote em ASCII, um por codeword");
    }

    // --- as recusas ---------------------------------------------------------------

    @ParameterizedTest(name = "{0}")
    @MethodSource("recusas")
    @DisplayName("as recusas dizem porquê")
    void asRecusasDizemPorque(String texto, String palavra) {
        SimbologiaException erro = assertThrows(SimbologiaException.class,
                () -> Gs1_DataMatrix.gs1DataMatrix(texto));

        assertTrue(erro.getMessage().contains(palavra),
                "a recusa de " + texto + " nao diz '" + palavra + "': " + erro.getMessage());
    }

    @Test
    @DisplayName("a recusa identifica o GS1 DataMatrix e nao o GS1-128")
    void aRecusaDizGs1DataMatrix() {
        /*
         * **O `analisar` e' o do GS1-128**, com um rotulo — a tabela e' a mesma. Sem o
         * rotulo, a mensagem de um GS1 DataMatrix mandava a pessoa procurar o erro
         * num codigo de barras, que e' o sitio errado.
         */
        SimbologiaException erro = assertThrows(SimbologiaException.class,
                () -> Gs1_DataMatrix.gs1DataMatrix("(01)9501101530003"));

        assertTrue(erro.getMessage().startsWith("GS1 DataMatrix: "),
                "a recusa deve comecar por 'GS1 DataMatrix: ': " + erro.getMessage());
    }

    @Test
    @DisplayName("a validacao e' a do GS1-128: um valor valido num e' valido no outro")
    void aValidacaoEaDoGs1_128() {
        /*
         * **O `253` e' `N3+N13[+X..17]`: ultimo componente 17, soma 30.**
         *
         * A tabela so traz o do ultimo porque e' o que serve para **dividir**; para
         * **conferir** e' a soma, que e' o `comprimentoTotal`. Sao 44 AIs em que a
         * diferenca recusava um valor que a GS1 aceita — e que o GS1-128 aceitava no
         * mesmo instante. **Um AI de varios componentes tem um valor que e' a soma
         * deles**, e esta e' a verificacao de que os dois formatos concordam.
         */
        String trinta = "1".repeat(30);

        // Nos dois formatos, o valor de 30 e' valido. **Afirmar que o encoder
        // devolve um codigo e' a afirmacao** — nao ha `assertDoesNotThrow`, porque
        // `assertNotNull` de algo que nunca devolve null so pode passar, e um assert
        // que so pode passar nao apanha nada.
        assertNotNull(Gs1_DataMatrix.gs1DataMatrix("(253)" + trinta));
        assertNotNull(Gs1_128.gs1_128("(253)" + trinta));

        // E 31 e' recusado nos dois.
        assertThrows(SimbologiaException.class,
                () -> Gs1_DataMatrix.gs1DataMatrix("(253)" + "1".repeat(31)));
        assertThrows(SimbologiaException.class,
                () -> Gs1_128.gs1_128("(253)" + "1".repeat(31)));
    }

    // --- a leitura -----------------------------------------------------------------

    private static Result descodificar(CodigoGs1Matriz codigo) {
        boolean[][] modulos = codigo.codigo().modulos();
        int largura = (codigo.codigo().colunas() + 2 * ZONA_MUDA) * ESCALA;
        int altura = (codigo.codigo().linhas() + 2 * ZONA_MUDA) * ESCALA;

        BufferedImage imagem = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB);

        // O fundo branco e' o explicitado: um TYPE_INT_RGB novo e' preto, e um Data
        // Matrix preto sobre preto nao le.
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
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);

            return new MultiFormatReader().decode(
                    new BinaryBitmap(new HybridBinarizer(
                            new BufferedImageLuminanceSource(imagem))),
                    hints);
        } catch (Exception e) {
            throw new AssertionError("o ZXing nao leu o GS1 DataMatrix de "
                    + codigo.legenda() + ": " + e.getMessage(), e);
        }
    }
}