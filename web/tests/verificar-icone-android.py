"""
Confere a transformacao do `ic_launcher_foreground.xml`.

    python web/tests/verificar-icone-android.py

**O que se mede, e porque nao se desenha o Drawing.**

A transformacao e' uma conta fechada, e a conta e' verificavel sem emulador e sem
renderizador:

    pivo + (256 − pivo) × escala = 54
    M(96) = 18,  M(416) = 90,  lado = 72

**Isto e' a defesa contra o bug que aconteceu.** Com `pivotX=54` — que e' o centro da
zona segura, e **nao** o ponto que fica quieto durante a escala — o conteudo inteiro
saiu 45 unidades para baixo e para a direita, e o que ficou no ecra foi o canto do
gradiente: **um icone que se parece com o fundo e mais nada**, que compila, instala e
nao da erro nenhum.

**E a razao de o verificador nao tentar medir a caixa das formas.** As formas tem
cantos arredondados, e a "caixa" de um `path` com curvas nao se leem nos numeros de
controlo — o numero mais alto de um arco esta no ponto de controlo, e o sitio mais alto
da curva e' outro. **Um verificador que mede a coisa errada e' pior do que nenhum**,
porque da um numero que ninguem sabe de onde veio. A conta da transformacao e' exacta
e nao precisa de adivinhar curvas.

O que o sistema faz a seguir — recortar com a mascara do lancador — e' coisa dele, e a
zona segura e' o que garante que o conteudo nao e' cortado. **E o Drawing nao leva o
fundo**, que e' outra camada.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
FOREGROUND = RAIZ / "kotlin/android/src/main/res/drawable/ic_launcher_foreground.xml"

VISTA = 108.0
SEGURO = 72.0
CENTRO_SVG = 256.0
LADO_SVG = 320.0  # de 96 a 416
BORDA_SVG = 96.0
BORDA_SVG_FIM = 416.0


def numeros(caminho: Path) -> tuple[float, float]:
    texto = caminho.read_text(encoding="utf-8")
    esc = re.search(r'android:scaleX="(-?[\d.]+)"', texto)
    pivo = re.search(r'android:pivotX="(-?[\d.]+)"', texto)
    if not esc or not pivo:
        raise SystemExit("  o Drawing nao tem <group> com escala e pivo")
    return float(esc.group(1)), float(pivo.group(1))


def aplicar(x: float, esc: float, pivo: float) -> float:
    """Um ponto, como o Android o transformaria — a mesma Transformacao uma vez."""
    return pivo + (x - pivo) * esc


def main() -> int:
    if not FOREGROUND.exists():
        raise SystemExit(f"  O Drawing nao esta' em {FOREGROUND}")

    esc, pivo = numeros(FOREGROUND)

    problemas = []

    # A conta que fecha. **Estes sao os numeros que tem de dar** — e sao a defense
    # contra o pivo no sitio errado.
    centro = aplicar(CENTRO_SVG, esc, pivo)
    inicio = aplicar(BORDA_SVG, esc, pivo)
    fim = aplicar(BORDA_SVG_FIM, esc, pivo)
    lado = fim - inicio

    esperado_centro = VISTA / 2.0  # 54
    esperado_inicio = (VISTA - SEGURO) / 2.0  # 18
    esperado_fim = esperado_inicio + SEGURO  # 90

    print(f"  a escala e' {esc:.6f} e o pivo e' {pivo:.4f}")
    print(f"  M(256) -> {centro:.2f}  (tem de dar {esperado_centro:g})")
    print(f"  M(96)  -> {inicio:.2f}  (tem de dar {esperado_inicio:g})")
    print(f"  M(416) -> {fim:.2f}  (tem de dar {esperado_fim:g})")
    print(f"  o lado -> {lado:.2f}  (tem de dar {SEGURO:g})")

    def perto(a: float, b: float) -> bool:
        return abs(a - b) < 0.5

    if not perto(centro, esperado_centro):
        problemas.append(
            f"o conteudo nao fica centrado: M(256) da {centro:.2f}, e o centro e' {esperado_centro:g}"
        )

    if not perto(inicio, esperado_inicio):
        problemas.append(
            f"o conteudo comeca em {inicio:.2f} e a zona segura comeca em {esperado_inicio:g}"
        )

    if not perto(fim, esperado_fim):
        problemas.append(
            f"o conteudo acaba em {fim:.2f} e a zona segura acaba em {esperado_fim:g}"
        )

    if not perto(lado, SEGURO):
        problemas.append(f"o conteudo tem {lado:.2f} de lado e a zona segura tem {SEGURO:g}")

    # **O numero de formas.** Um Drawing com menos formas e' um ficheiro valido que
    # mostra so parte do logo — e ja aconteceu duas vezes (os `#fff` de 3 digitos, e os
    # rects que herdam a cor do `<g>`). O `gerar-marca.py` tambem confere isto, e
    # aqui e' a segunda conferencia, de um ficheiro ja' escrito em disco.
    xml = FOREGROUND.read_text(encoding="utf-8")
    formas = len(re.findall(r'android:fillColor="#', xml)) + len(
        re.findall(r'<aapt:attr name="android:fillColor">', xml)
    )
    print(f"  {formas} formas no Drawing")

    # **Os tres padroes de localizacao, pelas cores e pelos sitios.** Os tres
    # padroes sao os rects brancos grandes (os de 96 de lado, no SVG), em tres dos
    # quatro cantos; o quarto e' a faisca.
    brancos_grandes = re.findall(r'android:fillColor="#FFFFFFFF"\s*\n?\s*android:pathData="M(\d+),(\d+)h72', xml)
    print(f"  {len(brancos_grandes)} padroes de localizacao (rects brancos de 72 de lado)")

    if formas != 24:
        problemas.append(f"o Drawing tem {formas} formas e o SVG tem 24")

    if len(brancos_grandes) != 3:
        problemas.append(f"sao {len(brancos_grandes)} padroes de localizacao, e' preciso 3")

    print()
    if problemas:
        print(f"  **{len(problemas)} problemas:**")
        for p in problemas:
            print(f"    - {p}")
        return 1

    print("  A transformacao leva o conteudo do SVG para a zona segura, centrado, com")
    print("  o lado certo e os tres padroes. O que o sistema faz a seguir e' recorte.")
    return 0


if __name__ == "__main__":
    sys.exit(main())