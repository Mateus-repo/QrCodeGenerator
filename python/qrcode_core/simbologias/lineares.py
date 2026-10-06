"""
Code 39, ITF-14 e Codabar.

    from qrcode_core.simbologias import code39, itf14, codabar

## O bug que estes tres formatos partilham, e que a `AGENTS.md` ja registou

**O Code 39, o ITF e o Codabar tem um caractere de inicio que acaba numa barra, e
o primeiro caractere de dados comeca noutra.** Sem um espaco entre eles, as duas
somam-se numa barra larga a mais.

**O sintoma e' o pior possivel:** o codigo desenha-se com o aspecto certo, o
comprimento total e' quase o certo, e o leitor devolve outra coisa sem dizer
porque. A `AGENTS.md` chama-lhe "o codigo nao lê", e e' a razao de haver aqui um
`_fechar` explicito entre caracteres e nao uma concatenacao.

## As larguras nao sao tabelas, e cada formato tem as suas

| | estreito | largo |
|---|---|---|
| Code 39 | 1 | 3 |
| ITF | 1 | 2 |
| Codabar | 2 | 5 |

**O Codabar e' 5:2 e nao 3:1, e nao e' arbitrario.** E' a razao que a
implementacao de referencia usa, e o leitor mede-a na moldura de paragem e
aplica-a a todo o resto. Um Codabar desenhado a 3:1 tem o aspecto certo e nao le,
porque a barra larga fica curta demais para o leitor a distinguir de duas
estreitas.

## A notacao de `NnWw` e' largura, e a cor vem da posicao

**Letra maiuscula e' largo, minuscula e' estreito — e nao barra e espaco.** Sao
duas perguntas independentes. O que diz se o elemento e' barra ou espaco e' a
**posicao**: as posicoes 0, 2 e 4 sao barras, e 1 e 3 sao espacos.

Confundir as duas coisas foi o primeiro bug do encoder de ITF deste repositorio:
a moldura de paragem ficou com dois elementos em vez de tres, e o codigo nao lia.
"""

from __future__ import annotations

from .tabelas_lineares import (
    COD39_ALFABETO,
    COD39_PADROES,
    COD39_PARAGEM,
    CODE128_PADROES,
    CODE128_PARAGEM,
    CODABAR_INICIO_PARAGEM,
    CODABAR_PADROES,
    ITF_INICIO,
    ITF_PADROES,
    ITF_PARAGEM,
)
from .upcean import SimbologiaError

#: O Code 39, ja expandido a 3:1 pelo `python-barcode`.
#:
#: **Cada entrada tem quinze caracteres, e nao os nove elementos `NnWw` que o
#: ITF e o Codabar usam** — porque o Code 39 tem razao larga/estreita fixa. Sao
#: cinco barras, quatro espacos e o desfecho: **o ultimo elemento e' uma barra**,
#: e por isso que o separador entre caracteres e' acrescentado aqui e nao esta na
#: tabela.
CODE39_ESPACO = 1

#: O ITF. **Estreito 1, largo 2** — e nao 3, como o Code 39.
ITF_LARGURA = {"N": 1, "n": 1, "W": 2, "w": 2}

#: O Codabar, nas duas variantes de espacado.
#:
#: **`espaco` e' o intervalo ENTRE CARACTERES, e nao a largura do espaco.** Sao
#: coisas diferentes e a confusao entre as duas dava um codario com o dobro do
#: espaco e a mesma razao de barras — que tem o aspecto certo e nao le.
#:
#: E `largo` aplica-se a **tanto a barra larga como ao espaco largo**: um `w` tem
#: cinco modulos, o mesmo que um `W`. A razao 5:2 e' entre o elemento largo e o
#: estreito, e nao entre a barra e o espaco.
CODABAR_NORMAL = {"estreito": 2, "largo": 5, "espaco": 2}
CODABAR_LARGO = {"estreito": 2, "largo": 5, "espaco": 3}

#: O espaco entre caracteres no Codabar, em modulos.
CODABAR_ESPACO = 1

#: O Code 39 por indice no alfabeto.
_COD39_INDICE = {c: k for k, c in enumerate(COD39_ALFABETO)}


def _modulos_de(elementos: str, larguras: dict[str, int]) -> list[bool]:
    """
    Converte `NnWw` em modulos.

    **A cor vem da posicao** — 0, 2 e 4 sao barras, 1 e 3 sao espacos — e a
    **largura** vem da caixa da letra. Sao duas perguntas separadas, e
    mistura-las produz uma barra inicial com a largura do espaco.
    """
    saida: list[bool] = []
    for posicao, letra in enumerate(elementos):
        escuro = posicao % 2 == 0
        saida.extend([escuro] * larguras[letra])
    return saida


def _fechar(modulos: list[bool], n: int) -> None:
    """
    Acrescenta o espaco que separa este elemento do proximo.

    **E' a funcao mais importante deste ficheiro.** Sem ela, o caractere de inicio
    — que acaba em barra — encosta ao primeiro caractere de dados — que comeca em
    barra — e as duas fundem-se numa barra larga a mais. O codigo desenha-se com
    o aspecto certo e o leitor devolve outra coisa.

    O mesmo entre o ultimo digito e a moldura de paragem.
    """
    modulos.extend([False] * n)


def _acrescentar_guarda(modulos: list[bool], guardas: list[int], novos: list[bool]) -> None:
    """
    Acrescenta uma moldura e marca os modulos que ela ocupa como guarda.

    **As guardas sao os indices de modulo, e nao de elemento.** E' a distincao que
    estava errada, e ela custava em duas direcoes:

      - **No Codabar**, a moldura do inicio ocupava 23 modulos e a conta dizia
        35. As 12 colunas a mais eram do **primeiro caractere de dados**,
        pintadas mais altas do que deviam — e no Codabar a moldura e' de onde o
        leitor tira a razao larga/estreita, portanto um dado com a altura da
        moldura embaralha essa razao.
      - **No ITF**, a moldura de paragem (`WnN`) tem 3 elementos e ocupa 4
        modulos. A conta dizia 3, e a ultima barra da paragem ficava com a
        altura de um dado.

    **Porque se mede em vez de se contar.** As versoes anteriores usavam
    `len(elementos)` no Code 39 e no ITF, e `len(elementos) * medidas["largo"]` no
    Codabar. A primeira acerta por acaso, porque no Code 39 um elemento e' um
    modulo — e acerta no ITF tambem, na moldura de inicio, porque os quatro
    elementos sao estreitos. A segunda nunca acerta, porque assume que todos os
    elementos da moldura sao largos.

    A regra correcta nao e' uma conta melhor: e' **medir**. A guarda vai de onde
    a moldura comeca ate onde ela acaba, e isso sabe-se porque se acabou de
    acrescentar. E' o que o Java faz, e sem isto as duas stacks divergem sem que
    nenhuma diga.

    @param novos os modulos da moldura, ja' calculados
    """
    inicio = len(modulos)
    modulos.extend(novos)
    guardas.extend(range(inicio, len(modulos)))


# --- Code 39 ---------------------------------------------------------------


def code39(valor: str, *, com_controlo: bool = True, full_ascii: bool = False) -> dict:
    """
    Code 39. Os 43 caracteres do alfabeto, mais o asterisco de moldura.

    ## O digito de controlo, e porque se liga por omissao

    :param com_controlo: acrescenta ao fim um caractere de **modulo 43** — a soma
        dos indices das letras do texto, dividida por 43, e o caractere que fica
        nessa posicao do alfabeto. **Vem ligado por omissao, e e' o que o web
        faz**, e a razao de ser uma opcao e nao um comportamento e' so essa: o
        que interessa e' que os dois clientes produzam o mesmo codigo.

    **O ZXing devolve o texto sem o caractere de controlo**, mesmo quando o
    codigo o tem. E' por isso que o verificador le `CODE-39` e nao
    `CODE-39` mais uma letra, e por isso que um `DIVERGE` aqui **nao e' prova de
    nada**: o leitor faz a conta, confirma, e descarta. Um `NAO LEU` e' que e' o
    sinal de que o encoder esta partido.

    :param full_ascii: cada caractere ASCII vai para a letra mais proxima, e o
        texto volta a descer no fim. **E' uma opcao, nao o normal** — o Code 39
        normal so tem 43 caracteres, e e' o que um leitor de supermercado le sem
        duvida.

    **O texto sobe a maiusculas, e nao e' opcional.** O Code 39 e' um formato de
    caixa alta por desenho: `a` e `A` sao o mesmo caractere. **Escrever o que o
    utilizador escreveu, em minusculas, nao dava um codigo diferente — dava o
    mesmo codigo com a legenda diferente**, e quem imprimisse a legenda com o
    que escreveu veria um `a` no papel e um `A` no leitor.
    """
    texto = str(valor).upper()

    if not texto:
        raise SimbologiaError("Code 39: o texto esta vazio.")

    if texto == "*":
        raise SimbologiaError(
            "Code 39: o asterisco e o caractere de inicio e de paragem, e nao "
            "pode estar nos dados. Para o imprimir na letra use o Full ASCII."
        )

    if full_ascii:
        texto = "".join(_ASCII_PROXIMO.get(c, c) for c in texto)

    for caractere in texto:
        if caractere not in _COD39_INDICE:
            raise SimbologiaError(
                f"Code 39: o caractere {caractere!r} nao existe neste formato "
                f"(sao {''.join(COD39_ALFABETO)})"
            )

    # **O digito de controlo, modulo 43.** A soma e' dos indices das letras, a
    # divisao por 43 da um resto, e o digito e' a letra desse indice.
    #
    # **Este comentario dizia antes "a soma dividida por 43 da o indice da letra
    # que falta para a soma dar inteiro", que e' a regra complementar — e essa
    # nao e' a do formato.** A regra e' o resto. A autoridade e' a documentacao
    # do ZPL da Zebra, com o exemplo trabalhado: `12345ABCDE/` soma 115,
    # `115 / 43 = 2` com resto 29, e 29 e' a letra `T`. O ZXing lido com o
    # `Code39Reader(true)`, que valida o digito, aceita este e rejeita o
    # complementar.
    #
    # **A distincao entre "o resto" e "o que falta para dar inteiro" e' o que
    # mudou o payload de tres stacks uma vez.** Um comentario ao contrario
    # convida a corrigir, e o que estava a ser observado como possivel bug era
    # o proprio bug: o comentario.
    dados = texto
    if com_controlo:
        soma = sum(_COD39_INDICE[c] for c in texto)
        dados = texto + COD39_ALFABETO[soma % 43]

    # **O asterisco nao esta no alfabeto.** O `python-barcode` guarda-o a parte,
    # em `EDGE`, e nao como uma das 43 entradas — porque nao e' um caractere que o
    # utilizador escreva, e' a moldura. Procurar o `*` no alfabeto rebentava com
    # um `ValueError` em vez de dar um codigo, o que e' ao menos um sintomo
    # honesto; o pior era um `COD39_ALFABETO.index("*")` que devolva `-1` e vao
    # codificar a ultima letra do alfabeto como se fosse a moldura.
    modulos: list[bool] = []
    guardas: list[int] = []

    def moldura(separar: bool) -> None:
        # **As guardas sao a moldura**, e medem-se aqui porque e' o sitio onde se
        # sabe onde ela comeca. A guarda e' a barra mais alta do desenho, e e' a
        # ancora que o leitor usa para localizar o codigo — um Code 39 sem ela
        # desenha-se e le-se, mas "as vezes", que e' o tipo de falha que a
        # `AGENTS.md` diz que nunca entra.
        _acrescentar_guarda(modulos, guardas,
                            [bit == "1" for bit in COD39_PARAGEM])
        # **O separador entre caracteres.** A tabela acaba em barra e a seguinte
        # comeca em barra; sem este espaco as duas somam-se numa barra larga a
        # mais, e o codigo tem o aspecto certo e nao le.
        if separar:
            _fechar(modulos, CODE39_ESPACO)

    # **O asterisco de paragem nao tem separador atras**, e a razao e' a mesma de
    # nao ter nada a separar: e' a ultima coisa do codigo. **Acrescentar mesmo
    # assim dava um codigo um modulo mais largo que o do web**, que nao se le
    # pior — o ZXing le-o na mesma — e por isso e' um bug que so a comparacao
    # byte a byte apanha. E' o tipo de divergencia que a `AGENTS.md` diz que
    # **passa no teste das duas stacks e falha na etiqueta**.
    moldura(separar=True)
    for caractere in dados:
        modulos.extend(bit == "1" for bit in COD39_PADROES[_COD39_INDICE[caractere]])
        _fechar(modulos, CODE39_ESPACO)
    moldura(separar=False)

    return {
        "simbologia": "Code 39",
        "modulos": modulos,
        "guardas": guardas,
        "legenda": dados,
        "semControlo": texto,
    }


#: A proxima letra, para o modo ASCII completo.
#:
#: **O criterio e' o mais proximo do alfabeto do Code 39**, e nao "remover o que
#: nao existe": `:;<=>?@` vao todos para `-`, porque sao todos um `menos` aos
#: olhos de quem vai ler. Um `:`, que e' "proporcao", e um `-`, que e' "ate",
#: dariam o mesmo codigo — e a legenda diria `:` onde o codigo e' `-`.
_ASCII_PROXIMO = {
    " ": " ", "!": "-", '"': "-", "#": "-", "$": "$", "%": "%", "&": "+",
    "'": "-", "(": "-", ")": "-", "*": "-", "+": "+", ",": ".", "-": "-",
    ".": ".", "/": "/", ":": "-", ";": "-", "<": "-", "=": "-", ">": "-",
    "?": "-", "@": "-", "[": "-", "\\": "-", "]": "-", "^": "-", "_": "-",
    "`": "-", "{": "-", "|": "-", "}": "-", "~": "-",
}


# --- ITF -------------------------------------------------------------------


def itf(valor: str) -> dict:
    """
    ITF. **So digitos**, e sempre em numero par.

    **Os digitos leem-se aos pares, e e' por isso que o numero tem de ser par.**
    Um digito isolado nao tem par com quem ler, e o ITF nao tem como dizer onde
    acaba o codigo — o unico elemento de paragem do formato e' a moldura, e uma
    moldura a meio le-se como fim de codigo e o resto como outro codigo.

    **O ITF nao tem digito de controlo.** E' a contrapartida de ser tao compacto:
    dez digitos ocupam o mesmo que quinze no Code 39, e em troca um digito trocado
    na leitura nao da erro nenhum. Por isso que o ITF-14 acrescente um.
    """
    digitos = "".join(c for c in str(valor) if not c.isspace() and c != "-")

    if not digitos:
        raise SimbologiaError("ITF: o texto esta vazio.")
    if not digitos.isdigit():
        raise SimbologiaError(f"ITF: so aceita digitos, recebeu {valor!r}")
    if len(digitos) % 2 != 0:
        raise SimbologiaError(
            f"ITF: {len(digitos)} digitos, e o formato le-os aos pares. "
            "Faltou um digito. Se o numero e' fixo, use ITF-14, que acrescenta "
            "o digito de controlo que falta."
        )
    return _itf(digitos)


def _itf(digitos: str) -> dict:
    modulos: list[bool] = []
    guardas: list[int] = []

    # **A moldura de inicio**, que e' guarda. Mede-se, e nao se conta: aqui os
    # quatro elementos sao estreitos e a conta antiga acertava por acaso, mas a
    # moldura de paragem mais abaixo tem 3 elementos e 4 modulos, e ai nao
    # acertava.
    _acrescentar_guarda(modulos, guardas, _modulos_de(ITF_INICIO, ITF_LARGURA))

    for i in range(0, len(digitos), 2):
        barras = ITF_PADROES[int(digitos[i])]
        espacos = ITF_PADROES[int(digitos[i + 1])]

        # **A intercalacao.** As larguras do primeiro digito vao nas barras, as do
        # segundo nos espacos, elemento a elemento. E' o "interleaved" que da o
        # nome ao formato: um par de digitos ocupa as mesmas cinco posicoes que
        # um digito so.
        for e in range(5):
            modulos.extend([True] * ITF_LARGURA[barras[e]])
            modulos.extend([False] * ITF_LARGURA[espacos[e]])

        # **Aqui nao ha separador, ao contrario do Code 39 e do Codabar, e o
        # motivo e' a propria intercalacao.** O par termina no elemento `e = 4` do
        # segundo digito, que e' desenhado como **espaco** — porque na
        # intercalacao quem decide a cor e' a posicao no par, e a ultima posicao
        # e' um espaco. O par seguinte comeca em barra, e barra depois de espaco
        # e' o que o formato quer.
        #
        # **Acrescentar aqui o mesmo `_fechar` que o Code 39 usa junta dois
        # espacos num so**, o que muda a largura do ultimo espaco do par e
        # desloca todos os digitos seguintes. **O sintoma e' o pior dos
        # possiveis: o codigo desenha-se com o aspecto certo e o leitor nao le
        # nada** — que e' exactamente o que aconteceu, e o que o `AGENTS.md`
        # descreve quando fala do ITF.
        #
        # E' tambem a razao de a `AGENTS.md` falar do separador como um risco
        # **destes tres formatos e nao como uma regra dos tres**: o problema e'
        # acrescentar o separador onde nao e' preciso, tao como e' nao o
        # acrescentar onde e'.

    # A moldura de paragem, com os seus **tres** elementos — e tambem guarda.
    #
    # **E' aqui que a conta antiga errava.** `len(ITF_PARAGEM)` e' 3, e a
    # moldura ocupa 4 modulos: `WnN` e' uma barra larga, um espaco estreito e
    # uma barra estreita, 2 + 1 + 1. A guarda ficava uma coluna curta e a
    # ultima barra da paragem saia com a altura de uma barra de dados — que e'
    # exactamente a barra que distingue a paragem.
    _acrescentar_guarda(modulos, guardas, _modulos_de(ITF_PARAGEM, ITF_LARGURA))

    return {
        "simbologia": "ITF",
        "modulos": modulos,
        "guardas": guardas,
        "legenda": digitos,
    }


def itf14(valor: str) -> dict:
    """
    ITF-14: treze digitos de dados mais um de controlo, sempre quatorze.

    **O GTIN-14 pesa 3, 1, 3, 1 a partir da esquerda**, que e' a regra da GS1 para
    este numero, e nao a do EAN-13.

    ## A direccao dos pesos nao se nota aqui, e vale a pena dizer porquê

    A primeira versao deste comentario afirmava que "usar a regra do EAN dava
    sempre um digito errado", e **estava errado**. Com treze digitos — e o ITF-14
    tem sempre treze — os pesos alternados a partir da esquerda e a partir da
    direita dao a mesma soma: com um numero impar, as duas direcoes comecam com o
    peso 3. `1234567890128` da 124 das duas maneiras, e as duas regras devolvem
    `6`.

    **A diferenca so aparece com um numero par**, e o ITF simples tem um: sao
    sempre digitos aos pares. E' por isso que `itf()` aceita qualquer comprimento
    par e `itf14()` so treze.

    O que fica escrito e' a regra como ela e' — 3 a partir da esquerda — porque e'
    a da GS1 para o GTIN-14 e porque nao depende de a soma sair igual. **Um
    comentario que affirme uma consequencia que nao acontece e' pior do que
    nenhum**: da a sensacao de que o bug existiu, e a proxima pessoa vai
    procurar por ele em vez de o ver no sitio.
    """
    digitos = "".join(c for c in str(valor) if not c.isspace() and c != "-")

    if not digitos.isdigit():
        raise SimbologiaError(f"ITF-14: so aceita digitos, recebeu {valor!r}")
    if len(digitos) != 13:
        raise SimbologiaError(
            f"ITF-14: espera 13 digitos de dados, recebeu {len(digitos)}. "
            "O ultimo, o digito de controlo, calcula-se sozinho."
        )

    soma = 0
    for i in range(13):
        soma += int(digitos[i]) * (3 if i % 2 == 0 else 1)
    controlo = (10 - (soma % 10)) % 10

    codigo = _itf(digitos + str(controlo))
    codigo["simbologia"] = "ITF-14"
    codigo["digitoControlo"] = controlo
    return codigo


# --- Codabar ---------------------------------------------------------------


def codabar(
    valor: str,
    *,
    inicio: str = "A",
    paragem: str = "A",
    largo: bool = False,
) -> dict:
    """
    Codabar. Os doze caracteres de dados, mais os quatro de moldura.

    ## O valor e' so os dados, e a moldura sao opcoes

    **Este `valor` nao leva o `A` do inicio nem o da paragem.** Sao os parametros
    `inicio` e `paragem`, e o que fica no meio e' o texto.

    A primeira versao desta funcao pegava na cadeia toda e tirava as pontas —
    `codabar("A123456A")` — que e' a leitura mais natural e **esta errada**. A
    razao e' a `AGENTS.md`: duas implementacoes do mesmo campo com semanticas
    diferentes sao um bug de paridade, **mesmo que o teste de cada uma passe**,
    porque cada uma le a que ela espera e nenhuma acusa a outra. O web recebe os
    dados e a moldura separada, e o arbrito e' o web.

    ## Os caracteres de moldura nao podem estar nos dados

    E' a mesma razao pela qual eles sao opcoes: `A`, `B`, `C` e `D` **so
    existem nas pontas**, e um `A` no meio do texto e' invalido. Sem esta
    verificacao um `A` no meio era codificado com a tabela de dados, e o leitor
    lia aquilo como um `A` de moldura — o codigo **passava a parte estrutural**
    e partia a meio.

    :param inicio: o caracter de moldura do inicio, `A`, `B`, `C` ou `D`.
    :param paragem: o da paragem, dos mesmos quatro.
    :param largo: a variante de espacado largo, com tres modulos de intervalo
        entre caracteres em vez de dois. **E' uma opcao, e nao o normal** — e
        existe para leitores que medem a distancia entre barras em vez de medirem
        o tempo, e e' mais larga para isso.

    ## A armadilha, e a razao de o intervalo estar em tres sitios

    **O intervalo entre caracteres tem de estar em `todos` os espacos, e o
    intervalo que mais se esquece e o primeiro** — entre a moldura de inicio e o
    primeiro dado. A moldura acaba numa barra e o primeiro dado comeca noutra, e
    coladas somam-se numa barra larga a mais. O codigo tem o aspecto certo e nao
    le, que e' o sintoma que a `AGENTS.md` descreve para estes tres formatos.

    Por isso que a montagem tem o intervalo em **tres** sitios explicitos e nao
    num `join`: depois da moldura de inicio, depois de cada dado, e nunca depois
    da de paragem — essa e' a ultima coisa do codigo e nao ha a quem se separar.
    """
    dados = str(valor).upper()

    if not dados:
        raise SimbologiaError("Codabar: o texto esta vazio.")

    for nome, letra in (("inicio", inicio), ("paragem", paragem)):
        if letra not in CODABAR_INICIO_PARAGEM:
            raise SimbologiaError(
                f"Codabar: {nome} e paragem tem de ser A, B, C ou D, e "
                f"recebeu {letra!r}"
            )

    for caractere in dados:
        if caractere in CODABAR_INICIO_PARAGEM:
            raise SimbologiaError(
                f"Codabar: {caractere!r} e um caractere de inicio ou de paragem "
                "e nao pode estar nos dados. A, B, C e D so existem nas pontas."
            )
        if caractere not in CODABAR_PADROES:
            raise SimbologiaError(
                f"Codabar: o caractere {caractere!r} nao existe neste codigo."
            )

    medidas = CODABAR_LARGO if largo else CODABAR_NORMAL

    def elementos_de(caractere: str) -> str:
        if caractere in CODABAR_INICIO_PARAGEM:
            return CODABAR_INICIO_PARAGEM[caractere]
        return CODABAR_PADROES[caractere]

    def modulos_de(elementos: str) -> list[bool]:
        """
        Os sete elementos de um caracter.

        **A cor vem da posicao** — 0, 2, 4 e 6 sao barras, os outros espacos — e a
        **largura vem da letra**: `W` e `w` sao largos, `N` e `n` sao estreitos.

        **E' aqui que a confusao entre as duas coisas custa caro.** Ler a largura
        pela caixa da letra daria ao `w` a largura de um `n`, e o codario saia
        sem um unico espaco largo — o que e' exactamente o que o primeiro bug
        deste encoder fez.
        """
        saida: list[bool] = []
        for posicao, letra in enumerate(elementos):
            escuro = posicao % 2 == 0
            largo_ = letra in ("W", "w")
            saida.extend([escuro] * (medidas["largo"] if largo_ else medidas["estreito"]))
        return saida

    modulos: list[bool] = []
    guardas: list[int] = []

    # A moldura de inicio, que e' guarda. **O Codabar tem a moldura mais
    # informativa dos tres** — e' dela que o leitor tira a razao larga/estreita
    # e a separa-la do resto e' o que mantem essa razao certa em todo o codigo.
    # A moldura de inicio. **A conta anterior era `len(moldura) * largo`**, que
    # assume que todos os elementos sao largos. Nao sao: a moldura do `A` ocupa
    # 23 modulos e a conta dava 35, e as 12 colunas a mais eram do primeiro
    # caractere de dados — pintadas com a altura da moldura, que e' de onde o
    # leitor tira a razao larga/estreita. Ver `_acrescentar_guarda`.
    moldura_inicio = elementos_de(inicio)
    _acrescentar_guarda(modulos, guardas, modulos_de(moldura_inicio))
    _fechar(modulos, medidas["espaco"])

    # Os dados, cada um seguido do seu intervalo — inclusive o ultimo, que e' o
    # que o separa da moldura de paragem.
    for caractere in dados:
        modulos.extend(modulos_de(elementos_de(caractere)))
        _fechar(modulos, medidas["espaco"])

    # A moldura de paragem, sem intervalo atras: e' a ultima coisa do codigo.
    moldura_paragem = elementos_de(paragem)
    _acrescentar_guarda(modulos, guardas, modulos_de(moldura_paragem))

    return {
        "simbologia": "Codabar",
        "modulos": modulos,
        "guardas": guardas,
        "legenda": inicio + dados + paragem,
        "inicio": inicio,
        "paragem": paragem,
        "largo": largo,
    }


# --- Code 128 ---------------------------------------------------------------

#: Os valores de inicio, por conjunto.
CODE128_INICIO = {"A": 103, "B": 104, "C": 105}

#: Os valores que mudam de conjunto a meio da leitura.
CODE128_IR = {"A": 101, "B": 100, "C": 99}

#: A paragem, e o valor dela na tabela.
CODE128_PARAGEM_VALOR = 106

#: Os conjuntos, pela ordem em que se listam.
CODE128_CONJUNTOS = ("A", "B", "C")


def _larguras_do_padrao(cadeia: str) -> list[int]:
    """
    As larguras dos elementos, lidas nas corridas da cadeia.

    **A cadeia e' a soma das larguras**, e nao os elementos: `212222` sao seis
    elementos que somam onze modulos. Uma corrida de um e' um elemento estreito,
    e uma de tres e' um largo.

    **Esta e' a unica funcao deste ficheiro que converte `0` e `1` em larguras.**
    O Code 39 nao precisa dela, porque a tabela dele ja vem com as larguras
    aplicadas; a do Code 128 vem com a soma. Sao duas representacoes da mesma
    ideia, e e' por isso que `spec/gerar-tabelas-lineares.py` confere cada uma
    com o comprimento que lhe cabe.
    """
    larguras: list[int] = []
    atual = cadeia[0]
    contagem = 1
    for caractere in cadeia[1:]:
        if caractere == atual:
            contagem += 1
        else:
            larguras.append(contagem)
            atual = caractere
            contagem = 1
    larguras.append(contagem)
    return larguras


def _modulos_do_padrao(valor: int) -> list[bool]:
    """
    Os modulos de um valor, alternando barra e espaco a partir da barra.

    **A posicao e' que diz a cor, e nao o digito da cadeia** — a cadeia so tem
    `0` e `1` para dizer a largura, e a barra inicial e' sempre barra.
    """
    if not 0 <= valor <= CODE128_PARAGEM_VALOR:
        raise SimbologiaError(f"Code 128: o valor {valor} nao existe")

    cadeia = (
        CODE128_PARAGEM
        if valor == CODE128_PARAGEM_VALOR
        else CODE128_PADROES[valor]
    )

    modulos: list[bool] = []
    for posicao, largura in enumerate(_larguras_do_padrao(cadeia)):
        modulos.extend([posicao % 2 == 0] * largura)
    return modulos


def _valor_no_conjunto(caractere: str, conjunto: str) -> int:
    """
    O valor de um caracter ASCII dentro de um conjunto.

    **No `A`, os valores 0 a 63 sao o proprio ASCII e os 64 a 95 sao as
    maiusculas com 32 subtraidos** — e' a diferenca entre o conjunto A e o B. `A`
    vale 33 no A e 65 no B, e e' essa diferenca que torna a troca de conjunto
    obrigatoria em vez de opcional.

    **No `B` e sempre ASCII menos 32.** No `C` nao ha caracteres, so pares de
    digitos: quem chama ja passou os digitos.
    """
    codigo = ord(caractere)
    if conjunto == "A":
        return codigo if codigo <= 63 else codigo - 32
    return codigo - 32


def _melhor_conjunto(texto: str, i: int) -> str:
    """
    O conjunto em que vale a pena codificar a partir desta posicao.

    **Dois digitos seguidos vao em `C`**, porque dois caracteres cabem num so
    valor de 0 a 99. Um digito isolado **nao**: sair de `B` para `C` e voltar
    custa tres caracteres para gravar um, e o codigo fica maior sem ganho.
    """
    if i + 1 < len(texto) and texto[i].isdigit() and texto[i + 1].isdigit():
        return "C"
    if ord(texto[i]) < 32:
        return "A"
    return "B"


def _conjunto_inicial(texto: str) -> str:
    """
    Com que conjunto se comeca.

    **So o `C` vale a pena quando ha quatro digitos seguidos** — ai cada par
    gasta um caracter em vez de dois, e o ganho paga a troca. Com dois digitos o
    `C` poupa um caracter e a troca custa um: fica igual, e nao vale a pena.

    **O `A` so quando o texto comeca por um controlo.** As maiusculas vivem em A
    e em B com o mesmo valor, e o B tambem transporta os minusculos, portanto
    comecar em A para uma letra nao traria nada.
    """
    if ord(texto[0]) < 32:
        return "A"
    for i in range(len(texto) - 3):
        if all(c.isdigit() for c in texto[i : i + 4]):
            return "C"
    return "B"


def _valores(texto: str, forcar: str | None) -> list[int]:
    """
    O texto na lista de valores, ja com as trocas de conjunto.

    **A cada posicao pergunta-se qual e' o melhor conjunto para o que vem a
    seguir, e se for diferente do em que estamos emite-se o caracter de troca.**

    E' o passo que o primeiro bug deste encoder esquecia, e a razao de o erro
    ser silencioso: o codigo tem o comprimento certo, o leitor le, e devolve
    outra coisa.
    """
    conjunto = forcar or _conjunto_inicial(texto)
    saida: list[int] = [CODE128_INICIO[conjunto]]

    i = 0
    while i < len(texto):
        desejado = forcar if forcar else _melhor_conjunto(texto, i)

        if desejado != conjunto:
            saida.append(CODE128_IR[desejado])
            conjunto = desejado

        if conjunto == "C":
            saida.append(int(texto[i : i + 2]))
            i += 2
        else:
            saida.append(_valor_no_conjunto(texto[i], conjunto))
            i += 1

    return saida


def code128(valor: str, *, forcar_conjunto: str | None = None) -> dict:
    """
    Code 128. Os 128 caracteres do ASCII, e mais, por troca de conjunto.

    :param forcar_conjunto: fixa um conjunto (`"A"`, `"B"` ou `"C"`) em vez de o
        escolher. **Serve para comparar com outra implementacao, nunca em
        producao**: forcar o `C` sobre texto que nao e' todo de digitos da um
        codigo maior sem ganho nenhum.

    ## A troca de conjunto, que e' a unica coisa realmente dificil

    Os tres conjuntos se sobrepoem. O `A` transporta os controlos e as
    maiusculas, o `B` o ASCII imprimivel, e **ambos usam o mesmo valor para as
    maiusculas**. O `C` so transporta digitos, dois por valor.

    Como os valores se sobrepoem, **o leitor nao sabe em que conjunto le sem uma
    pista**, e a pista e' o caracter de troca. Sem ele o codigo desenha-se
    perfeito, o leitor le, e devolve caracteres completamente errados: `ABC123`
    volta como `ABC,3`.

    **Nenhum teste estrutural apanha a falta da troca** — o comprimento ate
    batia certo. So a leitura a mostra, que e' o nivel dois da `AGENTS.md`.

    ## O valor de verificacao nao e' um digito

    E' a **soma ponderada dos valores de conjunto, modulo 103** — o inicio mais
    cada valor multiplicado pela sua posicao, a primeira a valer 1. **Pode
    valer de 0 a 102**, e por isso que nao e' um digito como o do EAN: um valor
    de troca de conjunto pode valer 102, e um digito de controlo de EAN nunca
    passaria de 10.

    **Um verificador de EAN aplicado aqui daria sempre um valor errado**, e o
    sintoma seria o pior dos possiveis: o codigo **desenha-se, o leitor le-o, e
    recusa-o** por o valor de verificacao.
    """
    texto = str(valor)

    if not texto:
        raise SimbologiaError("Code 128: o texto esta vazio.")

    for caractere in texto:
        codigo = ord(caractere)
        if codigo == 128:
            raise SimbologiaError(
                "Code 128: o valor 128 e' o da paragem e nao pode estar nos dados."
            )
        if codigo > 127:
            raise SimbologiaError(
                f"Code 128: so ASCII, e {caractere!r} (U+{codigo:04X}) nao e. "
                "Para acentos e alfabetos nao latinos use o QR."
            )

    forcado: str | None = None
    if forcar_conjunto:
        forcado = forcar_conjunto.upper()
        if forcado not in CODE128_INICIO:
            raise SimbologiaError(
                f"Code 128: o conjunto {forcar_conjunto!r} nao existe (A, B ou C)"
            )

    dados = _valores(texto, forcado)

    soma = dados[0]
    for i in range(1, len(dados)):
        soma += dados[i] * i
    verificacao = soma % 103

    todos = [*dados, verificacao, CODE128_PARAGEM_VALOR]

    modulos: list[bool] = []
    for valor in todos:
        modulos.extend(_modulos_do_padrao(valor))

    return {
        "simbologia": "Code 128",
        "modulos": modulos,
        # **O Code 128 nao tem barras-guarda como o EAN.** E' a barra final de
        # dois modulos da paragem que serve de referencia, e marcar as pontas
        # como guardas fazia-as descer mais do que o leitor espera.
        "guardas": [],
        "legenda": texto,
        "valores": todos,
        "verificacao": verificacao,
        "conjunto": forcado or _conjunto_inicial(texto),
    }


#: O registo, pelo id que o selector usa.
#:
#: **A chave e' a mesma nos sete clientes**, e e' o que a `AGENTS.md` chama de
#: lista escrita duas vezes: o selector de formatos vive no cliente e o registo
#: vive no modulo, e nada os ligava. Da' o GS1-128 ter entrado com o encoder, a
#: validacao, a altura e os casos lidos pelo ZXing, e nao aparecer no selector.
SIMBOLOGIAS_LINEARES = {
    "code39": code39,
    "itf": itf,
    "itf14": itf14,
    "codabar": codabar,
    "code128": code128,
}
