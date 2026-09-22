// Etykiety statycznego szablonu PDF (app/api/generate-pdf/route.ts) w każdym
// wspieranym języku UI. Osobne od lib/translations.ts (interfejs Translations UI),
// bo PDF renderuje się po stronie serwera z surowego HTML-a, nie przez komponenty React.

import type { Language } from './translations';

export interface PdfLabels {
  companySub: string;
  defaultOfferTitle: string;
  dateLabel: string;
  preparedByLabel: string;
  recipientTitle: string;
  companyLabel: string;
  personLabel: string;
  addressLabel: string;
  taxIdLabel: string;
  sapIdLabel: string;
  phoneLabel: string;
  emailLabel: string;
  summaryTitle: string;
  itemsLabel: string;
  totalTonsLabel: string;
  valueLabel: string;
  typesLabel: string;
  colNo: string;
  colDesc: string;
  colType: string;
  colThickness: string;
  colWidth: string;
  colLength: string;
  colQty: string;
  colPrice: string;
  colValue: string;
  colNotes: string;
  coilSuffix: string;
  totalRowLabel: string;
  pricesNote: (currencyCode: string) => string;
  rateNote: (rate: string) => string;
  invoiceNote: string;
  // Zakres dat "okresu ważności oferty" (od-do) wybranego w kalkulatorze — opcjonalna
  // dodatkowa linijka. Renderowana tylko gdy obie daty przyszły.
  validityRangeNote: (from: string, to: string) => string;
  paymentNote: string;
  // Termin płatności jako liczba dni (przyciski w kalkulatorze: 0/15/30/45/60/90 + "Inny") —
  // zastępuje paymentNote w stopce PDF, gdy handlowiec go wybrał. 0 dni = paymentPrepaymentNote
  // zamiast tego (patrz niżej), nie "0 dni". Brak wyboru = paymentNote zostaje bez zmian.
  paymentTermDaysNote: (days: number) => string;
  paymentPrepaymentNote: string;
  minQuantityNote: string;
  deliveryNote: string;
  toleranceNote: string;
  signPreparedBy: string;
  signClientAcceptance: string;
}

// Locale dla Date.toLocaleDateString — używany zarówno przez klienta (serverPdf.ts,
// przy formatowaniu daty oferty przed wysłaniem) jak i serwer (fallback gdy data
// nie przyszła w żądaniu).
export const PDF_DATE_LOCALE: Record<Language, string> = {
  pl: 'pl-PL',
  en: 'en-GB',
  cs: 'cs-CZ',
  de: 'de-DE',
};

export const PDF_LABELS: Record<Language, PdfLabels> = {
  pl: {
    companySub: 'Kalkulator Dopłat Stalowych',
    defaultOfferTitle: 'Oferta cenowa',
    dateLabel: 'Data: ',
    preparedByLabel: 'Sporządził: ',
    recipientTitle: 'Odbiorca',
    companyLabel: 'Firma:',
    personLabel: 'Osoba:',
    addressLabel: 'Adres:',
    taxIdLabel: 'NIP:',
    sapIdLabel: 'SAP ID:',
    phoneLabel: 'Telefon:',
    emailLabel: 'Email:',
    summaryTitle: 'Podsumowanie',
    itemsLabel: 'Pozycji:',
    totalTonsLabel: 'Łącznie t:',
    valueLabel: 'Wartość:',
    typesLabel: 'Typy:',
    colNo: 'Nr',
    colDesc: 'Gatunek / Opis',
    colType: 'Typ',
    colThickness: 'Grub. mm',
    colWidth: 'Szer. mm',
    colLength: 'Dł. mm',
    colQty: 'Ilość t',
    colPrice: 'Cena',
    colValue: 'Wartość',
    colNotes: 'Uwagi',
    coilSuffix: '(KRĄG)',
    totalRowLabel: 'RAZEM:',
    pricesNote: (currencyCode) => `Ceny w ${currencyCode}/t, bez podatku VAT.`,
    rateNote: (rate) => `Kurs przeliczeniowy: 1 EUR = ${rate} PLN (kurs z dnia wyceny).`,
    invoiceNote: 'Faktura wystawiana na podstawie wagi brutto.',
    validityRangeNote: (from, to) => `Okres ważności oferty: ${from} – ${to}.`,
    paymentNote: 'Warunki płatności: wg ustaleń indywidualnych.',
    paymentTermDaysNote: (days) => `Termin płatności: ${days} dni.`,
    paymentPrepaymentNote: 'Warunki płatności: przedpłata.',
    minQuantityNote: 'Minimalna ilość: 5 ton na pozycję.',
    deliveryNote: 'Termin dostawy: po potwierdzeniu dostępności materiału.',
    toleranceNote: 'Tolerancja wagowa +/- 10%.',
    signPreparedBy: 'Sporządził',
    signClientAcceptance: 'Akceptacja klienta',
  },
  en: {
    companySub: 'Steel Surcharge Calculator',
    defaultOfferTitle: 'Price Offer',
    dateLabel: 'Date: ',
    preparedByLabel: 'Prepared by: ',
    recipientTitle: 'Recipient',
    companyLabel: 'Company:',
    personLabel: 'Contact:',
    addressLabel: 'Address:',
    taxIdLabel: 'Tax ID:',
    sapIdLabel: 'SAP ID:',
    phoneLabel: 'Phone:',
    emailLabel: 'Email:',
    summaryTitle: 'Summary',
    itemsLabel: 'Items:',
    totalTonsLabel: 'Total t:',
    valueLabel: 'Value:',
    typesLabel: 'Types:',
    colNo: 'No.',
    colDesc: 'Grade / Description',
    colType: 'Type',
    colThickness: 'Thick. mm',
    colWidth: 'Width mm',
    colLength: 'Length mm',
    colQty: 'Qty t',
    colPrice: 'Price',
    colValue: 'Value',
    colNotes: 'Notes',
    coilSuffix: '(COIL)',
    totalRowLabel: 'TOTAL:',
    pricesNote: (currencyCode) => `Prices in ${currencyCode}/t, excluding VAT.`,
    rateNote: (rate) => `Exchange rate: 1 EUR = ${rate} PLN (rate as of valuation date).`,
    invoiceNote: 'Invoice issued based on gross weight.',
    validityRangeNote: (from, to) => `Offer validity period: ${from} – ${to}.`,
    paymentNote: 'Payment terms: as individually agreed.',
    paymentTermDaysNote: (days) => `Payment term: ${days} days.`,
    paymentPrepaymentNote: 'Payment terms: prepayment.',
    minQuantityNote: 'Minimum quantity: 5 tons per item.',
    deliveryNote: 'Delivery time: upon confirmation of material availability.',
    toleranceNote: 'Weight tolerance +/- 10%.',
    signPreparedBy: 'Prepared by',
    signClientAcceptance: 'Client acceptance',
  },
  cs: {
    companySub: 'Kalkulátor příplatků za ocel',
    defaultOfferTitle: 'Cenová nabídka',
    dateLabel: 'Datum: ',
    preparedByLabel: 'Vypracoval: ',
    recipientTitle: 'Odběratel',
    companyLabel: 'Firma:',
    personLabel: 'Kontakt:',
    addressLabel: 'Adresa:',
    taxIdLabel: 'DIČ:',
    sapIdLabel: 'SAP ID:',
    phoneLabel: 'Telefon:',
    emailLabel: 'Email:',
    summaryTitle: 'Souhrn',
    itemsLabel: 'Položky:',
    totalTonsLabel: 'Celkem t:',
    valueLabel: 'Hodnota:',
    typesLabel: 'Typy:',
    colNo: 'Č.',
    colDesc: 'Jakost / Popis',
    colType: 'Typ',
    colThickness: 'Tloušťka mm',
    colWidth: 'Šířka mm',
    colLength: 'Délka mm',
    colQty: 'Množ. t',
    colPrice: 'Cena',
    colValue: 'Hodnota',
    colNotes: 'Poznámky',
    coilSuffix: '(SVITEK)',
    totalRowLabel: 'CELKEM:',
    pricesNote: (currencyCode) => `Ceny v ${currencyCode}/t, bez DPH.`,
    rateNote: (rate) => `Směnný kurz: 1 EUR = ${rate} PLN (kurz ke dni ocenění).`,
    invoiceNote: 'Faktura vystavena na základě hrubé hmotnosti.',
    validityRangeNote: (from, to) => `Doba platnosti nabídky: ${from} – ${to}.`,
    paymentNote: 'Platební podmínky: dle individuální dohody.',
    paymentTermDaysNote: (days) => `Splatnost: ${days} dní.`,
    paymentPrepaymentNote: 'Platební podmínky: platba předem.',
    minQuantityNote: 'Minimální množství: 5 tun na položku.',
    deliveryNote: 'Termín dodání: po potvrzení dostupnosti materiálu.',
    toleranceNote: 'Hmotnostní tolerance +/- 10 %.',
    signPreparedBy: 'Vypracoval',
    signClientAcceptance: 'Akceptace klienta',
  },
  de: {
    companySub: 'Stahl-Zuschlagsrechner',
    defaultOfferTitle: 'Preisangebot',
    dateLabel: 'Datum: ',
    preparedByLabel: 'Erstellt von: ',
    recipientTitle: 'Empfänger',
    companyLabel: 'Firma:',
    personLabel: 'Kontakt:',
    addressLabel: 'Adresse:',
    taxIdLabel: 'USt-ID:',
    sapIdLabel: 'SAP ID:',
    phoneLabel: 'Telefon:',
    emailLabel: 'Email:',
    summaryTitle: 'Zusammenfassung',
    itemsLabel: 'Positionen:',
    totalTonsLabel: 'Gesamt t:',
    valueLabel: 'Wert:',
    typesLabel: 'Typen:',
    colNo: 'Nr.',
    colDesc: 'Güte / Beschreibung',
    colType: 'Typ',
    colThickness: 'Dicke mm',
    colWidth: 'Breite mm',
    colLength: 'Länge mm',
    colQty: 'Menge t',
    colPrice: 'Preis',
    colValue: 'Wert',
    colNotes: 'Hinweise',
    coilSuffix: '(COIL)',
    totalRowLabel: 'GESAMT:',
    pricesNote: (currencyCode) => `Preise in ${currencyCode}/t, ohne MwSt.`,
    rateNote: (rate) => `Wechselkurs: 1 EUR = ${rate} PLN (Kurs zum Bewertungsdatum).`,
    invoiceNote: 'Rechnungsstellung auf Basis des Bruttogewichts.',
    validityRangeNote: (from, to) => `Gültigkeitszeitraum des Angebots: ${from} – ${to}.`,
    paymentNote: 'Zahlungsbedingungen: nach individueller Vereinbarung.',
    paymentTermDaysNote: (days) => `Zahlungsziel: ${days} Tage.`,
    paymentPrepaymentNote: 'Zahlungsbedingungen: Vorkasse.',
    minQuantityNote: 'Mindestmenge: 5 Tonnen pro Position.',
    deliveryNote: 'Liefertermin: nach Bestätigung der Materialverfügbarkeit.',
    toleranceNote: 'Gewichtstoleranz +/- 10%.',
    signPreparedBy: 'Erstellt von',
    signClientAcceptance: 'Kundenakzeptanz',
  },
};
