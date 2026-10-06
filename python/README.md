# Python

Biblioteca + linha de comandos. É a **implementação de referência** da spec.

> ⚠️ **Só o PIX está implementado.** Os 10 tipos que já existem no C# e no site
> ainda não foram portados. Ver [`../docs/TODO.md`](../docs/TODO.md).

```
python/
├── qrcode_core/     ← biblioteca: payloads + geração de imagem
│   ├── pix.py       ← PIX / BR Code (EMV-QRCPS-MPM)
│   └── render.py    ← PNG/SVG a partir de um payload
├── cli/             ← linha de comandos (qrcli)
├── gui/             ← interface gráfica (por fazer)
├── tests/           ← pytest
└── conftest.py      ← path setup para os testes
```

Guia de uso e partilha: [`../docs/COMO-USAR.md`](../docs/COMO-USAR.md)

## Instalar

```bash
cd python
pip install segno Pillow zxing-cpp pytest
```

| Dependência | Para quê | Obrigatória? |
|---|---|---|
| `segno` | gerar a matriz do QR | sim |
| `Pillow` | saída PNG | para PNG (o SVG não precisa) |
| `zxing-cpp` | ler o QR gerado nos testes | só em testes |
| `pytest` | correr os testes | só em testes |

## Testes

```bash
cd python
python -m pytest tests -q
```

323 testes. Cobrem a spec partilhada (`spec/vectors.json`), o exemplo oficial do
Banco Central, e — o mais importante — **descodificam o PNG gerado** com o
ZXing e confirmam que devolvem o payload original.

## Linha de comandos

```bash
cd python

# Gerar (imprime sempre o payload, escreve ficheiro com -o)
python cli/qrcli.py pix --key 529.982.247-25 --name "Ana Silva" \
    --city "Belo Horizonte" --amount 25,75 -o pix.png

# Tipos de chave aceites
python cli/qrcli.py pix --key 11.222.333/0001-81 --name "Empresa SA" --city "Curitiba"
python cli/qrcli.py pix --key +5511966666666 --name "Loja" --city "Sao Paulo"
python cli/qrcli.py pix --key fulano@example.com --name "Fulano" --city "Recife"
python cli/qrcli.py pix --key 123e4567-e12b-12d1-a456-426655440000 --name "Fulano" --city "Recife"

# SVG (escalável, sem dependências)
python cli/qrcli.py pix --key fulano@example.com --name "F" --city "R" --format svg -o pix.svg

# Ler e validar um PIX copia e cola colado
python cli/qrcli.py pix-leer "00020126...63041D3D"

# Recuperar um payload com CRC errado
python cli/qrcli.py fix-crc "00020126...63040000"
```

Códigos de saída: `0` sucesso, `1` erro de validação, `2` payload lido com CRC
inválido.

## Biblioteca

```python
from qrcode_core import PixPayload, build, to_png, EccLevel

brcode = build(PixPayload(
    key="529.982.247-25",     # CPF, CNPJ, +55, email ou UUID
    name="Ana Silva",         # max. 25, acentos normalizados
    city="Belo Horizonte",    # max. 15
    amount="25,75",           # opcional, aceita "25,75" e "25.75"
    txid="pedido123",         # opcional, max. 25 alfanuméricos
    description="Obrigado!",  # opcional (campo 26.02)
    postcode="52010-100",     # opcional (campo 61)
    single_use=False,         # campo 01 = 12
))

png = to_png(brcode, scale=10, ecc=EccLevel.H)
```

Leitura:

```python
from qrcode_core import parse, fix_crc

parsed = parse("00020126...")
parsed.crc_valid            # bool
parsed.payload.key          # chave normalizada
parsed.payload.amount       # Decimal ou None
parsed.url                  # URL, se for PIX dinâmico

fix_crc("00020126...63040000")   # recalcula o CRC
```

Erros: `PixKeyError` (chave inválida), `PixValidationError` (campo em falta),
`PixError` (base), `CapacityError` (payload acima do limite do QR).

## Regerar a spec

Depois de mudar `pix.py`:

```bash
python spec/gerar-vectors.py
```

Reescreve `spec/vectors.json` e verifica cada vetor por CRC, round-trip e
descodificação do PNG.
