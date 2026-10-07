package com.qrcodegen.core.simbologias;

import java.util.List;

/**
 * O resultado de um GS1-128.
 *
 * <p><strong>E' uma classe a parte, e nao {@link CodigoDeBarras} com dois campos
 * a mais.</strong> O GS1-128 desenha-se como um Code 128 — e' o mesmo formato com o
 * FNC1 no sitio certo — mas o que o leitor devolve depende de duas coisas que um
 * {@code CodigoDeBarras} nao tem: <strong>onde acaba cada campo</strong> e
 * <strong>quantos separadores foram emitidos</strong>.
 *
 * <h2>Porque sao tres textos e nao um</h2>
 *
 * <p>O mesmo GS1-128 tem <strong>tres representacoes</strong>, e confundir duas
 * delas e' o erro que a {@code AGENTS.md} ja registou tres vezes — uma delas nos
 * caracteres de controlo do Code 93, que o ZXing devolve em tres notacoes e o
 * teste comparava duas:
 *
 * <ul>
 *   <li>{@link #payload()} — a forma de maquina: os AIs e os valores sem
 *       parenteses, com o separador onde o encoder o pôs. <strong>E' esta a que o
 *       ZXing devolve em {@code bytes}, com o {@code 0x1D} cru.</strong></li>
 *   <li>{@link #gs1()} — a forma legivel com separadores entre os campos.</li>
 *   <li>{@link #legenda()} — a forma humana, com os AIs entre parenteses e sem
 *       separador nenhum. <strong>E' a que a GS1 pede que se imprima e a que o
 *       ZXing devolve em {@code text}: o ZXing parseia o GS1 e escreve os AIs
 *       entre parenteses.</strong></li>
 * </ul>
 *
 * <p><strong>Um {@code payload()} e um {@code legenda()} que devolvessem a mesma
 * cadeia seriam um codigo que se desenha bem e que nao diz nada</strong> — e o
 * primeiro rascunho desta classe tinha exactamente isso, com dois metodos a
 * devolver {@code codigo.legenda()}. O teste de paridade apanha-o na mesma
 * volta, porque o web devolve tres cadeias diferentes para o mesmo codigo.
 *
 * <h2>Por que os campos sao um campo e nao uma legenda</h2>
 *
 * <p>Cada {@link Campo} tem o AI, o valor, e o valor sem a parte do AI implicito.
 * Sao tres coisas porque o {@code 3103} tem um digito que e' do valor e nao do AI,
 * e um {@link Campo} com so {@code ai} e {@code valor} esconde isso.
 */
public final class CodigoGs1 {

    /**
     * Um campo de um GS1-128.
     *
     * @param ai o numero do AI, dois a quatro digitos, <strong>sem</strong> a parte
     *     que sobrou da procura
     * @param valor o valor do campo, com a parte implicita do AI no inicio
     * @param conteudo o valor sem a parte implicita
     * @param separador se o campo precisa de um FNC1 a separa-lo do seguinte
     *
     * <p><strong>O {@code valor} e o {@code conteudo} sao dois campos porque num
     * {@code 3103} o ultimo digito e' a posicao decimal implicita</strong> e faz
     * parte do valor. E' a razao de a procura do AI ir do mais comprido para o mais
     * curto: o {@code 31} seguido de {@code 03} e' o mesmo campo com o digito no
     * sitio certo.
     */
    public record Campo(String ai, String valor, String conteudo, boolean separador) {
    }

    private final boolean[] modulos;
    private final String legenda;
    private final String payload;
    private final String gs1;
    private final List<Campo> campos;
    private final int separadores;

    /**
     * @param modulos a grelha, {@code true} onde o modulo e' escuro
     * @param legenda a forma humana, com os AIs entre parenteses
     * @param payload a forma de maquina, com o separador onde o encoder o pôs
     * @param gs1 a forma legivel com separadores
     * @param campos os campos, na ordem em que foram escritos
     * @param separadores quantos FNC1 foram emitidos, contando o do inicio
     */
    public CodigoGs1(boolean[] modulos, String legenda, String payload, String gs1,
            List<Campo> campos, int separadores) {
        this.modulos = modulos.clone();
        this.legenda = legenda;
        this.payload = payload;
        this.gs1 = gs1;
        this.campos = List.copyOf(campos);
        this.separadores = separadores;
    }

    /**
     * O codigo de barras como {@link CodigoDeBarras}, para o desenho e para o ZXing.
     *
     * <p><strong>Um GS1-128 nao tem desenho proprio</strong>: tem o desenho do
     * Code 128 com mais uns codewords, e um {@code CodigoDeBarras} resolve. A
     * conversao e' uma convenience e nao o formato do codigo — e e' por isso que
     * {@link #modulos()} e' o campo, e nao este.
     */
    public CodigoDeBarras codigo() {
        return new CodigoDeBarras("GS1-128", modulos.clone(), new int[0], legenda);
    }

    /**
     * A grelha: {@code true} e' barra escura, {@code false} e' espaco.
     *
     * <p><strong>E' uma copia, e nao a lista.</strong> O array vem do encoder e vai
     * para o desenho, e uma lista que os dois mexem e' uma lista em que a ordem
     * conta e ninguem sabe quem escreve depois.
     */
    public boolean[] modulos() {
        return modulos.clone();
    }

    /** Os campos, na ordem em que foram escritos. */
    public List<Campo> campos() {
        return campos;
    }

    /**
     * Quantos FNC1 foram emitidos, contando o do inicio.
     *
     * <p><strong>E' a unica coisa que apanha um separador a mais.</strong> O numero
     * de modulos nao apanha: o GS1-128 e o Code 128 dao <em>exactamente</em> o mesmo
     * numero de modulos com o mesmo texto, porque dao treze codewords nos dois — o
     * Code 128 comutativo gasta um codeword na troca de conjunto e o GS1-128 gasta
     * um no FNC1. E um separador a mais da treze codewords em vez de treze.
     */
    public int separadores() {
        return separadores;
    }

    /**
     * A forma de maquina: os AIs e os valores sem parenteses, com o separador
     * <strong>onde o encoder o pôs</strong>.
     *
     * <p><strong>Nao e' a mesma coisa que juntar todos os campos com um
     * separador.</strong> A diferenca e' o que apanha um separador no ultimo campo:
     * um separador no fim nao separa de nada, e o leitor conta-o como parte do
     * campo seguinte. E' esta a forma que o ZXing devolve em {@code bytes}.
     */
    public String payload() {
        return payload;
    }

    /**
     * A forma legivel, com o separador entre os campos.
     *
     * <p><strong>Nao e' a legenda, e nao por erro.</strong> A legenda tem os AIs entre
     * parenteses e nenhum separador, porque e' a forma que a GS1 manda imprimir e a
     * que o ZXing devolve em {@code text}.
     */
    public String gs1() {
        return gs1;
    }

    /**
     * A forma humana, com os AIs entre parenteses e <strong>sem</strong> separador.
     *
     * <p>A GS1 pede que a linha impressa tenha os AIs entre parenteses, e nao e'
     * opcional: e' o que permite a uma pessoa ler o codigo sem scanner.
     */
    public String legenda() {
        return legenda;
    }
}