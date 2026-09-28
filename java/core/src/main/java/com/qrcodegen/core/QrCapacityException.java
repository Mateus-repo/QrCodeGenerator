package com.qrcodegen.core;

/** O payload não cabe num QR code com as opções escolhidas. */
public class QrCapacityException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public QrCapacityException(String message) {
        super(message);
    }
}
