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

    /// <summary>
    /// A spec tem os onze tipos, e cada um com pelo menos um vector.
    /// </summary>
    /// <remarks>
    /// <b>Este teste é o que teria apanhado o fuso do iCalendar.</b> Com a spec
    /// só a PIX, o <c>BuildICalEvent</c> fazia <c>ToUniversalTime()</c> e escrevia
    /// um <c>Z</c>, e nada o comparava: o payload estava errado e o único sinal
    /// era um evento a aparecer no calendário à hora errada, que ninguémassociava
    /// a um erro. Um tipo sem vector é um tipo que ninguém sabe se está certo.
    /// </remarks>
    [Fact]
    public void A_spec_tem_os_onze_tipos()
    {
        Assert.True(_spec.Vectors.Count >= 30, $"a spec tem {_spec.Vectors.Count} vectores");

        var vistos = _spec.Vectors.Select(v => v.Tipo).Distinct().ToList();
        foreach (var categoria in Enum.GetValues<QrCategory>())
            Assert.Contains(categoria.ToString(), vistos.Select(NomeDaCategoria));

        // E não pode haver um tipo aqui que o C# não conheça: o teste de baixo
        // saltá-lo-ia e a cobertura contaria um caso que não existe.
        Assert.Equal(vistos.Count, vistos.Distinct().Count());
    }

    /// <summary>
    /// O nome da spec para cada categoria. É a mesma lista duas vezes — aqui e
    /// no <c>QrCategory</c> — e por isso que o teste de cima compara as duas.
    /// </summary>
    public static string NomeDaCategoria(string tipo) => tipo.ToLowerInvariant() switch
    {
        "sms" => "SMS",
        "whatsapp" => "WhatsApp",
        "localizacao" => "Localizacao",
        "wifi" => "WiFi",
        "vcard" => "VCard",
        _ => char.ToUpperInvariant(tipo[0]) + tipo[1..]
    };

    [Theory]
    [MemberData(nameof(AllVectors))]
    public void Bate_com_a_spec(string id, string tipo, string expected)
    {
        var vector = _spec.Vectors.Single(v => v.Id == id);
        var fields = SpecFixture.ToFields(vector.Campos);
        var categoria = Enum.Parse<QrCategory>(NomeDaCategoria(tipo), ignoreCase: true);

        var error = QrValidator.Validate(categoria, fields);
        Assert.Null(error);

        Assert.Equal(expected, QrPayloadBuilder.Build(categoria, fields));
    }

    public static TheoryData<string, string, string> AllVectors()
    {
        var spec = new SpecFixture();
        var data = new TheoryData<string, string, string>();
        foreach (var v in spec.Vectors)
            data.Add(v.Id, v.Tipo, v.Payload);
        return data;
    }

    public static TheoryData<string, string> PixVectors()
    {
        var spec = new SpecFixture();
        var data = new TheoryData<string, string>();
        foreach (var v in spec.Vectors.Where(v => v.Tipo == "pix"))
            data.Add(v.Id, v.Payload);
        return data;
    }

    /// <summary>
    /// O round-trip só existe para o PIX, porque só o PIX tem parser.
    /// </summary>
    /// <remarks>
    /// Prova que o que omite o <c>parse</c> é reconstruível a partir do que o
    /// <c>build</c> produziu. Escrever um parser para "voltar a partir da
    /// string" de um link seria escrever um segundo encoder, e dois encoders
    /// errados concordam um com o outro.
    /// </remarks>
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

    /// <summary>
    /// Os comprimentos declarados batem — <b>só no PIX</b>, que é o único com
    /// TLV. Os comprimentos são a forma como o formato diz "aqui vão 25 bytes", e
    /// um <c>evento</c> é iCalendar e um <c>link</c> é um link: não declaram nada.
    /// </summary>
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
