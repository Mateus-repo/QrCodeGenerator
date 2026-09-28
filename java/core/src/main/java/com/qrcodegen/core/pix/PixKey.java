package com.qrcodegen.core.pix;

import com.qrcodegen.core.Text;

import java.util.Locale;
import java.util.regex.Pattern;

/** Validação e normalização da chave PIX. */
public final class PixKey {

    /** Tipo de chave PIX, para mostrar ao utilizador. */
    public enum Type {
        CPF, CNPJ, PHONE, EMAIL, RANDOM
    }

    private static final Pattern UUID = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");

    private static final Pattern EMAIL_LOCAL = Pattern.compile("^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.\\-]+$");

    private static final Pattern PHONE_CHARACTERS = Pattern.compile("^[\\d\\s.\\-/]+$");

    private static final int MAX_EMAIL_LENGTH = 77;

    private PixKey() {
    }

    public static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    /**
     * Limpa a chave introduzida pelo utilizador (máscaras, {@code +55},
     * maiúsculas).
     */
    public static String normalize(String raw) {
        String key = Text.toAscii(raw).strip();

        if (key.isEmpty()) {
            throw new PixException("Indica a chave PIX.");
        }
        if (key.contains("@")) {
            return key.toLowerCase(Locale.ROOT);
        }

        // Chave aleatória (UUID).
        if (key.contains("-") && key.replaceAll("[ -]", "").chars().allMatch(Character::isLetterOrDigit)) {
            return key.toLowerCase(Locale.ROOT);
        }

        String digits = digitsOnly(key);
        if (!digits.isEmpty()) {
            // Telefone: o padrão exige o indicativo +55, mas aceitamos escrever
            // sem o "+" e sem o 55, desde que sobrem 10 ou 11 dígitos.
            String candidate = null;
            if (digits.length() == 13 && digits.startsWith("55")) {
                candidate = "+55" + digits.substring(2);
            } else if (key.startsWith("+55") && (digits.length() == 12 || digits.length() == 13)) {
                candidate = "+55" + digits.substring(2);
            } else if (key.startsWith("+") && (digits.length() == 12 || digits.length() == 13 || digits.length() == 14)) {
                candidate = "+" + digits;
            }

            if (candidate != null && isValidPhone(candidate)) {
                return candidate;
            }

            // CPF (11) / CNPJ (14), com ou sem máscara.
            if ((digits.length() == 11 || digits.length() == 14) && PHONE_CHARACTERS.matcher(key).matches()) {
                return digits;
            }
        }

        return key;
    }

    /**
     * Valida a chave e devolve-a normalizada.
     *
     * @throws PixException se for inválida
     */
    public static String validate(String raw) {
        String key = normalize(raw);

        if (key.chars().allMatch(Character::isDigit)) {
            if (key.length() == 11 && isValidCpf(key)) {
                return key;
            }
            if (key.length() == 14 && isValidCnpj(key)) {
                return key;
            }
            throw new PixException("CPF/CNPJ inválido (os dígitos verificadores não conferem). "
                    + "Se esta chave for um telefone, escreve com o indicativo +55.");
        }

        if (key.startsWith("+")) {
            if (isValidPhone(key)) {
                return key;
            }
            throw new PixException("Telefone inválido. Usa o formato +55 seguido de DDD e número.");
        }

        if (key.contains("@")) {
            if (isValidEmail(key)) {
                return key;
            }
            throw new PixException("Email inválido como chave PIX.");
        }

        if (UUID.matcher(key).matches()) {
            return key;
        }

        throw new PixException("Chave PIX inválida. Use CPF, CNPJ, telefone com +55, email"
                + " ou chave aleatória (UUID).");
    }

    /** Tipo da chave, depois de validada. */
    public static Type typeOf(String raw) {
        String key = validate(raw);
        if (key.chars().allMatch(Character::isDigit)) {
            return key.length() == 11 ? Type.CPF : Type.CNPJ;
        }
        if (key.startsWith("+")) {
            return Type.PHONE;
        }
        if (key.contains("@")) {
            return Type.EMAIL;
        }
        return Type.RANDOM;
    }

    public static boolean isValidCpf(String value) {
        if (value == null || value.length() != 11 || value.chars().allMatch(c -> c == value.charAt(0))) {
            return false;
        }

        for (int position = 9; position <= 10; position++) {
            int total = 0;
            for (int i = 0; i < position; i++) {
                total += (value.charAt(i) - '0') * (position + 1 - i);
            }
            int check = (total * 10) % 11;
            if (check == 10) {
                check = 0;
            }
            if (check != value.charAt(position) - '0') {
                return false;
            }
        }
        return true;
    }

    public static boolean isValidCnpj(String value) {
        if (value == null || value.length() != 14 || value.chars().allMatch(c -> c == value.charAt(0))) {
            return false;
        }

        int[] firstWeights = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
        int[] secondWeights = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

        int[][] pairs = {{firstWeights[0], 12}, {secondWeights[0], 13}};
        for (int p = 0; p < 2; p++) {
            int[] weights = p == 0 ? firstWeights : secondWeights;
            int position = p == 0 ? 12 : 13;

            int total = 0;
            for (int i = 0; i < weights.length; i++) {
                total += (value.charAt(i) - '0') * weights[i];
            }

            int rest = total % 11;
            int check = rest < 2 ? 0 : 11 - rest;
            if (check != value.charAt(position) - '0') {
                return false;
            }
        }
        return true;
    }

    public static boolean isValidPhone(String value) {
        if (value == null || !value.startsWith("+55")) {
            return false;
        }

        String digits = value.substring(3);
        if (digits.length() != 10 && digits.length() != 11) {
            return false;
        }
        if (digits.charAt(0) == '0' || digits.charAt(1) == '0') {
            return false;
        }
        return digits.chars().allMatch(Character::isDigit);
    }

    public static boolean isValidEmail(String value) {
        if (value == null || value.isEmpty() || value.length() > MAX_EMAIL_LENGTH) {
            return false;
        }

        String[] parts = value.split("@", -1);
        if (parts.length != 2) {
            return false;
        }

        String local = parts[0];
        String domain = parts[1];
        if (local.isEmpty() || domain.isEmpty()) {
            return false;
        }
        if (!domain.contains(".") || domain.startsWith(".") || domain.endsWith(".")) {
            return false;
        }
        if (value.contains(" ")) {
            return false;
        }
        return EMAIL_LOCAL.matcher(local).matches();
    }
}
