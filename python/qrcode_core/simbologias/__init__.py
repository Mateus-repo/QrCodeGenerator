"""
As simbologias de codigo de barras, em Python.

    from qrcode_core.simbologias import ean13, SIMBOLOGIAS

**Os modulos sao gerados, nao escritos.** As tabelas vem do `python-barcode`
por `spec/gerar-tabelas-upcean.py`, e a `AGENTS.md` explica porquê com dois
exemplos do proprio repositorio: um Code 39 com doze elementos por caractere em
vez de nove, e um ITF com dois na moldura em vez de tres. Nenhum foi apanhado
por teste — desenhavam-se com aspecto de estar certo e o leitor nao lia.

**Nao e' uma copia do web.** O web tem os mesmos codigos, e sao duas
implementacoes independentes do mesmo formato normalizado — que e' o que a
`AGENTS.md` diz ser o objectivo: nao ha codigo partilhado entre linguagens, ha
uma spec que se cumpre. Um payload que difira num cliente e' um bug, mesmo que
o teste desse cliente passe.
"""

from .upcean import SIMBOLOGIAS, SimbologiaError, digito_de_controlo, ean8, ean13, upca

__all__ = [
    "SIMBOLOGIAS",
    "SimbologiaError",
    "digito_de_controlo",
    "ean8",
    "ean13",
    "upca",
]
