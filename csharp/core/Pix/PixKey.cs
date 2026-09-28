using System.Globalization;
using System.Text.RegularExpressions;

namespace QrCodeGenerator.Core.Pix;

/// <summary>Tipo de chave PIX, para mostrar ao utilizador.</summary>
public enum PixKeyType
{
    Cpf,
    Cnpj,
    Phone,
    Email,
    Random
}

/// <summary>Validação e normalização da chave PIX.</summary>
public static class PixKey
{
    private static readonly Regex Uuid = new(
        @"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        RegexOptions.Compiled);

    private static readonly Regex EmailLocal = new(
        @"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.\-]+$",
        RegexOptions.Compiled);

    private static readonly Regex PhoneCharacters = new(@"^[0-9\s.\-/]+$", RegexOptions.Compiled);

    private const int MaxEmailLength = 77;

    public static string DigitsOnly(string? value) =>
        new((value ?? string.Empty).Where(c => c is >= '0' and <= '9').ToArray());

    /// <summary>Limpa a chave introduzida pelo utilizador (máscaras, <c>+55</c>, maiúsculas).</summary>
    public static string Normalize(string? raw)
    {
        var key = Text.ToAscii(raw).Trim();

        if (key.Length == 0)
            throw new PixException("Indica a chave PIX.");

        if (key.Contains('@'))
            return key.ToLowerInvariant();

        // Chave aleatória (UUID).
        if (key.Contains('-') && key.Replace("-", string.Empty).Replace(" ", string.Empty).All(char.IsLetterOrDigit))
            return key.ToLowerInvariant();

        var digits = DigitsOnly(key);
        if (digits.Length > 0)
        {
            // Telefone: o padrão exige o indicativo +55, mas aceitamos escrever
            // sem o "+" e sem o 55, desde que sobrem 10 ou 11 dígitos.
            string? candidate = null;
            if (digits.Length == 13 && digits.StartsWith("55", StringComparison.Ordinal))
                candidate = "+55" + digits[2..];
            else if (key.StartsWith("+55", StringComparison.Ordinal) && digits.Length is 12 or 13)
                candidate = "+55" + digits[2..];
            else if (key.StartsWith('+') && digits.Length is 12 or 13 or 14)
                candidate = "+" + digits;

            if (candidate is not null && IsValidPhone(candidate))
                return candidate;

            // CPF (11) / CNPJ (14), com ou sem máscara.
            if (digits.Length is 11 or 14 && PhoneCharacters.IsMatch(key))
                return digits;
        }

        return key;
    }

    /// <summary>Valida a chave e devolve-a normalizada. Lança <see cref="PixException"/> se for inválida.</summary>
    public static string Validate(string? raw)
    {
        var key = Normalize(raw);

        if (key.All(c => c is >= '0' and <= '9'))
        {
            if (key.Length == 11 && IsValidCpf(key))
                return key;
            if (key.Length == 14 && IsValidCnpj(key))
                return key;
            throw new PixException(
                "CPF/CNPJ inválido (os dígitos verificadores não conferem). " +
                "Se esta chave for um telefone, escreve com o indicativo +55.");
        }

        if (key.StartsWith('+'))
        {
            if (IsValidPhone(key))
                return key;
            throw new PixException("Telefone inválido. Usa o formato +55 seguido de DDD e número.");
        }

        if (key.Contains('@'))
        {
            if (IsValidEmail(key))
                return key;
            throw new PixException("Email inválido como chave PIX.");
        }

        if (Uuid.IsMatch(key))
            return key;

        throw new PixException(
            "Chave PIX inválida. Use CPF, CNPJ, telefone com +55, email ou chave aleatória (UUID).");
    }

    /// <summary>Tipo da chave, depois de validada.</summary>
    public static PixKeyType TypeOf(string? raw)
    {
        var key = Validate(raw);
        if (key.All(c => c is >= '0' and <= '9'))
            return key.Length == 11 ? PixKeyType.Cpf : PixKeyType.Cnpj;
        if (key.StartsWith('+')) return PixKeyType.Phone;
        if (key.Contains('@')) return PixKeyType.Email;
        return PixKeyType.Random;
    }

    public static bool IsValidCpf(string? value)
    {
        if (value is null || value.Length != 11 || value.All(c => c == value[0]))
            return false;

        for (var position = 9; position <= 10; position++)
        {
            var total = 0;
            for (var i = 0; i < position; i++)
                total += (value[i] - '0') * (position + 1 - i);

            var check = total * 10 % 11;
            if (check == 10) check = 0;
            if (check != value[position] - '0') return false;
        }

        return true;
    }

    public static bool IsValidCnpj(string? value)
    {
        if (value is null || value.Length != 14 || value.All(c => c == value[0]))
            return false;

        int[] FirstWeights = { 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };
        int[] SecondWeights = { 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };

        foreach (var (weights, position) in new[] { (FirstWeights, 12), (SecondWeights, 13) })
        {
            var total = 0;
            for (var i = 0; i < weights.Length; i++)
                total += (value[i] - '0') * weights[i];

            var rest = total % 11;
            var check = rest < 2 ? 0 : 11 - rest;
            if (check != value[position] - '0') return false;
        }

        return true;
    }

    public static bool IsValidPhone(string? value)
    {
        if (value is null || !value.StartsWith("+55", StringComparison.Ordinal))
            return false;

        var digits = value[3..];
        if (digits.Length is not (10 or 11)) return false;
        if (digits[0] == '0' || digits[1] == '0') return false;

        return digits.All(c => c is >= '0' and <= '9');
    }

    public static bool IsValidEmail(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > MaxEmailLength) return false;

        var parts = value.Split('@');
        if (parts.Length != 2) return false;

        var (local, domain) = (parts[0], parts[1]);
        if (local.Length == 0 || domain.Length == 0) return false;
        if (!domain.Contains('.') || domain.StartsWith('.') || domain.EndsWith('.')) return false;
        if (value.Contains(' ')) return false;

        return EmailLocal.IsMatch(local);
    }
}
