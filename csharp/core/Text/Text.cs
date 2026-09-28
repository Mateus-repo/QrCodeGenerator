using System.Globalization;
using System.Text;

namespace QrCodeGenerator.Core;

/// <summary>
/// Normalização de texto partilhada por todos os tipos de payload.
/// </summary>
/// <remarks>
/// O comprimento de um payload é contado em caracteres, mas muitos leitores e
/// protocolos contam bytes. Acentos e emojis são a causa número um de payloads
/// que "parecem certos" e são recusados, por isso normalizamos para ASCII
/// sempre que o formato o exigir.
/// </remarks>
public static class Text
{
    /// <summary>Converte para ASCII sem acentos, sem caracteres de controlo e sem repetir espaços.</summary>
    public static string ToAscii(string? value, bool collapseSpaces = true)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var normalized = value.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);

        foreach (var ch in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
                continue; // o acento decomposto sai aqui
            if (ch < 128)
                sb.Append(ch);
        }

        var ascii = sb.ToString();
        if (!collapseSpaces)
            return ascii;

        var parts = ascii.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts);
    }

    /// <summary>Normaliza, colapsa espaços e corta ao limite indicado.</summary>
    public static string Clean(string? value, int maxLength)
    {
        var ascii = ToAscii(value);
        return ascii.Length <= maxLength ? ascii : ascii[..maxLength].Trim();
    }

    /// <summary>Escapa texto de iCalendar / vCard: <c>\</c> <c>;</c> <c>,</c> e quebras de linha.</summary>
    public static string EscapeICal(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var sb = new StringBuilder(value.Length + 8);
        foreach (var ch in value)
        {
            switch (ch)
            {
                case '\\': sb.Append(@"\\"); break;
                case ';': sb.Append(@"\;"); break;
                case ',': sb.Append(@"\,"); break;
                case '\r': break; // CRLF é um par
                case '\n': sb.Append(@"\n"); break;
                default: sb.Append(ch); break;
            }
        }
        return sb.ToString();
    }

    /// <summary>Escapa um valor WiFi: <c>\</c> <c>;</c> <c>,</c> <c>:</c> <c>"</c>.</summary>
    public static string EscapeWifi(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var sb = new StringBuilder(value.Length + 8);
        foreach (var ch in value)
        {
            if (ch is '\\' or ';' or ',' or ':' or '"')
                sb.Append('\\');
            sb.Append(ch);
        }
        return sb.ToString();
    }

    /// <summary>Percent-encoding para query strings (espaço vira <c>%20</c>, nunca <c>+</c>).</summary>
    public static string UrlEncode(string? value) =>
        string.IsNullOrEmpty(value) ? string.Empty : Uri.EscapeDataString(value);

    /// <summary>Número decimal com ponto, independente da cultura do sistema.</summary>
    public static string Invariant(double value) => value.ToString(CultureInfo.InvariantCulture);
}
