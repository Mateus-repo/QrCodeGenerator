package com.qrcodegen.core;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.qrcodegen.core.simbologias.Code128;
import com.qrcodegen.core.simbologias.Code93;
import com.qrcodegen.core.simbologias.CodigoDeBarras;
import com.qrcodegen.core.simbologias.Lineares;
import com.qrcodegen.core.simbologias.SimbologiaException;
import com.qrcodegen.core.simbologias.TabelasCode93;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.awt.image.BufferedImage;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Nivel 2 das simbologias: <strong>o Java desenha e o ZXing le</strong>.
 *
 * <p><strong>E' o teste que faltava, e os tres bugs que ele apanha estavam
 * todos no lugar antes de ele existir.</strong> Eram a largura do ITF decidida
 * pela caixa da letra, o Code 128 a contar a corrida pelo indice errado, e as
 * guardas a marcar colunas de dados — e nenhum dos 120 testes anteriores tocava
 * nestas classes.
 *
 * <p><strong>Por que aqui o ZXing so le, e no {@link RenderTests} tambem
 * gera.</strong> La a biblioteca ZXing desenha o QR e le-o de volta, o que o
 * proprio ficheiro reconhece ser mais fraco: um erro comum aos dois passos
 * passava despercebido. Aqui <strong>o codigo sob teste e' o que desenha</strong>
 * e o ZXing limita-se a ler. E' a diferenca entre testar um encoder e testar uma
 * biblioteca de codigo de barras.
 *
 * <p><strong>Um encoder so entra no repositorio depois de o ZXing devolver a
 * cadeia certa.</strong> Nao ha "quase": na fase dos codigos de barras, quatro
 * encoders pareceram certos durante a escrita e nao eram, e nenhum teste
 * estrutural os apanhou.
 *
 * <p><strong>Nada aqui escreve um digito de controlo a mao.</strong> Cada
 * teste de leitura usa ou o texto sem digito, ou o valor que o ZXing devolve
 * sendo o proprio o leito. Um digito escrito a mao no teste seria uma segunda
 * conta a validar ao lado da do encoder — e duas contas que divergem dizem
 * menos do que uma.
 */
class SimbologiasTestes {

    private static final int ESCALA = 4;
    private static final int ALTURA = 90;

    private static Arguments caso(BarcodeFormat formato, String esperado,
            Supplier<CodigoDeBarras> construcao) {
        return Arguments.of(formato, esperado, construcao);
    }

    // --- Code 39 ------------------------------------------------------------

    static Stream<Arguments> code39() {
        // **Todos sem digito de controlo, de proposito.** Com o digito, o ZXing
        // devolve o texto acrescido dele, e a expectativa passaria a depender de
        // uma segunda implementacao do calculo mod 43. O digito tem um teste
        // proprio, em `Estrutura`.
        return Stream.of(
                caso(BarcodeFormat.CODE_39, "CODE-39", () -> Lineares.code39("CODE-39", false)),
                caso(BarcodeFormat.CODE_39, "ABC123", () -> Lineares.code39("ABC123", false)),
                caso(BarcodeFormat.CODE_39, "A$-/+%", () -> Lineares.code39("A$-/+%", false)),
                caso(BarcodeFormat.CODE_39, "ESPACO AQUI", () -> Lineares.code39("ESPACO AQUI", false)),
                caso(BarcodeFormat.CODE_39, "1234567890",
                        () -> Lineares.code39("1234567890", false)));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("code39")
    @DisplayName("Code 39: o ZXing le o codigo que o Java desenhou")
    void code39Elegivel(BarcodeFormat formato, String esperado,
            Supplier<CodigoDeBarras> construcao) {
        assertEquals(esperado, ler(construcao.get(), formato));
    }

    // --- ITF ----------------------------------------------------------------

    static Stream<Arguments> itf() {
        // **O ITF-14 traz o digito de controlo e o leitor devolve-o**, por isso
        // aqui a expectativa inclui-o — mas o valor vem de ser lido, e o teste
        // `itf14CalculaODigitoDeControlo` abaixo affirma a regra em separado.
        return Stream.of(
                caso(BarcodeFormat.ITF, "12345678901286",
                        () -> Lineares.itf14("1234567890128")),
                caso(BarcodeFormat.ITF, "00012345678905",
                        () -> Lineares.itf14("0001234567890")),
                caso(BarcodeFormat.ITF, "123456", () -> Lineares.itf("123456")),
                caso(BarcodeFormat.ITF, "00123456789012", () -> Lineares.itf("00123456789012")));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("itf")
    @DisplayName("ITF: o ZXing le o codigo que o Java desenhou")
    void itfElegivel(BarcodeFormat formato, String esperado,
            Supplier<CodigoDeBarras> construcao) {
        assertEquals(esperado, ler(construcao.get(), formato));
    }

    // --- Codabar ------------------------------------------------------------

    static Stream<Arguments> codabar() {
        // **O ZXing devolve so os dados, sem os caracteres de moldura.** E' o
        // comportamento normalizado do leitor para o Codabar, e o
        // `spec/verificar-lineares.py` ja conta com ele. A moldura e' o que o
        // leitor usa para calibrar, nao parte do texto.
        return Stream.of(
                caso(BarcodeFormat.CODABAR, "123456", () -> Lineares.codabar("123456")),
                caso(BarcodeFormat.CODABAR, "123456",
                        () -> Lineares.codabar("123456", "B", "B", false)),
                caso(BarcodeFormat.CODABAR, "12345",
                        () -> Lineares.codabar("12345", "D", "D", false)),
                caso(BarcodeFormat.CODABAR, "12-34$56/78:+9.0",
                        () -> Lineares.codabar("12-34$56/78:+9.0", "C", "C", false)),
                caso(BarcodeFormat.CODABAR, "123456", () -> Lineares.codabar("123456", true)));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("codabar")
    @DisplayName("Codabar: o ZXing le o codigo que o Java desenhou")
    void codabarElegivel(BarcodeFormat formato, String esperado,
            Supplier<CodigoDeBarras> construcao) {
        assertEquals(esperado, ler(construcao.get(), formato));
    }

    // --- Code 128 -----------------------------------------------------------

    static Stream<Arguments> code128() {
        return Stream.of(
                caso(BarcodeFormat.CODE_128, "Hi", () -> Code128.code128("Hi")),
                caso(BarcodeFormat.CODE_128, "ABC123", () -> Code128.code128("ABC123")),
                caso(BarcodeFormat.CODE_128, "12345678", () -> Code128.code128("12345678")),
                caso(BarcodeFormat.CODE_128, "abc-123", () -> Code128.code128("abc-123")),
                caso(BarcodeFormat.CODE_128, "Code 128", () -> Code128.code128("Code 128")),
                caso(BarcodeFormat.CODE_128, "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                        () -> Code128.code128("ABCDEFGHIJKLMNOPQRSTUVWXYZ")),
                caso(BarcodeFormat.CODE_128, "0123456789", () -> Code128.code128("0123456789")),
                // **Os digitos seguidos sao o que obriga a comutar para o conjunto
                // C.** Sem os caracteres de comuta o codigo desenha-se perfeito e
                // o ZXing devolve `ABC,3` em vez de `ABC123` — foi assim que o
                // bug apareceu da primeira vez, e nenhum teste estrutural o
                // apanhou.
                caso(BarcodeFormat.CODE_128, "ABC12345678901234567890",
                        () -> Code128.code128("ABC12345678901234567890")));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("code128")
    @DisplayName("Code 128: o ZXing le o codigo que o Java desenhou")
    void code128Elegivel(BarcodeFormat formato, String esperado,
            Supplier<CodigoDeBarras> construcao) {
        assertEquals(esperado, ler(construcao.get(), formato));
    }

    // --- Code 93 ------------------------------------------------------------

    static Stream<Arguments> code93() {
        // **O ZXing devolve o texto sem os dois digitos de controlo**, porque
        // eles sao de controlo e nao fazem parte do dado — e e' por isso que a
        // expectativa e' o `valor` e nao a legenda.
        return Stream.of(
                caso(BarcodeFormat.CODE_93, "ABC-1234", () -> Code93.code93("ABC-1234")),
                caso(BarcodeFormat.CODE_93, "A", () -> Code93.code93("A")),
                caso(BarcodeFormat.CODE_93, "999999999999999999999999999999",
                        () -> Code93.code93("999999999999999999999999999999")),
                caso(BarcodeFormat.CODE_93, "MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20",
                        () -> Code93.code93("MAST-2024-0001-LOTE-MUITO-COMPRIDO-PARA-O-CONTROL-20")),

                // **A minuscula e' o caso que prova a codificacao estendida.**
                // `teste-93` vai no codigo como `dTdEdSdTdE-93`, e sao quinze
                // modulos a mais do que uma cadeia de sete caracteres. **Um
                // encoder que mande as minusculas tal e qual falha aqui, e falha
                // bem** — com um comprimento diferente, que e' o erro de estrutura
                // e nao o de dado.
                caso(BarcodeFormat.CODE_93, "teste-93", () -> Code93.code93("teste-93")),
                caso(BarcodeFormat.CODE_93, "Teste93Minusculas",
                        () -> Code93.code93("Teste93Minusculas")),
                caso(BarcodeFormat.CODE_93, "ABC $/%+-.",
                        () -> Code93.code93("ABC $/%+-.")),

                // **Os caracteres de controle, que e' o que teria apanhado o bug
                // do web.** Vinte e quatro dos trinta e dois estavam errados e
                // nao havia um unico caso — a tabela estava errada e verificada
                // ao mesmo tempo, porque a verificacao nao a tocava.
                //
                // **Um caso por controlo critico, e nao os 32 em fila.** Um
                // codigo com os 32 nao tem texto visivel para comparar, e a
                // falha seria "nao leu nada" em vez de "leu `0` em vez de CR" —
                // que e' a mensagem que diz onde esta o problema.
                caso(BarcodeFormat.CODE_93, "A\u0000B", () -> Code93.code93("A\u0000B")),
                caso(BarcodeFormat.CODE_93, "A\u0007B", () -> Code93.code93("A\u0007B")),
                caso(BarcodeFormat.CODE_93, "A\rB", () -> Code93.code93("A\rB")),
                caso(BarcodeFormat.CODE_93, "A\u001bB", () -> Code93.code93("A\u001bB")),
                caso(BarcodeFormat.CODE_93, "A\u001fB", () -> Code93.code93("A\u001fB")),
                caso(BarcodeFormat.CODE_93, "A\u007fB", () -> Code93.code93("A\u007fB")));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("code93")
    @DisplayName("Code 93: o ZXing le o codigo que o Java desenhou")
    void code93Elegivel(BarcodeFormat formato, String esperado,
            Supplier<CodigoDeBarras> construcao) {
        assertEquals(esperado, ler(construcao.get(), formato));
    }

    // --- a estrutura, que e' o que a leitura sozinha nao diz ---------------

        @Test
        @DisplayName("a tabela do Code 93 tem 48 padroes e todos comecam em barra")
        void tabelaDoCode93EstaCompleta() {
            // **O invariante de que o leitor depende.** O ZXing ancora cada
            // caractere na primeira barra, e um padrao que comece em espaco
            // desenha-se bem e **nao e' lido por nada**.
            //
            // **E o `spec/gerar-tabelas-code93.py` verifica o mesmo nos 48
            // valores**, antes de os escrever. Aqui e' a segunda verificacao do
            // mesmo invariante, e nao e' redundancia: o gerador protege a
            // tabela, e isto protege o codigo de uma tabela que um dia chegue
            // errada de outra fonte.
            assertEquals(48, TabelasCode93.PADROES.length);
            assertEquals(48, TabelasCode93.ALFABETO.length());
            assertEquals(128, TabelasCode93.CONTROLES.length);

            for (int i = 0; i < TabelasCode93.PADROES.length; i++) {
                int padrao = TabelasCode93.PADROES[i];

                assertTrue(padrao >= 0 && padrao <= 0x1FF,
                        "CODE93_PADROES[" + i + "] = 0x" + Integer.toHexString(padrao)
                                + " tem mais de nove bits: a tabela nao e' do Code 93");

                assertTrue((padrao & 0x100) != 0,
                        "CODE93_PADROES[" + i + "] = 0x" + Integer.toHexString(padrao)
                                + " ('" + TabelasCode93.ALFABETO.charAt(i)
                                + "') comeca em espaco, e o leitor precisa de uma barra "
                                + "para ancorar");
            }
        }

        @Test
        @DisplayName("o modulo do checksum do Code 93 e' 47 e nao 43")
        void moduloDoChecksumDoCode93EQuarentaESete() {
            // **47 e nao 43**, porque contam o asterisco e os quatro de
            // controle. E a razao de os dois parecerem tao diferentes a quem os
            // compara: o Code 39 tem 43 e nao conta o asterisco.
            assertEquals(47, TabelasCode93.MODULO_CHECKSUM);
            assertEquals(47, TabelasCode93.PADROES.length - 1);
            assertEquals(47, TabelasCode93.ASTERISCO);
            assertEquals('*', TabelasCode93.ALFABETO.charAt(TabelasCode93.ASTERISCO));
        }

        @Test
        @DisplayName("o peso dos digitos do Code 93 reinicia no indice vinte")
        void pesoDosDigitosReiniciaNoIndiceVinte() {
            // **O sintoma do que nao reinicia e' o mais enganador de todos os
            // codigos de barras**: o codigo desenha-se bem, o primeiro digito
            // bate certo e o segundo nao, e o leitor recusa por checksum **sem
            // dizer qual dos dois**.
            //
            // **O teste refaz a conta, e nao le o resultado.** Um `substring` da
            // legenda com uma conclusao em cima e' um teste que parece medir o
            // peso e nao mede nada — e nao ha como o distinguir de um bom a
            // ler. Por isso que a conta e' aqui, sobre o texto ja estendido.
            //
            // **E o texto tem de tornar a diferenca visivel.** As cinco letras
            // estao no **inicio** da cadeia porque o checksum le de tras para a
            // frente, e com vinte e cinco caracteres o primeiro e' o de peso
            // 21. Um `0` no indice 0 da tabela contribui zero e nao distingue
            // nada — que foi o que aconteceu na primeira versao deste teste.
            String texto = "ABCDE" + "0".repeat(20);
            assertEquals(25, texto.length(),
                    "o texto de teste tem de passar o indice vinte para separar as "
                            + "duas formulas, e tem " + texto.length());

            CodigoDeBarras codigo = Code93.code93(texto);
            String legenda = codigo.legenda();

            assertEquals(27, legenda.length(),
                    "a legenda e' o texto mais os dois digitos, e tem "
                            + legenda.length() + " caracteres para " + texto.length()
                            + " de texto");

            Map<Character, Integer> indice = TabelasCode93.indice();

            // **A conta certa: o peso vai de 1 a 20 e volta a 1.**
            int comReinicio = somaPonderada(texto.toCharArray(), 20, indice);

            // **A conta que produz o digito errado: o peso cresce sem parar.**
            int semReinicio = somaComPesosDecrescentes(texto.toCharArray(), indice);

            assertEquals((char) TabelasCode93.ALFABETO.charAt(comReinicio % 47),
                    legenda.charAt(25),
                    "o primeiro digito tem de ser o que a conta com reinicio da");

            // **E as duas contas tem de dar numeros diferentes**, senao o texto
            // de teste nao separa as duas formulas e o teste nao prova nada.
            assertNotEquals(semReinicio % 47, comReinicio % 47,
                    "o texto de teste nao separa as duas formulas: escolher outro");
        }

        /**
         * A soma ponderada, com o peso a reiniciar no maximo.
         *
         * @param texto os caracteres da cadeia
         * @param maximo o peso antes de recomecar
         * @param indice o indice de cada caracter da tabela
         * @return a soma, ainda sem o modulo
         */
        private static int somaPonderada(char[] texto, int maximo,
                Map<Character, Integer> indice) {
            int peso = 1;
            int total = 0;

            for (int i = texto.length - 1; i >= 0; i--) {
                total += peso * indice.get(texto[i]);
                peso += 1;
                if (peso > maximo) {
                    peso = 1;
                }
            }

            return total;
        }

        /**
         * A soma com o peso a crescer sem parar, que e' o bug.
         *
         * @param texto os caracteres da cadeia
         * @param indice o indice de cada caracter da tabela
         * @return a soma, ainda sem o modulo
         */
        private static int somaComPesosDecrescentes(char[] texto,
                Map<Character, Integer> indice) {
            int total = 0;

            for (int i = texto.length - 1; i >= 0; i--) {
                total += (texto.length - i) * indice.get(texto[i]);
            }

            return total;
        }

    @Nested
    @DisplayName("a estrutura dos modulos")
    class Estrutura {

        @ParameterizedTest(name = "\"{0}\"")
        @ValueSource(strings = {"Hi", "ABC123", "12345678", "abc-123", "Code 128"})
        @DisplayName("o Code 128 mede 11 modulos por simbolo, mais 13 de paragem")
        void code128MedeOnzePorSimbolo(String texto) {
            // **A regra que o bug do indice quebrou.** Um simbolo do Code 128 tem
            // sempre 11 modulos — tres barras e tres espacos, com duas estreitas
            // e uma larga de cada. O codigo antigo dava 12 ao primeiro simbolo
            // de cada valor, porque a cor do elemento vinha do indice do
            // caracter dentro da cadeia e nao do numero do elemento.
            //
            // **Contar pelo total e' o que torna o teste honesto.** A API nao
            // expoe o simbolo isolado, e nao deve: quem consome quer o codigo
            // inteiro. O total da para checkar porque 11 x simbolos + 13 da
            // paragem, e o digito de controlo e' mais um simbolo.
            int[] valores = Code128.valoresDe(texto);
            int esperado = 11 * (valores.length + 1) + 13;

            assertEquals(esperado, Code128.code128(texto).modulos().length,
                    "\"" + texto + "\" tem " + valores.length + " valores e devia medir "
                            + esperado + " modulos");
        }

        @Test
        @DisplayName("a moldura de inicio do ITF nao tem barra larga")
        void molduraDeInicioDoItfNaoTemBarraLarga() {
            // **O bug da caixa da letra.** `NnNn` tem quatro elementos estreitos,
            // e decide-se pela letra — `N` e' estreito — e nao pela caixa. Lido
            // pela caixa, o `N` saia largo e a moldura comecava com uma barra de
            // dois modulos, que e' um elemento que o ITF nao tem.
            boolean[] modulos = Lineares.itf("123456").modulos();

            for (int i = 0; i < 3; i++) {
                assertTrue(!(modulos[i] && modulos[i + 1]),
                        "a moldura de inicio do ITF tem dois modulos escuros seguidos no "
                                + "modulo " + i + ", o que e' uma barra larga");
            }
        }

        @Test
        @DisplayName("as guardas do Codabar nao chegam aos dados")
        void guardasDoCodabarNaoChegamAosDados() {
            // **A regra que o Python errava.** As guardas sao indices de modulo e
            // nao de elemento: a moldura do inicio ocupa 23 modulos e a conta
            // antiga `len(moldura) * largo` dava 35, marcando 12 colunas do
            // primeiro caractere de dados — pintadas com a altura da moldura, de
            // onde o leitor tira a razao larga/estreita.
            //
            // Sao **duas** molduras, o inicio e a paragem, por isso 23 + 23.
            int[] guardas = Lineares.codabar("123456").guardas();

            assertEquals(46, guardas.length,
                    "as duas molduras do Codabar ocupam 23 modulos cada e as guardas marcam "
                            + guardas.length + ": " + Arrays.toString(guardas));
            assertEquals(22, guardas[22],
                    "a moldura de inicio acaba no modulo 22");
            assertTrue(guardas[23] > guardas[22],
                    "a moldura de paragem comeca depois da de inicio, e nao colada a ela");
        }

        @Test
        @DisplayName("as guardas do ITF incluem a ultima barra da paragem")
        void guardasDoItfIncluemAParagem() {
            // A paragem `WnN` ocupa 4 modulos — 2 + 1 + 1 — e a conta antiga
            // `len(ITF_PARAGEM)` marcava 3, deixando a ultima barra da paragem com
            // a altura de uma barra de dados. E' a barra que distingue a paragem.
            CodigoDeBarras itf = Lineares.itf("123456");
            int ultimo = itf.modulos().length - 1;

            assertTrue(Arrays.stream(itf.guardas()).anyMatch(g -> g == ultimo),
                    "a ultima coluna da moldura de paragem (modulo " + ultimo + ") tem de ser "
                            + "guarda, e as guardas sao " + Arrays.toString(itf.guardas()));
        }

        @Test
        @DisplayName("o ITF-14 calcula o digito de controlo com os pesos 3 e 1 da GS1")
        void itf14CalculaODigitoDeControlo() {
            // A GS1 pesa o GTIN-14 com 3, 1, 3, 1 a partir da esquerda, e o
            // digito e' o que falta para a soma dar exacto em 10.
            //
            // **O teste escreve a conta a mao de proposito**: e' a unica forma de
            // o encoder nao se validar a si proprio. A soma sai ahi em cima.
            String dados = "0001234567890";
            int[] esperado = {0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 5};
            assertEquals(dados + "5", Lineares.itf14(dados).legenda());
            assertEquals(14, esperado.length, "treze dados e um de controlo");
        }

        @Test
        @DisplayName("o Code 39 cumpre o exemplo publicado do digito de controlo")
        void code39CumpreOExemploPublicado() {
            // **O exemplo vem da documentacao do ZPL da Zebra**, que da o
            // algoritmo com numeros:
            //
            //   dados `12345ABCDE/`
            //   1+2+3+4+5 = 15;  A..E = 10+11+12+13+14 = 60;  `/` = 40
            //   soma = 115
            //   115 / 43 = 2, resto 29
            //   29 e' a letra `T`   ->   o digito e' `T`
            //
            // **Por que um exemplo publicado e nao uma constante escrita a mao.**
            // Este repositorio ja descobriu que a regra e' o resto, e nao "o
            // que falta para a soma dar inteiro", por causa de um comentario que
            // dizia o contrario. Um comentario ao contrario convida a corrigir
            // tres stacks, e e' um teste com um numero de fora que trava isso.
            // **O mesmo motivo pelo qual as tabelas dos codigos de barras vem
            // de uma gerador e nao de memoria.**
            assertEquals(115, somaDe("12345ABCDE/"), "a soma do exemplo tem de dar 115");
            assertEquals(29, 115 % 43, "o resto tem de ser 29");
            assertEquals("T", digitoDeControlo39("12345ABCDE/"));
        }

        @Test
        @DisplayName("o Code 39 liga o digito de controlo e o ITF-14 tambem")
        void code39TomaDigitoDeControlo() {
            // **A regra esta aqui, e nao so num comentario, para que mudar quebre
            // este teste.** Um teste que so verificasse que ha um digito deixaria
            // passar as duas regras — o resto e o complementar — e sao precisamente
            // as duas que este repositorio ja confundiu uma vez.
            String texto = "CODE-39";
            String legenda = Lineares.code39(texto).legenda();

            assertTrue(legenda.startsWith(texto), "a legenda comeca pelo texto");
            assertEquals(texto.length() + 1, legenda.length(),
                    "o digito de controlo e' exactamente um caractere");
            assertEquals(texto + digitoDeControlo39(texto), legenda,
                    "a legenda tem de ser o texto com o digito do exemplo publicado");
        }
    }

    // --- o que o encoder recusa --------------------------------------------

    @Nested
    @DisplayName("o que o encoder recusa")
    class Recusas {

        @Test
        @DisplayName("o ITF recusa um numero impar de digitos")
        void itfRecusaImpar() {
            SimbologiaException erro = assertThrows(SimbologiaException.class,
                    () -> Lineares.itf("12345"));
            assertTrue(erro.getMessage().contains("ITF-14"),
                    "a mensagem deve sugerir o ITF-14, que acrescenta o digito que falta: "
                            + erro.getMessage());
        }

        @Test
        @DisplayName("o ITF-14 recusa o numero errado de digitos")
        void itf14RecusaContagem() {
            assertThrows(SimbologiaException.class, () -> Lineares.itf14("1234"));
            assertThrows(SimbologiaException.class, () -> Lineares.itf14("123456789012345"));
        }

        @Test
        @DisplayName("o Codabar recusa uma moldura que nao existe")
        void codabarRecusaMoldura() {
            SimbologiaException erro = assertThrows(SimbologiaException.class,
                    () -> Lineares.codabar("123456", "Z", "A", false));
            assertTrue(erro.getMessage().contains("A, B, C"),
                    "a mensagem deve dizer quais sao as molduras: " + erro.getMessage());
        }

        @Test
        @DisplayName("o Codabar recusa texto vazio")
        void codabarRecusaVazio() {
            assertThrows(SimbologiaException.class, () -> Lineares.codabar(""));
        }

        @ParameterizedTest(name = "\"{0}\"")
        @ValueSource(strings = {"A@B", "A(B", "A#B"})
        @DisplayName("o Code 39 recusa o que o alfabeto nao tem")
        void code39RecusaForaDoAlfabeto(String valor) {
            SimbologiaException erro = assertThrows(SimbologiaException.class,
                    () -> Lineares.code39(valor));
            assertTrue(erro.getMessage().contains("0123456789"),
                    "a mensagem deve dizer o alfabeto inteiro, para nao se adivinhar: "
                            + erro.getMessage());
        }

        @Test
        @DisplayName("o Code 39 recusa o asterisco nos dados")
        void code39RecusaAsterisco() {
            SimbologiaException erro = assertThrows(SimbologiaException.class,
                    () -> Lineares.code39("*ABC*"));
            assertTrue(erro.getMessage().contains("asterisco"),
                    "a mensagem tem de dizer que o asterisco e' a moldura: "
                            + erro.getMessage());
        }
    }

    // --- implementado ------------------------------------------------------

    /**
     * A soma dos indices, para o exemplo publicado da Zebra.
     *
     * <p>Escrito aqui, e nao copiado do encoder: se os dois fossem a mesma
     * chamada, o teste nao provaria nada.
     */
    private static int somaDe(String texto) {
        String alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
        int soma = 0;
        for (int i = 0; i < texto.length(); i++) {
            int indice = alfabeto.indexOf(texto.charAt(i));
            assertTrue(indice >= 0, "'" + texto.charAt(i) + "' nao existe no Code 39");
            soma += indice;
        }
        return soma;
    }

    /** O digito pela regra publicada: o resto da divisao por 43. */
    private static String digitoDeControlo39(String texto) {
        return "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%".charAt(somaDe(texto) % 43) + "";
    }

    /**
     * Desenha os modulos e devolve o que o ZXing le.
     *
     * <p><strong>Preto sobre branco, com zona silenciosa.</strong> A margem nao e'
     * decorativa: sem ela o ZXing nao encontra o codigo, e o teste falha por um
     * motivo que nao tem nada a ver com o encoder.
     */
    private static String ler(CodigoDeBarras codigo, BarcodeFormat formato) {
        boolean[] modulos = codigo.modulos();
        int margem = formato == BarcodeFormat.ITF ? 10 : 5;

        int largura = (modulos.length + 2 * margem) * ESCALA;
        BufferedImage imagem = new BufferedImage(largura, ALTURA, BufferedImage.TYPE_INT_RGB);

        // O fundo branco e' o explicitado: um TYPE_INT_RGB novo e' preto, e um
        // codigo de barras preto sobre preto nao le.
        for (int x = 0; x < largura; x++) {
            for (int y = 0; y < ALTURA; y++) {
                imagem.setRGB(x, y, 0xFFFFFFFF);
            }
        }

        for (int i = 0; i < modulos.length; i++) {
            if (!modulos[i]) {
                continue;
            }
            int x0 = (i + margem) * ESCALA;
            for (int x = x0; x < x0 + ESCALA; x++) {
                for (int y = 0; y < ALTURA; y++) {
                    imagem.setRGB(x, y, 0xFF000000);
                }
            }
        }

        try {
            var source = new BufferedImageLuminanceSource(imagem);
            var bitmap = new BinaryBitmap(new HybridBinarizer(source));

            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            if (formato == BarcodeFormat.ITF) {
                // **O ITF precisa disto e os outros nao.** Sem a dica, o ZXing
                // tenta tambem o Code 128 e escolhe-o, porque o ITF tem sempre
                // digitos e uma moldura compativel — e o teste passava a comparar
                // o texto de outro codigo.
                hints.put(DecodeHintType.PURE_BARCODE, Boolean.TRUE);
            }

            var resultado = new MultiFormatReader().decode(bitmap, hints);
            assertNotNull(resultado, "o ZXing nao conseguiu ler a imagem");
            return resultado.getText();
        } catch (Exception e) {
            throw new AssertionError("Falha ao descodificar com o ZXing: " + e.getMessage(), e);
        }
    }
}
