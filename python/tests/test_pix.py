"""Testes do tipo PIX contra a spec partilhada.

Fontes de verdade:
- `spec/vectors.json` — vetores partilhados entre stacks
- CRC-16/CCITT-FALSE: vetor canónico `crc16("123456789") == 0x29B1`
- Exemplo publicado pelo Banco Central do Brasil
"""

import json
import re
from decimal import Decimal
from pathlib import Path

import pytest

from qrcode_core import pix
from qrcode_core import CATEGORY_IDS
from qrcode_core.pix import PixKeyError, PixPayload, PixValidationError

SPEC = json.loads((Path(__file__).resolve().parents[2] / "spec" / "vectors.json").read_text("utf-8"))
#: Todos os vectores, para os testes que procuram um `id` concreto.
VECTORS = {v["id"]: v for v in SPEC["vectors"]}

# --- Vetores de referência externos ---------------------------------------

#: Vetor canónico do algoritmo CRC-16/CCITT-FALSE.
CRC_CHECK_STRING = "123456789"
CRC_CHECK_VALUE = 0x29B1

#: Exemplo do Manual do BCB: chave aleatória, "Fulano de Tal", "BRASILIA".
BCB_KEY = "123e4567-e12b-12d1-a456-426655440000"
BCB_PAYLOAD = (
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000"
    "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D"
)


# --- Spec partilhada -------------------------------------------------------

#: Os vectores de PIX, e so. **A spec tem onze tipos desde que os vectores dos
#: dez de transporte foram escritos**, e o round-trip e os comprimentos declarados
#: so fazem sentido no PIX.
VECTORS_PIX = {v["id"]: v for v in SPEC["vectors"] if v["tipo"] == "pix"}


def test_spec_tem_os_onze_tipos():
    """
    **Cada tipo com pelo menos um vector.**

    Um tipo sem vector e' um tipo que ninguem sabe se esta certo: com a spec so a
    PIX, cada stack podia ter o `link` errado e nenhum teste dizia, porque nao
    havia com que comparar. Este Python era a implementacao de referencia e
    falhava exactamente nisso.
    """
    assert len(SPEC["tipos"]) == 11
    assert len(SPEC["vectors"]) >= 30

    vistos = {v["tipo"] for v in SPEC["vectors"]}
    for tipo in CATEGORY_IDS:
        assert tipo in vistos, f"a spec nao tem nenhum vector do tipo {tipo}"
    assert vistos == set(CATEGORY_IDS), "a spec tem tipos que a biblioteca nao conhece"


@pytest.mark.parametrize("vector_id", sorted(VECTORS_PIX))
def test_bate_com_a_spec(vector_id):
    """O contrato entre stacks: mesmos campos -> mesma string."""
    vector = VECTORS_PIX[vector_id]
    assert pix.build(PixPayload(**vector["campos"])) == vector["payload"]


@pytest.mark.parametrize("vector_id", sorted(VECTORS_PIX))
def test_comprimentos_declarados_batem(vector_id):
    """O comprimento é contado em caracteres — se divergir, o banco recusa."""
    _assert_tlv_lengths_consistent(VECTORS_PIX[vector_id]["payload"])


@pytest.mark.parametrize("vector_id", sorted(VECTORS_PIX))
def test_round_trip_pela_spec(vector_id):
    """
    **O round-trip so existe para o PIX**, porque so o PIX tem parser.

    Prova que o que omite o `parse` e' reconstruivel a partir do que o `build`
    produziu. Escrever um parser para "voltar a partir da string" de um link
    seria escrever um segundo encoder, e dois encoders errados concordam.
    """
    vector = VECTORS_PIX[vector_id]
    parsed = pix.parse(vector["payload"])
    assert parsed.crc_valid
    assert pix.build(parsed.payload) == vector["payload"]


def test_o_vetor_do_bcb_existe_na_spec():
    """O exemplo oficial tem de estar na spec, com o CRC 0x1D3D do manual."""
    vector = VECTORS["pix_uuid_sem_valor"]
    assert vector["payload"] == BCB_PAYLOAD
    assert "Banco Central" in vector["fonte"]


# --- CRC -------------------------------------------------------------------


def test_crc16_vetor_canonico():
    assert pix.crc16(CRC_CHECK_STRING) == CRC_CHECK_VALUE
    assert pix.crc16_hex(CRC_CHECK_STRING) == "29B1"


def test_crc16_exemplo_do_banco_central():
    assert pix.crc16_hex(BCB_PAYLOAD[:-4]) == "1D3D"


def test_crc16_deteta_um_caracter_alterado():
    altered = BCB_PAYLOAD[:-1] + ("0" if BCB_PAYLOAD[-1] != "0" else "1")
    assert pix.crc16_hex(altered[:-4]) != altered[-4:]


# --- Campos e normalização -------------------------------------------------


def test_nome_com_acento_normalizado():
    payload = pix.build(PixPayload(key=BCB_KEY, name="José Antônio Café", city="São Paulo"))
    assert "5917Jose Antonio Cafe" in payload  # 17 caracteres
    assert "6009Sao Paulo" in payload


def test_nome_acima_de_25_cortado():
    payload = pix.build(PixPayload(key=BCB_KEY, name="A" * 40, city="Recife"))
    assert "5925" + "A" * 25 in payload
    assert "A" * 26 not in payload


def test_cidade_acima_de_15_cortada():
    payload = pix.build(PixPayload(key=BCB_KEY, name="Ana", city="B" * 30))
    assert "6015" + "B" * 15 in payload


def test_espacos_duplos_colapsados():
    payload = pix.build(PixPayload(key=BCB_KEY, name="Ana   Maria", city="Recife"))
    assert "5909Ana Maria" in payload


def test_txid_sem_caracteres_validos_vira_placeholder():
    payload = pix.build(PixPayload(key=BCB_KEY, name="Ana", city="Recife", txid="#$%&"))
    assert "62070503***" in payload


def test_txid_com_espacos_limpo():
    payload = pix.build(PixPayload(key=BCB_KEY, name="Ana", city="Recife", txid="ped 12-34"))
    assert "62110507ped1234" in payload


def test_txid_longo_cortado():
    payload = pix.build(PixPayload(key=BCB_KEY, name="Ana", city="Recife", txid="a" * 40))
    # template 62 com 29 caracteres: "05" + "25" + 25 chars
    assert "62290525" + "a" * 25 in payload


def test_descricao_nunca_parte_o_teto_do_template():
    """Com a chave mais longa possível (36 chars) ainda sobra pouco espaço."""
    payload = pix.build(
        PixPayload(key=BCB_KEY, name="Ana", city="Recife", description="x" * 200)
    )
    template = _field(payload, "26")
    assert len(template) == 99
    assert BCB_KEY in template  # a chave nunca é cortada


def test_descricao_cortada_ao_espaco_disponivel():
    payload = pix.build(
        PixPayload(key=BCB_KEY, name="Ana", city="Recife", description="y" * 40)
    )
    template = _field(payload, "26")
    assert len(template) == 99
    # Sobram 99 - (4+14) - (4+36) - 4 = 37 caracteres para a descrição.
    assert template.endswith("02" + "37" + "y" * 37)


def test_valor_ausente_omite_campo_54():
    assert "5405" not in pix.build(PixPayload(key=BCB_KEY, name="Ana", city="Recife"))


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("25,75", "25.75"),
        ("25.75", "25.75"),
        ("25", "25.00"),
        ("0.01", "0.01"),
        ("1.234,56", "1234.56"),
        ("1234.56", "1234.56"),
        ("R$ 10,00", "10.00"),
        ("  7,5  ", "7.50"),
        ("1000", "1000.00"),
    ],
)
def test_parse_de_valores(raw, expected):
    assert pix.parse_amount(raw) == Decimal(expected)


def test_valor_negativo_rejeitado():
    with pytest.raises(PixValidationError):
        pix.parse_amount("-1,00")


def test_valor_lixo_rejeitado():
    with pytest.raises(PixValidationError, match="Valor"):
        pix.parse_amount("abc")


# --- Chave -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected", "kind"),
    [
        ("529.982.247-25", "52998224725", "cpf"),
        ("11.222.333/0001-81", "11222333000181", "cnpj"),
        (BCB_KEY, BCB_KEY, "random"),
        (BCB_KEY.upper(), BCB_KEY, "random"),
        ("+55 11 96666-6666", "+5511966666666", "phone"),
        ("55 11 96666 6666", "+5511966666666", "phone"),
        ("+5511966666666", "+5511966666666", "phone"),
        ("Fulano@Example.com", "fulano@example.com", "email"),
    ],
)
def test_chaves_validas(raw, expected, kind):
    assert pix.validate_key(raw) == expected
    assert pix.key_type(raw) == kind


@pytest.mark.parametrize(
    ("raw", "match"),
    [
        ("111.111.111-11", "CPF/CNPJ"),
        ("11.111.111/1111-11", "CPF/CNPJ"),
        ("11966666666", "CPF/CNPJ"),
        ("fulano@exemplo", "Email"),
        ("   ", "chave PIX"),
        ("não é chave", "Chave PIX inválida"),
    ],
)
def test_chaves_invalidas(raw, match):
    with pytest.raises(PixKeyError, match=match):
        pix.validate_key(raw)


def test_telefone_com_ddd_invalido():
    with pytest.raises(PixKeyError):
        pix.validate_key("+55 00 96666-6666")


# --- Campos obrigatórios ---------------------------------------------------


def test_nome_obrigatorio():
    with pytest.raises(PixValidationError, match="nome"):
        pix.build(PixPayload(key=BCB_KEY, name="   ", city="Recife"))


def test_cidade_obrigatoria():
    with pytest.raises(PixValidationError, match="cidade"):
        pix.build(PixPayload(key=BCB_KEY, name="Ana", city=""))


# --- Parsing / leitura -----------------------------------------------------


def test_parse_deteta_crc_invalido():
    broken = BCB_PAYLOAD[:-4] + "0000"
    assert pix.parse(broken).crc_valid is False


def test_parse_deteta_crc_alterado_em_um_digito():
    broken = BCB_PAYLOAD[:-1] + "0"
    assert pix.parse(broken).crc_valid is False


def test_fix_crc():
    assert pix.fix_crc(BCB_PAYLOAD[:-4] + "0000") == BCB_PAYLOAD


def test_fix_crc_remove_quebras_de_linha_mas_mantem_espacos():
    wrapped = "\n".join(re.findall(r".{1,40}", BCB_PAYLOAD))
    assert pix.fix_crc(wrapped) == BCB_PAYLOAD


def test_parse_rejeita_lixo():
    with pytest.raises(PixValidationError, match="PIX"):
        pix.parse("isto nao e um pix")


def test_parse_rejeita_gui_errado():
    """GUI trocado, com o mesmo comprimento e CRC recalculado."""
    wrong = BCB_PAYLOAD.replace("br.gov.bcb.pix", "br.gov.bcb.XXX")
    assert len(wrong) == len(BCB_PAYLOAD)
    with pytest.raises(PixValidationError, match="GUI"):
        pix.parse(pix.fix_crc(wrong))


def test_parse_da_erro_claro_em_payload_truncado():
    with pytest.raises(PixValidationError, match="truncado|comprimento"):
        pix.parse(BCB_PAYLOAD[:-20])


def test_parse_recusa_espacos_dentro_do_nome():
    """Regressão: um strip de whitespace genérico desalinhava os TLV."""
    with_spaces = pix.build(PixPayload(key=BCB_KEY, name="Ana Maria", city="Recife"))
    assert "5909Ana Maria" in with_spaces
    assert pix.parse(with_spaces).payload.name == "Ana Maria"


# --- Utilitários -----------------------------------------------------------


def _field(brcode: str, tag: str) -> str:
    start = brcode.index(tag) + 4
    length = int(brcode[start - 2 : start])
    return brcode[start : start + length]


def _assert_tlv_lengths_consistent(data: str, path: str = "") -> None:
    index = 0
    while index < len(data):
        tag = data[index : index + 2]
        declared = int(data[index + 2 : index + 4])
        value = data[index + 4 : index + 4 + declared]
        assert len(value) == declared, f"campo {path}{tag} com comprimento errado"
        if tag in ("26", "62"):  # templates: parse recursivo
            _assert_tlv_lengths_consistent(value, f"{path}{tag}.")
        index += 4 + declared
