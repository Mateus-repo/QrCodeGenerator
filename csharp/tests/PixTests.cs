using QrCodeGenerator.Core;
using QrCodeGenerator.Core.Pix;
using Xunit;

namespace QrCodeGenerator.Tests;

public class PixTests
{
    private const string BcbKey = "123e4567-e12b-12d1-a456-426655440000";

    private const string BcbPayload =
        "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
        "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

    // --- CRC ---------------------------------------------------------------

    [Fact]
    public void Crc16_tem_o_vetor_canonico()
    {
        Assert.Equal(0x29B1, Crc16.Of("123456789"));
        Assert.Equal("29B1", Crc16.Hex("123456789"));
    }

    [Fact]
    public void Crc16_bate_com_o_exemplo_do_banco_central()
    {
        Assert.Equal("1D3D", Crc16.Hex(BcbPayload[..^4]));
    }

    [Fact]
    public void Exemplo_oficial_do_banco_central()
    {
        var payload = new PixPayload
        {
            Key = BcbKey,
            Name = "Fulano de Tal",
            City = "BRASILIA"
        };

        Assert.Equal(BcbPayload, Pix.Build(payload));
    }

    // --- Campos ------------------------------------------------------------

    [Fact]
    public void Nome_com_acento_normalizado()
    {
        var brcode = Pix.Build(new PixPayload
        {
            Key = BcbKey, Name = "José Antônio Café", City = "São Paulo"
        });

        Assert.Contains("5917Jose Antonio Cafe", brcode, StringComparison.Ordinal);
        Assert.Contains("6009Sao Paulo", brcode, StringComparison.Ordinal);
    }

    [Fact]
    public void Nome_acima_de_25_cortado()
    {
        var brcode = Pix.Build(new PixPayload { Key = BcbKey, Name = new string('A', 40), City = "Recife" });
        Assert.Contains("5925" + new string('A', 25), brcode, StringComparison.Ordinal);
    }

    [Fact]
    public void Espacos_duplos_colapsados()
    {
        var brcode = Pix.Build(new PixPayload { Key = BcbKey, Name = "Ana   Maria", City = "Recife" });
        Assert.Contains("5909Ana Maria", brcode, StringComparison.Ordinal);
    }

    [Fact]
    public void Txid_invalido_vira_placeholder()
    {
        var brcode = Pix.Build(new PixPayload { Key = BcbKey, Name = "Ana", City = "Recife", Txid = "#$%&" });
        Assert.Contains("62070503***", brcode, StringComparison.Ordinal);
    }

    [Fact]
    public void Txid_longo_cortado()
    {
        var brcode = Pix.Build(new PixPayload { Key = BcbKey, Name = "Ana", City = "Recife", Txid = new string('a', 40) });
        Assert.Contains("62290525" + new string('a', 25), brcode, StringComparison.Ordinal);
    }

    [Fact]
    public void Descricao_nunca_parte_o_teto_do_template()
    {
        var brcode = Pix.Build(new PixPayload
        {
            Key = BcbKey, Name = "Ana", City = "Recife", Description = new string('x', 200)
        });

        var template = Field(brcode, "26");
        Assert.Equal(PixPayload.MaxTemplate26, template.Length);
        Assert.Contains(BcbKey, template, StringComparison.Ordinal);
    }

    [Fact]
    public void Descricao_cortada_ao_espaco_disponivel()
    {
        var brcode = Pix.Build(new PixPayload
        {
            Key = BcbKey, Name = "Ana", City = "Recife", Description = new string('y', 40)
        });

        // 99 - (4+14) - (4+36) - 4 = 37 caracteres
        Assert.EndsWith("02" + "37" + new string('y', 37), Field(brcode, "26"), StringComparison.Ordinal);
    }

    [Fact]
    public void Valor_ausente_omite_o_campo_54()
    {
        var brcode = Pix.Build(new PixPayload { Key = BcbKey, Name = "Ana", City = "Recife" });
        Assert.DoesNotContain("5405", brcode, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("25,75", 25.75)]
    [InlineData("25.75", 25.75)]
    [InlineData("25", 25.00)]
    [InlineData("0.01", 0.01)]
    [InlineData("1.234,56", 1234.56)]
    [InlineData("1234.56", 1234.56)]
    [InlineData("R$ 10,00", 10.00)]
    [InlineData("  7,5  ", 7.50)]
    [InlineData("1000", 1000.00)]
    public void Parse_de_valores(string raw, double expected)
    {
        Assert.Equal((decimal)expected, Pix.ParseAmount(raw));
    }

    [Fact]
    public void Valor_negativo_rejeitado()
    {
        Assert.Throws<PixException>(() => Pix.ParseAmount("-1,00"));
    }

    // --- Chave -------------------------------------------------------------

    [Theory]
    [InlineData("529.982.247-25", "52998224725")]
    [InlineData("11.222.333/0001-81", "11222333000181")]
    [InlineData("+55 11 96666-6666", "+5511966666666")]
    [InlineData("55 11 96666 6666", "+5511966666666")]
    [InlineData("+5511966666666", "+5511966666666")]
    [InlineData("Fulano@Example.com", "fulano@example.com")]
    [InlineData("123E4567-E12B-12D1-A456-426655440000", "123e4567-e12b-12d1-a456-426655440000")]
    public void Chaves_validas(string raw, string expected)
    {
        Assert.Equal(expected, PixKey.Validate(raw));
    }

    [Theory]
    [InlineData("529.982.247-25", PixKeyType.Cpf)]
    [InlineData("11.222.333/0001-81", PixKeyType.Cnpj)]
    [InlineData("+5511966666666", PixKeyType.Phone)]
    [InlineData("fulano@example.com", PixKeyType.Email)]
    [InlineData("123e4567-e12b-12d1-a456-426655440000", PixKeyType.Random)]
    public void Tipo_de_chave(string raw, PixKeyType expected)
    {
        Assert.Equal(expected, PixKey.TypeOf(raw));
    }

    [Theory]
    [InlineData("111.111.111-11", "CPF/CNPJ")]
    [InlineData("11.111.111/1111-11", "CPF/CNPJ")]
    [InlineData("11966666666", "CPF/CNPJ")]
    [InlineData("fulano@exemplo", "Email")]
    [InlineData("   ", "chave PIX")]
    [InlineData("não é chave", "Chave PIX inválida")]
    public void Chaves_invalidas(string raw, string expectedMessage)
    {
        var ex = Assert.Throws<PixException>(() => PixKey.Validate(raw));
        Assert.Contains(expectedMessage, ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Cpf_com_digitos_errados()
    {
        Assert.False(PixKey.IsValidCpf("11111111111"));
        Assert.True(PixKey.IsValidCpf("52998224725"));
    }

    [Fact]
    public void Cnpj_com_digitos_errados()
    {
        Assert.True(PixKey.IsValidCnpj("11222333000181"));
        Assert.False(PixKey.IsValidCnpj("11111111111111"));
    }

    // --- Obrigatórios ------------------------------------------------------

    [Fact]
    public void Nome_obrigatorio()
    {
        Assert.Throws<PixException>(() =>
            Pix.Build(new PixPayload { Key = BcbKey, Name = "  ", City = "Recife" }));
    }

    [Fact]
    public void Cidade_obrigatoria()
    {
        Assert.Throws<PixException>(() =>
            Pix.Build(new PixPayload { Key = BcbKey, Name = "Ana", City = "" }));
    }

    // --- Leitura -----------------------------------------------------------

    [Fact]
    public void Parse_deteta_crc_invalido()
    {
        Assert.False(Pix.Parse(BcbPayload[..^4] + "0000").CrcValid);
    }

    [Fact]
    public void Fix_crc()
    {
        Assert.Equal(BcbPayload, Pix.FixCrc(BcbPayload[..^4] + "0000"));
    }

    [Fact]
    public void Fix_crc_remove_quebras_de_linha_mas_mantem_espacos()
    {
        var wrapped = string.Join('\n', Chunk(BcbPayload, 40));
        Assert.Equal(BcbPayload, Pix.FixCrc(wrapped));
    }

    [Fact]
    public void Parse_rejeita_lixo()
    {
        Assert.Throws<PixException>(() => Pix.Parse("isto nao e um pix"));
    }

    [Fact]
    public void Parse_rejeita_gui_errado()
    {
        var wrong = BcbPayload.Replace("br.gov.bcb.pix", "br.gov.bcb.XXX", StringComparison.Ordinal);
        Assert.Equal(BcbPayload.Length, wrong.Length);

        var ex = Assert.Throws<PixException>(() => Pix.Parse(Pix.FixCrc(wrong)));
        Assert.Contains("GUI", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Parse_da_erro_claro_em_payload_truncado()
    {
        var ex = Assert.Throws<PixException>(() => Pix.Parse(BcbPayload[..^20]));
        Assert.Contains("comprimento", ex.Message, StringComparison.Ordinal);
    }

    /// <summary>Regressão: um strip de whitespace genérico desalinhava os TLV.</summary>
    [Fact]
    public void Espacos_dentro_do_nome_sao_preservados()
    {
        var brcode = Pix.Build(new PixPayload { Key = BcbKey, Name = "Ana Maria", City = "Recife" });
        Assert.Contains("5909Ana Maria", brcode, StringComparison.Ordinal);
        Assert.Equal("Ana Maria", Pix.Parse(brcode).Payload.Name);
    }

    // --- Utilitários -------------------------------------------------------

    private static string Field(string brcode, string tag)
    {
        var start = brcode.IndexOf(tag, StringComparison.Ordinal) + 4;
        var length = int.Parse(brcode.Substring(start - 2, 2));
        return brcode.Substring(start, length);
    }

    private static IEnumerable<string> Chunk(string value, int size)
    {
        for (var i = 0; i < value.Length; i += size)
            yield return value.Substring(i, Math.Min(size, value.Length - i));
    }
}
