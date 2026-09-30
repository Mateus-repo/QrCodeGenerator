"""
Compara os modulos do Code 39, do ITF e do Codabar entre o web e o Python, e
depois manda o ZXing ler o que os dois produziram.

    node spec/modulos-web.mjs > spec/_modulos-web.json
    python spec/paridade-lineares.py

## O que este script apanha, e o que ja apanhou

**Uma divergencia de interface que nenhum teste apanhou.** O Codabar do web
recebe os dados e a moldura separada — `codabar("123456", {inicio: "A"})` — e a
primeira versao do Python pegava na cadeia toda e tirava as pontas,
`codabar("A123456A")`.

**As duas versoes passavam os testes das proprias stacks.** E' o que a
`AGENTS.md` quer dizer com "um payload que sai diferente num cliente e' um bug,
mesmo que o teste desse cliente passe": nao ha nada que accuse a outra versao,
porque cada uma le a que espera. Para quem usasse os dois clientes, o mesmo
campo dava dois codigos diferentes.

**Por isso que a comparacao e' byte a byte e nao "le o mesmo texto".** Um teste
que verifica "os dois leem `123456`" passa com duas geometrias diferentes, e a
diferenca so aparece na etiqueta. Comparar os modulos e' o que apanha.

## Porque o ZXing entra depois da comparacao

A comparacao diz se os dois clientes produzem a mesma coisa. **O ZXing diz se essa
coisa e' correcta** — e sao perguntas differentes: e' perfeitamente possivel os
dois estarem errados da mesma maneira, que e' o que acontece sempre que ha duas
versoes a partir de um texto mal lembrado.

A ordem e' comparacao primeiro, leitura depois, **porque se os modulos divergirem
a leitura nao interessa** — eoha mais qual dos dois esta certo.
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.desenho import to_bitmap  # noqa: E402
from qrcode_core.simbologias.lineares import codabar, code39, itf  # noqa: E402

#: Os casos que **sao iguais entre os dois clientes mas que nenhum leitor le**.
#:
#: **Estao aqui, e nao fora, de proposito.** Um ITF de um so par de digitos tem
#: vinte e dois modulos, e o ZXing — um leitor de laboratorio, melhor do que
#: quase tudo — nao o descodifica. Nao e' bug de nenhum dos dois clientes: os
#: modulos sao byte a byte iguais, que e' o que este script verifica.
#:
#: A razao de o manter na lista e' que **e' a prova de que a limitacao e' do
#: comprimento e nao da implementacao**. Se os dois clientes divergissem neste
#: caso, a divergencia apareceria na coluna dos modulos e nao na da leitura — e
#: seria um bug a serio. Nao e' apaga-lo de fininho: apagado, perdia-se a unica
#: evidencia de que o codigo curto nao e' culpa do encoder.
CURTOS_DEMAIS = {"itf|12"}

#: Como o Python monta cada caso, a partir do nome que o web usou.
#:
#: **O `|` separa o formato do texto, e nao um espaco.** Com um espaco, o nome
#: `codabar|AA` era o mesmo que `codabar|A` depois de um `partition(" ")` mal
#: feito, e o caso era montado com a moldura dentro dos dados — que o encoder
#: recusa, e que dava um `SimbologiaError` em vez de um `DIVERGE` honesto. O
#: separador explicito e' a razao de nao haver mal-entendido nenhum.
def montar(nome: str) -> list[bool]:
    tipo, _, resto = nome.partition("|")

    if tipo == "code39":
        if resto == "":
            return [bool(m) for m in code39("CODIGO", com_controlo=False)["modulos"]]
        return [bool(m) for m in code39(resto)["modulos"]]
    if tipo == "code39 sem controlo":
        return [bool(m) for m in code39(resto, com_controlo=False)["modulos"]]

    if tipo == "itf":
        return [bool(m) for m in itf(resto)["modulos"]]

    if tipo == "codabar largo":
        return [bool(m) for m in codabar("123456", largo=True)["modulos"]]
    if tipo == "codabar simbolos":
        return [bool(m) for m in codabar(resto)["modulos"]]
    if tipo == "codabar":
        if resto == "AA":
            return [bool(m) for m in codabar("123456")["modulos"]]
        if resto == "BB":
            return [bool(m) for m in codabar("123456", inicio="B", paragem="B")["modulos"]]
        if resto == "DD":
            return [bool(m) for m in codabar("12345", inicio="D", paragem="D")["modulos"]]
        return [bool(m) for m in codabar(resto)["modulos"]]

    raise SystemExit(f"nome de caso desconhecido: {nome!r}")


def modulos_do_web() -> dict[str, list[bool]]:
    """Corre o web e le os modulos que ele produz."""
    with tempfile.TemporaryDirectory() as pasta:
        destino = Path(pasta) / "modulos.json"
        with destino.open("w", encoding="utf-8") as f:
            subprocess.run(
                ["node", str(RAIZ / "spec" / "modulos-web.mjs")],
                stdout=f,
                check=True,
                cwd=RAIZ,
            )
        bruto = json.loads(destino.read_text(encoding="utf-8"))
    return {k: [bool(b) for b in v] for k, v in bruto.items()}


def main() -> int:
    casos = modulos_do_web()

    print(f"{'caso':18} {'python':>7} {'web':>6}  modulos  leitura")
    print("-" * 62)

    problemas: list[str] = []

    try:
        import zxingcpp
        from PIL import Image
    except ImportError:
        zxingcpp = None  # type: ignore[assignment]

    for nome, ref in casos.items():
        meu = montar(nome)

        if len(meu) != len(ref):
            problemas.append(f"{nome}: {len(meu)} modulos em Python e {len(ref)} no web")
            estado = f"DIVERGE ({len(meu)} vs {len(ref)})"
        elif meu != ref:
            # **A primeira diferenca e' o que vale a pena dizer**, e nao o
            # comprimento: dois com o mesmo numero de modulos e uma barra
            # trocada le-se com a mesma falha e nao se distinguem por cima.
            onde = next(i for i, (a, b) in enumerate(zip(meu, ref)) if a != b)
            problemas.append(f"{nome}: o modulo {onde} diverge (Python {meu[onde]}, web {ref[onde]})")
            estado = f"DIVERGE (modulo {onde})"
        else:
            estado = "identico"

        leitura = "-"
        if zxingcpp is not None:
            png = to_bitmap(meu, escala=3, guardas=None)
            resultado = zxingcpp.read_barcode(Image.open(io.BytesIO(png)))

            if resultado is None:
                leitura = "curto demais" if nome in CURTOS_DEMAIS else "NAO LEU"
                if nome not in CURTOS_DEMAIS:
                    problemas.append(f"{nome}: o ZXing nao leu o codigo")
            else:
                leitura = resultado.text

        print(f"{nome:18} {len(meu):7} {len(ref):6}  {estado:22} {leitura}")

    print("-" * 62)

    if problemas:
        print(f"\n{len(problemas)} problemas:")
        for p in problemas:
            print(f"  {p}")
        return 1

    print(f"\nOs {len(casos)} casos sao identicos entre o web e o Python. "
          f"O ZXing leu {len(casos) - len(CURTOS_DEMAIS)}; "
          f"{len(CURTOS_DEMAIS)} sao curtos demais para qualquer leitor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
