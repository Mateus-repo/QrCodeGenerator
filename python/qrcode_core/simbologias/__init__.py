"""
As simbologias de codigo de barras, em Python.

    from qrcode_core.simbologias import ean13, SIMBOLOGIAS

**Os modulos sao gerados, nao escritos.** As tabelas vem do `python-barcode`
por `spec/gerar-tabelas-upcean.py`, e a `AGENTS.md` explica porque com dois
exemplos do proprio repositorio: um Code 39 com doze elementos por caractere em
vez de nove, e um ITF com dois na moldura em vez de tres. Nenhum foi apanhado
por teste — desenhavam-se com aspecto de estar certo e o leitor nao lia.

**Nao e' uma copia do web.** O web tem os mesmos codigos, e sao duas
implementacoes independentes do mesmo formato normalizado — que e' o que a
`AGENTS.md` diz ser o objectivo: nao ha codigo partilhado entre linguagens, ha
uma spec que se cumpre. Um payload que difira num cliente e' um bug, mesmo que
o teste desse cliente passe.
"""

from .code93 import SIMBOLOGIAS_CODE93, code93
from .datamatrix import SIMBOLOGIAS_DATAMATRIX, data_matrix, data_matrix_de_codewords
from .lineares import (
    SIMBOLOGIAS_LINEARES,
    codabar,
    code39,
    code128,
    itf,
    itf14,
)
from .upcean import SIMBOLOGIAS, SimbologiaError, digito_de_controlo, ean8, ean13, upca

#: **O registo, com os dois grupos juntos.**
#:
#: Os UPC/EAN vivem no `upcean` e os de uma linha no `lineares`, e sao dois
#: registos porque os dois ficheiros nao dependem um do outro. **A `AGENTS.md`
#: avisa do que acontece quando o mesmo conjunto esta escrito duas vezes**: o
#: GS1-128 entrou no registo com o encoder, a validacao, a altura e os casos
#: lidos pelo ZXing, e nao aparecia no selector — porque nada ligava as listas.
#:
#: Nao ha segunda lista a acertar aqui, e' a **unica** entrada que o resto do core
#: consulta. Um cliente novo, ou um registo que cresca, tem de acrescentar a esta
#: e nao a uma copia sua.
#:
#: **O Data Matrix tem o seu proprio registo e nao e' uma excepcao**: e' um codigo
#: **2D**, e os dois registos sao os de **1D**. Um registo so de duas dimensoes
#: pareceria mais limpo, e era a lista que se deixa de actualizar quando entra um
#: formato de uma linha - que e' exactamente o que aconteceu ao Code 93.
SIMBOLOGIAS_TODAS = {
    **SIMBOLOGIAS,
    **SIMBOLOGIAS_LINEARES,
    **SIMBOLOGIAS_CODE93,
    **SIMBOLOGIAS_DATAMATRIX,
}

__all__ = [
    "SIMBOLOGIAS",
    "SIMBOLOGIAS_LINEARES",
    "SIMBOLOGIAS_TODAS",
    "SimbologiaError",
    "digito_de_controlo",
    "ean8",
    "ean13",
    "upca",
    "code39",
    "itf",
    "itf14",
    "codabar",
    "code128",
    "SIMBOLOGIAS_CODE93",
    "code93",
    "SIMBOLOGIAS_DATAMATRIX",
    "data_matrix",
    "data_matrix_de_codewords",
]
