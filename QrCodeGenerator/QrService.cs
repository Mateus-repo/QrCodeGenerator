using System.Globalization;
using QRCoder;

namespace QrCodeGenerator;

public enum QrCategory
{
    Link,
    Texto,
    Email,
    Telefone,
    SMS,
    WhatsApp,
    Evento,
    Localização,
    WiFi,
    VCard
}

public enum EccLevel
{
    L,
    M,
    Q,
    H
}

public sealed class QrFields
{
    public string? Url { get; set; }
    public string? Texto { get; set; }
    public string? MailTo { get; set; }
    public string? MailSubject { get; set; }
    public string? MailBody { get; set; }
    public string? PhonePrefix { get; set; }
    public string? PhoneNumber { get; set; }
    public string? SmsMessage { get; set; }
    public string? WaMessage { get; set; }
    public string? EventTitle { get; set; }
    public string? EventDescription { get; set; }
    public string? EventLocation { get; set; }
    public DateTime EventStart { get; set; }
    public DateTime EventEnd { get; set; }
    public string? GeoLat { get; set; }
    public string? GeoLng { get; set; }
    public string? WifiSsid { get; set; }
    public string? WifiPass { get; set; }
    public string? WifiSec { get; set; }
    public bool WifiHidden { get; set; }
    public string? VcName { get; set; }
    public string? VcPhone { get; set; }
    public string? VcEmail { get; set; }
    public string? VcOrg { get; set; }
    public string? VcRole { get; set; }
}

public static class QrService
{
    public static string? Validate(QrCategory category, QrFields f)
    {
        switch (category)
        {
            case QrCategory.Link:
                if (string.IsNullOrWhiteSpace(f.Url))
                    return "Indica um link.";
                break;
            case QrCategory.Texto:
                if (string.IsNullOrWhiteSpace(f.Texto))
                    return "Escreve algum texto.";
                break;
            case QrCategory.Email:
                if (string.IsNullOrWhiteSpace(f.MailTo))
                    return "Indica o destinatário do email.";
                break;
            case QrCategory.Telefone:
                var phonePrefix = NormalizePhonePrefix(f.PhonePrefix);
                if (string.IsNullOrWhiteSpace(f.PhoneNumber)
                    && string.IsNullOrWhiteSpace(f.PhonePrefix))
                    return "Indica o número de telefone.";
                if (string.IsNullOrWhiteSpace(f.PhoneNumber))
                    return "Falta o número de telefone.";
                if (string.IsNullOrWhiteSpace(phonePrefix))
                    return "Indica o indicativo do país (ex.: +351).";
                break;
            case QrCategory.SMS:
            case QrCategory.WhatsApp:
                if (string.IsNullOrWhiteSpace(f.PhoneNumber)
                    || string.IsNullOrWhiteSpace(NormalizePhonePrefix(f.PhonePrefix)))
                    return "Indica o indicativo e o número de telefone.";
                break;
            case QrCategory.Evento:
                if (string.IsNullOrWhiteSpace(f.EventTitle))
                    return "Indica o título do evento.";
                if (f.EventEnd < f.EventStart)
                    return "A data de fim não pode ser anterior à de início.";
                break;
            case QrCategory.Localização:
                if (!TryParseCoord(f.GeoLat, out _))
                    return "Indica uma latitude válida (ex.: 38.7223).";
                if (!TryParseCoord(f.GeoLng, out _))
                    return "Indica uma longitude válida (ex.: -9.1393).";
                break;
            case QrCategory.WiFi:
                if (string.IsNullOrWhiteSpace(f.WifiSsid))
                    return "Indica o nome da rede (SSID).";
                if (!string.Equals(f.WifiSec, "Aberto", StringComparison.OrdinalIgnoreCase)
                    && string.IsNullOrEmpty(f.WifiPass))
                    return "Indica a password da rede.";
                break;
            case QrCategory.VCard:
                if (string.IsNullOrWhiteSpace(f.VcName)
                    && string.IsNullOrWhiteSpace(f.VcPhone)
                    && string.IsNullOrWhiteSpace(f.VcEmail))
                    return "Preenche pelo menos um campo do contacto.";
                break;
        }
        return null;
    }

    public static bool TryGenerate(QrCategory category, QrFields f, int targetPx, EccLevel level,
        out Bitmap? bitmap, out string? error)
    {
        bitmap = null;
        error = null;

        error = Validate(category, f);
        if (error != null)
            return false;

        try
        {
            string payload = BuildPayload(category, f);
            using var generator = new QRCodeGenerator();
            var data = generator.CreateQrCode(payload, ToEcc(level));
            int modules = data.ModuleMatrix.Count;
            int scale = Math.Max(1, targetPx / Math.Max(1, modules));
            using var qr = new QRCode(data);
            bitmap = qr.GetGraphic(scale, Color.Black, Color.White, true);
            return true;
        }
        catch (QRCoder.Exceptions.DataTooLongException)
        {
            error = "Conteúdo demasiado longo para um QR code. Reduz o texto ou escolhe o nível de correção L (mais capacidade).";
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static QRCodeGenerator.ECCLevel ToEcc(EccLevel level) => level switch
    {
        EccLevel.L => QRCodeGenerator.ECCLevel.L,
        EccLevel.Q => QRCodeGenerator.ECCLevel.Q,
        EccLevel.H => QRCodeGenerator.ECCLevel.H,
        _ => QRCodeGenerator.ECCLevel.M
    };

    private static string BuildPayload(QrCategory category, QrFields f) => category switch
    {
        QrCategory.Link => new PayloadGenerator.Url(NormalizeUrl(f.Url!.Trim())).ToString(),
        QrCategory.Texto => f.Texto!.Trim(),
        QrCategory.Email => new PayloadGenerator.Mail(
            f.MailTo!.Trim(), f.MailSubject, f.MailBody,
            PayloadGenerator.Mail.MailEncoding.MAILTO).ToString(),
        QrCategory.Telefone => new PayloadGenerator.PhoneNumber(Phone(f)).ToString(),
        QrCategory.SMS => new PayloadGenerator.SMS(Phone(f), f.SmsMessage ?? "",
            PayloadGenerator.SMS.SMSEncoding.SMS).ToString(),
        QrCategory.WhatsApp => new PayloadGenerator.WhatsAppMessage(DigitsOnly(Phone(f)), f.WaMessage ?? "").ToString(),
        QrCategory.Evento => new PayloadGenerator.CalendarEvent(
            f.EventTitle!.Trim(), f.EventDescription ?? "", f.EventLocation ?? "",
            f.EventStart, f.EventEnd, false,
            PayloadGenerator.CalendarEvent.EventEncoding.iCalComplete).ToString(),
        QrCategory.Localização => new PayloadGenerator.Geolocation(
            ParseCoord(f.GeoLat!).ToString(CultureInfo.InvariantCulture),
            ParseCoord(f.GeoLng!).ToString(CultureInfo.InvariantCulture),
            PayloadGenerator.Geolocation.GeolocationEncoding.GoogleMaps).ToString(),
        QrCategory.WiFi => CreateWifiPayload(f),
        QrCategory.VCard => CreateVCardPayload(f),
        _ => throw new InvalidOperationException("Categoria desconhecida.")
    };

    private static string CreateWifiPayload(QrFields f)
    {
        var auth = f.WifiSec switch
        {
            "WEP" => PayloadGenerator.WiFi.Authentication.WEP,
            "Aberto" => PayloadGenerator.WiFi.Authentication.nopass,
            _ => PayloadGenerator.WiFi.Authentication.WPA
        };
        return new PayloadGenerator.WiFi(f.WifiSsid!.Trim(), f.WifiPass ?? "", auth, f.WifiHidden).ToString();
    }

    private static string CreateVCardPayload(QrFields f)
    {
        return new PayloadGenerator.ContactData(
            PayloadGenerator.ContactData.ContactOutputType.VCard4,
            f.VcName?.Trim() ?? "",
            "",
            "",
            "",
            f.VcPhone?.Trim() ?? "",
            "",
            f.VcEmail?.Trim() ?? "",
            null,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            PayloadGenerator.ContactData.AddressOrder.Default,
            f.VcOrg?.Trim() ?? "",
            f.VcRole?.Trim() ?? "").ToString();
    }

    private static string NormalizeUrl(string url)
    {
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return "https://" + url;
        }
        return url;
    }

    private static string NormalizePhonePrefix(string? prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix))
            return "";
        var p = prefix.Trim();
        if (p.StartsWith("00", StringComparison.Ordinal))
            p = "+" + p[2..];
        else if (!p.StartsWith("+", StringComparison.Ordinal))
            p = "+" + p;
        return p;
    }

    private static string Phone(QrFields f) => NormalizePhonePrefix(f.PhonePrefix) + f.PhoneNumber!.Trim();

    private static string DigitsOnly(string s) => new(s.Where(char.IsDigit).ToArray());

    private static bool TryParseCoord(string? s, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(s))
            return false;
        var clean = s.Trim().Replace(',', '.');
        return double.TryParse(clean, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    private static double ParseCoord(string s)
    {
        TryParseCoord(s, out var value);
        return value;
    }
}