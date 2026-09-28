namespace QrCodeGenerator.Core.Pix;

/// <summary>Dados de um QR PIX estático.</summary>
public sealed class PixPayload
{
    public const int MaxName = 25;
    public const int MaxCity = 15;
    public const int MaxTxid = 25;
    public const int MaxPostcode = 9;

    /// <summary>Teto de caracteres do template "26" (chave + descrição).</summary>
    public const int MaxTemplate26 = 99;

    public const string Gui = "br.gov.bcb.pix";
    public const string PlaceholderTxid = "***";

    /// <summary>CPF, CNPJ, telefone com +55, email ou chave aleatória (UUID).</summary>
    public string? Key { get; set; }

    /// <summary>Nome do recebedor. Máximo 25 caracteres, acentos normalizados.</summary>
    public string? Name { get; set; }

    /// <summary>Cidade do recebedor. Máximo 15 caracteres.</summary>
    public string? City { get; set; }

    /// <summary>Valor em reais. Use <see cref="Pix.ParseAmount"/> para converter "25,75".</summary>
    public decimal? Amount { get; set; }

    /// <summary>Identificador da transação. Máximo 25 alfanuméricos.</summary>
    public string? Txid { get; set; } = PlaceholderTxid;

    /// <summary>Campo opcional 26.02.</summary>
    public string? Description { get; set; }

    /// <summary>CEP (campo 61).</summary>
    public string? Postcode { get; set; }

    /// <summary>QR de uso único (campo 01 = 12).</summary>
    public bool SingleUse { get; set; }
}
