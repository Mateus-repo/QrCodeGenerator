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
            var data = CreateQrCodeUtf8(generator, payload, ToEcc(level));
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

    /// <summary>
    /// Gera o QR a partir dos bytes UTF-8 do payload.
    /// </summary>
    /// <remarks>
    /// <b>Este metodo existe porque a sobrecarga de <c>string</c> do QRCoder
    /// escreve na codificacao do sistema, e nao em UTF-8.</b> Num Windows em
    /// portugues isso e' a cp1252, e um vCard com "Oficina de Reparacao" ia para
    /// o QR com o `a` com til num byte so. O telefone le o QR como UTF-8 -- ou,
    /// pior, faz a adivinhacao de Shift-JIS que o ZXing faz -- e mostra o nome
    /// com os caracteres trocados. O QR desenhava-se, lia-se, e o nome estava
    /// errado.
    /// <para>
    /// Nenhum teste apanhava isto: a spec so tinha PIX, e as chaves PIX sao ASCII.
    /// Foi o vector do vCard completo que o expos, e a falha aparecia como
    /// caracteres trocados a partir da posicao 108 -- sem dizer que a culpa era
    /// da codificacao e nao do encoder.
    /// <para>
    /// <b>Porque a sobrecarga de <c>byte[]</c> e nao a de <c>string</c> com
    /// <c>forceUtf8: true</c>.</b> A de <c>string</c> traz ainda um
    /// <c>requestedVersion</c> sem valor por omissao util -- o <c>0</c> que a
    /// assinatura sugere rebenta dentro do QRCoder, com um
    /// <c>ArgumentOutOfRangeException</c> nas tabelas de capacidade -- e um ECI
    /// que muda a matriz. A de <c>byte[]</c> nao tem nenhum dos dois: os bytes
    /// que entram sao exactamente o que a spec diz, e a escolha da versao e' do
    /// QRCoder.
    /// </remarks>
    private static QRCodeData CreateQrCodeUtf8(
        QRCodeGenerator generator, string payload, QRCodeGenerator.ECCLevel ecc) =>
        generator.CreateQrCode(System.Text.Encoding.UTF8.GetBytes(payload), ecc);

    private static QRCodeGenerator.ECCLevel ToEcc(EccLevel level) => level switch
    {
        EccLevel.L => QRCodeGenerator.ECCLevel.L,
        EccLevel.Q => QRCodeGenerator.ECCLevel.Q,
        EccLevel.H => QRCodeGenerator.ECCLevel.H,
        _ => QRCodeGenerator.ECCLevel.M
    };
}
