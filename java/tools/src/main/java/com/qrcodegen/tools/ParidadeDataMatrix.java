package com.qrcodegen.tools;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.qrcodegen.core.simbologias.CodigoMatriz;
import com.qrcodegen.core.simbologias.DataMatrix;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Le uma lista de casos de Data Matrix e escreve as matrizes em JSON.
 *
 * <p>Existe para o {@code spec/paridade-java-datamatrix.mjs}: e' a ponta de Java
 * da comparacao que decide se o Java e o Python produzem a mesma grelha.
 *
 * <h2>Porque e' uma classe a parte do {@link ParidadeLineares}</h2>
 *
 * <p><strong>Porque um codigo 2D nao cabe no formato de um 1D.</strong> O
 * {@code ParidadeLineares} devolve {@code modulos} como uma lista plana, mais
 * {@code legenda} e {@code guardas} - e as duas ultimas nao existem num Data
 * Matrix: as guias em L ja estao na grelha e nao ha texto impresso por baixo.
 *
 * <p>Encaixar o 2D nesse formato dava duas opcoes, e as duas sao ruins: meter
 * {@code legenda} e {@code guardas} a vazio, e o script passava a comparar
 * campos que nao medem nada; ou achatar a matriz numa lista e perder a
 * informacao de onde muda a linha. <strong>Um formato que nao descreve a coisa
 * faz o teste medir outra coisa</strong> - que e' o que a {@code AGENTS.md} regista
 * com o {@code ComboBox} do C#.
 *
 * <h2>O que nao faz</h2>
 *
 * <p>Nao manda o ZXing ler o resultado. O ZXing le a matriz, e a matriz e' o que
 * se compara aqui; acrescentar a leitura seria verificar duas vezes a mesma coisa
 * e dar a ilusao de mais cobertura. A leitura vive nos testes do core, onde o
 * Java desenha e o ZXing le.
 *
 * <p><strong>E' uma ferramenta de verificacao, nao parte da app.</strong> Por
 * isso vive em {@code tools/} e nao no core: a biblioteca nao ganha um
 * {@code main}, e a app grafica nao ganha uma opcao que so o teste usa.
 *
 * <p><strong>Por que o gson.</strong> E' uma dependencia que o projeto ja tem,
 * pelo ZXing. Um parser de JSON escrito a mao seria um sitio novo para haver bug
 * dentro de uma ferramenta cuja funcao e dizer que nao ha bug.
 */
public final class ParidadeDataMatrix {

    private ParidadeDataMatrix() {
    }

    public static void main(String[] args) throws Exception {
        // O script passa os casos como argumentos; sem argumentos, le de stdin,
        // que e' como se pode usar a mao.
        String entrada = args.length > 0
                ? String.join(" ", args)
                : new String(System.in.readAllBytes(), StandardCharsets.UTF_8);

        JsonArray casos = JsonParser.parseString(entrada).getAsJsonArray();
        JsonArray saida = new JsonArray();

        for (JsonElement elemento : casos) {
            saida.add(codigoDe(elemento.getAsJsonArray()));
        }

        PrintStream stdout = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        stdout.println(saida);
    }

    /**
     * Um caso e' {@code [tipo, texto, {opcoes}]}, e o script monta-o assim.
     *
     * <p><strong>O {@code tipo} existe mesmo com so um Data Matrix.</strong> E' a
     * mesma forma que a lista partilhada usa para os 1D, e um dia entra aqui o
     * GS1 Data Matrix - que nao e' um encoder novo, e' o mesmo com uma lista de
     * codewords em vez de um texto.
     */
    private static JsonObject codigoDe(JsonArray caso) {
        String tipo = caso.get(0).getAsString();

        if ("datamatrix".equals(tipo)) {
            return descrever(DataMatrix.dataMatrix(caso.get(1).getAsString()));
        }
        if ("gs1-datamatrix".equals(tipo)) {
            return descreverComCodewords(caso);
        }

        throw new IllegalArgumentException("tipo desconhecido: " + tipo);
    }

    /** O GS1 entra pela lista de codewords, e nao pelo texto. */
    private static JsonObject descreverComCodewords(JsonArray caso) {
        JsonArray brutos = caso.get(2).getAsJsonObject().getAsJsonArray("codewords");
        int[] codewords = new int[brutos.size()];
        for (int i = 0; i < codewords.length; i++) {
            codewords[i] = brutos.get(i).getAsInt();
        }

        String nome = caso.get(2).getAsJsonObject().has("nome")
                ? caso.get(2).getAsJsonObject().get("nome").getAsString()
                : "GS1 Data Matrix";

        return descrever(DataMatrix.dataMatrixDeCodewords(codewords, nome));
    }

    /**
     * Passa um {@link CodigoMatriz} para JSON.
     *
     * <p><strong>Os modulos saem como 0 e 1, e nao como {@code true} e
     * {@code false}</strong>, pelo mesmo motivo que no {@code ParidadeLineares}:
     * o script compara posicao a posicao, e um {@code true} onde se espera um
     * {@code 1} contaria como divergencia num codigo que esta certo.
     *
     * <p><strong>A matriz sai como lista de linhas, e nao achatada.</strong> E o
     * que separa um {@code Datamatrix} de um {@code DataMatrix}: no achatado o
     * script nao sabe onde muda a linha, e uma divergencia dizia "o modulo 137"
     * em vez de dizer "(linha 8, modulo 9)" - que e' onde o problema esta'.
     */
    private static JsonObject descrever(CodigoMatriz codigo) {
        JsonArray linhas = new JsonArray();
        for (boolean[] linha : codigo.modulos()) {
            JsonArray modulos = new JsonArray();
            for (boolean modulo : linha) {
                modulos.add(modulo ? 1 : 0);
            }
            linhas.add(modulos);
        }

        JsonObject saida = new JsonObject();
        saida.add("modulos", linhas);
        saida.addProperty("colunas", codigo.colunas());
        saida.addProperty("linhas", codigo.linhas());
        saida.addProperty("dados", codigo.dados());
        saida.addProperty("correccao", codigo.correccao());
        saida.addProperty("usado", codigo.usado());
        return saida;
    }
}