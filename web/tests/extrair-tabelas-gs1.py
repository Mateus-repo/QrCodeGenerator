"""
Extrai a tabela de Application Identifiers do GS1 para um JSON.

    python web/tests/extrair-tabelas-gs1.py

De onde vem
-----------

Do **`ref.gs1.org`**, a ferramenta oficial da GS1, que publica o conjunto de dados
em JSON-LD dentro da pagina. Nao foi a primeira fonte que se procurou: a GS1
distribui tambem um PDF, e um PDF e' pior para isto - a tabela sao 200 linhas com
formato de tabela, e extrair colunas de um PDF e' um trabalho com erros silenciosos.
O JSON-LD tem os campos ja separados.

Os campos que interessam, e porque-interestam:

``applicationIdentifier``
    O numero do AI, dois a quatro digitos.
``formatString``
    O formato do campo de dados, na notacao da GS1: ``N`` numerico, ``X``
    alfanumerico, ``a`` fixo ate ``..20`` variavel, e o ``+`` separa o AI do
    campo. E o que diz se o campo tem comprimento fixo e, se tiver, quantos
    caracteres sao.
``separatorRequired``
    Se o campo e de comprimento variavel e precisa de um FNC1 a separar do
    seguinte. **E o coracao do GS1-128**: sem este campo nao se sabe onde acaba
    ``(10)LOTE-A1``.
``regex``
    A expressao regular do valor. Valida o conteudo do campo melhor do que a
    contagem de caracteres, e e' da propria GS1.
``components``
    A decomposicao do ``formatString``, com o comprimento de cada parte. E o que
    permite implementacoes com prefixo, como os ``310n`` a peso, em que o ultimo
    digito do AI e uma posicao decimal implicita e nao parte do valor.

Por que e' preciso e nao se escreve de memoria
-----------------------------------------------

Mais de duzentos AIs, com formatos que so a GS1 pode dizer. A tabela do Code 39
foi escrita de memoria neste repositorio e saiu com doze elementos por caracter
em vez de nove; nenhum teste estrutural a apanhou. Uma tabela de AI errada tem o
mesmo formato de erro: um ``(17)27063`` de cinco digitos em vez de seis passa a
desenhar-se certo, e o leitor le-o como um campo invalido.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
JSON = AQUI / ".tabelas-gs1.json"

ORIGEM = "https://ref.gs1.org/ai/?lang=en"

# O JSON-LD esta num <script type="application/ld+json"> dentro da pagina. A
# pagina e' um CSRPs em Angular e os dados vao no proprio HTML, por isso
# extrai-se o bloco e parsesa-se - e nao se procura a API, que nao existe
# separadamente.
#
# Procura-se pelo `id="GS1AI_data"` e nao so pelo `type`. A primeira versao
# aceitava `<script type="application/ld+json">` em qualquer posicao de atributos
# e **nao encontrou nada**: o bloco do GS1 tem o `id` antes do `type`, e o
# `[^>]*type=` do padrao exigia o `type` a vir primeiro. Um padrao mais
# especifico falha de uma maneira mais honesta do que um largo que apanha o bloco
# errado.
BLOCO = re.compile(
    r'<script[^>]*id="GS1AI_data"[^>]*>(.*?)</script>',
    re.DOTALL,
)


def ir_buscar() -> str:
    """O HTML da pagina de AIs.

    O `User-Agent` nao e' vaidade: sem ele o servidor pode responder diferente, e
    um script de extracao que devolve uma pagina de erro em vez de um erro
    claro e' a pior das duas. A resposta e' HTML, e o HTML vem com o JSON-LD
    dentro - nao ha chamada de API separada para fazer.
    """
    pedido = urllib.request.Request(
        ORIGEM,
        headers={"Accept": "text/html", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        return resposta.read().decode("utf-8")


def entradas(html: str) -> list[dict]:
    """Os registos de AI, de dentro do JSON-LD.

    O JSON-LD tem um no de topo com metadados e uma lista, e cada elemento da
    lista e' um AI. A forma exacta do topo mudou entre versoes do site, por isso
    a busca e' por estrutura e nao por posicao: percorre-se o que for lista e
    ficam os dicionarios que tem `applicationIdentifier`.
    """
    blocos = BLOCO.findall(html)
    if not blocos:
        raise SystemExit(
            "O HTML nao tem o bloco GS1AI_data. A pagina mudou, ou o pedido "
            "veio sem JavaScript e sem os dados?"
        )

    for bruto in blocos:
        try:
            dados = json.loads(bruto)
        except json.JSONDecodeError:
            continue

        for lista in _listas(dados):
            candidatos = [x for x in lista if isinstance(x, dict) and "applicationIdentifier" in x]
            if len(candidatos) > 10:
                return candidatos

    raise SystemExit("Nao encontrei a lista de AIs em nenhum bloco JSON-LD.")


def _listas(no: object) -> list[list]:
    """Todas as listas que existem dentro de uma estrutura JSON.

    Um gerador com recursao, para nao se prender a forma do topo: o que interessa
    e' encontrar a lista grande de dicionarios com `applicationIdentifier`, e
    sabe-se que e' grande porque sao mais de cem AIs.
    """
    if isinstance(no, list):
        return [no]
    if isinstance(no, dict):
        encontradas: list[list] = []
        for valor in no.values():
            if isinstance(valor, (list, dict)):
                encontradas.extend(_listas(valor))
        return encontradas
    return []


def componentes(ai: dict) -> list[dict]:
    """A decomposicao do formato, quando existe.

    Nem todos os AIs a tem. Sem ela, o `formatString` ainda chega para os AIs
    simples - ``N2+X..20`` - mas nao para os que tem prefixo, em que o ultimo
    digito e uma posicao decimal implicita.
    """
    saida = []
    for c in ai.get("components") or []:
        saida.append(
            {
                "tipo": c.get("type"),
                "comprimento": c.get("length"),
                "opcional": c.get("optional"),
                "fixo": c.get("fixedLength"),
                "minimo": c.get("minLength"),
                "maximo": c.get("maxLength"),
            }
        )
    return saida


def limpar(ai: dict) -> dict:
    return {
        "ai": ai["applicationIdentifier"],
        "formato": ai.get("formatString", ""),
        "descricao": (ai.get("description") or "").strip(),
        "titulo": (ai.get("title") or "").strip(),
        "separador": bool(ai.get("separatorRequired")),
        "regex": ai.get("regex") or "",
        "componentes": componentes(ai),
    }


def main() -> int:
    html = ir_buscar()
    brutos = entradas(html)
    tabela = sorted((limpar(a) for a in brutos), key=lambda a: a["ai"])

    JSON.write_text(
        json.dumps(
            {
                "origem": ORIGEM,
                "aviso": (
                    "Extraido do JSON-LD do ref.gs1.org. Gerado por "
                    "extrair-tabelas-gs1.py; nao editar a mao."
                ),
                "ais": tabela,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    comSeparador = sum(1 for a in tabela if a["separador"])
    print(f"{JSON.name}: {len(tabela)} AIs, {comSeparador} com separador FNC1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
