using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using QrCodeGenerator.Core.Simbologias;
using Xunit;
using ZXing;
using ZXing.Common;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nivel 2 do GS1 DataMatrix em C#: <b>o C# desenha e o ZXing le</b>.
/// </summary>
/// <remarks>
/// <para><b>E' a versao que apanha o que os testes estruturais nao apanham.</b> Um
/// <c>232</c> no sitio errado da o mesmo numero de modulos e desenha-se certo, e so
/// um leitor independente diz que o campo ficou partido.</para>
///
/// <para><b>E nao e' o <c>QRCoder</c> a desenhar e o ZXing a ler</b>, que seria mais
/// fraco: um erro comum aos dois passos passa. O <see cref="CodigoMatriz"/> e' o
/// nosso, e o ZXing le.</para>
///
/// <para><strong>E as afirmacoes de leitura foram medidas, nao supostas.</strong> Uma
/// sonda desenhou os simbolos e mostrou tudo o que o ZXing devolve, e
/// <b>tres das tres suposicoes estavam erradas</b>:</para>
/// <list type="table">
/// <item><term><c>Text</c></term><description>a supor <c>(01)0401...</c> entre
/// parenteses; o ZXing devolve <b><c>&lt;GS&gt;</c> mais o payload</b>.</description></item>
/// <item><term><c>RawBytes</c></term><description>a supor os caracteres; o ZXing
/// devolve <b>os codewords</b>, e sao o <b>prefixo</b> do que o encoder
/// escreveu.</description></item>
/// <item><term><c>]d2</c></term><description>a supor <c>]d2</c>; o ZXing devolve
/// <c>]d2</c> — a unica suposicao certa.</description></item>
/// </list>
///
/// <para><b>E sao tres leitores e tres formatos</b>, que a <c>AGENTS.md</c> avisa que nao
/// se traduzem uns nos outros: o <c>zxingcpp</c> de Python devolve os AI entre
/// parenteses, o ZXing no GS1-128 devolve o payload sem separadores, e o ZXing no GS1
/// DataMatrix devolve <c>&lt;GS&gt;</c> mais o payload.</para>
///
/// <para><strong>E as medidas sao do ZXing de C#, nao as do ZXing de Java.</strong> O
/// port de C# guarda os nomes de Java, e <c>ResultMetadataType</c> e' um
/// <c>object</c> e nao um <c>string</c>. <b>Supor que os dois deem a mesma coisa e'
/// supor.</b></para>
/// </remarks>
public class Gs1DataMatrixTests
{
    /// <summary>Quantos pixele por modulo. <b>Quatro</b>, como no resto.</summary>
    private const int Escala = 4;

    /// <summary>A zona muda, em modulos. <b>Dez</b>, como no outro ficheiro.</summary>
    private const int ZonaMuda = 10;

    /// <summary>
    /// Os casos e o que cada um mede.
    /// </summary>
    /// <remarks>
    /// <para><b>Um caso por ramo da logica e nao um caso por caminho feliz.</b> A
    /// <c>AGENTS.md</c> regista o Code 93: havia dez casos de leitura, todos de caminho
    /// feliz, e <b>nao havia um unico caracter de controlo</b> — enquanto o ficheiro que
    /// os gerava dizia na primeira linha que os tinha. A verificacao estava presente,
    /// era correcta, e media outra coisa.</para>
    ///
    /// <para>Os ramos aqui sao: o <b>valor numerico</b> (o GTIN aos pares), o
    /// <b>valor alfanumerico</b> (o lote em ASCII — <b>e' o outro ramo da mesma decisao,
    /// e um ramo sem caso e' um ramo onde um erro custa meses</b>), o
    /// <b>separador do meio</b>, a <b>posicao decimal implicita</b> do AI, e o
    /// <b>AI de comprimento fixo</b>, que nao emite separador nenhum.</para>
    /// </remarks>
    public static TheoryData<string, string> Casos => new()
    {
        {
            "o GTIN sozinho, que e' o valor numerico aos pares", "(01)04012345678901"
        },
        {
            "GTIN e um lote ao fim, que e' o valor alfanumerico em ASCII",
            "(01)04012345678901(10)LOTE-A1"
        },
        {
            "o lote no meio, que e' onde o separador vai", "(01)04012345678901(10)LOTE-A1(17)270630"
        },
        {
            "tres campos, com dois separadores", "(01)04012345678901(10)LOTE-A1(21)SER-000123(17)270630"
        },
        { "o AI 415, um GLN", "(415)0123456789012(10)LOTE-B2" },
        { "a posicao decimal implicita", "(3103)000123" },
        { "o AI 01 e o 17, ambos de comprimento fixo", "(01)04012345678901(17)270630" },

        // **O 3103 so' tem nove digitos, e um caso meu com onze foi recusado**
        // pelos testes. <b>Foi um caso suposto e nao medido</b>, que e' o erro que a
        // sonda existe para evitar: o 3103 e' N3 mais N6, e onze digitos
        // passam do seis. **O (3103)000123 de cima ja mede o ramo** — a posicao
        // decimal implicita — e um segundo caso do mesmo ramo nao acrescenta nada.
    };

    // ------------------------------------------------------------------ leitura

    [Theory]
    [MemberData(nameof(Casos))]
    public void OZXingLeOPayloadComOGsDoInicio(string nome, string texto)
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);
        Resultado r = Descodificar(codigo.Codigo);

        // **O `Text` e' o `GS` do inicio mais o payload**, e nada mais.
        //
        // **A suposta forma humana entre parenteses estava errada**, e nem a do
        // encoder: o ZXing escreve o separador do inicio a frente e consome-o, e o
        // `Payload` ja' tem os separadores do meio no sitio certo.
        Assert.Equal(Gs1_DataMatrix.Gs + codigo.Payload, r.Texto);
    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void OZXingViuOFnc1DoInicioQueEOD2eNaoOD1(string nome, string texto)
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);
        Resultado r = Descodificar(codigo.Codigo);

        // **O `]d2` e' o sintoma do FNC1 do inicio.** Um `]d1` e' um Data Matrix normal
        // e o codigo seria lido sem queixa nenhuma — o utilizador nunca ve a diferenca,
        // so o leitor de um sistema GS1.
        Assert.Equal("]d2", r.Identificador);

        // **E o formato tem de ser o Data Matrix**, e nao "outra coisa que tambem le".
        Assert.Equal(BarcodeFormat.DATA_MATRIX, r.Formato);
    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void OZXingViuOsSeparadoresQueOEncoderEmitiu(string nome, string texto)
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);
        Resultado r = Descodificar(codigo.Codigo);

        // **Contar os `0x1D` no `Text` e' o que confirma os separadores dos dois
        // lados.** O ZXing consome-os todos e escreve-os no texto: o do inicio a frente
        // e os do meio no sitio certo. **Contar nos `RawBytes` dava o mesmo numero por
        // coincidencia e nao porque confirmasse** — os codewords include o 232, e o
        // `Text` inclui o GS.
        int vistos = r.Texto.Count(c => c == Gs1_DataMatrix.Gs);
        Assert.Equal(codigo.Separadores, vistos);
    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void OsBytesDoZXingSaoOsCodewordsDoEncoderComoPrefixo(string nome, string texto)
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);
        Resultado r = Descodificar(codigo.Codigo);

        // **Sao os CODEWORDS, e sao o PREFIXO do que o encoder escreveu.** O `Encher`
        // acrescenta pads aleatorizados ate a capacidade, e o ZXing devolve-os tambem —
        // **por isso que a comparacao e' de prefixo e nao de igualdade**: o enchimento e'
        // aleatorio por desenho e uma igualdade falharia com ele, que nao e' um bug de
        // GS1.
        int[] meus = codigo.Codigo.Codewords;
        byte[] lidos = Assert.IsType<byte[]>(r.Crus);

        Assert.True(
            lidos.Length >= meus.Length,
            $"o ZXing leu {lidos.Length} e o encoder escreveu {meus.Length}");

        for (int i = 0; i < meus.Length; i++)
        {
            Assert.Equal(meus[i], lidos[i]);
        }
    }

    [Theory]
    [MemberData(nameof(Casos))]
    public void OSeparadorSoVaiNumCampoVariavelQueNaoSejaOUltimo(string nome, string texto)
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);

        // **Um separador por campo variavel que nao seja o ultimo, mais o do inicio.**
        // Um separador no fim nao separa de nada e o leitor accounta-o como parte do
        // campo seguinte.
        int variaveis = codigo.Campos.Take(codigo.Campos.Count - 1).Count(c => c.Separador);
        Assert.Equal(variaveis + 1, codigo.Separadores);
    }

    // ------------------------------------------------- o modo, em cada caso

    /// <summary>
    /// Cada campo vai no modo que o seu AI manda, em **cada caso** e nao num exemplo.
    /// </summary>
    /// <remarks>
    /// <para><b>Este teste existe porque reintroduzir o bug mostrou que so um apanhava
    /// o outro.</b> O <see cref="OGtin14VaiNoModoDeDigitosAosPares"/> fixa os codewords
    /// do GTIN e apanha — mas os outros 51 testes passavam com o encoder a mandar
    /// <b>todo</b> o valor em ASCII, e <b>os testes de leitura passavam tambem</b>: o
    /// ZXing le um GTIN em ASCII perfeitamente.</para>
    ///
    /// <para><b>Desenhava-se certo, lia-se certo, e ocupava o dobro do espaco</b> — e um
    /// teste de leitura nao tem como ver isso, porque o unico sintoma e' o tamanho, que
    /// ninguem affirmou.</para>
    ///
    /// <para><b>A regra:</b> o ramo precisa de um teste <b>por caso</b>, e nao de um
    /// teste que mede um exemplo. Um teste por exemplo mede o exemplo.</para>
    /// </remarks>
    [Theory]
    [MemberData(nameof(Casos))]
    public void CadaCampoVaiNoModoQueOSeuAiManda(string nome, string texto)
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);
        int[] cw = codigo.Codigo.Codewords;

        // **O indice do valor de cada campo**, reconstruido a partir do percurso: o AI
        // em digitos (1 ou 2 codewords, conforme o numero de digitos for par ou impar),
        // e depois o valor. Percorre-se na mesma ordem em que o encoder escreveu.
        int pos = 1;

        for (int i = 0; i < codigo.Campos.Count; i++)
        {
            CodigoGs1.Campo campo = codigo.Campos[i];

            // O AI em digitos: `Digitos` emparelha, e um digito sem par vai em ASCII.
            pos += (campo.Ai.Length + 1) / 2;

            if (campo.Numerico)
            {
                // **Aos pares: `cw - 130` tem de dar dois digitos.**
                int quantosPares = campo.Conteudo.Length / 2;
                for (int par = 0; par < quantosPares; par++)
                {
                    int valor = cw[pos + par] - 130;
                    Assert.InRange(valor, 0, 99);
                    Assert.True(
                        DigitosDoValor(valor).Length == 2,
                        $"o valor do AI ({campo.Ai}) tem um codeword que nao e' um par de digitos: {cw[pos + par]}");
                }

                pos += TamanoDoValor(campo, true);
            }
            else
            {
                // **Em ASCII: cada caractere e' um codeword, e o valor e' o caractere
                // mais um.** E' o outro ramo da mesma decisao, e um ramo sem caso e' um
                // ramo onde um erro custa meses — este ja custou um bug em tres stacks.
                Assert.Equal(campo.Conteudo.Length, TamanoDoValor(campo, false));

                for (int c = 0; c < campo.Conteudo.Length; c++)
                {
                    Assert.Equal(campo.Conteudo[c] + 1, cw[pos + c]);
                }

                pos += campo.Conteudo.Length;
            }

            // **E o separador, que e' um codeword e nao um digito do campo.** Sem esta
            // linha o indice fica atrasado um codeword a partir do segundo campo, e o
            // `232` — que e' um numero valido — e' lido como se fosse parte do valor.
            // **Um teste que mede o percurso com o percurso errado passa a medir outra
            // coisa**, que e' o `ComboBox` do C# que a `AGENTS.md` regista.
            //
            // **A regra e' a mesma do encoder, escrita outra vez**, e e' por isso que o
            // teste a mede: um separador no fim nao separa de nada.
            if (campo.Separador && i != codigo.Campos.Count - 1)
            {
                pos++;
            }
        }
    }

    /// <summary>Quantos codewords o valor de um campo ocupa, no modo indicado.</summary>
    /// <remarks>
    /// <b>Um digito sem par vai em ASCII</b>, e o valor mais um — o modo de digitos
    /// trabalha aos pares e nao ha outro jeito de codificar um digito isolado.
    /// </remarks>
    private static int TamanoDoValor(CodigoGs1.Campo campo, bool numerico)
    {
        if (!numerico)
        {
            return campo.Conteudo.Length;
        }

        // **Codewords e nao digitos.** Treze digitos em digitos sao **sete** codewords —
        // seis pares mais o ultimo a so, que vai em ASCII — e nao treze. E
        // `(n + 1) / 2` porque um digito sem par nao tem par.
        return (campo.Conteudo.Length + 1) / 2;
    }

    /// <summary>Um numero de dois digitos, com o zero a esquerda quando e' preciso.</summary>
    /// <remarks>
    /// **O zero a esquerda e' o que distingue <c>04</c> de <c>4</c>**, e e' a razao de o
    /// `cw - 130` ter de dar <b>exatamente</b> dois digitos: o <c>04</c> do GTIN e' o
    /// segundo codeword do simbolo, e perdia-se o zero.
    /// </remarks>
    private static string DigitosDoValor(int valor) =>
        valor.ToString("D2", System.Globalization.CultureInfo.InvariantCulture);

    // ------------------------------------------------------- os codewords, nivel 0

    [Fact]
    public void OGtin14VaiNoModoDeDigitosAosPares()
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar("(01)04012345678901");

        // **O `131` e' o `01` em digitos e os sete seguintes sao o GTIN aos pares.** Em
        // ASCII seriam catorze codewords e o simbolo sairia maior do que devia —
        // **desenhava-se certo, lia-se certo, e ocupava o dobro do espaco**, que e' o
        // bug que nenhum teste de leitura apanha.
        Assert.Equal(
            new[] { 232, 131, 134, 131, 153, 175, 197, 219, 131 },
            codigo.Codigo.Codewords);
    }

    [Fact]
    public void OValorDeUmAiAlfanumericoVaiEmAscii()
    {
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar("(01)04012345678901(10)LOTE-A1");
        int[] cw = codigo.Codigo.Codewords;

        // **O outro ramo da mesma decisao.** O `LOTE-A1` sao sete codewords, e nao
        // quatro — que e' o que aconteceria se o `Numerico` estivesse a dizer que sim
        // para todo o mundo.
        int pos10 = Array.IndexOf(cw, 140);
        Assert.True(pos10 > 0, "o AI 10 esta no modo de digitos, como 140");

        var lote = new StringBuilder();
        for (int i = pos10 + 1; i <= pos10 + 7; i++)
        {
            lote.Append((char)(cw[i] - 1));
        }

        Assert.Equal("LOTE-A1", lote.ToString());
    }

    [Fact]
    public void OValorSoVaiEmDigitosQuandoOValorEComDigitos()
    {
        // **Um AI numerico com um valor de digitos, e um AI alfanumerico com um valor de
        // digitos.** O segundo e' o caso que separa as duas perguntas: o `10` e'
        // alfanumerico pelo AI, e o valor `1234` so tem digitos — e vai em ASCII na
        // mesma.
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar("(01)04012345678901(10)1234");

        Assert.True(codigo.Campos[0].Numerico);
        Assert.False(codigo.Campos[1].Numerico);

        int pos10 = Array.IndexOf(codigo.Codigo.Codewords, 140);
        var valor = new StringBuilder();
        for (int i = pos10 + 1; i <= pos10 + 4; i++)
        {
            valor.Append((char)(codigo.Codigo.Codewords[i] - 1));
        }

        Assert.Equal("1234", valor.ToString());
    }

    // ---------------------------------------------------------------- as recusas

    [Theory]
    [InlineData("(01)9501101530003", "13")]
    [InlineData("(11)155630", "GS1")]
    [InlineData("(888)ABC", "nao existe")]
    [InlineData("(01)", "valor")]
    public void ARecusaDizPorque(string texto, string palavra)
    {
        SimbologiaException erro =
            Assert.Throws<SimbologiaException>(() => Gs1_DataMatrix.Gerar(texto));

        Assert.Contains(palavra, erro.Message);
    }

    [Fact]
    public void ARecusaIdentificaOGs1DataMatrix()
    {
        // **O `Analisar` e' o do GS1-128**, com um rotulo — a tabela e' a mesma. Sem o
        // rotulo, a mensagem mandava a pessoa procurar o erro num codigo de barras.
        SimbologiaException erro =
            Assert.Throws<SimbologiaException>(
                () => Gs1_DataMatrix.Gerar("(01)9501101530003"));

        Assert.StartsWith("GS1 DataMatrix: ", erro.Message);
    }

    [Fact]
    public void OGs1DataMatrixEOGs1128DizemOMesmoVeredictoNoMesmoAi()
    {
        // **O `253` e' `N3+N13[+X..17]`: ultimo componente 17, soma 30.** A tabela so
        // traz o do ultimo porque e' o que serve para **dividir**; para **conferir** e' a
        // soma. Sao 44 AIs em que a diferenca recusava um valor que a GS1 aceita.
        string trinta = new string('1', 30);

        Assert.NotNull(Gs1_DataMatrix.Gerar($"(253){trinta}"));
        Assert.NotNull(Gs1_128.Gerar($"(253){trinta}"));

        Assert.Throws<SimbologiaException>(
            () => Gs1_DataMatrix.Gerar("(253)" + new string('1', 31)));
        Assert.Throws<SimbologiaException>(
            () => Gs1_128.Gerar("(253)" + new string('1', 31)));
    }

    [Fact]
    public void OGs1121ContinuaADizerQueEumGs1121()
    {
        // **O outro lado da mesma coinparticao.** Sem isto, um rotulo trocado entre os
        // dois formatos passava: os testes do GS1-128 medem o texto certo e nao dizem
        // de que formato a recusa e'.
        SimbologiaException erro =
            Assert.Throws<SimbologiaException>(() => Gs1_128.Gerar("(01)9501101530003"));

        Assert.StartsWith("GS1-128: ", erro.Message);
    }

    // --------------------------------------------------------------- o desenho

    [Theory]
    [MemberData(nameof(Casos))]
    public void OCodigoNaoTemGuardasNemLegendaComoUmDataMatrixNaoTem(
        string nome, string texto)
    {
        // **E' o mesmo contrato que o Data Matrix normal**, e nao um GS1 DataMatrix com
        // uma moldura a mais: a guia tracejada e' a unica coisa a volta, e ha-la e' o
        // que diz ao leitor onde comeca o codigo.
        CodigoGs1Matriz codigo = Gs1_DataMatrix.Gerar(texto);

        Assert.Equal("GS1 DataMatrix", codigo.Codigo.Simbologia);
        Assert.Equal(codigo.Codigo.Linhas, codigo.Codigo.Colunas);
    }

    // ------------------------------------------------------------------ leitura

    private readonly record struct Resultado(
        BarcodeFormat Formato,
        string Texto,
        string? Identificador,
        byte[]? Crus);

    private static Resultado Descodificar(CodigoMatriz codigo)
    {
        int largura = (codigo.Colunas + 2 * ZonaMuda) * Escala;
        int altura = (codigo.Linhas + 2 * ZonaMuda) * Escala;

        using var origem = new Bitmap(largura, altura);

        // **Branco explicito.** Um `Bitmap` novo ja e' branco, mas escrever nao apaga o
        // que la estava, e um `Clear` faltado aqui daria modulos a mais sem nenhum erro.
        using (var gc = Graphics.FromImage(origem))
        {
            gc.Clear(Color.White);
        }

        for (int y = 0; y < codigo.Linhas; y++)
        {
            for (int x = 0; x < codigo.Colunas; x++)
            {
                if (!codigo.Modulos[y, x])
                {
                    continue;
                }

                int x0 = (x + ZonaMuda) * Escala;
                int y0 = (y + ZonaMuda) * Escala;
                for (int dx = 0; dx < Escala; dx++)
                {
                    for (int dy = 0; dy < Escala; dy++)
                    {
                        origem.SetPixel(x0 + dx, y0 + dy, Color.Black);
                    }
                }
            }
        }

        // **BGRA32, que e' o formato que o ZXing quer.** O `Bitmap` devolve 24 bpp e o
        // leitor quer os quatro canais em BGRA.
        using var imagem = new Bitmap(origem.Width, origem.Height, PixelFormat.Format32bppArgb);
        using (var gc = Graphics.FromImage(imagem))
        {
            gc.DrawImage(origem, 0, 0);
        }

        var dados = imagem.LockBits(
            new Rectangle(0, 0, imagem.Width, imagem.Height),
            ImageLockMode.ReadOnly,
            PixelFormat.Format32bppArgb);

        try
        {
            var bytes = new byte[Math.Abs(dados.Stride) * imagem.Height];
            System.Runtime.InteropServices.Marshal.Copy(dados.Scan0, bytes, 0, bytes.Length);

            var reader = new BarcodeReaderGeneric
            {
                AutoRotate = false,
                Options = new DecodingOptions
                {
                    TryHarder = true,
                    PossibleFormats = new List<BarcodeFormat> { BarcodeFormat.DATA_MATRIX },
                },
            };

            Result r = reader.Decode(
                bytes, imagem.Width, imagem.Height, RGBLuminanceSource.BitmapFormat.BGRA32);

            Assert.NotNull(r);

            return new Resultado(
                r!.BarcodeFormat,
                r.Text,
                // **O `ResultMetadataType` e' um `object` em C# e nao um `string`.** O
                // port de C# do ZXing guardou os nomes de Java, e um `as string?`
     //           silencioso dava `null` — que e' um valor que o teste aceitaria se nao
    //          afirmasse nada. E' `.ToString()` e nao um `as`.
    r.ResultMetadata?[ResultMetadataType.SYMBOLOGY_IDENTIFIER]?.ToString(),
    r.RawBytes);
        }
        catch (Exception e) when (e is not Xunit.Sdk.XunitException)
        {
            throw new Xunit.Sdk.XunitException(
                $"o ZXing nao leu o GS1 DataMatrix de {codigo.Simbologia}: {e.Message}");
        }
        finally
        {
            imagem.UnlockBits(dados);
        }
    }
}