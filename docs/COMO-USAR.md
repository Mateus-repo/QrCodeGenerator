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
| Gerar QR em série, a partir de um ficheiro | **CLI Python** |
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

Sai `web/dist/qrcode-generator.html` (~69 KB). Dá para mandar por email, pôr
num cartão de memória ou pôr na cloud.

> Porquê as duas formas: módulos ES são bloqueados em `file://` pelo Chrome,
> por isso a versão em vários ficheiros precisa de um servidor. O ficheiro
> único contorna isso.

## Usar

1. Escolhe o **tipo de conteúdo** no menu.
2. Preenche os campos. A imagem atualiza a cada tecla.
3. Se aparecer um erro em vermelho, diz o que falta — nunca é genérico.
4. **Guardar PNG**, **Guardar SVG** ou **Copiar**.

Em *Opções* escolhes o nível de correção de erros, o tamanho e a margem.

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

# 3. Python

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

# 4. Desenvolvedores — os testes

```bash
# C# — 137 testes
cd csharp && dotnet test

# Python — 108 testes
cd python && python -m pytest tests -q

# Web — 54 testes
node --test "web/tests/*.test.mjs"

# Web — o teste que importa: o ZXing lê o que gerámos?
node web/tests/cross-check.mjs
python web/tests/descodificar.py
```

Os três primeiros verificam o **payload** (a string). O quarto gera as
imagens e confirma que um leitor independente devolve o texto certo.

Ao mexer em `pix.py` / `pix.js` / `Pix.cs`, regerar a spec:

```bash
python spec/gerar-vectors.py
```

Depois correr os testes das três stacks. Se alguma falhar, as duas versões
divergiram.

---

# 5. Privacidade

- Nada sai do dispositivo, em nenhuma das apps. Não há analytics nem CDN.
- Um QR de WiFi, VCard ou PIX **contém os dados**. Quem fotografa tem acesso.
  Não há como resolver isto por software — é a natureza do formato. Partilha só
  com quem confias.
- O ficheiro único do site não faz pedidos a lado nenhum. Pode ser usado
  offline e em rede isolada.

---

# 6. Dúvidas frequentes

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
