using System.Text.Json;
using QrCodeGenerator.Core;

namespace QrCodeGenerator.Tests;

/// <summary>Carrega a spec partilhada — a mesma que a stack Python consome.</summary>
public sealed class SpecFixture
{
    public sealed record Vector(
        string Id,
        string Tipo,
        string Descricao,
        string Fonte,
        IReadOnlyDictionary<string, string> Campos,
        string Payload,
        int Bytes);

    private static readonly string SpecPath = FindSpec();

    public IReadOnlyList<Vector> Vectors { get; }

    public SpecFixture()
    {
        using var stream = File.OpenRead(SpecPath);
        using var json = JsonDocument.Parse(stream);

        var vectors = new List<Vector>();
        foreach (var v in json.RootElement.GetProperty("vectors").EnumerateArray())
        {
            var campos = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var p in v.GetProperty("campos").EnumerateObject())
                campos[p.Name] = ReadValue(p.Value);

            vectors.Add(new Vector(
                Id: v.GetProperty("id").GetString()!,
                Tipo: v.GetProperty("tipo").GetString()!,
                Descricao: v.GetProperty("descricao").GetString()!,
                Fonte: v.GetProperty("fonte").GetString()!,
                Campos: campos,
                Payload: v.GetProperty("payload").GetString()!,
                Bytes: v.GetProperty("bytes").GetInt32()));
        }

        Vectors = vectors;
    }

    /// <summary>Os campos da spec podem ser string, número ou booleano.</summary>
    private static string ReadValue(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString()!,
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Null => string.Empty,
        _ => element.ToString()
    };

    /// <summary>Constrói os campos da spec no modelo do C#.</summary>
    public static QrFields ToFields(IReadOnlyDictionary<string, string> campos)
    {
        string? Get(string key) => campos.TryGetValue(key, out var v) ? v : null;

        return new QrFields
        {
            PixKey = Get("key"),
            PixName = Get("name"),
            PixCity = Get("city"),
            PixAmount = Get("amount"),
            PixTxid = Get("txid"),
            PixDescription = Get("description"),
            PixPostcode = Get("postcode"),
            PixSingleUse = string.Equals(Get("single_use"), "true", StringComparison.OrdinalIgnoreCase)
        };
    }

    private static string FindSpec()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "spec", "vectors.json");
            if (File.Exists(candidate))
                return candidate;
            dir = dir.Parent;
        }

        throw new FileNotFoundException(
            "spec/vectors.json não encontrado. Afasta a spec para ../spec ou define SPEC_PATH.");
    }
}
