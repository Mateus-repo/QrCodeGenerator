package com.qrcodegen.core.simbologias;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A colocacao dos codewords, chamada directamente.
 *
 * <p><strong>E' uma classe no mesmo pacote, e nao mais um teste no
 * {@code DataMatrixTestes}.</strong> {@link DataMatrix#colocar} e'
 * package-private porque nao e' API, e um teste noutro pacote teria de passar
 * pelo encoder inteiro — o que nao serviria, porque a razao deste teste e'
 * <em>medir a regiao antes de as guias a copiarem</em>.
 *
 * <h2>O que nao se consegue medir de fora</h2>
 *
 * <p>O bloco que poe o <strong>canto de baixo a direita</strong> só corre quando
 * a varredura o deixou por preencher, e isso acontece em quatro dos vinte e quatro
 * simbolos. Pela grelha final <strong>nao se sabe se ele correu</strong>: com o
 * bloco desligado o canto fica a menos dois modulos preenchidos, o que tambem
 * acontece — ou nao — conforme o valor dos codewords. So a regiao nua responde.
 *
 * <p>E o indice desse bloco foi <strong>o bug que o Python encontrou no
 * web</strong>: era {@code linhas * colunas + colunas - 1}, que e'
 * {@code colunas - 1} posicoes a mais. Em JavaScript um array tipado fora do fim
 * da {@code undefined}, e {@code undefined < 0} e' falso, portanto <em>o bloco
 * nunca corria</em> e o encoder desenhava o codigo certo na mesma. Em Java o mesmo
 * indice dava {@code ArrayIndexOutOfBounds}, e foi ai que apareceu.
 */
@DisplayName("A colocacao dos codewords, antes das guias")
class ColocacaoDataMatrixTestes {

    @Test
    @DisplayName("o canto de baixo a direita e posto, e sao os dois modulos do ZXing")
    void oCantoEstaPosto() {
        // **O 16x16 e' um dos simbolos em que a varredura deixa o canto por
        // preencher**, e `MAST-2024-0001` e' o payload que chega a ele. Com o
        // bloco desligado estes dois modulos ficam a menos, e o codigo le-se na
        // mesma — que e' o que fez do bug um bug invisivel.
        int[][] preparado = regiaoDe("MAST-2024-0001");
        int lado = preparado[1][0];

        assertEquals(14, lado,
                "o MAST-2024-0001 vai num simbolo de regiao 14x14");

        int[] regiao = DataMatrix.colocar(preparado[0], lado, lado);

        assertTrue(regiao[(lado - 1) * lado + (lado - 1)] != -1,
                "o canto de baixo a direita ficou por preencher: o bloco que o "
                        + "posta nao corre, e o codigo le-se na mesma");
        assertTrue(regiao[(lado - 2) * lado + (lado - 2)] != -1,
                "e o da diagonal tambem");
    }

    @Test
    @DisplayName("em nenhum dos vinte e quatro simbolos fica um modulo por preencher")
    void naoFicaNadaPorPreencher() {
        // **Dois e nao zero, e e' o que o ZXing faz.** Numa regiao cuja area nao e'
        // um multiplo de oito sobra um par de modulos, e o canto e' a correccao
        // que a norma manda. A primeira versao deste teste afirmava `zero`, e
        // falhava — **o `-1` e' do ZXing e nao um erro**.
        //
        // **A propriedade que interessa e' que nunca ficam mais do que dois, e
        // que sao sempre os do canto.** Um `-1` a mais seria um modulo que
        // ninguem sabe quem poe.
        for (int[] simbolo : TabelasDataMatrix.SIMBOLOS) {
            // **O lado e' o da regiao de dados, e nao o campo `larguraDaRegiao`
            // da tabela.** Os dois sao numeros diferentes em quase todos os
            // simbolos: `larguraDaRegiao` e' a largura de *uma* regiao e a area de
            // dados e' `regioes * largura`. Com o campo da tabela, o simbolo de
            // seis regioes de cada lado dava uma regiao de 22x22 e a colocacao
            // pedia codewords a mais do que existem.
            DataMatrix.Geometria g = new DataMatrix.Geometria(simbolo);
            int[] codewords = new int[simbolo[0] + simbolo[1]];

            int[] regiao = DataMatrix.colocar(codewords, g.dadosColunas, g.dadosLinhas);

            // **O que se afirma nao e' que o canto fique escuro, e' que nunca
            // fiquem mais do que dois modulos por preencher e que sao os dois do
            // canto.** Nos simbolos em que a varredura chega ao canto, ele fica
            // com o valor do ultimo codeword — que num bloco de zeros e' zero, e
            // por isso que afirmar "o canto e' escuro" falhava em sete dos
            // vinte e quatro sem que houvesse bug nenhum.
            int fora = 0;
            for (int modulo : regiao) {
                if (modulo < 0) {
                    fora++;
                }
            }

            assertTrue(fora <= 2,
                    "o simbolo de " + g.colunas + "x" + g.linhas + " deixou " + fora
                            + " modulos por preencher, e no maximo dois");

            // **O canto nunca fica por preencher**, nos vinte e quatro: ou a
            // varredura chega a ele, ou o bloco poe-o. **E esta e' a afirmacao que
            // apanha o bloco desligado**, e e' a que a primeira versao fez ao
            // contrario — affirmando que ficava a menos, que e' o estado de antes
            // de uma coisa que o proprio metodo faz.
            int lado = g.dadosColunas;
            assertTrue(regiao[(lado - 1) * lado + (lado - 1)] != -1,
                    "o canto de baixo a direita do simbolo de " + g.colunas + "x" + g.linhas
                            + " ficou por preencher");
            assertTrue(regiao[(lado - 2) * lado + (lado - 2)] != -1,
                    "e o da diagonal tambem");
        }
    }

    @Test
    @DisplayName("a correccao de erros de um bloco sai invertida")
    void aCorreccaoSaiInvertida() {
        // **A inversao e' da tabela, nao uma escolha.** A tabela dos factores poe
        // o `x^(n-1)` no primeiro lugar e o ZXing inverte. Sem inverter a
        // correccao sai toda ao contrario, e o sintoma e' o pior: a primeira
        // linha bate certo e nenhuma le.
        //
        for (int[] factores : TabelasDataMatrix.FATORES) {
            int quantos = factores.length;

            // **Um bloco com contagens ascendentes, e nao um bloco de zeros.** Com
            // dez zeros a correccao sai **simetrica** — e o teste afirmava que nao
            // saia, e falhava por uma propriedade verdadeira do Reed-Solomon que
            // eu nao tinha verificado. **Um teste que falha por uma razao que o
            // encoder nao tem e' um teste que mede outra coisa.**
            int[] dados = new int[quantos];
            for (int i = 0; i < quantos; i++) {
                dados[i] = i + 1;
            }

            int[] correccao = DataMatrix.correccaoDeBloco(dados, quantos);

            assertEquals(quantos, correccao.length, "a correccao tem o tamanho pedido");

            int escuros = 0;
            for (int valor : correccao) {
                if (valor != 0) {
                    escuros++;
                }
            }
            assertTrue(escuros > 0,
                    "a correccao de um bloco de contagens ascendingentes e' toda zero, "
                            + "com " + quantos + " factores: o laco nao correu");

            // **A correccao depende de onde cada codeword esta**, e e' isso que a
            // convencao do ECC200 codifica. Um bloco lido ao contrario tem de dar
            // outra correccao — e sem a inversao daria a mesma, porque a tabela dos
            // factores esta ao contrario de proposito.
            int[] invertido = new int[quantos];
            for (int i = 0; i < quantos; i++) {
                invertido[i] = dados[quantos - 1 - i];
            }

            boolean diferente = false;
            int[] correccaoInvertida = DataMatrix.correccaoDeBloco(invertido, quantos);
            for (int i = 0; i < quantos && !diferente; i++) {
                diferente = correccao[i] != correccaoInvertida[i];
            }

            assertTrue(diferente,
                    "a correccao de um bloco e' a mesma que a do bloco ao contrario, "
                            + "com " + quantos + " factores: a correccao nao depende da "
                            + "posicao dos codewords");
        }
    }

    /**
     * Os codewords de um texto, como o encoder os deixa antes da correccao.
     *
     * <p><strong>Sem a correccao de erros, e de proposito.</strong> A colocacao
     * so olha para o numero de codewords e para os seus valores; a correccao entra
     * depois. Um codigo de teste que passasse pela correccao mediria duas coisas
     * ao mesmo tempo, e a falha apontava para a correccao quando o problema era a
     * colocacao.
     *
     * <p>Devolve tambem o lado da regiao de dados, que e' uma propriedade do
     * simbolo escolhido e nao do texto.
     */
    private static int[][] regiaoDe(String texto) {
        int[] dados = DataMatrix.compactar(texto.getBytes(StandardCharsets.UTF_8));

        int[] simbolo = null;
        for (int[] s : TabelasDataMatrix.SIMBOLOS) {
            if (dados.length <= s[0]) {
                simbolo = s;
                break;
            }
        }
        assertTrue(simbolo != null, "nenhum simbolo leva " + dados.length + " codewords");

        return new int[][] {
            DataMatrix.encher(dados, simbolo[0] + simbolo[1]),
            {new DataMatrix.Geometria(simbolo).dadosColunas}
        };
    }
}
