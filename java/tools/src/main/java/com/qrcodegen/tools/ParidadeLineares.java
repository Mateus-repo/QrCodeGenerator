package com.qrcodegen.tools;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.qrcodegen.core.simbologias.Code93;
import com.qrcodegen.core.simbologias.CodigoDeBarras;
import com.qrcodegen.core.simbologias.Code128;
import com.qrcodegen.core.simbologias.Lineares;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Le uma lista de casos de codigos de barras e escreve os modulos em JSON.
 *
 * <p>Existe para o {@code spec/paridade-java.mjs}: e' a ponta de Java da
 * comparacao que decide se o Java e o Python produzem a mesma coisa. O
 * comprimento e' igual e a silhueta esta errada, e so a comparacao dos
 * modulos as distingue.
 *
 * <p><strong>E' uma ferramenta de verificacao, nao parte da app.</strong> Por
 * isso vive em {@code tools/} e nao no core: a biblioteca nao ganha um
 * {@code main}, e a app grafica nao ganha uma opcao que so o teste usa.
 *
 * <p><strong>Por que o gson.</strong> E' uma dependencia que o projeto ja
 * tem, pelo ZXing. Um parser de JSON escrito a mao seria um sitio novo para
 * haver bug dentro de uma ferramenta cuja funcao e dizer que nao ha bug.
 *
 * <h2>O que nao faz</h2>
 *
 * <p>Nao manda o ZXing ler o resultado. O ZXing le a matriz, e a matriz e' o
 * que se compara aqui; acrescentar a leitura seria verificar duas vezes a
 * mesma coisa e dar a ilusao de mais cobertura.
 */
public final class ParidadeLineares {

    private ParidadeLineares() {
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

    /** Um caso e' {@code [tipo, texto, {opcoes}]}, e o script monta-o assim. */
    private static JsonObject codigoDe(JsonArray caso) {
        String tipo = caso.get(0).getAsString();
        String texto = caso.get(1).getAsString();

        JsonObject opcoes = caso.size() > 2 && caso.get(2).isJsonObject()
                ? caso.get(2).getAsJsonObject()
                : new JsonObject();

        CodigoDeBarras codigo;
        switch (tipo) {
            case "code39" -> codigo = Lineares.code39(texto);
            case "itf" -> codigo = Lineares.itf(texto);
            case "itf14" -> codigo = Lineares.itf14(texto);
            case "codabar" -> codigo = Lineares.codabar(texto,
                    opcoes.has("inicio") ? opcoes.get("inicio").getAsString() : "A",
                    opcoes.has("paragem") ? opcoes.get("paragem").getAsString() : "A",
                    opcoes.has("largo") && opcoes.get("largo").getAsBoolean());
            case "code128" -> codigo = Code128.code128(texto);
            case "code93" -> codigo = Code93.code93(texto);
            default -> throw new IllegalArgumentException(
                    "tipo desconhecido: " + tipo);
        }

        return descrever(codigo);
    }

    /**
     * Passa um {@link CodigoDeBarras} para JSON.
     *
     * <p><strong>Os modulos saem como 0 e 1, e nao como {@code true} e
     * {@code false}.</strong> O Python devolve {@code bool} e o gson le um
     * {@code bool} de um numero, mas o outro sentido da uma lattice: o script
     * compara posicao a posicao e um {@code true} onde se espera um {@code 1}
     * contaria como divergencia num codigo que esta certo. Os dois lados
     *accordam em 0 e 1, que e' o unico valor que nao da duvida.
     */
    private static JsonObject descrever(CodigoDeBarras codigo) {
        JsonArray modulos = new JsonArray();
        for (boolean modulo : codigo.modulos()) {
            modulos.add(modulo ? 1 : 0);
        }

        JsonArray guardas = new JsonArray();
        for (int guarda : codigo.guardas()) {
            guardas.add(guarda);
        }

        JsonObject saida = new JsonObject();
        // `add`, e nao `addProperty`: so este aceita um JsonArray. A distincao
        // entre modulos (array) e legenda (texto) e' o que separa os dois.
        saida.add("modulos", modulos);
        saida.addProperty("legenda", codigo.legenda());
        saida.add("guardas", guardas);
        return saida;
    }
}
