namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// Um codigo de barras de uma linha, ja desenhado: os modulos e onde sao as
/// guardas.
/// </summary>
/// <remarks>
/// <para><b>O que e' uma guarda.</b> A moldura do codigo, e as colunas onde ela
/// esta. O desenho pinta-as mais altas, e essa e' a razao de o leitor as
/// encontrar: sao a ancora que diz onde o codigo comeca e acaba.</para>
///
/// <para><b>Sao indices de modulo, e nao de elemento</b> — e a distincao e' o que
/// separa este codigo de uma versao anterior. A conta <c>len(moldura) * largo</c>
/// assume que todos os elementos da moldura sao largos, e no Codabar a moldura do
/// inicio ocupa 23 modulos enquanto a conta dava 35: as 12 colunas a mais eram do
/// <b>primeiro caractere de dados</b>, pintadas com a altura da moldura. E no
/// Codabar isso nao e' cosmete — e' da moldura que o leitor tira a razao
/// larga/estreita.</para>
///
/// <para>A regra nao e' uma conta melhor, e' <b>medir</b>: a guarda vai de onde a
/// moldura comeca ate onde acaba, e isso sabe-se porque se acabou de acrescentar.
/// </para>
/// </remarks>
public sealed class CodigoDeBarras
{
    /// <param name="simbologia">O nome pedido, como `Code 39` ou `ITF`.</param>
    /// <param name="modulos">Um modulo por posicao; `true` e' escuro.</param>
    /// <param name="guardas">Os indices de modulo que sao moldura.</param>
    /// <param name="legenda">O texto que o leitor devolve.</param>
    public CodigoDeBarras(
        string simbologia,
        bool[] modulos,
        int[] guardas,
        string legenda)
    {
        this.Simbologia = simbologia;
        this.Modulos = modulos;
        this.Guardas = guardas;
        this.Legenda = legenda;
    }

    /// <summary>O nome da simbologia, como a pessoa a pede.</summary>
    public string Simbologia { get; }

    /// <summary>Um modulo por posicao, escuro ou claro.</summary>
    public bool[] Modulos { get; }

    /// <summary>
    /// Os indices de modulo que sao moldura.
    ///
    /// <para><b>Vazio nos formatos sem guardas.</b> O Code 128 nao tem barras-guarda
    /// como o EAN, e a barra final da paragem e' a referencia: marca-las fazia-as
    /// descer mais do que o leitor espera, e um <c>guardas</c> de <c>[0, len-1]</c>
    /// dava um codigo que o ZXing lia e um leitor de etiqueta recusava.</para>
    /// </summary>
    public int[] Guardas { get; }

    /// <summary>O texto que o leitor devolve, que e' o que se escreve por baixo.</summary>
    public string Legenda { get; }
}
