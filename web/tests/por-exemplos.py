"""
Poe os exemplos que faltam nos 32 campos das categorias de QR.

    python web/tests/por-exemplos.py

Porque um script e nao a edicao a mao
-------------------------------------

**Sao 32 campos, e todos numa lista so.** Um ficheiro com 32 entradas para
preencher e' um ficheiro em que e' facilissimo deixar uma de fora sem dar por
isso - e o sintoma e' o pior possivel, porque o campo fica vazio, sem erro, e
ninguem sabe que o sitio esta a pedir mais dados do que precisa.

Por isso o script **verifica depois de escrever**: conta os campos, conta os que
tem exemplo, e se os numeros nao baterem nao diz "feito" - da erro. E a razao de
os outros geradores de tabelas deste repositorio serem scripts: o mesmo motivo.

Os exemplos que entram
----------------------

**Todos tem de ser um valor que a validacao aceita**, e nao um que "parece
certo". Um exemplo que o proprio site recusa e' pior do que nenhum: quem escreve
o exemplo, o site diz que esta mal, e ela fica a achar que o exemplo estava
errado - quando o exemplo esta errado.

E **todos tem de ser reconheciveis como o que sao.** Um exemplo de telefone
comeca por `+351` e tem nove digitos; um de CEP tem o formato `1234-567`; um de
data e' `2026-09-29T18:30`. Um exemplo que nao se parece com o que a pessoa
vai escrever nao lhe ensina nada, e o `placeholder` deixa de fazer o seu
trabalho.
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
# `AQUI.parent` e' `web/`, e o ficheiro esta em `web/payloads/`. Com
# `parents[1]` saia-se para a raiz do repositorio, e o erro e' um
# `FileNotFoundError` a dizer que o caminho nao existe - que e' verdade, e nao
# ajuda nada: o caminho errado da sempre a mesma mensagem.
FICHEIRO = AQUI.parent / "payloads" / "types.js"

# Os exemplos, por `categoria.campo`. Escritos um a um porque um filtro e' uma
# lista implicita do que nao conta, e o proximo campo novo passaria a nao ter
# exemplo sem ninguem decidir.
EXEMPLOS = {
    # O texto solto e' o caso mais simples e o mais usado: e' o que vai para o
    # QR quando ninguem quer outra coisa. O exemplo tem de ser um texto que
    # qualquer pessoa reconheca como texto e nao como um campo de outra coisa.
    "texto.texto": "Encontro na biblioteca municipal, quinta-feira às 18h.",
    "email.mailSubject": "Reunião de sexta",
    "email.mailBody": "Confirmo a presença. Trago a documentação.",
    # O telefone leva o indicativo no campo de cima, e o exemplo do numero e'
    # **so o numero** - o indicativo e' outro campo e um exemplo com `+351` aqui
    # daria um numero com o indicativo em duplicado.
    "telefone.phoneNumber": "912 345 678",
    "sms.phoneNumber": "912 345 678",
    "sms.smsMessage": "Chego às 18h, está confirmado?",
    "whatsapp.phoneNumber": "912 345 678",
    "whatsapp.waMessage": "Chego às 18h, está confirmado?",
    "evento.eventTitle": "Aula de guionização",
    "evento.eventLocation": "Biblioteca municipal, sala 3",
    "evento.eventDescription": "Trazer caderno. Duas horas, com pausa.",
    "vcard.vcFirstName": "Ana",
    "vcard.vcLastName": "Silva",
    "vcard.vcPhone": "+351 912 345 678",
    "vcard.vcPhone2": "+351 213 456 789",
    "vcard.vcEmail": "ana.silva@exemplo.pt",
    "vcard.vcOrg": "Oficina de Reparação de Becos",
    "vcard.vcRole": "Técnica de manutenção",
    "vcard.vcStreet": "Rua da Bica 12, 3.º Esq",
    "vcard.vcCity": "Lisboa",
    "vcard.vcZip": "1200-401",
    "vcard.vcCountry": "Portugal",
    "pix.pixName": "Oficina de Reparação de Becos",
    "pix.pixCity": "Lisboa",
    # O txid e' o identificador da transacao, e a regra do PIX e' **ate 25
    # caracteres e sem acentos** - o exemplo em maiusculas e' o que o
    # utilizador vai escrever, porque e' o que os sistemas de PIX aceitam.
    "pix.pixTxid": "TXID-2026-0001",
    "pix.pixPostcode": "1200-401",
    "pix.pixDescription": "Reparação do telhão",
    # A rede e a password sao os dois campos que **nao podem ter exemplo
    # plausivel**: um SSID de exemplo seria `MinhaRede`, que e' o nome de uma
    # rede que nao existe, e a pessoa que copiasse o exemplo acabava com um QR
    # que nao liga a nada. Um `placeholder` de rede tem de ser **descritivo** —
    # "o nome da rede tal como aparece", "a password do router" — porque o
    # que se quer ensinar e' o formato, e nao um valor.
    "wifi.wifiSsid": "o nome da rede tal como aparece",
    "wifi.wifiPass": "a password do router",
}

# Os campos de data. `datetime-local` **nao aceita texto livre** - o browser
# mostra um selector e ignora o que nao parseia, e o `placeholder` de um
# `datetime-local` **nao aparece** em lado nenhum.
#
# Por isso o exemplo de uma data nao e' um placeholder: e' o **`value` inicial**,
# que e' a unica forma de o campo ter alguma coisa sem a pessoa ir ao calendario.
# E a hora tem de ser a **local**, sem fuso: o `datetime-local` nao guarda fuso,
# e um `value` com `Z` seria lido como UTC eHandlers aparecia com horas erradas.
DATAS = {
    "evento.eventStart": "18:30",
    "evento.eventEnd": "20:30",
}

# Campos que **nao** levam exemplo, e porque. Escritos um a um, porque um
# filtro e' uma lista implicita do que nao conta.
#
# O `select` do WiFi ja tem as opcoes a dizer o que e' - `WPA/WPA2`, `WEP`,
# `Aberto` - e um `placeholder` por cima das opcoes seria um quarto valor que
# nao existe. O `checkbox` e' um sim ou nao, e nao ha o que exemplified.
#
# A razao de este bloco existir e' o inverso do resto do ficheiro: aqui a
# ausencia do exemplo e' **correcta**, e e' preciso escrever porque e' para
# ninguem as acrescentar a seguir e estragar o campo.
SEM_EXEMPLO = {
    "wifi.wifiSec": "e' um select: as opcoes ja dizem o que e'",
    "wifi.wifiHidden": "e' um checkbox: nao ha o que exemplificar",
}



def aplicar(texto: str) -> tuple[str, int]:
    """Poe o exemplo no campo indicado. Devolve o texto e quantos foram."""
    aplicados = 0

    for chave, exemplo in EXEMPLOS.items():
        campo = chave.split(".")[1]

        # `{ key: 'mailSubject', label: 'Assunto' }` e a forma que ha.
        #
        # **O `label` NAO leva virgula dentro das aspas** - a virgula vem
        # depois do `}`. A primeira versao do padrao punha
        # `'[^']*',` e por isso nao casava com **nenhum** dos 32 campos, e a
        # mensagem era "nao encontrei o campo" para cada um - o que parece um
        # problema de caminho e nao de padrao, e fez-me ir ver o caminho.
        #
        # O padrao casa com o `key` e nao com a posicao: uma categoria com dois
        # campos sem `label` daria dois `, }` iguais, e o primeiro a ser
        # substituido seria o do campo errado.
        #
        # E o fecho aceita `}` ou `},` porque a ultima entrada de um `fields`
        # acaba em virgula, e um padrao que so aceite `}` nao a encontra.
        padrao = rf"(\{{ key: '{campo}',(?: label: '[^']*')?(?:, type: '\w+')?)(\s*\}},?)"
        novo, n = re.subn(padrao, rf"\1, placeholder: '{exemplo}'\2", texto, count=1)
        if n:
            texto = novo
            aplicados += 1
        else:
            print(f"  nao encontrei o campo {chave}")

    return texto, aplicados


def aplicar_datas(texto: str, hoje: str) -> tuple[str, int]:
    """As datas ficam em `value`, e nao em `placeholder`.

    **Um `datetime-local` nao mostra o `placeholder`.** Nao ha texto a meter: o
    browser mostra um selector, e o que la esta dentro e' o `value`. Por isso um
    `placeholder` num campo de data e' um exemplo que ninguem ve - e o sintoma
    e' o pior: o campo parece vazio e a pessoa nao sabe se e' bug ou se e' a
    forma certa.

    E a data e' de **hoje**, e nao uma data fixa. Um evento com a data no
    passado e' um QR que ninguem usa, e um com data de 2030 parece de outra
    pessoa. `hoje` entra como argumento para que o ficheiro gerado seja
    repetivel quando se quiser ver outra vez.
    """
    aplicados = 0

    for chave, hora in DATAS.items():
        campo = chave.split(".")[1]
        valor = f"{hoje}T{hora}"

        # O campo tem de levar `value: '...'` **e** `defaultValue`, e nao so o
        # `value`: o `value` e' o que o browser mostra, e o `defaultValue` e' o
        # que a interface desenha. Ver a nota do `app.js` sobre os dois.
        padrao = rf"(key: '{campo}',[^}}]*?)(\s*\}},?)"
        novo, n = re.subn(
            padrao,
            rf"\1, defaultValue: '{valor}'\2",
            texto,
            count=1,
        )
        if n:
            texto = novo
            aplicados += 1
        else:
            print(f"  nao encontrei o campo de data {chave}")

    return texto, aplicados


def conferir(texto: str) -> list[str]:
    """Conta o que tem exemplo e o que nao tem, depois da escrita."""
    problemas = []

    # Cada `{ key: '...', ... }` dentro de `fields`.
    #
    # **O `[^}]*` tem de ser DOTALL.** Sem o, o `[^}]*` parava no primeiro
    # `}` e o resto do campo ficava de fora - que e' por isso que o
    # `pixSingleUse`, que tem `type: 'checkbox'` **antes** de qualquer outro
    # `}`, aparecia como sem exemplo. Um verificador que ve o campo pela metade
    # da pior maneira que existe: da a razao errada.
    exemptos = {c.split(".")[1] for c in SEM_EXEMPLO}
    campos = re.findall(r"\{ key: '(\w+)'([^}]*)\}", texto, re.DOTALL)

    for chave, resto in campos:
        # O `checkbox` nunca precisa de exemplo: e' um sim ou nao.
        if "type: 'checkbox'" in resto or "options:" in resto:
            continue
        tem_exemplo = "placeholder" in resto or "defaultValue" in resto
        if not tem_exemplo and chave not in exemptos:
            problemas.append(f"{chave} sem exemplo e sem estar na lista do que nao precisa")

    if problemas:
        problemas.sort()

    return problemas


def main() -> int:
    hoje = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()

    original = FICHEIRO.read_text(encoding="utf-8")
    novo, aplicados = aplicar(original)
    novo, aplicadas = aplicar_datas(novo, hoje)

    if aplicados + aplicadas == 0:
        print("Nenhum campo foi alterado - a forma do ficheiro mudou e nao se vai adivinhar.")
        return 1

    problemas = conferir(novo)
    if problemas:
        for p in problemas:
            print(f"  {p}")
        print()
        print("Ficaram campos sem exemplo, e nao se vai escrever o ficheiro assim.")
        return 1

    FICHEIRO.write_text(novo, encoding="utf-8")
    print(f"{aplicados} campos com exemplo, {aplicadas} com data (a {hoje})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
