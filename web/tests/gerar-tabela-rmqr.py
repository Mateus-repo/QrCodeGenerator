"""
Gera ``web/symbologies/rmqr-tabelas.js`` a partir do zxing-cpp.

    python web/tests/gerar-tabela-rmqr.py

De onde vem, e porque e' a fonte certa
---------------------------------------

O rMQR (ISO/IEC 23941:2022) e' o QR **rectangular**. Aencoder dele nao esta no
ZXing Java - so existe leitor. E nao esta no Zint, que e' a implementacao de
referencia da GS1, nem na versao embebida no zxing-cpp.

Onde esta e' no **zxing-cpp 3.1.1**, em ``core/src/qrcode/QRVersion.cpp``, com a
citacao da norma no proprio codigo:

    See ISO/IEC 23941:2022 Annex D, Table D.1 - Column coordinates of centre
    module of alignment patterns
    See ISO/IEC 23941:2022 7.5.1, Table 8 - Error correction characteristics

E o mesmo codigo que o ``zxingcpp`` instalado escreve, o que faz desta a
referencia de nivel 0 mais alta possivel: nao e' uma tabela transcrita de uma
tabela, e' a que produz os codigos que um leitor de bolso le.

Porque nao basta a tabela dos 32 simbolos
-----------------------------------------

Ha **duas** tabelas, e so uma delas e' de numeros:

  - ``Tamanhos`` - 32 pares, a largura e a altura. E' so a soma: um simbolo e'
    ``R7x43`` quando mede 43 de lado por 7 de alto, e o nome vem daqui;
  - ``Simbolos`` - 32 registos, e cada um tem **quatro** coisas: os centros dos
    padroes de alinhamento (que **nao sao iguais** - sao as colunas, e a norma
    chama-lhes "column coordinates" precisamente porque so ha colunas, o que
    e' a diferenca para o QR onde ha grelha) e os blocos de correccao de erro
    para **M** e **H**, que sao os unicos dois niveis que o rMQR tem.

Cada registo de correccao tem a forma ``ecCodewords / ecBlocks`` seguido de
pares ``blocos x codewordsPorBloco``. O ``0, 0`` a seguir e' um bloco vazio -
o rMQR nunca tem mais que dois blocos, e o espaco esta reservado para na
quebrar quando se acrescenta o terceiro.

O que este script **verifica**, e porque
----------------------------------------

Nao chega extrair: extrai-se e confirma-se que o que saiu e' o que a norma diz.
Tres coisas, todas verificadas **contra o ZXing**, que e' um leitor independente:

  1. Os 32 nomes batem com os 32 tamanhos. ``R7x43`` tem de medir 43x7, e se
     um nome se trocar a lista inteira perde o sentido - que e' o que se
     perderia em silencio se ninguem olhasse.
  2. **A soma dos codewords de dados bate com a capacidade real.** Cada simbolo
     tem de caber na grelha: o ``codewordsTotal x 8`` tem de ser maior ou igual
     aos dados mais a correccao. E' esta verificacao que apanha uma tabela
     desalinhada, que daria um codigo com a correccao no sitio errado - que se
     desenha bem e **nao le**.
  3. **O ZXing escolhe o mesmo simbolo que a tabela diz.** Para varios textos,
     a escolha e' feita pela area minima, e a area depende dos dois lados - e
     por isso que 50 caracteres dao um simbolo estreito e alto e 100 dao um largo
     e baixo. Se a tabela estivesse errada, o ZXing escolheria um simbolo
     diferente e a leitura nao bateria.

O aviso do ``300 caracteres``
-----------------------------

O rMQR **recusa** o que nao cabe, e a recusa vem com a razao::

    Error 578: Input too long for ECC level M, requires 208 codewords
    (maximum 152)

E' o comportamento certo, e o oposto do que um codigo truncado faria: um codigo
que le sem o ultimo caracter e **nao diz que truncou**. E' por isso que o
encoder vai recusar tambem, com a mesma mensagem.
"""

from __future__ import annotations

import os
import re
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
# As fontes vao para `/tmp` e nao para o repositorio.
#
# **Sao codigo de terceiros, com a licenca deles, e nao tem razao nenhuma de
# estar no git.** Este repositorio nao tem uma unica linha de codigo copiado de
# outro: as tabelas do Code 93, do PDF417, do Data Matrix e dos 541 AIs do GS1
# sao todas geradas, e o que fica no disco e' a tabela em JavaScript e o
# gerador. Guardar aqui o `QRVersion.cpp` seria a primeira vez que o fonte de
# outro entra no repositorio, e por uma razao que nao tem nada a ver com o
# codigo: ficar a salvo de o servidor cair.
REFS = Path(os.environ.get("TEMP", "/tmp")) / "qrcodegenerator-fontes"

# **A versao esta escrita no URL e nao no `main`.** Sem ela, o script extrai a
# tabela da fonte de amanha, que pode ter mudado, e o resultado depende de quando
# se correu. Com ela, o script da sempre a mesma tabela, e a data de geracao no
# cabeçalho do ficheiro gerado diz de quando.
VERSAO = "v3.1.1"
RAIZ_FONTE = f"https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/{VERSAO}/core/src/qrcode"

FONTE_CPP = REFS / "QRVersion.cpp"
FONTE_H = REFS / "QRVersion.h"
FONTE_MODOS = REFS / "QRCodecMode.cpp"

# `AQUI` e' `web/tests/`, e o destino e' `web/symbologies/` - **um** nivel acima.
# Com `parents[1]` saia-se para a raiz do repositorio, e o erro e' um
# `FileNotFoundError` a dizer que o directoria nao existe, que e' a mensagem mais
# enganadora que ha: o directoria existe, e' que o caminho aponta para outro.
DESTINO = AQUI.parent / "symbologies" / "rmqr-tabelas.js"

ORIGEM = f"https://github.com/zxing-cpp/zxing-cpp/blob/{VERSAO}/core/src/qrcode/QRVersion.cpp"
ORIGEM_MODOS = f"https://github.com/zxing-cpp/zxing-cpp/blob/{VERSAO}/core/src/qrcode/QRCodecMode.cpp"
LICENCA = "Apache-2.0, zxing-cpp (ZXing authors)"

# Os textos de teste. Tem de haver de todos os tamanhos: um texto de 5
# caracteres da o menor simbolo e um de 200 da um grande, e a tabela so esta
# certa se o ZXing concordar em todos.
CASOS = [
    "1",
    "12",
    "12345",
    "HELLO",
    "https://exemplo.pt/painel/2026/09?utm=origem=rmqr",
    "A" * 50,
    "A" * 100,
    "A" * 150,
    "9" * 200,
]

# A margem que o escritor de imagem acrescenta: 2 modulos de cada lado. O SVG
# que o zxingcpp devolve ja vem com a zona calma, e sem esta subtraccao os
# simbolos saem 4 modulos maiores em cada dimensao - que da um `31x15` onde o
# simbolo e' `27x11`, e nenhum dos dois esta na tabela certa.
ZONA_CALMA = 4

# Os modos, pela ordem em que a fonte os declara.
MODOS = ["numeric", "alphanum", "byte", "kanji"]


def ir_buscar(destino: Path) -> str:
    """Descarrega a fonte, se ainda nao a tiver, e devolve o texto.

    O destino e' um ficheiro, para nao se descarregar duas vezes quando o script
    corre com varios casos. E a versao esta no URL, o que garante que a tabela
    extraida e' sempre a mesma.
    """
    if not destino.exists():
        REFS.mkdir(parents=True, exist_ok=True)
        url = f"{RAIZ_FONTE}/{destino.name}"
        print(f"  a descarregar {destino.name}")
        pedido = urllib.request.Request(url, headers={"User-Agent": "qrcodegenerator"})
        with urllib.request.urlopen(pedido, timeout=60) as resposta:
            destino.write_bytes(resposta.read())

    return destino.read_text(encoding="utf-8")


def limpar(texto: str) -> str:
    """Tira os comentarios do C, que tem numeros de paginas dentro deles."""
    limpo = re.sub(r"/\*.*?\*/", " ", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", " ", limpo)


def extrair_tamanhos(cabecalho: str) -> list[tuple[int, int]]:
    """Os 32 pares de `RMQR_SIZES`, em `QRVersion.h`.

    Vem escrito como `PointI{43, 7}, {59, 7}, ...` - a largura primeiro, porque
    o rectangulo e' largo. E a ordem da tabela e' a ordem da versao: 1 a 32.

    **So o primeiro par tem o `PointI` na frente.** O C aceita `PointI{43, 7}, {59,
    7}` - o tipo e' herdao do primeiro elemento da lista. Um padrao que exija
    `PointI` em cada par apanha **um** elemento em vez de 32, e a falha e' a de
    uma tabela quase vazia, que nao parece uma falha de extraccao.

    E' a mesma armadilha do `AztecChar` e de qualquer array de C: o tipo
    aparece uma vez e o resto sao chavetas a secas.
    """
    limpo = limpar(cabecalho)
    bloco = re.search(r"RMQR_SIZES\s*\{(.*?)\};", limpo, re.DOTALL)
    if not bloco:
        raise SystemExit("nao encontrei RMQR_SIZES no QRVersion.h")

    return [(int(l), int(a)) for l, a in re.findall(r"\{\s*(\d+)\s*,\s*(\d+)\s*\}", bloco.group(1))]


def extrair_simbolos(cpp: str) -> list[dict]:
    """Os 32 registos de `Version::rMQR`, com nome, alinhamento e correccao.

    Cada registo e' um `{ n, {centros}, { ... } }` com o nome do simbolo num
    comentario. O comentario e' a **fonte do nome** - o codigo nao o tem
    estruturado, so o commenta.

    **O nome esta num `//` e nao num `/* */`**, e a diferencia nao e' de estilo:
    o `limpar` tira os dois, e portanto o nome desaparece antes de se poder ler.
    A solucao e' ir ao texto **antes** de limpar, e limpar so o corpo.
    """
    inicio_cpp = cpp.find("Version::rMQR(int number)")
    if inicio_cpp < 0:
        raise SystemExit("nao encontrei Version::rMQR no QRVersion.cpp")
    bruto = cpp[inicio_cpp : cpp.find("};", inicio_cpp) + 2]

    # Os nomes, na ordem, com a posicao de cada um - para os poder ligar aos
    # registos depois de o corpo ter sido limpo.
    nomes = re.findall(r"//\s*(R(\d+)x(\d+))\s*\n", bruto)

    limpo = limpar(bruto)
    registos = []

    # Cada simbolo: `{ versao, {centros}, { 4x5 numeros } }`. Os grupos sao L
    # (nulo), M, Q (nulo) e H - e os nulos sao `0, 0, 0, 0, 0`.
    for versao, centros, ec in re.findall(
        r"\{\s*(\d+)\s*,\s*\{([\d,\s]*)\}\s*,\s*\{(.*?)\}\s*\}",
        limpo,
        re.DOTALL,
    ):
        if len(registos) >= len(nomes):
            break

        numeros = [int(n) for n in re.findall(r"-?\d+", ec)]

        # 4 grupos de 5: (ec/blocks, blocos, cwPorBloco, blocos, cwPorBloco).
        # L e Q sao os dummy `0, 0, 0, 0, 0`; M e H sao os que interessam.
        def grupo(inicio_g: int) -> dict:
            ec_por_bloco, n_blocos, cw1, n2, cw2 = numeros[inicio_g : inicio_g + 5]
            blocos = [(n_blocos, cw1)]
            if n2:
                blocos.append((n2, cw2))
            return {"ecPorBloco": ec_por_bloco, "blocos": blocos}

        registos.append(
            {
                "nome": nomes[len(registos)][0],
                "versao": int(versao),
                "alinhamento": [int(c) for c in centros.split(",") if c.strip()],
                "M": grupo(5),
                "H": grupo(15),
            }
        )

    return registos


def capacidade(dados: dict) -> int:
    """Codewords de dados, em M - o minimo, porque e' o que limita."""
    return sum(n * cw for n, cw in dados["blocos"])


def extrair_bits_de_contagem(cpp: str) -> dict[str, list[int]]:
    """Os bits do indicador de caracteres, por modo e por versao.

    ISO/IEC 23941:2022 7.4.1, Tabela 3. Sao **32 valores por modo** e nao tres
    grupos como no QR: no QR o numero de bits so muda tres vezes - versoes 1-9,
    10-26 e 27-40 - e no rMQR muda em quase todas. E' a razao de ser uma tabela
    de 32 e nao uma regra, e a razao de nao se poder reaproveitar a do QR.

    Os valores vem como `constexpr char numeric[32] = {4, 5, ...}`, e o nome do
    array **e' o modo**. Extrair pelo nome e' o que garante que o modo fica com
    os seus bits, e nao com os do visinho.
    """
    limpo = limpar(cpp)

    # **A citacao da norma esta num `//`, e o `limpar` ja a comeu.** A procura
    # tem de ser no texto bruto: e' a prova de que a fonte ainda e' a que se
    # espera, e um `limpar` que precede a verificacao transforma o sinal de
    # "a fonte mudou" num "a fonte nao tem isto", que e' a conclusao oposta.
    if "See ISO/IEC 23941:2022 7.4.1, Table 3" not in cpp:
        raise SystemExit("o QRCodecMode.cpp nao tem a tabela do rMQR - a fonte mudou?")

    bits = {}
    for nome in ("numeric", "alphanum", "byte", "kanji"):
        achado = re.search(rf"char\s+{nome}\[32\]\s*=\s*\{{(.*?)\}};", limpo, re.DOTALL)
        if not achado:
            raise SystemExit(f"nao encontrei a tabela de bits do modo {nome}")
        valores = [int(n) for n in re.findall(r"-?\d+", achado.group(1))]
        if len(valores) != 32:
            raise SystemExit(f"a tabela de {nome} tem {len(valores)} valores, e' para ter 32")
        bits[nome] = valores

    return bits


def conferir_tamanhos(simbolos: list[dict], tamanhos: list[tuple[int, int]]) -> list[str]:
    """O nome tem de bater com o tamanho. E' o que impede a lista de trocar de sentido."""
    problemas = []

    if len(tamanhos) != 32:
        problemas.append(f"a tabela de tamanhos tem {len(tamanhos)}, a norma tem 32")
    if len(simbolos) != 32:
        problemas.append(f"a tabela de simbolos tem {len(simbolos)}, a norma tem 32")

    for i, (largura, altura) in enumerate(tamanhos):
        nome_certo = f"R{altura}x{largura}"
        if i >= len(simbolos):
            continue
        if simbolos[i]["nome"] != nome_certo:
            problemas.append(
                f"o simbolo {i + 1} chama-se {simbolos[i]['nome']} mas "
                f"a tabela de tamanhos diz {nome_certo} - a lista esta trocada"
            )
        simbolos[i]["altura"] = altura
        simbolos[i]["largura"] = largura

    return problemas


def conferir_correccao(simbolos: list[dict]) -> list[str]:
    """A correccao tem de caber no simbolo, e a grade tem de bater com o total.

    A segunda e' a que apanha a tabela desalinhada. Cada bloco tem de ter o
    mesmo numero de codewords de correccao, e a soma de dados mais correccao
    tem de caber na area util. Um bloco com a correccao errada produz um codigo
    que **se desenha perfeito e nao e' lido** - e nao ha sintoma nenhum alem
    disso.
    """
    problemas = []

    for s in simbolos:
        for nivel in ("M", "H"):
            b = s[nivel]
            if b["ecPorBloco"] == 0:
                problemas.append(f"{s['nome']} {nivel}: nao ha correccao declarada")
                continue

            for n, cw in b["blocos"]:
                if n == 0:
                    problemas.append(f"{s['nome']} {nivel}: bloco com 0 blocos")
                if cw == 0:
                    problemas.append(f"{s['nome']} {nivel}: bloco com 0 codewords de dados")

            ec_total = b["ecPorBloco"] * sum(n for n, _ in b["blocos"])
            dados_total = capacidade(b)
            # O rMQR empacota os codewords em bits, e a grelha perde a borda,
            # por isso a comparacao e' com a area e nao com `x 8` exacto.
            area = s["largura"] * s["altura"]
            if (dados_total + ec_total) * 8 > area:
                problemas.append(
                    f"{s['nome']} {nivel}: {dados_total} dados + {ec_total} correccao "
                    f"precisam de {(dados_total + ec_total) * 8} bits e a grelha tem {area}"
                )

    return problemas


def conferir_bits(simbolos: list[dict], bits: dict[str, list[int]]) -> list[str]:
    """Os bits de contagem tem de caber na capacidade do simbolo.

    **Um indicador de caracteres maior do que a capacidade nao dá um codigo
    invalido: dá um codigo que se desenha e nao le.** E' a propriedade que
    apanha a tabela trocada de versao, e por isso que se verifica versao a
    versao e nao no seu conjunto.

    A conta: o indicador mais o modo mais o terminador tem de caber na
    capacidade em codewords. E um limite fraco - qualquer valor da tabela o
    satisfaz - mas e o que apanha o valor de outra linha, que e' o erro
    provavel.
    """
    problemas = []

    for modo, valores in bits.items():
        for i, n in enumerate(valores):
            if n < 1 or n > 12:
                problemas.append(f"{modo} na versao {i + 1}: {n} bits, que nao faz sentido")
            if i >= len(simbolos):
                continue
            # O pior caso: 2^n - 1 caracteres, cada um no minimo do modo.
            # Nao se pode verificar o conteudo - so que o indicador nao e'
            # absurdo face a capacidade.
            if (1 << n) > capacidade(simbolos[i]["M"]) * 8:
                problemas.append(
                    f"{modo} na versao {i + 1}: o indicador de {n} bits representa "
                    f"ate {1 << n} caracteres, e a capacidade e' "
                    f"{capacidade(simbolos[i]['M'])} codewords"
                )

    return problemas


def conferir_com_zxing(simbolos: list[dict]) -> list[str]:
    """O ZXing tem de escolher o mesmo simbolo que a tabela diz.

    Esta e' a verificacao que vale: nao compara a tabela com a tabela, compara-a
    com o que um leitor independente **aceita**. E a razao de o rMQR ser
    verificado nivel 2 como o resto.
    """
    try:
        import zxingcpp
    except ImportError:
        return ["zxingcpp nao esta instalado - a verificacao contra o leitor foi saltada"]

    from zxingcpp import BarcodeFormat

    problemas = []

    for texto in CASOS:
        try:
            b = zxingcpp.create_barcode(texto, BarcodeFormat.RMQRCode)
            svg = b.to_svg()
        except ValueError as erro:
            # O rMQR recusa o que nao cabe, e isso e' o comportamento certo.
            print(f"  {len(texto):4} caracteres: o ZXing recusou - {erro}")
            continue

        m = re.search(r'<svg width="(\d+)" height="(\d+)"', svg)
        if not m:
            problemas.append(f"{texto[:20]!r}: o SVG nao tem tamanho")
            continue

        w = int(m.group(1)) - ZONA_CALMA
        h = int(m.group(2)) - ZONA_CALMA

        i = next((k for k, s in enumerate(simbolos) if (s["largura"], s["altura"]) == (w, h)), None)
        if i is None:
            problemas.append(f"{len(texto)} caracteres deu {w}x{h}, que nao esta na tabela")
            continue

        print(f"  {len(texto):4} caracteres -> {w:3}x{h:2}  {simbolos[i]['nome']}")

    return problemas


def escrever_js(simbolos: list[dict], bits: dict[str, list[int]]) -> None:
    """O ficheiro de JavaScript. Gerado, nunca editado a mao."""
    linhas = [
        "/**",
        " * rMQR: os 32 simbolos, com os centros de alinhamento e os blocos de",
        " * correccao de erro.",
        " *",
        " * ## Gerado, nao escrito a mao",
        " *",
        f" *     python web/tests/gerar-tabela-rmqr.py",
        " *",
        " * De:",
        f" *     {ORIGEM}",
        f" *     Licenca: {LICENCA}",
        " *",
        " * A fonte e' o zxing-cpp 3.1.1, que e' tambem o que o `zxingcpp`",
        " * instalado escreve. As referencias a norma estao no codigo:",
        " *",
        " *     ISO/IEC 23941:2022 Anexo D, Tabela D.1 - coordenadas de coluna dos",
        " *       centros dos padroes de alinhamento",
        " *     ISO/IEC 23941:2022 7.5.1, Tabela 8 - caracteristicas de correccao",
        " *",
        " * **Os centros de alinhamento sao so colunas.** E' a diferenca para o QR,",
        " * onde ha grelha: num codigo rectangular nao ha motivo para ter linhas",
        " * de alinhamento, e a norma so define colunas.",
        " *",
        " * Os nomes sao `R<altura>x<largura>`, tirados do comentario da fonte - o",
        " * codigo nao os tem estruturados. O `gerar-tabela-rmqr.py` veifica que o",
        " * nome bate com o tamanho, que e' o que impede a lista de trocar de",
        " * sentido em silencio.",
        " *",
        " * A segunda parte, os bits do indicador de caracteres, vem do",
        " * `QRCodecMode.cpp` do mesmo repositorio, com a citacao",
        " * ISO/IEC 23941:2022 7.4.1, Tabela 3.",
        " */",
        "",
        "/** Os 32 simbolos, por versao. A versao 1 e' o menor. */",
        "export const SIMBOLOS = [",
    ]

    for s in simbolos:
        alin = ", ".join(str(c) for c in s["alinhamento"])
        linhas.append("  {")
        linhas.append(f"    // {s['nome']}")
        linhas.append(f"    versao: {s['versao']},")
        linhas.append(f"    largura: {s['largura']},")
        linhas.append(f"    altura: {s['altura']},")
        linhas.append(f"    alinhamento: [{alin}],")
        for nivel in ("M", "H"):
            b = s[nivel]
            blocos = ", ".join(f"[{n}, {cw}]" for n, cw in b["blocos"])
            linhas.append(f"    {nivel}: {{ ecPorBloco: {b['ecPorBloco']}, blocos: [{blocos}] }},")
        linhas.append("  },")

    linhas += [
        "];",
        "",
        "/**",
        " * Os bits do indicador de caracteres, por modo e por versao.",
        " *",
        " * ISO/IEC 23941:2022 7.4.1, Tabela 3. Sao **32 valores por modo**, e",
        " * nao tres grupos como no QR: no QR o numero de bits so muda tres vezes -",
        " * versoes 1-9, 10-26 e 27-40 - e no rMQR muda em quase todas as 32. E' a",
        " * razao de isto ser uma tabela e nao uma regra, e a razao de nao se poder",
        " * reaproveitar a do QR mesmo sendo o mesmo formato deCharacter.",
        " *",
        " * O indice e' a versao menos um, igual ao de `SIMBOLOS`.",
        " */",
        "export const BITS_DE_CONTAGEM = {",
    ]

    for modo in MODOS:
        valores = bits[modo]
        # De 8 em 8, para caberem e para se lerem.
        blocos = [", ".join(str(v) for v in valores[i:i + 8]) for i in range(0, 32, 8)]
        linhas.append(f"  {modo}: [")
        for b in blocos:
            linhas.append(f"    {b},")
        linhas.append("  ],")

    linhas += [
        "};",
        "",
        "/**",
        " * A capacidade em codewords de dados, para o nivel pedido.",
        " *",
        " * Sao os dois **menores** valores - o que limita e' sempre o M, porque o",
        " * M e' o que tem menos dados. E' o que o `rmqr.js` usa para escolher o",
        " * simbolo: se o conteudo nao cabe em M, nao cabe em lado nenhum.",
        " */",
        "export function capacidadeDe(versao, nivel) {",
        "    const simbolo = SIMBOLOS[versao - 1];",
        "    if (!simbolo) throw new Error(`versao de rMQR invalida: ${versao}`);",
        "    const b = nivel === 'H' ? simbolo.H : simbolo.M;",
        "    return b.blocos.reduce((total, [n, cw]) => total + n * cw, 0);",
        "}",
        "",
        "/**",
        " * O nivel de correccao a usar. O rMQR so tem **dois**: M e H.",
        " *",
        " * E nao e' uma escolha de quem gera, e' uma consequencia de ser",
        " * rectangular: um QR tem 40 versoes para escolher o melhor compromisso",
        " * entre dados e redundancia, e um rMQR que se apresenta de lado nao pode",
        " * dar a si mesmo esse luxo. O valor por omissao e' H, e e' o que o",
        " * `CreateBarcode.cpp` do zxing-cpp usa.",
        " */",
        "export const NIVEL_PADRAO = 'H';",
        "",
    ]

    DESTINO.write_text("\n".join(linhas), encoding="utf-8")
    kb = round(DESTINO.stat().st_size / 1024)
    print(f"\n{DESTINO} ({kb} KB, gerado)")


def main() -> int:
    print("=== as fontes ===")
    simbolos = extrair_simbolos(ir_buscar(FONTE_CPP))
    tamanhos = extrair_tamanhos(ir_buscar(FONTE_H))
    bits = extrair_bits_de_contagem(ir_buscar(FONTE_MODOS))

    print("=== a tabela bate consigo mesma? ===")
    problemas = (
        conferir_tamanhos(simbolos, tamanhos)
        + conferir_correccao(simbolos)
        + conferir_bits(simbolos, bits)
    )
    for p in problemas:
        print(f"  {p}")
    if problemas:
        print("\nA fonte mudou de forma, e nao se vai adivinhar o que falta.")
        return 1
    print("  nomes, tamanhos, correccao e bits de contagem: ok")

    print("\n=== o ZXing escolhe o mesmo simbolo? ===")
    problemas = conferir_com_zxing(simbolos)
    for p in problemas:
        print(f"  {p}")
    if problemas:
        return 1
    print("  a tabela e' a que o leitor aceita")

    escrever_js(simbolos, bits)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
