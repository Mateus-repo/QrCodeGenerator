package com.qrcodegen.tools;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.qrcodegen.core.simbologias.CodigoGs1;
import com.qrcodegen.core.simbologias.Gs1_128;
import com.qrcodegen.core.simbologias.SimbologiaException;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * A ponta de Java da comparacao do GS1-128, e a saida em JSON.
 *
 * <p>Existe para o {@code spec/paridade-gs1-java.mjs}, que decide se o Java e o
 * Python produzem a mesma coisa. O comprimento e' igual e a silhueta pode estar errada,
 * e so a comparacao modulo a modulo as distingue.
 *
 * <p><strong>E' uma ponta a parte, e nao mais um {@code case} no
 * {@code ParidadeLineares}, porque o GS1-128 devolve tres textos.</strong> O
 * {@code CodigoDeBarras} tem {@code legenda} e mais nada, e o GS1-128 tem
 * {@code payload}, {@code gs1} e {@code legenda} — tres representacoes do mesmo
 * codigo, que o ZXing devolve em tres sitios diferentes. Encaixar o GS1-128 naquele
 * {@code switch} obrigava a perder dois dos tres, e a perder era o
 * {@code KeyError}.
 *
 * <p><strong>E' a segunda ponta a parte, e o mesmo motivo que o
 * {@code ParidadeDataMatrix}.</strong> O {@code AGENTS.md} manda que os 2D nao se
 * misturem com os 1D porque o teste passa a medir outra coisa; aqui e' o mesmo
 * por outra razao — a forma do resultado e' diferente e um {@code switch} com um
 * {@code return} so aceitaria um.
 *
 * <p><strong>E' uma ferramenta de verificacao, nao parte da app.</strong> Vive em
 * {@code tools/} e nao no core, pela razao que o {@code ParidadeLineares} diz.
 *
 * <h2>O que nao faz</h2>
 *
 * <p>Nao manda o ZXing ler. O ZXing le a matriz e a matriz e' o que se compara aqui.
 */
public final class ParidadeGs1 {

    private ParidadeGs1() {
    }

    public static void main(String[] args) throws Exception {
        String entrada = args.length > 0
                ? String.join(" ", args)
                : new String(System.in.readAllBytes(), StandardCharsets.UTF_8);

        JsonArray casos = JsonParser.parseString(entrada).getAsJsonArray();
        JsonArray saida = new JsonArray();

        for (JsonElement elemento : casos) {
            saida.add(descrever(elemento.getAsJsonArray()));
        }

        PrintStream stdout = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        stdout.println(saida);
    }

    /**
     * Um caso e' {@code [texto]}, e a saida tem o que der ou {@code erro}.
     *
     * <p><strong>Uma recusa e' um resultado, e nao uma excepcao.</strong> A primeira
     * versao deixava a excepcao sair, e o script via um {@code stack trace} em vez de
     * um caso — o que dava uma falha que nao dizia qual dos dois encoder recusou.
     */
    private static JsonObject descrever(JsonArray caso) {
        String texto = caso.get(0).getAsString();

        JsonObject saida = new JsonObject();
        saida.addProperty("texto", texto);

        CodigoGs1 codigo;
        try {
            codigo = Gs1_128.gs1_128(texto);
        } catch (SimbologiaException e) {
            saida.addProperty("erro", e.getMessage());
            return saida;
        }

        JsonArray modulos = new JsonArray();
        for (boolean modulo : codigo.modulos()) {
            // **Os modulos saem como 0 e 1, e nao como `true` e `false`.** O script
            // compara posicao a posicao, e um `true` onde se espera um `1` contaria
            // como divergencia num codigo que esta certo.
            modulos.add(modulo ? 1 : 0);
        }

        saida.add("modulos", modulos);
        saida.addProperty("separadores", codigo.separadores());
        saida.addProperty("payload", codigo.payload());
        saida.addProperty("gs1", codigo.gs1());
        saida.addProperty("legenda", codigo.legenda());

        JsonArray campos = new JsonArray();
        for (CodigoGs1.Campo campo : codigo.campos()) {
            JsonObject um = new JsonObject();
            um.addProperty("ai", campo.ai());
            um.addProperty("valor", campo.valor());
            um.addProperty("conteudo", campo.conteudo());
            um.addProperty("separador", campo.separador());
            campos.add(um);
        }
        saida.add("campos", campos);

        return saida;
    }
}