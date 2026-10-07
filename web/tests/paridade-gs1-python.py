"""Paridade entre o GS1-128 do Python e o do web, modulo a modulo.

    python web/tests/paridade-gs1.py

**E o teste de verdade do encoder novo.** O `descodificar-gs1-python.py` le o que
o ZXixto devolve; este compara os dois encoders sobre os mesmos casos.

A ordem importa e e' a que a `AGENTS.md` manda: primeiro a paridade, que apanha uma
divergencia em segundos e sem dependencias; so depois a leitura, que apanha o que a
paridade nao apanha.

**Porque nao usar o ZXing logo de inicio:** o ZXing devolve texto, e duas
implementacoes podem divergir no desenho e devolver a mesma coisa — o Code 93 com
doze elementos por caractere em vez de nove desenhava-se com aspecto certo. A
paridade apanha a divergencia antes de ela se esconder atras de uma leitura que
passa.

## O que se compara, e porque sao cinco coisas

`modulos`, `fnnc1`, `payload`, `gs1` e `legenda`. **O numero de modulos e' o mais
grosso e o que salta primeiro**, e sozinho nao chega:

  - **`fnnc1`** apanha o separador a mais ou a menos, que da um codigo que o leitor
    le e em que o campo seguinte aparece colado ao anterior;
  - **`payload`** e' a forma de maquina, com o `0x1D` onde o encoder o pos — e
    e' a lista de comparacao com o `bytes` do ZXing;
  - **`gs1`** e' a forma legivel **com** separadores, e e' a unica das tres em que
    eles aparecem entre campos e nao no fim;
  - **`legenda`** e' a forma humana com parenteses e **sem** separadores. Um
    `GS` aqui e' o bug que fez o `descodificar` falhar em seis de oito casos: o
    codigo continuava a ler bem e a falha era so na comparacao.

## Uma recusa e' um resultado, e nao uma excepcao

O `gerar-gs1-python.mjs` poe `erro: null` quando o web **aceita** um caso que devia
recusar. **E' o resultado mais grave que este script pode dar** — o Python tambem
recusaria, a paridade passava, e o sintoma seria uma etiqueta impressa com um campo
a mais. Por isso esta' aqui separado do resto: uma excepcao que os dois lados
levantam e' concordancia; uma excepcao que so um levanta nao e'.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.simbologias.gs1 import gs1_128  # noqa: E402
from qrcode_core.simbologias.upcean import SimbologiaError  # noqa: E402

AQUI = RAIZ / "web" / "tests"
#: **O `.gs1-python.json` não é o `.gs1.json`.** O do web é do GS1-128 **dele**,
#: e a primeira versão desta script escrevia por cima dele — o sintoma foi o
#: `descodificar-gs1.py` do web a dar `KeyError: 'entrada'`, porque os casos de
#: Python tinham substituído os casos do web.
#:
#: **Dois geradores para o mesmo ficheiro são o mesmo bug dos dois registos**, e é
#: o que a `AGENTS.md` chama lista escrita duas vezes.
JSON = AQUI / ".gs1-python.json"

#: O que se compara, e o nome de cada coisa. **A lista e' a mesma em todas as
#: stacks**, e e' a que o `casos-barras.mjs` impoe para os 1D: um formato que
#: ninguem implementa nao se compara, e um formato declarado sem casos nao se
#: verifica.
CAMPOS = ("modulos", "fnnc1", "payload", "gs1", "legenda")


def casos_do_web() -> list[dict]:
    """Corre o gerador do web e le os casos que ele produziu.

    **Corre-se o gerador, e nao le-se o JSON de uma execucao anterior.** O motivo
    esta no docstring do `descodificar-code93.py` e nao se repete: comparar o
    encoder de hoje com o de ontem nao apanha divergencia nenhuma.
    """
    subprocess.run(
        ["node", str(AQUI / "gerar-gs1-python.mjs")],
        cwd=RAIZ,
        check=True,
        capture_output=True,
    )
    return json.loads(JSON.read_text(encoding="utf-8"))


def main() -> int:
    casos = casos_do_web()

    print(f"{len(casos)} casos do web, comparados com o Python")

    falhas = 0
    recusas = 0

    for caso in casos:
        nome = caso["nome"]
        texto = caso["texto"]

        try:
            codigo = gs1_128(texto)
        except SimbologiaError as e:
            recusas += 1

            if caso["erro"] is None:
                print(f"  FALHOU {nome:<42} o web aceita e o Python recusa: {e}")
                falhas += 1
                continue

            # **As duas recusas tem de ser pela mesma razao.** Um caso de recusa que
            # os dois recusam por motivos diferentes e' um caso em que um dos dois
            # recusa pela razao errada, e o sintoma e' o codigo que um deles
            # aceitaria se o dado mudasse um pouco.
            if caso["erro"][:30] != str(e)[:30]:
                print(f"  FALHOU {nome:<42} recusam por razões diferentes")
                print(f"           web    {caso['erro'][:90]}")
                print(f"           python {str(e)[:90]}")
                falhas += 1
                continue

            print(f"  ok   {nome:<42} os dois recusam")
            continue

        if caso["erro"] is not None:
            print(f"  FALHOU {nome:<42} o Python aceita e o web recusa: {caso['erro']}")
            falhas += 1
            continue

        problemas = []

        if len(codigo["modulos"]) != caso["modulos"]:
            problemas.append(
                f"{len(codigo['modulos'])} modulos, e o web diz {caso['modulos']}"
            )

        # **O `separadores` do Python chama-se `separadores`, e no JSON chama-se
        # `fnnc1`.** A primeira versao mapeava os nomes com um dicionario e a
        # segunda tentou `codigo[campo]` para os cinco, o que deu `KeyError` no
        # primeiro — **e um `KeyError` numa comparacao e' o pior sitio para ele
        # aparecer**, porque acaba antes de dizer qual das duas implementacoes
        # divergiu.
        NOMES = {"fnnc1": "separadores", "gs1": "gs1"}

        for campo in CAMPOS[1:]:
            a = codigo[NOMES.get(campo, campo)]
            b = caso[campo]
            if a != b:
                problemas.append(f"{campo}: python {a!r}, web {b!r}")

        if problemas:
            print(f"  FALHOU {nome:<42} {problemas[0]}")
            for p in problemas[1:]:
                print(f"           {p}")
            falhas += 1
            continue

        print(
            f"  ok   {nome:<42} {caso['modulos']} modulos, "
            f"{caso['fnnc1']} FNC1, {caso['payload']!r}"
        )

    print()
    print(f"  {len(casos) - recusas} codigos, {recusas} recusas, {falhas} falha(s)")

    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())