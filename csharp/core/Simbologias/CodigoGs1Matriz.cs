namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// O resultado de um GS1 DataMatrix.
/// </summary>
/// <remarks>
/// <para><strong>E' um tipo a parte, e nao <see cref="CodigoMatriz"/> com dois campos
/// a mais</strong>, pela mesma razao que o <see cref="CodigoGs1"/> e' a parte do
/// <see cref="CodigoDeBarras"/>: o que o leitor precisa saber - <b>onde acaba cada
/// campo</b> e <b>quantos separadores foram emitidos</b> - nao existe num
/// <c>CodigoMatriz</c> nem num <c>CodigoDeBarras</c>.</para>
///
/// <para><strong>E' 2D</strong>, e por isso que o <see cref="Codigo"/> devolve um
/// <see cref="CodigoMatriz"/> e nao um <c>CodigoDeBarras</c>: o desenho de um GS1
/// DataMatrix e' uma grelha com guias, como qualquer Data Matrix.</para>
/// </remarks>
public sealed record CodigoGs1Matriz
{
    /// <summary>A grelha, para o desenho e para o ZXing.</summary>
    public required CodigoMatriz Codigo { get; init; }

    /// <summary>Os campos, na ordem em que foram escritos.</summary>
    public required IReadOnlyList<CodigoGs1.Campo> Campos { get; init; }

    /// <summary>
    /// Quantos FNC1 foram emitidos, contando o do inicio.
    /// </summary>
    /// <remarks>
    /// <b>E' a unica coisa que apanha um separador a mais.</b> Um separador a mais da
    /// um codeword a mais e um simbolo possivelmente maior, e o numero de modulos nao
    /// da conta.
    /// </remarks>
    public required int Separadores { get; init; }

    /// <summary>
    /// A forma de maquina: os AIs e os valores sem parenteses, com o separador
    /// <b>onde o encoder o pos</b> - que e' o que o ZXing devolve em
    /// <c>GetRawBytes</c>, com o <c>0x1D</c> cru.
    /// </summary>
    public required string Payload { get; init; }

    /// <summary>A forma legivel, que e' a notacao da GS1.</summary>
    public required string Gs1 { get; init; }

    /// <summary>
    /// A forma humana, com os AIs entre parenteses e <b>sem</b> separador - que e' a
    /// que o ZXing devolve em <c>GetText</c>.
    /// </summary>
    public required string Legenda { get; init; }
}