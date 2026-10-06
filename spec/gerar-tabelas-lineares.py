"""
Gera o modulo Python com as tabelas dos codigos de barras de uma linha, a
partir do `python-barcode`.

    python spec/gerar-tabelas-lineares.py

## Porque um modulo gerado e nao um ficheiro escrito a mao

**A `AGENTS.md` e' explicita: as tabelas dos codigos de barras nunca se
escrevem de memoria.** E da' dois exemplos do proprio repositorio:

- O **Code 39** foi escrito de memoria com **doze** elementos por caractere em
  vez de **nove**. Nenhum teste apanhou: o codigo desenhava-se com aspecto de
  estar certo e o leitor devolvia outra coisa, ou nada.
- O **ITF** ficou com **dois** elementos na moldura de paragem em vez de
  **tres**. O mesmo: aspecto certo, leitura errada.

O `python-barcode` e' uma implementacao de referencia da industria, em Python
puro, com as tabelas no codigo-fonte em forma legivel. Este script extrai-as e
escreve o modulo; `tests/test_lineares.py` compara o que o encoder usa com o que
o `python-barcode` tem, **entrada a entrada**. Uma transcricao errada passa a ser
um teste vermelho, e nao um codigo que nao le.

## A notacao de 'N' e 'W'

O `python-barcode` descreve os elementos com quatro letras, e a distincao e'
**largura** e nao cor:

    `N` barra estreita    `n` espaco estreito
    `W` barra larga       `w` espaco largo

**Maiuscula e' largo, minuscula e' estreito — e nao barra e espaco.** Confundir
isso foi o primeiro bug do encoder de ITF, e o sintoma e' o pior dospossiveis: a
tabela esta certa, o codigo tem o comprimento certo, e a barra inicial sai com a
largura do espaco. O leitor devolve outra coisa sem dizer porquê.

## O que este script **nao** gera

**As larguras.** Nao sao tabelas, sao parametros de leitura, e vao no codigo com o
nome a dizer de onde vem — `LARGURA` no ITF, `NORMAL`/`LARGO` no Codabar. Sao
poucas, estao escritas ao lado de onde sao usadas, e um valor errado nelas e'
visivel num `git diff` de duas linhas em vez de escondido numa tabela de 43.

## A excepcao, e porque e' o mais importante deste ficheiro

**A paragem do Code 128 nao vem do `python-barcode`, porque a da biblioteca esta
truncada** — onze modulos em vez de treze, sem a barra final de dois modulos. Com
a cadeia da biblioteca o ZXing devolve "NAO LEU"; com a barra final devolve a
string certa.

**A regra da `AGENTS.md` e' "as tabelas nao se escrevem de memoria", e nao "as
tabelas vem do `python-barcode`".** A segunda e' o meio. Quando o meio falha, o
que manda e' a leitura, e o script acima tem uma guarda que da erro se a
biblioteca um dia corrigir isto — para ninguem deixar a excepcao la depois de
deixar de ser preciso.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from barcode.charsets import code39 as T39
    from barcode.charsets import code128 as T128
    from barcode.charsets import codabar as TCODABAR
    from barcode.charsets import itf as TITF
except ImportError:
    print(
        "python-barcode nao esta instalado.\n"
        "  python -m pip install python-barcode\n"
        "(e' so para gerar as tabelas — o core nao tem dependencia nenhuma)",
        file=sys.stderr,
    )
    raise SystemExit(1)

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "python" / "qrcode_core" / "simbologias" / "tabelas_lineares.py"

#: O mesmo modulo para o Java, e **pelo mesmo gerador**.
#:
#: **Uma tabela, uma fonte.** O que a `AGENTS.md` proibe e' escrever as tabelas
#: de memoria, e o que ela nao resolve e' transcreve-las para cada linguagem. Um
#: `String[]` em Java copiado a mao da lista em Python e' a mesma tabela duas
#: vezes, e diverge no mesmo silencio — so que agora sem nenhum teste de
#: estrutura que as compare, porque cada stack so conhece a sua.
#:
#: Por isso que o gerador escreve os dois ficheiros a partir da mesma extracao,
#: e a regra passa a ser "correm o gerador" em vez de "não transcrevas".
DESTINO_JAVA = (
    RAIZ / "java" / "core" / "src" / "main" / "java" / "com" / "qrcodegen"
    / "core" / "simbologias" / "Tabelas.java"
)

#: E o mesmo para o Kotlin, **pela mesma razao e no mesmo gerador**.
#:
#: **Tres linguagens, uma extracao.** A cada stack que entra acrescenta-se um
#: alvo ao gerador, e nunca uma transcricao. O Kotlin foi o terceiro porque a
#: ordem de propagacao e' Java, depois a mobile, depois o C# — e nao porque
#: fosse o mais facil: o que muda de um alvo para o outro e' a sintaxe do
#: ficheiro gerado, e nada mais.
#:
#: O que muda entre os tres alvos, e so isto:
#:
#:   - a forma de escrever uma lista: `arrayOf("a", "b")`
#:   - a forma de escrever um mapa: `mapOf("A" to "NwW")`
#:   - o `package` e o nome do objecto
#:
#: **O que nao muda entre os tres, e e' o que interessa:** a extracao, os
#: valores, e a unica excepcao — a paragem do Code 128, que vem escrita neste
#: script e nao da biblioteca.
DESTINO_KOTLIN = (
    RAIZ / "kotlin" / "core" / "src" / "main" / "kotlin" / "com" / "qrcodegen"
    / "core" / "simbologias" / "Tabelas.kt"
)

#: E o C#, **pela mesma razao e no mesmo gerador**, e nao por ser mais facil.
#:
#: **Quatro linguagens, uma extracao.** O .NET ja traz o `System.Text.Json`, e por
#: isso que a ferramenta de paridade em C# nao precisa de dependencia nenhuma —
#: o mesmo que o `core` diz de si proprio e que o Kotlin tambem cumpriu.
DESTINO_CSHARP = RAIZ / "csharp" / "core" / "Simbologias" / "Tabelas.cs"


def conferir(nome: str, padroes, n_elementos: int, alfabeto_valido: str) -> None:
    """
    Confere a extracao antes de a escrever.

    **A extracao e' a parte em que se pode falhar em silencio**, e o
    `python-barcode` expoe as tabelas como sequences onde uma entrada em falta
    desloca todas as seguintes. Um `CODES[:5]` truncado dava um encoder com cinco
    caracteres correctos e um sexto trocado, e o sintoma seria o mesmo de uma
    tabela errada — que e' precisamente o que nao se distingue.
    """
    if len(padroes) == 0:
        raise SystemExit(f"a tabela {nome} veio vazia")

    for indice, padrao in enumerate(padroes):
        elementos = padrao if isinstance(padrao, str) else "".join(padrao)

        if len(elementos) != n_elementos:
            raise SystemExit(
                f"a tabela {nome}[{indice}] tem {len(elementos)} elementos, "
                f"esperava {n_elementos}: {elementos!r}"
            )

        if set(elementos) - set(alfabeto_valido):
            raise SystemExit(
                f"a tabela {nome}[{indice}] tem um caractere fora de "
                f"{alfabeto_valido!r}: {elementos!r}"
            )


def principal() -> int:
    # --- Code 39: 43 caracteres, cada um com nove elementos. ---
    alfabeto = list(T39.REF)
    padroes39 = [str(p) for p in T39.CODES]

    if len(alfabeto) != len(padroes39):
        raise SystemExit(
            f"o Code 39 tem {len(alfabeto)} caracteres e {len(padroes39)} padroes — "
            "a extracao esta desemparelhada"
        )
    # **O Code 39 vem JA EXPANDIDO**, com quinze caracteres de `0` e `1` em vez
    # de nove elementos `NnWw`. E a diferenca entre esta tabela e as outras duas,
    # e vale a pena saber: o `python-barcode` expande o Code 39 porque so esse
    # formato tem razao larga/estreita fixa em 3:1, e o ITF e o Codabar precisam
    # da elemento para poderem escolher a razao. **Verificar os quinze e nao os
    # nove** foi o que apanhou esta: um `conferir` escrito para `NnWw` dava
    # "tem 15 elementos, esperava 9" numa tabela perfeitamente correcta.
    conferir("code39", padroes39, 15, "01")

    # --- ITF: cinco elementos por digito, mais as duas molduras. ---
    padroesitf = [str(p) for p in TITF.CODES]
    conferir("itf", padroesitf, 5, "NnWw")

    # --- Codabar: sete elementos por caracter, e quatro de inicio/paragem. ---
    padroescod = {str(k): str(v) for k, v in TCODABAR.CODES.items()}
    inicio_paragem = {str(k): str(v) for k, v in TCODABAR.STARTSTOP.items()}

    conferir("codabar", list(padroescod.values()), 7, "NnWw")
    conferir("codabar/inicio", list(inicio_paragem.values()), 7, "NnWw")

    # --- Code 128: 106 padroes de onze caracteres, mais o de paragem a parte. ---
    #
    # **O `python-barcode` separa a paragem dos outros 106**, e nao e' um
    # detalhe: a paragem tem sete elementos e os outros tem seis. Juntados dao
    # os 107 que o web tem num so.
    padroes128 = [str(p) for p in T128.CODES]
    paragem128 = str(T128.STOP)

    if len(padroes128) != 106:
        raise SystemExit(
            f"o Code 128 tem {len(padroes128)} padroes e devia ter 106 — "
            "a extracao esta desemparelhada"
        )

    # **Onze caracteres, e nao seis nem sete.** A cadeia e' a soma das larguras
    # dos seis elementos, e as larguras vao de 1 a 4: 1+1+2+2+2+3 e 11. Um
    # `conferir` escrito para os seis elementos do padrao — que e' como o web os
    # descreve, em larguras — dava "tem 11 elementos, esperava 6" numa tabela
    # perfeitamente correcta, que e' o mesmo engano do Code 39 ter vindo
    # expandido.
    conferir("code128", padroes128, 11, "01")

    # **A UNICA vez que a tabela nao vem do `python-barcode`: a paragem do
    # Code 128.**
    #
    # O `STOP` da biblioteca tem onze modulos e **seis** elementos. A paragem do
    # Code 128 sao **treze modulos e sete** — `2331112` — e a diferenca e' a
    # barra final de dois modulos. **A do `python-barcode` esta truncada.**
    #
    # Nao e' uma diferenca de opiniao: mediu-se. Com a cadeia da biblioteca o
    # ZXing devolve "NAO LEU" para `Hi`, e com a barra final devolve `Hi`. A
    # razao e' que essa barra e' a **ancora** do leitor — o Code 128 nao tem
    # barras-guarda como o EAN, e sem ela o leitor nao sabe onde acaba o codigo.
    #
    # **A regra da `AGENTS.md` e' "as tabelas nao se escrevem de memoria", e nao
    # "as tabelas vem do `python-barcode`".** A segunda e' o meio, e quando o
    # meio falha o que manda e a leitura. Copiar a cadeia truncada porque veio da
    # fonte seria levar um codigo que nao le para dentro do repositorio com a
    # autoridade da fonte colada ao lado.
    #
    # Os 106 padroes de dados **sao** da biblioteca e **passam** na leitura, e
    # por isso que so a paragem e' escrita aqui.
    PARAGEM_CODE128 = "1100011101011"

    conferir("code128/paragem", [PARAGEM_CODE128], 13, "01")

    if len(paragem128) == 13:
        raise SystemExit(
            "a paragem do python-barcode tem agora treze modulos — a "
            "biblioteca foi corrigida e esta excepcao ja nao e' necessaria. "
            "Confirmar com o ZXing antes de a remover."
        )

    conteudo = f'''"""
As tabelas dos codigos de barras de uma linha, extraidas do `python-barcode`.

    python spec/gerar-tabelas-lineares.py

**NAO EDITE ESTE FICHEIRO A MAO.** A `AGENTS.md` explica porquê com dois exemplos
do proprio repositorio: o Code 39 escrito de memoria com doze elementos por
caractere em vez de nove, e o ITF com dois na moldura de paragem em vez de tres.
Nenhum dos dois foi apanhado por um teste — desenhavam-se com aspecto de estar
certo e o leitor nao lia. `tests/test_lineares.py` compara estas tabelas com as
do `python-barcode` entrada a entrada, e uma transcricao errada passa a ser um
teste vermelho.

## A notacao de 'N' e 'W'

    `N` barra estreita    `n` espaco estreito
    `W` barra larga       `w` espaco largo

**Maiuscula e' largo, minuscula e' estreito — e nao barra e espaco.** Confundir
as duas coisas foi o primeiro bug do encoder de ITF: a tabela estava certa, o
codigo tinha o comprimento certo, e a barra inicial saia com a largura do espaco.
"""

#: O Code 39, por ordem, com o asterisco de inicio e paragem em separado.
#:
#: **Cada entrada tem quinze caracteres, ja expandidos a 3:1** — e nao os nove
#: elementos `NnWw` que o ITF e o Codabar usam. A razao e' que o Code 39 tem a
#: razao larga/estreita **fixa** em 3:1, ao contrario dos outros dois, que a
#: escolhem. **Um caractere tem tres barras, tres espacos, mais um espaco
#: estreito de fecho** — e e' esse espaco que torna o formato "self-checking": a
#: paridade das barras faz com que um unico elemento mal lido invalide o
#: caractere inteiro.
COD39_ALFABETO = {alfabeto!r}

COD39_PADROES = {padroes39!r}

#: O inicio e a paragem do Code 39, ambos um asterisco.
COD39_PARAGEM = {str(T39.EDGE)!r}

#: O ITF: cinco elementos por digito.
ITF_PADROES = {padroesitf!r}

#: A moldura de inicio: quatro elementos, todos estreitos.
ITF_INICIO = {str(TITF.START)!r}

#: A moldura de paragem: **tres** elementos — barra larga, espaco estreito,
#: barra estreita. Sao tres, e nao dois: com dois, a barra larga final fica
#: contigua a do ultimo digito e o leitor ve uma so.
ITF_PARAGEM = {str(TITF.STOP)!r}

#: O Codabar: sete elementos por caracter.
CODABAR_PADROES = {padroescod!r}

#: Os quatro caracteres que so podem ser inicio ou paragem.
CODABAR_INICIO_PARAGEM = {inicio_paragem!r}

#: O Code 128: os 106 primeiros valores, por indice.
#:
#: **Cada entrada tem onze caracteres, ja expandidos**, e nao os seis elementos
#: `NnWw` dos outros. A cadeia e' a soma das larguras dos seis elementos, e as
#: larguras vao de 1 a 4. Os valores 0 a 102 sao dados, 103, 104 e 105 sao os
#: caracteres de inicio dos conjuntos A, B e C, e 106 e' a paragem.
CODE128_PADROES = {padroes128!r}

#: A paragem do Code 128: treze modulos, sete elementos — `2331112`.
#:
#: ## A unica tabela deste ficheiro que nao vem do `python-barcode`
#:
#: **A `STOP` da biblioteca tem onze modulos e seis elementos. A paragem do Code
#: 128 sao treze e sete.** Falta a barra final de dois modulos, e sem ela o
#: codigo **nao e' lido por nada**: mediu-se, e o ZXing devolve "NAO LEU" para
#: `Hi` com a cadeia da biblioteca e `Hi` com esta.
#:
#: A razao e' que essa barra e' a **ancora** do leitor. O Code 128 nao tem
#: barras-guarda como o EAN, e a paragem e' a unica coisa que diz onde o codigo
#: acaba — sem ela o leitor nao sabe, e o que le nao e' este codigo.
#:
#: **A regra da `AGENTS.md` e' nao escrever as tabelas de memoria.** O
#: `python-barcode` e' o meio de o fazer, e nao a razao. Quando o meio falha, o
#: que manda e' a leitura — e trazer a cadeia truncada porque veio da fonte seria
#: levar para dentro do repositorio um codigo que nao le, com a autoridade da
#: fonte colada ao lado.
#:
#: Os 106 padroes de dados sao da biblioteca e passam na leitura, e por isso que
#: so a paragem e' escrita aqui.
CODE128_PARAGEM = {PARAGEM_CODE128!r}
'''

    java = _java(
        alfabeto39=alfabeto,
        padroes39=padroes39,
        paragem39=str(T39.EDGE),
        padroesitf=padroesitf,
        inicioitf=str(TITF.START),
        paragemitf=str(TITF.STOP),
        padroescod=padroescod,
        inicio_paragem=inicio_paragem,
        padroes128=padroes128,
        paragem128=PARAGEM_CODE128,
    )

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(conteudo, encoding="utf-8")

    kotlin = _kotlin(
        alfabeto39=alfabeto,
        padroes39=padroes39,
        paragem39=str(T39.EDGE),
        padroesitf=padroesitf,
        inicioitf=str(TITF.START),
        paragemitf=str(TITF.STOP),
        padroescod=padroescod,
        inicio_paragem=inicio_paragem,
        padroes128=padroes128,
        paragem128=PARAGEM_CODE128,
    )

    DESTINO_JAVA.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_JAVA.write_text(java, encoding="utf-8")

    DESTINO_KOTLIN.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_KOTLIN.write_text(kotlin, encoding="utf-8")

    csharp = _csharp(
        alfabeto39=alfabeto,
        padroes39=padroes39,
        paragem39=str(T39.EDGE),
        padroesitf=padroesitf,
        inicioitf=str(TITF.START),
        paragemitf=str(TITF.STOP),
        padroescod=padroescod,
        inicio_paragem=inicio_paragem,
        padroes128=padroes128,
        paragem128=PARAGEM_CODE128,
    )

    DESTINO_CSHARP.parent.mkdir(parents=True, exist_ok=True)
    DESTINO_CSHARP.write_text(csharp, encoding="utf-8")

    print(f"  Code 39:  {len(padroes39)} caracteres x 9 elementos")
    print(f"  ITF:      {len(padroesitf)} digitos x 5 elementos")
    print(f"  Codabar:  {len(padroescod)} caracteres x 7 elementos")
    print(f"  Code 128: {len(padroes128)} padroes x 6 elementos + paragem")
    print(f"  -> {DESTINO.relative_to(RAIZ)}")
    print(f"  -> {DESTINO_JAVA.relative_to(RAIZ)}")
    print(f"  -> {DESTINO_KOTLIN.relative_to(RAIZ)}")
    print(f"  -> {DESTINO_CSHARP.relative_to(RAIZ)}")
    return 0


def _java(
    *, alfabeto39, padroes39, paragem39, padroesitf, inicioitf, paragemitf,
    padroescod, inicio_paragem, padroes128, paragem128,
) -> str:
    """
    O mesmo modulo em Java, a partir da **mesma** extracao.

    **Uma tabela, uma fonte.** O que a `AGENTS.md` proibe e' escrever as
    tabelas de memoria, e o que ela nao resolve e' transcreve-las para cada
    linguagem. Um `String[]` em Java copiado a mao da lista em Python e' a
    mesma tabela duas vezes, e diverge no mesmo silencio — so que agora sem
    nenhum teste de estrutura que as compare, porque cada stack so conhece a
    sua.

    Por isso que o gerador escreve os dois ficheiros a partir da mesma
    extracao, e a regra passa a ser "correm o gerador" em vez de "nao
    transcrevas".

    **O `String[]` do Java e' gerado com `", "` e nao com `","`** porque o
    Java nao tem literais de lista. E o `char[]` do Code 39 nao existe de
    proposito: o `String` ja' e' a sequencia, e um `char[]` seria uma copia
    que pode divergir do `String` sem nenhum teste dar por isso.
    """
    def arr(valores, indent="    "):
        corpo = ",\n".join(f'{indent}    "{v}"' for v in valores)
        return "{\n" + corpo + f",\n{indent}}}"

    def mapa(dicionario, indent="    "):
        linhas = ",\n".join(
            f'{indent}    "{k}", "{v}"' for k, v in sorted(dicionario.items())
        )
        return "{\n" + linhas + f",\n{indent}}}"

    def inteiros(valores, indent="    "):
        corpo = ",\n".join(f"{indent}    {v}" for v in valores)
        return "{\n" + corpo + f",\n{indent}}}"

    return f'''package com.qrcodegen.core.simbologias;

/**
 * As tabelas dos codigos de barras de uma linha, extraidas do
 * `python-barcode`.
 *
 * <pre>
 *     python spec/gerar-tabelas-lineares.py
 * </pre>
 *
 * <strong>NAO EDITE ESTE FICHEIRO A MAO.</strong> E' gerado, e a razao esta no
 * Python: a tabela do Code 39 foi escrita de memoria com doze elementos por
 * caractere em vez de nove, e a do ITF com dois na moldura de paragem em vez
 * de tres. Nenhum dos dois foi apanhado por um teste — desenhavam-se com aspecto
 * de estar certo e o leitor nao lia.
 *
 * <h2>Porquê uma classe so para isto</h2>
 *
 * <p>Porque e' <strong>a mesma extracao que escreve o modulo Python</strong>, e
 * nao uma transcricao. Um {{@code String[]}} copiado a mao da lista do Python e' a
 * mesma tabela duas vezes, e diverge no mesmo silencio — e sem nenhum teste de
 * estrutura que as compare, porque cada stack so conhece a sua.
 *
 * <p>E' por isso que {{@code modulosMaximos}} e as formas do FieldQR do web usam
 * o mesmo codigo e nao duas implementacoes: a regra deste repositorio e' nao
 * escrever as tabelas de memoria, e a segunda leitura dessa regra e' nao as
 * escrever duas vezes.
 *
 * <h2>A notacao de 'N' e 'W'</h2>
 *
 * <p><code>N</code> barra estreita, <code>n</code> espaco estreito,
 * <code>W</code> barra larga, <code>w</code> espaco largo.
 *
 * <p><strong>Maiuscula e' largo, minuscula e' estreito — e nao barra e
 * espaco.</strong> Sao duas perguntas independentes, e mistura-las produz uma
 * barra inicial com a largura do espaco.
 */
public final class Tabelas {{

    private Tabelas() {{
    }}

    /** O Code 39, por ordem, com o asterisco de inicio e paragem a parte. */
    public static final String COD39_ALFABETO = "{''.join(alfabeto39)}";

    /** Cada entrada tem quinze caracteres, ja expandidos a 3:1. */
    public static final String[] COD39_PADROES = {arr(padroes39)};

    /** O asterisco de inicio e de paragem. */
    public static final String COD39_PARAGEM = "{paragem39}";

    /** O ITF: cinco elementos por digito. */
    public static final String[] ITF_PADROES = {arr(padroesitf)};

    /** A moldura de inicio do ITF, com quatro elementos estreitos. */
    public static final String ITF_INICIO = "{inicioitf}";

    /**
     * A moldura de paragem do ITF, com <strong>tres</strong> elementos: barra
     * larga, espaco estreito, barra estreita. Sao tres e nao dois — a segunda
     * versao tinha dois e o codigo nao lia.
     */
    public static final String ITF_PARAGEM = "{paragemitf}";

    /** O Codabar, por caracter de dados: sete elementos cada. */
    private static final String[] CODABAR_CHAVES = {arr(sorted(padroescod))};

    private static final String[] CODABAR_VALORES = {arr([padroescod[k] for k in sorted(padroescod)])};

    /** Os quatro caracteres que so podem ser inicio ou paragem. */
    private static final String[] CODABAR_MOLDURA_CHAVES = {arr(sorted(inicio_paragem))};

    private static final String[] CODABAR_MOLDURA_VALORES = {arr([inicio_paragem[k] for k in sorted(inicio_paragem)])};

    /**
     * O Code 128: os 106 primeiros valores, por indice.
     *
     * <p><strong>Cada entrada tem onze caracteres, ja expandidos</strong>, e nao
     * os seis elementos <code>NnWw</code> dos outros: a cadeia e' a soma das
     * larguras dos seis elementos.
     */
    public static final String[] CODE128_PADROES = {arr(padroes128)};

    /**
     * A paragem do Code 128: treze modulos, sete elementos.
     *
     * <p><strong>E' a unica tabela deste ficheiro que nao vem do
     * `python-barcode`, porque a da biblioteca esta truncada</strong> — onze
     * modulos em vez de treze, sem a barra final. Com a cadeia da biblioteca o
     * ZXing devolve "NAO LEU" e com esta devolve a string certa. A barra e' a
     * ancora do leitor, porque o Code 128 nao tem barras-guarda como o EAN.
     */
    public static final String CODE128_PARAGEM = "{paragem128}";

    /**
     * O padrao de um caracter do Codabar, ou {{@code null}} se nao existir.
     *
     * <p><strong>O Codabar tem duas tabelas e uma funcao</strong>, e nao uma
     * tabela com tudo: os quatro caracteres de moldura so podem ser inicio ou
     * paragem, e por isso vivem separadas. Uma tabela unica dava ao encoder a
     * possibilidade de codificar um <code>A</code> nos dados, e o leitor lia-o
     * como uma moldura — o codigo passava a parte estrutural e partia a meio.
     */
    public static String codabar(String caractere) {{
        for (int i = 0; i < CODABAR_MOLDURA_CHAVES.length; i++) {{
            if (CODABAR_MOLDURA_CHAVES[i].equals(caractere)) {{
                return CODABAR_MOLDURA_VALORES[i];
            }}
        }}

        for (int i = 0; i < CODABAR_CHAVES.length; i++) {{
            if (CODABAR_CHAVES[i].equals(caractere)) {{
                return CODABAR_VALORES[i];
            }}
        }}

        return null;
    }}

    /** As medidas do Codabar nas duas variantes de espacado. */
    public static final int[] CODABAR_ESTREITO = {{2, 2}};
    public static final int[] CODABAR_LARGO = {{2, 2}};
}}
'''


def _kotlin(
    *, alfabeto39, padroes39, paragem39, padroesitf, inicioitf, paragemitf,
    padroescod, inicio_paragem, padroes128, paragem128,
) -> str:
    """
    O mesmo modulo em Kotlin, a partir da **mesma** extracao.

    **O terceiro alvo, e a regra e' a mesma dos outros dois:** acrescenta-se um
    gerador, nunca uma transcricao. Um `arrayOf` copiado a mao da lista em Java e'
    a mesma tabela tres vezes, e diverge no mesmo silencio — e agora sem nenhum
    teste que compare, porque cada stack so conhece a sua.

    **O que e' idiomatico no Kotlin e o que fica igual.** O mapa do Codabar e'
    um `mapOf` com `to`, que e' o que a linguagem tem, em vez dos dois arrays
    paralelos e a funcao que os percorre que o Java precisa. **A tabela e' a
    mesma; a forma de a escrever e' a da linguagem.** Sao coisas differentes, e
    e' por isso que o Kotlin e' um alvo do gerador e nao uma traducao do Java.
    """
    def lista(valores, indent="        "):
        corpo = (",\n").join(f'{indent}"{v}"' for v in valores)
        return "arrayOf(\n" + corpo + f",\n{indent[:-4]})"

    def mapa(dicionario, indent="        "):
        linhas = (",\n").join(
            f'{indent}"{k}" to "{v}"' for k, v in sorted(dicionario.items())
        )
        return "mapOf(\n" + linhas + f",\n{indent[:-4]})"

    return f'''package com.qrcodegen.core.simbologias

/**
 * As tabelas dos codigos de barras de uma linha, extraidas do
 * `python-barcode`.
 *
 *     python spec/gerar-tabelas-lineares.py
 *
 * **NAO EDITE ESTE FICHEIRO A MAO.** E' gerado, e a razao esta no Python: a
 * tabela do Code 39 foi escrita de memoria com doze elementos por caractere em
 * vez de nove, e a do ITF com dois na moldura de paragem em vez de tres. Nenhum
 * dos dois foi apanhado por um teste — desenhavam-se com aspecto de estar certo
 * e o leitor nao lia.
 *
 * ## Porque um objecto so para as tabelas
 *
 * Porque e' **a mesma extracao que escreve o modulo Python e o Java**, e nao uma
 * transcricao. A regra deste repositorio e' nao escrever as tabelas de memoria,
 * e a segunda leitura dessa regra e' nao as escrever duas vezes — que e' o que
 * acontece quando cada stack transcreve a sua.
 *
 * ## A notacao de 'N' e 'W'
 *
 *     `N` barra estreita    `n` espaco estreito
 *     `W` barra larga       `w` espaco largo
 *
 * **Decide a letra, e nao a caixa.** `W` e `w` sao largos, `N` e `n` sao
 * estreitos, e a caixa existia so por legibilidade. Ler pela caixa dava ao ITF
 * uma moldura de inicio com barras largas onde o formato nao tem nenhuma, e o
 * codigo saia com 45 modulos a mais.
 */
object Tabelas {{

    /** O Code 39, por ordem, com o asterisco de inicio e paragem a parte. */
    const val COD39_ALFABETO = "{''.join(alfabeto39)}"

    /** Cada entrada tem quinze caracteres, ja expandidos a 3:1. */
    val COD39_PADROES: Array<String> = {lista(padroes39)}

    /** O asterisco de inicio e de paragem. */
    const val COD39_PARAGEM = "{paragem39}"

    /** O ITF: cinco elementos por digito. */
    val ITF_PADROES: Array<String> = {lista(padroesitf)}

    /** A moldura de inicio do ITF, com quatro elementos estreitos. */
    const val ITF_INICIO = "{inicioitf}"

    /**
     * A moldura de paragem do ITF, com **tres** elementos: barra larga, espaco
     * estreito, barra estreita. Sao tres e nao dois — a segunda versao tinha
     * dois e o codigo nao lia.
     */
    const val ITF_PARAGEM = "{paragemitf}"

    /**
     * Os caracteres de dados do Codabar, por letra.
     *
     * **Os quatro de moldura nao estao aqui**, e sao de propósito: `A`, `B`, `C`
     * e `D` so existem nas pontas, e um `A` no meio do texto era codificado com
     * a tabela de dados e o leitor lia-o como moldura — o codigo passava a parte
     * estrutural e partia a meio.
     */
    val CODABAR_DADOS: Map<String, String> = {mapa(padroescod)}

    /** Os quatro caracteres que so podem ser inicio ou paragem. */
    val CODABAR_MOLDURA: Map<String, String> = {mapa(inicio_paragem)}

    /**
     * O Code 128: os 106 primeiros valores, por indice.
     *
     * **Cada entrada tem onze caracteres, ja expandidos**, e nao os seis
     * elementos `NnWw` dos outros: a cadeia e' a soma das larguras dos seis
     * elementos, e as larguras vao de 1 a 4.
     */
    val CODE128_PADROES: Array<String> = {lista(padroes128)}

    /**
     * A paragem do Code 128: treze modulos, sete elementos.
     *
     * **E' a unica tabela que nao vem do `python-barcode`, porque a da
     * biblioteca esta truncada** — onze modulos em vez de treze, sem a barra
     * final. Com a cadeia da biblioteca o ZXing devolve "NAO LEU" e com esta
     * devolve a string certa. A barra e' a ancora do leitor, porque o Code 128
     * nao tem barras-guarda como o EAN.
     */
    const val CODE128_PARAGEM = "{paragem128}"

    /**
     * O padrao de um caracter do Codabar, ou `null` se nao existir.
     *
     * **A moldura e' procurada primeiro, e `A`, `B`, `C` e `D` devolvem o padrao
     * de moldura** — que e' o que esta funcao promete: o padrao daquele
     * caractere. Quem recusa um `A` no meio dos dados e' o encoder, e nao esta
     * funcao; aqui so se resolve o nome.
     *
     * **Um `A` nos dados e' um bug de leitura, nao de codificacao.** O encoder
     * desenhava o mesmo, e o leitor lia-o como moldura: o codigo passava a parte
     * estrutural e partia a meio, sem erro nenhum pelo caminho.
     */
    fun codabar(caractere: String): String? =
        CODABAR_MOLDURA[caractere] ?: CODABAR_DADOS[caractere]
}}
'''


def _csharp(
    *, alfabeto39, padroes39, paragem39, padroesitf, inicioitf, paragemitf,
    padroescod, inicio_paragem, padroes128, paragem128,
) -> str:
    """
    O mesmo modulo em C#, a partir da **mesma** extracao.

    **O quarto alvo, e a regra e' a mesma dos outros tres.** Um `string[]`
    transcrito a mao da lista em Kotlin e' a mesma tabela quatro vezes.

    **O mapa do Codabar sao dois arrays e uma funcao, como no Java, e nao um
    `Dictionary`.** Nao e' preferencia: o ficheiro gerado e' so dados, e um
    `Dictionary` inicializado no campo obriga a um construtor que recebe um
    inicializador de coleccao — que ja nao e' so uma lista de cadeias. No
    Kotlin, `mapOf` cabe porque o objecto pode ter um inicializador de
    propriedade sem custo; em C# o mais simples e' o que o Java faz.
    """
    def arr(valores, indent="        "):
        corpo = (",\n").join(f'{indent}    "{v}"' for v in valores)
        return "new[]\n    {\n" + corpo + f",\n{indent}}}"

    def mapa(dicionario, indent="        "):
        linhas = (",\n").join(
            f'{indent}    "{k}", "{v}"' for k, v in sorted(dicionario.items())
        )
        return "new[]\n    {\n" + linhas + f",\n{indent}}}"

    return f"""namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// As tabelas dos codigos de barras de uma linha, extraidas do
/// <c>python-barcode</c>.
///
/// <code>python spec/gerar-tabelas-lineares.py</code>
///
/// <para><b>NAO EDITE ESTE FICHEIRO A MAO.</b> E' gerado, e a razao esta no
/// Python: a tabela do Code 39 foi escrita de memoria com doze elementos por
/// caractere em vez de nove, e a do ITF com dois na moldura de paragem em vez
/// de tres. Nenhum dos dois foi apanhado por um teste — desenhavam-se com
/// aspecto de estar certo e o leitor nao lia.</para>
///
/// <para><b>Porque um ficheiro so para as tabelas:</b> e' a mesma extracao que
/// escreve o modulo Python, o Java e o Kotlin, e nao uma transcricao. A regra
/// deste repositorio e' nao escrever as tabelas de memoria, e a segunda leitura
/// dessa regra e' nao as escrever quatro vezes.</para>
///
/// <para>A notacao de 'N' e 'W': <c>N</c> barra estreita, <c>n</c> espaco
/// estreito, <c>W</c> barra larga, <c>w</c> espaco largo. <b>Decide a letra, e
/// nao a caixa:</b> <c>W</c> e <c>w</c> sao largos, <c>N</c> e <c>n</c> estreitos.
/// A caixa existia so por legibilidade, e ler pela caixa dava ao ITF uma
/// moldura de inicio com barras largas onde o formato nao tem nenhuma.</para>
/// </summary>
public static class Tabelas
{{
    /// <summary>O Code 39, por ordem, com o asterisco de inicio e paragem a parte.</summary>
    public const string COD39_ALFABETO = "{''.join(alfabeto39)}";

    /// <summary>Cada entrada tem quinze caracteres, ja expandidos a 3:1.</summary>
    public static readonly string[] COD39_PADROES = {arr(padroes39)};

    /// <summary>O asterisco de inicio e de paragem.</summary>
    public const string COD39_PARAGEM = "{paragem39}";

    /// <summary>O ITF: cinco elementos por digito.</summary>
    public static readonly string[] ITF_PADROES = {arr(padroesitf)};

    /// <summary>A moldura de inicio do ITF, com quatro elementos estreitos.</summary>
    public const string ITF_INICIO = "{inicioitf}";

    /// <summary>
    /// A moldura de paragem do ITF, com <b>tres</b> elementos: barra larga,
    /// espaco estreito, barra estreita. Sao tres e nao dois — a segunda versao
    /// tinha dois e o codigo nao lia.
    /// </summary>
    public const string ITF_PARAGEM = "{paragemitf}";

    /// <summary>As chaves de dados do Codabar, por ordem alfabetica.</summary>
    private static readonly string[] CODABAR_CHAVES = {arr(sorted(padroescod))};

    private static readonly string[] CODABAR_VALORES = {arr([padroescod[k] for k in sorted(padroescod)])};

    /// <summary>
    /// Os quatro caracteres que so podem ser inicio ou paragem.
    ///
    /// <para>Vem a parte porque um <c>A</c> no meio dos dados era codificado com
    /// a tabela de dados e o leitor lia-o como moldura: o codigo passava a parte
    /// estrutural e partia a meio.</para>
    /// </summary>
    private static readonly string[] CODABAR_MOLDURA_CHAVES = {arr(sorted(inicio_paragem))};

    private static readonly string[] CODABAR_MOLDURA_VALORES = {arr([inicio_paragem[k] for k in sorted(inicio_paragem)])};

    /// <summary>
    /// O Code 128: os 106 primeiros valores, por indice.
    ///
    /// <para><b>Cada entrada tem onze caracteres, ja expandidos</b>, e nao os seis
    /// elementos <c>NnWw</c> dos outros: a cadeia e' a soma das larguras dos seis
    /// elementos, e as larguras vao de 1 a 4.</para>
    /// </summary>
    public static readonly string[] CODE128_PADROES = {arr(padroes128)};

    /// <summary>
    /// A paragem do Code 128: treze modulos, sete elementos.
    ///
    /// <para><b>E' a unica tabela deste ficheiro que nao vem do
    /// <c>python-barcode</c>, porque a da biblioteca esta truncada</b> — onze
    /// modulos em vez de treze, sem a barra final. Com a cadeia da biblioteca o
    /// ZXing devolve "NAO LEU" e com esta devolve a string certa. A barra e' a
    /// ancora do leitor, porque o Code 128 nao tem barras-guarda como o EAN.</para>
    /// </summary>
    public const string CODE128_PARAGEM = "{paragem128}";

    /// <summary>
    /// Se um caractere so pode ser inicio ou paragem do Codabar.
    /// </summary>
    /// <remarks>
    /// <b>Esta pergunta e' diferente de "qual e' o padrao".</b> <c>Codabar</c>
    /// responde ao mesmo tempo as duas, e o encoder precisa de saber se um
    /// <c>A</c> nos dados e' legal — e nao e'. Por isso existe aqui, e nao no
    /// encoder: <b>a tabela sabe o que e' moldura, e o encoder sabe o que e'
    /// legal</b>, e misturar as duas coisas e' como um <c>A</c> no meio do texto
    /// passa a parte estrutural e parte a meio na leitura.
    /// </remarks>
    public static bool EhMoldura(string caractere) =>
        Array.IndexOf(CODABAR_MOLDURA_CHAVES, caractere) >= 0;

    /// <summary>
    /// O padrao de um caracter do Codabar, ou <c>null</c> se nao existir.
    ///
    /// <para><b>A moldura e' procurada primeiro</b>, e <c>A</c>, <c>B</c>, <c>C</c>
    /// e <c>D</c> devolvem o padrao de moldura — que e' o que esta funcao
    /// promete: o padrao daquele caractere. Quem recusa um <c>A</c> no meio dos
    /// dados e' o encoder, e nao esta funcao.</para>
    /// </summary>
    public static string? Codabar(string caractere)
    {{
        for (int i = 0; i < CODABAR_MOLDURA_CHAVES.Length; i++)
        {{
            if (CODABAR_MOLDURA_CHAVES[i] == caractere)
            {{
                return CODABAR_MOLDURA_VALORES[i];
            }}
        }}

        for (int i = 0; i < CODABAR_CHAVES.Length; i++)
        {{
            if (CODABAR_CHAVES[i] == caractere)
            {{
                return CODABAR_VALORES[i];
            }}
        }}

        return null;
    }}
}}
"""


if __name__ == "__main__":
    sys.exit(principal())
