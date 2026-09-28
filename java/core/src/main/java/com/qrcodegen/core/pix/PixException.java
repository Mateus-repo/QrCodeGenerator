package com.qrcodegen.core.pix;

/** Erro de validação de PIX. */
public class PixException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public PixException(String message) {
        super(message);
    }
}
