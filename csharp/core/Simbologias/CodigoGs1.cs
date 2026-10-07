namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// O resultado de um GS1-128.
/// </summary>
/// <remarks>
/// <para><b>E' uma classe a parte, e nao <see cref="CodigoDeBarras"/> com dois
/// campos a mais.</b> O GS1-128 desenha-se como um Code 128 - e' o mesmo formato com
/// o FNC1 no sitio certo - mas o que o leitor devolve depende de duas coisas que um
/// <c>CodigoDeBarras</c> nao tem: <b>onde acaba cada campo</b> e <b>quantos
/// separadores foram emitidos</b>.</para>
///
/// <para><b>Porque sao tres cadeias e nao uma.</b> O mesmo GS1-128 tem tres
/// representacoes, e confundir duas delas e' o erro que a <c>AGENTS.md</c> ja
/// registou tres vezes - uma delas nos caracteres de controlo do Code 93, que o
/// ZXing devolve em tres notacoes e o teste comparava duas:</para>
/// <list type="bullet">
/// <item><description><see cref="Payload"/> - a forma de maquina: os AIs e os
/// valores sem parenteses, com o separador onde o encoder o pôs. <b>E' esta a que o
/// ZXing em Java devolve nos <c>bytes</c> do <c>zxingcpp</c>.</b></description></item>
/// <item><description><see cref="Gs1"/> - a forma legivel com separadores entre os
/// campos.</description></item>
/// <item><description><see cref="Legenda"/> - a forma humana, com os AIs entre
/// parenteses e sem separador nenhum. <b>E' a que a GS1 pede que se imprima</b>, e
/// a que o <c>zxingcpp</c> devolve em <c>text</c>.</description></item>
/// </list>
///
/// <para><b>Um <c>Payload</c> e um <c>Legenda</c> que devolvessem a mesma cadeia
/// seriam um codigo que se desenha bem e que nao diz nada</b> - e o primeiro rascunho
/// desta classe tinha exactamente isso, com dois metodos a devolver
/// <c>codigo.Legenda</c>.</para>
///
/// <para><b>Os campos e' o que a interface mostra, e nao o que o codigo transporta.</b>
/// Cada <see cref="Campo"/> tem o AI, o valor, e o valor sem a parte do AI implicito.
/// Sao tres coisas porque o <c>3103</c> tem um digito que e' do valor e nao do AI, e um
/// <see cref="Campo"/> com so <c>Ai</c> e <c>Valor</c> esconde isso.</para>
/// </remarks>
public sealed record CodigoGs1
{
    /// <summary>
    /// Um campo de um GS1-128.
    /// </summary>
    /// <param name="Ai">
    /// O numero do AI, dois a quatro digitos, <b>sem</b> a parte que sobrou da
    /// procura.
    /// </param>
    /// <param name="Valor">
    /// O valor do campo, com a parte implicita do AI no inicio.
    /// </param>
    /// <param name="Conteudo">O valor sem a parte implicita.</param>
    /// <param name="Separador">
    /// Se o campo precisa de um FNC1 a separa-lo do seguinte.
    /// </param>
    /// <remarks>
    /// <b>O <paramref name="Valor"/> e o <paramref name="Conteudo"/> sao dois campos
    /// porque num <c>3103</c> o ultimo digito e' a posicao decimal implicita</b> e faz
    /// parte do valor. E' a razao de a procura do AI ir do mais comprido para o mais
    /// curto: o <c>31</c> seguido de <c>03</c> e' o mesmo campo com o digito no sitio
    /// certo.
    /// </remarks>
    public sealed record Campo(string Ai, string Valor, string Conteudo, bool Separador);

    /// <summary>
    /// A grelha: <c>true</c> e' barra escura, <c>false</c> e' espaco.
    /// </summary>
    /// <remarks>
    /// <b>E' uma <c>bool[]</c> e nao um <c>IReadOnlyList&lt;bool&gt;</c>,</b> pelo
    /// mesmo motivo que o <see cref="CodigoDeBarras"/>: o <c>PictureBox</c> do
    /// WinForms percorre isto para desenhar, e um array de primitivas nao faz caixa por
    /// elemento.
    /// </remarks>
    public required bool[] Modulos { get; init; }

    /// <summary>
    /// A forma humana, com os AIs entre parenteses e <b>sem</b> separador.
    /// </summary>
    /// <remarks>
    /// A GS1 pede que a linha impressa tenha os AIs entre parenteses, e nao e' opcional:
    /// e' o que permite a uma pessoa ler o codigo sem scanner.
    /// </remarks>
    public required string Legenda { get; init; }

    /// <summary>
    /// A forma de maquina, com o separador <b>onde o encoder o pôs</b>.
    /// </summary>
    /// <remarks>
    /// <b>Nao e' a mesma coisa que juntar todos os campos com um separador.</b> A
    /// diferenca e' o que apanha um separador no ultimo campo: um separador no fim nao
    /// separa de nada, e o leitor conta-o como parte do campo seguinte.
    /// </remarks>
    public required string Payload { get; init; }

    /// <summary>A forma legivel, com o separador entre os campos.</summary>
    public required string Gs1 { get; init; }

    /// <summary>Os campos, na ordem em que foram escritos.</summary>
    public required IReadOnlyList<Campo> Campos { get; init; }

    /// <summary>
    /// Quantos FNC1 foram emitidos, contando o do inicio.
    /// </summary>
    /// <remarks>
    /// <b>E' a unica coisa que apanha um separador a mais.</b> O numero de modulos nao
    /// apanha: o GS1-128 e o Code 128 dao <i>exactamente</i> o mesmo numero de modulos
    /// com o mesmo texto, porque dao treze codewords nos dois - o Code 128 comutativo
    /// gasta um codeword na troca de conjunto e o GS1-128 gasta um no FNC1. E um
    /// separador a mais da treze codewords em vez de treze.
    /// </remarks>
    public required int Separadores { get; init; }

    /// <summary>
    /// O codigo de barras como <see cref="CodigoDeBarras"/>, para o desenho e para o
    /// ZXing.
    /// </summary>
    /// <remarks>
    /// <b>Um GS1-128 nao tem desenho proprio</b>: tem o desenho do Code 128 com mais
    /// uns codewords. <b>E' uma convenience e nao o formato do codigo</b>, que e' a
    /// razao de <see cref="Modulos"/> ser a propriedade.
    /// </remarks>
    public CodigoDeBarras ComoCodigoDeBarras() =>
        new("GS1-128", (bool[])Modulos.Clone(), [], Legenda);
}