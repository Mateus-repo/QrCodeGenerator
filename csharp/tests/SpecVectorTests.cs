using QrCodeGenerator.Core;
using QrCodeGenerator.Core.Pix;
using Xunit;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nível 1 da paridade: os mesmos campos têm de produzir exatamente a mesma
/// string que a stack Python. Se esta teste falhar, uma das duas está errada.
/// </summary>
public class SpecVectorTests
{
    private readonly SpecFixture _spec = new();

    [Fact]
    public void A_spec_tem_o_tipo_pix()
    {
        Assert.Contains(_spec.Vectors, v => v.Tipo == "pix");
        Assert.True(_spec.Vectors.Count >= 10);
    }

    [Theory]
    [MemberData(nameof(PixVectors))]
    public void Bate_com_a_spec(string id, string expected)
    {
        var vector = _spec.Vectors.Single(v => v.Id == id);
        var fields = SpecFixture.ToFields(vector.Campos);

        var error = QrValidator.Validate(QrCategory.Pix, fields);
        Assert.Null(error);

        Assert.Equal(expected, QrPayloadBuilder.Build(QrCategory.Pix, fields));
    }

    public static TheoryData<string, string> PixVectors()
    {
        var spec = new SpecFixture();
        var data = new TheoryData<string, string>();
        foreach (var v in spec.Vectors.Where(v => v.Tipo == "pix"))
            data.Add(v.Id, v.Payload);
        return data;
    }

    [Theory]
    [MemberData(nameof(PixVectors))]
    public void Round_trip_preserva_o_payload(string id, string expected)
    {
        var vector = _spec.Vectors.Single(v => v.Id == id);
        var parsed = Pix.Parse(expected);

        Assert.True(parsed.CrcValid, $"CRC inválido em {id}");

        // O round-trip tem de devolver a mesma string — o que prova que o
        // que omite `parse` é reconstruível a partir do que `build` produziu.
        Assert.Equal(expected, Pix.Build(parsed.Payload));

        // E os campos normalizados têm de bater certo com a spec.
        Assert.Equal(PixKey.Validate(vector.Campos["key"]), parsed.Payload.Key);
    }

    [Theory]
    [MemberData(nameof(PixVectors))]
    public void Todos_os_comprimentos_declarados_batem(string id, string payload)
    {
        Assert.NotEmpty(id);
        AssertTlvLengths(payload, "");
    }

    private static void AssertTlvLengths(string data, string path)
    {
        var i = 0;
        while (i < data.Length)
        {
            var tag = data.Substring(i, 2);
            var declared = int.Parse(data.Substring(i + 2, 2));
            var value = data.Substring(i + 4, declared);

            Assert.Equal(declared, value.Length);

            if (tag is "26" or "62")
                AssertTlvLengths(value, $"{path}{tag}.");

            i += 4 + declared;
        }
    }

    [Fact]
    public void O_vetor_do_banco_central_esta_na_spec()
    {
        var vector = _spec.Vectors.Single(v => v.Id == "pix_uuid_sem_valor");
        Assert.EndsWith("63041D3D", vector.Payload, StringComparison.Ordinal);
        Assert.Contains("Banco Central", vector.Fonte, StringComparison.Ordinal);
    }
}
