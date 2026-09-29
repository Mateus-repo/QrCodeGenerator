"""Os dez tipos de transporte, e os casos que os cobrem na spec.

    python spec/gerar-vectors.py

## Porque esta lista existe e o que ela promete

**A spec é o arbitro** — o `AGENTS.md` é explicito sobre isso — e um arbrito sem
casos não decide nada. Com dez vectores de PIX e zero dos outros dez, cada stack
podia ter o `link` errado e nenhum teste dizia: ninguém comparava. Estes casos
são o que fecha isso.

**E não é a lista do `paridade-python.mjs`, nem devia ser.** Aquela corre 26
casos nos dois lados para apanhar uma divergência enquanto se escreve; esta é a
lista publicada, e é mais curta porque nem tudo o que apanha um bug interessa a
quem vai ler a spec. As duas cobrem os mesmoscasos que importam — o `;` no
título de um evento, a `,` num SSID, a ligadura do `cœur` — e nenhuma das duas
pode encolher sem a outra encolher também, que é o motivo de o `tipo` e os
`id` não terem números: um caso que muda de sítio não muda de nome.

## A convenção dos nomes dos campos, e porque é misto

**Os dez tipos usam os campos do navegador tal como estão** — `url`, `mailTo`,
`wifiSsid`, `vcFirstName`. São os mesmos nomes que o `QrFields` do C# e do Java
já tem, e que o `types.js` e o `qrcode_core.tipos` já usam. Escrever uma
segunda grafia seria uma tradução a mais e um sítio onde as stacks divergem sem
darem conta.

**O PIX é a excepção, e é uma excepção com motivo:** os campos chamam-se `key`,
`name`, `city`, e são os do `PixPayload` do Banco Central, não os da interface.
Traduzir `pixKey` para `key` na spec só por uniformidade seria pôr uma
tradução entre a spec e a verdade do PIX.

## O que um caso tem de ter, senão não prova nada

Um caso que dá `Exception` apanha um encoder partido. **Um caso com um `;`, uma
`,` ou uma ligadura apanha um encoder partido de uma maneira que produz um
payload que parece certo** — que é o que interessa, porque o que o ZXing lê
continua a ler-se e o telefone mostra o campo cortado. Por isso que os
casos difíceis estão aqui e não num caso limpo:

  - o `evento` com `:` e `,` no título;
  - o `wifi` com `;` e `,` no SSID e na password;
  - o `vcard` com barras invertidas e aspas no nome;
  - o `texto` com ligadura, que dava `cur` nas duas stacks ao mesmo tempo.
"""

from __future__ import annotations

#: Os casos, por tipo. O `id` é o mesmo em todas as cópias desta lista, e é o
#: que o `paridade-python.mjs` e o `qrcode.test.mjs` referem.
CASOS: list[dict] = [
    # --- link ---------------------------------------------------------------
    {
        "id": "link_sem_esquema",
        "tipo": "link",
        "desc": "Link sem esquema: o https e' acrescentado.",
        "campos": {"url": "exemplo.pt"},
    },
    {
        "id": "link_com_esquema",
        "tipo": "link",
        "desc": "Link ja com esquema e com query string.",
        "campos": {"url": "https://exemplo.pt/caminho?a=1&b=2"},
    },
    # --- texto --------------------------------------------------------------
    {
        "id": "texto_simples",
        "tipo": "texto",
        "desc": "Texto simples.",
        "campos": {"texto": "Peca 4471, lote A1"},
    },
    {
        "id": "texto_com_acentos",
        "tipo": "texto",
        "desc": "Acentos, travessao e euro ficam tal como estao: o `texto` nao normaliza.",
        "campos": {"texto": "Peça-francesa — cœur — 30 €"},
    },
    {
        "id": "texto_com_quebras",
        "tipo": "texto",
        "desc": "Quebras de linha sao duas caracteres da cadeia, e nao o fim de linha do iCalendar.",
        "campos": {"texto": "linha um\nlinha dois"},
    },
    # --- email --------------------------------------------------------------
    {
        "id": "email_so_destinatario",
        "tipo": "email",
        "desc": "Sem assunto e sem corpo nao ha interrogacao: um `mailto:` com `?` e nada depois abre mal.",
        "campos": {"mailTo": "ana@exemplo.pt"},
    },
    {
        "id": "email_com_assunto",
        "tipo": "email",
        "desc": "O espaco do assunto vai por `%20` e nao por `+`, como o `encodeURIComponent`.",
        "campos": {
            "mailTo": "ana@exemplo.pt",
            "mailSubject": "Reunião de sexta & balanço",
            "mailBody": "Confirmo a presença. Traz a documentação.",
        },
    },
    # --- telefone -----------------------------------------------------------
    {
        "id": "telefone_com_indicativo",
        "tipo": "telefone",
        "desc": "O indicativo entra e os separadores do numero saem.",
        "campos": {"phonePrefix": "+351", "phoneNumber": "912 345 678"},
    },
    {
        "id": "telefone_indicativo_em_00",
        "tipo": "telefone",
        "desc": "`00` vira `+` em qualquer posicao, e nao so no inicio.",
        "campos": {"phonePrefix": "00351", "phoneNumber": "912345678"},
    },
    # --- sms ----------------------------------------------------------------
    {
        "id": "sms_com_mensagem",
        "tipo": "sms",
        "desc": (
            "O corpo do SMSTO vai ate ao fim da cadeia, depois do segundo `:`. "
            "A mensagem **nao tem acentos**: o `a` com til nao existe no GSM 03.38, "
            "e a propria validacao desta stack recusa o caso."
        ),
        "campos": {
            "phonePrefix": "+351",
            "phoneNumber": "912345678",
            "smsMessage": "Chego as 18h, traz o caderno (2).",
        },
    },
    {
        "id": "sms_sem_mensagem",
        "tipo": "sms",
        "desc": "Sem mensagem fica `SMSTO:<numero>:`, e o `:` final continua a la.",
        "campos": {"phonePrefix": "+351", "phoneNumber": "912345678"},
    },
    # --- whatsapp -----------------------------------------------------------
    {
        "id": "whatsapp_so_numero",
        "tipo": "whatsapp",
        "desc": "O `wa.me` so aceita digitos, e o `+` do indicativo desaparece.",
        "campos": {"phonePrefix": "+351", "phoneNumber": "912 345 678"},
    },
    {
        "id": "whatsapp_com_mensagem",
        "tipo": "whatsapp",
        "desc": "A mensagem vai por percent-encoding, e nao por `+`.",
        "campos": {
            "phonePrefix": "+351",
            "phoneNumber": "912345678",
            "waMessage": "Olá & bom dia",
        },
    },
    # --- evento -------------------------------------------------------------
    {
        "id": "evento_com_separadores",
        "tipo": "evento",
        "desc": "A virgula e o ponto-e-virgula do titulo tem de estar escapados, e o `:` nao.",
        "campos": {
            "eventTitle": "Aula: guionização, nível 2",
            "eventStart": "2026-09-29T18:30",
            "eventEnd": "2026-09-29T20:30",
            "eventLocation": "Biblioteca municipal, sala 3",
            "eventDescription": "Trazer caderno. Duas horas; com pausa.",
        },
    },
    {
        "id": "evento_com_barras",
        "tipo": "evento",
        "desc": "Barras invertidas e caracteres CJK. A hora sai como foi escrita, sem fuso.",
        "campos": {
            "eventTitle": "路径 \\ e barra",
            "eventStart": "2026-01-01T09:00",
            "eventEnd": "2026-01-01T10:00",
        },
    },
    # --- localizacao --------------------------------------------------------
    {
        "id": "localizacao_simples",
        "tipo": "localizacao",
        "desc": "Coordenada tal como se escreve.",
        "campos": {"geoLat": "38.7223", "geoLng": "-9.1393"},
    },
    {
        "id": "localizacao_virgula_decimal",
        "tipo": "localizacao",
        "desc": "A virgula decimal do formulario e' aceite e o ponto e' que sai.",
        "campos": {"geoLat": "38,7223", "geoLng": "-9,1393"},
    },
    {
        "id": "localizacao_muitas_casas",
        "tipo": "localizacao",
        "desc": "Arredonda a sete casas e tira o zero final, e nao em notacao cientifica.",
        "campos": {"geoLat": "38.722312345678", "geoLng": "-9.139312345678"},
    },
    # --- wifi ---------------------------------------------------------------
    {
        "id": "wifi_com_password",
        "tipo": "wifi",
        "desc": "Rede fechada, com o terminador vazio que o formato exige.",
        "campos": {"wifiSsid": "Rede Casa", "wifiSec": "WPA/WPA2", "wifiPass": "segredo123"},
    },
    {
        "id": "wifi_aberta_oculta",
        "tipo": "wifi",
        "desc": "Rede aberta nao tem `P:`, e a oculta tem `H:true;`.",
        "campos": {"wifiSsid": "Rede Aberta", "wifiSec": "Aberto", "wifiHidden": True},
    },
    {
        "id": "wifi_ssid_com_separadores",
        "tipo": "wifi",
        "desc": "O `;` e a `,` do SSID e da password tem de estar escapados, ou o `P:` e' lido como parte do nome.",
        "campos": {
            "wifiSsid": "Rede; Com, Separadores",
            "wifiSec": "WPA/WPA2",
            "wifiPass": "p;ass",
        },
    },
    # --- vcard --------------------------------------------------------------
    {
        "id": "vcard_completo",
        "tipo": "vcard",
        "desc": "A ADR e' `caixa;extensao;rua;localidade;regiao;codigo-postal;pais` — a cidade e' a quarta.",
        "campos": {
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
    },
    {
        "id": "vcard_so_o_nome",
        "tipo": "vcard",
        "desc": "O `N` e' `familia;nome;extra;prefixo;sufixo`, e a familia vem primeiro.",
        "campos": {"vcFirstName": "Ana", "vcLastName": "Silva"},
    },
    {
        "id": "vcard_com_barras_e_aspas",
        "tipo": "vcard",
        "desc": "A barra invertida escapa-se e as aspas nao: o vCard so escapa `\\`, `;` e `,`.",
        "campos": {
            "vcFirstName": 'Ana "A"',
            "vcLastName": "Silva\\Costa",
            "vcOrg": "Empresa; Com, Separadores",
        },
    },
]
