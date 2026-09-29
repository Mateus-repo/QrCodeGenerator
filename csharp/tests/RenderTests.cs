using QRCoder;
using QrCodeGenerator.Core;
using Xunit;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nível 2 da paridade: gerar a imagem com a biblioteca que a app usa e
/// descodificá-la com um leitor independente.
///
/// O Nível 1 (payload) apanha bugs de lógica. Este apanha bugs de biblioteca —
/// um payload perfeitamente válido que ninguém consegue ler também é um bug.
/// </summary>
public class RenderTests
{
    private readonly SpecFixture _spec = new();

    public static TheoryData<string, string> AllVectors()
    {
        var data = new TheoryData<string, string>();
        foreach (var v in new SpecFixture().Vectors)
            data.Add(v.Id, v.Payload);
        return data;
    }

    [Theory]
    [MemberData(nameof(AllVectors))]
    public void O_QR_gerado_e_legivel_por_um_leitor_real(string id, string payload)
    {
        var decoded = Decode(Render(payload, 512));

        Assert.True(decoded is not null, $"o ZXing não leu o QR de {id}");
        Assert.Equal(payload, decoded);
    }

    [Fact]
    public void Todos_os_niveis_de_correcao_sao_legiveis()
    {
        var payload = _spec.Vectors.First(v => v.Id == "pix_cpf_com_valor").Payload;

        foreach (var ecc in new[] { EccLevel.L, EccLevel.M, EccLevel.Q, EccLevel.H })
        {
            Assert.Equal(payload, Decode(Render(payload, 512, ecc)));
        }
    }

    [Fact]
    public void Os_payloads_novos_tambem_sao_legiveis()
    {
        // VCard com morada e iCalendar com CRLF/escaping: os dois dependem de
        // escaping correto, que é onde os leitores costumam falhar.
        var vcard = QrPayloadBuilder.Build(QrCategory.VCard, new QrFields
        {
            VcFirstName = "Ana",
            VcLastName = "Silva",
            VcPhone = "+351912345678",
            VcEmail = "ana@exemplo.pt",
            VcStreet = "Rua A, 1",
            VcCity = "Lisboa",
            VcZip = "1000-001",
            VcCountry = "Portugal"
        });

        Assert.Equal(vcard, Decode(Render(vcard, 512)));
    }

    [Fact]
    public void O_PIX_do_banco_central_sobe_de_corpo_e_da_para_ler()
    {
        var payload = _spec.Vectors.First(v => v.Id == "pix_uuid_sem_valor").Payload;
        Assert.EndsWith("63041D3D", payload, StringComparison.Ordinal);
        Assert.Equal(payload, Decode(Render(payload, 256, EccLevel.H)));
    }

    private static System.Drawing.Bitmap Render(string payload, int size, EccLevel ecc = EccLevel.M)
    {
        using var generator = new QRCodeGenerator();
        var data = generator.CreateQrCode(System.Text.Encoding.UTF8.GetBytes(payload), ToEcc(ecc));
        var modules = data.ModuleMatrix.Count;
        var scale = Math.Max(1, size / Math.Max(1, modules));

        using var qr = new QRCode(data);
        return qr.GetGraphic(scale, System.Drawing.Color.Black, System.Drawing.Color.White, true);
    }

    /// <summary>
    /// Lê o bitmap com o ZXing. O QRCoder devolve 24 bpp, por isso convertemos
    /// para BGRA32, que é o formato que o ZXing quer.
    /// </summary>
    /// <param name="source">O QR já desenhado.</param>
    private static string? Decode(System.Drawing.Bitmap source)
    {
        using var bitmap = new System.Drawing.Bitmap(
            source.Width, source.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);

        using (var graphics = System.Drawing.Graphics.FromImage(bitmap))
            graphics.DrawImageUnscaled(source, 0, 0);

        var data = bitmap.LockBits(
            new System.Drawing.Rectangle(0, 0, bitmap.Width, bitmap.Height),
            System.Drawing.Imaging.ImageLockMode.ReadOnly,
            System.Drawing.Imaging.PixelFormat.Format32bppArgb);

        try
        {
            var bytes = new byte[Math.Abs(data.Stride) * bitmap.Height];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);

            var reader = new ZXing.BarcodeReaderGeneric
            {
                Options = new ZXing.Common.DecodingOptions
                {
                    PossibleFormats = new List<ZXing.BarcodeFormat> { ZXing.BarcodeFormat.QR_CODE },
                    TryHarder = true,

                    // **E `forceUtf8` acima, no desenho, que é a outra metade.**
                    // As duas juntas: o desenho diz que é UTF-8, e a leitura diz
                    // que é UTF-8. Sem a primeira o `ã` vai num byte só, e sem a
                    // segunda o leitor adivinha outra vez.
                    //
                    // O ZXing adivinha a codificação de um segmento em modo byte,
                    // e a adivinhação é um teste de Shift-JIS. Um iCalendar com
                    // acentos passa nele — o «ñ» é 0xC3 0xB1 em UTF-8, e esse par
                    // é um caractere kanji válido — e o leitor devolve o texto
                    // reconstruído a partir dos pares, com os caracteres trocados
                    // a partir da posição 190.
                    //
                    // O sintoma é enganador porque o QR está certo: lê-se, o
                    // zxingcpp do Python devolve a string certa, e a falha
                    // aparece só na comparação. Dizer a codificação desliga a
                    // adivinhação, e é o que se quer: o payload é UTF-8 porque
                    // fomos nós que o escrevemos.
                    CharacterSet = "UTF-8"
                }
            };

            return reader.Decode(bytes, bitmap.Width, bitmap.Height,
                ZXing.RGBLuminanceSource.BitmapFormat.BGRA32)?.Text;
        }
        finally
        {
            bitmap.UnlockBits(data);
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
