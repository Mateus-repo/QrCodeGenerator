"""
Calcula, em Python, os payloads dos casos de `paridade-python.mjs`.

    python web/tests/calcular-paridade.py

Sai um JSON com a mesma forma que o Node calcula, para os dois serem comparados
linha a linha. **A ordem dos casos tem de ser a mesma**, e por isso que a lista
esta aqui duplicada e nao vem de um ficheiro partilhado: um ficheiro partilhado
seria JSON, e o JavaScript le-o de uma maneira e o Python de outra, e um
caractere mal escapado num dos lados daria uma comparacao que passa a testar
pouco.

O que este script **nao** faz
----------------------------

**Nao valida.** A validacao e' `qrcode_core.validacao`, e o que se compara aqui
e' o payload de um caso que ja se sabe valido. Um caso invalido daria uma
mensagem de erro em vez de um payload, e a comparacao de mensagens de erro e'
outro teste — que e' o que `paridade-validacao.mjs` faz.

Por que escreve para o stdout e nao para um ficheiro
----------------------------------------------------

**Porque o Node e' quem chama, e o `>` do Windows PowerShell 5.1 produz UTF-16** —
que o Python depois falha a ler. Passando pelo `execFileSync` o Node recebe a
saida directamente, e nao ha caminho onde a codificacao possa mudar pelo meio.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "python"))

from qrcode_core.tipos import CATEGORY_IDS, build  # noqa: E402

#: Os mesmos casos, **na mesma ordem** que `paridade-python.mjs`.
#:
#: A duplicacao e' proposita. Um ficheiro partilhado seria JSON, e o JavaScript
#: le-o de uma maneira e o Python de outra; um caractere mal escapado num dos
#: lados daria uma comparacao que parece estar a testar e nao esta. **Com as
#: listas separadas, uma divergencia na ordem da-se a ver** — o teste da a dizer
#: "o caso 3 e' `vcard/completo` num e `sms` no outro".
CASOS = [
    ("link", "sem esquema", {"url": "exemplo.pt"}),
    ("link", "com esquema", {"url": "https://exemplo.pt/caminho?a=1&b=2"}),
    ("texto", "simples", {"texto": "Peca 4471, lote A1"}),
    ("texto", "com acentos e emoji", {"texto": "Peça-francesa — cœur — 30 € \U0001f510"}),
    ("texto", "com quebras de linha", {"texto": "linha um\nlinha dois"}),
    # O caso que apanhou um bug nas DUAS stacks: o `œ` e' um caracter unico e
    # o NFD nao o decompoe, e `cœur` dava `cur` dos dois lados.
    ("texto", "com ligaduras", {"texto": "cœur · œuvre · manœuvre"}),
    ("email", "so o destinatario", {"mailTo": "ana@exemplo.pt"}),
    (
        "email",
        "com assunto e corpo",
        {
            "mailTo": "ana@exemplo.pt",
            "mailSubject": "Reunião de sexta & balanço",
            "mailBody": "Confirmo a presença. Traz a documentação.",
        },
    ),
    ("telefone", "com indicativo", {"phonePrefix": "+351", "phoneNumber": "912 345 678"}),
    ("telefone", "indicativo em 00", {"phonePrefix": "00351", "phoneNumber": "912345678"}),
    (
        "sms",
        "com mensagem",
        {"phonePrefix": "+351", "phoneNumber": "912345678", "smsMessage": "Chego às 18h"},
    ),
    ("sms", "sem mensagem", {"phonePrefix": "+351", "phoneNumber": "912345678"}),
    ("whatsapp", "so o numero", {"phonePrefix": "+351", "phoneNumber": "912345678"}),
    (
        "whatsapp",
        "com mensagem",
        {"phonePrefix": "+351", "phoneNumber": "912345678", "waMessage": "Olá & bom dia"},
    ),
    (
        # O caso que mais importa: o titulo tem `;` e `,`, que sao os
        # separadores do iCalendar, e sem escape o SUMMARY acaba no sitio errado
        # e o evento fica sem titulo.
        "evento",
        "com separadores no titulo",
        {
            "eventTitle": "Aula: guionização, nível 2",
            "eventStart": "2026-09-29T18:30",
            "eventEnd": "2026-09-29T20:30",
            "eventLocation": "Biblioteca municipal, sala 3",
            "eventDescription": "Trazer caderno. Duas horas; com pausa.",
        },
    ),
    (
        "evento",
        "com barras invertidas",
        {
            "eventTitle": "路径 \\ e barra",
            "eventStart": "2026-01-01T09:00",
            "eventEnd": "2026-01-01T10:00",
        },
    ),
    ("localizacao", "coordenada simples", {"geoLat": "38.7223", "geoLng": "-9.1393"}),
    ("localizacao", "com virgula decimal", {"geoLat": "38,7223", "geoLng": "-9,1393"}),
    (
        "localizacao",
        "com muitas casas",
        {"geoLat": "38.722312345678", "geoLng": "-9.139312345678"},
    ),
    (
        "wifi",
        "com password",
        {"wifiSsid": "Rede Casa", "wifiSec": "WPA/WPA2", "wifiPass": "segredo123"},
    ),
    ("wifi", "aberta e oculta", {"wifiSsid": "Rede Aberta", "wifiSec": "Aberto", "wifiHidden": True}),
    (
        # O SSID tem `;` e `,`, e sem escape o `P:` seguinte e lido como parte
        # do SSID.
        "wifi",
        "ssid com separadores",
        {"wifiSsid": "Rede; Com, Separadores", "wifiSec": "WPA/WPA2", "wifiPass": "p;ass"},
    ),
    (
        "vcard",
        "completo",
        {
            "vcFirstName": "Ana",
            "vcLastName": "Silva",
            "vcOrg": "Oficina de Reparação, Lda.",
            "vcRole": "Técnica",
            "vcPhone": "+351 912 345 678",
            "vcPhone2": "+351 213 456 789",
            "vcEmail": "ana@exemplo.pt",
            "vcStreet": "Rua da Bica 12, 3.º Esq",
            "vcCity": "Lisboa",
            "vcZip": "1200-401",
            "vcCountry": "Portugal",
        },
    ),
    ("vcard", "so o nome", {"vcFirstName": "Ana", "vcLastName": "Silva"}),
    (
        "vcard",
        "com aspas e barras",
        {
            "vcFirstName": 'Ana "A"',
            "vcLastName": "Silva\\Costa",
            "vcOrg": "Empresa; Com, Separadores",
        },
    ),
]


def catalogo() -> dict:
    """As listas de campos de cada categoria, como o CLI as tem.

    **Sao a mesma lista duas vezes** — a do `types.js` e a do `qrcli.TIPOS` — e
    a `AGENTS.md` diz que duas listas do mesmo conjunto divergem em silencio. O
    sintoma seria um `--ssid` a escrever `ssid` em vez de `wifiSsid`, e o
    `WIFI:S:` a sair vazio **sem erro nenhum**: o comando responde, o ficheiro
    escreve-se, e o telefone nao se liga a nada.

    Por isso que o Node recebe tambem isto e compara com o `CATEGORIES`, e nao
    so com os payloads.
    """
    from cli.qrcli import TIPOS

    return {
        "categorias": list(CATEGORY_IDS),
        "campos_cli": {
            tipo: [c[1] for c in TIPOS[tipo]["campos"]] for tipo in TIPOS
        },
    }


def main() -> int:
    resultados = []

    for tipo, nome, campos in CASOS:
        try:
            payload = build(tipo, campos)
            resultados.append({"tipo": tipo, "nome": nome, "payload": payload, "erro": None})
        except Exception as e:  # noqa: BLE001 — o erro e' o que se quer ver
            resultados.append({"tipo": tipo, "nome": nome, "payload": None, "erro": str(e)})

    #
    # **A saida e' base64, e nao JSON cru**, e a razao e' o console.
    #
    # Um payload tem emojis e caracteres CJK, e o `execFileSync` do Node
    # **descodifica a saida com a codificacao da consola** — que no Windows e'
    # cp1252 e nao tem codificacao para nenhum dos dois. O resultado e' um
    # `UnicodeEncodeError` na posicao 29, que nao tem nada a ver com a
    # paridade e' a falha de uma verificacao que nunca chegou a correr.
    #
    # O base64 passa sempre, e a comparacao continua a ser **byte a byte**:
    # quem descodifica e' o Node, e quem compara sao as cadeias com os
    # caracteres todos.
    #
    # E nao se usa `ensure_ascii=True` como atalho, que resolveria o problema do
    # console mas **quebraria a verificacao**: o Node veria `\u00e7` em vez de
    # `ç`, e os dois lados teriam de ter o mesmo erro de escape para baterem. Um
    # teste que passa porque os dois lados falham da mesma maneira nao verifica
    # nada.
    # O `catalogo` vai no mesmo ficheiro, e nao noutro: um segundo `execFileSync`
    # seria uma segunda coisa que pode falhar em silencio, e o teste so
    # verificaria a primeira.
    saida = {"casos": resultados, "catalogo": catalogo()}

    bruto = json.dumps(saida, ensure_ascii=False).encode("utf-8")
    sys.stdout.write(base64.b64encode(bruto).decode("ascii"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
