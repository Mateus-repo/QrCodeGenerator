using System.Drawing;
using System.Drawing.Imaging;
using QrCodeGenerator.Core.Simbologias;
using Xunit;
using ZXing;
using ZXing.Common;

namespace QrCodeGenerator.Tests;

/// <summary>
/// Nivel 2 das simbologias: <b>o C# desenha e o ZXing le</b>.
/// </summary>
/// <remarks>
/// <para><b>E' a mesma versao que a stack Java e a Kotlin tem, e pelo mesmo
/// motivo.</b> O <c>RenderTests</c> desenha o QR com o QRCoder e le-o com o
/// ZXing, e isso e' mais fraco: um erro comum aos dois passos passa
/// despercebido. Aqui <b>o codigo sob teste e' o que poe os modulos no papel</b>, e
/// o ZXing limita-se a ler.</para>
///
/// <para><b>Os testes de leitura nao escrevem nenhum digito de controlo a mao.</b> O
/// Code 39 e' testado sem ele, e o ITF-14 traz o valor que o leitor devolve. Um
/// digito escrito a mao seria uma segunda conta a validar ao lado da do encoder,
/// e duas contas que divergem dizem menos do que uma.</para>
/// </remarks>
public class SimbologiasTests
{
    private const int Escala = 4;
    private const int Altura = 90;

    // --- leitura ------------------------------------------------------------

    [Theory]
    // **O Code 39 e' testado sem digito de controlo**, e por isso o esperado e'
    // exactamente o texto. Com o digito o ZXing devolveria o texto acrescido dele
    // e a expectativa passaria a depender de uma segunda conta.
    [InlineData("CODE-39")]
    [InlineData("ABC123")]
    [InlineData("A$-/+%")]
    [InlineData("ESPACO AQUI")]
    [InlineData("1234567890")]
    public void Code39Elegivel(string texto) =>
        Assert.Equal(texto, Ler(Lineares.Code39(texto, comControlo: false), BarcodeFormat.CODE_39));

    [Theory]
    // **O ITF-14 traz o digito de controlo e o leitor devolve-o**, por isso aqui a
    // expectativa inclui-o.
    [InlineData("1234567890128", "12345678901286")]
    [InlineData("0001234567890", "00012345678905")]
    public void Itf14Elegivel(string entrada, string esperado) =>
        Assert.Equal(esperado, Ler(Lineares.Itf14(entrada), BarcodeFormat.ITF));

    [Theory]
    [InlineData("123456")]
    [InlineData("00123456789012")]
    public void ItfElegivel(string texto) =>
        Assert.Equal(texto, Ler(Lineares.Itf(texto), BarcodeFormat.ITF));

    [Theory]
    // **O ZXing devolve so os dados, sem os caracteres de moldura.** E' o
    // comportamento normalizado do leitor para o Codabar, e o
    // `spec/verificar-lineares.py` ja conta com ele. A moldura e' o que o leitor
    // usa para calibrar, nao parte do texto.
    [InlineData("123456", "A", "A", false)]
    [InlineData("123456", "B", "B", false)]
    [InlineData("12345", "D", "D", false)]
    [InlineData("12-34$56/78:+9.0", "C", "C", false)]
    [InlineData("123456", "A", "A", true)]
    public void CodabarElegivel(string texto, string inicio, string paragem, bool largo) =>
        Assert.Equal(texto, Ler(Lineares.Codabar(texto, inicio, paragem, largo), BarcodeFormat.CODABAR));

    [Theory]
    [InlineData("Hi")]
    [InlineData("ABC123")]
    [InlineData("12345678")]
    [InlineData("abc-123")]
    [InlineData("Code 128")]
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXYZ")]
    [InlineData("0123456789")]
    // **Os digitos seguidos sao o que obriga a comutar para o conjunto C.** Sem os
    // caracteres de comuta o codigo desenha-se perfeito e o ZXing devolve `ABC,3`
    // em vez de `ABC123` — foi assim que o bug apareceu da primeira vez.
    [InlineData("ABC12345678901234567890")]
    public void Code128Elegivel(string texto) =>
        Assert.Equal(texto, Ler(Code128.Gerar(texto), BarcodeFormat.CODE_128));

    // --- a estrutura, que e' o que a leitura sozinha nao diz ---------------

    [Theory]
    [InlineData("Hi")]
    [InlineData("ABC123")]
    [InlineData("12345678")]
    [InlineData("abc-123")]
    [InlineData("Code 128")]
    public void Code128MedeOnzePorSimbolo(string texto)
    {
        // **A regra que o bug do indice quebrou.** Um simbolo do Code 128 tem sempre
        // 11 modulos. O codigo antigo dava 12 ao primeiro simbolo de cada valor,
        // porque a cor do elemento vinha do indice do caracter dentro da cadeia e
        // nao do numero do elemento.
        //
        // **Contar pelo total e' o que torna o teste honesto:** a API nao expoe o
        // simbolo isolado, e nao deve. O total da para checkar porque 11 x simbolos
        // + 13 da paragem, e o digito de controlo e' mais um simbolo.
        int[] valores = Code128.ValoresDe(texto);
        int esperado = 11 * (valores.Length + 1) + 13;

        Assert.Equal(esperado, Code128.Gerar(texto).Modulos.Length);
    }

    [Fact]
    public void MolduraDeInicioDoItfNaoTemBarraLarga()
    {
        // **O bug da caixa da letra.** `NnNn` tem quatro elementos estreitos, e
        // decide-se pela letra — `N` e' estreito — e nao pela caixa. Lido pela caixa o
        // `N` saia largo e a moldura comecava com uma barra de dois modulos, que e'
        // um elemento que o ITF nao tem.
        bool[] modulos = Lineares.Itf("123456").Modulos;

        for (int i = 0; i < 3; i++)
        {
            Assert.False(
                modulos[i] && modulos[i + 1],
                $"a moldura de inicio do ITF tem dois modulos escuros seguidos no "
                + $"modulo {i}, o que e' uma barra larga");
        }
    }

    [Fact]
    public void GuardasDoCodabarNaoChegamAosDados()
    {
        // **A regra que o Python errava.** As guardas sao indices de modulo e nao de
        // elemento: a moldura do inicio ocupa 23 modulos e a conta antiga
        // `len(moldura) * largo` dava 35, marcando 12 colunas do primeiro caractere
        // de dados. Sao **duas** molduras, 23 + 23.
        int[] guardas = Lineares.Codabar("123456").Guardas;

        Assert.Equal(46, guardas.Length);
        Assert.Equal(22, guardas[22]);
        Assert.True(guardas[23] > guardas[22], "a moldura de paragem vem depois da de inicio");
    }

    [Fact]
    public void GuardasDoItfIncluemAParagem()
    {
        // A paragem `WnN` ocupa 4 modulos — 2 + 1 + 1 — e a conta antiga
        // `len(ITF_PARAGEM)` marcava 3, deixando a ultima barra da paragem com a
        // altura de uma barra de dados. E' a barra que distingue a paragem.
        CodigoDeBarras itf = Lineares.Itf("123456");
        int ultimo = itf.Modulos.Length - 1;

        Assert.Contains(ultimo, itf.Guardas);
    }

    [Fact]
    public void Code39CumpreOExemploPublicado()
    {
        // **O exemplo vem da documentacao do ZPL da Zebra**, que da o algoritmo com
        // numeros:
        //
        //   dados `12345ABCDE/`
        //   1+2+3+4+5 = 15;  A..E = 10+11+12+13+14 = 60;  `/` = 40
        //   soma = 115
        //   115 / 43 = 2, resto 29
        //   29 e' a letra `T`   ->   o digito e' `T`
        //
        // **Por que um exemplo publicado e nao uma constante escrita a mao.** Este
        // repositorio ja descobriu que a regra e' o resto, e nao "o que falta para a
        // soma dar inteiro", por causa de um comentario que dizia o contrario — e
        // quase became um bug em tres stacks. E' o mesmo motivo pelo qual as
        // tabelas dos codigos de barras vem de um gerador.
        Assert.Equal(115, SomaDe("12345ABCDE/"));
        Assert.Equal(29, 115 % 43);
        Assert.Equal("T", DigitoDeControlo39("12345ABCDE/"));
    }

    [Fact]
    public void Code39TomaDigitoDeControlo()
    {
        // **A regra esta aqui, e nao so num comentario, para que mudar quebre este
        // teste.** Um teste que so verificasse que ha um digito deixaria passar as
        // duas regras — o resto e o complementar — que sao precisamente as duas que
        // este repositorio ja confundiu uma vez.
        const string texto = "CODE-39";
        string legenda = Lineares.Code39(texto).Legenda;

        Assert.StartsWith(texto, legenda);
        Assert.Equal(texto.Length + 1, legenda.Length);
        Assert.Equal(texto + DigitoDeControlo39(texto), legenda);

        Assert.Equal("00012345678905", Lineares.Itf14("0001234567890").Legenda);
    }

    // --- o que o encoder recusa --------------------------------------------

    [Fact]
    public void ItfRecusaImpar()
    {
        var erro = Assert.Throws<SimbologiaException>(() => Lineares.Itf("12345"));
        Assert.Contains("ITF-14", erro.Message);
    }

    [Theory]
    [InlineData("1234")]
    [InlineData("123456789012345")]
    public void Itf14RecusaContagem(string texto) =>
        Assert.Throws<SimbologiaException>(() => Lineares.Itf14(texto));

    [Theory]
    [InlineData("Z", "A")]
    [InlineData("A", "Z")]
    public void CodabarRecusaMoldura(string inicio, string paragem)
    {
        var erro = Assert.Throws<SimbologiaException>(
            () => Lineares.Codabar("123456", inicio, paragem, false));
        Assert.Contains("A, B, C", erro.Message);
    }

    [Fact]
    public void CodabarRecusaMolduraNosDados()
    {
        // **Um `A` no meio do texto era codificado com a tabela de dados e o leitor
        // lia-o como moldura:** o codigo passava a parte estrutural e partia a meio,
        // sem erro nenhum pelo caminho.
        var erro = Assert.Throws<SimbologiaException>(() => Lineares.Codabar("12A456"));
        Assert.Contains("inicio ou paragem", erro.Message);
    }

    [Fact]
    public void CodabarRecusaVazio() =>
        Assert.Throws<SimbologiaException>(() => Lineares.Codabar(""));

    [Theory]
    [InlineData("A@B")]
    [InlineData("A(B")]
    [InlineData("A#B")]
    public void Code39RecusaForaDoAlfabeto(string texto)
    {
        var erro = Assert.Throws<SimbologiaException>(() => Lineares.Code39(texto));
        Assert.Contains("0123456789", erro.Message);
    }

    [Fact]
    public void Code39RecusaAsterisco()
    {
        var erro = Assert.Throws<SimbologiaException>(() => Lineares.Code39("*ABC*"));
        Assert.Contains("asterisco", erro.Message);
    }

    [Fact]
    public void Code128RecusaNaoAscii()
    {
        var erro = Assert.Throws<SimbologiaException>(() => Code128.Gerar("olá"));
        Assert.Contains("QR", erro.Message);
    }

    [Fact]
    public void Code128RecusaConjunto()
    {
        var erro = Assert.Throws<SimbologiaException>(() => Code128.Gerar("ABC", 9));
        Assert.Contains("A, B ou C", erro.Message);
    }

    // --- implementado -------------------------------------------------------

    /// <summary>
    /// Desenha os modulos e devolve o que o ZXing le.
    /// </summary>
    /// <remarks>
    /// <b>Preto sobre branco, com zona silenciosa.</b> A margem nao e' decorativa: sem
    /// ela o ZXing nao encontra o codigo, e o teste falha por um motivo que nao tem
    /// nada a ver com o encoder.
    /// </remarks>
    private static string Ler(CodigoDeBarras codigo, BarcodeFormat formato)
    {
        bool[] modulos = codigo.Modulos;
        int margem = formato == BarcodeFormat.ITF ? 10 : 5;

        int largura = (modulos.Length + 2 * margem) * Escala;
        int altura = Altura;

        using var origem = new Bitmap(largura, altura);

        // **Branco explicito.** Um `Bitmap` novo ja e' branco, mas escrever nao
        // apaga o que la estava, e um `Clear` faltado aqui dava barras a mais sem
        // nenhum erro — o que seria um sintoma impossivel de ler.
        using (var gc = Graphics.FromImage(origem))
        {
            gc.Clear(Color.White);
        }

        for (int i = 0; i < modulos.Length; i++)
        {
            if (!modulos[i])
            {
                continue;
            }

            int x0 = (i + margem) * Escala;
            for (int x = x0; x < x0 + Escala; x++)
            {
                for (int y = 0; y < altura; y++)
                {
                    origem.SetPixel(x, y, Color.Black);
                }
            }
        }

        // **BGRA32, que e' o formato que o ZXing quer.** O `RenderTests` faz o mesmo
        // e explica porquê: o `Bitmap` devolve 24 bpp e o leitor quer os quatro
        // canais em BGRA.
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
                    // **O ITF precisa disto e os outros nao.** Sem a dica, o ZXing
                    // tenta tambem o Code 128 e escolhe-o, porque o ITF tem sempre
                    // digitos e uma moldura compativel — e o teste passava a comparar
                    // o texto de outro codigo.
                    PureBarcode = formato == BarcodeFormat.ITF,
                    PossibleFormats = new List<BarcodeFormat> { formato },
                },
            };

            var resultado = reader.Decode(
                bytes, imagem.Width, imagem.Height, RGBLuminanceSource.BitmapFormat.BGRA32);

            Assert.NotNull(resultado);
            return resultado.Text;
        }
        finally
        {
            imagem.UnlockBits(dados);
        }
    }

    /// <summary>
    /// A soma dos indices, para o exemplo publicado da Zebra.
    /// </summary>
    /// <remarks>
    /// Escrito aqui, e nao copiado do encoder: se os dois fossem a mesma conta, o
    /// teste nao provaria nada.
    /// </remarks>
    private static int SomaDe(string texto)
    {
        const string alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
        int soma = 0;

        foreach (char c in texto)
        {
            int indice = alfabeto.IndexOf(c);
            Assert.True(indice >= 0, $"'{c}' nao existe no Code 39");
            soma += indice;
        }

        return soma;
    }

    /// <summary>O digito pela regra publicada: o resto da divisao por 43.</summary>
    private static string DigitoDeControlo39(string texto) =>
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%".Substring(SomaDe(texto) % 43, 1);
}
