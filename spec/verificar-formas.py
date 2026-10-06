"""
Le cada forma do FieldQR com o ZXing.

    node spec/verificar-formas.mjs
    python spec/verificar-formas.py

## O que esta script responde

**Se as formas se leem.** A `AGENTS.md` e' explicita sobre o limite do
logotipo: a percentagem de correccao de erros do QR nao e' o que o limita, porque
conta *codewords errados* e so vale com os erros espalhados por varios blocos.
**Uma mancha apagada e' contigua, e uma mancha e' o pior caso** — e por isso que
um logotipo maior se pode ler a um nivel de correccao que um menor nao le.

**E a forma mexe na mancha.** O quadrado apaga a area toda e a estrela apaga so
as pontas, e a diferenca e' grande: **medida, numa caixa de onze modulos, o
quadrado apaga 101 modulos e a estrela 62**. Por isso que `modulosMaximos` tem
de ser por forma, e este script e' que diz se a conta que ele faz serve.

## O que esta script nao responde

Se o **ficheiro exportado pelo browser** se le. Isso e' `descodificar-frameqr.py`,
que le o PNG e o SVG que a aplicao produce. Aqui a matriz e' desenhada em Node,
sem passar pela aplicao, e por isso que os dois medem coisas diferentes.

## O angulo e a posicao entram com o mesmo peso

**Angulo e posicao nao mudam quantos modulos se apagam** — mudam *quais*. Por
isso que so a leitura diz seprestam, e por isso que estes casos nao sao uma
verificacao separada mas parte da mesma lista. **Um logotipo rodado que tapa um
padrao de localizacao le-se pior do que um logotipo grande**, e a unica
diferenca entre os dois e' que o rodado parece mais com um logotipo.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

CASOS = RAIZ / "spec" / "_formas" / "casos.json"
PAYLOAD = RAIZ / "spec" / "_formas" / "payload.txt"


def desenhar(matriz: list[list[int]], escala: int, borda: int):
    """A matriz como imagem, com a margem que a aplicao lhe da."""
    from PIL import Image

    n = len(matriz)
    lado = (n + borda * 2) * escala
    imagem = Image.new("L", (lado, lado), 255)
    pxeis = imagem.load()

    for y, linha in enumerate(matriz):
        for x, bit in enumerate(linha):
            if not bit:
                continue
            for dy in range(escala):
                for dx in range(escala):
                    pxeis[borda * escala + x * escala + dx, borda * escala + y * escala + dy] = 0

    return imagem


def rotulo(caso: dict) -> str:
    """O nome do caso, com o que o distingue dos outros."""
    partes = [caso["ecl"], caso["forma"], f"{caso['modulos']}mod"]

    if caso.get("angulo"):
        partes.append(f"{caso['angulo']}°")
    if caso.get("deslocX"):
        partes.append(f"x{caso['deslocX']:+d}")
    if caso.get("deslocY"):
        partes.append(f"y{caso['deslocY']:+d}")

    return " ".join(partes)


def main() -> int:
    if not CASOS.exists():
        print(
            "Falta spec/_formas/casos.json.\n"
            "  node spec/verificar-formas.mjs",
            file=sys.stderr,
        )
        return 1

    try:
        import zxingcpp
    except ImportError:
        print(
            "Falta o zxing-cpp.\n"
            "  python -m pip install zxing-cpp\n"
            "\n"
            "Estes casos **nao podem ser escritos a mao** — a regra e' que um "
            "codigo so entra no repositorio depois de um leitor independente "
            "devolver a string certa.",
            file=sys.stderr,
        )
        return 1

    esperado = PAYLOAD.read_text(encoding="utf-8")
    casos = json.loads(CASOS.read_text(encoding="utf-8"))

    # O codigo tem de ser lido em todos os niveis, e nao so no mais generoso: e
    # o limite que interessa, e o limite e' onde deixa de ler.
    escala = 4
    borda = 4

    print(f"{'caso':34} {'apag%':>6}  leitor")
    print("-" * 62)

    problemas: list[str] = []
    lidos = 0
    sem_matriz = 0

    for caso in casos:
        if not caso.get("matriz"):
            sem_matriz += 1
            continue

        nome = rotulo(caso)
        imagem = desenhar(caso["matriz"], escala, borda)
        resultado = zxingcpp.read_barcode(imagem)

        if resultado is None:
            problemas.append(f"{nome}: nao leu")
            estado = "NAO LEU"
        elif resultado.text != esperado:
            problemas.append(f"{nome}: leu {resultado.text[:24]!r}")
            estado = "DIVERGE"
        else:
            estado = "ok"
            lidos += 1

        print(f"{nome:34} {caso['percentagem']:5.2f}%  {estado}")

    print("-" * 62)

    if sem_matriz:
        print(f"({sem_matriz} casos sem logótipo — o QR nao aguenta nesta forma)")

    if problemas:
        print(f"\n{len(problemas)} problemas:")
        for p in problemas:
            print(f"  {p}")
        return 1

    print(f"\nOs {lidos} casos com logótipo foram lidos pelo ZXing com a string certa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())