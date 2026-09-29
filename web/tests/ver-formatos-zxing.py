"""
Que formatos e' que o ZXing consegue ler?

    python web/tests/ver-formatos-zxing.py

A pergunta e' anterior a qualquer encoder, e decide o trabalho todo. A regra do
repositorio e' que um encoder so entra depois de o ZXing devolver a string certa
- e o que o ZXing **nao** sabe ler nao tem como ser verificado, por mais bem
escrito que esteja o codigo.

Cando a resposta e' "nao", o sitio honesto nao e' desistir do formato: e' dizer que
o encoder existe mas a **interoperabilidade nao fica verificada**, porque nao ha
leitor no repositorio que confirme que um leitor de bolso o le. E essa e' uma
limitacao que se escreve no TODO e no README, e nao se esconde.

Por isso este script lista os formatos do ZXing em vez de tentar adivinhar
pelo nome: um `rMQR` pode existir com outro nome, e o enum muda de versao em
versao.
"""

from __future__ import annotations

import zxingcpp

# O que falta no repositorio, e o que este script vai procurar.
FALTAM = {
    "Micro QR": ["MicroQR", "MicroQRCode"],
    "rMQR": ["rMQR", "RMQR", "RectangularMicroQRCode"],
    "Aztec": ["Aztec", "AztecCode"],
    "MaxiCode": ["MaxiCode", "Maxicode"],
}


def main() -> int:
    formatos = zxingcpp.BarcodeFormat.__members__

    print(f"O ZXing le {len(formatos)} formatos:\n")
    for nome in sorted(formatos):
        print(f"  {nome}")

    print()
    for pedido, nomes in FALTAM.items():
        encontrados = [n for n in nomes if n in formatos]
        if encontrados:
            print(f"  {pedido:10} -> {', '.join(encontrados)}")
        else:
            # Procura porsubstring, que apanha nomes que nao sabiamos.
            chave = pedido.replace(" ", "").lower()
            parecidos = [n for n in formatos if chave[:5] in n.lower().replace(" ", "")]
            marca = "parecidos: " + ", ".join(parecidos) if parecidos else "nenhum parecido"
            print(f"  {pedido:10} -> NAO LE. ({marca})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
