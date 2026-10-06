using System.Collections.Generic;
using System.Text;

namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// O Code 93.
/// </summary>
/// <remarks>
/// <para>E' o codigo de barras dos automoveis e da defesa, e o unico que
/// transporta os 128 caracteres ASCII com a mesma correccao de erros — e ao
/// mesmo tempo e' <b>compacto demais</b>: seis caracteres, tres barras e tres
/// espacos, onde o Code 39 usa nove elementos por caracter.</para>
///
/// <para><b>Onde e' que ele ganha ao Code 39.</b> A razao esta no numero de
/// elementos. O Code 39 e' "sete de nove e dois de cinco", porque cada
/// caracter e' um start, seis barras e espacos, e um stop — e o espaco entre
/// caracteres e' um espaco estreito. <b>O Code 93 nao tem separacao</b>: os
/// caracteres correm uns nos outros, e a barra de inicio e a de fim servem de
/// separador.</para>
///
/// <para><b>Os dois digitos de controlo.</b> Ao contrario do Code 39, que tem um,
/// o Code 93 tem <b>dois</b>, com pesos diferentes: o primeiro pesa 1 a 20 e o
/// segundo 1 a 15, ambos aplicados de tras para a frente. E' o que torna o
/// codigo seguro contra a inversao de dois caracteres, que o Code 39 nao
/// apanha.</para>
///
/// <para><b>As tabelas sao geradas.</b> Nem os 48 padroes nem os pares de escape
/// estao neste ficheiro. Vem do <c>spec/gerar-tabelas-code93.py</c>, que os
/// extrai do <c>Code93Reader.java</c> do ZXing — a mesma fonte que o leitor usa
/// para verificar o que este encoder produz.</para>
///
/// <para><b>E a correccao do bug do web nao foi corrigir a escada: foi nao haver
/// escada.</b> O encoder do web tinha os pares de escape escritos a mao, e vinte e
/// quatro dos trinta e dois caracteres de controlo estavam errados — o CR saia
/// como o algarismo <c>0</c>, e o ZXing devolvia um <c>0</c> onde estava um CR.
/// Aqui o par e' uma busca.</para>
/// </remarks>
public static class Code93
{
    /// <summary>Codifica em Code 93.</summary>
    /// <param name="valor">O que codificar. ASCII, minusculas e tudo — as
    /// minusculas e os controlos sao o que o Code 93 tem e o Code 39 nao.</param>
    /// <exception cref="SimbologiaException">Se o texto estiver vazio, trouxer um
    /// asterisco, ou trouxer um caractere acima de 127.</exception>
    public static CodigoDeBarras Codificar(string valor)
    {
        string texto = Validar(valor);

        // **O texto passa pela codificacao estendida antes de qualquer outra
        // coisa.** A tabela tem 48 entradas e nenhuma delas e' uma minuscula nem
        // um caracter de controlo, e a `Controles` da' ja o que vai no codigo: uma
        // letra para os valores e duas para os que precisam de escape.
        //
        // **O `foreach` sobre a cadeia da' um `char` de cada vez**, que e' o que
        // o `checksum` conta: juntar a entrada como uma cadeia daria um digito
        // diferente em qualquer texto com minusculas.
        var estendido = new StringBuilder();
        foreach (char caractere in texto)
        {
            string escape = TabelasCode93.Controles[caractere]
                ?? throw new SimbologiaException(
                    $"Code 93: o caractere '{caractere}' nao tem par de escape");

            // **Um caracter de cada vez, e nao a cadeia toda.**
            foreach (char letra in escape)
            {
                estendido.Append(letra);
            }
        }

        char[] verificacao = DoisControlos(estendido.ToString());

        // **O asterisco no inicio e no fim, e nao e' opcional.** E' o start e o
        // stop do Code 93, e sem eles o leitor nao sabe onde comeca o codigo. A
        // razao de ser o **mesmo** nas duas pontas, e nao dois caracteres
        // diferentes, e' que o Code 93 nao tem start e stop proprios como o Code 39:
        // usa um caractere normal da tabela, que o leitor reconhece pela forma.
        char asterisco = TabelasCode93.ALFABETO[TabelasCode93.ASTERISCO];

        var comAsteriscos = new List<char>(estendido.Length + 3)
        {
            asterisco,
        };
        foreach (char c in estendido.ToString())
        {
            comAsteriscos.Add(c);
        }
        comAsteriscos.Add(verificacao[0]);
        comAsteriscos.Add(verificacao[1]);
        comAsteriscos.Add(asterisco);

        var modulos = new List<bool>();
        var guardas = new List<int>();

        for (int i = 0; i < comAsteriscos.Count; i++)
        {
            // Os asteriscos do inicio e do fim sao as guardas: sao o unico ponto
            // de referencia que o leitor tem, porque o Code 93 nao tem barras de
            // guarda como o EAN. Descem mais para se verem a olho.
            if (i == 0 || i == comAsteriscos.Count - 1)
            {
                guardas.Add(modulos.Count);
            }

            modulos.AddRange(ModulosDo(comAsteriscos[i]));
        }

        // **A barra de terminacao.** O ZXing acrescenta **uma barra preta** no fim,
        // depois da barra de fim, e sem ela o codigo nao le. Nao e' um start nem um
        // stop: e' a unica barra solitaria do codigo, e o que da ao leitor a
        // certeza de que leu ate ao fim.
        modulos.Add(true);

        string legenda = estendido.ToString() + verificacao[0] + verificacao[1];

        return new CodigoDeBarras("Code 93", modulos.ToArray(),
            guardas.ToArray(), legenda);
    }

    /// <summary>Os dois digitos de controlo.</summary>
    /// <remarks>
    /// <para><b>O segundo e' calculado sobre o texto mais o primeiro.</b></para>
    /// <para><b>E o modulo e' 47</b> — e nao 43, que e' o numero de caracteres de
    /// dados — porque na conta entram tambem os quatro de controle e o
    /// asterisco.</para>
    /// </remarks>
    private static char[] DoisControlos(string texto)
    {
        int primeiro = Checksum(texto, 20);
        int segundo = Checksum(texto + TabelasCode93.ALFABETO[primeiro], 15);

        return new[] { TabelasCode93.ALFABETO[primeiro], TabelasCode93.ALFABETO[segundo] };
    }

    /// <summary>A soma ponderada, com o peso a reiniciar em <paramref name="maximo"/>.</summary>
    /// <remarks>
    /// <para><b>O peso reinicia quando passa o maximo, e nao quando chega ao
    /// fim.</b> O sintoma do que nao reinicia e' o mais enganador de todos os
    /// codigos de barras: o codigo desenha-se bem, o primeiro digito bate certo e
    /// o segundo nao, e o leitor recusa por checksum <b>sem dizer qual dos
    /// dois</b>.</para>
    /// </remarks>
    private static int Checksum(string texto, int maximo)
    {
        int peso = 1;
        int total = 0;

        for (int i = texto.Length - 1; i >= 0; i--)
        {
            if (!TabelasCode93.Indice.TryGetValue(texto[i], out int indice))
            {
                throw new SimbologiaException(
                    $"Code 93: '{texto[i]}' nao esta no alfabeto, e o checksum nao "
                    + "sabe o indice. A tabela esta errada.");
            }

            total += peso * indice;
            peso += 1;
            if (peso > maximo)
            {
                peso = 1;
            }
        }

        return total % TabelasCode93.MODULO_CHECKSUM;
    }

    /// <summary>Os nove modulos de um padrao.</summary>
    /// <remarks>
    /// <para><b>O padrao sao os nove modulos, um a um, do mais significativo
    /// para o menos</b>, e nao larguras a extrair nem pares de bits. E' a leitura
    /// ao inverso do <c>appendPattern</c> do ZXing, bit a bit.</para>
    ///
    /// <para><b>Tres versoes erraram aqui, e as tres por tentar ser espertas</b> —
    /// uma leu pares de dois bits a comecar em espaco, outra pôs o comprimento
    /// nos dois bits altos, e uma terceira contou as runs de zeros. Nenhuma deu
    /// os nove modulos.</para>
    /// </remarks>
    private static List<bool> ModulosDo(char caractere)
    {
        if (!TabelasCode93.Indice.TryGetValue(caractere, out int indice))
        {
            throw new SimbologiaException($"Code 93: '{caractere}' nao tem padrao.");
        }

        int padrao = TabelasCode93.PADROES[indice];

        var modulos = new List<bool>(9);
        for (int i = 0; i < 9; i++)
        {
            modulos.Add(((padrao >> (8 - i)) & 1) == 1);
        }

        // **O que se verifica aqui e' que o primeiro modulo e' uma barra**, que e'
        // a propriedade de que o leitor depende para ancorar. Um padrao que comece
        // em espaco desenha-se bem e nao e' lido por nada.
        //
        // **E o `spec/gerar-tabelas-code93.py` verifica o mesmo nos 48 valores**,
        // antes de os escrever. Aqui e' a segunda verificacao do mesmo invariante,
        // e nao e' redundancia: o gerador protege a tabela, e isto protege o
        // codigo de uma tabela que um dia chegue errada de outra fonte.
        if (!modulos[0])
        {
            throw new SimbologiaException(
                $"Code 93: o padrao '{caractere}' (0x{padrao:X3}) comeca em espaco, "
                + "e o leitor precisa de uma barra para ancorar. A tabela esta errada.");
        }

        return modulos;
    }

    /// <summary>O que o Code 93 aceita, e o que recusa com a razao.</summary>
    /// <remarks>
    /// <para><b>O asterisco e' a marca de inicio e de fim, e nao pode estar nos
    /// dados.</b> Um asterisco nos dados faz o leitor terminar a leitura ali, e o
    /// que vem a seguir e' lido como lixo. <b>O codigo desenha-se e le-se — a
    /// metade, que e' pior do que nao ler nada, porque parece que leu.</b></para>
    /// </remarks>
    private static string Validar(string valor)
    {
        string texto = valor ?? "";

        if (texto.Length == 0)
        {
            throw new SimbologiaException("Code 93: o texto esta vazio.");
        }

        if (texto.Contains('*'))
        {
            throw new SimbologiaException(
                "Code 93: o asterisco e' a marca de inicio e de fim, e nao pode "
                + $"estar nos dados. Passou \"{texto}\".");
        }

        foreach (char c in texto)
        {
            if (c > 127)
            {
                throw new SimbologiaException(
                    $"Code 93 e ASCII e '{c}' (U+{(int)c:X4}) nao e. "
                    + "Para acentos ou alfabetos nao latinos, usa QR.");
            }
        }

        return texto;
    }
}
