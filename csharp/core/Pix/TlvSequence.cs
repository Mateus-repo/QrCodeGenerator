namespace QrCodeGenerator.Core.Pix;

/// <summary>
/// Campo TLV do BR Code: identificador de 2 dígitos, comprimento de 2 dígitos
/// (com zeros à esquerda) e valor.
/// </summary>
public readonly record struct Tlv(string Id, string Value)
{
    public override string ToString() => $"{Id}{Value.Length:00}{Value}";
}

/// <summary>Leitor/escritor de sequências TLV. Os campos 26 e 62 são templates.</summary>
public static class TlvSequence
{
    /// <summary>Concatena campos <c>(id, valor)</c> numa string BR Code.</summary>
    public static string Build(params (string Id, string Value)[] fields) =>
        string.Concat(fields.Select(f => new Tlv(f.Id, f.Value).ToString()));

    /// <summary>
    /// Lê uma sequência TLV, validando cada comprimento declarado.
    /// </summary>
    public static IReadOnlyList<Tlv> Parse(string data)
    {
        var fields = new List<Tlv>();
        var i = 0;

        while (i < data.Length)
        {
            if (i + 4 > data.Length)
                throw new PixException("Payload truncado (TLV incompleto).");

            var id = data.Substring(i, 2);
            if (!id.All(char.IsDigit))
                throw new PixException($"Tag inválida: '{id}'.");

            var rawLength = data.Substring(i + 2, 2);
            if (!rawLength.All(char.IsDigit))
                throw new PixException($"Campo {id} tem comprimento inválido: '{rawLength}'.");

            var length = int.Parse(rawLength);
            var value = data.Substring(i + 4, Math.Min(length, data.Length - i - 4));
            if (value.Length != length)
                throw new PixException(
                    $"Campo {id} tem comprimento declarado {length} mas contém {value.Length} " +
                    "caracteres — payload truncado ou corrompido.");

            fields.Add(new Tlv(id, value));
            i += 4 + length;
        }

        return fields;
    }

    /// <summary>Lê uma sequência TLV e devolve os campos por identificador.</summary>
    public static IReadOnlyDictionary<string, string> ParseToMap(string data) =>
        Parse(data).ToDictionary(f => f.Id, f => f.Value, StringComparer.Ordinal);
}
