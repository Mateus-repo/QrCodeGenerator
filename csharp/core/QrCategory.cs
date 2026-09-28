namespace QrCodeGenerator.Core;

/// <summary>Categoria do QR code. A ordem define a ordem na interface.</summary>
public enum QrCategory
{
    Link,
    Texto,
    Email,
    Telefone,
    SMS,
    WhatsApp,
    Evento,
    Localizacao,
    WiFi,
    VCard,
    Pix
}
