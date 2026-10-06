# `core` — a biblioteca

**Vazia, de propósito.** O `go/` ainda não tem uma linha de Go; ver o
[`../README.md`](../README.md) para o porque.

Isto é a parte que produz a matriz de módulos, e é a parte que os testes
comparam com o `spec/vectors.json`. Chama-se `core` pelo mesmo motivo que
`csharp/core`, `java/core` e `kotlin/core`.

O que vai morar aqui, espelhando o `python/qrcode_core`:

| Ficheiro | O que faz | De onde vem |
|---|---|---|
| `tipos.go` | As 11 categorias e os campos de cada uma | `spec/payloads.json` |
| `pix.go` | O BR Code, com o CRC-16 | A spec |
| `validacao.go` | As mensagens de erro, em português | `docs/TIPOS-QR.md` |
| `render.go` | A matriz de módulos e o PNG | — |
| `simbologias/` | Os códigos de barras, e as tabelas | `spec/gerar-tabelas-lineares.py` |

**Duas coisas que este repositório já aprendeu e que aqui se aplicam desde o
primeiro dia.**

**As tabelas dos códigos de barras são geradas, nunca escritas à mão.** O
`spec/gerar-tabelas-lineares.py` escreve hoje o Python e o Java a partir da
mesma extracção do `python-barcode`; quando o Go entrar, passa a escrever um
**terceiro** alvo do mesmo gerador. Uma terceira transcrição dos mesmos
números diverge — foi o que aconteceu com a `STOP` do ITF, que o
`python-barcode` traz truncada e que o ZXing não lê.

**Um encoder só entra depois de o ZXing devolver a cadeia certa.** Não há
"quase". Na fase dos códigos de barras, quatro encoders pareceram certos
durante a escrita e não eram — e nenhum teste estrutural os apanhou.

**E os testes vivem ao lado, em `*_test.go`.** Não há pasta `tests/` aqui, e
é a única diferença de organização em relação às outras quatro stacks.
