# QrCodeGenerator

Gerador gráfico de QR codes para Windows, feito em **C# / .NET 8 (WinForms)** com a biblioteca **QRCoder**.

## Funcionalidades

- **Categorias**: Link, Texto, Email, Telefone, SMS, WhatsApp, Evento (calendário), Localização (GPS), WiFi e VCard
- **Pré-visualização** do QR code em tempo real
- **Guardar como PNG** (botão "Baixar PNG")
- **Atualizar QR Code** a qualquer momento (botão manual)
- **Auto-gerar ao digitar**
- **Tamanho** da imagem: 256, 512 ou 1024 px
- **Nível de correção** (ECC): L, M, Q, H
- **Validação de campos** com mensagens de erro em português
- Deteção de conteúdo demasiado longo para o padrão QR
- Exe único (standalone), sem necessidade de instalar .NET nas máquinas alvo

## Como executar

### Exe pronto (sem instalar nada)

```
QrCodeGenerator\dist\QrCodeGenerator.exe
```

Requisito: Windows 64-bit.

### A partir do código-fonte

```bash
cd QrCodeGenerator
dotnet build -c Release
dotnet run -c Release
```

Requisito: [.NET 8 SDK](https://aka.ms/dotnet/download).

## Como gerar o exe standalone

```bash
cd QrCodeGenerator
dotnet publish -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:EnableCompressionInSingleFile=true \
  -p:DebugType=None -p:DebugSymbols=false \
  -o dist
```

Resultado: `dist\QrCodeGenerator.exe` (~68 MB).

## Estrutura

```
QrCodeGenerator/
  Program.cs      — ponto de entrada
  MainForm.cs     — interface gráfica e eventos
  QrService.cs    — geração de QR codes e validação por categoria
```

## Notas

- **Imagens não podem** ser codificadas num QR code (o padrão só armazena texto); a forma de "enviar" uma imagem é usar a categoria **Link** para o URL da imagem.
- Para conteúdo muito grande, usa o nível de correção **L** (mais capacidade) ou reduz o texto.
- O `.gitignore` exclui `bin/`, `obj/`, `dist/` e ficheiros de projeto da IDE.