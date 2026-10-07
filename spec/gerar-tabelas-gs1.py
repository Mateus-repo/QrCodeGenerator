"""
Gera a tabela de Application Identifiers do GS1 nas cinco stacks.

    python spec/gerar-tabelas-gs1.py

Precisa do ``web/tests/.tabelas-gs1.json``, que vem de
``python web/tests/extrair-tabelas-gs1.py`` — a pagina de ``ref.gs1.org``. O
JSON **nao esta no git**: e' um artefacto de uma pagina que muda, e o que fica
versionado e' a tabela gerada, com a origem escrita na primeira linha de cada
ficheiro.

Porque e' gerado e nao escrito a mao
------------------------------------

Mais de quinhentos AIs, cada um com o seu formato, o seu regex e a resposta a uma
pergunta que o encoder faz em cada campo: *este precisa de um FNC1 a seguir?* E' a
pergunta que decide onde o GS1-128 poe os separadores, e por isso uma resposta
errada nao da um codigo que nao le: da um codigo em que o campo de comprimento
fixo seguinte e' engolido pelo anterior.

Mais de quinhentos AIs nao se escrevem de memoria. A tabela do Code 39 foi escrita
de memoria neste repositorio e saiu com doze elementos por caracter em vez de
nove, e nenhum teste estrutural a apanhou. Um AI com o comprimento errado tem a
mesma forma de erro: desenha-se certo e o leitor le-o como invalido.

O que vai no ficheiro, e por que e' tao slim
--------------------------------------------

De cada AI fica so o que o encoder **usa**: o formato, o comprimento fixo ou o
maximo do ultimo campo, os componentes, se precisa de separador, e o regex. A
descricao e o titulo **nao vao para o ficheiro** e ficam no JSON: sao 1082 cadeias
de texto que ocupariam mais espaco do que a logica, e que servem para mostrar ao
utilizador — que e' coisa da interface, nao do encoder.

Porque o ``aiDe`` e' procurado do AI mais comprido para o mais curto
--------------------------------------------------------------------

Os AIs de quatro digitos existem precisamente para levar um digito a frente dos de
tres, e uma procura pela ordem errada le ``(3103)`` como o AI 31 seguido de
``03``. O sintoma e' um GTIN partido ao meio e o leitor nao diz nada.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
JSON = RAIZ / "web" / "tests" / ".tabelas-gs1.json"

NL = "\n"

#: Os cinco destinos, na ordem em que aparecem no texto do repositorio.
ALVOS = [
    RAIZ / "web" / "symbologies" / "gs1-tabelas.js",
    RAIZ / "python" / "qrcode_core" / "simbologias" / "tabelas_gs1.py",
    RAIZ / "java" / "core" / "src" / "main" / "java" / "com" / "qrcodegen" / "core"
        / "simbologias" / "TabelasGs1.java",
    RAIZ / "kotlin" / "core" / "src" / "main" / "kotlin" / "com" / "qrcodegen" / "core"
        / "simbologias" / "TabelasGs1.kt",
    RAIZ / "csharp" / "core" / "Simbologias" / "TabelasGs1.cs",
]

#: O `+` que separa as partes, mas nao o que esta dentro de um `[...]`: o
#: separador de um campo opcional `N4+N1[+X..17]` e' o mais interno.
PARTES = re.compile(r"(?:\[[^\]]*\]|[^\[\]])+")

#: Um campo da notacao: um tipo, um `..` se for variavel, e o comprimento.
#:
#: **O grupo do `variavel` e' o que distingue `N14` de `X..20`.** Sem ele, um
#: `N14` e um `X..20` ficavam iguais e o encoder nao sabia onde acaba um campo.
CAMPO = re.compile(r"(?P<tipo>[A-Z])(?P<variavel>\.\.)?(?P<n>\d+)")


def indice(ai: dict) -> dict:
    """
    A entrada de um AI, com o que o encoder precisa.

    O ``formato`` fica como texto alem dos campos calculados porque e' o que a
    interface mostra ao utilizador: ``N2+X..20`` diz mais do que "alfanumerico ate
    20".
    """
    formato = ai["formato"]

    # Tudo o que vem antes do primeiro `+` e' o proprio AI, repetido para o
    # formato se ler sem contexto. O que interessa e' o que vem depois.
    dados = formato.split("+", 1)[1] if "+" in formato else ""

    campos: list[dict] = []
    for parte in PARTES.findall(dados):
        # Um campo e' opcional quando a parte em que esta e' um grupo `[...]` - e a
        # parte pode ter mais do que um campo, como em `[N..12]`.
        for achado in CAMPO.finditer(parte):
            variavel = achado.group("variavel") is not None
            comprimento = int(achado.group("n"))
            campos.append(
                {
                    "tipo": achado.group("tipo"),
                    # `N14` e' fixo com 14; `X..20` e' variavel ate 20. Um dos dois
                    # e' sempre None, e e' assim que o encoder distingue os dois
                    # casos sem um booleano a mais.
                    "fixo": None if variavel else comprimento,
                    "maximo": comprimento if variavel else None,
                }
            )

    if not campos:
        raise SystemExit(f"Formato sem campos de dados: {formato!r}")

    # O campo que mede o AI e' o **ultimo**, porque e' o que vai ate ao fim. Um
    # campo opcional no fim (`N4+N1[+X..17]`) nao alonga o AI alem do fixo, e por
    # isso um `maximo` so conta se for o ultimo.
    ultimo = campos[-1]

    return {
        "formato": formato,
        "fixo": ultimo["fixo"],
        "maximo": ultimo["maximo"],
        "campos": campos,
        "separador": ai["separador"],
        "regex": ai["regex"],
    }


def carregar() -> tuple[dict[str, dict], str]:
    """
    Le o JSON e devolve a tabela por numero de AI, e a origem.

    **A origem vem com a tabela, e nao escrita a mao no ficheiro gerado**, porque
    uma tabela sem origem e' uma tabela em que ninguem pode confiar — e porque o
    URL muda e o texto ficaria a dizer o sitio errado.
    """
    if not JSON.exists():
        raise SystemExit(
            f"Falta {JSON.name}. Corre primeiro: "
            "python web/tests/extrair-tabelas-gs1.py"
        )

    dados = json.loads(JSON.read_text(encoding="utf-8"))
    tabela = {ai["ai"]: indice(ai) for ai in dados["ais"]}

    return tabela, dados.get("origem", "ref.gs1.org")


def conferir(tabela: dict[str, dict]) -> None:
    """
    Confere que o parser da notacao cobre os 541 formatos, e para se nao cobre.

    Um formato que fique por explicar e' um formato cujo comprimento o encoder vai
    dar como errado, e o sintoma — um AI lido com o campo partido — nao se parece
    com uma falha de tabela. **Contar o que sobrou por explicar e' a unica defesa**:
    um gerador que escreve e nao conta produz um ficheiro torto e nao diz nada.
    """
    porExplicar = []

    for numero, entrada in tabela.items():
        formato = entrada["formato"]
        dados = formato.split("+", 1)[1] if "+" in formato else ""
        letras = len(re.findall(r"[A-Z]\.\.\d+|[A-Z]\d+", dados))
        if letras != len(entrada["campos"]):
            porExplicar.append((numero, formato, letras, len(entrada["campos"])))

    if porExplicar:
        for numero, formato, letras, campos in porExplicar[:10]:
            print(f"  nao percebido: {numero} {formato} -> {letras} letras, {campos} campos")
        raise SystemExit(
            f"{len(porExplicar)} formatos por explicar. A notacao da GS1 mudou ou o "
            f"parser esta errado - e ninguem quer um ficheiro com os comprimentos errados."
        )


def nulo(valor: int | None, vazio: str = "null") -> str:
    """
    Um inteiro, ou o vazio de cada linguagem.

    ``None`` e' Python, ``null`` e' JavaScript, Java, Kotlin e C#, e ``-1`` e' o
    que o JavaScript usaria se o campo fosse numerico. Traduzir num so sitio evita
    que a traducao fique esquecida numa das 541 linhas.
    """
    return vazio if valor is None else str(valor)


def texto(valor: str) -> str:
    """
    Uma cadeia entre aspas, em JavaScript e em Python.

    **O ``json.dumps`` serve para as duas** e nao para as outras tres, porque o
    Java e o C# nao tem ``\\uXXXX`` com aspas duplas e o Kotlin tem o seu proprio
    ``$``. O regex da GS1 so tem ``\\d``, ``\\w`` e classes de caracteres, por isso
    que **nao ha uma unica escape no ficheiro inteiro** — o que e' a razao de o
    ``json.dumps`` servir.
    """
    return json.dumps(valor, ensure_ascii=False)


#: Os cinco escritores da tabela de AIs do GS1.
#:
#: Cada um emite a mesma informacao na forma da sua linguagem, e cada um tem a
#: mesma funcao `aiDe` — a procura do AI mais comprido primeiro.

import json
from pathlib import Path




#: O que cada AI traz, e o porque de estar na tabela.
#:
#: Este bloco vai nas cinco linguagens, com o prefixo de comentario de cada uma.
#: **A razao de o texto estar aqui e nao em cada escritor e' que sao cinco copias
#: de uma coisa que tem de ser a mesma** — e uma explicacao que e' verdadeira num
#: ficheiro e falsa noutro e' pior do que nenhuma.
NOTA = [
    "A tabela de Application Identifiers do GS1. Gerado por",
    "`spec/gerar-tabelas-gs1.py` a partir do JSON-LD de ref.gs1.org.",
    "",
    "Sao 541 AIs e nao estao escritos a mao de proposito: mais de quinhentos",
    "AIs nao se escrevem de memoria, e um AI com o comprimento errado da um",
    "codigo que se desenha certo e que o leitor le como invalido.",
    "",
    "O que cada AI traz, e o que e' que o encoder usa:",
    "",
    "- `formato`    a notacao da GS1, `N` numerico, `X` alfanumerico,",
    "               `Y` codigo de pais, `a..20` variavel;",
    "- `fixo` / `maximo`  o comprimento do **ultimo** componente: um dos dois e'",
    "               sempre nulo, e e' assim que se distingue fixo de variavel",
    "               sem um booleano a mais;",
    "- `campos`     todos os componentes, com o mesmo par fixo/maximo;",
    "- `separador`  se o campo precisa de um FNC1 a separa-lo do seguinte.",
    "               **E' a razao de existir esta tabela**: sem ela nao se sabe",
    "               onde acaba `(10)LOTE-A1` e onde comeca o campo seguinte;",
    "- `regex`      o regex do valor, da propria GS1.",
    "",
    "Nao vao aqui as descricoes nem os titulos, que sao 1082 cadeias de texto.",
    "Ficam no `web/tests/.tabelas-gs1.json` e sao coisa da interface: o encoder",
    "precisa de saber quanto mede o campo, nao o que ele significa.",
]

#: A funcao `aiDe`, nas cinco linguagens. A mesma em todas, e **e' por isso que e'
#: escrita cinco vezes**: uma abstraccao que gerasse as cinco produzia um
#: ficheiro com a forma da linguagem errada em alguma delas.
AI_DE = {
    "web": """
/**
 * O AI de um numero, ou `null` se esse numero nao existe.
 *
 * Procura pelo AI mais comprido primeiro, e nao pelo mais curto.
 *
 * **Nao e' por causa de um caso que exista hoje.** Ha AIs de dois, de tres e de
 * quatro digitos ao mesmo tempo, e nenhum e' prefixo de outro — o que o teste
 * confirma. A ordem errada seria um seguro contra o dia em que a GS1 publicar um
 * `010`: a procura pelo mais curto leria-o como o AI `01` seguido de `0`, e
 * produzia um codigo com o GTIN partido ao meio e um leitor que nao diz nada.
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
""",
    "python": '''
def ai_de(numero: str) -> dict | None:
    """
    O AI de um numero, ou ``None`` se esse numero nao existe.

    Procura pelo AI mais comprido primeiro, e nao pelo mais curto.

    **Nao e' por causa de um caso que exista hoje.** Ha AIs de dois, de tres e de
    quatro digitos ao mesmo tempo, e nenhum e' prefixo de outro — o que o teste
    confirma. A ordem errada seria um seguro contra o dia em que a GS1 publicar um
    ``010``: a procura pelo mais curto leria-o como o AI ``01`` seguido de ``0``, e
    produzia um codigo com o GTIN partido ao meio e um leitor que nao diz nada.
    """
    entrada = AIS.get(numero)
    if entrada is not None:
        return {"numero": numero, **entrada}

    # Corta o ultimo digito ate dar, que e' a forma de tentar 4, 3 e 2.
    for n in range(len(numero) - 1, 1, -1):
        prefixo = numero[:n]
        entrada = AIS.get(prefixo)
        if entrada is not None:
            return {"numero": prefixo, "resto": numero[n:], **entrada}

    return None


#: Todos os AIs, para a interface os mostrar.
LISTA_AIS = sorted(AIS)
''',
    "java": """
    /**
     * O AI de um numero, ou {@code null} se esse numero nao existe.
     *
     * <p>Procura pelo AI mais comprido primeiro, e nao pelo mais curto.
     *
     * <p><b>Nao e' por causa de um caso que exista hoje.</b> Ha AIs de dois, de tres
     * e de quatro digitos ao mesmo tempo, e nenhum e' prefixo de outro — o que o
     * teste confirma. A ordem errada seria um seguro contra o dia em que a GS1
     * publicar um {@code 010}: a procura pelo mais curto leria-o como o AI
     * {@code 01} seguido de {@code 0}, e produzia um codigo com o GTIN partido ao
     * meio e um leitor que nao diz nada.
     */
    public static Ai aiDe(String numero) {
        Ai entrada = AIS.get(numero);
        if (entrada != null) {
            return new Ai(numero, entrada.formato(), entrada.fixo(), entrada.maximo(),
                entrada.campos(), entrada.separador(), entrada.regex(), null);
        }

        // Corta o ultimo digito ate dar, que e' a forma de tentar 4, 3 e 2.
        for (int n = numero.length() - 1; n >= 2; n--) {
            String prefixo = numero.substring(0, n);
            entrada = AIS.get(prefixo);
            if (entrada != null) {
                return new Ai(prefixo, entrada.formato(), entrada.fixo(), entrada.maximo(),
                    entrada.campos(), entrada.separador(), entrada.regex(),
                    numero.substring(n));
            }
        }

        return null;
    }
""",
    "kotlin": '''
    /**
     * O AI de um numero, ou `null` se esse numero nao existe.
     *
     * Procura pelo AI mais comprido primeiro, e nao pelo mais curto.
     *
     * **Nao e' por causa de um caso que exista hoje.** Ha AIs de dois, de tres e de
     * quatro digitos ao mesmo tempo, e nenhum e' prefixo de outro — o que o teste
     * confirma. A ordem errada seria um seguro contra o dia em que a GS1 publicar
     * um `010`: a procura pelo mais curto leria-o como o AI `01` seguido de `0`, e
     * produzia um codigo com o GTIN partido ao meio e um leitor que nao diz nada.
     */
    fun aiDe(numero: String): Ai? {
        AIS[numero]?.let { return it.buscado(numero, null) }

        // Corta o ultimo digito ate dar, que e' a forma de tentar 4, 3 e 2.
        for (n in numero.length - 1 downTo 2) {
            val prefixo = numero.substring(0, n)
            val entrada = AIS[prefixo] ?: continue
            return entrada.buscado(prefixo, numero.substring(n))
        }

        return null
    }
''',
    "csharp": """
    /// <summary>
    /// O AI de um numero, ou <c>null</c> se esse numero nao existe.
    /// </summary>
    /// <remarks><para>Procura pelo AI mais comprido primeiro, e nao pelo mais curto.</para>
    /// <para><b>Nao e' por causa de um caso que exista hoje.</b> Ha AIs de dois, de
    /// tres e de quatro digitos ao mesmo tempo, e nenhum e' prefixo de outro — o que
    /// o teste confirma. A ordem errada seria um seguro contra o dia em que a GS1
    /// publicar um <c>010</c>: a procura pelo mais curto leria-o como o AI <c>01</c>
    /// seguido de <c>0</c>, e produzia um codigo com o GTIN partido ao meio e um
    /// leitor que nao diz nada.</para></remarks>
    public static Ai? AiDe(string numero)
    {
        if (AIS.TryGetValue(numero, out var entrada))
        {
            return entrada!.Buscado(numero, null);
        }

        // Corta o ultimo digito ate dar, que e' a forma de tentar 4, 3 e 2.
        for (int n = numero.Length - 1; n >= 2; n--)
        {
            string prefixo = numero[..n];
            if (AIS.TryGetValue(prefixo, out entrada))
            {
                return entrada!.Buscado(prefixo, numero[n..]);
            }
        }

        return null;
    }
""",
}


#: Os cinco escritores propriamente ditos, mais o `principal`.

from pathlib import Path




# --- o web ------------------------------------------------------------------


def web(tabela: dict, origem: str) -> str:
    """O ``AIS`` como objeto, com os nomes curtos que o encoder ja usava."""
    linhas = [
        "/**" + NL,
        " * " + NOTA[0] + NL,
        " * `" + NOTA[1] + NL,
        " *",
        " * A origem e' " + origem + ", e fica escrita aqui porque uma tabela sem" + NL,
        " * origem e' uma tabela em que ninguem pode confiar." + NL,
        " */" + NL + NL,
        "/** Os AIs, por numero. Um objeto em vez de uma lista porque se procura por" + NL,
        " * numero e nao se percorre - e porque o ficheiro tem de ficar legivel quando" + NL,
        " * alguem abrir para ver o que ha la dentro. As chaves sao `'01'` e nao `01`," + NL,
        " * porque um numero em JavaScript perde o zero a esquerda. */" + NL,
        "export const AIS = {" + NL,
    ]

    for numero, entrada in sorted(tabela.items()):
        campos = ", ".join(
            "{ t: '%s', f: %s, m: %s }" % (c["tipo"], nulo(c["fixo"]), nulo(c["maximo"]))
            for c in entrada["campos"]
        )
        linhas.append(
            "  '%s': { f: %s, fixo: %s, maximo: %s, campos: [%s], sep: %s, re: %s },\n"
            % (
                numero,
                texto(entrada["formato"]),
                nulo(entrada["fixo"]),
                nulo(entrada["maximo"]),
                campos,
                str(entrada["separador"]).lower(),
                texto(entrada["regex"]),
            )
        )

    linhas.append("};" + NL + NL)
    linhas.append(AI_DE["web"])
    return "".join(linhas)


# --- o Python, que e' a implementacao de referencia -------------------------


def python(tabela: dict, origem: str) -> str:
    """Dicionarios aninhados, com os nomes longos."""
    linhas = [
        '"""' + NL,
        "As tabelas de Application Identifiers do GS1. **Gerado** por" + NL,
        "`spec/gerar-tabelas-gs1.py`." + NL + NL,
        "Sao 541 AIs e nao estao escritos a mao de proposito: mais de quinhentos AIs" + NL,
        "nao se escrevem de memoria, e um AI com o comprimento errado da um codigo que" + NL,
        "se desenha certo e que o leitor le como invalido." + NL + NL,
        "O que cada AI traz, e o que e' que o encoder usa:" + NL + NL,
        "- ``formato``    a notacao da GS1, ``N`` numerico, ``X`` alfanumerico," + NL,
        "                 ``Y`` codigo de pais, ``a..20`` variavel;" + NL,
        "- ``fixo`` / ``maximo``  o comprimento do **ultimo** componente. Um dos dois" + NL,
        "                 e' sempre ``None``, e e' assim que se distingue fixo de" + NL,
        "                 variavel sem um booleano a mais." + NL,
        "- ``campos``     todos os componentes, com o mesmo par fixo/maximo." + NL,
        "- ``separador``  se o campo precisa de um FNC1 a separa-lo do seguinte." + NL,
        "                 **E' a razao de existir esta tabela**: sem ela nao se sabe" + NL,
        "                 onde acaba ``(10)LOTE-A1`` e onde comeca o campo seguinte." + NL,
        "- ``regex``      o regex do valor, da propria GS1." + NL + NL,
        "A origem e' " + origem + "." + NL,
        '"""' + NL + NL,
        "#: Os AIs, por numero. **As chaves sao cadeias e nao numeros**, porque o"
        + NL + "#: AI `01` perde o zero a esquerda quando e' um `int` - e um AI `00` e'" + NL
        + "#: diferente do AI `0`, que e' exactamente a razao de o `00` existir." + NL,
        'AIS = {' + NL,
    ]

    for numero, entrada in sorted(tabela.items()):
        campos = ", ".join(
            '{"tipo": "%s", "fixo": %s, "maximo": %s}'
            % (c["tipo"], nulo(c["fixo"], "None"), nulo(c["maximo"], "None"))
            for c in entrada["campos"]
        )
        linhas.append(
            "    '%s': {'formato': %s, 'fixo': %s, 'maximo': %s, 'campos': (%s,), "
            "'separador': %s, 'regex': %s},\n"
            % (
                numero,
                texto(entrada["formato"]),
                nulo(entrada["fixo"], "None"),
                nulo(entrada["maximo"], "None"),
                campos,
                str(entrada["separador"]).lower().capitalize().replace("True", "True"),
                texto(entrada["regex"]),
            )
        )

    linhas.append("}" + NL + NL)
    linhas.append(AI_DE["python"])
    return "".join(linhas)


# --- o Java -----------------------------------------------------------------


def java(tabela: dict, origem: str) -> str:
    """Um `record` por AI, e um mapa com `Map.ofEntries`."""
    linhas = [
        "package com.qrcodegen.core.simbologias;" + NL + NL,
        "import java.util.List;" + NL,
        "import java.util.Map;" + NL + NL,
        "/**" + NL,
        " * " + NOTA[0] + NL,
        " * <p>{@code " + NOTA[1] + NL,
        " *",
        " * <p>Sao 541 AIs e nao estao escritos a mao de proposito: mais de quinhentos" + NL,
        " * AIs nao se escrevem de memoria, e um AI com o comprimento errado da um" + NL,
        " * codigo que se desenha certo e que o leitor le como invalido." + NL,
        " *",
        " * <p>A origem e' " + origem + "." + NL,
        " */" + NL,
        "public final class TabelasGs1 {" + NL + NL,
        "    private TabelasGs1() {" + NL,
        "    }" + NL + NL,
        "    /**" + NL,
        "     * Um componente de um AI: o tipo, e o comprimento como par fixo/maximo." + NL,
        "     *" + NL,
        "     * <p><b>Um dos dois e' sempre nulo</b>, e e' assim que se distingue um campo" + NL,
        "     * de comprimento fixo de um variavel sem um booleano a mais. **Um campo" + NL,
        "     * que aceite os dois nao se sabe ler** - o AI `3103` e' um campo fixo de" + NL,
        "     * tres digitos mais um campo variavel, e nao um campo fixo de quatro." + NL,
        "     */" + NL,
        "    public record Componente(String tipo, Integer fixo, Integer maximo) {" + NL,
        "    }" + NL + NL,
        "    /**" + NL,
        "     * Um AI, com tudo o que o encoder precisa dele." + NL,
        "     *" + NL,
        "     * <p>{@code separador} diz se o campo precisa de um FNC1 a separa-lo do" + NL,
        "     * seguinte. <b>E' a razao de existir esta tabela</b>: sem ela nao se sabe" + NL,
        "     * onde acaba {@code (10)LOTE-A1} e onde comeca o campo seguinte." + NL,
        "     */" + NL,
        "    public record Ai(" + NL,
        "            String numero," + NL,
        "            String formato," + NL,
        "            Integer fixo," + NL,
        "            Integer maximo," + NL,
        "            List<Componente> campos," + NL,
        "            boolean separador," + NL,
        "            String regex," + NL,
        "            String resto) {" + NL + NL,
        "        /**" + NL,
        "         * O mesmo AI, com o numero efectivo e o que sobrou do campo." + NL,
        "         *" + NL,
        "         * <p><b>Os dois so' existem na procura</b>, e e' por isso que ficam" + NL,
        "         * no registo em vez de no mapa: um AI procurado directamente tem" + NL,
        "         * {@code resto} nulo, e a forma de o dizer e' o proprio nulo." + NL,
        "         */" + NL,
        "        public Ai buscado(String numeroEfectivo, String restoEfectivo) {" + NL,
        "            return new Ai(numeroEfectivo, formato, fixo, maximo, campos, separador," + NL,
        "                regex, restoEfectivo);" + NL,
        "        }" + NL,
        "    }" + NL + NL,
        "    /** Os AIs, por numero." + NL,
        "     *" + NL,
        "     * <p><b>As chaves sao cadeias e nao numeros</b>, porque o AI {@code 01}" + NL,
        "     * perde o zero a esquerda quando e' um {@code int} - e um AI {@code 00} e'" + NL,
        "     * diferente do AI {@code 0}, que e' exactamente a razao de o {@code 00}" + NL,
        "     * existir." + NL,
        "     */" + NL,
        "    public static final Map<String, Ai> AIS = Map.ofEntries(" + NL,
    ]

    entradas = []
    for indice, (numero, entrada) in enumerate(sorted(tabela.items())):
        componentes = ", ".join(
            "new Componente(%s, %s, %s)"
            % (texto(c["tipo"]), nulo(c["fixo"]), nulo(c["maximo"]))
            for c in entrada["campos"]
        )

        #: **Sem virgula no ultimo.** Uma virgula final numa lista de argumentos
        #: e' illegal em Java — e' legal num inicializador de array ou de objecto,
        #: que e' de onde vem o habito. A mensagem do compilador e'
        #: `illegal start of expression` **na linha do `)`**, que nao fala de
        #: virgulas nem de argumentos, e por isso que a primeira versao deste
        #: gerador gastou tempo a contar parenteses e a suspectar do limite de 255
        #: argumentos do javac — que nao e' o problema e' so atinge 541 com calma.
        ultimo = indice == len(tabela) - 1

        entradas.append(
            "        Map.entry(%s, new Ai(%s, %s, %s, %s, List.of(%s), %s, %s, null))%s\n"
            % (
                texto(numero),
                texto(numero),
                texto(entrada["formato"]),
                nulo(entrada["fixo"]),
                nulo(entrada["maximo"]),
                componentes,
                str(entrada["separador"]).lower(),
                texto(entrada["regex"]),
                "" if ultimo else ",",
            )
        )

    linhas.extend(entradas)
    linhas.append("    );" + NL + NL)
    linhas.append(AI_DE["java"])
    linhas.append("}")
    return "".join(linhas)


# --- o Kotlin ---------------------------------------------------------------


def kotlin(tabela: dict, origem: str) -> str:
    """Uma `data class` por AI, e um `mapOf`."""
    linhas = [
        "package com.qrcodegen.core.simbologias" + NL + NL,
        "/**" + NL,
        " * " + NOTA[0] + NL,
        " * `" + NOTA[1] + NL,
        " *",
        " * Sao 541 AIs e nao estao escritos a mao de proposito: mais de quinhentos AIs" + NL,
        " * nao se escrevem de memoria, e um AI com o comprimento errado da um codigo que" + NL,
        " * se desenha certo e que o leitor le como invalido." + NL,
        " *",
        " * A origem e' " + origem + "." + NL,
        " */" + NL,
        "object TabelasGs1 {" + NL + NL,
        "    /**" + NL,
        "     * Um componente de um AI: o tipo, e o comprimento como par fixo/maximo." + NL,
        "     *" + NL,
        "     * **Um dos dois e' sempre nulo**, e e' assim que se distingue um campo de" + NL,
        "     * comprimento fixo de um variavel sem um booleano a mais. **Um campo que" + NL,
        "     * aceite os dois nao se sabe ler** — o AI `3103` e' um campo fixo de tres" + NL,
        "     * digitos mais um campo variavel, e nao um campo fixo de quatro." + NL,
        "     */" + NL,
        "    data class Componente(val tipo: String, val fixo: Int?, val maximo: Int?)" + NL + NL,
        "    /**" + NL,
        "     * Um AI, com tudo o que o encoder precisa dele." + NL,
        "     *" + NL,
        "     * `separador` diz se o campo precisa de um FNC1 a separa-lo do seguinte." + NL,
        "     * **E' a razao de existir esta tabela**: sem ela nao se sabe onde acaba" + NL,
        "     * `(10)LOTE-A1` e onde comeca o campo seguinte." + NL,
        "     *" + NL,
        "     * **`resto` so' existe na procura**: um AI procurado directamente tem" + NL,
        "     * `resto` nulo, e e' por isso que nao ha um campo separado para o" + NL,
        "     * numero procurado." + NL,
        "     */" + NL,
        "    data class Ai(" + NL,
        "        val numero: String," + NL,
        "        val formato: String," + NL,
        "        val fixo: Int?," + NL,
        "        val maximo: Int?," + NL,
        "        val campos: List<Componente>," + NL,
        "        val separador: Boolean," + NL,
        "        val regex: String," + NL,
        "        val resto: String?," + NL,
        "    ) {" + NL,
        "        /** O mesmo AI, com o numero procurado e o que sobrou do campo. */" + NL,
        "        fun buscado(numeroEfectivo: String, restoEfectivo: String?): Ai =" + NL,
        "            Ai(numeroEfectivo, formato, fixo, maximo, campos, separador, regex," + NL,
        "                restoEfectivo)" + NL,
        "    }" + NL + NL,
        "    /**" + NL,
        "     * Os AIs, por numero." + NL,
        "     *" + NL,
        "     * **As chaves sao cadeias e nao numeros**, porque o AI `01` perde o zero a" + NL,
        "     * esquerda quando e' um `Int` — e um AI `00` e' diferente do AI `0`, que e'" + NL,
        "     * exactamente a razao de o `00` existir." + NL,
        "     */" + NL,
        "    val AIS: Map<String, Ai> = mapOf(" + NL,
    ]

    for numero, entrada in sorted(tabela.items()):
        componentes = ", ".join(
            "Componente(%s, %s, %s)"
            % (texto(c["tipo"]), nulo(c["fixo"]), nulo(c["maximo"]))
            for c in entrada["campos"]
        )
        linhas.append(
            "        %s to Ai(%s, %s, %s, %s, listOf(%s), %s, %s, null),\n"
            % (
                texto(numero),
                texto(numero),
                texto(entrada["formato"]),
                nulo(entrada["fixo"]),
                nulo(entrada["maximo"]),
                componentes,
                str(entrada["separador"]).lower(),
                texto(entrada["regex"]),
            )
        )

    linhas.append("    )" + NL + NL)
    linhas.append(AI_DE["kotlin"])
    linhas.append("}")
    return "".join(linhas)


# --- o C# -------------------------------------------------------------------


def csharp(tabela: dict, origem: str) -> str:
    """Um `record` por AI, e um dicionario com inicializadores."""
    linhas = [
        "namespace QrCodeGenerator.Core.Simbologias;" + NL + NL,
        "/// <summary>" + NL,
        "/// " + NOTA[0] + NL,
        "/// <c>" + NOTA[1] + "</c>" + NL,
        "/// </summary>" + NL,
        "/// <remarks><para>Sao 541 AIs e nao estao escritos a mao de proposito: mais de" + NL,
        "/// quinhentos AIs nao se escrevem de memoria, e um AI com o comprimento errado" + NL,
        "/// da um codigo que se desenha certo e que o leitor le como invalido.</para>" + NL,
        "/// <para>A origem e' " + origem + ".</para></remarks>" + NL,
        "public static class TabelasGs1" + NL,
        "{" + NL,
        "    /// <summary>Um componente de um AI: o tipo, e o comprimento fixo ou maximo.</summary>" + NL,
        "    /// <remarks><para><b>Um dos dois e' sempre nulo</b>, e e' assim que se" + NL,
        "    /// distingue um campo de comprimento fixo de um variavel sem um booleano a" + NL,
        "    /// mais. <b>Um campo que aceite os dois nao se sabe ler</b>: o AI <c>3103</c>" + NL,
        "    /// e' um campo fixo de tres digitos mais um variavel, e nao um campo fixo de" + NL,
        "    /// quatro.</para></remarks>" + NL,
        "    public sealed record Componente(string Tipo, int? Fixo, int? Maximo);" + NL + NL,
        "    /// <summary>Um AI, com tudo o que o encoder precisa dele.</summary>" + NL,
        "    /// <remarks><para><c>Separador</c> diz se o campo precisa de um FNC1 a" + NL,
        "    /// separa-lo do seguinte. <b>E' a razao de existir esta tabela</b>: sem ela" + NL,
        "    /// nao se sabe onde acaba <c>(10)LOTE-A1</c> e onde comeca o campo" + NL,
        "    /// seguinte.</para>" + NL,
        "    /// <para><c>Resto</c> so' existe na procura: um AI procurado directamente" + NL,
        "    /// tem <c>Resto</c> nulo, e e' por isso que nao ha um campo separado para o" + NL,
        "    /// numero procurado.</para></remarks>" + NL,
        "    public sealed record Ai(" + NL,
        "        string Numero," + NL,
        "        string Formato," + NL,
        "        int? Fixo," + NL,
        "        int? Maximo," + NL,
        "        IReadOnlyList<Componente> Campos," + NL,
        "        bool Separador," + NL,
        "        string Regex," + NL,
        "        string? Resto)" + NL,
        "    {" + NL,
        "        /// <summary>O mesmo AI, com o numero procurado e o que sobrou.</summary>" + NL,
        "        public Ai Buscado(string numeroEfectivo, string? restoEfectivo) =>" + NL,
        "            new(numeroEfectivo, Formato, Fixo, Maximo, Campos, Separador, Regex," + NL,
        "                restoEfectivo);" + NL,
        "    }" + NL + NL,
        "    /// <summary>" + NL,
        "    /// Os AIs, por numero." + NL,
        "    /// </summary>" + NL,
        "    /// <remarks>" + NL,
        "    /// <para><b>As chaves sao cadeias e nao numeros</b>, porque o AI <c>01</c>" + NL,
        "    /// perde o zero a esquerda quando e' um <c>int</c> — e um AI <c>00</c> e'" + NL,
        "    /// diferente do AI <c>0</c>, que e' exactamente a razao de o <c>00</c>" + NL,
        "    /// existir.</para>" + NL,
        "    /// <para><b>Um dicionario e nao uma lista</b>, porque se procura por numero e" + NL,
        "    /// nao se percorre — e porque uma lista de 541 entradas obriga a um indice" + NL,
        "    /// calculado, que e' um sitio a mais onde o encoder pode errar.</para>" + NL,
        "    /// </remarks>" + NL,
        "    public static IReadOnlyDictionary<string, Ai> AIS = new Dictionary<string, Ai>" + NL,
        "    {" + NL,
    ]

    for numero, entrada in sorted(tabela.items()):
        componentes = ", ".join(
            "new Componente(%s, %s, %s)"
            % (texto(c["tipo"]), nulo(c["fixo"]), nulo(c["maximo"]))
            for c in entrada["campos"]
        )
        linhas.append(
            "        [%s] = new Ai(%s, %s, %s, %s, new[] { %s }, %s, %s, null),\n"
            % (
                texto(numero),
                texto(numero),
                texto(entrada["formato"]),
                nulo(entrada["fixo"]),
                nulo(entrada["maximo"]),
                componentes,
                str(entrada["separador"]).lower(),
                texto(entrada["regex"]),
            )
        )

    linhas.append("    };" + NL + NL)
    linhas.append(AI_DE["csharp"])
    linhas.append("}")
    return "".join(linhas)


ESCRITORES = [web, python, java, kotlin, csharp]


def principal() -> int:
    tabela, origem = carregar()
    conferir(tabela)

    print(f"  {len(tabela)} AIs de {origem}")

    for caminho, escrever in zip(ALVOS, ESCRITORES):
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(escrever(tabela, origem), encoding="utf-8", newline="")
        tamanho = caminho.stat().st_size
        nome = caminho.relative_to(RAIZ)
        print(f"{nome}: {len(tabela)} AIs, {tamanho // 1024} KB")

    return 0


if __name__ == "__main__":
    raise SystemExit(principal())
