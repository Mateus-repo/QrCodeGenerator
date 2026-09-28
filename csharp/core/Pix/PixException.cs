namespace QrCodeGenerator.Core.Pix;

/// <summary>Erro de validação de PIX.</summary>
public sealed class PixException : Exception
{
    public PixException(string message) : base(message) { }
}
