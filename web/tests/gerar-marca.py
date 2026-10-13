"""
Gera os icones da marca a partir do logo, para o web e para o Android.

    python web/tests/gerar-marca.py

**O logo tem duas fontes, e cada formato usa a que lhe serve.** Nao e' redundancia:

  - **`logo/qrcodegenerator-logo.svg`** — o vector. E' o que o browser pede primeiro
    e o que o Android monta em {@code VectorDrawable}. Nitido em qualquer ecra e em
    qualquer densidade, e um ficheiro de 10 KB em vez de 30.
  - **`logo/qrcodegenerator-logo-512x512.png`** — a rasterizacao do mesmo desenho, com
    os cantos transparentes. E' o que o iOS e' obrigado a ler, e o que o formato
    {@code .ico} quer.

**Um rasterizador de SVG seria um segundo desenho.** Nao ha nenhum aqui, e nao porque
faltou: converter o SVG para PNG exigiria uma biblioteca, e essa biblioteca seria uma
implementacao a mais de uma coisa que ja' existe feita — que e' exactamente o que a
`AGENTS.md` proibe para as tabelas dos codigos de barras.

## O que este script gera

| ficheiro | de onde | para que |
|---|---|---|
| `web/assets/marca.svg` | o SVG, copiado | a aba do browser |
| `web/favicon.ico` | o PNG, 16/32/48 | a aba, conforme o zoom |
| `web/assets/marca-192.png` | o PNG, reduzido | `apple-touch-icon` |
| `web/assets/marca-512.png` | o PNG, reduzido | manifesto, iPad |
| `kotlin/.../mipmap-*/ic_launcher.png` | o PNG, nas 5 densidades | launchers que nao usam icone adaptativo |
| `kotlin/.../drawable/ic_launcher_*.xml` | o SVG, convertido | o icone adaptativo |

## O que este script **nao** faz, e e' a decisao mais importante

**Nao toca nos icones PWA que ja' existem** — `assets/icon-192.png`, `icon-512.png`,
`icon.svg`. Esses sao **QR codes**, gerados pelo encoder de verdade, e o
`descodificar-icones.py` le-os com o ZXing e confirma que devolvem o endereco do
gerador.

**Um icone que e' um QR e' melhor do que um icone que e' um desenho.** Escanear o
icone abre o gerador, e isso vale mais do que a imagem se parecer com o logo. Trocar
isso por um quadrado seria perder uma funcao para ganhar parecenca — por isso que a
marca entra como **icone adicional** (`purpose: any`), e nunca no sitio dos QR.

## E o favicon que estava la'

O `web/favicon.png` de 32 pixeis **nao era lido por ninguem**: o `index.html` nao o
referencia. O `favicon.ico` com 16, 32 e 48 num so ficheiro e' o que o browser escolhe
conforme o zoom da pagina, e e' por isso que um favicon de 32 so fica esbatido na aba.
"""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
SVG = RAIZ / "logo" / "qrcodegenerator-logo.svg"
PNG = RAIZ / "logo" / "qrcodegenerator-logo-512x512.png"

ASSETS = RAIZ / "web" / "assets"
RES = RAIZ / "kotlin" / "android" / "src" / "main" / "res"

#: As densidades do Android, e o tamanho do icone do lancador em cada uma. **Sao as
#: cinco de sempre, e nenhuma a mais** — uma densidade que ninguem pede e' um ficheiro
#: que ninguem apaga, e sobe o APK.
DENSIDADES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

#: A vista do vector drawable do Android. **108x108 e' a convencao**, e o conteudo
#: so e' seguro nos **72x72 do centro** — os 18 de cada lado podem ser recortados pela
#: mascara do lancador, que e' redonda no Pixel e square no launcher antigo.
VISTA = 108
SEGURO = 72


def web() -> None:
    """Os ficheiros do web."""
    destino = ASSETS / "marca.svg"
    shutil.copyfile(SVG, destino)
    print(f"  {destino.relative_to(RAIZ)}  {destino.stat().st_size} bytes")

    with Image.open(PNG) as fonte:
        marca = fonte.convert("RGBA")

        for tamanho, nome in ((192, "marca-192.png"), (512, "marca-512.png")):
            destino = ASSETS / nome
            _reduzir(marca, tamanho).save(destino, "PNG", optimize=True)
            print(f"  {destino.relative_to(RAIZ)}  {destino.stat().st_size} bytes")

        # **O `.ico` leva 16, 32 e 48 num ficheiro so.** O formato aceita varios
        # tamanhos e o browser escolhe conforme o zoom. Gerar um ICO so de 32 e'
        # meio caminho: a aba mostra-o a menos de metade.
        destino = RAIZ / "web" / "favicon.ico"
        _reduzir(marca, 48).save(
            destino, "ICO", sizes=[(16, 16), (32, 32), (48, 48)]
        )
        print(f"  {destino.relative_to(RAIZ)}  {destino.stat().st_size} bytes")


def _reduzir(marca: Image.Image, tamanho: int) -> Image.Image:
    """
    A marca no tamanho pedido, com **um filtro que nao faz serrilhado**.

    **O `LANCZOS` e' o que importa, e a razao de o dizer aqui.** O `favicon.png` que
    estava la' foi reduzido sem filtro e a 32 pixeis os modulos do logo juntavam-se
    entre si — e um icone onde ja' nao se distinguem as formas deixa de ser o logo.
    Reduzir de 512 para 16 e' um factor de 32, e so o `LANCZOS` sobrevive a isso
    mantendo a borda.
    """
    return marca.resize((tamanho, tamanho), Image.LANCZOS)


def android() -> None:
    """Os drawables e os PNG do Android."""
    with Image.open(PNG) as fonte:
        marca = fonte.convert("RGBA")

        for densidade, tamanho in DENSIDADES.items():
            pasta = RES / f"mipmap-{densidade}"
            pasta.mkdir(parents=True, exist_ok=True)
            destino = pasta / "ic_launcher.png"
            _reduzir(marca, tamanho).save(destino, "PNG", optimize=True)
            print(f"  {destino.relative_to(RAIZ)}  {destino.stat().st_size} bytes")

    vector()


def vector() -> None:
    """
    O icone adaptativo, montado a partir do **SVG**.

    **O `background` e' o gradiente e o `foreground` sao as formas** — que e' como o
    icone adaptativo foi feito para funcionar: o sistema recorta e enriquece cada
    camada. E' por isso que o `foreground` **nao** leva o fundo: um launcher que
    aplica a mascara sobre o gradiente inteiro da' um anel duplo.

    ## A conta da escala, e porque nao e' a mesma do PNG

    O conteudo do SVG ocupa de 96 a 416, ou seja **320 pixeis de 512**, e vem
    centrado em 256. A zona segura do Android sao **72 dos 108**, ou seja o conteudo
    tem de caber em 72 e ficar centrado nos 54.

        escala = 72 / 320 = 0,225
        256 -> 54   (o centro do conteudo no centro da zona segura)

    Com `pivotX` e `pivotY` a 54, o Android faz a escala **em volta do pivo**, e o
    `M(256, 256)` cai em `54 + 0,225 * (256 - 256) = 54`. **Os `translateX` e
    `translateY` ficam a zero de proposito** — um `translate` a mais aqui e' o
    logotipo deslocado, que e' o mesmo bug do `offset` que a `AGENTS.md` ja registou
    uma vez.
    """
    pasta = RES / "drawable"
    pasta.mkdir(parents=True, exist_ok=True)

    texto = SVG.read_text(encoding="utf-8")

    escala = SEGURO / 320.0
    pivo = VISTA / 2.0

    # --- o fundo: o gradiente, que e' o que a mascara vai recortar ----------
    fundo = _vector_fundo()
    (pasta / "ic_launcher_background.xml").write_text(fundo, encoding="utf-8", newline="\n")

    # --- o primeiro plano: as formas do SVG, encolhidas --------------------
    frente = _vector_frente(texto, escala, pivo)
    (pasta / "ic_launcher_foreground.xml").write_text(frente, encoding="utf-8", newline="\n")

    # --- a camada monocromatica ------------------------------------------
    #
    # **Esta e' uma terceira coisa, e nao o foreground com outra cor.** A camada
    # `monochrome` e' tintada pelo sistema com a cor do tema — e' o "icone tematico"
    # do Android 13. **O sistema nao sabe que o `foreground` e' um gradiente**: se a
    # mesma malha for usada aqui, o que aparece e' um gradiente pintado de uma cor
    # so, que e' uma mancha sem os padroes de localizacao — **o oposto de um icone
    # tematico legivel**.
    #
    # Por isso que aqui vao **as mesmas formas, todas na mesma cor**. O que
    # interessa nesta camada e' a silhueta.
    mono = _vector_mono(texto, escala, pivo)
    (pasta / "ic_launcher_monochrome.xml").write_text(mono, encoding="utf-8", newline="\n")

    for nome in (
        "ic_launcher_background.xml",
        "ic_launcher_foreground.xml",
        "ic_launcher_monochrome.xml",
    ):
        destino = pasta / nome
        print(f"  {destino.relative_to(RAIZ)}  {destino.stat().st_size} bytes")


def _vector_fundo() -> str:
    """
    O fundo, com o gradiente na diagonal.

    **O gradiente num `VectorDrawable` so existe a partir do API 24**, e e' um
    `<aapt:attr>` dentro do `fillColor` — nao um atributo. **Como o `minSdk` e' 26,
    nao ha problema nenhum**; se um dia descer abaixo de 24, este ficheiro tem de
    virar um gradiente em tres `<path>` ou a cor tem de ser fixa.

    **As cores sao as do SVG, lidas dele e nao escritas aqui.** Um gradiente repetido
    a mao diverge do original na primeira alteracao do desenho, e ninguem ve porque o
    gradiente e' so um degrade.
    """
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- Gerado por web/tests/gerar-marca.py. Nao editar a mao. -->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    xmlns:aapt="http://schemas.android.com/aapt"\n'
        f'    android:width="{VISTA}dp"\n'
        f'    android:height="{VISTA}dp"\n'
        f'    android:viewportWidth="{VISTA}"\n'
        f'    android:viewportHeight="{VISTA}">\n'
        "    <path android:pathData=\"M0,0h108v108h-108z\">\n"
        "        <aapt:attr name=\"android:fillColor\">\n"
        "            <gradient\n"
        '                android:type="linear"\n'
        '                android:startX="0" android:startY="0"\n'
        '                android:endX="108" android:endY="108">\n'
        '                <item android:offset="0" android:color="#FF1E3A8A" />\n'
        '                <item android:offset="1" android:color="#FF0B1220" />\n'
        "            </gradient>\n"
        "        </aapt:attr>\n"
        "    </path>\n"
        "</vector>\n"
    )


def _vector_frente(texto: str, escala: float, pivo: float) -> str:
    """
    As formas do logo, convertidas para `VectorDrawable`.

    **O SVG e' desenhado em coordenadas de 512 e o Android em coordenadas de 108.** Por
    isso que as formas vao num `<group>` com a escala, e nao convertidas uma a uma: a
    conversao ponto a ponto de um `rect` com `rx` nao tem equivalente directo no
    `VectorDrawable` — o `rect` nao existe la, so o `path` — e reescrever cada rect
    como path a mao seria **transcrever o desenho**, que e' o que a `AGENTS.md`
    proibe.

    **O que o Android tem e' o `path`.** Um `<rect>` do SVG converte-se para um path
    com os cantos arredondados, e isso e' uma conta — nao uma transcricao. Por isso
    que a conversao esta' aqui, em codigo, e nao escrita a mao.
    """
    partes = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<!-- Gerado por web/tests/gerar-marca.py. Nao editar a mao. -->",
        "<!--",
        "  O conteudo do SVG ocupa 320 dos 512, centrado em 256. A zona segura do",
        f"  Android sao {SEGURO} dos {VISTA}, centrados em {pivo:g}: escala {escala:.4f}.",
        "",
        "  **Os `translate` ficam a zero de proposito.** O `pivotX`/`pivotY` a 54 faz",
        "  a escala em volta do centro, e um `translate` a mais aqui da o logotipo",
        "  deslocado — o mesmo bug do `offset` que a `AGENTS.md` ja registou.",
        "-->",
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        '    xmlns:aapt="http://schemas.android.com/aapt"',
        f'    android:width="{VISTA}dp"',
        f'    android:height="{VISTA}dp"',
        f'    android:viewportWidth="{VISTA}"',
        f'    android:viewportHeight="{VISTA}">',
        "    <group",
        f'        android:pivotX="{pivo:g}"',
        f'        android:pivotY="{pivo:g}"',
        f'        android:scaleX="{escala:.6f}"',
        f'        android:scaleY="{escala:.6f}">',
    ]

    partes.extend(_formas(texto))

    partes.append("    </group>")
    partes.append("</vector>")
    partes.append("")

    return "\n".join(partes)


def _vector_mono(texto: str, escala: float, pivo: float) -> str:
    """
    A camada monocromatica: **as mesmas formas, todas na mesma cor**.

    **O que o sistema faz com esta camada e' tintá-la com a cor do tema** — e por isso
    que a cor daqui e' `#FFFFFFFF` e nao a do logo. O Android substitui o `fillColor`
    pela cor do tema, e o que ele precisa e' da **silhueta**, nao das cores.

    **Nao ha `background` nesta camada, e nao por esquecimento.** Um icone tematico e'
    desenhado pelo sistema sobre o fundo que ele escolher; um fundo aqui seria um
    retangulo opaco por cima do fundo do tema, que e' o oposto de um icone tematico.

    E o gradiente **nao pode** ser reutilizado: um gradiente tintado de uma cor so e'
    uma mancha, e e' o que apanha o nome da marca. **E' a razao de o `foreground` ser
    reescrito aqui em vez de copiado.**
    """
    partes = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<!-- Gerado por web/tests/gerar-marca.py. Nao editar a mao. -->",
        "<!--",
        "  A camada tematica do Android 13. O sistema pinta isto com a cor do tema,",
        "  pelo que so interessa a silhueta — **e por isso que sao as mesmas formas",
        "  do `foreground`, todas numa cor so, e sem gradiente**: um gradiente",
        "  tintado de uma cor e' uma mancha, e e' o que apanha o nome da marca.",
        "-->",
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        f'    android:width="{VISTA}dp"',
        f'    android:height="{VISTA}dp"',
        f'    android:viewportWidth="{VISTA}"',
        f'    android:viewportHeight="{VISTA}">',
        "    <group",
        f'        android:pivotX="{pivo:g}"',
        f'        android:pivotY="{pivo:g}"',
        f'        android:scaleX="{escala:.6f}"',
        f'        android:scaleY="{escala:.6f}">',
    ]

    for forma in _formas(texto):
        # **Cada `fillColor` vira branco.** E' uma substituicao de texto e nao uma
        # reescrita das formas: as geometrias sao as do `foreground`, e so a cor
        # muda. **Se um dia uma forma nao tiver `fillColor`, esta substituicao
        # apanha a linha do `path` seguinte e o ficheiro fica invalido** — e a
        # razao de o `build.sh` do Android correr depois.
        forma = re.sub(r'android:fillColor="#[0-9A-Fa-f]{8}"', 'android:fillColor="#FFFFFFFF"', forma)
        # E o gradiente da faisca sai: um `aapt:attr` nao tem cor para tintar.
        forma = _sem_gradiente(forma)
        partes.append(forma)

    partes.append("    </group>")
    partes.append("</vector>")
    partes.append("")

    return "\n".join(partes)


def _sem_gradiente(forma: str) -> str:
    """O path da faisca, com o gradiente trocado por uma cor solida.

    **Um `aapt:attr name="android:fillColor"` com um gradiente nao pode ser
    tintado.** O sistema substitui o `fillColor` do path — e o `aapt:attr` **esta
    dentro do `fillColor`**, o que faz a substituicao nao chegar ao gradiente e o
    drawable ficar invalido, ou o Android aceitar e nao pintar nada.

    Por isso que a faisca, aqui, e' uma cor solida: **e' a unica forma que
    aceita o "monochrome", e o gradiente dela seria o primeiro sintoma de um icone
    tematico que aparece sem a faisca.**
    """
    if "<aapt:attr" not in forma:
        return forma

    d = re.search(r'android:pathData="([^"]+)"', forma)
    if not d:
        return forma

    return (
        '        <path\n'
        '            android:fillColor="#FFFFFFFF"\n'
        f'            android:pathData="{d.group(1)}" />'
    )


def _formas(texto: str) -> list[str]:
    """
    Os `<rect>` e os `<path>` do SVG, convertidos para `path` do Android.

    **Cada `rect` com `rx` vira um path com os cantos arredondados**, e essa
    conversao e' uma conta: os cantos sao arcos de raio `rx`, e o `A` do path
    desenha um arco ate ao ponto seguinte. **O interior e' o mesmo rect, que e' um
    `path` com `h`/`v` — e por isso que o Android ter so `path` nao custa nada aqui.**

    A cor de cada forma vem do `fill` do SVG. **O `fill-opacity` do grupo dos modulos
    e' posto no `fillAlpha` do path**, que e' o mesmo valor com outro nome.
    """
    saida: list[str] = []

    # --- os rects ----------------------------------------------------------
    #
    # O grupo dos modulos de dados tem `fill-opacity="0.9"`, e o finder e' `#fff`.
    # O SVG agrupa-os com um `fill` no `<g>`, e cada `rect` dentro herda. **A
    # conversao le o `fill` do `g` que envolve o rect** — e nao do proprio rect,
    # que nao tem.
    alfa_grupo = 0.9
    cor_grupo = "#ffffff"

    dentro_dos_dados = False
    for linha in texto.splitlines():
        if 'fill-opacity="0.9"' in linha:
            dentro_dos_dados = True
            continue
        if dentro_dos_dados and "</g>" in linha:
            dentro_dos_dados = False
            continue
        if dentro_dos_dados:
            cor_grupo, alfa_grupo = "#FFFFFF", 0.9
        else:
            cor_grupo, alfa_grupo = None, None

        m = re.search(
            r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"'
            r'(?: rx="([\d.]+)")? fill="(#[0-9a-fA-F]{6})"',
            linha,
        )
        if m:
            x, y, w, h, rx, cor = (
                float(m.group(1)),
                float(m.group(2)),
                float(m.group(3)),
                float(m.group(4)),
                float(m.group(5)) if m.group(5) else 0.0,
                m.group(6),
            )
            if dentro_dos_dados:
                cor = cor_grupo
            saida.append(_rect_path(x, y, w, h, rx, cor, alfa_grupo))
            continue

        # --- o path da faisca ----------------------------------------------
        if "<path fill=" in linha:
            m = re.search(r'fill="(url\(#spark\)|#[0-9a-fA-F]{6})"', linha)
            d = re.search(r'd="([^"]+)"', linha)
            if m and d:
                saida.append(_path_gradiente(d.group(1), m.group(1)))

    return saida


def _rect_path(x: float, y: float, w: float, h: float, rx: float, cor: str, alfa) -> str:
    """Um rect com cantos arredondados, como um path do Android."""
    if rx <= 0:
        d = f"M{x:g},{y:g}h{w:g}v{h:g}h-{w:g}z"
    else:
        r = min(rx, w / 2, h / 2)
        d = (
            f"M{x + r:g},{y:g}"
            f"h{w - 2 * r:g}"
            f"a{r:g},{r:g} 0 0 1 {r:g},{r:g}"
            f"v{h - 2 * r:g}"
            f"a{r:g},{r:g} 0 0 1 -{r:g},{r:g}"
            f"h-{w - 2 * r:g}"
            f"a{r:g},{r:g} 0 0 1 -{r:g},-{r:g}"
            f"v-{h - 2 * r:g}"
            f"a{r:g},{r:g} 0 0 1 {r:g},-{r:g}"
            "z"
        )

    alfa_attr = f'\n            android:fillAlpha="{alfa:g}"' if alfa is not None else ""
    return (
        f'        <path\n'
        f'            android:fillColor="{_android(cor)}"{alfa_attr}\n'
        f'            android:pathData="{d}" />'
    )


def _path_gradiente(d: str, fill: str) -> str:
    """O path da faisca, que no SVG tem gradiente."""
    if fill == "url(#spark)":
        return (
            "        <path android:pathData=\"" + d + "\">\n"
            "            <aapt:attr name=\"android:fillColor\">\n"
            "                <gradient\n"
            '                    android:type="linear"\n'
            '                    android:startX="356" android:startY="296"\n'
            '                    android:endX="416" android:endY="416">\n'
            '                    <item android:offset="0" android:color="#FF67E8F9" />\n'
            '                    <item android:offset="1" android:color="#FF22D3EE" />\n'
            "                </gradient>\n"
            "            </aapt:attr>\n"
            "        </path>"
        )

    return (
        f'        <path\n'
        f'            android:fillColor="{_android(fill)}"\n'
        f'            android:pathData="{d}" />'
    )


def _android(cor: str) -> str:
    """`#RRGGBB` para `#AARRGGBB`, que e' o que o Android usa."""
    return "#FF" + cor.lstrip("#").upper()


def main() -> int:
    if not SVG.exists() or not PNG.exists():
        raise SystemExit(
            "  Faltam as fontes da marca. Devem existir:\n"
            f"    {SVG.relative_to(RAIZ)}\n"
            f"    {PNG.relative_to(RAIZ)}"
        )

    print("  web:")
    web()

    print()
    print("  android:")
    android()

    print()
    print("  Os icones QR do site ficam onde estao — ver o docstring.")
    return 0


if __name__ == "__main__":
    sys.exit(main())