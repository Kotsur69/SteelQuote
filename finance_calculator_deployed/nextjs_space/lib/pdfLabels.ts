// Etykiety statycznego szablonu PDF (lib/pdf/offerHtml.ts) w każdym
// wspieranym języku UI. Osobne od lib/translations.ts (interfejs Translations UI),
// bo PDF renderuje się po stronie serwera z surowego HTML-a, nie przez komponenty React.

import type { Language } from './translations';
import { INCOTERM_LABELS, isTransportFreeIncoterm, type Incoterm } from './calculatorData';
import { formatValidityPeriod } from './quoteValidity';

// Sales terms ("Warunki" / OWS block) follow the text Lukasz (sales) sent on 2026-11-04. PL is his
// wording; EN / CZ / DE are our translations and still need his review. Functions taking `link`
// receive ready, already-escaped <a> HTML from the template - the label text itself is static.
export interface PdfLabels {
  defaultOfferTitle: string;
  // Saved offers only ("offer_30.2"); the client quotes it when ordering (terms, point 2).
  offerNumberLabel: string;
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
  termsTitle: string;
  invoiceNote: string;
  // Dominant SSC packaging of the offer, as its description (S01 -> "Kantówki"), not the code.
  packagingNote: (description: string) => string;
  // "Ważność oferty": quote validity picked per offer in days (1/2/5...), stored as hours
  // (lib/quoteValidity.ts). Legacy offers without the field fall back to payment days x 24.
  quoteValidityNote: (hours: number) => string;
  // "Cena obowiązuje przy dostawach w": delivery period picked in the calculator, already
  // formatted by formatPricePeriod ("Q4 2026" / "Listopad 2026" / "09.11.2026 – 15.12.2026").
  priceValidityNote: (period: string) => string;
  // Dominant delivery term of the offer; a delivered term adds the offer's delivery address,
  // FCA and FCA Kraków add a note that the client collects.
  deliveryTermsNote: (term: Incoterm, place: string) => string;
  // Payment term in days from the client's settings. 0 days = prepayment; none = individual.
  paymentTermDaysNote: (days: number) => string;
  paymentPrepaymentNote: string;
  paymentNote: string;
  minQuantityNote: string;
  toleranceNote: string;
  // Dominant certificate of the offer, e.g. "3.1 EN 10204".
  certificateNote: (certificate: string) => string;
  orderDetailsNote: string;
  otherTermsTitle: string;
  owsIntro: (link: string) => string;
  owsAcceptance: string;
  otherTerms: readonly string[];
  personalDataNote: (link: string) => string;
  orderOnlineTitle: string;
  orderOnlineNote: (link: string) => string;
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

// The same pages for every PDF language (only the PL pages were given).
export const OWS_URL = 'https://distribution.arcelormittal.com/pl-PL/pobierz';
export const ESTEEL_URL = 'https://e-steel.arcelormittal.com';

const deliveryTermsLine = (prefix: string, pickupNote: string, term: Incoterm, place: string) =>
  `${prefix}: ${INCOTERM_LABELS[term]}${isTransportFreeIncoterm(term) ? ` (${pickupNote})` : ''}${place ? `, ${place}` : ''}`;

export const PDF_LABELS: Record<Language, PdfLabels> = {
  pl: {
    defaultOfferTitle: 'Oferta cenowa',
    offerNumberLabel: 'Nr oferty: ',
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
    termsTitle: 'Warunki',
    invoiceNote: 'Faktura wystawiana wg wagi brutto',
    packagingNote: (description) => `Pakowanie: ${description}`,
    quoteValidityNote: (hours) => `Ważność oferty: ${formatValidityPeriod(hours, 'pl')} od daty wystawienia`,
    priceValidityNote: (period) => `Cena obowiązuje przy dostawach w: ${period}`,
    deliveryTermsNote: (term, place) => deliveryTermsLine('Warunki dostawy', 'odbiór własny', term, place),
    paymentTermDaysNote: (days) => `Warunki płatności: ${days} dni od dnia wystawienia faktury`,
    paymentPrepaymentNote: 'Warunki płatności: przedpłata',
    paymentNote: 'Warunki płatności: wg ustaleń indywidualnych',
    minQuantityNote: 'Minimalna wielkość zamówienia: 3 tony na pozycję lub wg odrębnych ustaleń',
    toleranceNote: 'Tolerancja wykonania zamówień +/- 10%',
    certificateNote: (certificate) => `Atest: ${certificate}`,
    orderDetailsNote: 'Dokładne ilości, terminy i warunki realizacji zamówienia na podstawie dodatkowych ustaleń',
    otherTermsTitle: 'Pozostałe warunki',
    owsIntro: (link) => `Integralną część oferty stanowią Ogólne Warunki Sprzedaży (OWS) dostępne na stronie ${link}`,
    owsAcceptance:
      'Klient oświadcza, że zapoznał się z OWS i nie wnosi do ich postanowień żadnych zastrzeżeń. Złożenie zamówienia przez Klienta jest równoznaczne z akceptacją OWS',
    otherTerms: [
      'W/w oferta jest ważna tylko w przypadku akceptacji oferty w całości.',
      'W przypadku złożenia zamówienia prosimy o powołanie się na numer niniejszej oferty.',
      'Złożone zamówienie, aby było wiążące, musi zostać potwierdzone pod względem ceny, dostępności materiału oraz terminu realizacji.',
      'Powyższa oferta nie powoduje rezerwacji materiału.',
      'Warunkiem realizacji niniejszej oferty jest spłata całości wymaganych wierzytelności wobec ArcelorMittal Distribution Solutions Poland Sp. z o.o.',
    ],
    personalDataNote: (link) => `Zasady przetwarzania danych osobowych znajdują się na stronie ${link}`,
    orderOnlineTitle: 'Zamawiaj online 24/7',
    orderOnlineNote: (link) => `Sprawdź naszą pełną ofertę i zyskaj czas dzięki szybkim zamówieniom na ${link}`,
    signPreparedBy: 'Sporządził',
    signClientAcceptance: 'Akceptacja klienta',
  },
  en: {
    defaultOfferTitle: 'Price Offer',
    offerNumberLabel: 'Offer no.: ',
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
    termsTitle: 'Terms',
    invoiceNote: 'Invoice issued based on gross weight',
    packagingNote: (description) => `Packaging: ${description}`,
    quoteValidityNote: (hours) => `Offer validity: ${formatValidityPeriod(hours, 'en')} from the issue date`,
    priceValidityNote: (period) => `Price valid for deliveries in: ${period}`,
    deliveryTermsNote: (term, place) => deliveryTermsLine('Delivery terms', 'own collection', term, place),
    paymentTermDaysNote: (days) => `Payment terms: ${days} days from the invoice issue date`,
    paymentPrepaymentNote: 'Payment terms: prepayment',
    paymentNote: 'Payment terms: as individually agreed',
    minQuantityNote: 'Minimum order quantity: 3 tonnes per item or as separately agreed',
    toleranceNote: 'Order fulfilment tolerance +/- 10%',
    certificateNote: (certificate) => `Inspection certificate: ${certificate}`,
    orderDetailsNote: 'Exact quantities, dates and terms of order fulfilment subject to further agreement',
    otherTermsTitle: 'Other terms',
    owsIntro: (link) => `The General Terms and Conditions of Sale (GTCS), available at ${link}, form an integral part of this offer`,
    owsAcceptance:
      'The Client declares that they have read the GTCS and raise no objections to their provisions. Placing an order by the Client constitutes acceptance of the GTCS',
    otherTerms: [
      'The above offer is valid only if accepted in its entirety.',
      'When placing an order, please refer to the number of this offer.',
      'To be binding, a placed order must be confirmed with regard to price, material availability and delivery date.',
      'This offer does not constitute a reservation of material.',
      'This offer is conditional upon payment in full of all receivables due to ArcelorMittal Distribution Solutions Poland Sp. z o.o.',
    ],
    personalDataNote: (link) => `The rules for processing personal data are available at ${link}`,
    orderOnlineTitle: 'Order online 24/7',
    orderOnlineNote: (link) => `Browse our full range and save time with fast ordering at ${link}`,
    signPreparedBy: 'Prepared by',
    signClientAcceptance: 'Client acceptance',
  },
  cs: {
    defaultOfferTitle: 'Cenová nabídka',
    offerNumberLabel: 'Číslo nabídky: ',
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
    colThickness: 'Tl. mm',
    colWidth: 'Šířka mm',
    colLength: 'Délka mm',
    colQty: 'Množ. t',
    colPrice: 'Cena',
    colValue: 'Hodnota',
    colNotes: 'Poznámky',
    coilSuffix: '(SVITEK)',
    totalRowLabel: 'CELKEM:',
    termsTitle: 'Podmínky',
    invoiceNote: 'Faktura vystavena na základě hrubé hmotnosti',
    packagingNote: (description) => `Balení: ${description}`,
    quoteValidityNote: (hours) => `Platnost nabídky: ${formatValidityPeriod(hours, 'cs')} od data vystavení`,
    priceValidityNote: (period) => `Cena platí pro dodávky v: ${period}`,
    deliveryTermsNote: (term, place) => deliveryTermsLine('Dodací podmínky', 'vlastní odběr', term, place),
    paymentTermDaysNote: (days) => `Platební podmínky: ${days} dní ode dne vystavení faktury`,
    paymentPrepaymentNote: 'Platební podmínky: platba předem',
    paymentNote: 'Platební podmínky: dle individuální dohody',
    minQuantityNote: 'Minimální velikost objednávky: 3 tuny na položku nebo dle samostatné dohody',
    toleranceNote: 'Tolerance plnění objednávek +/- 10 %',
    certificateNote: (certificate) => `Inspekční certifikát: ${certificate}`,
    orderDetailsNote: 'Přesná množství, termíny a podmínky plnění objednávky na základě dodatečné dohody',
    otherTermsTitle: 'Ostatní podmínky',
    owsIntro: (link) => `Nedílnou součástí nabídky jsou Všeobecné prodejní podmínky (VPP) dostupné na stránce ${link}`,
    owsAcceptance:
      'Zákazník prohlašuje, že se s VPP seznámil a nemá k jejich ustanovením žádné výhrady. Podání objednávky Zákazníkem je rovnocenné s přijetím VPP',
    otherTerms: [
      'Výše uvedená nabídka je platná pouze v případě přijetí nabídky v celém rozsahu.',
      'Při podání objednávky prosíme o uvedení čísla této nabídky.',
      'Podaná objednávka je závazná až po potvrzení ceny, dostupnosti materiálu a termínu plnění.',
      'Tato nabídka nezakládá rezervaci materiálu.',
      'Podmínkou realizace této nabídky je úhrada všech splatných pohledávek vůči ArcelorMittal Distribution Solutions Poland Sp. z o.o.',
    ],
    personalDataNote: (link) => `Zásady zpracování osobních údajů jsou k dispozici na stránce ${link}`,
    orderOnlineTitle: 'Objednávejte online 24/7',
    orderOnlineNote: (link) => `Prohlédněte si naši kompletní nabídku a ušetřete čas díky rychlým objednávkám na ${link}`,
    signPreparedBy: 'Vypracoval',
    signClientAcceptance: 'Akceptace klienta',
  },
  de: {
    defaultOfferTitle: 'Preisangebot',
    offerNumberLabel: 'Angebotsnr.: ',
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
    termsTitle: 'Bedingungen',
    invoiceNote: 'Rechnungsstellung auf Basis des Bruttogewichts',
    packagingNote: (description) => `Verpackung: ${description}`,
    quoteValidityNote: (hours) => `Angebotsgültigkeit: ${formatValidityPeriod(hours, 'de')} ab Angebotsdatum`,
    priceValidityNote: (period) => `Der Preis gilt für Lieferungen in: ${period}`,
    deliveryTermsNote: (term, place) => deliveryTermsLine('Lieferbedingungen', 'Selbstabholung', term, place),
    paymentTermDaysNote: (days) => `Zahlungsbedingungen: ${days} Tage ab Rechnungsdatum`,
    paymentPrepaymentNote: 'Zahlungsbedingungen: Vorkasse',
    paymentNote: 'Zahlungsbedingungen: nach individueller Vereinbarung',
    minQuantityNote: 'Mindestbestellmenge: 3 Tonnen pro Position oder nach gesonderter Vereinbarung',
    toleranceNote: 'Toleranz der Auftragsausführung +/- 10 %',
    certificateNote: (certificate) => `Prüfbescheinigung: ${certificate}`,
    orderDetailsNote: 'Genaue Mengen, Termine und Bedingungen der Auftragsausführung nach gesonderter Vereinbarung',
    otherTermsTitle: 'Weitere Bedingungen',
    owsIntro: (link) => `Integraler Bestandteil des Angebots sind die Allgemeinen Verkaufsbedingungen (AVB), abrufbar unter ${link}`,
    owsAcceptance:
      'Der Kunde erklärt, dass er die AVB zur Kenntnis genommen hat und keine Einwände gegen deren Bestimmungen erhebt. Die Erteilung einer Bestellung durch den Kunden gilt als Annahme der AVB',
    otherTerms: [
      'Das obige Angebot gilt nur bei Annahme des gesamten Angebots.',
      'Bitte beziehen Sie sich bei Ihrer Bestellung auf die Nummer dieses Angebots.',
      'Eine erteilte Bestellung ist erst nach Bestätigung von Preis, Materialverfügbarkeit und Liefertermin verbindlich.',
      'Dieses Angebot stellt keine Materialreservierung dar.',
      'Voraussetzung für die Ausführung dieses Angebots ist die vollständige Begleichung aller fälligen Forderungen gegenüber ArcelorMittal Distribution Solutions Poland Sp. z o.o.',
    ],
    personalDataNote: (link) => `Die Grundsätze der Verarbeitung personenbezogener Daten finden Sie unter ${link}`,
    orderOnlineTitle: 'Online bestellen 24/7',
    orderOnlineNote: (link) => `Entdecken Sie unser gesamtes Angebot und sparen Sie Zeit mit schnellen Bestellungen auf ${link}`,
    signPreparedBy: 'Erstellt von',
    signClientAcceptance: 'Kundenakzeptanz',
  },
};
