using System.Globalization;
using System.Text.RegularExpressions;

namespace QrCodeGenerator.Core.Pix;

/// <summary>Leitura de um BR Code já existente.</summary>
public sealed class ParsedPix
{
    public required PixPayload Payload { get; init; }
    public required bool CrcValid { get; init; }
    public required string Raw { get; init; }
    public string? PointOfInitiation { get; init; }
    public string? Url { get; init; }
}

/// <summary>Geração e leitura de payloads PIX (BR Code, EMV-QRCPS-MPM).</summary>
public static class Pix
{
    private const string CrcTag = "6304";
    private static readonly Regex Thousands = new(@"\.\d{3}(?!\d)", RegexOptions.Compiled);

    // --- Valor ------------------------------------------------------------

    /// <summary>
    /// Aceita <c>25,75</c> (pt-BR) e <c>25.75</c>. O ponto só é separador de
    /// milhar quando seguido de exatamente 3 dígitos e não no fim do valor.
    /// </summary>
    public static decimal? ParseAmount(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var text = Text.ToAscii(raw).Trim().Replace("R$", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace(" ", string.Empty);

        if (text.Length == 0)
            return null;

        if (text.Contains(','))
        {
            text = text.Replace(".", string.Empty).Replace(',', '.');
        }
        else if (Thousands.IsMatch(text))
        {
            text = text.Replace(".", string.Empty);
        }

        if (!decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value))
            throw new PixException($"Valor inválido: '{raw}'.");

        if (value < 0)
            throw new PixException("O valor não pode ser negativo.");

        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static string FormatAmount(decimal value) =>
        value.ToString("0.00", CultureInfo.InvariantCulture);

    private static string CleanTxid(string? raw)
    {
        var txid = Text.ToAscii(raw).Where(char.IsLetterOrDigit).ToArray();
        var text = new string(txid);
        if (text.Length > PixPayload.MaxTxid) text = text[..PixPayload.MaxTxid];
        return text.Length == 0 ? PixPayload.PlaceholderTxid : text;
    }

    /// <summary>
    /// Monta o template 26, truncando a descrição para respeitar o teto de 99
    /// caracteres. A chave nunca é cortada.
    /// </summary>
    private static string MerchantAccountTemplate(string key, string? description)
    {
        var template = new Tlv("00", PixPayload.Gui).ToString() + new Tlv("01", key).ToString();
        if (string.IsNullOrWhiteSpace(description))
            return template;

        var room = PixPayload.MaxTemplate26 - template.Length - 4; // -4 = tag+length de "02"
        if (room <= 0)
            return template;

        var text = Text.Clean(description, room);
        return text.Length == 0 ? template : template + new Tlv("02", text).ToString();
    }

    // --- Geração ----------------------------------------------------------

    /// <summary>Gera a string BR Code (PIX copia e cola).</summary>
    public static string Build(PixPayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);

        var key = PixKey.Validate(payload.Key);

        var name = Text.Clean(payload.Name, PixPayload.MaxName);
        if (name.Length == 0)
            throw new PixException($"Indica o nome do recebedor (max. {PixPayload.MaxName} caracteres).");

        var city = Text.Clean(payload.City, PixPayload.MaxCity);
        if (city.Length == 0)
            throw new PixException($"Indica a cidade do recebedor (max. {PixPayload.MaxCity} caracteres).");

        var postcode = PixKey.DigitsOnly(payload.Postcode);
        if (postcode.Length > PixPayload.MaxPostcode) postcode = postcode[..PixPayload.MaxPostcode];

        var fields = new List<(string, string)>
        {
            ("00", "01")
        };

        if (payload.SingleUse)
            fields.Add(("01", "12"));

        fields.Add(("26", MerchantAccountTemplate(key, payload.Description)));
        fields.Add(("52", "0000"));
        fields.Add(("53", "986"));

        if (payload.Amount is decimal amount)
            fields.Add(("54", FormatAmount(amount)));

        fields.Add(("58", "BR"));
        fields.Add(("59", name));
        fields.Add(("60", city));

        if (postcode.Length > 0)
            fields.Add(("61", postcode));

        fields.Add(("62", new Tlv("05", CleanTxid(payload.Txid)).ToString()));

        var body = TlvSequence.Build(fields.ToArray()) + CrcTag;
        return body + Crc16.Hex(body);
    }

    // --- Leitura ----------------------------------------------------------

    /// <summary>
    /// Remove quebras de linha e tabulações — <em>nunca</em> os espaços.
    /// </summary>
    /// <remarks>
    /// Um <c>Replace("\s", "")</c> genérico destrói o espaço dentro de
    /// "Fulano de Tal" e desalinha todos os comprimentos declarados a partir
    /// dali, produzindo um payload que parece válido e é recusado pelo banco.
    /// </remarks>
    private static string StripWrapping(string brcode)
    {
        var ascii = Text.ToAscii(brcode, collapseSpaces: false);
        return new string(ascii.Where(c => c is not ('\r' or '\n' or '\t')).ToArray()).Trim();
    }

    /// <summary>Lê um BR Code. Com CRC inválido não lança: devolve <c>CrcValid = false</c>.</summary>
    public static ParsedPix Parse(string brcode)
    {
        var cleaned = StripWrapping(brcode);

        if (!cleaned.StartsWith("0002", StringComparison.Ordinal))
            throw new PixException("Isto não parece um PIX copia e cola (falta o campo 00).");

        var fields = TlvSequence.Parse(cleaned);

        if (!fields.Any(f => f.Id == "63"))
            throw new PixException("O payload não tem o campo 63 (CRC16).");

        var crcValue = fields.First(f => f.Id == "63").Value;
        var body = cleaned[..(cleaned.LastIndexOf(CrcTag, StringComparison.Ordinal) + CrcTag.Length)];
        var crcValid = crcValue == Crc16.Hex(body);

        string? Get(string id) => fields.FirstOrDefault(f => f.Id == id).Value;

        if (!fields.Any(f => f.Id == "26"))
            throw new PixException("O payload não tem o campo 26 (informação da conta).");

        var template26 = TlvSequence.ParseToMap(Get("26")!);
        if (template26.GetValueOrDefault("00") != PixPayload.Gui)
            throw new PixException($"GUI inválido: '{template26.GetValueOrDefault("00")}' (esperado {PixPayload.Gui}).");

        var template62 = fields.Any(f => f.Id == "62")
            ? TlvSequence.ParseToMap(Get("62")!)
            : new Dictionary<string, string>();

        decimal? amount = null;
        var rawAmount = Get("54");
        if (!string.IsNullOrEmpty(rawAmount))
            amount = decimal.Parse(rawAmount, CultureInfo.InvariantCulture);

        var txid = template62.GetValueOrDefault("05");

        return new ParsedPix
        {
            Payload = new PixPayload
            {
                Key = template26.GetValueOrDefault("01") ?? string.Empty,
                Name = Get("59") ?? string.Empty,
                City = Get("60") ?? string.Empty,
                Amount = amount,
                Txid = string.IsNullOrEmpty(txid) ? PixPayload.PlaceholderTxid : txid,
                Description = template26.GetValueOrDefault("02") ?? string.Empty,
                Postcode = Get("61") ?? string.Empty,
                SingleUse = Get("01") == "12"
            },
            CrcValid = crcValid,
            Raw = cleaned,
            PointOfInitiation = Get("01"),
            Url = template26.GetValueOrDefault("25")
        };
    }

    /// <summary>Recalcula o CRC de um payload (útil para recuperar códigos colados).</summary>
    public static string FixCrc(string brcode)
    {
        var cleaned = StripWrapping(brcode);
        var index = cleaned.LastIndexOf(CrcTag, StringComparison.Ordinal);
        if (index < 0)
            throw new PixException("O payload não tem o campo 63 (CRC16).");

        var body = cleaned[..(index + CrcTag.Length)];
        return body + Crc16.Hex(body);
    }
}
