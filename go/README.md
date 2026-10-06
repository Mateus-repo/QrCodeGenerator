# A stack em Go — a última da fila

**Estado: nada implementado. E é de propósito.**

Isto não é um sítio onde o código está atrasado. É um sítio onde o código ainda
não foi escrito, porque a `AGENTS.md` põe o Go no fim da fila e por uma razão
que está escrita lá: **o Go não é das linguagens mais adequadas a isto**, e
compensa pelo binário único, não pela ergonomia.

Escrever a sexta implementação do QR antes de a spec estar madura dava uma
sexta implementação a adivinhar. Cada uma das outras cinco foi feita quando
já havia vetores para onde olhar.

> **O que muda quando esta pasta deixar de estar vazia.** O que está
> escrito abaixo foi feito para ser lido *antes* de escrever a primeira linha de
> Go, e não depois. As quatro armadilhas da secção seguinte já custaram tempo a
outras linguagens deste repositório, e em Go custam mais.

## A pasta, e o que vai em cada sítio

```
go/
  README.md        este ficheiro
  cmd/qrcodegen/   o programa — o que dá o binário para distribuir
  core/            a biblioteca: payloads, matriz de módulos, desenho
```

**`core/`** leva o mesmo nome que o `csharp/core`, o `java/core` e o
`kotlin/core`, e pelo mesmo motivo: é a parte que produz a matriz de módulos e
que os testes comparam com a spec. A `python/qrcode_core` chama-se assim porque
é um pacote Python e `core` seria nome demais para um; o mesmo objectivo com o
nome que a linguagem deixa.

**`cmd/qrcodegen/`** é o `cmd/` do Go, e é onde o `go build` produz o
executável. O nome do programa é o que a pessoa escreve na linha de comandos,
por isso importa: `qrcodegen` e não `main` nem `qr`.

**Não há `tests/`.** Nas outras quatro stacks existe — `csharp/tests`,
`python/tests`, e os testes do Java e do Kotlin ao pé do código. Em Go os testes
são ficheiros `_test.go` **ao lado** do código que testam, e essa é uma
diferença que não vale a pena lutar. `core/payload_test.go` testa
`core/payload.go`. Não é uma omissão, é a convenção.

## O binário é a razão de o Go estar aqui

O que se quer de um gerador de códigos é uma pessoa receber um ficheiro e
abrilo. Em Windows, isso quer dizer um `.exe` que não pergunta por runtime.

```bash
cd go
go build ./cmd/qrcodegen            # um executável, sem runtime
go test ./...                       # os testes, ao pé do código
```

**Sem dependências.** O que o Go precisa aqui está todo na biblioteca padrão:
`image/png` para exportar, `encoding/json` para a spec, `testing` para os
testes, `os`/`flag` para a CLI. Nenhum `go.mod` com mais do que o nome do
módulo. As outras quatro stacks também não têm dependências — C# sem NuGet, Java
sem Maven, o site sem framework — e o Go dá para isso sem luta, o que é
realmente o seu único trunfo nesta lista.

## As quatro armadilhas, e porque este repositório sofre delas

### `len(s)` conta bytes, e `s[i]` é um byte

Não há `char` em Go. Uma cadeia é uma sequência de bytes, e o índice devolve
um byte.

```go
s := "olá"
len(s)          // 4, e não 3 — o á são dois bytes em UTF-8
s[1]            // o byte 1, que aqui calha ser um 'l' partido
```

Para os **códigos de barras isto é uma vantagem**: EAN-13, Code 128 e ITF são
ASCII, e o `len` a dar bytes é exactamente o que a tabela de larguras espera.

Para os **QR com texto acentado é um bug à espera**: um payload com `ã` tem
mais bytes do que caracteres, e um índice calculado com `len` em vez de
`utf8.RuneCountInString` corta a mensagem a meio sem dar erro.

> **A regra que evita metade destes: `len` só para bytes, e só onde o formato
> manda mesmo em bytes.** Onde o que conta são caracteres,
> `utf8.RuneCountInString`. E nunca `s[0]` num payload de texto.

### O separador do GS1 é um byte que não se escreve

`0x1D` (*Group Separator*) é o que separa as Applications Identifiers do GS1-128,
e é um byte de controlo: não aparece, não tem glifo, e é fácil mandar uma
cadeia vazia onde devia ir o separador.

```go
const separadorGS1 = 0x1D
// ou, num literal:
"01" + string(rune(0x1D)) + "10" + ...
```

**`'\x1d'` é um `rune`, não um `byte`.** Numa concatenação de cadeias tem de
passar por `string(rune(...))`. Compila nos dois casos e dá o resultado
diferente — e o sintoma é o ZXing devolver o GS1 sem separadores, que parece um
código válido.

Isto não é uma hipótese: o `docs/TODO.md` regista que o `python-barcode` tem a
`STOP` truncada, e que o FNC1 do início já falhou por causa do mesmo erro de
tipo.

### Erros são valores, e a validação reescreve-se em vez de se portar

As outras quatro stacks lançam excepções; o Go devolve `error` e obriga a
tratá-lo. A `python/qrcode_core/validacao.py` tem as mensagens de erro em
português, e são parte do que a spec define — **portá-las é reescrevê-las**,
não copiá-las.

```go
// ERRADO — ignora o erro, e o compilador deixa
qr, _ := core.Gerar(categoria, campos)

// CERTO
qr, err := core.Gerar(categoria, campos)
if err != nil {
    return fmt.Errorf("categoria %s: %w", categoria, err)
}
```

E `os.Exit` salta as funções `defer` — o `defer f.Close()` não corre se o
`main` chamar `os.Exit(1)` antes.

### A aritmética de GF(256) é de bytes, e multiplicar overflow

O Reed-Solomon do QR e as tabelas de Reed-Solomon dos códigos de barras
multiplicam em `GF(256)`. Com `byte` (que é `uint8`) o produto de dois valores
tem de ser reduzido **a cada passo**, e um `*` sem máscara dá um número de 16
bits que já não cabe.

```go
// ERRADO — o produto já passou de 255 e o descarte é do compilador
out[i] ^= byte(a * b)

// CERTO — reduz em GF(256), e o XOR é byte a byte
out[i] ^= gfMul(a, b)
```

## A paridade não é negociável, aqui como nas outras

O `spec/vectors.json` é o arbrito. Um payload que sai diferente em Go é um
bug, mesmo que o teste do Go passe.

E há uma coisa que este repositório já aprendeu e que o Go tem de respeitar
**antes** de haver a primeira tabela escrita:

> **As tabelas dos códigos de barras nunca se escrevem de memória, e nunca se
> transcrevem duas vezes.** Vêm do `python-barcode`, e o
> `spec/gerar-tabelas-lineares.py` escreve hoje o Python **e** o Java a partir
> da mesma extracção. O Go tem de ser **um terceiro alvo do mesmo gerador**, e
> não uma terceira transcrição.

Três transcrições do mesmo número divergem. Duas já era mau; a regra existe
por causa disso.

E o que conta como «feito», em Go como em qualquer stack:

| Nível | O que prova | Como |
|---|---|---|
| 0 | As tabelas estão certas | `spec/gerar-tabelas-lineares.py` escreve a terceira saída e compara |
| 1 | A estrutura está certa | `go test ./...` contra os vetores |
| 2 | **O ZXing devolve a cadeia certa** | gerar a imagem e descodificá-la com um leitor independente |

**O nível 2 é o que decide.** Nenhum encoder entra no repositório antes de o
ZXing devolver a string certa — não há "quase". Na fase dos códigos de barras,
quatro encoders pareceram certos durante a escrita e não eram, e nenhum teste
estrutural os apanhou.

## O que fica escrito e o que não fica

Duas notas, para não haver surpresa:

**Não há Go instalado na máquina onde esta pasta foi escrita.** A estrutura e
as armadilhas acima estão escritas para quem vai implementar; **nada disto foi
compilado nem corrido**, e um esqueleto de Go por compilar é exactamente o que
a `AGENTS.md` diz para não deixar no repositório. Por isso a pasta tem
README e nada mais.

**O `go.mod` também não existe ainda.** O nome do módulo tem de ser
`github.com/Mateus-repo/QrCodeGenerator/go`, e escrevê-lo sem poder correr
`go mod tidy` é deixar para trás um ficheiro que ninguém verificó. Entra com a
primeira linha de Go a sério.
