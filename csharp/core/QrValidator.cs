namespace QrCodeGenerator.Core;

/// <summary>
/// Validação por categoria. Devolve <c>null</c> quando está tudo bem, ou uma
/// mensagem de erro em português.
///
/// As mensagens são específicas do campo: um erro genérico faz o utilizador
/// procurar o problema no sítio errado.
/// </summary>
public static class QrValidator
{
    public static string? Validate(QrCategory category, QrFields f)
    {
        ArgumentNullException.ThrowIfNull(f);

        return category switch
        {
            QrCategory.Link => ValidateLink(f),
            QrCategory.Texto => ValidateText(f),
            QrCategory.Email => ValidateEmail(f),
            QrCategory.Telefone => ValidatePhone(f, requireMessage: false),
            QrCategory.SMS => ValidatePhone(f, requireMessage: true, sms: true),
            QrCategory.WhatsApp => ValidatePhone(f, requireMessage: false),
            QrCategory.Evento => ValidateEvent(f),
            QrCategory.Localizacao => ValidateGeo(f),
            QrCategory.WiFi => ValidateWifi(f),
            QrCategory.VCard => ValidateVCard(f),
            QrCategory.Pix => ValidatePix(f),
            _ => "Categoria desconhecida."
        };
    }

    private static string? ValidateLink(QrFields f) =>
        Normalize.Url(f.Url, out var error) is null ? error : null;

    private static string? ValidateText(QrFields f) =>
        string.IsNullOrWhiteSpace(f.Texto) ? "Escreve algum texto." : null;

    private static string? ValidateEmail(QrFields f)
    {
        if (string.IsNullOrWhiteSpace(f.MailTo))
            return "Indica o destinatário do email.";

        var to = f.MailTo.Trim();
        if (!to.Contains('@') || to.StartsWith('@') || to.EndsWith('@') || to.Contains(' '))
            return "O destinatário não parece um email válido.";

        return null;
    }

    private static string? ValidatePhone(QrFields f, bool requireMessage, bool sms = false)
    {
        if (string.IsNullOrWhiteSpace(f.PhoneNumber))
            return "Indica o número de telefone.";

        if (Normalize.PhonePrefix(f.PhonePrefix).Length == 0)
            return "Indica o indicativo do país (ex.: +351).";

        var digits = Normalize.DigitsOnly(f.PhoneNumber);
        if (digits.Length < 4)
            return "O número de telefone é curto demais.";

        if (requireMessage)
        {
            var message = f.SmsMessage ?? string.Empty;
            if (message.Length == 0)
                return null;

            if (!QrPayloadBuilder.IsSmsSafe(message))
                return "A mensagem tem caracteres que um SMS não suporta (ex.: { } [ ] ~ ^ | €).";
        }

        return null;
    }

    private static string? ValidateEvent(QrFields f)
    {
        if (string.IsNullOrWhiteSpace(f.EventTitle))
            return "Indica o título do evento.";

        if (f.EventEnd < f.EventStart)
            return "A data de fim não pode ser anterior à de início.";

        return null;
    }

    private static string? ValidateGeo(QrFields f)
    {
        if (f.GeoLat is not { } lat)
            return "Indica uma latitude válida (ex.: 38.7223).";
        if (f.GeoLng is not { } lng)
            return "Indica uma longitude válida (ex.: -9.1393).";

        // Antes não havia validação de intervalo: qualquer número passava e
        // produzia um geo: que nenhum mapa conseguia abrir.
        if (double.IsNaN(lat) || double.IsInfinity(lat) || lat < -90 || lat > 90)
            return "A latitude tem de estar entre -90 e 90.";
        if (double.IsNaN(lng) || double.IsInfinity(lng) || lng < -180 || lng > 180)
            return "A longitude tem de estar entre -180 e 180.";

        return null;
    }

    private static string? ValidateWifi(QrFields f)
    {
        if (string.IsNullOrWhiteSpace(f.WifiSsid))
            return "Indica o nome da rede (SSID).";

        var ssid = f.WifiSsid.Trim();
        if (ssid.Length > 32)
            return "O SSID tem mais de 32 caracteres.";

        var open = string.Equals(f.WifiSec, "Aberto", StringComparison.OrdinalIgnoreCase);
        if (!open && string.IsNullOrEmpty(f.WifiPass))
            return "Indica a password da rede.";

        if (!open && f.WifiPass!.Length > 63)
            return "A password tem mais de 63 caracteres.";

        return null;
    }

    private static string? ValidateVCard(QrFields f)
    {
        if (string.IsNullOrWhiteSpace(f.VcFirstName)
            && string.IsNullOrWhiteSpace(f.VcLastName)
            && string.IsNullOrWhiteSpace(f.VcPhone)
            && string.IsNullOrWhiteSpace(f.VcPhone2)
            && string.IsNullOrWhiteSpace(f.VcEmail))
        {
            return "Preenche pelo menos um campo do contacto.";
        }

        if (!string.IsNullOrWhiteSpace(f.VcEmail))
        {
            var email = f.VcEmail.Trim();
            if (!email.Contains('@') || email.StartsWith('@') || email.EndsWith('@'))
                return "O email não parece válido.";
        }

        return null;
    }

    private static string? ValidatePix(QrFields f)
    {
        try
        {
            Pix.PixKey.Validate(f.PixKey);
        }
        catch (Pix.PixException ex)
        {
            return ex.Message;
        }

        if (string.IsNullOrWhiteSpace(f.PixName))
            return "Indica o nome do recebedor (max. 25 caracteres).";

        if (string.IsNullOrWhiteSpace(f.PixCity))
            return "Indica a cidade do recebedor (max. 15 caracteres).";

        try
        {
            Pix.Pix.ParseAmount(f.PixAmount);
        }
        catch (Pix.PixException ex)
        {
            return ex.Message;
        }

        return null;
    }
}
