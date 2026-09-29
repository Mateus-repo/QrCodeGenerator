using System.Globalization;
using System.Text;
using PixPayload = QrCodeGenerator.Core.Pix.PixPayload;
using PixApi = QrCodeGenerator.Core.Pix.Pix;

namespace QrCodeGenerator.Core;

/// <summary>
/// Constrói o payload de cada categoria a partir dos campos.
///
/// Escrito à mão em vez de usar um gerador pronto: era aí que estavam os bugs
/// de iCalendar (fim de linha e escaping) e de vCard (morada sempre vazia).
/// O formato está descrito em <c>docs/TIPOS-QR.md</c>.
/// </summary>
public static class QrPayloadBuilder
{
    /// <summary>Linha de registo iCalendar. A RFC 5545 exige CRLF, sempre.</summary>
    public const string ICalNewline = "\r\n";

    private static readonly string[] AllowedSmsChars =
    {
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
        "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
        " ", "-", ".", "!", "?", ",", "(", ")", "'", "+", "*", "/", ":", "&", "%",
        "£", "$", "€", "¥", "=", "#", "@", "\"", "_", "<", ">", ";"
    };

    public static string Build(QrCategory category, QrFields f)
    {
        ArgumentNullException.ThrowIfNull(f);

        return category switch
        {
            QrCategory.Link => Normalize.Url(f.Url, out _)!,
            QrCategory.Texto => (f.Texto ?? string.Empty).Trim(),
            QrCategory.Email => BuildEmail(f),
            QrCategory.Telefone => "tel:" + Normalize.Phone(f.PhonePrefix, f.PhoneNumber),
            QrCategory.SMS => BuildSms(f),
            QrCategory.WhatsApp => BuildWhatsApp(f),
            QrCategory.Evento => BuildICalEvent(f),
            QrCategory.Localizacao => BuildGeo(f),
            QrCategory.WiFi => BuildWifi(f),
            QrCategory.VCard => BuildVCard(f),
            QrCategory.Pix => PixApi.Build(new PixPayload
            {
                Key = f.PixKey,
                Name = f.PixName,
                City = f.PixCity,
                Amount = PixApi.ParseAmount(f.PixAmount),
                Txid = string.IsNullOrWhiteSpace(f.PixTxid) ? PixPayload.PlaceholderTxid : f.PixTxid,
                Description = f.PixDescription,
                Postcode = f.PixPostcode,
                SingleUse = f.PixSingleUse
            }),
            _ => throw new InvalidOperationException("Categoria desconhecida: " + category)
        };
    }

    // --- Email -------------------------------------------------------------

    private static string BuildEmail(QrFields f)
    {
        var to = (f.MailTo ?? string.Empty).Trim();
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(f.MailSubject))
            parts.Add("subject=" + Text.UrlEncode(f.MailSubject.Trim()));
        if (!string.IsNullOrWhiteSpace(f.MailBody))
            parts.Add("body=" + Text.UrlEncode(f.MailBody.Trim()));

        return parts.Count == 0 ? "mailto:" + to : "mailto:" + to + "?" + string.Join('&', parts);
    }

    // --- SMS / WhatsApp ----------------------------------------------------

    private static string BuildSms(QrFields f)
    {
        var message = f.SmsMessage ?? string.Empty;

        // O corpo do SMSTO vai até ao fim da string: um ':' ou uma quebra de
        // linha fariam os leitores interpretarem mal. Validamos em Validate().
        return "SMSTO:" + Normalize.Phone(f.PhonePrefix, f.PhoneNumber) + ":" + message;
    }

    private static string BuildWhatsApp(QrFields f)
    {
        var number = Normalize.DigitsOnly(Normalize.Phone(f.PhonePrefix, f.PhoneNumber));
        var message = f.WaMessage ?? string.Empty;

        return message.Length == 0
            ? $"https://wa.me/{number}"
            : $"https://wa.me/{number}?text={Text.UrlEncode(message)}";
    }

    // --- Evento (iCalendar) ------------------------------------------------

    /// <summary>
    /// O carimbo de hora do iCalendar, **sem converter e sem <c>Z</c>**.
    /// </summary>
    /// <remarks>
    /// Um <see cref="DateTimeKind.Utc"/> ou um <see cref="DateTimeKind.Local"/>
    /// seria convertido, e o <c>Z</c> punha a hora num sítio que quem escreveu
    /// não escolheu. O que interessa é que o que se escreve no formulário
    /// chegue ao calendário como se escreveu.
    /// </remarks>
    private static string Stamp(DateTime value) =>
        value.ToString("yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture);

    private static string BuildICalEvent(QrFields f)
    {
        var sb = new StringBuilder();
        void Line(string name, string value) => sb.Append(name).Append(':').Append(value).Append(ICalNewline);

        sb.Append("BEGIN:VCALENDAR").Append(ICalNewline);
        Line("VERSION", "2.0");
        Line("PRODID", "-//QrCodeGenerator//PT");
        Line("CALSCALE", "GREGORIAN");
        sb.Append("BEGIN:VEVENT").Append(ICalNewline);

        // Sem UID aleatório: o payload tem de ser reproduzível para passar
        // nos vetores de spec/vectors.json.
        //
        // **A hora sai como foi escrita, sem fuso e sem `Z`.** Isto mudou, e a
        // razao vale mais do que a linha: o `datetime-local` da interface não
        // tem fuso, e quem escreve 18:30 está a dizer "as 18h30 **aqui**". A
        // versão anterior fazia `ToUniversalTime()` e escrevia um `Z` que
        // mentia — em Portugal dava **uma hora de diferença** entre o que se
        // escreveu e o que ficou no QR, e o evento aparecia no calendário à hora
        // errada.
        //
        // Um horário flutuante é o que o calendário de cada pessoa interpreta
        // na hora de cada pessoa. Um encontro marcado numa biblioteca é
        // exactamente esse caso: com `TZID` marcava a hora num sítio e quem
        // estivesse noutro via-o à hora errada.
        //
        // O `DateTime` com `Kind` não especificado é o que corresponde a um
        // campo sem fuso, e é o que o `ToFields` produz ao ler a spec.
        Line("DTSTAMP", Stamp(f.EventStart));
        Line("DTSTART", Stamp(f.EventStart));
        Line("DTEND", Stamp(f.EventEnd));
Line("SUMMARY", Text.EscapeICal((f.EventTitle ?? string.Empty).Trim()));
        Line("LOCATION", Text.EscapeICal((f.EventLocation ?? string.Empty).Trim()));
        Line("DESCRIPTION", Text.EscapeICal((f.EventDescription ?? string.Empty).Trim()));

        sb.Append("END:VEVENT").Append(ICalNewline);
        sb.Append("END:VCALENDAR").Append(ICalNewline);
        return sb.ToString();
    }

    // --- Localização -------------------------------------------------------

    private static string BuildGeo(QrFields f)
    {
        // A latitude e a longitude já chegam validadas por Validate().
        return "geo:" + Text.Invariant(Math.Round(f.GeoLat!.Value, 7)) + "," +
               Text.Invariant(Math.Round(f.GeoLng!.Value, 7));
    }

    // --- WiFi --------------------------------------------------------------

    private static string BuildWifi(QrFields f)
    {
        var auth = f.WifiSec switch
        {
            "WEP" => "WEP",
            "Aberto" => "nopass",
            _ => "WPA"
        };

        var sb = new StringBuilder("WIFI:");
        sb.Append("T:").Append(auth).Append(';');
        sb.Append("S:").Append(Text.EscapeWifi((f.WifiSsid ?? string.Empty).Trim())).Append(';');

        if (auth != "nopass")
            sb.Append("P:").Append(Text.EscapeWifi(f.WifiPass ?? string.Empty)).Append(';');

        if (f.WifiHidden)
            sb.Append("H:true;");

        sb.Append(';'); // terminador vazio obrigatório
        return sb.ToString();
    }

    // --- VCard -------------------------------------------------------------

    private static string BuildVCard(QrFields f)
    {
        var first = (f.VcFirstName ?? string.Empty).Trim();
        var last = (f.VcLastName ?? string.Empty).Trim();
        var fullName = $"{first} {last}".Trim();

        var sb = new StringBuilder();
        void Line(string line) => sb.Append(line).Append(ICalNewline);

        Line("BEGIN:VCARD");
        Line("VERSION:4.0");
        Line("FN:" + Text.EscapeICal(fullName));
        // N: família;given;extra;prefixo;sufixo — a família vem primeiro.
        Line("N:" + Text.EscapeICal(last) + ';' + Text.EscapeICal(first) + ";;;");
        Line("PRODID:-//QrCodeGenerator//PT");

        if (!string.IsNullOrWhiteSpace(f.VcOrg))
            Line("ORG:" + Text.EscapeICal(f.VcOrg.Trim()));
        if (!string.IsNullOrWhiteSpace(f.VcRole))
            Line("TITLE:" + Text.EscapeICal(f.VcRole.Trim()));

        if (!string.IsNullOrWhiteSpace(f.VcPhone))
            Line("TEL;TYPE=cell:" + f.VcPhone.Trim());
        if (!string.IsNullOrWhiteSpace(f.VcPhone2))
            Line("TEL;TYPE=work:" + f.VcPhone2.Trim());

        if (!string.IsNullOrWhiteSpace(f.VcEmail))
            Line("EMAIL:" + f.VcEmail.Trim());

        // ADR;TYPE=work:;;rua;localidade;região;código postal;país
        var street = (f.VcStreet ?? string.Empty).Trim();
        var city = (f.VcCity ?? string.Empty).Trim();
        var zip = (f.VcZip ?? string.Empty).Trim();
        var country = (f.VcCountry ?? string.Empty).Trim();

        if (street.Length > 0 || city.Length > 0 || zip.Length > 0 || country.Length > 0)
        {
            Line("ADR;TYPE=work:;;" +
                 Text.EscapeICal(street) + ';' +
                 Text.EscapeICal(city) + ";;" +
                 Text.EscapeICal(zip) + ';' +
                 Text.EscapeICal(country));
        }

        Line("END:VCARD");
        return sb.ToString();
    }

    /// <summary>Caracteres aceites no corpo de um SMS (GSM 03.38 + extensões).</summary>
    public static bool IsSmsSafe(string? message) =>
        (message ?? string.Empty).All(c => AllowedSmsChars.Contains(c.ToString(), StringComparer.Ordinal));
}
