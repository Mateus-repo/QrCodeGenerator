# Como usar — e como partilhar

Guia de utilização de cada app. O `README.md` da raiz é o índice; este é o
manual.

---

## Escolher qual app usar

| Quero… | Usa |
|---|---|
| Gerar um QR agora, sem instalar nada | **Site** — abre o link e está feito |
| Um ficheiro para enviar a alguém por email | **Site**, botão *Guardar PNG* |
| Usar sem internet, ou com um ecrã sujo | **Site** servido + instalado como app |
| Um programa Windows para usar todos os dias | **App C#** |
| Um programa para Windows, Mac **e** Linux | **App Java** — o mesmo código, três instaladores |
| Gerar QR em série, a partir de um script | **CLI** — Python ou Java, qual preferir |
| Construir outra coisa em cima disto | **Biblioteca Python** |
| Mandar para telemóvel | Qualquer uma, o PNG vai por WhatsApp/email |

---

# 1. O site

O cliente principal. Um link, e funciona em qualquer Windows, Mac, Linux ou
telemóvel.

## Abrir

**Servido** (tem de ser um URL, não um ficheiro):

```bash
cd web
python -m http.server 8777
```

Depois abre `http://127.0.0.1:8777`. Publicar no GitHub Pages dá-te um URL
público para mandar a quem quiseres.

**Ficheiro único**, sem servidor — abre com duplo clique em qualquer sistema:

```bash
node web/tools/bundle.mjs
```

Sai `web/dist/qrcode-generator.html` (~116 KB). Dá para mandar por email, pôr
num cartão de memória ou pôr na cloud.

> Porquê as duas formas: módulos ES são bloqueados em `file://` pelo Chrome,
> por isso a versão em vários ficheiros precisa de um servidor. O ficheiro
> único contorna isso.

## Usar

1. Escolhe o **Formato**: QR Code (2D), ou uma das quatro simbologias 1D.
2. Se for QR, escolhe o **tipo de conteúdo** e preenche os campos. Se for 1D,
   escreve o valor — o número de dígitos é validado à medida que escreves.
3. A imagem atualiza a cada tecla.
4. Se aparecer um erro em vermelho, diz o que falta — nunca é genérico.
5. **Guardar PNG**, **Guardar SVG** ou **Copiar**.

Em *Opções* escolhes o nível de correção de erros, o tamanho e a margem. A
correção de erros só aparece no QR: um código de barras não a tem.

### Códigos de barras

| Formato | Aceita | Para quê |
|---|---|---|
| EAN-13 | 12 ou 13 dígitos | produto de supermercado |
| EAN-8 | 7 ou 8 dígitos | embalagens pequenas |
| UPC-A | 11 ou 12 dígitos | o equivalente norte-americano do EAN-13 |
| Code 128 | qualquer ASCII | etiquetas de encomenda |

O último dígito dos três primeiros é **calculado** — escreve só os primeiros e
o site acrescenta o de controlo. O Code 128 escolhe sozinho a codificação mais
compacta.

O ficheiro exportado diz o que é (`codigo-ean13.png`, não `qrcode-link.png`).


**Cada formato tem um exemplo e uma dica por baixo.** O exemplo e' o que parece,
e a dica e' o que e' valido: quantos digitos, que caracteres, o que e' calculado.
O exemplo passa na propria validacao do formato, o que quer dizer que **copiar e
colar o exemplo resulta sempre** — e um exemplo que o site recusasse seria pior
do que nenhum, porque a pessoa ficava a achar que o exemplo estava errado.

Os formatos de duas dimensoes (PDF417, Data Matrix, GS1 DataMatrix, SQRC) tambem
tem, e nos campos de data a interface traz a **data de hoje** em vez de um
exemplo: um evento com a data de ontem nao e' um exemplo, e' uma data errada.
A margem muda de valor: 4 módulos no QR, 10 nos códigos de barras, que é o que a
ISO/IEC 15420 pede para um 1D.

### SQRC, o QR com conteudo cifrado

Escolhe **SQRC (conteudo cifrado)** no formato, escreve o conteudo como
escreverias num QR normal, e escreve **a chave**.

**A chave e' tua, e so tua.** O site nao a guarda em lado nenhum: nem no
servidor, nem no dispositivo, nem no historico do browser. Sem a chave, o
conteudo esta **perdido para sempre** — nao escondido, perdido. Nao ha
recuperacao e nao ha segunda tentativa.

Isto e' deliberado, e o inverso e' que nao e': um servico que guardasse a tua
chave poderia mostrar o teu conteudo a alguem. Um que nao a guarda nao tem esse
poder. O preco e' a ausencia de segunda chance.

O campo da chave aceita qualquer texto. A mesma frase da sempre a mesma chave, e
por isso que a frase tem de ser a mesma noutro dispositivo. O botao **"gerar
uma chave aleatoria"** escreve no campo — nao a aplica a dedo, para a poderes ler
e confirmar antes de a usar.

**O identificador da chave** e' opcional e serve para ter varios SQRC com chaves
diferentes no mesmo sitio e saber de que chave e' cada um sem abrir nenhum. Os
bytes desse campo vao no codigo, e quem o ler ve-los: **nao e' segredo.**

O conteudo vai cifrado com **AES-GCM**, que e' a Web Crypto do browser — sem
dependencias, sem nada para instalar. Escolhe-se o GCM e nao outro porque
**verifica**: um codigo adulterado da erro em vez de devolver bytes errados, e
quem descifrar sabe que o problema e' do codigo e nao da chave.

O que sai do site e' a base64 do contentor cifrado, e e' isso que vai no PNG, no
SVG e no botao de copiar. **Nao sai o texto em claro** — se saisse, o SQRC seria
um QR normal com um passo a mais.

**Da para por um logotipo**, como em qualquer QR. Apagar os modulos para o
logotipo caber e' o caso em que a correccao de erros faz o seu trabalho, e num
SQRC isso importa mais: um modulo apagado a mais produz um codigo que se le **com
o texto errado**, e quem descifrar ve "chave errada" — a pista aponta para a
chave, que esta impecavel, e nao para o codigo. Por isso o limite do logotipo e'
medido com o ZXing e nao deduzido da percentagem da norma, e a interface diz ate
onde da.

E o **evento sai com a hora flutuante**, que e' o correcto para um encontro
marcado num sitio: o calendario de cada pessoa le-o a hora local de cada pessoa.
Com fuso, quem estivesse noutro pais via-o a hora errada.

Nao ha leitor de SQRC em nenhum lado: quem abre tem de ter a chave. E o ZXing,
que le o QR, devolve os bytes cifrados — que e' o que tem de acontecer.

### Temas

Em *Opções* tens **Tema** e **Modo**.

**Tema** — o carácter visual:

| | | |
|---|---|---|
| Padrão | Windows 11 | Windows 10 |
| Windows 8 | Windows 7 | Windows XP |
| Windows 95 | macOS | Ubuntu |

**Modo** — **Sistema**, **Claro** ou **Escuro**. Cada tema tem as duas variantes,
o que dá 27 combinações. Por exemplo *Windows 95 escuro*: o cinzento da moldura
3D mantido, o ambiente de trabalho quase preto azulado, os campos pretos — o
esquema "Dark" que se usava no fim dos anos 90.

**Sistema** segue o que o teu computador disser e muda sozinho se ligares o modo
escuro com a página aberta. A escolha fica guardada e já está aplicada no
primeiro carregamento, sem piscar.

> **Nem toda a variante escura existiu.** Windows 7, 8, 10, 11, macOS e Ubuntu
> têm escuro de origem — no Windows 8, o Metro escuro era o original. O Windows
> 95 e o Windows XP **não**: nunca houve um 95 nem um Luna escuro da Microsoft.
> Esses dois são interpretações de temas de terceiros populares na altura.

O QR code **nunca** é tematizado: fica sempre preto sobre branco, em todos os
temas. Um código tem de se ler, e a impressão não perdoa.

## Partilhar

- **Guardar PNG** — para enviar por WhatsApp, email, ou pôr num documento.
- **Guardar SVG** — para imprimir em grande, sem perda de qualidade. É um
  ficheiro de texto, escala para qualquer tamanho.
- **Copiar** — a imagem vai para a área de transferência. Se o browser não
  permitir, copia o conteúdo em texto (que é muitas vezes o que queres).
- **Partilhar** — aparece só onde o SO tem integração (telemóvel, sobretudo).
  Manda a imagem direto para outra app. Se não existir, faz o mesmo que
  *Guardar PNG*.
- **Ver o que vai dentro** — a secção no fundo mostra literalmente a string que
  o código contém. Serve para conferir, e para copiar o conteúdo.

## Instalar como app (PWA)

Servido em HTTPS ou localhost, o browser oferece instalar. Fica um ícone no
ecrã, abre em janela própria e **funciona offline** depois da primeira visita.

## Para que serve cada tipo

| Tipo | O QR faz isto quando alguém lê |
|---|---|
| Link | Abre o site/app |
| Texto | Mostra o texto |
| Email | Abre o email com destinatário, assunto e mensagem preenchidos |
| Telefone | Pergunta se quer ligar |
| SMS | Abre o SMS com a mensagem |
| WhatsApp | Abre a conversa já com a mensagem |
| Evento | Pergunta se quer adicionar à agenda |
| Localização | Abre o mapa na posição |
| WiFi | **Oferece-se ligar à rede** — guarda o QR na mochila |
| VCard | Pergunta se quer guardar o contacto |
| PIX | Abre a app do banco para pagar |

---

# 2. A app Windows (C#)

## Instalar e correr

```bash
cd csharp
dotnet run --project desktop-winforms -c Release
```

Requisito: [.NET 8 SDK](https://aka.ms/dotnet/download). É só para
desenvolver — quem recebe o exe não precisa de nada.

## Fazer o exe para distribuir

```bash
cd csharp
dotnet publish desktop-winforms -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:EnableCompressionInSingleFile=true \
  -p:DebugType=None -p:DebugSymbols=false \
  -o desktop-winforms/dist
```

Sai `csharp/desktop-winforms/dist/QrCodeGenerator.exe` (~68 MB).

**Como partilhar:** vai ao separador *Releases* do GitHub e anexa o exe. Ou
zipa-o e manda por email. O ficheiro é grande porque leva o runtime do .NET
dentro — quem o receber clica e funciona, sem instalar nada.

> Assinatura digital: um exe sem assinatura aparece como "Windows Protegeu o
> teu PC". Isso resolve-se com um certificado de assinatura de código, que é
> pago. Para uso interno não compensa.

## Usar

Igual ao site: escolhemos o tipo, preenchemos, e a imagem atualiza sozinha.
*Atualizar QR Code* força a redesenhar; *Baixar PNG* guarda.

**Nível de correção** e **tamanho** estão sempre visíveis — o site esconde-os
em *Opções*, porque na app há espaço.

---

# 3. Java — a app multiplataforma

Corre em **Windows, macOS e Linux** a partir do mesmo código, e o `jpackage`
gera o instalador nativo de cada sistema.

## Instalar e correr

Requisito: um **JDK 21**. Nada de mais.

```bash
cd java
./build.sh app        # interface gráfica
```

O script descarrega sozinho o ZXing, o Gson, o JUnit e o SDK do JavaFX para
`~/.m2/qrcodegen`. Precisa de `curl` e `unzip`.

No Windows, o script é um bash — usa o Git Bash, o WSL, ou qualquer terminal
com bash. Só `javac`/`java` é preciso; o resto é o script.

## Fazer o instalador

```bash
cd java
./build.sh package
```

| Sistema | Sai | Precisa de |
|---|---|---|
| Windows | `.msi` e `.exe` | [wiX Toolset](https://wixtoolset.org/) |
| macOS | `.dmg` e `.pkg` | Xcode Command Line Tools |
| Linux | `.deb` | `fakeroot` e `dpkg-deb` |

Sai em `java/desktop-javafx/dist/`.

**Como partilhar:** anexa o instalador a um [GitHub Release](../../README.md).
Quem o instala recebe um ícone no menu de applications e não precisa de Java
instalado — o `jpackage` embute o runtime.

**Ressalva honesta:** o `jpackage` só gera o instalador **no sistema de
destino**. O `.msi` faz-se no Windows, o `.dmg` no macOS. Não é
cross-compilação — é uma imposição da Oracle. Para uma pasta que corra em
qualquer lado sem instalar nada, usa `./build.sh package --type app-image` e
manda a pasta que sai (tem de ser descompactada no destino).

## Linha de comandos

Não precisa de JavaFX nem de ecrã — corre num servidor.

```bash
cd java
./build.sh run pix --key 529.982.247-25 --name "Ana Silva" \
    --city "Belo Horizonte" --amount 25,75 -o pix.png

./build.sh run pix-leer "00020126...63041D3D"
./build.sh run fix-crc  "00020126...63040000"
./build.sh run --help
```

Códigos de saída: `0` sucesso · `1` erro de validação · `2` CRC inválido.

## Testes

```bash
cd java && ./build.sh test
```

119 testes. Incluem dois que são sobre **portabilidade** e que valem a pena ler:

- `crcNaoDependeDoLocale` — muda o locale do sistema para grego, turco e
  alemão e confirma que o payload não se mexe. Em grego e turco,
  `toUpperCase()` sem locale produz caracteres diferentes.
- `payloadNaoDependeDoFimDeLinha` — o payload do evento não pode levar
  quebras de linha do sistema operativo. Era um bug real na versão C# original.

---

# 4. Python

Duas coisas: uma biblioteca e uma linha de comandos. Não há interface
gráfica ainda.

## Instalar

```bash
cd python
pip install -r requirements.txt
```

| Dependência | Para quê |
|---|---|
| `segno` | gerar o QR — **obrigatória** |
| `Pillow` | saída PNG (o SVG não precisa) |
| `zxing-cpp` | só para os testes |
| `pytest` | só para os testes |

## Linha de comandos

```bash
cd python

# Gerar — imprime sempre o payload, e escreve ficheiro com -o
python cli/qrcli.py pix --key 529.982.247-25 --name "Ana Silva" \
    --city "Belo Horizonte" --amount 25,75 -o pix.png

# SVG, escalável
python cli/qrcli.py pix --key fulano@example.com --name "F" --city "R" \
    --format svg -o pix.svg

# Ler e validar um PIX colado de uma app
python cli/qrcli.py pix-leer "00020126...63041D3D"

# Recuperar um código com o CRC estragado
python cli/qrcli.py fix-crc "00020126...63040000"
```

Tipos de chave aceites: CPF (`529.982.247-25`), CNPJ, telefone (`5511966666666`
ou `+55 11 96666-6666`), email, ou chave aleatória (UUID).

Códigos de saída: `0` sucesso · `1` erro de validação · `2` payload lido com
CRC inválido. Importante em scripts.

## Biblioteca

```python
from qrcode_core import PixPayload, build, to_png, EccLevel

brcode = build(PixPayload(
    key="529.982.247-25", name="Ana Silva", city="Belo Horizonte",
    amount="25,75",          # "25,75" e "25.75" são ambos aceites
    txid="pedido123",
))

png = to_png(brcode, scale=10, ecc=EccLevel.H)
```

Para ler:

```python
from qrcode_core import parse, fix_crc

parsed = parse("00020126...")
parsed.crc_valid        # False = o código não é fiável
parsed.payload.amount   # Decimal
parsed.url              # preenchido se for PIX dinâmico
```

Erros: `PixKeyError` (chave inválida), `PixValidationError` (campo em falta),
`PixError` (base), `CapacityError` (acima do limite do QR).

---

# 5. Desenvolvedores — os testes

```bash
# C# — 137 testes
cd csharp && dotnet test

# Java — 119 testes
cd java && ./build.sh test

# Python — 108 testes
cd python && python -m pytest tests -q

# Web — 103 testes
node --test "web/tests/*.test.mjs"

# Web — o teste que importa: o ZXing lê o que gerámos?
node web/tests/cross-check.mjs
python web/tests/descodificar.py

# Web — o mesmo para os códigos de barras
node web/tests/gerar-lineares.mjs
python web/tests/descodificar-lineares.py
```

Os primeiros verificam o **payload** (a string). O do web gera as imagens e
confirma que um leitor independente devolve o texto certo.

Ao mexer em `pix.py` / `pix.js` / `Pix.cs` / `Pix.java`, regerar a spec:

```bash
python spec/gerar-vectors.py
```

Depois correr os testes de todas as stacks. Se alguma falhar, as versões
divergiram — e a spec diz qual é a string certa.

---

# 6. Privacidade

- Nada sai do dispositivo, em nenhuma das apps. Não há analytics nem CDN.
- Um QR de WiFi, VCard ou PIX **contém os dados**. Quem fotografa tem acesso.
  Não há como resolver isto por software — é a natureza do formato. Partilha só
  com quem confias.
- O ficheiro único do site não faz pedidos a lado nenhum. Pode ser usado
  offline e em rede isolada.

---

# 7. Dúvidas frequentes

**O QR não lê no telemóvel.**
Faltam normalmente duas coisas: a zona branca à volta (4 módulos, a "margem") e
contraste. Não reduzas a margem abaixo de 4, e não ponhas o QR sobre fundo
colorido sem fundo branco por baixo.

**O QR está pequeno e não lê de longe.**
Aumenta o tamanho e usa ECC H — é para isso que existem níveis de correção.
Imprimir: 1024 px ou SVG.

**Diz "conteúdo demasiado longo".**
O limite é 2 953 bytes (ECC L) e 1 273 (ECC H). É uma limitação do formato, não
um bug. Reduz o texto ou desce o nível de correção.

**O nome do recebedor no PIX ficou cortado.**
Máximo de 25 caracteres, por norma do Banco Central. Os acentos também contam.
O código avisa-te.

**O QR de WiFi não liga.**
Algumas apps só leem WPA, não WPA3 nem redes ocultas. Verifica a segurança
da rede.

**Posso usar para imprimir em papel?**
Sim, e é o caso de uso forte. Usa SVG, ou PNG a 1024 px, e ECC Q ou H — quem
imprime em laser, a imagem às vezes fica com artefactos.
