namespace QrCodeGenerator.Core;

/// <summary>
/// Capacidade de um QR code em modo byte, por nível de correção de erro
/// (ISO/IEC 18004). É o pior caso: texto com acentos gasta mais bytes.
/// </summary>
public static class QrCapacity
{
    public static readonly IReadOnlyDictionary<EccLevel, int> MaxBytes =
        new Dictionary<EccLevel, int>
        {
            [EccLevel.L] = 2953,
            [EccLevel.M] = 2331,
            [EccLevel.Q] = 1663,
            [EccLevel.H] = 1273
        };

    public static int LimitFor(EccLevel level) => MaxBytes[level];

    /// <summary>
    /// Valida o tamanho do payload e devolve a capacidade máxima.
    /// </summary>
    /// <exception cref="QrCapacityException">Se o payload não couber.</exception>
    public static int Check(string payload, EccLevel level = EccLevel.M)
    {
        ArgumentNullException.ThrowIfNull(payload);

        var used = System.Text.Encoding.UTF8.GetByteCount(payload);
        var limit = LimitFor(level);

        if (used > limit)
        {
            throw new QrCapacityException(
                $"O conteúdo ocupa {used} bytes e o limite com ECC {level} é {limit}.");
        }

        return limit;
    }
}

/// <summary>O payload não cabe num QR code com as opções escolhidas.</summary>
public sealed class QrCapacityException : Exception
{
    public QrCapacityException(string message) : base(message) { }
}
