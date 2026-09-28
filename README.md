# QrCodeGenerator

Gerador de QR codes. O mesmo gerador, vários clientes, **um único conjunto de
regras** partilhado.

| Pasta | O que é | Stack | Estado |
|---|---|---|---|
| [`web`](web) | **Site / PWA** | HTML + ES modules, zero dependências | ✅ 11 tipos · 54 testes · Lighthouse 100/100/100 |
| [`csharp`](csharp) | App Windows + núcleo de payloads | C# / .NET 8 / WinForms | ✅ 11 tipos · 137 testes |
| [`java`](java) | App desktop **multiplataforma** | Java 21 / JavaFX / ZXing | ✅ 11 tipos · 119 testes |
| [`python`](python) | Biblioteca + linha de comandos | Python / segno / Pillow | ✅ PIX · 108 testes |
| [`kotlin/android`](kotlin/android) | App Android | Kotlin / Compose / ZXing | ⬜ por fazer |

**418 testes** no total, mais **29 matrizes de QR confirmadas** por leitura com
um leitor independente (ZXing).

---

## Começar em 30 segundos

**Quero gerar um QR agora**

```bash
node web/tools/bundle.mjs
# abre web/dist/qrcode-generator.html com duplo clique
```

Ou servido (tem de ser um URL, não um ficheiro):

```bash
cd web && python -m http.server 8777
```

**Quero a app Windows**

```bash
cd csharp
dotnet run --project desktop-winforms -c Release
```

**Quero gerar em série, por linha de comandos**

```bash
cd python
pip install -r requirements.txt
python cli/qrcli.py pix --key 529.982.247-25 --name "Ana Silva" \
    --city "Belo Horizonte" --amount 25,75 -o pix.png
```

**Quero uma app de desktop que corra no Windows, Mac e Linux**

```bash
cd java
./build.sh app          # interface gráfica
./build.sh package      # instalador nativo do sistema
```

O guia completo, com **como partilhar cada uma**, está em
**[`docs/COMO-USAR.md`](docs/COMO-USAR.md)**.

---

## Documentação

| Ficheiro | Para quê |
|---|---|
| **[`docs/COMO-USAR.md`](docs/COMO-USAR.md)** | **Como usar e como partilhar cada app** |
| [`docs/IDEIA.md`](docs/IDEIA.md) | O raciocínio: porquê cada decisão |
| [`docs/TODO.md`](docs/TODO.md) | O checklist do que falta |
| [`docs/TIPOS-QR.md`](docs/TIPOS-QR.md) | A spec: formato exato de cada payload |
| [`spec/vectors.json`](spec/vectors.json) | Vetores de teste partilhados |

---

## A ideia em 30 segundos

O QR é um formato **normalizado**: o conteúdo final é uma string com regras
públicas (RFC, ISO, schemas de cada tipo). Por isso a regra não precisa de ser
código partilhado — precisa de ser uma **spec verificável**:

```
docs/TIPOS-QR.md  +  spec/vectors.json
              │
              ▼
   C#     Python     Web     Java     Kotlin
   (cada um implementa e passa nos mesmos testes)
```

Um teste tem dois níveis:

1. **Payload** — constrói a string a partir dos campos e compara com a esperada.
2. **Imagem** — gera o PNG, **descodifica-o com um leitor real** (ZXing.Net,
   zxing-cpp) e confirma que devolve o payload original.

O nível 2 é o que interessa, e não é opcional: foi ele que encontrou dois bugs
no encoder de QR do site — a máscara 4 com `x` e `y` trocados, e as posições
dos padrões de alinhamento erradas a partir da versão 7 — que **nenhum teste
estrutural via**. Os QR saíam visualmente perfeitos e ninguém os conseguia ler.

---

## Tipos

| Estado | Tipos |
|---|---|
| ✅ em todas as stacks | Link, Texto, Email, Telefone, SMS, WhatsApp, Evento, Localização, WiFi, VCard |
| ✅ em todas as stacks | **PIX** (BR Code) — com leitura, validação de chave e reparação de CRC |
| ⬜ a seguir | Crypto, GS1, Redes sociais, Deep link, PDF, Cupão, MeCard, Fidelidade |
| ⬜ stretch | Códigos de barras, Data Matrix, PDF417, Aztec, QR dinâmico |

O que cada tipo faz quando alguém lê: ver
[`docs/COMO-USAR.md`](docs/COMO-USAR.md).

Detalhes e armadilhas de cada um: [`docs/TIPOS-QR.md`](docs/TIPOS-QR.md).

---

## Testes

```bash
cd csharp && dotnet test                          # 137
cd java && ./build.sh test                        # 119
cd python && python -m pytest tests -q            # 108
node --test "web/tests/*.test.mjs"                #  54

# o teste que apanha bugs de verdade:
node web/tests/cross-check.mjs && python web/tests/descodificar.py
```

---

## Regras do repositório

1. **Uma pasta por plataforma.** Uma categoria nova toca 6 pastas, mas o nome
   das pastas nunca mente sobre o que há lá dentro.
2. **`spec/` é dados, não código.** Nenhuma stack altera a spec sem atualizar o
   outro lado primeiro.
3. **Divergência é bug.** Se duas stacks geram strings diferentes para os mesmos
   campos, uma delas está errada.
4. **Um payload certo não basta.** Cada stack tem de passar por um teste que
   gera a imagem e a descodifica com um leitor independente.
5. **Payloads com acento: normaliza.** Vários leitores e bancos corrompem ou
   recusam. O comprimento é contado em ASCII.
6. **O `.gitignore` exclui artefactos grandes** (exe, APK, bundles, o ficheiro
   único). Releases vão para o GitHub Releases.

---

## Privacidade

Nada sai do dispositivo, em nenhuma das apps. Sem analytics, sem CDN, sem
chamadas de rede para além dos ficheiros do próprio site.

Um QR de WiFi, VCard ou PIX **contém os dados** — quem fotografa tem acesso.
Não há como resolver isso por software.

---

## Licença

Ver [`LICENSE`](LICENSE).
