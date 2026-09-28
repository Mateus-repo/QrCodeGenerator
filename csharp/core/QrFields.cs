namespace QrCodeGenerator.Core;

/// <summary>
/// Campos de entrada, por categoria. Só os campos da categoria escolhida são lidos.
/// </summary>
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

    /// <summary>Latitude em graus. <c>null</c> ou fora de [-90, 90] é inválido.</summary>
    public double? GeoLat { get; set; }

    /// <summary>Longitude em graus. <c>null</c> ou fora de [-180, 180] é inválido.</summary>
    public double? GeoLng { get; set; }

    public string? WifiSsid { get; set; }
    public string? WifiPass { get; set; }

    /// <summary>"WPA/WPA2", "WEP" ou "Aberto".</summary>
    public string? WifiSec { get; set; }

    public bool WifiHidden { get; set; }

    public string? VcFirstName { get; set; }
    public string? VcLastName { get; set; }
    public string? VcPhone { get; set; }
    public string? VcPhone2 { get; set; }
    public string? VcEmail { get; set; }
    public string? VcOrg { get; set; }
    public string? VcRole { get; set; }
    public string? VcStreet { get; set; }
    public string? VcCity { get; set; }
    public string? VcZip { get; set; }
    public string? VcCountry { get; set; }

    public string? PixKey { get; set; }
    public string? PixName { get; set; }
    public string? PixCity { get; set; }
    public string? PixAmount { get; set; }
    public string? PixTxid { get; set; }
    public string? PixDescription { get; set; }
    public string? PixPostcode { get; set; }
    public bool PixSingleUse { get; set; }
}
