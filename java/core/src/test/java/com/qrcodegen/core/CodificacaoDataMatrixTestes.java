package com.qrcodegen.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A codificacao do texto, e por que este teste existe.
 *
 * <p><strong>Um encoder so entra no repositorio depois de o ZXing devolver a
 * cadeia certa</strong> - e o ZXing le-o, sem este teste. Este mede outra coisa,
 * que o leitor nao mede: <strong>o que o codigo diz, e nao o que ele produz nesta
 * maquina.</strong>
 *
 * <h2>Porque um teste de leitura nao chega aqui</h2>
 *
 * <p>{@code texto.getBytes()} usa a codificacao da plataforma. Com a plataforma
 * em UTF-8 — <strong>o default do Java desde a versao 18</strong> — isso da o
 * mesmo resultado que {@code getBytes(StandardCharsets.UTF_8)}, e um teste de
 * leitura passa com o bug dentro.
 *
 * <p>Introduziu-se o bug de proposito e o teste de leitura <strong>nao o
 * apanhou</strong>. Numa maquina com o default em cp1252 apanhava, e nessa maquina
 * o encoder produzia um codigo diferente - que e' a forma mais cara de divergencia
 * que existe, porque so aparece em producao e so num sistema.
 *
 * <h2>Porque a defesa e' ler o fonte</h2>
 *
 * <p><strong>Este teste nao executa o encoder</strong>: le a fonte e procura a
 * chamada sem argumento. E' uma defesa imperfeita - uma refatoracao pode mudar a
 * forma da chamada sem mudar o que se procura - <strong>e e' a unica que apanha
 * um erro de argumento numa chamada</strong>. Um teste que executa mede o
 * resultado, e o resultado nesta maquina e' o certo.
 *
 * <p>A {@code AGENTS.md} regista o mesmo padrao no {@code frameqr-centragem} do
 * web: um teste que prova que uma peca esta boa nao prova que a maquina liga. O
 * bug vivia na <em>chamada</em>, e nenhum teste que executasse a peca a via.
 *
 * <p><strong>Se algum dia este teste ficar impossivel</strong> - o ficheiro muda
 * de sitio, ou a chamada passa a ser feita por uma biblioteca -, o certo e' apaga
 * lo com uma nota que diga por que, e nao afrouxar a busca. Um teste de fonte que
 * falha e' um aviso; um que passa sem procurar nada e' um silencio.
 */
@DisplayName("A codificacao do texto")
class CodificacaoDataMatrixTestes {

    /**
     * O caminho da fonte do encoder.
     *
     * <p><strong>Procurado a subir, e nao escrito.</strong> O runner pode correr
     * na raiz do repositorio ou em {@code java/}, e um caminho escrito a mao
     * passava num sitio e falhava no outro — que e' o tipo de teste que se
     * apaga por estar a dar trabalho sem dizer nada.
     */
    private static Path fonteDoEncoder() throws IOException {
        String relativo = "core/src/main/java/com/qrcodegen/core/simbologias/DataMatrix.java";

        Path dePartida = Path.of("").toAbsolutePath().normalize();
        for (Path pasta = dePartida; pasta != null; pasta = pasta.getParent()) {
            Path candidato = pasta.resolve(relativo);
            if (Files.isRegularFile(candidato)) {
                return candidato;
            }
        }

        throw new AssertionError("nao encontrei " + relativo + " a subir de " + dePartida);
    }

    @Test
    @DisplayName("o encoder pede o UTF-8 pelo nome e nao a codificacao da plataforma")
    void oEncoderPedeUtf8PeloNome() throws IOException {
        List<String> semArgumento = linhasDeCodigo().stream()
                .filter((l) -> l.contains("getBytes()"))
                .toList();

        assertTrue(semArgumento.isEmpty(),
                "o encoder chama `getBytes()` sem argumento, e isso usa a codificacao "
                        + "da plataforma. Como o Java 18 faz de UTF-8 o default, num "
                        + "teste nesta maquina o resultado e' o mesmo - e noutra maquina "
                        + "nao e'. As linhas sao:\n" + semArgumento);
    }

    /**
     * As linhas do encoder <strong>sem os comentarios</strong>.
     *
     * <p><strong>Sem isto o teste falha contra si proprio</strong>, e falhou: a
     * nota que explica porque o {@code getBytes()} sem argumento e' errado esta
     * escrita em cima da linha do {@code getBytes()}, e a busca encontra a nota.
     *
     * <p>Um teste de fonte que le comentarios apanha o que o comentario diz, e nao
     * o que o codigo faz - **e o pior dos dois erros**, porque a correccao natural
     * e' reescrever o comentario, que e' mudar a documentacao para o teste passar.
     */
    private static List<String> linhasDeCodigo() throws IOException {
        return Files.readAllLines(fonteDoEncoder(), StandardCharsets.UTF_8).stream()
                .map((l) -> {
                    int comentario = l.indexOf("//");
                    return comentario >= 0 ? l.substring(0, comentario) : l;
                })
                .filter((l) -> {
                    String t = l.strip();
                    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
                })
                .toList();
    }

    @Test
    @DisplayName("o encoder passa o UTF-8 de forma explicita ao compactar")
    void oEncoderPassaUtf8DeFormaExplicita() throws IOException {
        String fonte = Files.readString(fonteDoEncoder(), StandardCharsets.UTF_8);

        assertTrue(fonte.contains("StandardCharsets.UTF_8"),
                "o `DataMatrix.java` nao menciona `StandardCharsets.UTF_8` em lado "
                        + "nenhum. Se o `getBytes()` sem argumento desapareceu por "
                        + "outra via, esta e' a prova de que o UTF-8 explicito foi "
                        + "perdido com ele.");
    }
}