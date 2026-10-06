# QrCodeGenerator

Gerador de QR codes. O mesmo gerador, vários clientes, **um único conjunto de
regras** partilhado.

| Pasta | O que é | Stack | Estado |
|---|---|---|---|
| [`web`](web) | **Site / PWA** | HTML + ES modules, zero dependências | ✅ 11 tipos · 9 simbologias · 295 testes · Lighthouse 100/100/100 |
| [`csharp`](csharp) | App Windows + núcleo de payloads | C# / .NET 8 / WinForms | ✅ 11 tipos · 252 testes |
| [`java`](java) | App desktop **multiplataforma** | Java 21 / JavaFX / ZXing | ✅ 11 tipos · 177 testes |
| [`python`](python) | Biblioteca + linha de comandos | Python / segno / Pillow | ✅ 11 tipos · 323 testes |
| [`kotlin/core`](kotlin/core) | Núcleo JVM, app Android a seguir | Kotlin / Gradle / ZXing | ✅ 11 tipos · 60 testes |
| [`kotlin/android`](kotlin/android) | App Android | Kotlin / Compose / ZXing | ⬜ por fazer |
| [`go`](go) | App terminal, **por último** | Go | ⬜ por decidir |

**1107 testes** no total, mais **29 matrizes de QR confirmadas** por leitura com
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
| ✅ nas cinco stacks | **8 códigos de barras 1D** — EAN-13, EAN-8, UPC-A, Code 128, Code 39, Code 93, ITF-14 e Codabar |
| ✅ só no web | **GS1-128** (Code 128 com FNC1) — 541 regras de AI, ainda por propagar |

> São **8 simbologias e 9 entradas no registo**: o GS1-128 é uma variante do
> Code 128, não uma nona simbologia. As duas contagens estão certas e medem
> coisas diferentes, e é por isso que este número é escrito com a diferença
> explicitada em vez de escolhido de uma das maneiras.
| ✅ só no web | FrameQR (com logótipo), PDF417, Data Matrix, GS1-Data Matrix, rMQR |
| ⬜ a seguir | Crypto, GS1, Redes sociais, Deep link, PDF, Cupão, MeCard, Fidelidade |
| ⬜ nas outras stacks | Data Matrix, PDF417, rMQR — a propagar a partir do web |
| ⬜ stretch | QR dinâmico, Aztec |

O que cada tipo faz quando alguém lê: ver
[`docs/COMO-USAR.md`](docs/COMO-USAR.md).

Detalhes e armadilhas de cada um: [`docs/TIPOS-QR.md`](docs/TIPOS-QR.md).

---

## Testes

```bash
cd python && python -m pytest tests -q            # 323
node --test "web/tests/*.test.mjs"                # 292
cd csharp && dotnet test                          # 236
cd java && ./build.sh test                        # 161
cd kotlin && ./gradlew.bat :core:test             #  44

# o teste que apanha bugs de verdade — o leitor independente:
node web/tests/cross-check.mjs && python web/tests/descodificar.py

# os códigos de barras: um cliente desenha, o ZXing lê
python web/tests/descodificar-lineares.py
python web/tests/descodificar-code93.py           # Code 93, web
python web/tests/descodificar-code93-python.py    # Code 93, Python

# a paridade entre clientes, módulo a módulo
node spec/paridade-java.mjs
node spec/paridade-kotlin.mjs
node spec/paridade-csharp.mjs
python web/tests/paridade-code93.py
```

**Os números são contados, não escritos.** Correr `python .opencode/…` não —
contam-se com o comando de cada stack, que é o único que sabe. Um número de
testes transcrito diverge em silêncio e ninguém dá por isso, que é o mesmo
motivo pelo qual as tabelas dos códigos de barras são geradas.

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
