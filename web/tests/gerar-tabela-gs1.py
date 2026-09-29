"""
Gera ``web/symbologies/gs1-tabelas.js``.

    python web/tests/extrair-tabelas-gs1.py     # o JSON, da pagina do ref.gs1.org
    python web/tests/gerar-tabela-gs1.py         # este ficheiro

Porque e' gerado e nao escrito a mao
------------------------------------

Mais de quinhentos AIs, cada um com o seu formato, o seu regex e a resposta a
uma pergunta que o encoder faz em cada campo: *este precisa de um FNC1 a
seguir?* E' a pergunta que decide onde o GS1-128 poe os separadores, e por isso
uma resposta errada nao da um codigo que nao le: da um codigo em que o campo de
comprimento fixo seguinte e' engolido pelo anterior.

Mais de quinhentos AIs nao se escrevem de memoria. A tabela do Code 39 foi
escrita de memoria neste repositorio e saiu com doze elementos por caracter em
vez de nove, e nenhum teste estrutural a apanhou. Um AI com o comprimento errado
tem a mesma forma de erro: desenha-se certo e o leitor le-o como invalido.

O que vai no ficheiro, e por que e' tan slim
--------------------------------------------

De cada AI fica so o que o encoder **usa**: o numero, o formato, se precisa de
separador, e o regex. A descricao e o titulo **nao vao para o ficheiro** e ficam
no `.tabelas-gs1.json`: sao 541 cadeias de texto em portugues e ingles que
ocupariam mais espaco do que a logica, e que servem para mostrar ao utilizador -
que e' coisa da interface, nao do encoder. O ficheiro vai com um indice por
comprimento, porque o AI comeca por dois, tres ou quatro digitos e a procura
tem de ser directa.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".tabelas-gs1.json"
DESTINO = RAIZ / "web" / "symbologies" / "gs1-tabelas.js"

CABECALHO = '''/**
 * A tabela de Application Identifiers do GS1. **Gerado** por
 * `tests/gerar-tabela-gs1.py` a partir do JSON-LD de `ref.gs1.org`.
 *
 * Sao 541 AIs e nao estao escritos a mao de proposito - ver o gerador para o
 * porque. A origem fica escrita aqui porque uma tabela sem origem e' uma tabela
 * em que ninguem pode confiar.
 *
 * **O que cada AI traz, e o que e' que o encoder usa:**
 *
 *  - `ai`    o numero, dois a quatro digitos;
 *  - `formato` a notacao da GS1, `N` numerico, `X` alfanumerico, `a` ate `..20`
 *    variavel, e o `+` a separar o AI do campo;
 *  - `separador` se o campo e' de comprimento variavel e precisa de um FNC1 a
 *    separar do seguinte. **E' a razao de existir esta tabela**: sem ela nao se
 *    sabe onde acaba `(10)LOTE-A1` e onde comeca o campo seguinte;
 *  - `regex` a expressao regular do valor, da propria GS1.
 *
 * **Nao vao aqui** as descricoes nem os titulos, que sao 1082 cadeias de texto.
 * Ficao no `tests/.tabelas-gs1.json` e sao coisa da interface: o encoder precisa
 * de saber quanto mede o campo, nao o que ele significa.
 */

/** Os AIs, por numero. Um objeto em vez de uma lista porque se procura por
 * numero e nao se percorre - e porque o ficheiro tem de ficar legivel quando
 * alguem abrir para ver o que ha la dentro. As chaves sao `'01'` e nao `01`,
 * porque um numero em JavaScript perde o zero a esquerda. */
export const AIS = {
'''


# A notacao de formato da GS1, medida nos 541 formatos em vez de suposta.
#
# Os **tipos** de campo que aparecem sao quatro, e medidos um a um: `N`
# numerico, `X` alfanumerico, e `Y` e `Z` - que so aparecem uma vez cada, nos AIs
# 8010 e 8030, e sao os codigos de pais ISO 3166. Um `grep` inicial so procurou
# `N` e `X` e perdeu os dois, e o gerador parou com "formato sem campos", que e'
# o erro honesto: e' melhor parar aqui do que escrever 540 AIs certos e um errado.
#
# A sintaxe, com o que aparece medido: `+` separa partes, `.` marca variavel,
# `[` `]` marcam opcionais e `-` e' literal. Nao ha mais.
#
#   N2            o proprio AI, antes do primeiro `+` - e' o AI, nao um campo
#   N14           obrigatorio, 14 caracteres numericos
#   X..20         obrigatorio, alfanumerico, ate 20 caracteres
#   [N..12]       opcional: o que esta dentro dos parenteses rectos pode faltar
#   [-]           um literal, neste caso um hifen, e' opcional tambem
#   N4+N1+X1+N1   varios campos obrigatorios seguidos, todos no mesmo AI
#
# **Um AI pode ter mais do que um campo**, e o comprimento que decide onde acaba o
# AI e' o do **ultimo campo obrigatorio**: um `N4+N3+X..27` tem 3 caracteres
# numericos de prefixo e depois um campo alfanumerico variavel, e quem mede o
# AI e' o variavel. E' por isso que a lista de campos existe, e nao so um numero.
#
# O tipo e' `[A-Z]` e nao `[NX]`: `Y` e `Z` sao tipos legítimos, e um parser que
# so conhece `N` e `X` falha neles. Para o encoder, `Y` e `Z` sao alfanumericos
# como `X` - o que interessa e' que nao e' `N` - e o campo `numerico` abaixo e'
# que decide isso.
CAMPO = re.compile(r"(?P<tipo>[A-Z])(?P<variavel>\.\.)?(?P<n>\d+)")

# O `+` que separa as partes, mas nao o que esta dentro de um `[...]`: o
# separador de um campo opcional `N4+N1[+X..17]` e' o mais interno.
PARTES = re.compile(r"(?:\[[^\]]*\]|[^\[\]])+")


def nulo(valor: int | None) -> str:
    """Um inteiro, ou `null` de JavaScript.

    `None` e' Python e `null` e' JavaScript, e a diferenca entre os dois e' um
    erro de sintaxe que so aparece quando o ficheiro gerado e' carregado - nem
    no `node --check` do `.py`, nem aqui. Traduzir num so sitio evita que a
    traducindo fique esquecida numa das 541 linhas.
    """
    return "null" if valor is None else str(valor)


def indice(ai: dict) -> dict:
    """A entrada de um AI, com o que o encoder precisa.

    O `formato` fica como texto alem dos campos calculados porque e' o que a
    interface mostra ao utilizador: "N2+X..20" diz mais do que "alfanumerico ate
    20".
    """
    formato = ai["formato"]
    # Tudo o que vem antes do primeiro `+` e' o proprio AI, repetido para o
    # formato se ler sem contexto. O que interessa e' o que vem depois.
    dados = formato.split("+", 1)[1] if "+" in formato else ""

    campos: list[dict] = []
    for parte in PARTES.findall(dados):
        # Um campo e' opcional quando a parte em que esta e' um grupo `[...]` -
        # e a parte pode ter mais do que um campo, como em `[N..12]`.
        for achado in CAMPO.finditer(parte):
            variavel = achado.group("variavel") is not None
            comprimento = int(achado.group("n"))
            campos.append(
                {
                    "tipo": achado.group("tipo"),
                    # `N14` e' fixo com 14; `X..20` e' variavel ate 20. Um dos
                    # dois e' sempre None, e e' assim que o encoder distingue os
                    # dois casos sem um booleano a mais.
                    "fixo": None if variavel else comprimento,
                    "maximo": comprimento if variavel else None,
                }
            )

    if not campos:
        raise SystemExit(f"Formato sem campos de dados: {formato!r}")

    # O campo que mede o AI e' o **ultimo**, porque e' o que vai ate ao fim. Um
    # campo opcional no fim (`N4+N1[+X..17]`) nao alonga o AI alem do fixo, e
    # por isso um `maximo` so conta se for o ultimo.
    ultimo = campos[-1]

    return {
        "formato": formato,
        "fixo": ultimo["fixo"],
        "maximo": ultimo["maximo"],
        "campos": campos,
        "separador": ai["separador"],
        "regex": ai["regex"],
    }


def main() -> int:
    if not JSON.exists():
        raise SystemExit(
            f"Falta {JSON.name}. Corre primeiro: python web/tests/extrair-tabelas-gs1.py"
        )

    dados = json.loads(JSON.read_text(encoding="utf-8"))
    tabela = {ai["ai"]: indice(ai) for ai in dados["ais"]}

    # O parser da notacao so serve se cobrir os 541 formatos. Um formato que
    # fique por explicar e' um formato cujo comprimento o encoder vai dar como
    # errado, e o sintoma - um AI lido com o campo partido - nao se parece com
    # uma falha de tabela. Por isso conta-se o que sobrou por explicar, e se
    # sobrar alguma coisa o gerador para em vez de escrever um ficheiro torto.
    #
    # A medicao e': para cada `X` ou `N` do formato, tem de haver um campo
    # correspondente. Um `N` do `N2` inicial e' o AI e nao um campo, por isso a
    # contagem comeca depois do primeiro `+`.
    porExplicar = []
    for numero, entrada in tabela.items():
        dadosFormato = entrada["formato"].split("+", 1)[1] if "+" in entrada["formato"] else ""
        letras = len(re.findall(r"[A-Z]\.\.\d+|[A-Z]\d+", dadosFormato))
        if letras != len(entrada["campos"]):
            porExplicar.append((numero, entrada["formato"], letras, len(entrada["campos"])))

    if porExplicar:
        for numero, formato, letras, campos in porExplicar[:10]:
            print(f"  nao percebido: {numero} {formato} -> {letras} letras, {campos} campos")
        raise SystemExit(
            f"{len(porExplicar)} formatos por explicar. A notacao da GS1 mudou "
            f"ou o parser esta errado - e ninguem quer um ficheiro com os "
            f"comprimentos errados."
        )

    linhas = [CABECALHO]
    for numero, entrada in sorted(tabela.items()):
        # Cada entrada numa so linha: sao 541, e um por linha sao 541 linhas que
        # ninguem le. A tabela e' para o codigo usar, nao para se ler.
        # Os numeros de Python (`None`, `True`) e as chaves de objeto com aspas
        # nao sao JavaScript. A primeira versao emitia `None` e `{ t: N }` - o `N`
        # sem aspas - e o ficheiro gerado nao carregava. A traducao e' feita aqui,
        # e nao a mao, porque sao 541 linhas e uma delas errada e' uma linha
        # errada.
        campos = ", ".join(
            "{ t: '%s', f: %s, m: %s }" % (c["tipo"], nulo(c["fixo"]), nulo(c["maximo"]))
            for c in entrada["campos"]
        )
        linhas.append(
            f"  '{numero}': {{ f: {json.dumps(entrada['formato'], ensure_ascii=False)}, "
            f"fixo: {nulo(entrada['fixo'])}, maximo: {nulo(entrada['maximo'])}, "
            f"campos: [{campos}], "
            f"sep: {str(entrada['separador']).lower()}, "
            f"re: {json.dumps(entrada['regex'])} }},\n"
        )

    linhas.append(
        """
};

/**
 * O AI de um numero, ou `null` se esse numero nao existe.
 *
 * Procura pelo AI mais comprido primeiro, e nao pelo mais curto, porque e' o que
 * faz `(3103)` ser lido como o AI 3103 e nao como o 31 seguido de "03". Os AIs
 * de quatro digitos existem precisamente paralevar um digito a frente dos de
 * tres, e uma procura pela ordem errada le `(01)040...` como 0 seguido de 1 - o
 * que produz um codigo com o GTIN partido ao meio e o leitor nao diz nada.
 */
export function aiDe(numero) {
  if (AIS[numero]) return { numero, ...AIS[numero] };

  // Corta o ultimo digito ate dar, que e' a forma de tentar 4, 3 e 2.
  for (let n = numero.length - 1; n >= 2; n--) {
    const prefixo = numero.slice(0, n);
    if (AIS[prefixo]) return { numero: prefixo, resto: numero.slice(n), ...AIS[prefixo] };
  }

  return null;
}

/** Todos os AIs, para a interface os mostrar. */
export const LISTA_AIS = Object.keys(AIS).sort();
"""
    )

    DESTINO.write_text("".join(linhas), encoding="utf-8")
    tamanho = DESTINO.stat().st_size
    print(f"{DESTINO.name}: {len(tabela)} AIs, {tamanho // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
