namespace QrCodeGenerator.Core;

/// <summary>Nível de correção de erro. L = mais capacidade, H = mais robustez.</summary>
public enum EccLevel
{
    L,
    M,
    Q,
    H
}
