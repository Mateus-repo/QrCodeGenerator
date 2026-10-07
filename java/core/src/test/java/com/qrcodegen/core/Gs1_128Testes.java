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
import com.qrcodegen.core.simbologias.Gs1_128;
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
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Nivel 2 do GS1-128 em Java: <strong>o Java desenha e o ZXing le</strong>.
 *
 * <p><strong>E' uma classe a parte, e nao mais um {@code @Nested} dentro de
 * {@link SimbologiasTestes}.</strong> Um codigo de barras de uma linha desenha-se com
 * guardas e uma altura de 60 modulos; um 2D tem guias em L dentro da propria matriz
 * e uma zona muda de <strong>um</strong> modulo. O {@code ler()} de
 * {@code SimbologiasTestes} esta' a fazer o que o Data Matrix nao quer, e aqui o GS1-128
 * quer as guardas que o Code 128 nao tem — <strong>as duas coisas ao mesmo tempo nao
 * cabem num so metodo.</strong>
 *
 * <p><strong>E' o que {@link SimbologiasTestes} ensina, repetido:</strong> um encoder
 * so entra no repositorio depois de o ZXing devolver a cadeia certa. Nao ha "quase" — na
 * fase dos codigos de barras, quatro encoders pareceram certos durante a escrita e nao
 * eram.
 *
 * <h2>O GS1-128 tem tres representacoes, e o leitor devolve as tres</h2>
 *
 * <ul>
 *   <li>{@code getRawBytes()} — a forma de maquina, com o {@code 0x1D} onde o encoder
 *       pôs o separador. <strong>E' esta a que se compara.</strong></li>
 *   <li>{@code getText()} — a <strong>forma humana entre parenteses</strong>, porque o
 *       ZXing parseia o GS1. Medido, nao assumido: a primeira versao deste ficheiro
 *       comparava o {@code text} com a {@code legenda} e o ZXing devolvia exatamente
 *       isso, o que confirmava a coisa certa pelo motivo errado.</li>
 *   <li>{@code getBarcodeFormat()} — {@code CODE_128}, com um espaco. Nao ha um
 *       formato "GS1" no ZXing.</li>
 * </ul>
 *
 * <p><strong>Quando um leitor devolve duas representacoes, a que se compara e' a
 * crua</strong>; a outra e' para mostrar a uma pessoa. Aqui as tres servem, cada uma a
 * confirmar uma coisa diferente.
 *
 * <h2>O {@code ]C1} e' a unica coisa que distingue um GS1-128 de um Code 128</h2>
 *
 * <p>Os {@code bytes} de um GS1-128 e de um Code 128 com os mesmos caracteres sao
 * identicos. O identificador diz {@code ]C1} no primeiro e {@code ]C0} no segundo,
 * e e' o que um sistema GS1 le para saber que tem de interpretar os AIs.
 *
 * <p><strong>O {@code ]C1} esta' no {@code getResultMetadata()}, e nao num
 * metodo.</strong> O ZXing em Java nao tem {@code getSymbologyIdentifier()} — esse
 * e' do {@code zxingcpp}, que e' o port em C++ e que e' o que o
 * {@code descodificar-gs1-python.py} usa. **Assumi que um leitor tinha o que o outro
 * tinha**, e a suposicao custou um {@code cannot find symbol}. A `AGENTS.md` manda
 * medir em vez de assumir, e aqui a suposicao era a coisa errada a assumir.
 *
 * <p><strong>E nao se poe o {@code ASSUME_GS1}.</strong> O {@code DecodeHintType} tem
 * um {@code ASSUME_GS1} que diz ao leitor para <em>assumir</em> que o codigo e' GS1;
 * o que se quer aqui e' que ele diga que e' GS1 <strong>sem ninguem lhe dizer</strong>.
 * Com a dica, o teste passaria mesmo sem o FNC1 no inicio — que e' exactamente o que
 * o teste tem de apanhar.
 *
 * <h2>O nome da classe conta</h2>
 *
 * <p>Chama-se {@code Gs1_128Testes} e nao {@code Gs1_128Nested}, porque o filtro do
 * JUnit no {@code build.sh} e' {@code .*(Test|Tests|Teste|Testes)$}. Uma classe que nao
 * bate nao e' descoberta, nao corre, e o build passa a dizer que passou.
 */
@DisplayName("GS1-128: o Java desenha e o ZXing le")
class Gs1_128Testes {

    /**
     * Quantos pixele por modulo.
     *
     * <p><strong>Tres, e nao um nem dois.</strong> E' o minimo confiavel para leitores
     * de 1D, e a dois pixele ja falha em codigos com barras estreitas — que e' o que
     * um GS1-128 e, porque fica sempre no conjunto B e o Code 128 comutativo nao.
     */
    private static final int ESCALA = 3;

    /** Altura em modulos. 1D nao tem altura na norma, mas tem altura minima em fisica. */
    private static final int ALTURA = 60;

    /** A zona muda, em modulos. A norma ISO/IEC 15420 pede dez. */
    private static final int ZONA_MUDA = 10;

    private static Arguments caso(String texto, Supplier<CodigoGs1> construcao) {
        return Arguments.of(texto, construcao);
    }

    // --- os casos ---------------------------------------------------------------

    static Stream<Arguments> gs1() {
        return Stream.of(
                // --- o GTIN sozinho, que e' o caso mais comum numa caixa -------
                caso("(01)04012345678901", () -> Gs1_128.gs1_128("(01)04012345678901")),

                // --- o GTIN e um lote: aqui aparece o separador -----------------
                caso("(01)04012345678901(10)LOTE-A1",
                        () -> Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1")),

                // --- tres campos, dois separadores: o do meio e' o que se conta --
                caso("(01)04012345678901(10)LOTE-A1(17)270630",
                        () -> Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1(17)270630")),

                // --- o `3103`, cujo ultimo digito e' a posicao decimal implicita
                caso("(3103)000750", () -> Gs1_128.gs1_128("(3103)000750")),

                // --- um AI fixo antes de um variavel ---------------------------
                caso("(3103)000750(01)04012345678901",
                        () -> Gs1_128.gs1_128("(3103)000750(01)04012345678901")),

                // --- SSCC de 18 digitos, o campo mais longo da tabela ---------
                caso("(00)095060001343521234",
                        () -> Gs1_128.gs1_128("(00)095060001343521234")),

                // --- duas datas ------------------------------------------------
                caso("(11)150327(17)270630", () -> Gs1_128.gs1_128("(11)150327(17)270630")),

                // --- dois campos variaveis seguidos: o primeiro recebe separador
                caso("(240)9501101530003(241)9501234567890",
                        () -> Gs1_128.gs1_128("(240)9501101530003(241)9501234567890")),

                // --- tres digitos e quatro lado a lado -------------------------
                caso("(415)9501101530000(3103)000750(10)LOTE-A1",
                        () -> Gs1_128.gs1_128("(415)9501101530000(3103)000750(10)LOTE-A1")),

                // --- um AI de **varios componentes**, com o valor mais longo ---
                // (253) e' `N3+N13[+X..17]`: o ultimo componente tem maximo 17 e
                // um valor valido pode ter trinta. **E' o caso que apanha o
                // `maximo` do ultimo em vez da soma.**
                caso("(253)1234567890123ABCDEFGHIJKLMNOPQ",
                        () -> Gs1_128.gs1_128("(253)1234567890123ABCDEFGHIJKLMNOPQ")),

                // --- e um outro, com data e hora em vez de texto --------------
                caso("(8008)010203001234", () -> Gs1_128.gs1_128("(8008)010203001234")));
    }

    /** Um caso de recusa: o texto e a palavra que tem de estar na mensagem. */
    private static Arguments recusa(String texto, String palavra) {
        return Arguments.of(texto, palavra);
    }

    static Stream<Arguments> recusas() {
        return Stream.of(
                // O GTIN com treze digitos: o AI 01 quer catorze.
                recusa("(01)9501101530003", "13"),
                // O SSCC com catorze: o AI 00 quer dezoito.
                recusa("(00)09506000134352", "14"),
                // O mes 56, que o regex da GS1 recusa.
                recusa("(11)155630", "GS1"),
                // O dia 32.
                recusa("(11)150332", "GS1"),
                // Um AI de tres digitos que a GS1 nao publica — e o `999` **nao
                // serviria**, porque o `aiDe` devolve o `99`, que existe, com o `9`
                // de resto. E' o mecanismo a funcionar, nao um erro.
                recusa("(888)ABC", "nao existe"),
                // O parenteses que nao fecha.
                recusa("(01)04012345678901(10", "nao fecha"),
                // Sem parenteses.
                recusa("0104012345678901", "("),
                // O AI com letras.
                recusa("(AB)1234", "digitos"),
                // O campo sem valor.
                recusa("(01)", "valor"),
                // O texto vazio.
                recusa("", "campo"),
                // **O acento e' recusado pelo regex da GS1, e nao pela ASCII.** Uma
                // mensagem a dizer `ASCII` seria mentira, porque o encoder nunca chega
                // a validacao do Code 128.
                recusa("(10)LOTE-Á1", "GS1"));
    }

    // --- nivel 2: o ZXing le ---------------------------------------------------

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o ZXing le o payload, com os separadores a menos")
    void oZxingLeOPayload(String texto, Supplier<CodigoGs1> construcao) throws Exception {
        CodigoGs1 codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **O `getText()` do ZXing em Java e' o payload sem os separadores, e nao a
         * forma humana.** O `zxingcpp` de Python devolve os AIs entre parenteses no
         * `text` e o payload com o `0x1D` no `bytes`; o ZXing em Java nao tem forma
         * humana nenhuma e come os separadores.
         *
         * **Os dois leitores nao concordam sobre o mesmo formato**, que e' a razao de
         * as afirmacoes de Java nao serem a traducao das de Python.
         */
        String semSeparadores = codigo.payload().replace(String.valueOf(Gs1_128.GS), "");

        assertEquals(semSeparadores, resultado.getText(),
                "o texto que o ZXing leu nao e' o payload sem os separadores");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o ZXing viu exactamente os FNC1 que o encoder emitiu")
    void oZxingViuOsFnc1(String texto, Supplier<CodigoGs1> construcao) throws Exception {
        CodigoGs1 codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **`getRawBytes()` do ZXing em Java devolve os CODEWORDS, nao os
         * caracteres.** Para `(01)04012345678901` devolve 20 bytes, e sao
         * `h f \x10 \x11 ... j`: `h` e' 104, o inicio do conjunto B, `f` e' 102, o
         * FNC1, e `j` e' 106, a paragem.
         *
         * E' o mesmo comportamento do Data Matrix, onde os `getRawBytes()` sao mesmo
         * os codewords de dados — e por isso que o `DataMatrixTestes` compara por ai.
         * **Para o Code 128 nao sao os caracteres**, e comparar por ai dava "expected
         * 16 but was 20" em todos os casos.
         *
         * **Contar os 102 e' o que confirma o FNC1 dos dois lados**: o encoder diz
         * que os emitiu e o leitor diz que os viu. Um separador a mais daria um 102 a
         * mais, e o numero de modulos nao daria conta — porque o GS1-128 e o Code 128
         * dao treze codewords nos dois com o mesmo texto.
         */
        int vistos = 0;
        for (byte b : resultado.getRawBytes()) {
            if ((b & 0xFF) == Gs1_128.FNC1) {
                vistos++;
            }
        }

        assertEquals(codigo.separadores(), vistos,
                "o encoder emitiu " + codigo.separadores() + " FNC1 e o leitor viu " + vistos);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gs1")
    @DisplayName("o ZXing diz ]C1, e nao ]C0")
    void oZxingDizQueEUmGs1(String texto, Supplier<CodigoGs1> construcao) throws Exception {
        CodigoGs1 codigo = construcao.get();
        Result resultado = descodificar(codigo);

        /*
         * **`]C1` e' a unica coisa que distingue um GS1-128 de um Code 128** com os
         * mesmos caracteres. Os `bytes` sao os mesmos codewords nos dois, porque os
         * caracteres sao os mesmos.
         *
         * **E nao se poe o `ASSUME_GS1`.** O `DecodeHintType` tem um `ASSUME_GS1` que
         * diz ao leitor para *assumir* que o codigo e' GS1; o que se quer aqui e' que
         * ele diga que e' GS1 **sem ninguem lhe dizer**. Com a dica o teste passaria
         * mesmo sem o FNC1 no inicio — que e' exactamente o que o teste tem de apanhar.
         */
        assertEquals("]C1", identificador(resultado),
                "o ZXing nao reconheceu o FNC1 do inicio, e sem ele este e' um Code 128");
    }

    @Test
    @DisplayName("o ZXing classifica como Code 128, que e' o que o GS1-128 e")
    void oZxingDizCode128() {
        // **Nao ha um formato "GS1" no ZXing.** O GS1-128 e' um Code 128 com FNC1 e
        // o leitor classifica-o pelo codigo — e dizer `GS1` aqui seria estar a
        // afirmar uma coisa que o leitor nao sabe.
        Result resultado = descodificar(Gs1_128.gs1_128("(01)04012345678901"));

        assertEquals(BarcodeFormat.CODE_128, resultado.getBarcodeFormat());
    }

    // --- a contagem de FNC1, que e' o que apanha um separador a mais -----------

    @Test
    @DisplayName("o numero de FNC1 bate com os que a GS1 manda")
    void oNumeroDeFnc1() {
        // **O GTIN e' fixo e o lote vai no fim: nenhum separador, so o do inicio.**
        assertEquals(1, Gs1_128.gs1_128("(01)04012345678901").separadores());
        assertEquals(1, Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1").separadores());

        // **Com um campo no meio, ha um separador a mais.** A regra "menos no
        // ultimo" e' da propria GS1: um separador no fim nao separa de nada, e o
        // leitor conta-o como parte do campo seguinte.
        assertEquals(2, Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1(17)270630").separadores());
        assertEquals(2, Gs1_128.gs1_128("(240)9501101530003(241)9501234567890").separadores());
    }

    @Test
    @DisplayName("o payload nao tem parenteses, e a legenda nao tem separador")
    void asDuasFormasNaoSeConfundem() {
        CodigoGs1 codigo = Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1(17)270630");

        // **Os parenteses vao para a legenda e nao para o payload.** E' a confusao
        // que custou o primeiro encoder: em `(10)LOTE-A1` os parenteses sao para quem
        // le, e nao vao para o codigo — mas os **digitos do AI vao**.
        assertTrue(codigo.payload().indexOf('(') < 0, "o payload nao tem parenteses");
        assertTrue(codigo.payload().indexOf(Gs1_128.GS) >= 0, "o payload tem o separador");

        // **E o separador nao vao para a legenda.** A GS1 pede que a linha impressa
        // tenha os AIs entre parenteses e nenhum separador.
        assertTrue(codigo.legenda().indexOf(Gs1_128.GS) < 0, "a legenda nao tem separador");
        assertEquals("(01)04012345678901(10)LOTE-A1(17)270630", codigo.legenda());

        // E `gs1` e `legenda` sao a mesma cadeia: nao e' redundancia, e' o nome da
        // notacao e o nome do campo que o desenho imprime.
        assertEquals(codigo.legenda(), codigo.gs1());
    }

    @Test
    @DisplayName("os digitos do AI vao no codigo de barras")
    void osDigitosDoAiVaoNoCodigo() {
        /*
         * **Os digitos do AI vao no codigo de barras, sem parenteses.**
         *
         * A primeira versao emitia so `campo.valor` e o AI ficava de fora, por causa
         * de uma confusao entre a forma humana e a de maquina. O resultado eram 17
         * codewords em vez de 20, o ZXing nao lia nada, e a razao nao era visivel no
         * codigo: um GS1-128 sem os AIs e' a mesma coisa que uma etiqueta sem dizer o
         * que e' que ela e'.
         */
        CodigoGs1 codigo = Gs1_128.gs1_128("(01)04012345678901(10)LOTE-A1");

        assertTrue(codigo.payload().startsWith("0104012345678901"),
                "o payload tem de comecar pelos digitos do AI");
        assertTrue(codigo.payload().contains("10LOTE-A1"), "o payload tem de ter o AI do lote");
    }

    // --- o `resto` do AI -------------------------------------------------------

    @Test
    @DisplayName("o resto do AI vai para o valor, e nao para o AI")
    void oRestoVaiParaOValor() {
        /*
         * **Num `3103` o ultimo digito e' a posicao decimal implicita** e faz parte
         * do peso. Um `aiDe` que devolvesse o `31` com o `03` como resto dava o peso
         * errado, e o ZXing le os dois sem distinguir.
         */
        CodigoGs1.Campo campo = Gs1_128.gs1_128("(3103)000750").campos().get(0);

        assertEquals("3103", campo.ai());
        assertEquals("000750", campo.conteudo());
        assertEquals("000750", campo.valor());
    }

    @Test
    @DisplayName("o ramo do resto, com uma tabela que o tenha")
    void oRamoDoRestoComUmaTabelaQueOPossa() {
        /*
         * **Nenhum AI e' prefixo de outro na GS1 hoje**, e o
         * `gs1-tabelas-paridade.test.mjs` confirma isso — por isso que `resto` nunca
         * e' preenchido por um AI real e o ramo nao tem caso na tabela.
         */
        var achado = com.qrcodegen.core.simbologias.TabelasGs1.aiDe("3103");

        assertNotEquals(null, achado);
        assertEquals("3103", achado.numero());
        assertEquals(null, achado.resto());
    }

    @Test
    @DisplayName("o ramo do resto, com uma tabela que o tenha")
    void oRamoDoRestoComOaiInjetado() {
        /*
         * **O `AIS` e' um `Map.ofEntries` e nao se altera.** A primeira versao deste
         * teste fazia `AIS.remove("3103")` e `AIS.put("31", ...)`, e o `remove` dava
         * `UnsupportedOperationException` — que e' a resposta certa de um mapa
         * imutavel.
         *
         * **E nao se vira a tabela mutavel por causa de um teste.** Seria tornar o
         * encoder pior para o unico uso que nao existe. A correccao e' dar ao `aiDe`
         * uma sobrecarga que recebe a tabela, que e' uma decomposicao a serio: a
         * procura nao tem razao para depender do global.
         */
        var entrada = new com.qrcodegen.core.simbologias.TabelasGs1.Ai(
                "31", "N2+N6", 6, null,
                java.util.List.of(
                        new com.qrcodegen.core.simbologias.TabelasGs1.Componente("N", 6, null)),
                false, "(\\d{6})", null);

        var tabela = new java.util.LinkedHashMap<String, com.qrcodegen.core.simbologias.TabelasGs1.Ai>();
        tabela.put("31", entrada);

        // **O AI e' o `31`, que e' o que existe na tabela, e o resto vai no valor.**
        var achado = com.qrcodegen.core.simbologias.TabelasGs1.aiDe("3103", tabela);

        assertNotEquals(null, achado);
        assertEquals("31", achado.numero());
        assertEquals("03", achado.resto());
    }

    @Test
    @DisplayName("um AI de varios componentes aceita o valor no maximo")
    void umAiDeVariosComponentesAceitaOValorNoMaximo() {
        for (String ai : new String[] {"253", "421", "8008", "3910", "7030"}) {
            var entrada = com.qrcodegen.core.simbologias.TabelasGs1.AIS.get(ai);
            Integer maximo = Gs1_128.comprimentoTotal(entrada);

            assertNotEquals(null, maximo, "o AI " + ai + " devia ter um maximo");

            String valor = valorNoMaximo(entrada, maximo.intValue());

            CodigoGs1 codigo = Gs1_128.gs1_128("(" + ai + ")" + valor);

            assertEquals(ai + valor, codigo.payload(),
                    "o AI " + ai + " devia aceitar " + maximo + " caracteres");

            // E um a mais recusa, com o comprimento na mensagem.
            SimbologiaException erro = assertThrows(SimbologiaException.class,
                    () -> Gs1_128.gs1_128("(" + ai + ")" + valor + "0"),
                    "o AI " + ai + " devia recusar um caracter a mais");

            assertTrue(erro.getMessage().contains(String.valueOf(maximo.intValue() + 1)),
                    "a mensagem tem de dizer o comprimento que foi escrito: "
                            + erro.getMessage());
        }
    }

    /**
     * Um valor de exactamente {@code maximo} caracteres que o {@code regex} do AI
     * aceita.
     *
     * <p><strong>Um valor repetido pode nao caber no {@code regex}.</strong> O
     * {@code 3910} e' {@code N4+N3+N..15} e o {@code regex} e'
     * {@code (\d{3})(\d{1,15})}: os tres digitos do meio e ate quinze a seguir.
     * Dezassete digitos cabem, dezoito nao.
     *
     * <p>Por isso que o valor se faz por tentativas, e nao com uma conta: **o
     * comprimento e' o que o teste quer medir, e o {@code regex} e' o que tem de
     * deixar passar.** Uma conta que acertasse o comprimento mas falhasse o
     * {@code regex} dava uma recusa que parecia um bug do {@code maximo}.
     */
    private static String valorNoMaximo(
            com.qrcodegen.core.simbologias.TabelasGs1.Ai entrada, int maximo) {
        var padrao = java.util.regex.Pattern.compile(entrada.regex());

        /*
         * As sementes, e **porque ha uma com forma de data**.
         *
         * O `8008` e' `YYMMDDHH` mais minutos e segundos opcionais, e o `regex` e'
         * `(\d{2}(?:0\d|1[0-2])(?:[0-2]\d|3[01])(?:[01]\d|2[0-3]))(...)`. A
         * semente `010101000000` da um mes `01`, um dia `01` e uma hora `01`, e casa.
         * **`1234567890` nunca casa**, porque `34` nao e' um mes nem um dia — e um
         * gerador de valores que so sabe fazer digitos falha nos AIs que tem uma
         * forma, que e' o que a `AGENTS.md` chama um ramo sem caso.
         *
         * Os digitos vem primeiro porque `X` tambem aceita digitos: o `regex` da GS1
         * usa `[!%-?]`, que vai de `0x21` a `0x3F` e por isso engloba os dez digitos.
         */
        for (String modelo : new String[] {
                "1234567890", "010101000000", "01", "A", "ABCDEFGHIJ",
        }) {
            StringBuilder valor = new StringBuilder();
            while (valor.length() < maximo) {
                valor.append(modelo.charAt(valor.length() % modelo.length()));
            }
            if (padrao.matcher(valor.toString()).matches()) {
                return valor.toString();
            }
        }

        throw new AssertionError("nao se encontrou um valor de " + maximo
                + " caracteres que o regex do aceite: " + entrada.regex());
    }

    // --- as recusas ------------------------------------------------------------

    // **O nome leva o indice, e nao o texto.** O caso do texto vazio produz
    // um `{0}` em branco, e o JUnit recusa um nome de exibicao vazio com
    // `displayName must not be null or blank` — que e' uma falha de nome de
    // teste e nao uma falha do GS1.
    @ParameterizedTest(name = "recusa {index}: {0}")
    @MethodSource("recusas")
    @DisplayName("cada recusa diz porque")
    void cadaRecusaDizPorque(String texto, String palavra) {
        /*
         * **`assertThrows` sem mais passa com qualquer excecao**, incluindo uma que nao
         * seja a do encoder. A palavra na mensagem e' o que diz que foi a validacao do
         * AI a recusar e nao outra coisa.
         */
        SimbologiaException erro = assertThrows(SimbologiaException.class,
                () -> Gs1_128.gs1_128(texto));

        assertTrue(erro.getMessage().contains(palavra),
                "a mensagem \"" + erro.getMessage() + "\" nao tem \"" + palavra + "\"");
    }

    @Test
    @DisplayName("o comprimento fixo e' conferido, com os dois numeros")
    void oComprimentoFixoEConferido() {
        /*
         * **Uma recusa sem numeros e' uma recusa com que ninguem consegue corrigir o
         * campo.** O `regex` sozinho recusava, mas dizia "nao corresponde ao que a GS1
         * define", que e' verdade e nao ajuda ninguem: o utilizador tem um campo de
         * catorze e nao sabe qual.
         */
        SimbologiaException erro = assertThrows(SimbologiaException.class,
                () -> Gs1_128.gs1_128("(01)9501101530003"));

        String mensagem = erro.getMessage();

        assertTrue(mensagem.contains("14"), "a mensagem tem de dizer o que o AI quer: " + mensagem);
        assertTrue(mensagem.contains("13"), "a mensagem tem de dizer o que foi escrito: " + mensagem);
    }

    // --- o registo --------------------------------------------------------------

    @Test
    @DisplayName("o GS1-128 e' um codigo de barras, e tem o desenho do Code 128")
    void eUmCodigoDeBarras() {
        /*
         * **Um GS1-128 nao tem desenho proprio**: tem o desenho do Code 128 com mais
         * uns codewords. E a razao de `codigo()` existir — e de ser uma convenience e
         * nao o formato do codigo, que e' a razao de `modulos()` ser o campo.
         */
        CodigoGs1 gs1 = Gs1_128.gs1_128("(10)LOTE-A1");
        var codigo = gs1.codigo();

        assertEquals("GS1-128", codigo.simbologia());
        assertEquals(gs1.legenda(), codigo.legenda());
        assertEquals(0, codigo.guardas().length,
                "o GS1-128 nao tem guardas, como o Code 128");

        // **E o Code 128 do mesmo texto, forcado ao conjunto B, tem onze modulos
        // menos** — que e' um codeword, o do FNC1 do inicio. O `code128()` escolhe o
        // conjunto e faz as comutacoes; o GS1-128 fica sempre no B.
        var forcado = com.qrcodegen.core.simbologias.Code128.code128("10LOTE-A1", 2);

        assertEquals(11, gs1.modulos().length - forcado.modulos().length);
    }

    // --- a leitura -------------------------------------------------------------

    /**
     * O identificador de simbologia, como {@code ]C1} ou {@code ]C0}.
     *
     * <p><strong>E' um metodo proprio porque o acesso e' aonde a diferenca esta'.</strong>
     * O ZXing em Java expoe-o pelo {@code getResultMetadata()}, e o {@code zxingcpp}
     * por um metodo com nome proprio. **Um {@code }C0} quando nao devia, ou um
     * {@code null} quando o leitor nao disse nada, sao coisas diferentes e o teste
     * tem de as distinguir**: um {@code null} e' um leitor que nao reconheceu o FNC1,
     * que e' o mesmo que um {@code ]C0} para o que interessa aqui.
     */
    private static String identificador(Result resultado) {
        Object valor = resultado.getResultMetadata()
                .get(ResultMetadataType.SYMBOLOGY_IDENTIFIER);

        return valor == null ? "<nenhum>" : valor.toString();
    }

    /**
     * Desenho o codigo de barras e le-o com o ZXing.
     *
     * <p><strong>O fundo branco e' o explicitado.</strong> Um {@code TYPE_INT_RGB} novo
     * e' preto, e barras pretas sobre preto nao se leem.
     */
    private static Result descodificar(CodigoGs1 codigo) {
        boolean[] modulos = codigo.modulos();
        int largura = (modulos.length + ZONA_MUDA * 2) * ESCALA;
        int altura = ALTURA * ESCALA;

        BufferedImage imagem = new BufferedImage(largura, altura, BufferedImage.TYPE_INT_RGB);

        for (int x = 0; x < largura; x++) {
            for (int y = 0; y < altura; y++) {
                imagem.setRGB(x, y, 0xFFFFFFFF);
            }
        }

        for (int i = 0; i < modulos.length; i++) {
            if (!modulos[i]) {
                continue;
            }
            int x0 = (i + ZONA_MUDA) * ESCALA;
            for (int dx = 0; dx < ESCALA; dx++) {
                for (int dy = 0; dy < altura; dy++) {
                    imagem.setRGB(x0 + dx, dy, 0xFF000000);
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
            throw new AssertionError("Falha ao descodificar com o ZXing: " + e.getMessage(), e);
        }
    }
}
