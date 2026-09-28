# TIPOS-QR — formato exato de cada payload

> Fonte de verdade do repositório. Se uma implementação gerar uma string
> diferente da aqui descrita, é bug — não "variação".
>
> Os testes em `spec/vectors.json` são o reflexo mecânico deste ficheiro.
> Estado: ✅ escrito e testado · 🟡 escrito, sem vetor · ⬜ por escrever

---

## Como ler este documento

Cada tipo tem: **payload** (o formato), **campos**, **validações**,
**escaping** e **limites**. O "Exemplo" é Literally um vetor de
`spec/vectors.json`, salvo indicação em contrário.

Regras gerais, válidas para todos os tipos:

1. O payload é **texto puro** (UTF-8). O QR não guarda ficheiros.
2. O comprimento máximo é **2 953 bytes** com ECC L, 2 331 com M, 1 663 com Q,
   1 273 com H (modo byte). A UI deve avisar **antes** de gerar.
3. Prefira sempre UTF-8 sem acentos em campos que vão para protocolos de
  parsers limitados.
4. Quebras de linha dentro de um payload quebram o scanner. Codifique-as
   (`%0A`, `\n` com escape) ou recuse-as.

---

# ✅ PIX / Pagamento (BR Code)

> Única implementação completa: `python/qrcode_core/pix.py`.
> Vetores: `spec/vectors.json`, tipo `pix`.
> Norma: Banco Central do Brasil, *Manual de Padrões para Iniciação do Pix*.

## O que é

O PIX é o sistema de pagamentos instantâneos brasileiro. O QR de PIX não é um
URL: é uma string **TLV** (*tag-length-value*) definida pelo Banco Central,
também usada como "PIX copia e cola".

Cada campo é `ID(2) + COMPRIMENTO(2, zeros à esquerda) + VALOR`, e os campos
são concatenados sem separador. Os campos `26` e `62` são **templates**:
o seu valor é outra sequência TLV e o parser tem de ser recursivo nesses dois.

```
5913Fulano de Tal   →   ID "59", 13 caracteres, valor "Fulano de Tal"
```

## Campos

| ID | Nome | Valor | Obrig. |
|---|---|---|---|
| `00` | Payload Format Indicator | sempre `01` | sim |
| `01` | Point of Initiation Method | `12` = QR de uso único. Omitido se reutilizável | não |
| `26` | Merchant Account Information | template, teto de **99** caracteres | sim |
| `26.00` | GUI | `br.gov.bcb.pix` | sim |
| `26.01` | Chave PIX | CPF, CNPJ, `+55…`, email ou UUID | sim |
| `26.02` | Descrição | texto livre | não |
| `26.25` | URL | payload dinâmico (servidor do banco) | não |
| `52` | Merchant Category Code | `0000` quando não informado | sim |
| `53` | Transaction Currency | `986` (BRL, ISO 4217) | sim |
| `54` | Transaction Amount | `25.75` — ponto decimal, sem separador de milhar | não |
| `58` | Country Code | `BR` | sim |
| `59` | Merchant Name | máximo **25** caracteres | sim |
| `60` | Merchant City | máximo **15** caracteres | sim |
| `61` | Postal Code (CEP) | só dígitos | não |
| `62` | Additional Data Field | template | sim |
| `62.05` | Reference Label (txid) | `A-Za-z0-9`, máximo **25**. `***` se não houver | sim |
| `63` | CRC16 | 4 hexadecimais **maiúsculos** | sim |

## CRC16

Variante **CRC-16/CCITT-FALSE**: polinómio `0x1021`, valor inicial `0xFFFF`,
sem reflexão de bits, sem XOR final.

O detalhe que derruba a maioria das implementações é a **ordem**: concatena-se
`6304` ao fim da string *antes* de calcular, e o resultado ocupa os quatro
caracteres seguintes.

```python
def crc16(data: str) -> int:
    crc = 0xFFFF
    for byte in data.encode("latin-1"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc
```

Vetor de validação canónico do algoritmo: `crc16("123456789") == 0x29B1`.
Vetor de validação do payload: o exemplo do BCB termina em `63041D3D`.

O CRC **não é segurança**. Deteta erro de transmissão; quem altera o payload
recalcula os quatro dígitos. A verificação real é o nome do titular que a app
do banco mostra, obtido da consulta ao diretório oficial.

## Exemplo (oficial, do Manual do BCB)

Campos: chave `123e4567-e12b-12d1-a456-426655440000`, nome `Fulano de Tal`,
cidade `BRASILIA`, sem valor.

```
00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D
```

## Campos e normalização

| Campo | Regra |
|---|---|
| Chave | aceita CPF/CNPJ **com máscara**, telefone **sem `+55`**, email e UUID em qualquer caixa. Normaliza e valida antes de construir |
| CPF/CNPJ | valida os **dígitos verificadores** (módulo 11) e rejeita sequências de dígitos iguais (`111.111.111-11`) |
| Telefone | `+55` + DDD (11–99, sem zero) + 8 ou 9 dígitos |
| Email | `local@dominio.tld`, máximo 77 caracteres |
| UUID | 36 caracteres, formato canónico, minúsculas |
| Nome | ASCII sem acentos, espaços colapsados, cortado a 25 |
| Cidade | ASCII sem acentos, cortado a 15 |
| Valor | aceita `25,75` (pt-BR), `25.75`, `R$ 10,00`. `1.234,56` → `1234.56`; ponto só é milhar se houver exatamente 3 dígitos a seguir e não no fim. Saída sempre com 2 decimais |
| txid | só `A-Za-z0-9`, cortado a 25. Se ficar vazio → `***` |
| Descrição (`26.02`) | recortada ao espaço que sobrar no teto de 99 do template `26`. **A chave nunca é cortada** |
| CEP | só dígitos, máximo 9 |

## Armadilhas

Estas custaram tempo a alguém. Cada uma tem teste.

1. **Acentos.** O comprimento é contado em caracteres. Um caractere multibyte
   faz o `length` declarado deixar de bater com o que o leitor conta, e o banco
   recusa. Normalizar para ASCII **antes** de contar.
2. **Espaço em branco na leitura.** Remover apenas `\r`, `\n` e `\t`. Um
   `replace(/\s/g, "")` génico destrói o espaço de "Fulano de Tal" e desalinha
   todos os campos a partir dali — produz um payload que parece válido e é
   recusado.
3. **Chave ambígua.** 11 dígitos podem ser CPF ou telefone local. Se os
   dígitos verificadores não batem, a mensagem de erro tem de sugerir `+55`.
4. **Teto do template `26`.** Chave (36) + GUI (14) + overhead = 58. Sobram 37
   caracteres para a descrição. Recortar a descrição, nunca a chave.
5. **QR dinâmico vs estático.** O dinâmico carrega uma URL (`26.25`) que
   devolve o payload assinado em JWS. Emitir dinâmico exige ser participante
  do arranjo. Esta implementação só faz **estático**.

## Limites

Payload típico: 110–185 bytes. Cabe sem folga em ECC H (1 273 bytes).
O limite real nunca é o QR; é o que o banco aceita no campo 26.

---

# Tipos já existentes no C# (por documentar formalmente)

> 🟡 O formato está descrito abaixo a partir de `csharp/desktop-winforms/QrService.cs`.
> Falta: vetores em `spec/vectors.json` e confirmação contra leitores reais.
> Onde o C# está **errado**, está assinalado — a spec é a versão correta.

## 1. Link ✅

- **Payload**: o URL, com `https://` acrescentado se não houver esquema.
- **Validação**: obrigatório.
- 🔧 **O C# aceita esquemas perigosos.** `NormalizeUrl` só verifica se começa
  por `http://`/`https://`, pelo que `javascript:`, `data:` e `file:` passam.
- **Spec**: rejeitar tudo o que não seja `http`/`https` (e opcionalmente
  `mailto:`/`tel:`, que são tipos próprios).

## 2. Texto ✅

- **Payload**: o texto tal e qual, sem escapagem.
- **Limite**: é aqui que o limite de 2 953 bytes se sente.
- **Spec**: avisar com contagem concreta ("1 200 de 2 953 bytes com ECC M").

## 3. Email ✅

- **Payload**: `mailto:` + destinatário + `?subject=&body=`
- **Escaping**: no URI, ` ` → `%20`, `#` → `%23`, `&` → `%26`, nova linha →
  `%0A`. As apps de email não decodificam `\n`.
- 🔧 **O C# emite `MAILTO:` em maiúsculas** (a biblioteca `QRCoder` faz assim
  com `MailEncoding.MAILTO`). Funciona, mas é inconsistente com o resto.
  **Spec**: `mailto:` minúsculo.
- **Spec**: `body` antes de `subject`? A ordem canónica é `subject` primeiro.

## 4. Telefone ✅

- **Payload**: `tel:+351912345678`
- **Validação**: indicativo obrigatório.
- 🔧 **Normalização inconsistente.** `00` → `+` só quando está exatamente no
  início da string.
- **Spec**: `00` → `+` em qualquer posição inicial; `+` único; resto só dígitos.

## 5. SMS ✅

- **Payload**: `SMSTO:+351912345678:mensagem`
- **Escaping**: nada no corpo — a mensagem vai literally até ao fim.
  Consequência: **não pode conter `:` nem quebra de linha**. Validar e avisar.
- **Alternativa**: `sms:+351...?body=` (RFC 5724), suportado por menos apps.

## 6. WhatsApp ✅

- **Payload**: `https://wa.me/<só dígitos>?text=<mensagem>`
- **Validação**: o número vai só com dígitos (código de país + número).
- **Escaping**: `text` é um query parameter → `URL-encode`.

## 7. Evento (iCal) ✅

- **Payload**: `BEGIN:VCALENDAR` … `END:VCALENDAR`, com um `VEVENT`.
- **Datas**: `DTSTART:20260930T100000Z` (UTC, formato básico estendido).
- 🔧 **Bug 1 — fim de linha.** O C# usa `Environment.NewLine`: CRLF no
  Windows, LF noutros. A RFC 5545 exige **CRLF**. Duas plataformas, dois
  payloads.
- 🔧 **Bug 2 — sem escaping.** `,` `;` `\` e quebras de linha nos valores
  produzem iCal inválido. Precisa de `\,` `\;` `\\` `\n`.
- **Spec**: CRLF explícito, escaping em `SUMMARY`, `DESCRIPTION` e `LOCATION`.

## 8. Localização ✅

- **Payload**: `geo:38.7223,-9.1393`
- **Validação**: latitude em [-90, 90], longitude em [-180, 180]. Separador
  decimal `.` (invariante),aceita `,` na entrada.
- 🔧 **O C# não valida o intervalo** e guarda as coordenadas como `string`.
  **Spec**: `double?`.

## 9. WiFi ✅

- **Payload**: `WIFI:T:WPA;S:nome;P:password;H:true;;`
  - `T:` = `WPA` | `WEP` | `nopass`
  - `H:` = rede oculta (`true`/`false`), omitido se não aplicável
  - O `;;` final é obrigatório (terminador vazio)
- **Escaping** (o caso clássico de bug): dentro de `S` e `P` é preciso escapar
  `\`, `;`, `,`, `:`, `"` com barra invertida.
- **Limite**: SSID até 32 bytes, password até 63 caracteres (WPA2).
- **Spec**: testar SSID/password com `;` `:` `\` `"`.

## 10. VCard 4.0 ✅

- **Payload**: `BEGIN:VCARD` / `VERSION:4.0` / … / `END:VCARD`, linhas CRLF.
- **Campos**: `FN`, `N`, `ORG`, `TITLE`, `TEL;TYPE=cell:`, `EMAIL`, `ADR;TYPE=work:;;…;;`
- 🔧 **Bug — a morada nunca é gerada.** Todos os parâmetros de endereço do
  `PayloadGenerator.ContactData` são passados como `""`, pelo que o `ADR` não
  sai. Uma vCard sem morada é um contacto incompleto.
- 🔧 **Bug — `N` e tipos.** `N` mal preenchido e apenas um telefone/email, sem
  `TYPE=cell`/`TYPE=work`.
- **Escaping**: como iCal, mas também `\,` `\;` `\n`; no campo `ADR` os
  separadores `;` estruturais não se escapam.
- **Spec**: morada completa, vários telefones com tipo, `FN` obrigatório,
  `N` derivado do nome quando ausente.

---

# ⬜ Tipos por escrever

| # | Tipo | Formato | Prioridade |
|---|---|---|---|
| 11 | Crypto | `bitcoin:addr?amount=&label=`, `ethereum:addr@1?value=` (EIP-681) | P1 |
| 12 | Produto (GS1) | `https://gs1.org/01/<GTIN>` (GS1 Digital Link) | P1 |
| 13 | ISBN | `urn:isbn:978…` | P2 |
| 14 | Redes sociais | link/handle por plataforma | P1 |
| 15 | App / deep link | `myapp://path`, App Link, URL de loja | P1 |
| 16 | Documento / PDF | URL (+ hash de verificação opcional) | P1 |
| 17 | Cupão / desconto | URL curta assinada | P2 |
| 18 | MeCard | `MECARD:N:;TEL:;EMAIL:;;` | P2 |
| 19 | Bluetooth | `BT:endereço;nome;;` — experimental | P3 |
| 20 | Fidelidade | payload JSON assinado | P2 |
| 21 | Ficha técnica / menu | URL do documento | P2 |
| 22 | **Códigos de barras** | Code128, EAN-13, ITF, Code39 — outra simbologia, não é QR | P3 |
| 23 | **Outras 2D** | Data Matrix, PDF417, Aztec | P3 |

Os números 1–10 já existem no C#; o 11 (PIX) é novo e está pronto. A ordem
de implementação está em [`TODO.md`](TODO.md).
