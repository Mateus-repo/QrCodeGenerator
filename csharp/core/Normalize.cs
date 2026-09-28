using System.Text.RegularExpressions;

namespace QrCodeGenerator.Core;

/// <summary>Normalização de telefone e de URL, partilhada por várias categorias.</summary>
public static class Normalize
{
    private static readonly Regex SchemeAtStart = new(
        @"^(?<scheme>[A-Za-z][A-Za-z0-9+.\-]*):",
        RegexOptions.Compiled);

    private static readonly string[] AllowedSchemes =
    {
        "http", "https", "mailto", "tel", "sms", "geo", "wifi"
    };

    private static readonly string[] DangerousSchemes =
    {
        "javascript", "data", "file", "vbscript", "about", "blob"
    };

    /// <summary>
    /// Normaliza o indicativo de país: <c>00</c> ou <c>351</c> → <c>+351</c>.
    /// </summary>
    /// <remarks>
    /// Antes só era convertido quando o <c>00</c> estivesse exatamente no início
    /// da string, o que fazia o mesmo número dar resultados diferentes
    /// conforme a maneira como era colado.
    /// </remarks>
    public static string PhonePrefix(string? raw)
    {
        var p = Text.ToAscii(raw).Trim();
        if (p.Length == 0)
            return string.Empty;

        if (p.StartsWith("00", StringComparison.Ordinal))
            p = "+" + p[2..];
        else if (!p.StartsWith('+'))
            p = "+" + p;

        // Só podem sobrar dígitos depois do '+'.
        var digitsOnly = new string(p.SkipWhile(c => c != '+').Skip(1).Where(char.IsDigit).ToArray());
        if (digitsOnly.Length == 0)
            return string.Empty;

        return p.Contains('+') ? "+" + digitsOnly : digitsOnly;
    }

    /// <summary>Número de telefone só com dígitos, já com o indicativo.</summary>
    public static string Phone(string? prefix, string? number)
    {
        var digits = DigitsOnly(number);
        return PhonePrefix(prefix) + digits;
    }

    /// <summary>Só dígitos, para o WhatsApp (<c>wa.me</c> não aceita o <c>+</c>).</summary>
    public static string DigitsOnly(string? value) =>
        new((value ?? string.Empty).Where(char.IsDigit).ToArray());

    /// <summary>
    /// Acrescenta o esquema em falta e recusa esquemas que possam executar
    /// código no leitor.
    /// </summary>
    public static string? Url(string? raw, out string? error)
    {
        error = null;
        var url = (raw ?? string.Empty).Trim();

        if (url.Length == 0)
        {
            error = "Indica um link.";
            return null;
        }

        var match = SchemeAtStart.Match(url);
        if (!match.Success)
            return "https://" + url;

        var scheme = match.Groups["scheme"].Value.ToLowerInvariant();

        if (DangerousSchemes.Contains(scheme))
        {
            error = $"O esquema '{scheme}:' não é permitido num QR code.";
            return null;
        }

        if (!AllowedSchemes.Contains(scheme))
        {
            var list = string.Join(", ", AllowedSchemes.Select(s => s + ":"));
            error = $"Esquema '{scheme}:' não suportado. Usa {list}.";
            return null;
        }

        return url;
    }
}
