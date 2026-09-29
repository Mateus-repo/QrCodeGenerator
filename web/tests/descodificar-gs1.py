"""
Le com o ZXing os codigos GS1-128 que o encoder de JavaScript gerou.

Este e' o teste de nivel 2 do GS1-128, e e' o unico que interessa, porque o
GS1-128 tem **duas** coisas que so a leitura confirma:

  - O **FNC1 do inicio**, que o ZXing marca no `symbology_identifier` como `]C1`
    em vez de `]C0`. Sem ele o codigo desenha-se bem, le-se bem, e devolve
    exactamente o mesmo texto que um Code 128 normal - so que nao e' um GS1-128.
  - Os **separadores** entre campos de comprimento variavel, que o ZXing devolve
    como ``\\x1d`` nos bytes. Sem eles o leitor accounta o campo seguinte a partir
    do meio do anterior.

    O que o leitor devolve foi medido **antes** de o encoder existir, com scripts
    de diagnose que ficaram de fora do repositorio porque o que mediram esta
    agora nas comparacoes abaixo. Resumo do que se viu, e que e' a razao de este
    teste saber o que procurar em vez de so comparar cadeias:

      - O FNC1 do inicio **nao aparece no texto**, nem como ``<GS>`` nem como
        ``f``. Aparece so no ``symbology_identifier``, como ``]C1``.
      - Os separadores aparecem **nos bytes**, como ``\\x1d``, e **nao** no texto.
      - O ``text`` traz os AIs **entre parenteses** e os ``bytes`` trazem-nos
        **sem** - sao duas representacoes diferentes do mesmo codigo, e a que
        distingue um GS1-128 com separadores de um sem eles e' a dos bytes.

    Duas versoes deste teste falharam por esperar ``<GS>`` no texto, e uma por
    contar separadores no texto. Nenhuma das tres reflecte o que o ZXing faz.

    python web/tests/gerar-gs1.mjs        # se o .gs1.json nao existir
    python web/tests/descodificar-gs1.py
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import zxingcpp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
JSON = AQUI / ".gs1.json"

# O renderizador e' o do repositorio, o mesmo que o descodificar-lineares.py usa.
# Importa-se por caminho porque o nome do ficheiro tem um hifen, que nao e' um
# caractere valido num modulo Python - e foi esse o primeiro erro deste script.
_spec = importlib.util.spec_from_file_location(
    "descodificar_lineares", AQUI / "descodificar-lineares.py"
)
_linear = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_linear)
renderizar = _linear.renderizar

# O separador GS, tal como o ZXing o devolve nos bytes. E' o mesmo 0x1D que a
# GS1 usa, e nao um `]`: sao o mesmo byte, para que o que o encoder produz e o
# que o leitor le sejam o mesmo valor e nao duas tradicoes.
GS = "\x1d"


def garantir_json() -> None:
    if JSON.exists():
        return
    subprocess.run(
        ["node", str(AQUI / "gerar-gs1.mjs")],
        check=True,
        capture_output=True,
    )


def main() -> int:
    garantir_json()
    casos = json.loads(JSON.read_text(encoding="utf-8"))
    falhas = 0

    for caso in casos:
        nome = caso["nome"]
        entrada = caso["entrada"]

        if caso.get("erro"):
            # O encoder tinha de recusar. O `gerar-gs1.mjs` ja falhou o processo
            # se nao recusou, entao chegar aqui e' a confirmacao de que a
            # validacao de AI esta a funcionar.
            print(f"  ok     {nome:16} {entrada} -> recusado, como deve ser")
            continue

        modulos = caso["modulos"]
        if not modulos:
            print(f"  FALHOU {nome:16} {entrada}: o gerador nao produziu modulos")
            falhas += 1
            continue

        lidos = zxingcpp.read_barcodes(renderizar({"modules": modulos}))
        if not lidos:
            print(f"  FALHOU {nome:16} {entrada}: o ZXing nao leu nada")
            falhas += 1
            continue

        codigo = lidos[0]
        texto = codigo.text
        bytes_lidos = bytes(codigo.bytes) if getattr(codigo, "bytes", None) else b""
        identificador = codigo.symbology_identifier

        problemas = []

        # 1. O FNC1 do inicio. `]C1` e' o que diz "isto e' GS1". `]C0` e' um
        #    Code 128 normal - e o codigo seria lido sem queixa nenhuma, que e'
        #    o pior: no desenho nao ha diferenca nenhuma.
        if identificador != "]C1":
            problemas.append(f"identificador {identificador!r} em vez de ']C1'")

        # 2. **Os bytes**, que e' onde esta a prova de tudo.
        #
        #    O ZXing devolve tres coisas, e cada uma diz uma coisa diferente. Duas
        #    versoes deste teste falharam por esperar a representacao errada - a
        #    primeira esperava `<GS>` no texto porque um script feito a mao mostrava
        #    isso, e a segunda esperava os separadores no texto. Nenhuma das duas
        #    leu o ZXing a serio. O que o leitor faz, medido:
        #
        #      - `text`   os AIs **entre parenteses** - e' a forma humana, e o ZXing
        #                 reconstroi-a a partir dos bytes. E' a mais bonita e a
        #                 menos util para comparar: nao distingue um campo de
        #                 comprimento fixo de um variavel com o mesmo texto.
        #      - `bytes`  os campos **sem** parenteses, com `0x1D` onde esta o
        #                 separador. E' aqui que os separadores se veem, e e' o
        #                 que se compara.
        #      - `symbology_identifier` `]C1` quando ha FNC1 no inicio, `]C0`
        #                 quando nao ha. E' a unica prova de que o codigo e' um
        #                 GS1-128 e nao um Code 128 com os mesmos caracteres.
        #
        #    O `0x1D` nos bytes e' o que separa `10LOTE-A1` de `17` no caso do
        #    "lote no meio" - e sem ele o leitor accountaria o `17` como parte do
        #    lote. Por isso a comparacao e' feita sobre os bytes, e o numero de
        #    separadores e' a contagem de `0x1D` neles.
        #
        #    **Nota:** o FNC1 do inicio nao aparece nos bytes - o ZXing consome-o e
        #    marca-o no identificador. Por isso o encoder emite `separadores` FNC1
        #    (um do inicio, mais os separadores) e nos bytes ha `separadores - 1`.
        separadores_esperados = caso["separadores"] - 1
        gs_esperado = caso["payload"].encode("utf-8")

        if bytes_lidos != gs_esperado:
            problemas.append(f"bytes {bytes_lidos!r} em vez de {gs_esperado!r}")

        separadores_lidos = bytes_lidos.count(GS.encode())
        if separadores_lidos != separadores_esperados:
            problemas.append(
                f"{separadores_lidos} separadores nos bytes e o encoder emitiu "
                f"{separadores_esperados}"
            )

        # 3. O texto, que tem de ter os parenteses. E' a forma humana, e e' fraca
        #    para os separadores: nao distingue nada sobre eles. Fica como
        #    verificacao de que os AIs voltaaram aos sitios, que e' outra coisa.
        texto_esperado = caso["esperado"].replace(GS, "")
        if texto != texto_esperado:
            problemas.append(f"texto {texto!r} em vez de {texto_esperado!r}")

        if problemas:
            falhas += 1
            print(f"  FALHOU {nome:16} {entrada}")
            for p in problemas:
                print(f"           - {p}")
        else:
            print(
                f"  ok     {nome:16} {texto}  ({identificador}, "
                f"{separadores_lidos} separadores)"
            )

    print()
    if falhas:
        print(f"{falhas} de {len(casos)} GS1-128 nao bateram certo.")
        return 1

    print(f"Os {len(casos)} GS1-128 gerados pelo encoder JS sao legiveis pelo ZXing,")
    print("com o FNC1 do inicio reconhecido e os separadores no sitio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
