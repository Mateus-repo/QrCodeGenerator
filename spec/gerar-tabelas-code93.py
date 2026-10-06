"""
Gera as tabelas do Code 93 para as cinco stacks.

    python spec/gerar-tabelas-code93.py

Porque e' gerado e nao escrito a mao
------------------------------------

**A tabela do Code 93 e' a mais antipatica de todas as que este repositorio
tem**, e a razao e' que nao e' uma lista de padroes em texto: sao **48 inteiros
em hexadecimal, de nove bits cada**, em que cada bit e' um modulo. Nao se
transcreve isso de memoria nem se revisa a olho: uma troca em dois caracteres
produz um codigo que se desenha perfeito, tem o checksum certo e **nao e' lido
por nada**.

E' a mesma razao que fez a tabela do Code 39 ser extraida - e essa ja falhou uma
vez, com doze elementos por caracter em vez de nove, apanhado pelo leitor e nao
por nenhum teste estrutural.

De onde vem
-----------

Da implementacao de referencia do **ZXing** (``Code93Reader.java``), que e' o
mesmo leitor que vai verificar o que estes encoders produzem. Nao ha um pacote
de Python com o Code 93 instalado - o ``python-barcode`` nao o tem - e a fonte
publica mais limpa e' a do ZXing.

**A excepcao, e porque e' a mais importante deste ficheiro:** o ``python-barcode``
da as tabelas de todas as outras simbologias de barras, e e' por isso que o
`gerar-tabelas-lineares.py` le a biblioteca. Aqui nao ha biblioteca nenhuma, e
**quem escreve o codigo tambem e' quem vai o ler**. E' uma excepcao com nome e
com razao, e nao a regra.

Os 48 valores
-------------

Os ultimos quatro sao **caracteres de controle** (os leitores do ZXing poem-nos como
letras a, b, c, d para os imprimir) e o ultimo e' o asterisco, que marca o inicio
e o fim. O Code 93 tem entao 43 caracteres de dados mais 4 de controle mais o
asterisco, e e' por isso que o modulo do checksum e' 47 e nao 43: contam o
asterisco e os de controle, e nao os dados.

Porque cinco alvos e nao um
--------------------------

**Uma tabela, uma fonte.** O que a ``AGENTS.md`` proibe e' escrever as tabelas
de memoria, e o que ela nao resolve e' transcreve-las para cada linguagem. Um
``int[]`` em Java copiado a mao da lista em Python e' a mesma tabela duas vezes,
e diverge no mesmo silencio - so que agora sem nenhum teste de estrutura que as
compare, porque cada stack so conhece a sua.

Por isso que o gerador escreve os cinco ficheiros a partir da mesma extracao, e
a regra passa a ser "corre o gerador" em vez de "nao transcrevas". O primeiro
alvo foi o web; Python, Java, Kotlin e C# vieram quando a simbologia se espalhou.

O que muda entre os cinco alvos, e so isto:

  - a forma de escrever a lista: ``(0x1B4, ...)``, ``{0x1B4, ...}``
  - o ``package``, o ``namespace`` e o nome do modulo ou da classe

**O que nao muda, e e' o que interessa:** a extracao, os valores, e os
invariantes verificados abaixo - que sao verificados **uma vez**, aqui, e nao
cinco vezes, num encoder de cada stack.
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent

DESTINO_WEB = RAIZ / "web" / "symbologies" / "code93-tabelas.js"
DESTINO_PYTHON = RAIZ / "python" / "qrcode_core" / "simbologias" / "tabelas_code93.py"
DESTINO_JAVA = (
    RAIZ / "java" / "core" / "src" / "main" / "java" / "com" / "qrcodegen"
    / "core" / "simbologias" / "TabelasCode93.java"
)
DESTINO_KOTLIN = (
    RAIZ / "kotlin" / "core" / "src" / "main" / "kotlin" / "com" / "qrcodegen"
    / "core" / "simbologias" / "TabelasCode93.kt"
)
DESTINO_CSHARP = RAIZ / "csharp" / "core" / "Simbologias" / "TabelasCode93.cs"

ORIGEM = (
    "https://raw.githubusercontent.com/zxing/zxing/master/core/src/main/java/"
    "com/google/zxing/oned/Code93Reader.java"
)

#: Quantos caracteres tem a tabela. **E' 48 e nao 43**, porque contam os quatro
#: de controle e o asterisco - e e' por isso que o checksum e' modulo 47.
N_CARACTERES = 48

#: O asterisco marca o inicio e o fim, e e' o ultimo indice.
ASTERISCO = 47

#: O modulo do checksum: **um a menos do que o numero de caracteres**, porque o
#: digito tem de poder ser um indice que ainda nao estava no codigo.
MODULO_CHECKSUM = N_CARACTERES - 1


def extrair() -> tuple[str, list[int], str]:
    """
    Os 48 caracteres e os 48 padroes, do ``Code93Reader.java``.

    **A extracao e' a parte em que se pode falhar em silencio.** O ZXing expoe os
    valores como um array de ``int`` inicializado no proprio codigo, e uma
    extracao por expressao regular que apanhe o bloco errado - ou que apanhe o
    ``ALPHABET_STRING`` de outra classe - devolve 48 numeros plausiveis e nao
    os certos. Por isso que a funcao falha em vez de devolver em silencio.
    """
    pedido = urllib.request.Request(ORIGEM, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        texto = resposta.read().decode("utf-8")

    alfabeto = re.search(r'ALPHABET_STRING = "([^"]+)"', texto)
    if not alfabeto:
        raise SystemExit("nao encontrei o ALPHABET_STRING no Code93Reader.java")

    bloco = re.search(
        r"CHARACTER_ENCODINGS = \{(.*?)\};", texto, re.DOTALL
    )
    if not bloco:
        raise SystemExit("nao encontrei o CHARACTER_ENCODINGS no Code93Reader.java")

    valores = re.findall(r"0x([0-9A-Fa-f]+)", bloco.group(1))

    # **O fonte inteiro tambem volta**, e nao so a tabela: os pares de escape vem
    # do `decodeExtended`, que esta no mesmo ficheiro. Voltar a le-lo dava uma
    # segunda downloading e duas opportunities de a fonte mudar entre elas.
    return alfabeto.group(1), [int(v, 16) for v in valores], texto


def extrair_controles(texto_fonte: str) -> list[str]:
    """
    O par de escape de cada um dos 128 caracteres ASCII.

    **E' o `decodeExtended` do ZXing invertido**, e nao uma tabela escrita: o
    ZXing sabe *decodificar* um par para um caracter, e o encoder precisa do
    contrario. Ha duas formas de ter essa tabela — escribir a escada, ou inverter
    a fonte — e **a escada e' o que estava feito, e estava errado**.

    Porquê errada: o `controle()` do web implementava uma distribuicao por
    tres letras de escape conforme a faixa, com numeros que **o ZXing produz
    para outra coisa**. `bC` e' o codigo 29 e `bV` e' o 64, e o encoder usava-os
    para o 6 e o 27. **Cada um destes e' um codigo diferente com o mesmo
    aspecto**, que e' o pior dos sintomas — o codigo desenha-se bem e o leitor
    devolve o caracter errado.

    E **nenhum teste apanha**. Os dez casos do web sao maiusculas, minusculas,
    simbolos e texto longo: nao ha um unico caracter de controlo. A tabela
    estava errada e verificada ao mesmo tempo, porque a verificacao nao a
    tocava.

    :param texto_fonte: o `Code93Reader.java` ja lido.
    :return: 128 entradas, com o par de escape, ou `""` para os caracteres que
        estao directamente no alfabeto.
    """
    inicio = texto_fonte.index("private static String decodeExtended")
    bloco = texto_fonte[inicio : texto_fonte.index("\n  }", inicio)]

    # **Tres formatos de regra, e os tres no mesmo `switch`.** Um intervalo com
    # deslocamento (`next >= 'A' && next <= 'Z'` e `(char)(next + 32)`), uma
    # letra so com valor literal (`next == 'U'` e `decodedChar = '\\0'`), e um
    # intervalo com valor constante (`%X to %Z all map to DEL (127)`).
    intervalo = re.compile(
        r"next >= '(.+?)' && next <= '(.+?)'.*?decodedChar = \(char\) \(next ([+-]) (\d+)\)",
        re.DOTALL,
    )
    letra_so = re.compile(
        r"next == '(.+?)'.*?decodedChar = ('[^']*'|\\0|\d+);", re.DOTALL
    )
    constante = re.compile(
        r"next >= '(.+?)' && next <= '(.+?)'.*?decodedChar = (\d+);", re.DOTALL
    )

    saida: list[str] = []
    alternativos: dict[int, list[str]] = {}

    # **Um codigo pode ter mais do que um escape, e isso e' do ZXing.** O DEL e'
    # o caso: `bT` vem da faixa `P..T` e `bX`, `bY` e `bZ` vem da regra "%X to
    # %Z all map to DEL". Os quatro leem igual.
    #
    # **A regra e' o primeiro que a extracao encontra**, e a ordem e' a do
    # fonte. Escolher o primeiro e' arbitrario mas deterministico; escolher sem
    # dizer qual e' o que produz um encoder que ninguem consegue reproduzir.
    for pedaco in bloco.split("case '")[1:]:
        letra = pedaco[0]

        for inicio_, fim, op, desl in intervalo.findall(pedaco):
            passo = int(desl) * (1 if op == "+" else -1)
            for c in range(ord(inicio_), ord(fim) + 1):
                _põe(saida, alternativos, ord(chr(c)) + passo, letra + chr(c))

        for letra_unica, valor in letra_so.findall(pedaco):
            _põe(saida, alternativos, _valor(valor), letra + letra_unica)

        for inicio_, fim, valor in constante.findall(pedaco):
            for c in range(ord(inicio_), ord(fim) + 1):
                _põe(saida, alternativos, int(valor), letra + chr(c))

    return saida


def _valor(texto: str) -> int:
    """O `decodedChar` de uma letra so, com o `\\0` tratado antes das aspas.

    **Sem isto, um `ord(texto[1])` num `\'\\0\'` dava a barra invertida**, e o
    `ord` dela e' 92 — um caractere perfeitamente normal e nao o NUL. O
    resultado era uma colisao em 92, e a mensagem apontava para as duas letras
    como se o erro fosse delas.
    """
    texto = texto.strip()

    if texto.startswith("'") and texto.endswith("'"):
        dentro = texto[1:-1]
        return 0 if dentro == "\\0" else ord(dentro)

    return 0 if texto == "\\0" else int(texto)


def _põe(
    saida: list[str], alternativos: dict[int, list[str]], codigo: int, escape: str
) -> None:
    """Acrescenta um par de escape, e regista as alternativas sem as perder."""
    while len(saida) <= codigo:
        saida.append("")

    if saida[codigo] == "":
        saida[codigo] = escape
        return

    alternativos.setdefault(codigo, [saida[codigo]]).append(escape)


def conferir(alfabeto: str, valores: list[int]) -> None:
    """
    Confere a extracao **antes** de a escrever nas cinco stacks.

    **Estes invariantes sao a razao de a tabela ser gerada e nao escrita.** Cada
    um deles, se falhar, produz um encoder que se desenha certo e nao e' lido -
    que e' o pior dos sintomas, porque nada da parte estrutural se queixa.

    Sao tres, e cada um apanha uma classe diferente de erro:

      1. **A contagem.** 48 e 48, e o mesmo comprimento. Uma extracao truncada
         dava 43 valores plausiveis e todos os digitos de controlo a sair do
         sitio, sem nenhum erro em lado nenhum.

      2. **Nove bits, e o mais significativo e' uma barra.** O ZXing ancora a
         leitura na primeira barra de cada caracter, e um padrao que comece em
         espaco desenha-se bem e **nao e' lido por nada**. Foi o que aconteceu
         a primeira versao do encoder do web.

      3. **O asterisco esta no indice 47.** Nao se descobre pela contagem, e a
         consequence e' silenciosa: o start e o stop saem outro qualquer, e o
         leitor recusa por checksum sem dizer qual dos dois digitos.
    """
    if len(valores) == 0:
        raise SystemExit("a tabela veio vazia - a extracao nao apanhou nada")

    if len(alfabeto) != len(valores):
        raise SystemExit(
            f"o alfabeto tem {len(alfabeto)} caracteres e a tabela {len(valores)} "
            f"valores - a fonte mudou de forma, e nao se vai adivinhar"
        )

    if len(valores) != N_CARACTERES:
        raise SystemExit(
            f"a tabela tem {len(valores)} valores e devia ter {N_CARACTERES}"
        )

    if alfabeto[ASTERISCO] != "*":
        raise SystemExit(
            f"o indice {ASTERISCO} do alfabeto e' {alfabeto[ASTERISCO]!r} e nao "
            f"o asterisco: o start e o stop saem outros e o leitor recusa por "
            f"checksum sem dizer qual dos dois digitos"
        )

    for indice, padrao in enumerate(valores):
        if padrao < 0 or padrao > 0x1FF:
            raise SystemExit(
                f"CODE93_PADROES[{indice}] = 0x{padrao:X} tem mais de nove bits: "
                f"a tabela nao e' do Code 93"
            )

        # **O bit mais significativo e' a primeira barra.** O ZXing le cada
        # caractere a comecar por uma barra, e ancorar num espaco faz a leitura
        # falhar sem dar erro.
        if not padrao & 0x100:
            raise SystemExit(
                f"CODE93_PADROES[{indice}] = 0x{padrao:X} ("
                f"{alfabeto[indice]!r}) comeca em espaco, e o leitor precisa de "
                f"uma barra para ancorar. A tabela esta errada."
            )

        # **Nove bits e um inicio em barra nao chega:** um padrao todo de barras
        # (0x1FF) desenha-se e nao se distingue do vizinho, porque o leitor
        # mede larguras. E' um aviso, nao um erro - mas um padrao todo de barras
        # nao existe no Code 93 e a sua presenca significa que a extracao pegou
        # no sitio errado.
        if padrao == 0x1FF:
            raise SystemExit(
                f"CODE93_PADROES[{indice}] ("
                f"{alfabeto[indice]!r}) e' 0x1FF, nove barras sem um espaco "
                f"nelas. No Code 93 nao ha caractere sem separacao, e a sua "
                f"presenca significa que a extracao pegou no sitio errado."
            )


def conferir_controles(controles: list[str]) -> None:
    """
    Confere a tabela de escapes antes de a escrever nas cinco stacks.

    **Sao tres invariantes, e cada um apanha uma classe diferente de erro.**

      1. **Cobertura.** Os 128 caracteres ASCII tem de ter par ou estar no
         alfabeto. Um furo aqui e' um caracter que o encoder recusa sem dizer
         porque — e o pior dos sinaomas, porque o caracter e' valido.

      2. **Todo o par tem exactamente duas letras.** Um par de uma letra desvia
         a leitura de tudo a seguir, e o sintoma e' o codigo desenhado certo e
         lido a partir do sitio errado.

      3. **A letra de escape e' sempre uma das quatro**, e a letra que segue e'
         sempre uma maiuscula da tabela. Uma letra de escape errada produz um
         par que o ZXing recusa por formato.
    """
    if len(controles) != 128:
        raise SystemExit(
            f"a tabela de escapes tem {len(controles)} entradas e devia ter 128"
        )

    for codigo, escape in enumerate(controles):
        # As 36 entradas vazias sao os caracteres que estao no alfabeto: o
        # espaco, os dez digitos e as vinte e seis maiusculas.
        if escape == "":
            continue

        if len(escape) != 2:
            raise SystemExit(
                f"o escape do caracter {codigo} (0x{codigo:02X}) e' {escape!r} e "
                f"nao tem duas letras: um par mais curto desvia a leitura de tudo "
                f"a seguir"
            )

        if escape[0] not in "abcd":
            raise SystemExit(
                f"o escape do caracter {codigo} (0x{codigo:02X}) comeca por "
                f"{escape[0]!r}, que nao e' uma das quatro letras de escape"
            )

    vazios = [c for c, e in enumerate(controles) if e == ""]

    # **São 37: um espaço, dez dígitos e vinte e seis maiúsculas.** A conta
    # falhou primeiro com 36, e o `raise` foi o que apanhou — o que é o
    # argumento a favor de haver uma verificação que falha.
    #
    # **Os cinco símbolos da tabela — `-`, `.`, `/`, `+` e `%` — não contam.**
    # O ZXing tem escapes para eles na mesma, pela regra `cA to cO map to ! to ,`,
    # que cobre 33 a 47. E isso não é um conflito: o encoder usa a forma
    # directa porque estão no alfabeto, e o `decodeExtended` só desfaz o par
    # quando a letra de escape aparece, que nestos caracteres nunca aparece.
    if len(vazios) != 37:
        raise SystemExit(
            f"ha {len(vazios)} caracteres sem escape e deviam ser 37: o espaco, "
            f"dez digitos e vinte e seis maiusculas"
        )


def _linhas_controles(controles: list[str], indent: str, comentario: str) -> str:
    """
    As 128 entradas, seis a seis, com o caracter de cada linha como comentario.

    **Seis a seis porque 128 numa linha so e' ilegivel**, e uma linha por
    caracter sao 128 linhas que ninguem revê. O comentario com o caracter
    resolve: da para ver de relance que a posicao 27 tem `bA` e a 26 tem `aZ`.

    **Os caracteres de controlo sao escritos com o codigo, e nao com o
    caractere** — um NUL literal num ficheiro conta como uma entrada e estraga
    a contagem, que e' o mesmo cuidado que o CR do `controle()` antigo merecia
    e nao teve.
    """
    visiveis = []
    for escape in controles:
        # **A entrada vai dentro de aspas**, e por isso precisa de barras antes
        # de `\` e de `"`. Sem isto, o aspa do codigo 34 fecha a cadeia e o
        # ficheiro gerado nao compila - e o erro aponta para o ficheiro gerado,
        # nao para este script.
        dentro = escape.replace("\\", "\\\\").replace('"', '\\"')
        visiveis.append(f'"{dentro}"')

    def marca(codigo: int) -> str:
        """Como se escreve um caracter no comentario da linha.

        **A marca nao pode ser uma aspa** - fechava a da entrada. Todo o resto
        vai como `0xNN`: um NUL literal num ficheiro conta como uma entrada e
        estraga a contagem, que e' o mesmo cuidado que o CR do `controle()`
        antigo merecia e nao teve.
        """
        if 0x20 <= codigo < 0x7F and chr(codigo) not in "\\\"":
            return chr(codigo)
        return f"0x{codigo:02X}"

    linhas = []
    for i in range(0, len(visiveis), 6):
        pedaco = visiveis[i : i + 6]

        # **Um comentario so, no fim da linha, com o intervalo que ela cobre.**
        #
        # **O comentario por entrada nao pode ser em Python:** um `#` come o
        # resto da linha, e as cadeias adjacentes concatenam-se - a tupla
        # passava a ser uma cadeia de 36 caracteres, que indexava por caractere
        # em vez de por codigo, e `CONTROLES[1]` dava `'U'` em vez de `'aA'`.
        # Nenhum teste estrutural apanha um tipo errado: nao e' um SyntaxError,
        # e so se ve quando se usa a tabela.
        primeiro, ultimo = i, i + len(pedaco) - 1
        intervalo = marca(primeiro)
        if ultimo != primeiro:
            intervalo += f" a {marca(ultimo)}"

        linhas.append(f"{indent}{', '.join(pedaco)},  {comentario} {intervalo}")

    return "\n".join(linhas)


def _blocos(
    valores: list[int],
    alfabeto: str,
    por_linha: int,
    indent: str,
    comentario: str,
) -> list[str]:
    """
    As linhas da lista de padroes, agrupadas.

    **Os caracteres do alfabeto vao como comentario no fim de cada linha**,
    porque 48 numeros hexadecimais em tres colunas nao se revem a olho, e o
    comentario diz o que e' cada um sem custo. E o que permite comparar um
    ficheiro gerado com outro a olho, quando um dos dois parece errado.
    """
    linhas = []
    for i in range(0, len(valores), por_linha):
        grupo = valores[i : i + por_linha]
        numeros = ", ".join(f"0x{v:03X}" for v in grupo)
        marcas = alfabeto[i : i + por_linha]
        linhas.append(f"{indent}{numeros},  {comentario} {marcas}")
    return linhas


def _web(alfabeto: str, valores: list[int], controles: list[str]) -> str:
    corpo = "\n".join(
        _blocos(valores, alfabeto, 6, "  ", "//")
    )

    return f"""/**
 * As tabelas do Code 93. **Gerado** por `spec/gerar-tabelas-code93.py`.
 *
 * Sao 48 inteiros de nove bits, e nao padroes em texto, que e' o que torna esta
 * tabela diferente de todas as outras do repositorio. **Os nove bits sao os
 * nove modulos, um a um, do mais significativo para o menos** - o bit mais
 * significativo e' a primeira barra e o menos significativo e' o ultimo
 * modulo. Nao ha larguras a extrair.
 *
 * **Nao se escreve isto de memoria.** Uma troca em dois caracteres produz um
 * codigo que se desenha perfeito, tem o checksum certo e nao e' lido por nada -
 * o mesmo genre de falha do Code 39 com doze elementos por caracter em vez de
 * nove, que ja aconteceu neste repositorio.
 *
 * A origem e' a implementacao de referencia do ZXing (`Code93Reader.java`), que
 * e' tambem o leitor que vai verificar o encoder. **E' a unica tabela do
 * repositorio que nao vem do `python-barcode`**, porque o `python-barcode` nao
 * tem Code 93.
 */

/** Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle. */
export const ALFABETO = "{alfabeto}";

/**
 * Os 128 caracteres ASCII ja escritos como vao no codigo.
 *
 * **E uma tabela cheia de proposito.** Um `""` para os caracteres que estao no
 * alfabeto obrigaria o encoder a perguntar "o par esta vazio?" em cada
 * caractere, e esse ramo e' cinco linguagens a escrever cinco versoes que ninguem
 * testa directamente. Aqui `CONTROLES[ord(c)]` da sempre o que sai, e uma
 * busca nao diverge entre linguagens.
 *
 * **Vem do `decodeExtended` do ZXing, invertido**, e nao de uma escada escrita a
 * mao — que foi o que o encoder do web tinha, com vinte e quatro dos trinta e
 * dois caracteres de controlo errados. Um CR saia como o algarismo `0`.
 */
export const CONTROLES = [
{_linhas_controles(controles, '  ', '//')}
];

/** Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto. */
export const PADROES = [
{corpo}
];

/** O indice de cada caractere, para a busca ao inverso. */
export const INDICE = new Map(
  [...ALFABETO].map((caractere, i) => [caractere, i]),
);

/** O asterisco, que marca o inicio e o fim. E' o indice {ASTERISCO}. */
export const ASTERISCO = {ASTERISCO};

/** O modulo do checksum: {MODULO_CHECKSUM}, e nao {N_CARACTERES - 4}. */
export const MODULO_CHECKSUM = {MODULO_CHECKSUM};
"""


def _python(alfabeto: str, valores: list[int], controles: list[str]) -> str:
    corpo = "\n".join(
        _blocos(valores, alfabeto, 6, "    ", "#")
    )

    return f'''"""
As tabelas do Code 93. **Gerado** por `spec/gerar-tabelas-code93.py`.

Sao 48 inteiros de nove bits, e nao padroes em texto, que e' o que torna esta
tabela diferente de todas as outras do repositorio. **Os nove bits sao os nove
modulos, um a um, do mais significativo para o menos** - o bit mais significativo
e' a primeira barra e o menos significativo e' o ultimo modulo. Nao ha larguras a
extrair.

**Nao se escreve isto de memoria.** Uma troca em dois caracteres produz um codigo
que se desenha perfeito, tem o checksum certo e nao e' lido por nada - o mesmo
genre de falha do Code 39 com doze elementos por caracter em vez de nove, que ja
aconteceu neste repositorio.

A origem e' a implementacao de referencia do ZXing (`Code93Reader.java`), que e'
tambem o leitor que vai verificar o encoder. **E' a unica tabela do repositorio
que nao vem do `python-barcode`**, porque o `python-barcode` nao tem Code 93.
"""

#: Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle, e o
#: asterisco marca o inicio e o fim.
ALFABETO = "{alfabeto}"

#: Os 128 caracteres ASCII ja escritos como vao no codigo.
#:
#: **E uma tabela cheia de proposito.** Um `""` para os caracteres que estao no
#: alfabeto obrigaria o encoder a perguntar "o par esta vazio?" em cada
#: caractere, e esse ramo e' cinco linguagens a escrever cinco versoes que
#: ninguem testa directamente. Aqui `CONTROLES[ord(c)]` da sempre o que sai, e uma
#: busca nao diverge entre linguagens.
#:
#: **Vem do `decodeExtended` do ZXing, invertido**, e nao de uma escada escrita a
#: mao — que foi o que o encoder do web tinha, com vinte e quatro dos trinta e
#: dois caracteres de controlo errados. Um CR saia como o algarismo `0`.
CONTROLES = (
{_linhas_controles(controles, '    ', '#')}
)

#: Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto.
#:
#: **Os caracteres estao como comentario no fim de cada linha** porque 48 numeros
#: hexadecimais em tres colunas nao se revem a olho, e o comentario diz o que e'
#: cada um sem custo.
PADROES = (
{corpo}
)

#: O indice de cada caractere, para a busca ao inverso.
INDICE = {{caractere: i for i, caractere in enumerate(ALFABETO)}}

#: O asterisco, que marca o inicio e o fim.
ASTERISCO = {ASTERISCO}

#: O modulo do checksum, **{MODULO_CHECKSUM} e nao {N_CARACTERES - 4}**: contam o
#: asterisco e os quatro de controle, e nao so os caracteres de dados.
MODULO_CHECKSUM = {MODULO_CHECKSUM}
'''


def _java(alfabeto: str, valores: list[int], controles: list[str]) -> str:
    corpo = "\n".join(
        _blocos(valores, alfabeto, 6, "        ", "//")
    )

    return f"""package com.qrcodegen.core.simbologias;

import java.util.HashMap;
import java.util.Map;

/**
 * As tabelas do Code 93. **Gerado** por `spec/gerar-tabelas-code93.py`.
 *
 * <p>Sao 48 inteiros de nove bits, e nao padroes em texto. <b>Os nove bits sao os
 * nove modulos, um a um, do mais significativo para o menos</b> - o bit mais
 * significativo e' a primeira barra e o menos significativo e' o ultimo modulo.
 * Nao ha larguras a extrair.
 *
 * <p><b>Nao se escreve isto de memoria.</b> Uma troca em dois caracteres produz um
 * codigo que se desenha perfeito, tem o checksum certo e nao e' lido por nada - o
 * mesmo genre de falha do Code 39 com doze elementos por caracter em vez de nove,
 * que ja aconteceu neste repositorio.
 *
 * <p>A origem e' a implementacao de referencia do ZXing
 * ({{@code Code93Reader.java}}), que e' tambem o leitor que vai verificar o encoder.
 * <b>E' a unica tabela do repositorio que nao vem do
 * {{@code python-barcode}}</b>, porque o {{@code python-barcode}} nao tem Code 93.
 */
public final class TabelasCode93 {{
    private TabelasCode93() {{
    }}

    /** Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle. */
    public static final String ALFABETO = "{alfabeto}";

    /**
     * Os 128 caracteres ASCII ja escritos como vao no codigo.
     *
     * <p><b>E uma tabela cheia de proposito.</b> Um {{@code ""}} para os caracteres
     * que estao no alfabeto obrigaria o encoder a perguntar "o par esta vazio?"
     * em cada caractere, e esse ramo e' cinco linguagens a escrever cinco versoes
     * que ninguem testa directamente. Aqui
     * {{@code CONTROLES[texto.charAt(i)]}} da sempre o que sai, e uma busca nao
     * diverge entre linguagens.
     *
     * <p><b>Vem do {{@code decodeExtended}} do ZXing, invertido</b>, e nao de uma
     * escada escrita a mao — que foi o que o encoder do web tinha, com vinte e
     * quatro dos trinta e dois caracteres de controlo errados. Um CR saia como o
     * algarismo {{@code 0}}.
     */
    public static final String[] CONTROLES = {{
{_linhas_controles(controles, '        ', '//')}
    }};

    /**
     * Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto.
     *
     * <p><b>{{@code int[]}} e nao {{@code String[]}}</b> porque cada padrao e' um
     * inteiro de nove bits e nao uma cadeia de barras e espacos. Numa cadeia
     * seria preciso converter cada um a binario, e essa conversao ia estar em
     * cinco stacks em vez de estar aqui uma vez.
     */
    public static final int[] PADROES = {{
{corpo}
    }};

    /** O asterisco, que marca o inicio e o fim. E' o indice {ASTERISCO}. */
    public static final int ASTERISCO = {ASTERISCO};

    /**
     * O modulo do checksum, <b>{MODULO_CHECKSUM} e nao {N_CARACTERES - 4}</b>.
     *
     * <p>Contam o asterisco e os quatro de controle, e nao so os caracteres de
     * dados. E' o mesmo numero do {{@code code39.js}} do web e a razao de os dois
     * parecerem tao diferentes: o Code 39 tem 43 e nao conta o asterisco.
     */
    public static final int MODULO_CHECKSUM = {MODULO_CHECKSUM};

    /**
     * O indice de cada caractere, para a busca ao inverso.
     *
     * <p><b>E' calculado e nao gerado</b>, pelas mesmas razoes que o web o
     * calcula: sao 48 entradas de um enumerate, e escreve-las seria 48 linhas de
     * mapa que so se podem enganar.
     *
     * @return mapa de caractere para indice no alfabeto
     */
    public static Map<Character, Integer> indice() {{
        Map<Character, Integer> mapa = new HashMap<>();
        for (int i = 0; i < ALFABETO.length(); i++) {{
            mapa.put(ALFABETO.charAt(i), i);
        }}
        return mapa;
    }}
}}
"""


def _kotlin(alfabeto: str, valores: list[int], controles: list[str]) -> str:
    corpo = "\n".join(
        _blocos(valores, alfabeto, 6, "        ", "//")
    )

    return f"""package com.qrcodegen.core.simbologias

/**
 * As tabelas do Code 93. **Gerado** por `spec/gerar-tabelas-code93.py`.
 *
 * Sao 48 inteiros de nove bits, e nao padroes em texto. **Os nove bits sao os
 * nove modulos, um a um, do mais significativo para o menos** - o bit mais
 * significativo e' a primeira barra e o menos significativo e' o ultimo modulo.
 * Nao ha larguras a extrair.
 *
 * **Nao se escreve isto de memoria.** Uma troca em dois caracteres produz um
 * codigo que se desenha perfeito, tem o checksum certo e nao e' lido por nada - o
 * mesmo genre de falha do Code 39 com doze elementos por caracter em vez de nove,
 * que ja aconteceu neste repositorio.
 *
 * A origem e' a implementacao de referencia do ZXing ([Code93Reader.java]), que
 * e' tambem o leitor que vai verificar o encoder. **E' a unica tabela do
 * repositorio que nao vem do python-barcode**, porque o python-barcode nao tem
 * Code 93.
 */
object TabelasCode93 {{
    /** Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle. */
    const val ALFABETO = "{alfabeto}"

    /**
     * Os 128 caracteres ASCII ja escritos como vao no codigo.
     *
     * **E uma tabela cheia de proposito.** Um `""` para os caracteres que estao no
     * alfabeto obrigaria o encoder a perguntar "o par esta vazio?" em cada
     * caractere, e esse ramo e' cinco linguagens a escrever cinco versoes que
     * ninguem testa directamente. Aqui `CONTROLES[c.code]` da sempre o que sai, e
     * uma busca nao diverge entre linguagens.
     *
     * **Vem do `decodeExtended` do ZXing, invertido**, e nao de uma escada escrita a
     * mao — que foi o que o encoder do web tinha, com vinte e quatro dos trinta e
     * dois caracteres de controlo errados. Um CR saia como o algarismo `0`.
     */
    val CONTROLES = arrayOf(
{_linhas_controles(controles, '        ', '//')}
    )

    /**
     * Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto.
     *
     * **`IntArray` e nao `Array<String>`** porque cada padrao e' um inteiro de nove
     * bits e nao uma cadeia de barras e espacos.
     */
    val PADROES = intArrayOf(
{corpo}
    )

    /** O asterisco, que marca o inicio e o fim. E' o indice {ASTERISCO}. */
    const val ASTERISCO = {ASTERISCO}

    /**
     * O modulo do checksum, **{MODULO_CHECKSUM} e nao {N_CARACTERES - 4}**.
     *
     * Contam o asterisco e os quatro de controle, e nao so os caracteres de dados.
     */
    const val MODULO_CHECKSUM = {MODULO_CHECKSUM}

    /**
     * O indice de cada caractere, para a busca ao inverso.
     *
     * **E' calculado e nao gerado**, pelas mesmas razoes que o web o calcula: sao
     * 48 entradas de um `withIndex`, e escreve-las seria 48 linhas que so se
     * podem enganar.
     *
     * **`withIndex()` e nao um `for` com contador** porque o `Char` do Kotlin
     * nao e' promovido a `Int` automaticamente, e o `associate` de cada `Char`
     * para `Int` e' o que evita a conversao a mao em cada encoder.
     *
     * **O `associate` recebe um `IndexedValue`, nao dois parametros.** Com
     * `{{ i, c -> c to i }}` o compilador da quatro erros em cadeia — o primeiro
     * e' o tipo do argumento, e os outros tres sao consequencia de nao inferir o
     * tipo do parametro. E' o `associate {{ it.value to it.index }}` que resolve,
     * e o `it` explicito porque o `associate` nao desestrutura.
     */
    val INDICE: Map<Char, Int> = ALFABETO.withIndex().associate {{ it.value to it.index }}
}}
"""


def _csharp(alfabeto: str, valores: list[int], controles: list[str]) -> str:
    corpo = "\n".join(
        _blocos(valores, alfabeto, 6, "        ", "//")
    )

    return f"""namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// As tabelas do Code 93. <b>Gerado</b> por <c>spec/gerar-tabelas-code93.py</c>.
/// </summary>
/// <remarks>
/// <para>Sao 48 inteiros de nove bits, e nao padroes em texto. <b>Os nove bits sao
/// os nove modulos, um a um, do mais significativo para o menos</b> - o bit mais
/// significativo e' a primeira barra e o menos significativo e' o ultimo modulo.
/// Nao ha larguras a extrair.</para>
///
/// <para><b>Nao se escreve isto de memoria.</b> Uma troca em dois caracteres
/// produz um codigo que se desenha perfeito, tem o checksum certo e nao e' lido
/// por nada - o mesmo genre de falha do Code 39 com doze elementos por caracter
/// em vez de nove, que ja aconteceu neste repositorio.</para>
///
/// <para>A origem e' a implementacao de referencia do ZXing
/// (<c>Code93Reader.java</c>), que e' tambem o leitor que vai verificar o encoder.
/// <b>E' a unica tabela do repositorio que nao vem do python-barcode</b>, porque
/// o python-barcode nao tem Code 93.</para>
/// </remarks>
public static class TabelasCode93
{{
    /// <summary>Os 48 caracteres, na ordem do indice. Os ultimos quatro sao de controle.</summary>
    public const string ALFABETO = "{alfabeto}";

    /// <summary>
    /// Os 128 caracteres ASCII ja escritos como vao no codigo.
    /// </summary>
    /// <remarks>
    /// <para><b>E uma tabela cheia de proposito.</b> Um <c>""</c> para os
    /// caracteres que estao no alfabeto obrigaria o encoder a perguntar "o par esta
    /// vazio?" em cada caractere, e esse ramo e' cinco linguagens a escrever cinco
    /// versoes que ninguem testa directamente. Aqui
    /// <c>Controles[texto[i]]</c> da sempre o que sai, e uma busca nao diverge
    /// entre linguagens.</para>
    ///
    /// <para><b>Vem do <c>decodeExtended</c> do ZXing, invertido</b>, e nao de uma
    /// escada escrita a mao — que foi o que o encoder do web tinha, com vinte e
    /// quatro dos trinta e dois caracteres de controlo errados. Um CR saia como o
    /// algarismo <c>0</c>.</para>
    /// </remarks>
    public static readonly string[] Controles =
    {{
{_linhas_controles(controles, '        ', '//')}
    }};

    /// <summary>
    /// Os 48 padroes, em hexadecimal, na mesma ordem do alfabeto.
    /// </summary>
    /// <remarks>
    /// <b><c>int[]</c> e nao <c>string[]</c></b> porque cada padrao e' um inteiro de
    /// nove bits e nao uma cadeia de barras e espacos.
    /// </remarks>
    public static readonly int[] PADROES =
    {{
{corpo}
    }};

    /// <summary>O asterisco, que marca o inicio e o fim. E' o indice {ASTERISCO}.</summary>
    public const int ASTERISCO = {ASTERISCO};

    /// <summary>
    /// O modulo do checksum, <b>{MODULO_CHECKSUM} e nao {N_CARACTERES - 4}</b>.
    /// </summary>
    /// <remarks>
    /// Contam o asterisco e os quatro de controle, e nao so os caracteres de dados.
    /// </remarks>
    public const int MODULO_CHECKSUM = {MODULO_CHECKSUM};

    /// <summary>
    /// O indice de cada caractere, para a busca ao inverso.
    /// </summary>
    /// <remarks>
    /// <b>E' calculado e nao gerado</b>, pelas mesmas razoes que o web o calcula: sao
    /// 48 entradas de um <c>Select</c>, e escreve-las seria 48 linhas de dicionario
    /// que so se podem enganar.
    /// </remarks>
    public static readonly Dictionary<char, int> Indice =
        ALFABETO.Select((caractere, i) => (caractere, i))
            .ToDictionary(par => par.caractere, par => par.i);
}}
"""


ALVOS = [
    (DESTINO_WEB, _web),
    (DESTINO_PYTHON, _python),
    (DESTINO_JAVA, _java),
    (DESTINO_KOTLIN, _kotlin),
    (DESTINO_CSHARP, _csharp),
]


def principal() -> int:
    alfabeto, valores, fonte = extrair()
    conferir(alfabeto, valores)

    controles = extrair_controles(fonte)
    conferir_controles(controles)

    # **As entradas vazias passam a ser o proprio caracter.**
    #
    # A extracao so escreve o que precisa de escape, porque e' isso que o ZXing
    # declara. Mas um `""` no meio da tabela obriga o encoder a perguntar "esta
    # vazio?" em cada caractere, e esse ramo seria cinco linguagens a escrever
    # cinco versoes sem ninguem as testar. **Com a tabela cheia, `CONTROLES[ord(c)]`
    # da sempre o que sai** — e uma busca nao diverge entre linguagens.
    controles = [escape or chr(c) for c, escape in enumerate(controles)]

    # **Um caracter que esta no alfabeto usa-se directamente, mesmo que o ZXing
    # saiba tambem descodificar um par para ele.**
    #
    # Sao cinco: `%`, `+`, `-`, `.` e `/`, todos no intervalo 33 a 47 que o
    # `decodeExtended` cobre com `cA` a `cO`. Os dois leem igual — o ZXing so
    # desfaz o par quando a letra de escape aparece, e um `-` a solo passa
    # direito — mas so a forma directa e' a que o formato manda, por duas
    # razoes:
    #
    #   - **e' mais curta.** `ABC-1234` ia como `ABCcM1234`, com um `cM` a mais
    #     por cada tracinho.
    #   - **a legenda impressa fica legivel.** A legenda leva a forma
    #     estendida, e uma legenda com `ABCcM1234` nao e' uma coisa que alguem
    #     leia em voz alta com o carro a vidraceira partida.
    #
    # **Inverter uma tabela de descodificacao e' perder a forma canonica**, e
    # essa informacao nao esta no `switch` — esta no alfabeto. O `switch` diz
    # como descodificar cada letra; nao diz qual e' a forma preferida de
    # escrever. Por isso que a correccao e' aqui e nao na extracao.
    # **As quatro letras de escape ficam de fora**, e sao os indices 43 a 46, entre
    # o `%` e o asterisco. **Um `c` a solto nos dados parte o codigo**, porque o
    # `decodeExtended` do ZXing comeca com `if (c >= 'a' && c <= 'd')` e nao olha
    # para o indice: o leitor tenta ler o par seguinte e, se nao for uma letra
    # valida, levanta `FormatException` e nao devolve nada. O sintoma era
    # `o ZXing nao leu nada`, com um `cd` na legenda onde devia estar `dC`.
    #
    # **A distincao e' a que o proprio formato faz**: dos 48 caracteres, 43 sao
    # valores, **4 sao as letras de escape** e o ultimo e' o asterisco. So os
    # valores se escrevem directamente.
    letras_de_escape = set("abcd")
    for caractere in alfabeto:
        if caractere in letras_de_escape:
            continue
        if ord(caractere) < len(controles):
            controles[ord(caractere)] = caractere

    for caminho, escrever in ALVOS:
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(
            escrever(alfabeto, valores, controles), encoding="utf-8", newline=""
        )
        print(f"{caminho.relative_to(RAIZ)}: {len(valores)} padroes, 128 escapes")

    return 0


if __name__ == "__main__":
    raise SystemExit(principal())
