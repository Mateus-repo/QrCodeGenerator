"""
O desenho dos codigos de barras de uma linha.

    from qrcode_core.simbologias.desenho import to_bitmap, dimensoes

## Porque isto e' separado do `render.py`

**O `render.py` desenha matrizes quadradas com um logo de correccao de erro; um
codigo de barras e' uma linha com guardas mais altas.** Sao formatos diferentes
comaude引流 dimensoes diferentes, e o que o ZXing le e' a imagem, nao a
matriz — por isso a funcao devolve bytes e nao uma lista de listas.

## A guarda desce, e nao e' um detalhe

**A barra de guarda e' mais alta de proposito**, e e' o que permite a um leitor
localizar o codigo: a descida da guarda marca onde o codigo comeca e acaba. Um
desenho com tudo a mesma altura le-se em alguns leitores e noutros nao, e o
sintoma e' "o codigo as vezes funciona" — que e' o tipo de falha que a
`AGENTS.md` diz que nunca entra: **nao ha quase, e um codigo que as vezes
funciona nao funciona.**
"""

from __future__ import annotations

#: Quantos modulos horizontais cada barra ocupa.
MODULOS_POR_BARRA = 3

#: Quantas vezes mais alta e' a guarda do que o corpo.
GUARDA_ALTURA = 4

#: Quantas vezes mais alta e' o corpo.
CORPO_ALTURA = 3

#: O espaco em volta, que um leitor tambem precisa.
MARGEM = 10


def dimensoes(
    n_modulos: int,
    guardas: list[int] | None = None,
    n_texto: int = 0,
) -> tuple[int, int]:
    """A largura e a altura em pixels, para o desenho saber o que reservar."""
    largura = n_modulos * MODULOS_POR_BARRA + 2 * MARGEM
    altura = (CORPO_ALTURA + GUARDA_ALTURA) * 3 + 2 * MARGEM + n_texto
    return largura, altura


def to_bitmap(
    modulos: list[bool],
    escala: int = 3,
    guardas: list[int] | None = None,
    altura: int = CORPO_ALTURA,
) -> bytes:
    """
    A imagem, em PNG, pronta a ser lida.

    :param modulos: `True` e' barra escura, `False` e' espaco.
    :param guardas: os indices de modulo onde comecam as guardas. A guarda e'
        mais alta, e sem esta lista o leitor nao tem onde se ancorar.
    :param altura: a altura do corpo, em modulos.

    **A guarda e' desenhada em cima do corpo**, e nao a parte: um leitor ve a
    descida da guarda como a ancora, e a barra por baixo dela nao atrapalha.
    """
    from PIL import Image

    n = len(modulos)
    largura_px = n * escala + 2 * MARGEM
    # **A altura e' a da guarda, nao a do corpo**: e a guarda que desce ate
    # ao fim, e uma imagem mais baixa que a guarda cortava-lhe o pe.
    altura_px = (altura + GUARDA_ALTURA) * escala + 2 * MARGEM

    imagem = Image.new("L", (largura_px, altura_px), 255)
    pixels = imagem.load()

    # Onde comeca cada guarda, em pixels de coluna.
    colunas_guarda = {i * escala for i in (guardas or [])}

    # As colunas de modulo que sao guarda. **E' aqui que o `guardas` e' usado**, e
    # a primeira versao aceitava o parametro e nao fazia nada com ele — o que e'
    # a pior forma de bug: a assinatura promete, o corpo ignora, e o codigo
    # desenha-se e le-se nos leitores que nao precisam da ancora.
    colunas_guarda = {i for i in (guardas or [])}

    for x, escuro in enumerate(modulos):
        if not escuro:
            continue
        for dx in range(escala):
            coluna = MARGEM + x * escala + dx

            # **A guarda e' desenhada ate ao topo; o corpo so ate `altura`.**
            #
            # E' o que a `AGENTS.md` chama de "o codigo le-se as vezes": um
            # desenho com tudo a mesma altura le-se em alguns leitores e noutros
            # nao, porque a descida da guarda e' a ancora. Na verdade a ancora
            # usa as barras Quiet Zone — o silencio a volta — e nao a altura, e
            # por isso que um leitor de laboratorio como o ZXing nao se queixa.
            # **Nao verificar por leitura e' o que escondeu isto**: o nivel dois
            # passou com a guarda da mesma altura, e so o desenho da etiqueta
            # mostra a diferenca.
            fundo = altura_px if x in colunas_guarda else MARGEM + altura * escala

            for y in range(0, fundo):
                pixels[coluna, y] = 0

    return _em_png(imagem)


def _em_png(imagem) -> bytes:
    import io

    saida = io.BytesIO()
    imagem.save(saida, format="PNG")
    return saida.getvalue()
