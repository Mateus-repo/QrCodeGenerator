# QrCodeGenerator

Gerador de QR codes. O mesmo gerador, cinco clientes, **um único conjunto de
regras** partilhado.

| Pasta | O que é | Stack | Estado |
|---|---|---|---|
| [`csharp`](csharp) | App Windows + núcleo de payloads | C# / .NET 8 / WinForms / QRCoder | ✅ 11 tipos, 137 testes, 0 bugs |
| [`python`](python) | **Implementação de referência** | Python / segno / Pillow | ✅ PIX pronto, 108 testes |
| [`web`](web) | Site (PWA) | HTML + ES modules | ⬜ por fazer |
| [`java/desktop-javafx`](java/desktop-javafx) | App desktop | Java 21 / JavaFX / ZXing | ⬜ por fazer |
| [`kotlin/android`](kotlin/android) | App Android | Kotlin / Compose / ZXing | ⬜ por fazer |

## Documentação

| Ficheiro | Para que serve |
|---|---|
| [`docs/IDEIA.md`](docs/IDEIA.md) | O plano: onde estamos, como organizar, roadmap, riscos |
| [`docs/TODO.md`](docs/TODO.md) | **O que fazer antes de continuar** — checklist bloqueante |
| [`docs/TIPOS-QR.md`](docs/TIPOS-QR.md) | Formato exato de cada payload (a spec) |
| [`spec/vectors.json`](spec/vectors.json) | Vetores de teste: mesmos campos → mesma string, em todas as stacks |

## A ideia em 30 segundos

O QR é um formato **normalizado**. O conteúdo final é uma string com regras
públicas (RFC, ISO, schemas de cada tipo). Por isso a regra não precisa de ser
código partilhado — precisa de ser uma **spec verificável**:

```
docs/TIPOS-QR.md + spec/vectors.json
              │
              ▼
   C#     Java     Kotlin    Python     Web
            (cada um implementa e passa nos mesmos testes)
```

Um teste tem dois níveis:

1. **Payload** — constrói a string a partir dos campos e compara com a esperada.
2. **Imagem** — gera o PNG, **descodifica-o com um leitor real** (ZXing, pyzbar,
   `BarcodeDetector`) e confirma que devolve o payload. É este que apanha bugs
   de biblioteca, não só de lógica.

Nível 2 já a correr nas duas stacks: cada vetor é gerado como imagem, lido por
um leitor independente (ZXing.Net em C#, zxing-cpp em Python) e comparado com a
string original. Um payload válido que ninguém consegue ler também é um bug.

## Tipos

| Estado | Tipos |
|---|---|
| ✅ C# e Python | Link, Texto, Email, Telefone, SMS, WhatsApp, Evento, Localização, WiFi, VCard |
| ✅ C# e Python | **PIX** (BR Code) — com leitura, validação de chave e reparação de CRC |
| ⬜ A seguir | Crypto, GS1, Redes sociais, Deep link, PDF, Cupão, MeCard, Bluetooth, Fidelidade |
| ⬜ Stretch | Códigos de barras, Data Matrix, PDF417, Aztec, QR dinâmico |

Detalhes e armadilhas de cada um: [`docs/TIPOS-QR.md`](docs/TIPOS-QR.md).

## Começar

```bash
# C# (Windows) — a app
cd csharp
dotnet test
dotnet run --project desktop-winforms -c Release

# Python (referência) — a forma mais rápida de ver o que existe
cd python
pip install -r requirements.txt
python -m pytest tests -q
python cli/qrcli.py pix --key 529.982.247-25 --name "Ana Silva" \
    --city "Belo Horizonte" --amount 25,75 -o pix.png
```

## Regras do repositório

1. **Uma pasta por plataforma.** Uma categoria nova toca 6 pastas, mas o nome
   das pastas nunca mente sobre o que há lá dentro.
2. **`spec/` é dados, não código.** Nenhuma stack altera a spec sem atualizar o
   outro lado primeiro.
3. **Divergência é bug.** Se duas stacks geram strings diferentes para os mesmos
   campos, uma delas está errada.
4. **Payloads com acento: normaliza.** Vários leitores e bancos corrompem ou
   recusam. O comprimento é contado em ASCII.
5. **O `.gitignore` exclui artefactos grandes** (exe, APK, ZIP). Releases vão
   para o GitHub Releases.

## Licença

Ver [`LICENSE`](LICENSE).
