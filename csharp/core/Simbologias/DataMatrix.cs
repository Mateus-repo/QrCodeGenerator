using System.Collections.Generic;
using System.Text;

namespace QrCodeGenerator.Core.Simbologias;

/// <summary>
/// O Data Matrix (ECC200).
/// </summary>
/// <remarks>
/// <para><strong>E' o codigo da industria:</strong> a farmacia, a aeroespacial, a
/// defesa e a logistica. Ve-se em ampolas, em chips e em etiquetas de peca, e e' o
/// formato que substituiu o codigo de barras quando a etiqueta ficou pequena
/// demais para ele.</para>
///
/// <para><b>Porque e' quadrado e nao tem padroes de localizacao.</b> O QR tem
/// tres quadrados nos cantos e o Code 128 tem barras. O Data Matrix nao tem nenhum
/// dos dois: a orientacao vem de <strong>duas guias em L</strong>, uma
/// <strong>cheia</strong> em baixo e a esquerda e outra <strong>tracejada</strong> em
/// cima e a direita. <b>A assimetria das duas guias e' o que o leitor usa para se
/// orientar</b>, e trocar uma delas de cheia para tracejada - ou o sitio - da um
/// codigo que se parece com um Data Matrix e nao e' lido por nada.</para>
///
/// <para><b>Os cinco modos, e porque so dois entram.</b> A ISO/IEC 16022 define
/// cinco modos de codificacao de nivel alto: ASCII, C40, Text, X12 e EDIFACT.
/// <strong>Este encoder so usa dois</strong>: ASCII e o deslocamento para ASCII
/// estendido. Os outros tres sao modos de <em>compressao</em>, e nao de correccao:
/// o codigo que sai sem eles e' perfeitamente valido e le-se em qualquer leitor. A
/// diferenca e' o tamanho, e isso e' otimizacao, nao conformidade.</para>
///
/// <para><b>Nao ha mascaras, nao ha versoes com nomes e nao ha nivel a escolher.</b>
/// Escolhe-se o menor simbolo que caiba e a correccao e fixa - o ECC200 e' o unico
/// modo. Isto e' o oposto do QR em tudo.</para>
///
/// <para><b>O valor de <c>b - 127</c>, que parece um erro.</b> O byte acima de 127
/// leva um <see cref="UpperShift"/> a frente e <strong>o valor menos 127</strong>, e
/// nao menos 128 como a norma parece dizer. A leitura literal da ISO daria
/// <c>b - 128</c>; a implementacao de referencia do ZXing emite <c>b - 128 + 1</c> e o
/// leitor dela faz <c>valor + 128 - 1</c>, que e' o mesmo numero. <strong>Os dois
/// concordam, e o resultado e' que o valor certo e' <c>b - 127</c>.</strong> Com
/// 128, o ZXing devolvia cada byte alto <em>um abaixo</em>: um <c>c-cedilha</c>
/// saia como <c>r</c>, e um <c>euro</c> como <c>N-til</c>.</para>
///
/// <para><b>As tabelas sao geradas.</b> <see cref="TabelasDataMatrix"/> vem do
/// <c>spec/gerar-tabelas-datamatrix.py</c>, que as extrai da implementacao de
/// referencia do ZXing - <strong>a mesma fonte que o leitor usa para verificar o
/// que este encoder produz</strong>. Nao ha um pacote de C# com o Data Matrix, e
/// escrever as tabelas a mao seria uma segunda implementacao que divergiria em
/// silencio.</para>
/// </remarks>
public static class DataMatrix
{
    /// <summary>O codeword de enchimento.</summary>
    public const int Pad = 129;

    /// <summary>O deslocamento para ASCII estendido, que vale para o codeword seguinte.</summary>
    public const int UpperShift = 235;

    /// <summary>O FNC1, que no GS1 faz as duas coisas: sinaliza e separa.</summary>
    public const int Fnc1 = 232;

    /// <summary>O polinomio irredutivel do corpo finito, e o que o ZXing chama de 0x12D.</summary>
    private const int Modulo = 0x12D;

    /// <summary>A capacidade maxima, em codewords de dados, de qualquer simbolo.</summary>
    public static readonly int CapacidadeMaxima = TabelasDataMatrix.Simbolos[23][0];

    // --- o corpo finito -----------------------------------------------------

    /// <summary>
    /// As tabelas de logaritmos e anti-logaritmos de <c>GF(256)</c>.
    /// </summary>
    /// <remarks>
    /// <para><b>Sao calculadas, nao transcritas</b>, e e' o que torna esta classe
    /// diferente de uma que tenha de levar tabelas: o corpo e' gerado pelo polinomio
    /// <c>0x12D</c> a partir do 1, e cada multiplicacao e' uma soma de
    /// logaritmos.</para>
    ///
    /// <para>O indice 255 repete o 0 porque <c>LOG[a] + LOG[b]</c> chega a 508 e a
    /// tabela de exponenciais e' usada com modulo 255.</para>
    /// </remarks>
    private static readonly int[] Exp = new int[512];
    private static readonly int[] Log = new int[256];

    static DataMatrix()
    {
        int p = 1;
        for (int i = 0; i < 255; i++)
        {
            Exp[i] = p;
            Log[p] = i;
            p <<= 1;
            if ((p & 0x100) != 0)
            {
                p ^= Modulo;
            }
        }

        for (int i = 255; i < 512; i++)
        {
            Exp[i] = Exp[i - 255];
        }
    }

    private static int Multiplicar(int a, int b)
    {
        if (a == 0 || b == 0)
        {
            return 0;
        }
        return Exp[Log[a] + Log[b]];
    }

    // --- a geometria --------------------------------------------------------

    /// <summary>
    /// Quantas regioes de dados ha na horizontal, e quantas na vertical.
    /// </summary>
    /// <remarks>
    /// <b>E' o mesmo numero nas duas direccoes</b>, e nao por simetria do formato: e'
    /// que a tabela tem cinco chaves e <c>1</c> e <c>2</c> dao a mesma resposta. Um
    /// simbolo de uma regiao e um de duas diferem no tamanho do bloco de
    /// correccao, nunca na quantidade de regioes lado a lado.
    /// </remarks>
    private static int RegioesDe(int n) => n switch
    {
        1 or 2 => 1,
        4 => 2,
        16 => 4,
        36 => 6,
        _ => 1,
    };

    /// <summary>
    /// A geometria de um simbolo, ja com os <c>-1</c> da tabela resolvidos.
    /// </summary>
    /// <remarks>
    /// <b>E' uma classe e nao um <c>int[]</c> de sete inteiros</b> porque os campos
    /// sao usados em sitios diferentes e um <c>simbolo[5]</c> num <c>if</c> nao diz
    /// nada. A excepcao e' a tabela gerada, que fica um <c>int[,]</c> porque e' uma
    /// copia do ZXing e nao uma decisao.
    ///
    /// <para><b>A largura e' a regiao mais duas guias, uma por regiao de cada
    /// lado.</b> Com <c>+ regioes</c> o 144x144 dava 132 + 36 = 168 em vez de
    /// 132 + 6 + 6 = 144, e a matriz saia 24 colunas mais larga do que o encoder
    /// pintou.</para>
    /// </remarks>
    internal sealed class Geometria
    {
        internal Geometria(int[] simbolo)
        {
            this.Dados = simbolo[0];
            this.Correccao = simbolo[1];
            this.RegiaoLargura = simbolo[2];
            this.RegiaoAltura = simbolo[3];
            this.Regioes = simbolo[4];

            // **Os dois ultimos valem -1 quando o bloco e' o simbolo inteiro**, que
            // e' o caso de quase todos os 24 simbolos.
            this.BlocoDados = simbolo[5] == -1 ? this.Dados : simbolo[5];
            this.BlocoErros = simbolo[6] == -1 ? this.Correccao : simbolo[6];

            int colunasRegiao = RegioesDe(this.Regioes);
            int linhasRegiao = RegioesDe(this.Regioes);
            this.DadosColunas = colunasRegiao * this.RegiaoLargura;
            this.DadosLinhas = linhasRegiao * this.RegiaoAltura;

            this.Colunas = this.DadosColunas + colunasRegiao + linhasRegiao;
            this.Linhas = this.DadosLinhas + linhasRegiao + colunasRegiao;
        }

        internal int Dados { get; }

        internal int Correccao { get; }

        internal int RegiaoLargura { get; }

        internal int RegiaoAltura { get; }

        internal int Regioes { get; }

        internal int BlocoDados { get; }

        internal int BlocoErros { get; }

        internal int DadosColunas { get; }

        internal int DadosLinhas { get; }

        internal int Colunas { get; }

        internal int Linhas { get; }
    }

    /// <summary>
    /// O menor simbolo quadrado que leva <paramref name="codewords"/> de dados.
    /// </summary>
    /// <remarks>
    /// A lista esta por ordem de capacidade, e a primeira que chegue serve. Nao ha
    /// escolha envolvida: e' o menor que caiba.
    /// </remarks>
    /// <exception cref="SimbologiaException">Se o texto for maior do que o maior simbolo.</exception>
    private static int[] SimboloPara(int codewords)
    {
        if (codewords > CapacidadeMaxima)
        {
            throw new SimbologiaException(
                $"Data Matrix: o conteudo da {codewords} codewords e o maior simbolo leva "
                    + $"{CapacidadeMaxima}. O limite e' {CapacidadeMaxima} codewords de dados, "
                    + "e com acentos cada caractere pode gastar dois.");
        }

        foreach (int[] simbolo in TabelasDataMatrix.Simbolos)
        {
            if (codewords <= simbolo[0])
            {
                return simbolo;
            }
        }

        // **Isto e' inalcancavel** e nao esta aqui por enfeite: com a guarda de cima
        // o `foreach` devolve sempre, e um `throw` no fim e' a forma de o compilador
        // nao se queixar do `return` em falta.
        throw new SimbologiaException(
            $"Data Matrix: nenhum simbolo leva {codewords} codewords");
    }

    // --- a codificacao de nivel alto ----------------------------------------

    /// <summary>
    /// O texto em codewords, no modo ASCII.
    /// </summary>
    /// <remarks>
    /// <para>Tres regras, e so tres:</para>
    /// <list type="bullet">
    /// <item><b>Digitos aos pares.</b> <c>2026</c> sao dois codewords e nao quatro.
    /// O valor e' <c>d1 * 10 + d2 + 130</c>. E' a compressao do ECC200 de que o
    /// Data Matrix tira o nome: um numero de serie longo entra em metade do
    /// espaco.</item>
    /// <item><b>ASCII 0 a 127</b> entra com o valor mais um. O <c>+1</c> e' para
    /// reservar o 0, que e' o valor de um codeword que nao existe.</item>
    /// <item><b>Todo o resto</b> (128 a 255) leva um <see cref="UpperShift"/> a
    /// frente e o valor menos 127. O deslocamento vale para um codeword so, e por
    /// isso um acento custa dois.</item>
    /// </list>
    /// <para>Nao ha aqui nenhum valor aleatorizado, e e' de proposito: a
    /// aleatorizacao existe para que um 254 ou um 255 nao parecam um unlatch, e
    /// este encoder nunca os emite; e o enchimento, esse sim, e' aleatorizado.</para>
    /// </remarks>
    public static int[] Compactar(byte[] dados)
    {
        var codewords = new List<int>(dados.Length + 2);
        int i = 0;

        while (i < dados.Length)
        {
            int b = dados[i] & 0xFF;

            if (b >= 0x30 && b <= 0x39 && i + 1 < dados.Length)
            {
                int seguinte = dados[i + 1] & 0xFF;
                if (seguinte >= 0x30 && seguinte <= 0x39)
                {
                    codewords.Add((b - 0x30) * 10 + (seguinte - 0x30) + 130);
                    i += 2;
                    continue;
                }
            }

            if (b < 128)
            {
                codewords.Add(b + 1);
            }
            else
            {
                // **O `b - 127` e' o que a nota da classe explica.** A norma parece
                // dizer `b - 128`, e a implementacao de referencia do ZXing emite
                // `b - 128 + 1` porque o leitor dela faz `valor + 128 - 1`.
                codewords.Add(UpperShift);
                codewords.Add(b - 127);
            }

            i++;
        }

        return codewords.ToArray();
    }

    /// <summary>
    /// O estado 253 de aleatorizacao, para o enchimento.
    /// </summary>
    /// <remarks>
    /// <para>O enchimento e' o mesmo problema do PDF417 com outro nome: uma fileira
    /// de 129 seguida de mais 129 e' um padrao que o leitor pode confundir com o
    /// fim dos dados. Em vez disso, o primeiro e' 129 a serio e os seguintes sao
    /// valores calculados, que e' o que a ISO manda.</para>
    ///
    /// <para>E a formula nao e' arbitraria: 149 e' primo, e e' o que faz com que os
    /// valores saiem espalhados pelos 254 possiveis em vez de se agruparem.</para>
    /// </remarks>
    internal static int Aleatorizar253(int posicao)
    {
        int pseudo = ((149 * posicao) % 253) + 1;
        int temp = Pad + pseudo;
        return temp <= 254 ? temp : temp - 254;
    }

    /// <summary>Completa com 129 e depois com valores aleatorizados, ate a capacidade.</summary>
    internal static int[] Encher(int[] codewords, int capacidade)
    {
        var cheios = new int[capacidade];
        System.Array.Copy(codewords, cheios, codewords.Length);

        if (codewords.Length < capacidade)
        {
            cheios[codewords.Length] = Pad;
        }

        for (int i = codewords.Length + 1; i < capacidade; i++)
        {
            cheios[i] = Aleatorizar253(i + 1);
        }

        return cheios;
    }

    // --- a correccao de erros ------------------------------------------------

    /// <summary>
    /// O Reed-Solomon de um bloco, com a convencao do ECC200.
    /// </summary>
    /// <remarks>
    /// <para>O laco vai de tras para a frente e o resultado sai
    /// <strong>invertido</strong>. As duas coisas sao da tabela, nao uma escolha: a
    /// tabela dos factores poe o <c>x^(n-1)</c> no primeiro lugar, e o
    /// <c>eccReversed</c> inverte a lista. Sem o inverter, a correccao sai toda ao
    /// contrario - e o sintoma e' o pior dos possiveis: a primeira linha do simbolo
    /// bate certo e nenhuma le.</para>
    /// </remarks>
    /// <exception cref="SimbologiaException">Se nao houver factores para <paramref name="quantos"/>.</exception>
    internal static int[] CorreccaoDeBloco(int[] codewords, int quantos)
    {
        int[] coeficientes;
        foreach (KeyValuePair<int, int[]> par in TabelasDataMatrix.Fatores)
        {
            if (par.Value.Length == quantos)
            {
                coeficientes = par.Value;
                goto encontrados;
            }
        }

        throw new SimbologiaException(
            $"Data Matrix: nao ha factores para {quantos} codewords de correccao");

    encontrados:
        var ecc = new int[quantos];

        foreach (int c in codewords)
        {
            int m = ecc[quantos - 1] ^ c;
            for (int k = quantos - 1; k > 0; k--)
            {
                ecc[k] = m != 0 && coeficientes[k] != 0
                    ? ecc[k - 1] ^ Multiplicar(m, coeficientes[k])
                    : ecc[k - 1];
            }
            ecc[0] = m != 0 && coeficientes[0] != 0 ? Multiplicar(m, coeficientes[0]) : 0;
        }

        // Inverte. Ver a nota em cima: nao e' uma escolha, e' a convencao.
        var invertido = new int[quantos];
        for (int i = 0; i < quantos; i++)
        {
            invertido[i] = ecc[quantos - 1 - i];
        }

        return invertido;
    }

    private static bool EhUltimo(int[] simbolo)
    {
        int[] ultimo = TabelasDataMatrix.Simbolos[23];
        return simbolo[0] == ultimo[0] && simbolo[1] == ultimo[1];
    }

    /// <summary>
    /// A correccao de erros do simbolo todo, com o entrelacamento.
    /// </summary>
    /// <remarks>
    /// <b>O entrelacamento e' o que faz um rasgo vertical ser recuperavel.</b> Os
    /// codewords de dados sao espalhados pelos blocos round-robin, de modo que um
    /// rasgo numa coluna parte o mesmo numero de codewords em cada bloco, e cada
    /// bloco sabe corrigir os seus. Sem entrelacar, uma linha inteira de dados ia
    /// para o mesmo bloco e nao havia por onde recuperar.
    /// </remarks>
    private static int[] Corrigir(int[] codewords, int[] simbolo)
    {
        var g = new Geometria(simbolo);

        if (EhUltimo(simbolo))
        {
            // **O 144x144 e' o unico com blocos de tamanho desigual**, e por isso o
            // comprimento de cada bloco vem dos dados e nao de uma divisao.
            //
            // A conta e' `cheios` blocos de 156 e os restantes de 155:
            // 8 x 156 + 2 x 155 = 1558, que e' a capacidade. Com 154 dava 1556, e dois
            // codewords a menos num codigo de 1558 e' o tipo de erro que o leitor
            // acusa como corrupcao e nao como tabela errada.
            //
            // O tamanho de cada bloco **nao e' preciso calcula-lo**: o
            // entrelacamento round-robin da 156 a quem tem indices a partir de 0 e
            // 155 a quem comeca mais tarde, sozinho.
            int blocos = TabelasDataMatrix.ULTIMO_BLOCOS;
            int erros = TabelasDataMatrix.ULTIMO_ERROS;

            var saida = new int[codewords.Length + erros * blocos];
            System.Array.Copy(codewords, saida, codewords.Length);

            for (int bloco = 0; bloco < blocos; bloco++)
            {
                int[] ecc = CorreccaoDeBloco(Parte(codewords, bloco, blocos), erros);
                int p = 0;
                for (int e = bloco; e < erros * blocos; e += blocos)
                {
                    saida[g.Dados + e] = ecc[p++];
                }
            }

            return saida;
        }

        int n = g.Dados / g.BlocoDados;
        if (n == 1)
        {
            int[] ecc = CorreccaoDeBloco(codewords, g.Correccao);
            var saidaDeUmBloco = new int[codewords.Length + ecc.Length];
            System.Array.Copy(codewords, saidaDeUmBloco, codewords.Length);
            System.Array.Copy(ecc, 0, saidaDeUmBloco, codewords.Length, ecc.Length);
            return saidaDeUmBloco;
        }

        // **A correccao e' reservada antes de a escrever.** Um `int[]` nao cresce por
        // atribuicao, e a mesma linha em JavaScript nao levanta nada porque o
        // `Array` cresce.
        var saidaEntrelacada = new int[codewords.Length + n * g.BlocoErros];
        System.Array.Copy(codewords, saidaEntrelacada, codewords.Length);

        for (int bloco = 0; bloco < n; bloco++)
        {
            int[] ecc = CorreccaoDeBloco(Parte(codewords, bloco, n), g.BlocoErros);
            int p = 0;
            for (int e = bloco; e < g.BlocoErros * n; e += n)
            {
                saidaEntrelacada[g.Dados + e] = ecc[p++];
            }
        }

        return saidaEntrelacada;
    }

    /// <summary>
    /// Os codewords do bloco <paramref name="bloco"/>, entrelacados round-robin.
    /// </summary>
    /// <remarks>
    /// E' <c>codewords[bloco], codewords[bloco + n], ...</c>, e nao uma divisao: e'
    /// essa a forma de o 144x144 dar 156 a uns blocos e 155 a outros sem ninguem
    /// precisar de calcular o tamanho de cada um.
    /// </remarks>
    private static int[] Parte(int[] codewords, int bloco, int blocos)
    {
        var parte = new List<int>((codewords.Length - bloco + blocos - 1) / blocos);
        for (int i = bloco; i < codewords.Length; i += blocos)
        {
            parte.Add(codewords[i]);
        }
        return parte.ToArray();
    }

    // --- a colocacao dos modulos --------------------------------------------

    /// <summary>
    /// A colocacao dos codewords na regiao de dados, do Anexo M.1 da ISO/IEC 16022.
    /// </summary>
    /// <remarks>
    /// <para>Esta e' a parte do Data Matrix que ninguem acerta de memoria, e nao por
    /// ser complicada: e' uma <strong>varredura em zigue-zague com quatro cantos
    /// especiais</strong>, e os cantos disparam em condicoes que dependem do tamanho
    /// modulo a modulo. Errar numa dessas condicoes da um codigo que se desenha
    /// perfeitamente e nao le.</para>
    ///
    /// <para>Cada codeword ocupa oito modulos com o formato em <c>utah</c>, que e' a
    /// forma de "casa" que da nome ao <c>codeword</c>: dois modulos em cima, tres no
    /// meio, dois em baixo, deslocados um para a esquerda a cada linha.</para>
    ///
    /// <para><b>O <c>-1</c> e' "ainda nao preenchido"</b>, e nao um bit. A distincao
    /// e' o que permite ao laco perguntar se pode escrever: um zero e' um modulo
    /// branco e ja foi posto, e escrever por cima dele estragaria o codeword
    /// anterior.</para>
    /// </remarks>
    internal static int[] Colocar(int[] codewords, int colunas, int linhas)
    {
        var modulos = new int[colunas * linhas];
        for (int i = 0; i < modulos.Length; i++)
        {
            modulos[i] = -1;
        }

        bool Livre(int col, int linha) =>
            col >= 0 && linha >= 0 && col < colunas && linha < linhas
            && modulos[linha * colunas + col] < 0;

        void Modulo(int linha, int col, int pos, int bit)
        {
            // A linha e a coluna saem **as duas** das pontas ao mesmo tempo, e o
            // quanto uma se desloca depende do tamanho da **outra**:
            // `(linhas + 4) % 8` para a coluna, `(colunas + 4) % 8` para a linha.
            // Trocar as duas, ou esquecer o `+ 4`, da uma matriz que se desenha com o
            // aspecto certo e nao le - e nenhum teste estrutural diz o que e', porque
            // a estrutura continua valida: e' um erro de sincronizacao, e
            // sincronizacao nao se ve na geometria.
            int l = linha;
            int c = col;
            if (l < 0)
            {
                l += linhas;
                c += 4 - ((linhas + 4) % 8);
            }
            if (c < 0)
            {
                c += colunas;
                l += 4 - ((colunas + 4) % 8);
            }

            if (c < 0 || l < 0 || c >= colunas || l >= linhas)
            {
                throw new SimbologiaException(
                    $"Data Matrix: o modulo ({l}, {c}) saiu da regiao de {linhas}x{colunas}. "
                        + "A colocacao esta' errada.");
            }

            modulos[l * colunas + c] = (codewords[pos] >> (8 - bit)) & 1;
        }

        void Utah(int linha, int col, int pos)
        {
            Modulo(linha - 2, col - 2, pos, 1);
            Modulo(linha - 2, col - 1, pos, 2);
            Modulo(linha - 1, col - 2, pos, 3);
            Modulo(linha - 1, col - 1, pos, 4);
            Modulo(linha - 1, col, pos, 5);
            Modulo(linha, col - 2, pos, 6);
            Modulo(linha, col - 1, pos, 7);
            Modulo(linha, col, pos, 8);
        }

        // Os quatro cantos, nas condicoes em que a norma os poe.
        void Canto1(int pos)
        {
            Modulo(linhas - 1, 0, pos, 1);
            Modulo(linhas - 1, 1, pos, 2);
            Modulo(linhas - 1, 2, pos, 3);
            Modulo(0, colunas - 2, pos, 4);
            Modulo(0, colunas - 1, pos, 5);
            Modulo(1, colunas - 1, pos, 6);
            Modulo(2, colunas - 1, pos, 7);
            Modulo(3, colunas - 1, pos, 8);
        }

        void Canto2(int pos)
        {
            Modulo(linhas - 3, 0, pos, 1);
            Modulo(linhas - 2, 0, pos, 2);
            Modulo(linhas - 1, 0, pos, 3);
            Modulo(0, colunas - 4, pos, 4);
            Modulo(0, colunas - 3, pos, 5);
            Modulo(0, colunas - 2, pos, 6);
            Modulo(0, colunas - 1, pos, 7);
            Modulo(1, colunas - 1, pos, 8);
        }

        void Canto3(int pos)
        {
            Modulo(linhas - 3, 0, pos, 1);
            Modulo(linhas - 2, 0, pos, 2);
            Modulo(linhas - 1, 0, pos, 3);
            Modulo(0, colunas - 2, pos, 4);
            Modulo(0, colunas - 1, pos, 5);
            Modulo(1, colunas - 1, pos, 6);
            Modulo(2, colunas - 1, pos, 7);
            Modulo(3, colunas - 1, pos, 8);
        }

        void Canto4(int pos)
        {
            Modulo(linhas - 1, 0, pos, 1);
            Modulo(linhas - 1, colunas - 1, pos, 2);
            Modulo(0, colunas - 3, pos, 3);
            Modulo(0, colunas - 2, pos, 4);
            Modulo(0, colunas - 1, pos, 5);
            Modulo(1, colunas - 3, pos, 6);
            Modulo(1, colunas - 2, pos, 7);
            Modulo(1, colunas - 1, pos, 8);
        }

        int linha = 4;
        int col = 0;
        int pos = 0;

        // **O `break` esta no fim e nao na cabeca.** A cabeca de um `while (true)`
        // nao decide nada, e esta varredura decide no fim: a diferenca e' um passo
        // do laco, e um passo deste laco e' oito modulos.
        while (true)
        {
            if (linha == linhas && col == 0)
            {
                Canto1(pos++);
            }
            if (linha == linhas - 2 && col == 0 && colunas % 4 != 0)
            {
                Canto2(pos++);
            }
            if (linha == linhas - 2 && col == 0 && colunas % 8 == 4)
            {
                Canto3(pos++);
            }
            if (linha == linhas + 4 && col == 2 && colunas % 8 == 0)
            {
                Canto4(pos++);
            }

            for (; ; )
            {
                if (linha < linhas && col >= 0 && Livre(col, linha))
                {
                    Utah(linha, col, pos++);
                }
                linha -= 2;
                col += 2;
                if (!(linha >= 0 && col < colunas))
                {
                    break;
                }
            }
            linha++;
            col += 3;

            for (; ; )
            {
                if (linha >= 0 && col < colunas && Livre(col, linha))
                {
                    Utah(linha, col, pos++);
                }
                linha += 2;
                col -= 2;
                if (!(linha < linhas && col >= 0))
                {
                    break;
                }
            }
            linha += 3;
            col++;

            if (!(linha < linhas || col < colunas))
            {
                break;
            }
        }

        // O canto de baixo a direita, se sobrou por preencher.
        //
        // **O indice e' `linhas * colunas - 1` e nao `+ colunas - 1`.** O web
        // escrevia `+ colunas - 1`, que e' `colunas - 1` posicoes a mais: um
        // `Uint8Array` fora do fim da `undefined`, e `undefined < 0` e' falso,
        // portanto **o bloco nunca corria**. O encoder desenhava o codigo, o ZXing
        // lia-o, e o canto ficava por preencher sem ninguem ver.
        //
        // **E a leitura e a escrita sao expressoes diferentes para a mesma
        // celula, e corrigir a primeira deixa a segunda errada** - foi o que
        // aconteceu ao portar para o Java, e o sintoma foi um
        // `IndexOutOfRangeException` no indice 209 de uma regiao de 196, que nao
        // aponta para o indice.
        if (modulos[linhas * colunas - 1] < 0)
        {
            modulos[(linhas - 1) * colunas + (colunas - 1)] = 1;
            modulos[(linhas - 2) * colunas + (colunas - 2)] = 1;
        }

        return modulos;
    }

    // --- a construcao do simbolo --------------------------------------------

    /// <summary>
    /// Poe as guias a volta da regiao de dados.
    /// </summary>
    /// <remarks>
    /// <para><b>A guia de baixo-esquerda e' cheia e a de cima-direita e'
    /// tracejada</b>, e essa assimetria e' a assinatura do Data Matrix.</para>
    ///
    /// <para><b>O <c>x = 0</c> da guia de baixo e' obrigatorio.</b> Sem ele, a guia
    /// comeca onde a linha de dados acabou - ou seja, fora da matriz - e a ultima
    /// linha do simbolo sai vazia. O sintoma e' um codigo que se parece com um Data
    /// Matrix e nao e' lido por nada, porque e' a guia de baixo que o leitor usa para
    /// se orientar. E a ultima linha e' a ultima coisa que se olha.</para>
    /// </remarks>
    private static bool[,] ComGuias(int[] regiao, Geometria g)
    {
        int larguraDados = g.DadosColunas;
        int alturaDados = g.DadosLinhas;

        var modulos = new bool[g.Linhas, g.Colunas];
        int y = 0;

        for (int f = 0; f < alturaDados; f++)
        {
            int x = 0;

            // A guia de cima: alternada, e e' a tracejada do canto de cima-direita.
            if (f % g.RegiaoAltura == 0)
            {
                for (int i = 0; i < g.Colunas; i++)
                {
                    modulos[y, x++] = i % 2 == 0;
                }
                y++;
            }

            x = 0;
            for (int i = 0; i < larguraDados; i++)
            {
                // A guia da esquerda de cada regiao: cheia. E' a vertical do L.
                if (i % g.RegiaoLargura == 0)
                {
                    modulos[y, x++] = true;
                }
                modulos[y, x++] = regiao[f * larguraDados + i] == 1;
                // A guia da direita de cada regiao: alternada com as linhas.
                if (i % g.RegiaoLargura == g.RegiaoLargura - 1)
                {
                    modulos[y, x++] = f % 2 == 0;
                }
            }
            y++;

            // A guia de baixo: cheia. E' o horizontal do L.
            if (f % g.RegiaoAltura == g.RegiaoAltura - 1)
            {
                x = 0;
                for (int i = 0; i < g.Colunas; i++)
                {
                    modulos[y, x++] = true;
                }
                y++;
            }
        }

        return modulos;
    }

    /// <summary>
    /// De uma lista de codewords ate a matriz.
    /// </summary>
    /// <remarks>
    /// Separado de <see cref="Gerar"/> para que o GS1 entre por aqui: a escolha do
    /// simbolo, o enchimento, a correccao de erros e a colocacao sao as mesmas, e
    /// uma segunda implementacao de cada uma delas seria uma segunda fonte de
    /// verdade sobre a parte que o ZXing verifica.
    /// </remarks>
    public static CodigoMatriz Montar(int[] dados, string nomeSimbolio = "Data Matrix")
    {
        int[] simbolo = SimboloPara(dados.Length);
        var g = new Geometria(simbolo);

        int[] comDados = Encher(dados, g.Dados);
        int[] comEc = Corrigir(comDados, simbolo);
        int[] regiao = Colocar(comEc, g.DadosColunas, g.DadosLinhas);

        return new CodigoMatriz(
            nomeSimbolio, ComGuias(regiao, g), dados, g.Dados, g.Correccao);
    }

    // --- a API --------------------------------------------------------------

    /// <summary>
    /// Codifica em Data Matrix (ECC200).
    /// </summary>
    /// <param name="texto">
    /// O que codificar. Qualquer texto UTF-8 cabe - nao ha o limite de ASCII dos
    /// codigos de barras de uma linha, porque cada byte acima de 127 custa dois
    /// codewords em vez de ser recusado.
    /// </param>
    /// <exception cref="SimbologiaException">
    /// Se o texto estiver vazio ou for maior que 1558 codewords.
    /// </exception>
    public static CodigoMatriz Gerar(string texto)
    {
        if (string.IsNullOrEmpty(texto))
        {
            throw new SimbologiaException("Data Matrix: escreve alguma coisa para codificar.");
        }

        // **Os bytes sao o UTF-8 explicito, e nao o da plataforma.** O
        // `Encoding.Default` num .NET Framework e' a codificacao do sistema, e a
        // mesma cadeia dava um codigo diferente numa maquina portuguesa e numa
        // americana. **Um payload que sai diferente conforme a maquina e' um bug
        // que so aparece em producao.**
        byte[] bytes = Encoding.UTF8.GetBytes(texto);

        return Montar(Compactar(bytes));
    }

    /// <summary>De uma lista de codewords ate a matriz, para quem precisar dela.</summary>
    public static CodigoMatriz GerarDeCodewords(
        int[] codewords, string nomeSimbolio = "Data Matrix") =>
        Montar((int[])codewords.Clone(), nomeSimbolio);
}