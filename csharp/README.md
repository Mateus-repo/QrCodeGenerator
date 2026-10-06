# C#

A app Windows e o núcleo de payloads partilhado.

```
csharp/
├── core/                    ← net8.0 puro, sem dependências
├── desktop-winforms/        ← app Windows (UI + PNG)
└── tests/                   ← 236 testes (xunit)
```

Detalhe de cada pasta no seu próprio README.
Guia de uso e partilha: [`../docs/COMO-USAR.md`](../docs/COMO-USAR.md)

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
