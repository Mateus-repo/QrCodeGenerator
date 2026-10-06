"""
O Code 93, em Python.

Este modulo e' a **implementacao de referencia** do Code 93 no repositorio, e
e' por isso que e' Python e nao qualquer outra coisa: as outras stacks sao
portas desta, e `spec/casos-barras.mjs` diz o que tem de dar certo em todas.

Onde ele ganha ao Code 39
--------------------------

A razao esta no numero de elementos. O Code 39 e' "sete de nove e dois de
cinco", porque cada caracter e' um start, seis barras e espacos, e um stop - e o
espaco entre caracteres e' um espaco estreito. **O Code 93 nao tem separacao:**
os caracteres correm uns nos outros, e a barra de inicio e a de fim servem de
separador.

Isso da um codigo **13% mais curto** para o mesmo texto, e o Code 93 acrescenta
uma correccao de erros que o Code 39 nao tem - sao os dois digitos de controlo.

Os quatro caracteres de controle
--------------------------------

A tabela tem 48 entradas e as ultimas quatro sao de controle, escritas no ZXing
como ``a``, ``b``, ``c`` e ``d`` para se poderem imprimir. Sao o que permite ao
Code 93 codificar os 128 caracteres ASCII num codigo que so tem 48 valores: um
caractere de controle e' o par "letra de escape" mais a letra seguinte, e o
leitor sabe que a leu.

E' por isso que **nao ha minusculas na tabela**, e que `teste-93` vai como
``dT dE dS dT dE``: o ``d`` e' a letra de escape das minusculas e a maiuscula
segue-lhe. Sem a codificacao estendida, o ``t`` nao teria padrao.

Os dois digitos de controlo
--------------------------

Ao contrario do Code 39, que tem um digito, o Code 93 tem **dois**, com pesos
diferentes: o primeiro pesa 1 a 20 e o segundo 1 a 15, ambos aplicados de tras
para a frente. E' o que torna o codigo seguro contra a inversao de dois
caracteres, que o Code 39 nao apanha.

**E o modulo e' 47, e nao 43** - contam o asterisco e os quatro de controle, e
nao so os caracteres de dados. E a razao de os dois parecerem tao diferentes
para quem os compara, e de este ser o mesmo numero que o `code39.js` do web usa.
"""

from __future__ import annotations

from .tabelas_code93 import (
    ALFABETO,
    ASTERISCO,
    CONTROLES,
    INDICE,
    MODULO_CHECKSUM,
    PADROES,
)


def code93(valor: str) -> dict:
    """
    Codifica em Code 93.

    :param valor: o que codificar. ASCII, minusculas e tudo - as minusculas e os
        controlos sao o que o Code 93 tem e o Code 39 nao.
    :raises ValueError: se o texto estiver vazio, trouxer um asterisco, ou
        trouxer um caractere acima de 127.
    :return: ``simbologia``, ``modulos``, ``guardas``, ``legenda``, ``valores`` e
        ``verificacao``.
    """
    texto = _validar(valor)

    # **O texto passa pela codificacao estendida antes de qualquer outra coisa.**
    #
    # A tabela tem 48 entradas e nenhuma delas e' uma minuscula. As minusculas
    # vao como o par de escape - o `d` da tabela - mais a letra seguinte, e o
    # leitor desfaz o par quando le. E' o mesmo mecanismo do C0, e e' a razao de
    # o Code 93 ser ASCII completo num codigo de 48 valores.
    #
    # **E o checksum e' calculado sobre o texto ja estendido**, nao sobre o
    # original: o checksum e' do que esta no codigo, e o que esta no codigo e' o
    # texto com os escapes. Calcular sobre o original daria um digito diferente
    # em qualquer texto com minusculas - e o codigo desenhava-se bem, o primeiro
    # digito batia certo e o segundo nao, e o leitor recusava por checksum sem
    # dizer qual dos dois.
    estendido = _codificar_estendido(texto)

    verificacao = _dois_controlos(estendido)
    com_controlos = [*estendido, *verificacao]

    # **O asterisco no inicio e no fim, e nao e' opcional.**
    #
    # E' o start e o stop do Code 93, e sem eles o leitor nao sabe onde comeca o
    # codigo. A razao de o asterisco ser o **mesmo** nas duas pontas, e nao dois
    # caracteres diferentes, e' que o Code 93 nao tem start e stop proprios como o
    # Code 39: usa um caractere normal da tabela, que o leitor reconhece pela forma.
    com_asteriscos = [ALFABETO[ASTERISCO], *com_controlos, ALFABETO[ASTERISCO]]

    modulos: list[bool] = []
    guardas: list[int] = []

    for i, caractere in enumerate(com_asteriscos):
        # Os asteriscos do inicio e do fim sao as guardas: sao o unico ponto de
        # referencia que o leitor tem, porque o Code 93 nao tem barras de guarda
        # como o EAN. Descem mais para se verem a olho.
        if i == 0 or i == len(com_asteriscos) - 1:
            guardas.append(len(modulos))

        modulos.extend(_modulos_do(caractere))

    # **A barra de terminacao.**
    #
    # O ZXing acrescenta **uma barra preta** no fim, depois da barra de fim, e sem
    # ela o codigo nao le. Nao e' um start nem um stop: e' a unica barra solitaria
    # do codigo, e o que da ao leitor a certeza de que leu ate ao fim.
    #
    # E' mais uma coisa que a primeira versao nao tinha, e o sintoma foi o pior
    # possivel - o codigo desenhava-se certo, o comprimento era o que o ZXing
    # esperava, e a leitura dava nada **sem dizer porque**.
    modulos.append(True)

    return {
        "simbologia": "Code 93",
        "modulos": modulos,
        "guardas": guardas,
        # **A legenda tem os dois digitos, e o `valor` nao.** O ZXing devolve o
        # texto sem eles, porque sao de controlo e nao fazem parte do dado - mas a
        # etiqueta impressa tem de os ter, e e' obrigatorio numa etiqueta de
        # automovel.
        "legenda": "".join(com_controlos),
        "valores": [INDICE[c] for c in com_asteriscos],
        "verificacao": verificacao,
    }


def _codificar_estendido(texto: str) -> list[str]:
    """
    O texto em codificacao estendida: a lista de caracteres da tabela.

    A tabela do Code 93 tem 48 entradas e **nenhuma e' uma minuscula nem um
    caracter de controlo**. O que ha sao quatro caracteres de escape, escritos no
    ZXing como ``a``, ``b``, ``c`` e ``d``, e cada um marca que o par seguinte se
    le de outra maneira:

    - ``d`` mais uma maiuscula da a minuscula (``dA`` -> ``a``);
    - ``a`` mais uma maiuscula da SH a SB;
    - ``b`` mais uma maiuscula dos restantes, e tem **seis** transformacoes;
    - ``c`` mais uma maiuscula da ``!`` a ``,``.

    **E' uma busca na tabela, e nao uma escada de regras.** Havia tres
    implementacoes desta regra no repositorio e tres nao e' uma regra — a do web
    tinha vinte e quatro dos trinta e dois caracteres de controlo errados, e
    nenhum dos testes a tocava. Os pares vem do ``decodeExtended`` do ZXing
    invertido, pelo mesmo gerador que os 48 padroes.

    **O ``extend`` e' o que torna isto correcto.** A entrada tem uma letra para
    os caracteres do alfabeto e duas para os que precisam de escape, e o
    ``checksum`` conta **um caracter de cada vez**: somar a entrada como uma
    cadeia daria um digito diferente em qualquer texto com minusculas.
    """
    saida: list[str] = []

    for caractere in texto:
        saida.extend(CONTROLES[ord(caractere)])

    return saida


def _dois_controlos(texto: list[str]) -> list[str]:
    """
    Os dois digitos de controlo, como caracteres da tabela.

    O primeiro pesa 1 a 20 e o segundo 1 a 15, e os dois se leem de tras para a
    frente com o peso a subir. **O modulo e' 47** - e nao 43, que e' o numero de
    caracteres de dados - porque na conta entram tambem os quatro de controle e o
    asterisco.
    """
    primeiro = _checksum(texto, 20)

    # **O segundo digito e' calculado sobre o texto mais o primeiro digito**, e o
    # texto e' uma lista. Juntar o digito como caractere e' correcto; juntar
    # `texto + ALFABETO[primeiro]` a uma lista daria a concatenacao com virgula
    # das listas do JavaScript, que e' uma cadeia aparentemente normal e uma
    # virgula que nao esta no indice - e o segundo digito saia errado sem o
    # `checksum` se queixar.
    segundo = _checksum([*texto, ALFABETO[primeiro]], 15)

    return [ALFABETO[primeiro], ALFABETO[segundo]]


def _checksum(texto: list[str], maximo: int) -> int:
    """
    A soma ponderada, com o peso a reiniciar em ``maximo``.

    **O peso reinicia quando passa o maximo, e nao quando chega ao fim.** Somar
    com ``i % maximo`` em vez de um contador que reinicia dava um digito diferente
    em qualquer texto com mais de vinte caracteres - ou seja, quase todos. O
    codigo desenhava-se bem, o primeiro digito batia certo e o segundo nao, e o
    leitor recusava por checksum sem dizer qual dos dois.
    """
    peso = 1
    total = 0

    for caractere in reversed(texto):
        total += peso * INDICE[caractere]
        peso += 1
        if peso > maximo:
            peso = 1

    return total % MODULO_CHECKSUM


def _modulos_do(caractere: str) -> list[bool]:
    """
    Os nove modulos de um padrao.

    **O padrao sao os nove modulos, um a um, do mais significativo para o
    menos**, e nao larguras a extrair nem pares de bits. O `appendPattern` do
    ZXing e'

    .. code-block:: java

        for (i = 0; i < 9; i++) {
          temp = a & (1 << (8 - i));
          target[pos + i] = temp != 0;
        }

    e esta e' a leitura ao inverso, bit a bit: **o bit mais significativo e' o
    primeiro modulo**, e o menos significativo e' o ultimo.

    **Tres versoes erraram aqui, e as tres por tentar ser espertas** - uma leu
    pares de dois bits a comecar em espaco, outra pôs o comprimento nos dois bits
    altos, e uma terceira contou as runs de zeros. Nenhuma deu os nove modulos,
    e a soma de nove e' o que teria dizendo logo qual das hipoteses era a boa.
    """
    padrao = PADROES[INDICE[caractere]]

    modulos = [bool((padrao >> (8 - i)) & 1) for i in range(9)]

    # **O que se verifica aqui e' que o primeiro modulo e' uma barra**, que e' a
    # propriedade de que o leitor depende para ancorar. Um padrao que comece em
    # espaco desenha-se bem e nao e' lido por nada.
    #
    # **E o `gerar-tabelas-code93.py` verifica o mesmo nos 48 valores**, antes de
    # os escrever. Aqui e' a segunda verificacao do mesmo invariante, e nao e'
    # redundancia: o gerador protege a tabela, e isto protege o codigo de uma
    # tabela que um dia chegue errada de outra fonte.
    if not modulos[0]:
        raise ValueError(
            f"Code 93: o padrao {caractere!r} (0x{padrao:03X}) comeca em espaco, "
            f"e o leitor precisa de uma barra para ancorar. A tabela esta errada."
        )

    return modulos


def _validar(texto: str) -> str:
    """
    O que o Code 93 aceita, e o que recusa com a razao.

    :raises ValueError: se o texto estiver vazio, trouxer um asterisco, ou
        trouxer um caractere acima de 127.
    """
    if len(texto) == 0:
        raise ValueError("Code 93: escreve alguma coisa para codificar.")

    # **O asterisco e' a marca de inicio e de fim, e nao pode estar nos dados.**
    #
    # E' o mesmo cuidado que o Code 39 tem, e pela mesma razao: um asterisco nos
    # dados faz o leitor terminar a leitura ali, e o que vem a seguir e' lido
    # como lixo. **O codigo desenha-se e le-se - a metade, que e' pior do que nao
    # ler nada, porque parece que leu.**
    if "*" in texto:
        raise ValueError(
            "Code 93: o asterisco e a marca de inicio e de fim, e nao pode "
            "estar nos dados."
        )

    for caractere in texto:
        ponto = ord(caractere)
        if ponto > 127:
            raise ValueError(
                f"Code 93 e ASCII e {caractere!r} (U+{ponto:04X}) nao e. "
                f"Para acentos ou alfabetos nao latinos, usa QR."
            )

    return texto


#: O registo, pelo id que o selector usa.
#:
#: **A chave e' a mesma nos cinco clientes**, e e' o que a `AGENTS.md` chama de
#: lista escrita duas vezes: o selector de formatos vive no cliente e o registo
#: vive no modulo, e nada os ligava. Da' o GS1-128 ter entrado com o encoder, a
#: validacao, a altura e os casos lidos pelo ZXing, e nao aparecer no selector.
SIMBOLOGIAS_CODE93 = {"code93": code93}
