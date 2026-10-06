package com.qrcodegen.core.simbologias;

/** O valor nao serve para esta simbologia. */
public class SimbologiaException extends IllegalArgumentException {

    private static final long serialVersionUID = 1L;

    public SimbologiaException(String mensagem) {
        super(mensagem);
    }
}