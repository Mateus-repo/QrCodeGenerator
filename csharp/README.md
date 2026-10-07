# C#

A app Windows e o núcleo de payloads partilhado.

```
csharp/
├── core/                    ← net8.0 puro, sem dependências
├── desktop-winforms/        ← app Windows (UI + PNG)
└── tests/                   ← 278 testes (xunit)
```

Detalhe de cada pasta no seu próprio README.
Guia de uso e partilha: [`../docs/COMO-USAR.md`](../docs/COMO-USAR.md)

## Os códigos de barras

`core/Simbologias/` tem EAN-13, EAN-8, UPC-A, Code 39, Code 93, Code 128, ITF,
ITF-14, Codabar e **Data Matrix (ECC200)**. **Nenhuma tabela está escrita à
mão**: vêm de `spec/gerar-tabelas-*.py`, e o ficheiro gerado diz isso na
primeira linha.

Um código **2D** devolve um `CodigoMatriz`, que **não tem `Guardas` nem
`Legenda`** — as guias em L estão na própria grelha e um Data Matrix não tem
texto impresso por baixo. Um `Guardas` vazio seria um campo que o desenho lê e
não usa.

Os arrays e mapas das tabelas geradas estão em **PascalCase** (`Simbolos`,
`Fatores`), que é a convenção que o `TabelasCode93` já seguia. As constantes
ficam em MAIÚSCULAS (`ULTIMO_BLOCOS`), como em qualquer `const`.

```bash
node ../spec/paridade-csharp.mjs              # os 1D, módulo a módulo contra o Python
node ../spec/paridade-csharp-datamatrix.mjs   # o Data Matrix, grelha a grelha
```

A ponta de C# é um programa só, e o `--datamatrix` é um argumento dele e não um
`tipo` nos casos: um Data Matrix devolve uma matriz, e a forma da saída é outra.

**Um encoder só entra no repositório depois de o ZXing devolver a cadeia
certa** — não há "quase": na fase dos códigos de barras, quatro encoders
pareceram certos durante a escrita e não eram.

**A leitura do Data Matrix compara codewords e não texto.** O `Text` do ZXing,
sem ECI, assume ISO-8859-1, e um Data Matrix não tem ECI: o texto devolvido não
é o que foi escrito. O `RawBytes` são os codewords, um por byte.

**E o `Encoding.Default` é um teste que lê o fonte.** Com o runtime moderno o
default já é UTF-8, por isso que um teste de execução não o apanha nesta
máquina — e noutra máquina o encoder produzia um código diferente.

O `core` dá `InternalsVisibleTo` aos testes, e não uma cópia: o
`DataMatrix.Colocar` é `internal` porque não é API, e o teste da colocação
precisa de o chamar — **pela grelha final não se sabe se o bloco do canto de
baixo à direita correu**.

## Comandos

```bash
cd csharp

# compilar tudo
dotnet build QrCodeGenerator.sln -c Release

# testes
dotnet test

# correr a app
dotnet run --project desktop-winforms -c Release

# exe único (~68 MB)
dotnet publish desktop-winforms -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:EnableCompressionInSingleFile=true \
  -p:DebugType=None -p:DebugSymbols=false -o desktop-winforms/dist
```

Requisito: [.NET 8 SDK](https://aka.ms/dotnet/download).

## Porquê um `core` separado

O `core` não referencia WinForms nem System.Drawing. Isso permite:

- testar payloads sem abrir uma janela;
- portar as mesmas regras para outra linguagem sem arrastar dependências;
- manter a app a única parte que sabe desenhar.

Os payloads são construídos à mão em vez de usar `QRCoder.PayloadGenerator`:
era aí que estavam os defeitos de iCalendar e de vCard. Ver
[`../docs/TIPOS-QR.md`](../docs/TIPOS-QR.md).
