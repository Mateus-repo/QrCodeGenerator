using System.Drawing;
using System.Drawing.Imaging;
using QrCodeGenerator.Core.Simbologias;
using ZXing;
using ZXing.Common;
using Xunit;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nivel 2 do Data Matrix em C#: <b>o C# desenha e o ZXing le</b>.
/// </summary>
/// <remarks>
/// <para><strong>E' uma classe a parte, e nao mais um <c>[Theory]</c> dentro do
/// <see cref="SimbologiasTests"/>.</strong> Nao e' por ser mais codigo: e' porque
/// o desenho e' outro. Um codigo de barras desenha-se com guardas que descem, uma
/// altura de 90 pixele e uma margem de cinco modulos; um Data Matrix tem as guias
/// em L dentro da propria grelha e uma zona muda de <b>um</b> modulo. O
/// <c>Ler</c> do outro ficheiro esta' a fazer o que o Data Matrix nao quer.</para>
///
/// <para><b>E' o mesmo que a stack Java e a stack Kotlin têm, e pelo mesmo
/// motivo.</b> Um encoder so entra no repositorio depois de o ZXing devolver a
/// cadeia certa. Nao ha "quase" - na fase dos codigos de barras, quatro encoders
/// pareceram certos durante a escrita e nao eram.</para>
///
/// <para><b>Os bytes, nunca o texto.</b> A comparacao e' por
/// <see cref="BarcodeReader.RawBytes"/> e nao por <c>Text</c>: o ZXing, na ausencia
/// de ECI, assume ISO-8859-1, e um Data Matrix nao tem ECI. O texto devolvido
/// <b>nao e' o texto que foi escrito</b>, e comparar as duas coisas daria um teste
/// que so passa para ASCII.</para>
///
/// <para><b>E os bytes crus sao os codewords, um por byte.</b> Foi o payload mais
/// curto a mostrar o que o metodo devolvia: <c>A</c> e' o codeword 66, e 66 em
/// ASCII e' a letra <c>B</c>. Um teste que le um campo e recebe outra coisa nao
/// falha - devolve outra coisa, e o teste passa se comparar na coisa errada.</para>
/// </remarks>
public class DataMatrixTests
{
    /// <summary>Quantos pixele por modulo.</summary>
    /// <remarks>
    /// <b>Quatro, e nao um.</b> O ZXing detecta o simbolo por contraste, e a um
    /// pixele por modulo um codigo pequeno da problemas de amostragem nos cantos
    /// tracejados, que sao a unica coisa de que o leitor se serve para se orientar.
    /// </remarks>
    private const int Escala = 4;

    /// <summary>A zona muda, em modulos.</summary>
    /// <remarks>
    /// <b>Um, e nao dez como no EAN.</b> O leitor orienta-se pelos cantos tracejados,
    /// e sem margem a deteccao falha. Quatro nao arranjam, e um Data Matrix
    /// desenhado com a margem do EAN fica maior do que a precisa e nao e' por isso
    /// que nao se lê.
    /// </remarks>
    private const int ZonaMuda = 1;

    /// <summary>
    /// Os payloads, e o que cada um mede.
    /// </summary>
    /// <remarks>
    /// <para><b>Um caso por ramo da logica e nao um caso por caminho feliz.</b> A
    /// <c>AGENTS.md</c> regista o que aconteceu com o Code 93: havia dez casos de
    /// leitura, todos de caminho feliz, e <b>nao havia um unico caracter de
    /// controlo</b> - enquanto o ficheiro que os gerava dizia que os tinha. A
    /// verificacao estava presente, era correcta, e media outra coisa.</para>
    ///
    /// <para>Aqui os ramos sao: o minimo, o texto, os digitos aos pares, o
    /// deslocamento para ASCII estendido, e os simbolos com mais do que um bloco
    /// de correccao, que e' onde o entrelacamento se ve.</para>
    /// </remarks>
    public static TheoryData<string, string> Payloads => new()
    {
        { "uma letra, que e' o simbolo mais pequeno", "A" },
        { "duas letras", "AB" },
        { "texto", "MAST-2024-0001" },
        { "digitos aos pares", "4531234567890123" },
        { "32 digitos", "12345678901234567890123456789012" },
        { "digitos repetidos", "0000000000000000000000000" },

        // **O deslocamento para ASCII estendido.** Cada acento custa dois
        // codewords. **Foi com estes dois que o `b - 128` dava um `r` onde estava
        // um `c`** - e so nos com acentos, que e' a assinatura de um erro que so
        // aparece no canto.
        { "com acentos", "Fatura nº 2026/09 — açúcar, €45,80" },
        { "com emoji", "Lote ✅ 42 — pronto 🚀" },

        // **Payloads que passam por simbolos com mais do que um bloco de
        // correccao.** Um simbolo com um bloco so nao tem entrelacamento nenhum, e
        // um teste com um deles nunca tocaria nessa parte.
        { "120 caracteres", new string('X', 120) },
        { "400 caracteres", new string('Y', 400) },
        { "900 caracteres", new string('Z', 900) },
        { "1400 digitos", new string('9', 1400) },
    };

    [Theory]
    [MemberData(nameof(Payloads))]
    public void ODataMatrixELidoPeloZXing(string nome, string texto)
    {
        Assert.Equal(
            DataMatrix.Compactar(System.Text.Encoding.UTF8.GetBytes(texto)),
            Ler(DataMatrix.Gerar(texto), texto));
    }

    [Fact]
    public void OZXingLeComoDataMatrixENaoComoOutraCoisa()
    {
        // **Um leitor que devolve o texto certo na formatacao errada passa num
        // teste so de texto.** E ja aconteceu neste repositorio: o ITF sem
        // `PureBarcode` e' lido como Code 128, porque o ITF tem sempre digitos e
        // uma moldura compativel.
        Assert.Equal(
            BarcodeFormat.DATA_MATRIX, Formato(DataMatrix.Gerar("MAST-2024-0001")));
    }

    [Fact]
    public void OTextoDoZXingSoEComparavelNoAscii()
    {
        // **O `Text` funciona, e e' por isso que o teste de texto nao esta' nos
        // casos com acentos.** Um `c-cedilha` em UTF-8 e' `0xC3 0xA7`; o ZXing,
        // sem ECI, devolve os dois caracteres ISO-8859-1 correspondentes. O texto
        // devolvido **nao e' o texto escrito**, e um teste que comparasse os dois
        // falharia por uma razao que nao tem nada a ver com o encoder.
        Assert.Equal("MAST-2024-0001", Texto(DataMatrix.Gerar("MAST-2024-0001")));
        Assert.Equal("4531234567890123", Texto(DataMatrix.Gerar("4531234567890123")));
    }

    // --- a estrutura, que e' o que a leitura sozinha nao diz ---------------

    [Fact]
    public void AGuiaDeBaixoEDaEsquerdaSaoCheiasEADeCimaETracejada()
    {
        // **A assimetria das guias e' a assinatura do Data Matrix**, e e' a coisa de
        // que o leitor se serve para se orientar. As quatro iguais nao e' lido.
        bool[,] modulos = DataMatrix.Gerar("MAST-2024-0001").Modulos;

        for (int y = 0; y < modulos.GetLength(0); y++)
        {
            Assert.True(modulos[y, 0], "a guia da esquerda e' o vertical do L e e' cheia");
        }

        int ultima = modulos.GetLength(0) - 1;
        for (int x = 0; x < modulos.GetLength(1); x++)
        {
            Assert.True(modulos[ultima, x], "a guia de baixo e' o horizontal do L e e' cheia");
        }

        // **A de cima alterna com a posicao**, e nao com a linha: um modulo par e'
        // escuro, um impar e' claro.
        for (int x = 0; x < modulos.GetLength(1); x++)
        {
            // **O `Assert.Equal` do xUnit 2 nao tem sobrecarga de mensagem.**
            // O compilador procura a de `IEqualityComparer<bool>` e diz
            // "cannot convert from string to Func<bool, bool, bool>" - que e'
            // uma mensagem sobre colecoes quando o problema e' a mensagem.
            Assert.True(
                (x % 2 == 0) == modulos[0, x],
                $"a guia de cima alterna com a posicao: coluna {x}");
        }
    }

    [Fact]
    public void OCodigoNaoTemGuardasNemLegendaENaoTemComoTer()
    {
        // **Um 2D nao tem as duas coisas, e nao deve poder fingir que tem.** Um
        // `Guardas` vazio seria um campo que o desenho le e nao usa, e uma legenda
        // vazia seria um codigo que o leitor funciona e a folha impressa nao bate -
        // que e' o pior caso numa etiqueta.
        //
        // **A verificacao e' por reflexao, e nao por leitura do codigo.** Ver o
        // `CodigoMatriz` e concluir que nao ha `Legenda` prova que nao ha hoje; a
        // reflexao prova que nao ha nenhum membro com esse nome, e um acrescentado
        // e' apanhado aqui em vez de por quem desenhar e descobrir o campo vazio.
        foreach (var membro in typeof(CodigoMatriz).GetMembers())
        {
            string nome = membro.Name.ToLowerInvariant();
            Assert.False(
                nome.Contains("legenda") || nome.Contains("guarda"),
                $"o CodigoMatriz tem '{membro.Name}', e um codigo 2D nao tem nem legenda "
                    + "nem guardas: as guias em L estao na propria grelha");
        }

        var codigo = DataMatrix.Gerar("MAST-2024-0001");
        Assert.Equal(16, codigo.Colunas);
        Assert.Equal(16, codigo.Linhas);
    }

    [Fact]
    public void AMatrizTemUmaDensidadeDeTintaDeCodigoDeBarras()
    {
        // **Nem tudo nem nada.** Um encoder que deixasse a regiao de dados toda
        // branca desenha-se como um Data Matrix com um quadrado no meio e nao e'
        // lido; um que a deixasse toda preta tambem. **Um `bool[,]` nao permite
        // outros valores**, por isso que a pergunta nao e' "tem 0 e 1" mas "tem a
        // mistura certa" - e uma pergunta que um `Assert.True(m || !m)` nunca
        // responderia.
        foreach (string texto in new[] { "A", "MAST-2024-0001", new string('9', 900) })
        {
            var codigo = DataMatrix.Gerar(texto);

            int escuros = 0;
            for (int y = 0; y < codigo.Linhas; y++)
            {
                for (int x = 0; x < codigo.Colunas; x++)
                {
                    if (codigo.Modulos[y, x])
                    {
                        escuros++;
                    }
                }
            }

            double densidade = (double)escuros / (codigo.Linhas * codigo.Colunas);
            Assert.True(
                densidade > 0.2 && densidade < 0.8,
                $"'{texto}' saiu com {(int)(densidade * 100)}% de tinta, e um codigo de "
                    + $"barras fica entre 20% e 80%:\n{codigo.ComoTexto()}");
        }
    }

    [Fact]
    public void O144x144TemDezBlocosEAContaFecha()
    {
        // **8 x 156 + 2 x 155 = 1558.** Com 154 dava 1556, e dois codewords a menos
        // num codigo de 1558 e' o tipo de erro que o leitor acusa como corrupcao e
        // nao como tabela errada.
        int capacidade = TabelasDataMatrix.Simbolos[23][0];

        Assert.Equal(10, TabelasDataMatrix.ULTIMO_BLOCOS);
        Assert.Equal(8, TabelasDataMatrix.ULTIMO_CHEIOS);
        Assert.Equal(1558, capacidade);
        Assert.Equal(
            capacidade,
            TabelasDataMatrix.ULTIMO_CHEIOS * TabelasDataMatrix.ULTIMO_DADOSCHEIO
                + (TabelasDataMatrix.ULTIMO_BLOCOS - TabelasDataMatrix.ULTIMO_CHEIOS)
                    * TabelasDataMatrix.ULTIMO_DADOSULTIMOS);
        Assert.Equal(1558, DataMatrix.CapacidadeMaxima);
    }

    [Fact]
    public void AChaveDosFactoresEOComprimentoDoConjunto()
    {
        // **A chave e' o numero de codewords de correccao, que e' o comprimento do
        // conjunto.** Os primeiros indices e os primeiros comprimentos coincidem por
        // acaso e os ultimos nao.
        int[] esperados = { 5, 7, 10, 11, 12, 14, 18, 20, 24, 28, 36, 42, 48, 56, 62, 68 };

        Assert.Equal(esperados.Length, TabelasDataMatrix.Fatores.Count);

        foreach (int chave in esperados)
        {
            Assert.True(
                TabelasDataMatrix.Fatores.TryGetValue(chave, out int[] conjunto),
                $"FATORES nao tem a chave {chave}");
            Assert.True(
                chave == conjunto.Length,
                $"FATORES[{chave}] tem comprimento errado");
        }
    }

    // --- o que o encoder recusa ---------------------------------------------

    [Fact]
    public void ODataMatrixRecusaTextoVazio()
    {
        Assert.Throws<SimbologiaException>(() => DataMatrix.Gerar(""));
    }

    [Fact]
    public void ODataMatrixRecusaOQueNaoCabeEAMensagemDizOLimite()
    {
        var erro = Assert.Throws<SimbologiaException>(
            () => DataMatrix.Gerar(new string('A', 4000)));
        Assert.Contains("1558", erro.Message);
    }

    [Fact]
    public void ODataMatrixAceitaOQueUmCodigoDeBarrasRecusa()
    {
        // **E' a grande diferenca entre os dois.** Um Code 39 recusa o emoji e o
        // Code 93 recusa tudo acima de 127; aqui qualquer UTF-8 cabe, porque cada
        // byte alto custa dois codewords em vez de ser recusado.
        const string texto = "ação 🚀";
        var codigo = DataMatrix.Gerar(texto);

        Assert.True(codigo.Usado <= codigo.Dados, "cinco caracteres nao cabem em mais");
        Assert.Equal(
            DataMatrix.Compactar(System.Text.Encoding.UTF8.GetBytes(texto)),
            Ler(codigo, texto));
    }

    [Fact]
    public void UmEspacoEConteudoValido()
    {
        // **O que se recusa e' a cadeia vazia, e nao o texto sem caracteres
        // visiveis.** Um espaco numa etiqueta de peca e' normal.
        Assert.Equal(1, DataMatrix.Gerar(" ").Usado);
    }

    // --- a colocacao, chamada directamente ---------------------------------

    [Fact]
    public void OCantoDeBaixoADireitaEstaPosto()
    {
        // **Pela grelha final nao se sabe se o bloco do canto correu**, e por isso
        // que aqui se mede a regiao nua, antes das guias. O `colocar()` e'
        // `internal` e este ficheiro esta' noutro assembly - e a razao de haver uma
        // `ColocacaoDataMatrixTests` em `core` e nao aqui.
        int[] dados = DataMatrix.Compactar(System.Text.Encoding.UTF8.GetBytes("MAST-2024-0001"));

        int[] simbolo = TabelasDataMatrix.Simbolos.First(s => dados.Length <= s[0]);
        var g = new DataMatrix.Geometria(simbolo);

        int[] regiao = DataMatrix.Colocar(
            DataMatrix.Encher(dados, simbolo[0] + simbolo[1]), g.DadosColunas, g.DadosLinhas);

        int lado = g.DadosColunas;

        // **E' "nao ficou por preencher", e nao "ficou escuro".** Nos simbolos em
        // que a varredura chega ao canto, ele fica com o valor do ultimo codeword -
        // que num bloco de zeros e' zero, e por isso que afirmar "o canto e'
        // escuro" falhava em sete dos vinte e quatro sem que houvesse bug nenhum.
        //
        // **E nao ha mensagem nestas duas linhas**, porque o `Assert.NotEqual` do
        // xUnit 2 tambem nao tem sobrecarga de mensagem: o compilador diz
        // "cannot convert from string to Func<int, int, bool>" e a pergunta que se
        // le e' porque e' que a funcao esta ali.
        Assert.NotEqual(
            -1, regiao[(lado - 1) * lado + (lado - 1)]);
        Assert.NotEqual(
            -1, regiao[(lado - 2) * lado + (lado - 2)]);
    }

    // --- a leitura ----------------------------------------------------------

    /// <summary>
    /// Desenha a matriz e devolve <b>os codewords que o ZXing leu</b>.
    /// </summary>
    /// <remarks>
    /// <b>E' o <c>RawBytes</c> e nao o <c>Text</c></b>, e a razao nao e' uma
    /// preferencia - e' que o <c>Text</c> nao pode ser comparado. Ver a nota da
    /// classe.
    /// </remarks>
    private static int[] Ler(CodigoMatriz codigo, string esperado)
    {
        Resultado resultado = Descodificar(codigo);

        Assert.Equal(BarcodeFormat.DATA_MATRIX, resultado.Formato);
        Assert.NotNull(resultado.Crus);

        int[] esperados = DataMatrix.Compactar(System.Text.Encoding.UTF8.GetBytes(esperado));

        Assert.True(
            resultado.Crus!.Length >= esperados.Length,
            $"o ZXing leu {resultado.Crus.Length} codewords e o encoder mandou {esperados.Length}");

        var lidos = new int[esperados.Length];
        for (int i = 0; i < esperados.Length; i++)
        {
            lidos[i] = resultado.Crus[i] & 0xFF;
            Assert.True(
                esperados[i] == lidos[i],
                $"o codeword {i} difere: o encoder mandou {esperados[i]} e o ZXing leu "
                    + $"{lidos[i]}\nA matriz era:\n{codigo.ComoTexto()}");
        }

        return lidos;
    }

    /// <summary>O texto, para os casos em que o texto e' a coisa a medir.</summary>
    private static string Texto(CodigoMatriz codigo) => Descodificar(codigo).Texto;

    /// <summary>A formatacao com que o ZXing le.</summary>
    private static BarcodeFormat Formato(CodigoMatriz codigo) => Descodificar(codigo).Formato;

    private readonly record struct Resultado(
        BarcodeFormat Formato, string Texto, byte[]? Crus);

    private static Resultado Descodificar(CodigoMatriz codigo)
    {
        int largura = (codigo.Colunas + 2 * ZonaMuda) * Escala;
        int altura = (codigo.Linhas + 2 * ZonaMuda) * Escala;

        using var origem = new Bitmap(largura, altura);

        // **Branco explicito.** Um `Bitmap` novo ja e' branco, mas escrever nao
        // apaga o que la estava, e um `Clear` faltado aqui daria modulos a mais sem
        // nenhum erro - o que seria um sintoma impossivel de ler.
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

        // **BGRA32, que e' o formato que o ZXing quer.** O `Bitmap` devolve 24 bpp e
        // o leitor quer os quatro canais em BGRA.
        using var imagem = new Bitmap(
            origem.Width, origem.Height, PixelFormat.Format32bppArgb);

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

            var resultado = reader.Decode(
                bytes, imagem.Width, imagem.Height, RGBLuminanceSource.BitmapFormat.BGRA32);

            Assert.NotNull(resultado);

            return new Resultado(resultado.BarcodeFormat!, resultado.Text, resultado.RawBytes);
        }
        catch (Exception e) when (e is not Xunit.Sdk.XunitException)
        {
            throw new Xunit.Sdk.XunitException(
                $"Falha ao descodificar com o ZXing: {e.Message}\nA matriz era:\n{codigo.ComoTexto()}");
        }
        finally
        {
            imagem.UnlockBits(dados);
        }
    }
}