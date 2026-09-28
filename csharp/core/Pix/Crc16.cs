namespace QrCodeGenerator.Core.Pix;

/// <summary>
/// CRC-16/CCITT-FALSE: polinómio 0x1021, valor inicial 0xFFFF, sem reflexão
/// de bits e sem XOR final.
/// </summary>
/// <remarks>
/// O detalhe que derruba a maioria das implementações é a ordem: concatena-se
/// "6304" ao fim da string <em>antes</em> de calcular, e o resultado ocupa os
/// quatro caracteres seguintes.
/// </remarks>
public static class Crc16
{
    /// <summary>Vetor de validação canónico: <c>Crc16.Of("123456789") == 0x29B1</c>.</summary>
    public const string SelfTestInput = "123456789";
    public const int SelfTestExpected = 0x29B1;

    public static int Of(string data)
    {
        ArgumentNullException.ThrowIfNull(data);

        var crc = 0xFFFF;
        foreach (var b in System.Text.Encoding.Latin1.GetBytes(data))
        {
            crc ^= b << 8;
            for (var i = 0; i < 8; i++)
                crc = (crc & 0x8000) != 0
                    ? ((crc << 1) ^ 0x1021) & 0xFFFF
                    : (crc << 1) & 0xFFFF;
        }

        return crc;
    }

    /// <summary>CRC em 4 caracteres hexadecimais maiúsculos.</summary>
    public static string Hex(string data) => Of(data).ToString("X4");
}
