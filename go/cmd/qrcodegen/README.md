# `cmd/qrcodegen` — o programa

**Vazio, de propósito.** O `go/` ainda não tem uma linha de Go; ver o
[`../README.md`](../README.md) para o porque.

Isto vai ser o `main` do binário, e é aqui que o `go build` produz o
executável que se distribui — o que é a razão de o Go estar na lista.

O que vai morar aqui, e o que fica na `core/`:

| Fica aqui | Fica em `../core/` |
|---|---|
| As opções da linha de comandos | O cálculo do payload |
| Ler e validar argumentos | A escolha de versão, nível e máscara |
| Escrever o PNG e o SVG em disco | A matriz de módulos |
| As mensagens para quem está a correr | A validação de cada tipo |

**A separação é a mesma das outras stacks** — `python/cli` e `python/qrcode_core`,
`java/desktop-javafx` e `java/core` — e vale pelo mesmo motivo: o que decide o
payload é testável sem correr um programa.

`cmd/` e não `cli/` porque é a convenção do Go, e `qrcodegen` e não `main`
porque é o nome que a pessoa escreve na linha de comandos.
