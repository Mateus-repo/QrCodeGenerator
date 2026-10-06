namespace QrCodeGenerator.Core.Simbologias;

/// <summary>O que um encoder recusa.</summary>
/// <remarks>
/// Estende <see cref="ArgumentException"/> e nao <c>InvalidOperationException</c>,
/// porque e' um erro de uso da chamada e nao um estado interno: o ITF com um
/// digito a menos nao tem leitura, e quem chama tem de saber isso.
/// <para>
/// A mensagem e' o produto, pela mesma razao que a do <c>QrValidator</c>: e' o que
/// a pessoa ve, e as stacks tem de dar a mesma.
/// </para>
/// </remarks>
public class SimbologiaException : ArgumentException
{
    public SimbologiaException(string message) : base(message)
    {
    }
}
