namespace QrCodeGenerator.Core;

/// <summary>Nomes de apresentação das categorias, em português.</summary>
public static class QrCategoryNames
{
    private static readonly string[] Names =
    {
        "Link",
        "Texto",
        "Email",
        "Telefone",
        "SMS",
        "WhatsApp",
        "Evento",
        "Localização",
        "WiFi",
        "VCard",
        "PIX"
    };

    public static string Of(QrCategory category) => Names[(int)category];

    public static IReadOnlyList<string> All => Names;
}
