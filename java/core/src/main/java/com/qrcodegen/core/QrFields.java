package com.qrcodegen.core;

import java.time.LocalDateTime;

/**
 * Campos de entrada, por categoria. Só os campos da categoria escolhida são
 * lidos.
 *
 * <p>Classe mutável com getters e setters, e não um registo com 36
 * componentes: preencher isto a partir de um formulário é imperativo, e ligar
 * cada campo a um {@code TextField} do JavaFX é ainda mais.
 */
public final class QrFields {

    // Link
    private String url = "";

    // Texto
    private String texto = "";

    // Email
    private String mailTo = "";
    private String mailSubject = "";
    private String mailBody = "";

    // Telefone / SMS / WhatsApp
    private String phonePrefix = "+351";
    private String phoneNumber = "";
    private String smsMessage = "";
    private String waMessage = "";

    // Evento
    private String eventTitle = "";
    private String eventDescription = "";
    private String eventLocation = "";
    private LocalDateTime eventStart = LocalDateTime.now();
    private LocalDateTime eventEnd = LocalDateTime.now().plusHours(1);

    // Localização — null ou fora do intervalo é inválido
    private Double geoLat;
    private Double geoLng;

    // WiFi
    private String wifiSsid = "";
    private String wifiPass = "";
    private String wifiSec = "WPA/WPA2";
    private boolean wifiHidden;

    // VCard
    private String vcFirstName = "";
    private String vcLastName = "";
    private String vcPhone = "";
    private String vcPhone2 = "";
    private String vcEmail = "";
    private String vcOrg = "";
    private String vcRole = "";
    private String vcStreet = "";
    private String vcCity = "";
    private String vcZip = "";
    private String vcCountry = "";

    // PIX
    private String pixKey = "";
    private String pixName = "";
    private String pixCity = "";
    private String pixAmount = "";
    private String pixTxid = "";
    private String pixDescription = "";
    private String pixPostcode = "";
    private boolean pixSingleUse;

    /** Campos vazios, para começar um formulário. */
    public static QrFields empty() {
        return new QrFields();
    }

    // --- Link -------------------------------------------------------------

    public String url() {
        return url;
    }

    public QrFields url(String url) {
        this.url = url;
        return this;
    }

    // --- Texto ------------------------------------------------------------

    public String texto() {
        return texto;
    }

    public QrFields texto(String texto) {
        this.texto = texto;
        return this;
    }

    // --- Email ------------------------------------------------------------

    public String mailTo() {
        return mailTo;
    }

    public QrFields mailTo(String mailTo) {
        this.mailTo = mailTo;
        return this;
    }

    public String mailSubject() {
        return mailSubject;
    }

    public QrFields mailSubject(String mailSubject) {
        this.mailSubject = mailSubject;
        return this;
    }

    public String mailBody() {
        return mailBody;
    }

    public QrFields mailBody(String mailBody) {
        this.mailBody = mailBody;
        return this;
    }

    // --- Telefone / SMS / WhatsApp ----------------------------------------

    public String phonePrefix() {
        return phonePrefix;
    }

    public QrFields phonePrefix(String phonePrefix) {
        this.phonePrefix = phonePrefix;
        return this;
    }

    public String phoneNumber() {
        return phoneNumber;
    }

    public QrFields phoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
        return this;
    }

    public String smsMessage() {
        return smsMessage;
    }

    public QrFields smsMessage(String smsMessage) {
        this.smsMessage = smsMessage;
        return this;
    }

    public String waMessage() {
        return waMessage;
    }

    public QrFields waMessage(String waMessage) {
        this.waMessage = waMessage;
        return this;
    }

    // --- Evento -----------------------------------------------------------

    public String eventTitle() {
        return eventTitle;
    }

    public QrFields eventTitle(String eventTitle) {
        this.eventTitle = eventTitle;
        return this;
    }

    public String eventDescription() {
        return eventDescription;
    }

    public QrFields eventDescription(String eventDescription) {
        this.eventDescription = eventDescription;
        return this;
    }

    public String eventLocation() {
        return eventLocation;
    }

    public QrFields eventLocation(String eventLocation) {
        this.eventLocation = eventLocation;
        return this;
    }

    public LocalDateTime eventStart() {
        return eventStart;
    }

    public QrFields eventStart(LocalDateTime eventStart) {
        this.eventStart = eventStart;
        return this;
    }

    public LocalDateTime eventEnd() {
        return eventEnd;
    }

    public QrFields eventEnd(LocalDateTime eventEnd) {
        this.eventEnd = eventEnd;
        return this;
    }

    // --- Localização ------------------------------------------------------

    public Double geoLat() {
        return geoLat;
    }

    public QrFields geoLat(Double geoLat) {
        this.geoLat = geoLat;
        return this;
    }

    public Double geoLng() {
        return geoLng;
    }

    public QrFields geoLng(Double geoLng) {
        this.geoLng = geoLng;
        return this;
    }

    // --- WiFi -------------------------------------------------------------

    public String wifiSsid() {
        return wifiSsid;
    }

    public QrFields wifiSsid(String wifiSsid) {
        this.wifiSsid = wifiSsid;
        return this;
    }

    public String wifiPass() {
        return wifiPass;
    }

    public QrFields wifiPass(String wifiPass) {
        this.wifiPass = wifiPass;
        return this;
    }

    public String wifiSec() {
        return wifiSec;
    }

    public QrFields wifiSec(String wifiSec) {
        this.wifiSec = wifiSec;
        return this;
    }

    public boolean wifiHidden() {
        return wifiHidden;
    }

    public QrFields wifiHidden(boolean wifiHidden) {
        this.wifiHidden = wifiHidden;
        return this;
    }

    // --- VCard ------------------------------------------------------------

    public String vcFirstName() {
        return vcFirstName;
    }

    public QrFields vcFirstName(String vcFirstName) {
        this.vcFirstName = vcFirstName;
        return this;
    }

    public String vcLastName() {
        return vcLastName;
    }

    public QrFields vcLastName(String vcLastName) {
        this.vcLastName = vcLastName;
        return this;
    }

    public String vcPhone() {
        return vcPhone;
    }

    public QrFields vcPhone(String vcPhone) {
        this.vcPhone = vcPhone;
        return this;
    }

    public String vcPhone2() {
        return vcPhone2;
    }

    public QrFields vcPhone2(String vcPhone2) {
        this.vcPhone2 = vcPhone2;
        return this;
    }

    public String vcEmail() {
        return vcEmail;
    }

    public QrFields vcEmail(String vcEmail) {
        this.vcEmail = vcEmail;
        return this;
    }

    public String vcOrg() {
        return vcOrg;
    }

    public QrFields vcOrg(String vcOrg) {
        this.vcOrg = vcOrg;
        return this;
    }

    public String vcRole() {
        return vcRole;
    }

    public QrFields vcRole(String vcRole) {
        this.vcRole = vcRole;
        return this;
    }

    public String vcStreet() {
        return vcStreet;
    }

    public QrFields vcStreet(String vcStreet) {
        this.vcStreet = vcStreet;
        return this;
    }

    public String vcCity() {
        return vcCity;
    }

    public QrFields vcCity(String vcCity) {
        this.vcCity = vcCity;
        return this;
    }

    public String vcZip() {
        return vcZip;
    }

    public QrFields vcZip(String vcZip) {
        this.vcZip = vcZip;
        return this;
    }

    public String vcCountry() {
        return vcCountry;
    }

    public QrFields vcCountry(String vcCountry) {
        this.vcCountry = vcCountry;
        return this;
    }

    // --- PIX --------------------------------------------------------------

    public String pixKey() {
        return pixKey;
    }

    public QrFields pixKey(String pixKey) {
        this.pixKey = pixKey;
        return this;
    }

    public String pixName() {
        return pixName;
    }

    public QrFields pixName(String pixName) {
        this.pixName = pixName;
        return this;
    }

    public String pixCity() {
        return pixCity;
    }

    public QrFields pixCity(String pixCity) {
        this.pixCity = pixCity;
        return this;
    }

    public String pixAmount() {
        return pixAmount;
    }

    public QrFields pixAmount(String pixAmount) {
        this.pixAmount = pixAmount;
        return this;
    }

    public String pixTxid() {
        return pixTxid;
    }

    public QrFields pixTxid(String pixTxid) {
        this.pixTxid = pixTxid;
        return this;
    }

    public String pixDescription() {
        return pixDescription;
    }

    public QrFields pixDescription(String pixDescription) {
        this.pixDescription = pixDescription;
        return this;
    }

    public String pixPostcode() {
        return pixPostcode;
    }

    public QrFields pixPostcode(String pixPostcode) {
        this.pixPostcode = pixPostcode;
        return this;
    }

    public boolean pixSingleUse() {
        return pixSingleUse;
    }

    public QrFields pixSingleUse(boolean pixSingleUse) {
        this.pixSingleUse = pixSingleUse;
        return this;
    }
}
