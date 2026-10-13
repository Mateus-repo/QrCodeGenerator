"""
Le com o ZXing os GS1 DataMatrix que o encoder de **Python** gerou.

Este e' o **nivel 2 do GS1 DataMatrix em Python**, e a `AGENTS.md` nao aceita menos:
*um encoder so entra no repositorio depois de o ZXing devolver a string certa.* O
`paridade` mostra que o Python faz o mesmo que o web; este mostra que o leitor
independente le o resultado.

    python web/tests/descodificar-gs1-datamatrix-python.py

## O que se verifica, e sao as duas metades do FNC1

  - o **FNC1 do inicio**, que o ZXing marca no `symbology_identifier` como ``]d2`` em vez
    de ``]d1`` e no `content_type` como ``GS1`` em vez de ``Text``;
  - o **separador** nos campos de comprimento variavel, que volta nos bytes como
    ``0x1D``.

O ``]d2`` e' a unica coisa que distingue um GS1 DataMatrix de um Data Matrix normal
com os mesmos caracteres, e **e' o sintoma que so aparece quando o FNC1 do inicio esta
no primeiro codeword** - que e' exactamente o que este teste mede.

**Os casos vem do web**, e nao de uma lista aqui: duas listas do mesmo conjunto divergem
em silencio. Corre-se o gerador em vez de ler o JSON de uma execucao anterior, pelo mesmo
motivo - senao a comparacao passava a verificar o encoder de hoje contra o de ontem.

**E a comparacao e' pelos bytes, nunca pelo texto.** O `text` do `zxingcpp` na ausencia
de ECI assume ISO-8859-1, e um GS1 DataMatrix nao tem ECI: um ``ç`` lido por um caminho
e por outro nao sao o mesmo byte. O `bytes` devolve o que o codigo transporta.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import zxingcpp

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from PIL import Image  # noqa: E402

from qrcode_core.simbologias.desenho import to_bitmap_2d  # noqa: E402
from qrcode_core.simbologias.gs1_datamatrix import gs1_datamatrix  # noqa: E402

AQUI = RAIZ / "web" / "tests"
JSON = AQUI / ".gs1-datamatrix-python.json"

#: Quantos pixele por modulo. **Quatro**, e nao um: o ZXing detecta o simbolo por
#: contraste e a 1 pixele por modulo um codigo pequeno da problemas de amostragem nos
#: cantos tracejados, que sao a unica coisa de que o leitor se serve para se orientar.
ESCALA = 4

GS = b"\x1d"


def casos_do_web() -> list[dict]:
    """Corre o gerador do web e le os casos que ele produziu."""
    subprocess.run(
        ["node", str(AQUI / "gerar-gs1-datamatrix-python.mjs")],
        cwd=RAIZ,
        check=True,
        capture_output=True,
    )
    return json.loads(JSON.read_text(encoding="utf-8"))


def mostrar(texto: str, largura: int = 30) -> str:
    """O payload, mas em ASCII: a consola do Windows e' cp1252 e rebenta com um acento."""
    cru = texto.encode("ascii", errors="backslashreplace").decode("ascii")
    return f"{cru[:largura]!r:<{largura + 2}}"


def _renderizar(png: bytes) -> Image.Image:
    """A imagem de volta, para o ZXing."""
    import io

    return Image.open(io.BytesIO(png))


def main() -> int:
    casos = casos_do_web()

    codificaveis = [c for c in casos if not c.get("erro")]
    print(f"{len(codificaveis)} casos do encoder de Python, lidos pelo ZXing")

    falhas = 0

    for caso in casos:
        if caso.get("erro"):
            # Uma recusa que o Python **nao** faz seria o resultado mais grave - o
            # web ja recusou, a paridade passava, e o sintoma e' uma etiqueta
            # impressa com um campo a mais.
            try:
                gs1_datamatrix(caso["entrada"])
            except Exception:
                print(f"  ok    {mostrar(caso['entrada'], 28)} recusado, como deve ser")
                continue

            print(f"  FALHOU {mostrar(caso['entrada'], 28)} o Python ACEITOU o que devia recusar")
            falhas += 1
            continue

        codigo = gs1_datamatrix(caso["entrada"])
        imagem = _renderizar(to_bitmap_2d(codigo["modulos"], escala=ESCALA))

        lidos = zxingcpp.read_barcodes(imagem)

        if not lidos:
            print(f"  FALHOU {mostrar(caso['entrada'], 34)} o ZXing nao leu nada")
            falhas += 1
            continue

        lido = lidos[0]
        texto = lido.text
        bytes_lidos = bytes(lido.bytes) if getattr(lido, "bytes", None) else b""
        identificador = lido.symbology_identifier
        tipo = str(lido.content_type).replace("ContentType.", "")

        problemas = []

        # **O `]d2` e' o sintoma do FNC1 do inicio.** Um `]d1` seria um Data Matrix
        # normal, e o codigo seria lido sem queixa nenhuma - o utilizador nunca
        # veria a diferenca, so o leitor de um sistema GS1.
        if identificador != "]d2":
            problemas.append(f"identificador {identificador!r} em vez de ']d2'")

        if tipo != "GS1":
            problemas.append(f"content_type {tipo!r} em vez de 'GS1'")

        payload = caso["payload"].encode("utf-8")
        if bytes_lidos != payload:
            problemas.append(f"bytes {bytes_lidos!r} em vez de {payload!r}")

        separadores_lidos = bytes_lidos.count(GS)
        separadores_esperados = caso["separadores"] - 1
        if separadores_lidos != separadores_esperados:
            problemas.append(
                f"{separadores_lidos} separadores lidos e o encoder emitiu {separadores_esperados}"
            )

        texto_esperado = caso["gs1"].replace("\x1d", "<GS>")
        if texto != texto_esperado:
            problemas.append(f"texto {texto!r} em vez de {texto_esperado!r}")

        if problemas:
            falhas += 1
            print(f"  FALHOU {mostrar(caso['entrada'], 34)}")
            for p in problemas:
                print(f"           - {p}")
        else:
            print(
                f"  ok    {mostrar(caso['entrada'], 28)} {codigo['linhas']}x"
                f"{codigo['colunas']:<4} {texto}  ({identificador}, {tipo}, "
                f"{separadores_lidos} separadores)"
            )

    print()
    if falhas:
        print(
            f"{falhas} de {len(codificaveis)} GS1 DataMatrix do encoder de Python nao "
            "sobreviveram a leitura pelo ZXing."
        )
        return 1

    print(
        f"Os {len(codificaveis)} GS1 DataMatrix gerados pelo encoder de Python sao "
        "legiveis pelo ZXing, com o FNC1 do inicio reconhecido e os separadores no sitio."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())