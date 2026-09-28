using QRCoder;
using QrCodeGenerator.Core;
using QRCoder.Exceptions;

namespace QrCodeGenerator;

/// <summary>
/// Desenha o QR. É a única parte que depende de <c>System.Drawing</c>, por isso
/// vive no projeto WinForms e não no core.
/// </summary>
public static class QrRenderer
{
    /// <summary>
    /// Gera o payload, valida e devolve o bitmap. Erro fica em <paramref name="error"/>.
    /// </summary>
    public static bool TryGenerate(
        QrCategory category,
        QrFields fields,
        int targetPx,
        EccLevel level,
        out Bitmap? bitmap,
        out string? error)
    {
        bitmap = null;
        error = null;

        error = QrValidator.Validate(category, fields);
        if (error is not null)
            return false;

        try
        {
            var payload = QrPayloadBuilder.Build(category, fields);
            QrCapacity.Check(payload, level);

            using var generator = new QRCodeGenerator();
            var data = generator.CreateQrCode(payload, ToEcc(level));
            int modules = data.ModuleMatrix.Count;
            int scale = Math.Max(1, targetPx / Math.Max(1, modules));
            using var qr = new QRCode(data);

            bitmap = qr.GetGraphic(scale, Color.Black, Color.White, true);
            return true;
        }
        catch (QrCapacityException ex)
        {
            error = ex.Message;
            return false;
        }
        catch (DataTooLongException)
        {
            error = "Conteúdo demasiado longo para um QR code. Reduz o texto ou escolhe " +
                    "o nível de correção L (mais capacidade).";
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
}
