# Java

A app desktop multiplataforma. O mesmo código corre em **Windows, macOS e
Linux**, e o `jpackage` gera o instalador nativo de cada um.

**Stack:** Java 21 / JavaFX / ZXing
**Estado:** ✅ 11 tipos · ✅ 205 testes · ✅ payloads idênticos às outras stacks

---

## Estrutura

```
java/
├── core/                      ← Java puro, sem dependências
│   └── src/main/java/com/qrcodegen/core/
│       ├── QrCategory.java      categoria + nome de apresentação
│       ├── EccLevel.java        nível de correção de erros
│       ├── QrFields.java        campos (mutável: preencher é imperativo)
│       ├── QrPayloadBuilder.java payload de cada tipo, escrito à mão
│       ├── QrValidator.java     validação com mensagem por campo
│       ├── QrCapacity.java      limites de bytes por ECC
│       ├── Text.java            ASCII, escaping iCal/WiFi, percent-encoding
│       ├── Normalize.java       telefone e URL
│       └── pix/                 PIX / BR Code (CRC16, TLV, chave, build, parse)
└── desktop-javafx/
    └── src/main/java/com/qrcodegen/app/
        ├── App.java             interface gráfica
        ├── QrRenderer.java      PNG e SVG — a única parte com java.awt
        └── Cli.java             linha de comandos
```

O `core` é separado e não referencia nada de gráfico. Isso permite testar os
payloads sem abrir uma janela — e é a mesma separação que o `csharp/core`.

---

## Compilar e testar

**Sem Maven nem Gradle.** São dois diretórios de código e um JDK; um ficheiro de
build que precisa de uma ferramenta de build para não fazer nada seria um
problema de portabilidade, não uma conveniência.

```bash
cd java
./build.sh test       # compila e corre os testes
./build.sh compile    # só compila
```

O script descarrega sozinho o ZXing, o Gson, o JUnit e o SDK do JavaFX para
`~/.m2/qrcodegen`. Requer `curl`, `unzip` e um JDK 21.

**No Windows** (PowerShell ou Git Bash):

```bash
cd java
bash build.sh test
```

---

## Linha de comandos

Não precisa de JavaFX, nem de ecrã — corre num servidor.

```bash
cd java
./build.sh run pix --key 529.982.247-25 --name "Ana Silva" \
    --city "Belo Horizonte" --amount 25,75 -o pix.png
```

Ou, depois de `./build.sh compile`:

```bash
CP="desktop-javafx/build/classes:core/build/classes:$HOME/.m2/qrcodegen/core-3.5.3.jar:$HOME/.m2/qrcodegen/javase-3.5.3.jar"

java -cp "$CP" com.qrcodegen.app.Cli \
  pix --key 123e4567-e12b-12d1-a456-426655440000 \
       --name "Fulano de Tal" --city BRASILIA -o pix.png

java -cp "$CP" com.qrcodegen.app.Cli pix-leer "00020126...63041D3D"
java -cp "$CP" com.qrcodegen.app.Cli fix-crc  "00020126...63040000"
java -cp "$CP" com.qrcodegen.app.Cli --help
```

Tipos de chave: CPF, CNPJ, `+55`, email ou UUID.

Códigos de saída: `0` sucesso · `1` erro de validação · `2` CRC inválido.

---

## Interface gráfica

```bash
cd java
./build.sh app
```

Para o JavaFX, é preciso o SDK no classpath (o script trata disso) e o módulo
`javafx.controls`.

---

## Instalar — `jpackage`

`jpackage` gera um instalador **nativo** a partir do mesmo código:

```bash
cd java
./build.sh package
```

| Sistema | Gera | Requer |
|---|---|---|
| Windows | `.msi` e `.exe` | [wiX Toolset](https://wixtoolset.org/) |
| macOS | `.dmg` e `.pkg` | Xcode Command Line Tools |
| Linux | `.deb` | `fakeroot` e `dpkg-deb` |

Sai em `desktop-javafx/dist/`. Para distributing, anexa o instalador a um
[GitHub Release](../../README.md).

**Só se compila no SO de destino** — o `.msi` faz-se no Windows, o `.dmg` no
macOS. Não é cross-compilar, é o que a Oracle impõe.

Para `.tar.gz` sem instalador (funciona em qualquer SO), usa
`./build.sh package --type app-image` e manda a pasta que sai.

---

## Portabilidade — o que foi decidido e porquê

O requisito é funcionar em Windows, macOS e Linux. Três armadilhas específicas
do Java, e o que se fez com cada uma:

| Armadilha | O que acontece | Como está resolvido |
|---|---|---|
| **`System.lineSeparator()`** | O iCalendar saía com LF no Linux e CRLF no Windows → **payloads diferentes por SO**. Foi um bug real na versão C# original. | `"\r\n"` explícito, com um teste que corre igual em qualquer SO |
| **`toUpperCase()` sem locale** | Em grego e turco, `"i"` passa a `"İ"` e o payload sai errado | `Locale.ROOT` em todo o lado; teste que muda o locale do sistema e confirma que o payload não se mexe |
| **Charset por omissão** | `Files.write` sem charset grava na codificação da plataforma: acentos quebram no macOS e Linux | `StandardCharsets.UTF_8` explícito em toda a escrita de ficheiros |

Mais:

- **Sem `System.Drawing`** (que é Windows-only). A imagem usa
  `java.awt` + ZXing, que existem em todo o lado.
- **Sem caminhos escritos à mão.** O `FileChooser` do JavaFX trata de
  extensões, filtros e caminhos de cada plataforma.
- **Sem cores de fundo escritas à mão.** O JavaFX segue o tema do SO, e o mesmo
  código fica claro no Windows e escuro no macOS.
- **Datas convertidas para UTC.** O payload do evento não muda com o fuso da
  utilizadora — e o teste fixa o fuso para não ser instável na CI.
- **`jpackage` só no SO de destino.** Documentado acima, em vez de surprise.

---

## Testes

```bash
cd java && ./build.sh test
```

205 testes, em seis grupos:

| Ficheiro | O que garante |
|---|---|
| `SpecVectorTests.java` | **Nível 1** — bate com `../../spec/vectors.json` |
| `RenderTests.java` | **Nível 2** — gera o PNG com o ZXing e lê com o ZXing |
| `SimbologiasTestes.java` | **Nível 2** — o Java desenha e o ZXing lê os códigos de barras 1D |
| `DataMatrixTestes.java` | **Nível 2** — o mesmo, para o Data Matrix, que é 2D |
| `ColocacaoDataMatrixTestes.java` | O `colocar()` antes das guias, no mesmo pacote |
| `CodificacaoDataMatrixTestes.java` | Lê o fonte: o encoder pede o UTF-8 pelo nome |
| `BugFixTests.java` | Regressões para os 7 defeitos do `QrService.cs` original |
| `PixTests.java` | PIX: CRC, chaves, truncagens, leitura, **e portabilidade** |

O `RenderTests` gera e lê com a mesma biblioteca, o que é menos forte do que
nos testes em Python — lá a leitura é feita pelo `zxing-cpp` de fora. Para
compensar, o PNG gerado pela CLI do Java foi verificado à mão com o
`zxing-cpp` do Python.

### Os códigos de barras

`core/src/main/java/com/qrcodegen/core/simbologias/` tem EAN-13, EAN-8, UPC-A,
Code 39, Code 93, Code 128, ITF, ITF-14, Codabar e **Data Matrix (ECC200)**.
**Nenhuma tabela está escrita à mão**: vêm de `spec/gerar-tabelas-*.py`, e o
ficheiro gerado diz isso na primeira linha.

Um código **2D** devolve um `CodigoMatriz`, que **não tem `guardas` nem
`legenda`** — as guias em L estão na própria grelha e um Data Matrix não tem
texto impresso por baixo. Um `guardas` vazio seria um campo que o desenho lê e
não usa.

```bash
node ../spec/paridade-java.mjs              # os 1D, módulo a módulo contra o Python
node ../spec/paridade-java-datamatrix.mjs   # o Data Matrix, grelha a grelha
```

Os casos vêm do `spec/casos-barras.mjs` e do gerador do web. **Um encoder só
entra no repositório depois de o ZXing devolver a cadeia certa** — não há
"quase": na fase dos códigos de barras, quatro encoders pareceram certos durante
a escrita e não eram.

**A leitura do Data Matrix compara codewords e não texto.** O `getText()` do
ZXing, sem ECI, assume ISO-8859-1, e um Data Matrix não tem ECI: o texto devolvido
não é o que foi escrito. O `getRawBytes()` são os codewords, um por byte.

---

## Notas

- O `SpecFixture` procura o `spec/vectors.json` a subir a árvore, por isso os
  testes têm de correr a partir de `java/` ou da raiz do repositório.
- O `core` só precisa de JDK. O ZXing é usado no `core`? Não — o `core` é Java
  puro; o ZXing só entra na app e nos testes.
