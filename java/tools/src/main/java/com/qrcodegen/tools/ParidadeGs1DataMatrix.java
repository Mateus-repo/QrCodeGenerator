package com.qrcodegen.tools;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.qrcodegen.core.simbologias.CodigoGs1;
import com.qrcodegen.core.simbologias.CodigoGs1Matriz;
import com.qrcodegen.core.simbologias.Gs1_DataMatrix;
import com.qrcodegen.core.simbologias.SimbologiaException;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * A ponta de Java da comparacao do **GS1 DataMatrix**, e a saida em JSON.
 *
 * <p>Corre com {@code ./build.sh run-gs1-datamatrix <casos-json>} e devolve JSON que o
 * {@code web/tests/paridade-gs1-datamatrix-java.py} compara com o Python.
 *
 * <h2>Porque e' uma ponta a parte e nao mais um caso no {@code run-linear}</h2>
 *
 * <p>O GS1 DataMatrix devolve uma **matriz** (o {@code modulos()} e' um array de
 * arrays) e nao uma lista de modulos, que e' a razao de ja existir um
 * {@code ParidadeDataMatrix} separado. E acresce que devolve **os codewords**, que o
 * {@code CodigoDeBarras} do GS1-128 nao tem — **e sao os codewords que sao a
 * comparacao que apanha**, porque um {@code 232} no sitio errado da o mesmo numero de
 * modulos e le-se com o campo partido.
 *
 * <p><strong>Os casos vem do Python</strong>, e nao estao escritos aqui — sao os de
 * {@code python/tests/test_gs1_datamatrix.py}, lidos pelo script Python. Duas listas
 * do mesmo conjunto divergem em silencio, que e' o que a {@code AGENTS.md} ja
 * registou com o Code 93.
 */
final class ParidadeGs1DataMatrix {

    public static void main(String[] argumentos) throws Exception {
        if (argumentos.length < 1) {
            System.err.println("uso: run-gs1-datamatrix <casos.json>");
            System.exit(2);
        }

        String json = new String(Files.readAllBytes(Paths.get(argumentos[0])),
                StandardCharsets.UTF_8);

        JsonArray casos = com.google.gson.JsonParser.parseString(json).getAsJsonArray();

        JsonArray saida = new JsonArray();
        for (int i = 0; i < casos.size(); i++) {
            JsonArray caso = casos.get(i).getAsJsonArray();
            String texto = caso.get(0).getAsString();
            boolean erroEsperado = caso.size() > 1 && caso.get(1).getAsBoolean();
            saida.add(descrever(texto, erroEsperado));
        }

        Gson gson = new GsonBuilder().serializeNulls().create();
        // **UTF-8 com BOM desligado.** Um `PrintStream` sem `charset` em Windows
        // escreve UTF-16 com BOM, e o `json.load` do Python morre em `0xff` na
        // posicao 0 — uma falha que parece de codificacao e e' do `PrintStream`.
        PrintStream stdout = new PrintStream(
                new java.io.FileOutputStream(java.io.FileDescriptor.out),
                true, StandardCharsets.UTF_8);
        stdout.println(gson.toJson(saida));
        stdout.flush();
    }

    /**
     * Descreve um caso: o que o encoder deu, ou a recusa.
     *
     * <p><strong>Uma recusa e' um resultado e nao uma excepcao.</strong> Se a
     * excepcao saisse, o script Python via um {@code stack trace} em vez de um caso, e
     * a falha nao diria qual dos dois recusou.
     */
    private static JsonObject descrever(String texto, boolean erroEsperado) {
        JsonObject saida = new JsonObject();
        saida.addProperty("texto", texto);

        CodigoGs1Matriz codigo;
        try {
            codigo = Gs1_DataMatrix.gs1DataMatrix(texto);
        } catch (SimbologiaException e) {
            saida.addProperty("erro", e.getMessage());
            return saida;
        }

        if (erroEsperado) {
            // Um caso de recusa que o encoder **aceita** e' o resultado mais grave:
            // o Python tambem recusaria, a paridade passava, e o sintoma seria uma
            // etiqueta impressa com um campo a mais.
            saida.add("erro", com.google.gson.JsonNull.INSTANCE);
            return saida;
        }

        // **Os modulos saem como 0 e 1, e nao como `true`/`false`** — o script compara
        // posicao a posicao, e um `true` onde se espera `1` contaria como divergencia
        // num codigo que esta certo.
        JsonArray modulos = new JsonArray();
        for (boolean[] linha : codigo.codigo().modulos()) {
            JsonArray uma = new JsonArray();
            for (boolean modulo : linha) {
                uma.add(modulo ? 1 : 0);
            }
            modulos.add(uma);
        }

        // **Os codewords sao a comparacao principal**, e nao a imagem: um `232` no sitio
        // errado da o mesmo numero de modulos e le-se com o campo partido.
        JsonArray codewords = new JsonArray();
        for (int cw : codigo.codigo().codewords()) {
            codewords.add(cw);
        }

        saida.add("modulos", modulos);
        saida.add("codewords", codewords);
        saida.addProperty("separadores", codigo.separadores());
        saida.addProperty("payload", codigo.payload());
        saida.addProperty("gs1", codigo.gs1());
        saida.addProperty("legenda", codigo.legenda());
        saida.addProperty("colunas", codigo.codigo().colunas());
        saida.addProperty("linhas", codigo.codigo().linhas());

        JsonArray campos = new JsonArray();
        for (CodigoGs1.Campo campo : codigo.campos()) {
            JsonObject um = new JsonObject();
            um.addProperty("ai", campo.ai());
            um.addProperty("valor", campo.valor());
            um.addProperty("conteudo", campo.conteudo());
            um.addProperty("separador", campo.separador());
            um.addProperty("numerico", campo.numerico());
            campos.add(um);
        }
        saida.add("campos", campos);

        return saida;
    }
}