using System.Globalization;
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

    /// <summary>
    /// Constrói os campos da spec no modelo do C#.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>O PIX é uma tradução e os outros dez não.</b> Os campos do PIX chamam-se
    /// <c>key</c>, <c>name</c> e <c>city</c> — são os do <c>PixPayload</c> do Banco
    /// Central, não os da interface, e é a razão de serem oito linhas. Os dez
    /// tipos de transporte usam os campos do navegador tal como estão, e por isso
    /// que o resto deste método é atribuição directa.
    /// </para>
    /// <para>
    /// <b>A data do evento é lida como <see cref="DateTimeKind.Unspecified"/>, e
    /// não é um detalhe.</b> A spec traz <c>"2026-09-29T18:30"</c>, sem fuso,
    /// porque o <c>datetime-local</c> da interface não tem fuso. Um
    /// <c>DateTime</c> com <c>Kind</c> não especificado é o que corresponde a
    /// isso; converter para UTC punha uma hora a mais no payload.
    /// </para>
    /// </remarks>
    public static QrFields ToFields(IReadOnlyDictionary<string, string> campos)
    {
        string? Get(string key) => campos.TryGetValue(key, out var v) ? v : null;
        bool Flag(string key) => string.Equals(Get(key), "true", StringComparison.OrdinalIgnoreCase);

        static DateTime? When(string? raw) =>
            // `DateTimeStyles.AssumeLocal` sem fuso: o `ParseExact` sem
            // `AdjustToUniversal` devolve `Unspecified`, que é o que se quer.
            // Com `AdjustToUniversal` o Kind passava a `Utc` e o `Stamp` do
            // iCalendar escrevia um `Z` que não estava escrito em lado nenhum.
            DateTime.TryParseExact(
                raw, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var d) ? d : null;

        return new QrFields
        {
            // Transporte: os nomes são os do navegador.
            Url = Get("url"),
            Texto = Get("texto"),
            MailTo = Get("mailTo"),
            MailSubject = Get("mailSubject"),
            MailBody = Get("mailBody"),
            PhonePrefix = Get("phonePrefix"),
            PhoneNumber = Get("phoneNumber"),
            SmsMessage = Get("smsMessage"),
            WaMessage = Get("waMessage"),
            EventTitle = Get("eventTitle"),
            EventDescription = Get("eventDescription"),
            EventLocation = Get("eventLocation"),
            EventStart = When(Get("eventStart")) ?? default,
            EventEnd = When(Get("eventEnd")) ?? default,
            GeoLat = Number(Get("geoLat")),
            GeoLng = Number(Get("geoLng")),
            WifiSsid = Get("wifiSsid"),
            WifiPass = Get("wifiPass"),
            WifiSec = Get("wifiSec"),
            WifiHidden = Flag("wifiHidden"),
            VcFirstName = Get("vcFirstName"),
            VcLastName = Get("vcLastName"),
            VcPhone = Get("vcPhone"),
            VcPhone2 = Get("vcPhone2"),
            VcEmail = Get("vcEmail"),
            VcOrg = Get("vcOrg"),
            VcRole = Get("vcRole"),
            VcStreet = Get("vcStreet"),
            VcCity = Get("vcCity"),
            VcZip = Get("vcZip"),
            VcCountry = Get("vcCountry"),

            // O PIX: os nomes são os do PixPayload.
            PixKey = Get("key"),
            PixName = Get("name"),
            PixCity = Get("city"),
            PixAmount = Get("amount"),
            PixTxid = Get("txid"),
            PixDescription = Get("description"),
            PixPostcode = Get("postcode"),
            PixSingleUse = Flag("single_use")
        };
    }

    /// <summary>
    /// Um número da spec, com vírgula ou ponto decimal.
    /// </summary>
    /// <remarks>
    /// <b>A vírgula conta, porque o formulário aceita as duas.</b> O campo da
    /// latitude é escrito <c>38,7223</c> por quem está em Portugal, e um
    /// <c>double.TryParse</c> com a cultura invariante dava <c>null</c> — e um
    /// <c>null</c> silencioso é pior do que um erro, porque o payload saía com
    /// <c>geo:</c> e nada mais.
    /// </remarks>
    private static double? Number(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = raw.Replace(',', '.');
        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
            ? d
            : null;
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
