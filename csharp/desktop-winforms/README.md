# C# — app Windows (WinForms)

O cliente mais antigo e o único com interface gráfica completa. Serve
também de referência de UI para as outras stacks.

**Stack:** C# / .NET 8 / WinForms / QRCoder 1.8
**Estado:** ✅ 11 tipos (10 + PIX) · ✅ 137 testes · ✅ sem bugs conhecidos

## Estrutura

A lógica dos payloads foi extraída para `../core`, que **não** depende de
Windows — assim os payloads podem ser testados sem abrir uma janela:

```
csharp/
├── core/                    ← net8.0 puro, zero dependências
│   ├── QrPayloadBuilder.cs  ← payload de cada categoria
│   ├── QrValidator.cs       ← validação com mensagem por campo
│   ├── Normalize.cs         ← telefone, URL, esquemas perigosos
│   ├── Text/Text.cs         ← ASCII, escaping iCal/WiFi, URL encoding
│   ├── QrCapacity.cs        ← limites de bytes por ECC
│   └── Pix/                 ← PIX / BR Code
├── desktop-winforms/        ← net8.0-windows: UI + desenho do PNG
│   ├── Program.cs
│   ├── MainForm.cs          ← formulários por categoria
│   └── QrRenderer.cs        ← única parte que usa System.Drawing
└── tests/                   ← 137 testes (xunit)
```

## Executar

```bash
cd csharp
dotnet run --project desktop-winforms -c Release
```

## Testes

```bash
cd csharp
dotnet test
```

137 testes, em três grupos:

| Ficheiro | O que garante |
|---|---|
| `SpecVectorTests.cs` | **Nível 1** — bate com `../spec/vectors.json` (mesmos campos, mesma string que o Python) |
| `RenderTests.cs` | **Nível 2** — gera o PNG com o QRCoder e lê de volta com o ZXing |
| `BugFixTests.cs` | Regressões para os 7 defeitos do antigo `QrService.cs` |
| `PixTests.cs` | PIX: CRC, chaves, truncagens, leitura, reparação de CRC |

## Exe standalone

```bash
cd csharp
dotnet publish desktop-winforms -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:EnableCompressionInSingleFile=true \
  -p:DebugType=None -p:DebugSymbols=false \
  -o desktop-winforms/dist
```

Resultado: `desktop-winforms/dist/QrCodeGenerator.exe` (~68 MB), Windows 64-bit.

## O que mudou desde o `QrService.cs`

O `QrService.cs` foi **substituído**. Não é uma refatoração cosmetics: os
payloads eram construídos pela biblioteca `QRCoder.PayloadGenerator`, e era aí
que estavam os bugs.

| # | Antes | Agora |
|---|---|---|
| 1 | iCal com `Environment.NewLine` → LF noutro sistema | CRLF explícito, conforme a RFC 5545 |
| 2 | iCal sem escaping → payload inválido com `,` `;` `\` | `\,` `\;` `\\` `\n` |
| 3 | vCard com a morada sempre vazia | ADR completo, com rua, cidade, CEP e país |
| 4 | `geo:` sem validação de intervalo | latitude ±90, longitude ±180, `double?` |
| 5 | `javascript:` e `data:` aceites como link | allowlist de esquemas + recusa explícita |
| 6 | `00` → `+` só no início da string | normalização consistente |
| 7 | WiFi/SMS sem limites nem escaping | escaping de `\ ; , : "` e limite de SSID/password |

Além disso: `mailto:` minúsculo com percent-encoding, dois telefones na vCard
com tipo, `N` com a família primeiro, e a categoria **PIX** com leitura e
validação de chave.

Ver [`../docs/TIPOS-QR.md`](../docs/TIPOS-QR.md) para o formato de cada tipo.

