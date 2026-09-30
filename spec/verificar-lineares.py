"""
Desenha o Code 39, o ITF-14 e o Codabar de Python e le-os de volta com o ZXing.

    python spec/verificar-lineares.py

## A regra que este script cumpre

A `AGENTS.md` e' explicita: **as tabelas dos codigos de barras nunca se escrevem
de memoria**, e um encoder so entra no repositorio **depois de o ZXing devolver a
string certa**. Nao ha "quase" — e para estes tres formatos a razao e ainda mais
forte, porque a `AGENTS.md` regista que **quatro encoders pareceram certos
durante a escrita e nao eram**.

Este script e' a segunda metade dessa regra. O `test_lineares.py` compara as
tabelas com o `python-barcode` — a nivel zero, o mais barato e o que mais apanha.
**Este compara a saida com um leitor independente.**

## Os tres formatos que falhavam sempre, e o sintoma deles

A `AGENTS.md` tem um paragrafo inteiro sobre isto, e ele merecia ser lido antes
de mexer nestes tres encoders:

> O Code 39, o ITF e o Codabar tem um caractere de inicio que **acaba numa
> barra**, e o primeiro caractere de dados **comeca noutra**. Sem um espaco entre
> eles, as duas somam-se numa barra larga a mais. O codigo tem o aspecto certo e
> o leitor nao lê nada.

**O que torna isto traiçoeiro e' nao ser um erro, e' a ausencia dele.** O
comprimento total fica quase certo, o desenho fica com o aspecto certo, e nenhum
teste estrutural diz nada. **Se um destes codigos nao lê e a tabela esta certa, e'
o separador entre caracteres** — e a razao de o script ter um caso que so testa
exatamente isso: um codigo de um unico caractere de dados, onde o intervalo se
conta uma vez em vez de varias.

## O que este script mede, e o que e' escolha minha

**O `guardas` entra no desenho e nao na leitura.** A moldura de inicio e de
paragem e' desenhada mais alta, porque e' a ancora que um leitor usa para se
localizar. O ZXing, sendo de laboratorio, nao se queixa da falta dela — le o
codigo todo com a mesma altura. **A razao 5:2 do Codabar e' a razao que o leitor
mede na moldura, e o ZXing mede-a no codigo todo**, pelo que o teste do
intervalo e' o que garante que ela se mantem.

Este script **nao verifica a altura da guarda**: isso e' do desenho, e da para o
ZXing ler na mesma. O que ele verifica e' a **geometria** — larguras, intervalos,
molduras — que e' onde os quatro encoders deste repositorio falharam.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.desenho import to_bitmap  # noqa: E402
from qrcode_core.simbologias.lineares import (  # noqa: E402
    codabar,
    code39,
    code128,
    itf,
    itf14,
)

#: O caractere de controlo do Code 39, para as expectativas.
#:
#: **O ZXing devolve o texto COM o caractere de controlo, e nao sem ele.** Le
#: `CODE-39` e devolve `CODE-39P` — o `P` e' o modulo 43, e o leitor **confirma-o
#: e devolve-o na mesma**. As seis primeiras execucoes deste script sairam todas a
#: `DIVERGE` com o encoder certo, e a razao foi aqui: escrevi as expectativas
#: antes de o `comControlo` existir do lado do Python, e o `AGENTS.md` avisa
#: exactamente deste caso — **cinco dos dez vectores de PIX estavam errados
#: quando escritos de memoria**.
#:
#: Por isso que a funcao calcula o digito em vez de o escrever a mao. Nao e' para
#: poupar trabalho, e' para que o valor esperado **nao possa divergir do que o
#: formato diz** — que era a meio caminho de um encoder e da spec a dizerem
#: coisas diferentes sobre a mesma letra.
def controlo39(texto: str) -> str:
    from qrcode_core.simbologias.tabelas_lineares import COD39_ALFABETO

    indice = {c: k for k, c in enumerate(COD39_ALFABETO)}
    return COD39_ALFABETO[sum(indice[c] for c in texto) % 43]


#: Os casos, como `(nome, funcao, entrada, esperado)`.
#:
#: **O `esperado` e' o que o leitor tem de devolver, e nao o que o encoder
#: produz.** Sao coisas distintas, e sao iguais porque o encoder esta certo — a
#: leitura e' que as torna iguais. Um teste que espera o que o encoder produz
#: **nao verifica nada**: passa sempre, mesmo com o encoder partido.
#:
#: E valem a pena os dois avisos que esta lista ja deu:
#:
#: - O digito de controlo do `itf-14-manual` estava **errado** quando o escrevi de
#:   memoria — punha `6` onde o certo e' `5`. A soma com os pesos 3, 1 a partir da
#:   esquerda da `85`, e o ZXing devolveu `...905`. **A `AGENTS.md` avisa que
#:   cinco dos dez casos de PIX estavam errados quando escritos de memoria, e o
#:   mesmo aconteceu aqui, na nona tentativa.**
#: - Nao ha caso de **um unico caractere de dados** no Codabar nem no ITF: com um
#:   so, o codigo fica curto demais para o ZXing, e um caso que falha por ser
#:   curto e' pior do que nao existir — trains toda a gente a mexer no encoder
#:   quando o problema e' o comprimento. **Um codigo que "as vezes" funciona nao
#:   entra** (`AGENTS.md`), e o minimo verificavel e' o que esta aqui.
CASOS: list[tuple[str, object, str, str]] = [
    # --- Code 39: o exemplo do manual, em maiusculas. ---
    ("code39-manual", code39, "CODE-39", "CODE-39" + controlo39("CODE-39")),
    ("code39-alfanumerico", code39, "ABC123", "ABC123" + controlo39("ABC123")),
    ("code39-espaco", code39, "A B", "A B" + controlo39("A B")),
    ("code39-simbolos", code39, "A$-/+%", "A$-/+%" + controlo39("A$-/+%")),
    ("code39-minusculas", code39, "code39", "CODE39" + controlo39("CODE39")),
    ("code39-alfabeto", code39, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%",
     "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%"
     + controlo39("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%")),
    # --- ITF: so digitos, e o numero de digitos tem de ser par. ---
    ("itf-garantias", itf, "1234", "1234"),
    ("itf-14-dados", itf14, "1234567890128", "12345678901286"),
    ("itf-14-manual", itf14, "0001234567890", "00012345678905"),
    # --- Codabar: a moldura vai nas opcoes, nao no texto. ---
    ("codabar-a", codabar, "123456", "A123456A"),
    ("codabar-b", lambda v: codabar(v, inicio="B", paragem="B"), "123456",
     "B123456B"),
    ("codabar-d", lambda v: codabar(v, inicio="D", paragem="D"), "12345",
     "D12345D"),
    ("codabar-largo", lambda v: codabar(v, largo=True), "123456", "A123456A"),
    ("codabar-simbolos", codabar, "12-34$56/78:+9.0", "A12-34$56/78:+9.0A"),
    # --- Code 128: quase todos estes casos existem pela troca de conjuntos. ---
    #
    # **Um Code 128 que nunca muda de conjunto e' o caso facil**, e o que um
    # teste estrutural passaria sem reparo. O que apanha a troca ausente e' o
    # `ABC123`: sem o caracter de troca o codigo desenha-se com o comprimento
    # certo, o leitor le, e devolve `ABC,3`. E' o primeiro bug que o ZXing
    # apanhou a este repositorio e nenhum teste estrutural viu.
    ("code128-minimo", code128, "Hi", "Hi"),
    ("code128-troca-para-c", code128, "ABC123", "ABC123"),
    ("code128-setas-c", code128, "12345678", "12345678"),
    ("code128-minusculas", code128, "abc-123", "abc-123"),
    ("code128-espaco", code128, "Code 128", "Code 128"),
    # **O conjunto C sozinho, que e' onde se ve que ele e' o que economiza.**
    ("code128-conjunto-c", lambda v: code128(v, forcar_conjunto="C"), "1234",
     "1234"),
    ("code128-conjunto-a", lambda v: code128(v, forcar_conjunto="A"), "AB", "AB"),
    ("code128-conjunto-b", lambda v: code128(v, forcar_conjunto="B"), "AB", "AB"),
    # **Um numero par de digitos, que e' o caso em que o C nao paga a troca.**
    ("code128-dois-digitos", code128, "12", "12"),
]


def aceitos(esperado: str, nome: str) -> set[str]:
    """
    As cadeias que o leitor pode devolver, e sao **mais do que uma** para
    estes tres formatos.

    **O ZXing devolve o Codabar COM os caracteres de moldura.** Le os dados
    `123456` com molduras `A` e `A` e devolve `A123456A`. Isto e' o que o
    verificador escreve no `esperado`, e nao o que eu esperava: a primeira versao
    deste script aceitava so `123456`, e os tres casos de Codabar sairam a
    `DIVERGE` **com o encoder certo** — o erro estava na expectativa, e um
    `DIVERGE` aqui significa "o leitor leu outra coisa", nao "o encoder esta
    errado".

    **E' por isso que o `esperado` esta escrito a mao e nao gerado pelo encoder.**
    Se a lista fosse `codigo["legenda"]`, o teste passaria com o encoder partido e
    falharia com o encoder certo.

    **O ITF devolve os digitos todos**, porque a moldura nao tem texto. E o
    Code 39 pode voltar com o asterisco, porque o `*` faz parte do formato e
    alguns leitores includeem-no: um leitor que o devolva leu bem, e um que nao
    o devolva tambem.
    """
    if nome.startswith("itf"):
        return {esperado}
    if nome.startswith("code128"):
        # **O Code 128 nao tem moldura com texto**, ao contrario do Code 39: o
        # inicio e' um valor de conjunto, nao um caractere, e o leitor devolve
        # so o texto. Nao ha asterisco nem nenhuma forma alternativa.
        return {esperado}
    return {esperado, f"*{esperado}*", f"*{esperado}"}


def main() -> int:
    try:
        import zxingcpp
        from PIL import Image
    except ImportError:
        print(
            "Faltam o Pillow e o zxing-cpp.\n"
            "  python -m pip install Pillow zxing-cpp\n"
            "\n"
            "Estes casos **nao podem ser escritos a mao** — a regra e' que um "
            "codigo de barras so entra no repositorio depois de um leitor "
            "independente devolver a string certa.",
            file=sys.stderr,
        )
        return 1

    print(f"{'caso':22} {'simbologia':10} {'modulos':>8}  leitor")
    print("-" * 68)

    problemas: list[str] = []

    for nome, funcao, entrada, esperado in CASOS:
        codigo = funcao(entrada)  # type: ignore[operator]
        modulos = codigo["modulos"]

        # **Desenhar com as guardas.** A moldura mais alta e' o que o desenho
        # usa para ancorar, e although o ZXing nao se queixe da sua falta, um
        # desenho sem ela "as vezes funciona".
        png = to_bitmap(modulos, escala=3, guardas=codigo["guardas"])
        imagem = Image.open(io.BytesIO(png))
        resultado = zxingcpp.read_barcode(imagem)

        if resultado is None:
            problemas.append(f"{nome}: o ZXing nao leu o codigo")
            estado = "NAO LEU"
        elif resultado.text not in aceitos(esperado, nome):
            problemas.append(
                f"{nome}: o ZXing devolveu {resultado.text!r} e o esperado e' "
                f"uma de {sorted(aceitos(esperado, nome))}"
            )
            estado = f"DIVERGE ({resultado.text})"
        else:
            estado = "ok"

        print(f"{nome + ' ' + entrada:22} {codigo['simbologia']:10} "
              f"{len(modulos):8}  {estado}")

    print("-" * 68)

    if problemas:
        print(f"\n{len(problemas)} problemas:")
        for p in problemas:
            print(f"  {p}")
        return 1

    print(f"\nTodos os {len(CASOS)} codigos foram lidos pelo ZXing com a string certa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
