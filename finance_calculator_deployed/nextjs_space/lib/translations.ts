// Translation system for multi-language support
// Currently supports: Polish (pl), English (en)
// Easily extensible - just add new language objects following the same structure

export type Language = 'pl' | 'en' | 'cs' | 'de';

export interface Translations {
  // Common
  common: {
    currency: string;
    currencyLabel: string;
    tons: string;
    logout: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    duplicate: string;
    add: string;
    clear: string;
    yes: string;
    no: string;
    loading: string;
    version: string;
  };

  // Navigation
  navigation: {
    calculator: string;
    myOffers: string;
    panelAdmin: string;
    panelSenior: string;
  };

  // Sorting (offer lists)
  sort: {
    label: string;
    date: string;
    name: string;
    value: string;
    status: string;
    ascending: string;
    descending: string;
  };

  // Senior panel
  senior: {
    panelTitle: string;
    subtitle: string;
    pendingOffers: string;
    noOffersPending: string;
    author: string;
    editInCalculator: string;
    rejectModalTitle: string;
    rejectCommentLabel: string;
    rejectCommentPlaceholder: string;
    rejectCommentRequired: string;
    confirmReject: string;
    offerApproved: string;
    offerRejected: string;
    allOffers: string;
    pendingOnly: string;
    reviewedByMe: string;
    awaitingSend: string;
  };

  // Offers management
  offers: {
    title: string;
    subtitle: string;
    empty: string;
    saveOffer: string;
    saveOfferPrompt: string;
    offerName: string;
    offerNamePlaceholder: string;
    offerNameOptionalHint: string;
    searchPlaceholder: string;
    searchNoResults: string;
    saving: string;
    saved: string;
    saveFailed: string;
    editOffer: string;
    copyOffer: string;
    deleteOffer: string;
    confirmDelete: string;
    loadOffer: string;
    loadingOffer: string;
    offerLoaded: string;
    loadFailed: string;
    createdAt: string;
    updatedAt: string;
    items: string;
    totalValue: string;
    actions: string;
    noItems: string;
    duplicated: string;
    needsReviewBadge: string;
    readyToSendBadge: string;
    deleted: string;
    updated: string;
  };
  
  // Login page
  login: {
    title: string;
    subtitle: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    loginButton: string;
    loggingIn: string;
    loginError: string;
    connectionError: string;
    copyright: string;
  };
  
  // Calculator header
  header: {
    title: string;
    subtitle: string;
    light: string;
    dark: string;
    highContrastOn: string;
    highContrastOff: string;
  };
  
  // Steel types
  steelTypes: {
    HRS: string;
    CR: string;
    HDG: string;
    HRS_full: string;
    CR_full: string;
    HDG_full: string;
  };
  
  // Input parameters
  inputs: {
    thickness: string;
    width: string;
    length: string;
    grade: string;
    searchGrade: string;
    coilMode: string;
    coilModeShort: string;
    sheetMode: string;
    sheetModeShort: string;
    sheetWeight: string;
  };
  
  // Mill surcharges (Huta)
  huta: {
    title: string;
    subtitle: string;
    pglPeriod: string;
    thicknessWidth: string;
    grade: string;
    thicknessTolerance: string;
    certificate: string;
    coating: string;
    protection: string;
    packaging: string;
    surface: string;
    surfaceFinish: string;
    weld: string;
    sum: string;
    unavailable: string;
  };
  
  // SSC Processing surcharges
  ssc: {
    title: string;
    subtitle: string;
    baseSurcharge: string;
    lengthTolerance: string;
    flatness: string;
    surface: string;
    maxPackWeight: string;
    marking: string;
    edging: string;
    yieldStrength: string;
    packaging: string;
    packagingDesc: {
      S01: string;
      S03: string;
      S12: string;
      S13: string;
      SB2: string;
      SB3: string;
    };
    labels: string;
    scrap: string;
    sum: string;
  };
  
  // Summary section
  summary: {
    title: string;
    subtitle: string;
    pglBase: string;
    pglBelowBaseWarning: string;
    millSurcharges: string;
    inputPrice: string;
    margin: string;
    marginBelowMinWarning: string;
    extra: string;
    transport: string;
    sscSurcharges: string;
    finalPrice: string;
    quantity: string;
    totalValue: string;
    addToList: string;
    updateItem: string;
    cancelEdit: string;
  };
  
  // Zestawienie (Summary list)
  zestawienie: {
    title: string;
    subtitle: string;
    empty: string;
    type: string;
    grade: string;
    dimensions: string;
    mill: string;
    ssc: string;
    margin: string;
    price: string;
    tons: string;
    value: string;
    actions: string;
    total: string;
    clearAll: string;
    confirmClear: string;
  };
  
  // Toggle options
  toggles: {
    // Length tolerance
    normal: string;
    lessThan5mm: string;
    // Flatness
    enStandard: string;
    laser13: string;
    customerSpec: string;
    // Surface
    improved: string;
    // Marking
    none: string;
    engraved: string;
    marker: string;
    // Edging
    mill: string;
    trimmed: string;
    // Packaging
    noPaper: string;
    paperPlastic: string;
    seaTransport: string;
    paperPlasticCE: string;
    // Surface finish CR
    normalFinish: string;
    rough: string;
    glossy: string;
    semiGlossy: string;
    // Surface finish HDG
    standard: string;
    bright: string;
    // Weld
    allowed: string;
    notAllowed: string;
    other: string;
    // Surface quality
    surfaceA: string;
    surfaceB: string;
    // HDG Surface
    surfaceMA: string;
    surfaceMB: string;
    surfaceMC: string;
  };
  
  // Warning messages
  warnings: {
    minThickness: string;
    maxThickness: string;
    outOfRange: string;
    widthOutOfRange: string;
    baseSurchargeFallback: string;
    legacyItemEdit: string;
  };

  // Client information
  client: {
    title: string;
    subtitle: string;
    firstName: string;
    lastName: string;
    company: string;
    address: string;
    nip: string;
    sapId: string;
    phone: string;
    email: string;
    collapse: string;
    expand: string;
    // Nagłówki dwóch sekcji panelu klienta: dane firmy (wymagane) i dane
    // kontaktowe (opcjonalne, odblokowywane firmą + NIP-em).
    companySection: string;
    contactSection: string;
    contactLocked: string;
    searchPlaceholder: string;
    // Podpowiedź pod polem "Imię" — osoby zapisane dla wskazanej firmy. Osobny tekst
    // od searchPlaceholder, bo tamten zachęca do pisania, a to pole pokazuje listę
    // już po samym kliknięciu.
    contactSearchPlaceholder: string;
    lookupError: string;
    saveContact: string;
    contactSaving: string;
    contactSaved: string;
    contactSaveFailed: string;
    contactNameRequired: string;
  };

  // PDF Export
  pdf: {
    exportPdf: string;
    generating: string;
    offerNo: string;
    date: string;
    from: string;
    to: string;
    reference: string;
    quotation: string;
    tableNo: string;
    tableGrade: string;
    tableThickness: string;
    tableWidth: string;
    tableLength: string;
    tableQuantity: string;
    tablePrice: string;
    tableComments: string;
    total: string;
    terms: string;
    validity: string;
    payment: string;
    delivery: string;
    minQuantity: string;
    bestRegards: string;
    companyInfo: string;
  };

  // Eksport/import Excel (format KTS/GPAO)
  excel: {
    exportExcel: string;
  };

  // Role handlowców
  roles: {
    junior: string;
    senior: string;
    admin: string;
  };

  // Statusy oferty (badge)
  offerStatus: {
    draft: string;
    pending_review: string;
    approved: string;
    rejected: string;
    sent: string;
  };

  // Obieg akceptacji ofert
  workflow: {
    submitForReview: string;
    sendToClient: string;
    approve: string;
    reject: string;
    rejectReasonLabel: string;
    rejectReasonPlaceholder: string;
    rejectReasonRequired: string;
    confirmApprove: string;
    rejectionReason: string;
    reviewedBy: string;
    awaitingReview: string;
    submitted: string;
    approved: string;
    rejected: string;
    sent: string;
    actionFailed: string;
    readOnlySent: string;
  };

  // Panel administracyjny
  admin: {
    panelTitle: string;
    subtitle: string;
    navDashboard: string;
    navSalespeople: string;
    navClients: string;
    navOffers: string;
    navSettings: string;
    settings: {
      title: string;
      subtitle: string;
      eurPlnRate: string;
      eurPlnRateHint: string;
      pglBaseHrs: string;
      pglBaseCr: string;
      pglBaseHdg: string;
      pglBaseHint: string;
      minMarginPct: string;
      minMarginPctHint: string;
      transportBase: string;
      transportBaseHint: string;
      save: string;
      saved: string;
      saveFailed: string;
      frozenRateNotice: string;
      historyTitle: string;
      historyDownload: string;
      historyEmpty: string;
      historyLoading: string;
      historyColType: string;
      historyColOld: string;
      historyColNew: string;
      historyColDelta: string;
      historyColBy: string;
      historyColWhen: string;
    };
    totalOffers: string;
    activeSalespeople: string;
    offersByStatus: string;
    addSalesperson: string;
    email: string;
    password: string;
    passwordKeepEmpty: string;
    fullName: string;
    role: string;
    status: string;
    active: string;
    inactive: string;
    activate: string;
    deactivate: string;
    save: string;
    cancel: string;
    viewOffers: string;
    confirmDeactivate: string;
    userCreated: string;
    userUpdated: string;
    userDeactivated: string;
    emailExists: string;
    passwordTooShort: string;
    addClient: string;
    editClient: string;
    firstName: string;
    lastName: string;
    company: string;
    nip: string;
    address: string;
    phone: string;
    clientEmailLabel: string;
    offersCount: string;
    confirmDeleteClient: string;
    clientCreated: string;
    clientUpdated: string;
    clientDeleted: string;
    noClients: string;
    clientRequiredField: string;
    filterStatus: string;
    filterSalesperson: string;
    dateFrom: string;
    dateTo: string;
    allStatuses: string;
    allSalespeople: string;
    clearFilters: string;
    owner: string;
    reviewer: string;
    noOffersFound: string;
    loadFailed: string;
    saveFailed: string;
    back: string;
    actions: string;
    createdAt: string;
    deletedUser: string;
    navContacts: string;
    noContacts: string;
    confirmDeleteContact: string;
    contactUpdated: string;
    contactDeleted: string;
    addContact: string;
    editContact: string;
    person: string;
    contactCreated: string;
    noClientContacts: string;
  };
}

// Polish translations (default)
export const pl: Translations = {
  common: {
    currency: '€/t',
    currencyLabel: 'Waluta',
    tons: 't',
    logout: 'Wyloguj',
    cancel: 'Anuluj',
    save: 'Zapisz',
    delete: 'Usuń',
    edit: 'Edytuj',
    duplicate: 'Duplikuj',
    add: 'Dodaj',
    clear: 'Wyczyść',
    yes: 'Tak',
    no: 'Nie',
    loading: 'Ładowanie...',
    version: 'v1.5',
  },

  navigation: {
    calculator: 'Kalkulator',
    myOffers: 'Moje Oferty',
    panelAdmin: 'Panel Admina',
    panelSenior: 'Panel Seniora',
  },

  sort: {
    label: 'Sortuj wg',
    date: 'Data',
    name: 'Nazwa',
    value: 'Wartość',
    status: 'Status',
    ascending: 'Rosnąco',
    descending: 'Malejąco',
  },

  senior: {
    panelTitle: 'Panel Starszego Konsultanta',
    subtitle: 'weryfikacja ofert',
    pendingOffers: 'Oferty do weryfikacji',
    noOffersPending: 'Brak ofert oczekujących na weryfikację.',
    author: 'Autor',
    editInCalculator: 'Edytuj w kalkulatorze',
    rejectModalTitle: 'Odrzucić ofertę?',
    rejectCommentLabel: 'Komentarz (wymagany)',
    rejectCommentPlaceholder: 'Podaj powód odrzucenia oferty…',
    rejectCommentRequired: 'Komentarz jest wymagany przy odrzuceniu oferty.',
    confirmReject: 'Odrzuć ofertę',
    offerApproved: 'Oferta została zatwierdzona.',
    offerRejected: 'Oferta została odrzucona.',
    allOffers: 'Wszystkie',
    pendingOnly: 'Oczekujące na weryfikację',
    reviewedByMe: 'Zweryfikowane przeze mnie',
    awaitingSend: 'Oczekujące na wysłanie',
  },

  offers: {
    title: 'Moje Oferty',
    subtitle: 'zarządzanie ofertami',
    empty: 'Nie masz jeszcze żadnych zapisanych ofert. Utwórz pierwszą ofertę w kalkulatorze.',
    saveOffer: 'Zapisz ofertę',
    saveOfferPrompt: 'Podaj nazwę oferty',
    offerName: 'Nazwa oferty',
    offerNamePlaceholder: 'np. Oferta dla klienta ABC',
    offerNameOptionalHint: 'Możesz zostawić puste — oferta dostanie nazwę „offer_[numer]”.',
    searchPlaceholder: 'Szukaj po nazwie lub numerze oferty...',
    searchNoResults: 'Brak ofert pasujących do wyszukiwania.',
    saving: 'Zapisywanie...',
    saved: 'Oferta zapisana pomyślnie!',
    saveFailed: 'Nie udało się zapisać oferty',
    editOffer: 'Edytuj ofertę',
    copyOffer: 'Kopiuj ofertę',
    deleteOffer: 'Usuń ofertę',
    confirmDelete: 'Czy na pewno chcesz usunąć tę ofertę?',
    loadOffer: 'Wczytaj ofertę',
    loadingOffer: 'Wczytywanie oferty...',
    offerLoaded: 'Oferta wczytana pomyślnie!',
    loadFailed: 'Nie udało się wczytać oferty',
    createdAt: 'Utworzono',
    updatedAt: 'Zaktualizowano',
    items: 'pozycji',
    totalValue: 'Wartość całkowita',
    actions: 'Akcje',
    noItems: 'Brak pozycji',
    duplicated: 'Oferta skopiowana pomyślnie!',
    needsReviewBadge: 'Wymaga zatwierdzenia',
    readyToSendBadge: 'Gotowa do wysyłki',
    deleted: 'Oferta usunięta pomyślnie!',
    updated: 'Oferta zaktualizowana pomyślnie!',
  },
  
  login: {
    title: 'Kalkulator Dopłat',
    subtitle: 'steel surcharge pricing tool',
    email: 'Email',
    emailPlaceholder: 'twoj@email.com',
    password: 'Hasło',
    passwordPlaceholder: '••••••••',
    loginButton: 'ZALOGUJ SIĘ',
    loggingIn: 'LOGOWANIE...',
    loginError: 'Błąd logowania',
    connectionError: 'Błąd połączenia z serwerem',
    copyright: '© 2025 · Steel Surcharge Calculator',
  },
  
  header: {
    title: 'Kalkulator Dopłat do Stali',
    subtitle: 'steel surcharge pricing tool',
    light: 'Light',
    dark: 'Dark',
    highContrastOn: 'Normalny widok',
    highContrastOff: 'Wysoki kontrast',
  },
  
  steelTypes: {
    HRS: 'HRS',
    CR: 'CR',
    HDG: 'HDG',
    HRS_full: 'Hot Rolled Steel',
    CR_full: 'Cold Rolled Steel',
    HDG_full: 'Hot Dip Galvanized',
  },
  
  inputs: {
    thickness: 'Grubość (mm)',
    width: 'Szerokość (mm)',
    length: 'Długość (mm)',
    grade: 'Gatunek',
    searchGrade: 'Szukaj gatunku…',
    coilMode: 'KRĄG',
    coilModeShort: 'Krąg (bez cięcia)',
    sheetMode: 'Arkusz',
    sheetModeShort: 'Arkusz (cięcie na wymiar)',
    sheetWeight: 'Waga arkusza',
  },
  
  huta: {
    title: 'Huta Dopłaty',
    subtitle: 'mill surcharges',
    pglPeriod: 'Okres ważności PGL',
    thicknessWidth: 'Grubość / szerokość',
    grade: 'Gatunek',
    thicknessTolerance: 'Tolerancja grubości',
    certificate: 'Certyfikat',
    coating: 'Powłoka',
    protection: 'Zabezpieczenie',
    packaging: 'Opakowanie',
    surface: 'Powierzchnia',
    surfaceFinish: 'Wykończenie pow.',
    weld: 'Zgrzew',
    sum: 'SUMA Huta',
    unavailable: '— (niedostępne)',
  },
  
  ssc: {
    title: 'SSC Dopłaty Processing',
    subtitle: 'processing surcharges',
    baseSurcharge: 'Podstawowa dopłata (dług.)',
    lengthTolerance: 'Tolerancja długości',
    flatness: 'Płaskość',
    surface: 'Powierzchnia',
    maxPackWeight: 'Max. waga paczki',
    marking: 'Oznakowanie',
    edging: 'Brzegowanie',
    yieldStrength: 'Granica plastyczności (YS)',
    packaging: 'Rodzaj opakowania',
    packagingDesc: {
      S01: 'Kantówki',
      S03: 'Na kantówkach + korytka',
      S12: 'Kantówki + papier góra i dół',
      S13: 'Kantówki + papier góra i dół + korytka zabezpieczające',
      SB2: 'Paleta + papier góra i dół',
      SB3: 'Paleta + papier góra i dół + korytka zabezpieczające',
    },
    labels: 'Etykiety',
    scrap: 'Złom',
    sum: 'SUMA SSC',
  },
  
  summary: {
    title: 'Podsumowanie',
    subtitle: 'final pricing',
    pglBase: 'PGL bazowe',
    pglBelowBaseWarning: 'PGL bazowe poniżej wartości ustawionej w Ustawieniach — ta pozycja będzie wymagać zatwierdzenia',
    millSurcharges: 'Dopłaty huta',
    inputPrice: 'Cena wsadu',
    margin: 'Marża',
    marginBelowMinWarning: 'Marża poniżej wymaganego minimum — ta pozycja będzie wymagać zatwierdzenia',
    extra: 'Dopłata dodatkowa',
    transport: 'Transport',
    sscSurcharges: 'Dopłaty SSC',
    finalPrice: 'Cena końcowa',
    quantity: 'Ilość (tony)',
    totalValue: 'Wartość całkowita',
    addToList: 'Dodaj do zestawienia',
    updateItem: 'Aktualizuj pozycję',
    cancelEdit: 'Anuluj edycję',
  },
  
  zestawienie: {
    title: 'Zestawienie',
    subtitle: 'summary list',
    empty: 'Brak pozycji w zestawieniu. Dodaj pierwszą kalkulację używając przycisku "Dodaj do zestawienia".',
    type: 'Typ',
    grade: 'Gatunek',
    dimensions: 'Wymiary',
    mill: 'Huta',
    ssc: 'SSC',
    margin: 'Marża',
    price: 'Cena',
    tons: 'Tonaż',
    value: 'Wartość',
    actions: 'Akcje',
    total: 'RAZEM',
    clearAll: 'Wyczyść wszystko',
    confirmClear: 'Czy na pewno chcesz usunąć wszystkie pozycje zestawienia?',
  },
  
  toggles: {
    normal: 'Normalna',
    lessThan5mm: '<5mm',
    enStandard: 'Wg normy EN',
    laser13: 'Laser 1/3',
    customerSpec: 'Wg klienta',
    improved: 'Ulepszona',
    none: 'Brak',
    engraved: 'Grawerem',
    marker: 'Markerem',
    mill: 'Walcowane',
    trimmed: 'Obcięte',
    noPaper: 'Bez papieru',
    paperPlastic: 'Papier/plastik',
    seaTransport: 'Transport morski',
    paperPlasticCE: 'Papier/plastik (CE)',
    normalFinish: 'Normalna',
    rough: 'Szorstka',
    glossy: 'Połyskująca',
    semiGlossy: 'Półpołysk.',
    standard: 'Standard',
    bright: 'Błyszczące',
    allowed: 'Dozwolony',
    notAllowed: 'Niedozwolony',
    other: 'Inne',
    surfaceA: 'A',
    surfaceB: 'B',
    surfaceMA: 'MA',
    surfaceMB: 'MB',
    surfaceMC: 'MC',
  },
  
  warnings: {
    minThickness: 'Dla szerokości <strong>{width} mm</strong> minimalna grubość wynosi <strong>{minTh} mm</strong>. Wpisana wartość ({thickness} mm) jest za mała.',
    maxThickness: 'Dla szerokości <strong>{width} mm</strong> maksymalna dostępna grubość wynosi <strong>{maxTh} mm</strong>. Wpisana wartość ({thickness} mm) jest za duża.',
    outOfRange: 'Kombinacja grubości <strong>{thickness} mm</strong> i szerokości <strong>{width} mm</strong> jest poza zakresem tabeli.',
    widthOutOfRange: 'Szerokość <strong>{width} mm</strong> jest poza zakresem tabeli.',
    baseSurchargeFallback: 'Grubość <strong>{thickness} mm</strong> jest poza zakresem tabeli dopłat bazowych SSC — użyto szacunkowej dopłaty <strong>{value} €/t</strong>, która może być niedokładna.',
    legacyItemEdit: 'Ta pozycja została dodana przed wprowadzeniem szczegółowej edycji — przełączniki dopłat po lewej NIE zostały automatycznie odtworzone z oryginału. Sprawdź je ręcznie przed zapisaniem, inaczej cena może się zmienić.',
  },

  client: {
    title: 'Dane Klienta',
    subtitle: 'informacje o kliencie',
    firstName: 'Imię',
    lastName: 'Nazwisko',
    company: 'Firma',
    address: 'Adres',
    nip: 'NIP',
    sapId: 'SAP ID',
    phone: 'Nr telefonu',
    email: 'E-mail',
    collapse: 'Zwiń',
    expand: 'Rozwiń',
    companySection: 'Dane firmy',
    contactSection: 'Dane kontaktowe',
    contactLocked: 'Uzupełnij firmę i NIP, żeby wpisać dane kontaktowe',
    searchPlaceholder: 'Zacznij pisać — podpowiemy z bazy',
    contactSearchPlaceholder: 'Wybierz osobę lub wpisz nową',
    lookupError: 'Nie udało się pobrać podpowiedzi',
    saveContact: '💾 Zapisz kontakt do firmy',
    contactSaving: 'Zapisywanie...',
    contactSaved: 'Kontakt zapisany w katalogu firmy',
    contactSaveFailed: 'Nie udało się zapisać kontaktu',
    contactNameRequired: 'Podaj imię lub nazwisko',
  },

  pdf: {
    exportPdf: 'Eksportuj do PDF',
    generating: 'Generowanie...',
    offerNo: 'OFERTA NR',
    date: 'DATA',
    from: 'OD',
    to: 'DO',
    reference: 'REF',
    quotation: 'Wycena stali na',
    tableNo: 'Lp.',
    tableGrade: 'Gatunek',
    tableThickness: 'Grubość',
    tableWidth: 'Szerokość',
    tableLength: 'Długość',
    tableQuantity: 'Ilość [T]',
    tablePrice: 'Cena EUR/T',
    tableComments: 'Uwagi',
    total: 'RAZEM',
    terms: 'Warunki oferty',
    validity: 'Ważność oferty: 48h',
    payment: 'Warunki płatności: 30 dni od daty sprzedaży',
    delivery: 'Czas dostawy: po potwierdzeniu dostępności materiału',
    minQuantity: 'Minimalna ilość: 5 ton na pozycję',
    bestRegards: 'Z poważaniem,',
    companyInfo: 'SSC Distribution Solutions Poland Sp. z o.o.',
  },
  excel: {
    exportExcel: 'Eksportuj Excel',
  },

  roles: {
    junior: 'Młodszy handlowiec',
    senior: 'Starszy handlowiec',
    admin: 'Administrator',
  },

  offerStatus: {
    draft: 'Szkic',
    pending_review: 'Do weryfikacji',
    approved: 'Zatwierdzona',
    rejected: 'Odrzucona',
    sent: 'Wysłana',
  },

  workflow: {
    submitForReview: 'Wyślij do weryfikacji',
    sendToClient: 'Wyślij do klienta',
    approve: 'Zatwierdź',
    reject: 'Odrzuć',
    rejectReasonLabel: 'Powód odrzucenia',
    rejectReasonPlaceholder: 'Podaj powód odrzucenia oferty...',
    rejectReasonRequired: 'Powód odrzucenia jest wymagany',
    confirmApprove: 'Zatwierdzić tę ofertę?',
    rejectionReason: 'Powód odrzucenia',
    reviewedBy: 'Zweryfikował',
    awaitingReview: 'Oczekuje na weryfikację',
    submitted: 'Wysłano do weryfikacji',
    approved: 'Oferta zatwierdzona',
    rejected: 'Oferta odrzucona',
    sent: 'Oferta wysłana do klienta',
    actionFailed: 'Operacja nie powiodła się',
    readOnlySent: 'Oferta wysłana — tylko do odczytu',
  },

  admin: {
    panelTitle: 'Panel Administratora',
    subtitle: 'zarządzanie systemem',
    navDashboard: 'Pulpit',
    navSalespeople: 'Handlowcy',
    navClients: 'Klienci',
    navOffers: 'Oferty',
    navSettings: 'Ustawienia',
    settings: {
      title: 'Konfiguracja',
      subtitle: 'wartości bazowe i kurs walutowy',
      eurPlnRate: 'Kurs EUR → PLN',
      eurPlnRateHint: 'Ile złotych kosztuje 1 euro (np. 4,30).',
      pglBaseHrs: 'PGL bazowe (HRS)',
      pglBaseCr: 'PGL bazowe (CR)',
      pglBaseHdg: 'PGL bazowe (HDG)',
      pglBaseHint: 'Wartość startowa PGL w nowej kalkulacji dla tego typu stali. Handlowiec może ją nadpisać.',
      transportBase: 'Transport bazowy',
      minMarginPct: 'Minimalna marża (%)',
      minMarginPctHint: 'Poniżej tego progu marża pozycji wymaga zatwierdzenia przez seniora lub admina.',
      transportBaseHint: 'Wartość startowa transportu w nowej kalkulacji. Handlowiec może ją nadpisać.',
      save: 'Zapisz ustawienia',
      saved: 'Ustawienia zapisane.',
      saveFailed: 'Nie udało się zapisać ustawień.',
      frozenRateNotice:
        'Zmiany dotyczą wyłącznie NOWYCH kalkulacji. Oferty zapisane, oczekujące na akceptację seniora i wysłane zachowują swój kurs oraz swoje PGL z dnia wyceny.',
      historyTitle: 'Historia zmian PGL bazowego',
      historyDownload: 'Pobierz historię (.xlsx)',
      historyEmpty: 'Brak zapisanych zmian cen PGL.',
      historyLoading: 'Wczytywanie historii…',
      historyColType: 'Typ stali',
      historyColOld: 'Stara cena',
      historyColNew: 'Nowa cena',
      historyColDelta: 'Zmiana',
      historyColBy: 'Zmienił',
      historyColWhen: 'Data zmiany',
    },
    totalOffers: 'Oferty łącznie',
    activeSalespeople: 'Aktywni handlowcy',
    offersByStatus: 'Oferty wg statusu',
    addSalesperson: 'Dodaj handlowca',
    email: 'E-mail',
    password: 'Hasło',
    passwordKeepEmpty: 'Zostaw puste, aby nie zmieniać',
    fullName: 'Imię i nazwisko',
    role: 'Rola',
    status: 'Status',
    active: 'Aktywny',
    inactive: 'Nieaktywny',
    activate: 'Aktywuj',
    deactivate: 'Dezaktywuj',
    save: 'Zapisz',
    cancel: 'Anuluj',
    viewOffers: 'Zobacz oferty',
    confirmDeactivate: 'Dezaktywować to konto? Handlowiec nie będzie mógł się zalogować, ale jego oferty zostaną zachowane.',
    userCreated: 'Konto utworzone',
    userUpdated: 'Konto zaktualizowane',
    userDeactivated: 'Konto dezaktywowane',
    emailExists: 'Konto z tym e-mailem już istnieje',
    passwordTooShort: 'Hasło musi mieć min. 6 znaków',
    addClient: 'Dodaj klienta',
    editClient: 'Edytuj klienta',
    firstName: 'Imię',
    lastName: 'Nazwisko',
    company: 'Firma',
    nip: 'NIP',
    address: 'Adres',
    phone: 'Telefon',
    clientEmailLabel: 'E-mail',
    offersCount: 'Liczba ofert',
    confirmDeleteClient: 'Usunąć tego klienta? Powiązane oferty zachowają swoje dane, ale stracą powiązanie z bazą klientów.',
    clientCreated: 'Klient dodany',
    clientUpdated: 'Dane klienta zaktualizowane',
    clientDeleted: 'Klient usunięty',
    noClients: 'Brak klientów w bazie',
    clientRequiredField: 'Podaj przynajmniej firmę lub nazwisko klienta',
    filterStatus: 'Status',
    filterSalesperson: 'Handlowiec',
    dateFrom: 'Data od',
    dateTo: 'Data do',
    allStatuses: 'Wszystkie statusy',
    allSalespeople: 'Wszyscy handlowcy',
    clearFilters: 'Wyczyść filtry',
    owner: 'Handlowiec',
    reviewer: 'Zweryfikował',
    noOffersFound: 'Brak ofert spełniających kryteria',
    loadFailed: 'Nie udało się wczytać danych',
    saveFailed: 'Nie udało się zapisać',
    back: 'Wróć',
    actions: 'Akcje',
    createdAt: 'Utworzono',
    deletedUser: '— handlowiec usunięty —',
    navContacts: 'Kontakty',
    noContacts: 'Brak kontaktów w bazie',
    confirmDeleteContact: 'Czy na pewno usunąć ten kontakt?',
    contactUpdated: 'Kontakt zaktualizowany',
    contactDeleted: 'Kontakt usunięty',
    addContact: 'Dodaj kontakt',
    editContact: 'Edytuj kontakt',
    person: 'Osoba',
    contactCreated: 'Kontakt dodany',
    noClientContacts: 'Brak zapisanych kontaktów',
  },
};

// English translations
export const en: Translations = {
  common: {
    currency: '€/t',
    currencyLabel: 'Currency',
    tons: 't',
    logout: 'Logout',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    duplicate: 'Duplicate',
    add: 'Add',
    clear: 'Clear',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading...',
    version: 'v1.5',
  },

  navigation: {
    calculator: 'Calculator',
    myOffers: 'My Offers',
    panelAdmin: 'Admin Panel',
    panelSenior: 'Senior Panel',
  },

  sort: {
    label: 'Sort by',
    date: 'Date',
    name: 'Name',
    value: 'Value',
    status: 'Status',
    ascending: 'Ascending',
    descending: 'Descending',
  },

  senior: {
    panelTitle: 'Senior Consultant Panel',
    subtitle: 'offer review',
    pendingOffers: 'Offers awaiting review',
    noOffersPending: 'No offers pending review.',
    author: 'Author',
    editInCalculator: 'Edit in calculator',
    rejectModalTitle: 'Reject offer?',
    rejectCommentLabel: 'Comment (required)',
    rejectCommentPlaceholder: 'Provide a reason for rejecting the offer…',
    rejectCommentRequired: 'A comment is required when rejecting an offer.',
    confirmReject: 'Reject offer',
    offerApproved: 'Offer has been approved.',
    offerRejected: 'Offer has been rejected.',
    allOffers: 'All',
    pendingOnly: 'Awaiting review',
    reviewedByMe: 'Reviewed by me',
    awaitingSend: 'Awaiting send',
  },

  offers: {
    title: 'My Offers',
    subtitle: 'offer management',
    empty: 'You don\'t have any saved offers yet. Create your first offer in the calculator.',
    saveOffer: 'Save Offer',
    saveOfferPrompt: 'Enter offer name',
    offerName: 'Offer name',
    offerNamePlaceholder: 'e.g., Offer for client ABC',
    offerNameOptionalHint: 'You can leave this empty — the offer will be named "offer_[number]".',
    searchPlaceholder: 'Search by offer name or number...',
    searchNoResults: 'No offers match your search.',
    saving: 'Saving...',
    saved: 'Offer saved successfully!',
    saveFailed: 'Failed to save offer',
    editOffer: 'Edit offer',
    copyOffer: 'Copy offer',
    deleteOffer: 'Delete offer',
    confirmDelete: 'Are you sure you want to delete this offer?',
    loadOffer: 'Load offer',
    loadingOffer: 'Loading offer...',
    offerLoaded: 'Offer loaded successfully!',
    loadFailed: 'Failed to load offer',
    createdAt: 'Created',
    updatedAt: 'Updated',
    items: 'items',
    totalValue: 'Total value',
    actions: 'Actions',
    noItems: 'No items',
    duplicated: 'Offer duplicated successfully!',
    needsReviewBadge: 'Needs approval',
    readyToSendBadge: 'Ready to send',
    deleted: 'Offer deleted successfully!',
    updated: 'Offer updated successfully!',
  },
  
  login: {
    title: 'Surcharge Calculator',
    subtitle: 'steel surcharge pricing tool',
    email: 'Email',
    emailPlaceholder: 'your@email.com',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    loginButton: 'LOG IN',
    loggingIn: 'LOGGING IN...',
    loginError: 'Login error',
    connectionError: 'Server connection error',
    copyright: '© 2025 · Steel Surcharge Calculator',
  },
  
  header: {
    title: 'Steel Surcharge Calculator',
    subtitle: 'steel surcharge pricing tool',
    light: 'Light',
    dark: 'Dark',
    highContrastOn: 'Normal View',
    highContrastOff: 'High Contrast',
  },
  
  steelTypes: {
    HRS: 'HRS',
    CR: 'CR',
    HDG: 'HDG',
    HRS_full: 'Hot Rolled Steel',
    CR_full: 'Cold Rolled Steel',
    HDG_full: 'Hot Dip Galvanized',
  },
  
  inputs: {
    thickness: 'Thickness (mm)',
    width: 'Width (mm)',
    length: 'Length (mm)',
    grade: 'Grade',
    searchGrade: 'Search grade...',
    coilMode: 'COIL',
    coilModeShort: 'Coil (no cutting)',
    sheetMode: 'Sheet',
    sheetModeShort: 'Sheet (cut to size)',
    sheetWeight: 'Sheet weight',
  },
  
  huta: {
    title: 'Mill Surcharges',
    subtitle: 'mill surcharges',
    pglPeriod: 'PGL validity period',
    thicknessWidth: 'Thickness / width',
    grade: 'Grade',
    thicknessTolerance: 'Thickness tolerance',
    certificate: 'Certificate',
    coating: 'Coating',
    protection: 'Protection',
    packaging: 'Packaging',
    surface: 'Surface',
    surfaceFinish: 'Surface finish',
    weld: 'Weld',
    sum: 'TOTAL Mill',
    unavailable: '— (unavailable)',
  },
  
  ssc: {
    title: 'SSC Processing Surcharges',
    subtitle: 'processing surcharges',
    baseSurcharge: 'Base surcharge (length)',
    lengthTolerance: 'Length tolerance',
    flatness: 'Flatness',
    surface: 'Surface',
    maxPackWeight: 'Max. pack weight',
    marking: 'Marking',
    edging: 'Edging',
    yieldStrength: 'Yield strength (YS)',
    packaging: 'Packaging type',
    packagingDesc: {
      S01: 'Wooden battens',
      S03: 'Battens + protective troughs',
      S12: 'Battens + paper top and bottom',
      S13: 'Battens + paper top and bottom + protective troughs',
      SB2: 'Pallet + paper top and bottom',
      SB3: 'Pallet + paper top and bottom + protective troughs',
    },
    labels: 'Labels',
    scrap: 'Scrap',
    sum: 'TOTAL SSC',
  },
  
  summary: {
    title: 'Summary',
    subtitle: 'final pricing',
    pglBase: 'PGL base',
    pglBelowBaseWarning: 'PGL base is below the value set in Settings — this position will require approval',
    millSurcharges: 'Mill surcharges',
    inputPrice: 'Input price',
    margin: 'Margin',
    marginBelowMinWarning: 'Margin is below the required minimum — this position will require approval',
    extra: 'Extra',
    transport: 'Transport',
    sscSurcharges: 'SSC surcharges',
    finalPrice: 'Final price',
    quantity: 'Quantity (tons)',
    totalValue: 'Total value',
    addToList: 'Add to list',
    updateItem: 'Update item',
    cancelEdit: 'Cancel edit',
  },
  
  zestawienie: {
    title: 'Summary List',
    subtitle: 'summary list',
    empty: 'No items in the list. Add your first calculation using the "Add to list" button.',
    type: 'Type',
    grade: 'Grade',
    dimensions: 'Dimensions',
    mill: 'Mill',
    ssc: 'SSC',
    margin: 'Margin',
    price: 'Price',
    tons: 'Tons',
    value: 'Value',
    actions: 'Actions',
    total: 'TOTAL',
    clearAll: 'Clear all',
    confirmClear: 'Are you sure you want to delete all items from the list?',
  },
  
  toggles: {
    normal: 'Normal',
    lessThan5mm: '<5mm',
    enStandard: 'EN Standard',
    laser13: 'Laser 1/3',
    customerSpec: 'Customer spec',
    improved: 'Improved',
    none: 'None',
    engraved: 'Engraved',
    marker: 'Marker',
    mill: 'Mill edge',
    trimmed: 'Trimmed',
    noPaper: 'No paper',
    paperPlastic: 'Paper/plastic',
    seaTransport: 'Sea transport',
    paperPlasticCE: 'Paper/plastic (CE)',
    normalFinish: 'Normal',
    rough: 'Rough',
    glossy: 'Glossy',
    semiGlossy: 'Semi-gloss',
    standard: 'Standard',
    bright: 'Bright',
    allowed: 'Allowed',
    notAllowed: 'Not allowed',
    other: 'Other',
    surfaceA: 'A',
    surfaceB: 'B',
    surfaceMA: 'MA',
    surfaceMB: 'MB',
    surfaceMC: 'MC',
  },
  
  warnings: {
    minThickness: 'For width <strong>{width} mm</strong> minimum thickness is <strong>{minTh} mm</strong>. Entered value ({thickness} mm) is too small.',
    maxThickness: 'For width <strong>{width} mm</strong> maximum available thickness is <strong>{maxTh} mm</strong>. Entered value ({thickness} mm) is too large.',
    outOfRange: 'Combination of thickness <strong>{thickness} mm</strong> and width <strong>{width} mm</strong> is out of table range.',
    widthOutOfRange: 'Width <strong>{width} mm</strong> is out of table range.',
    baseSurchargeFallback: 'Thickness <strong>{thickness} mm</strong> is out of the SSC base surcharge table range — an estimated surcharge of <strong>{value} €/t</strong> was used, which may not be accurate.',
    legacyItemEdit: 'This item was added before detailed editing existed — the surcharge toggles on the left were NOT automatically restored from the original. Check them manually before saving, or the price may change.',
  },

  client: {
    title: 'Client Information',
    subtitle: 'client details',
    firstName: 'First Name',
    lastName: 'Last Name',
    company: 'Company',
    address: 'Address',
    nip: 'Tax ID (NIP)',
    sapId: 'SAP ID',
    phone: 'Phone',
    email: 'E-mail',
    collapse: 'Collapse',
    expand: 'Expand',
    companySection: 'Company details',
    contactSection: 'Contact details',
    contactLocked: 'Fill in company and Tax ID (NIP) to enter contact details',
    searchPlaceholder: 'Start typing — we will suggest from the database',
    contactSearchPlaceholder: 'Pick a person or type a new one',
    lookupError: 'Could not load suggestions',
    saveContact: '💾 Save contact to company',
    contactSaving: 'Saving...',
    contactSaved: 'Contact saved to company directory',
    contactSaveFailed: 'Failed to save contact',
    contactNameRequired: 'Enter a first or last name',
  },

  pdf: {
    exportPdf: 'Export to PDF',
    generating: 'Generating...',
    offerNo: 'OFFER NO',
    date: 'DATE',
    from: 'FROM',
    to: 'TO',
    reference: 'REF',
    quotation: 'Steel quotation for',
    tableNo: 'No.',
    tableGrade: 'Grade',
    tableThickness: 'Thickness',
    tableWidth: 'Width',
    tableLength: 'Length',
    tableQuantity: 'Qty [T]',
    tablePrice: 'Price EUR/T',
    tableComments: 'Comments',
    total: 'TOTAL',
    terms: 'Offer terms',
    validity: 'Quotation valid: 48h',
    payment: 'Payment terms: 30 days from sale date',
    delivery: 'Time of delivery: after confirmation of material availability',
    minQuantity: 'Minimum quantity: 5 tons per item',
    bestRegards: 'Best regards,',
    companyInfo: 'SSC Distribution Solutions Poland Sp. z o.o.',
  },
  excel: {
    exportExcel: 'Export Excel',
  },

  roles: {
    junior: 'Junior sales rep',
    senior: 'Senior sales rep',
    admin: 'Administrator',
  },

  offerStatus: {
    draft: 'Draft',
    pending_review: 'Pending review',
    approved: 'Approved',
    rejected: 'Rejected',
    sent: 'Sent',
  },

  workflow: {
    submitForReview: 'Submit for review',
    sendToClient: 'Send to client',
    approve: 'Approve',
    reject: 'Reject',
    rejectReasonLabel: 'Rejection reason',
    rejectReasonPlaceholder: 'Provide a reason for rejecting the offer...',
    rejectReasonRequired: 'Rejection reason is required',
    confirmApprove: 'Approve this offer?',
    rejectionReason: 'Rejection reason',
    reviewedBy: 'Reviewed by',
    awaitingReview: 'Awaiting review',
    submitted: 'Submitted for review',
    approved: 'Offer approved',
    rejected: 'Offer rejected',
    sent: 'Offer sent to client',
    actionFailed: 'Operation failed',
    readOnlySent: 'Offer sent — read only',
  },

  admin: {
    panelTitle: 'Admin Panel',
    subtitle: 'system management',
    navDashboard: 'Dashboard',
    navSalespeople: 'Salespeople',
    navClients: 'Clients',
    navOffers: 'Offers',
    navSettings: 'Settings',
    settings: {
      title: 'Configuration',
      subtitle: 'base values and exchange rate',
      eurPlnRate: 'EUR → PLN rate',
      eurPlnRateHint: 'How many zloty one euro costs (e.g. 4.30).',
      pglBaseHrs: 'Base PGL (HRS)',
      pglBaseCr: 'Base PGL (CR)',
      pglBaseHdg: 'Base PGL (HDG)',
      pglBaseHint: 'Starting PGL value for a new calculation of this steel type. Salespeople can override it.',
      transportBase: 'Base transport',
      minMarginPct: 'Minimum margin (%)',
      minMarginPctHint: 'Below this margin threshold, a position requires senior or admin approval.',
      transportBaseHint: 'Starting transport value for a new calculation. Salespeople can override it.',
      save: 'Save settings',
      saved: 'Settings saved.',
      saveFailed: 'Failed to save settings.',
      frozenRateNotice:
        'Changes apply to NEW calculations only. Saved offers, offers awaiting senior approval and sent offers keep the rate and PGL from the day they were priced.',
      historyTitle: 'Base PGL price change history',
      historyDownload: 'Download history (.xlsx)',
      historyEmpty: 'No PGL price changes recorded yet.',
      historyLoading: 'Loading history…',
      historyColType: 'Steel type',
      historyColOld: 'Old price',
      historyColNew: 'New price',
      historyColDelta: 'Change',
      historyColBy: 'Changed by',
      historyColWhen: 'Changed at',
    },
    totalOffers: 'Total offers',
    activeSalespeople: 'Active salespeople',
    offersByStatus: 'Offers by status',
    addSalesperson: 'Add salesperson',
    email: 'Email',
    password: 'Password',
    passwordKeepEmpty: 'Leave empty to keep unchanged',
    fullName: 'Full name',
    role: 'Role',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    activate: 'Activate',
    deactivate: 'Deactivate',
    save: 'Save',
    cancel: 'Cancel',
    viewOffers: 'View offers',
    confirmDeactivate: 'Deactivate this account? The salesperson will not be able to log in, but their offers will be kept.',
    userCreated: 'Account created',
    userUpdated: 'Account updated',
    userDeactivated: 'Account deactivated',
    emailExists: 'An account with this email already exists',
    passwordTooShort: 'Password must be at least 6 characters',
    addClient: 'Add client',
    editClient: 'Edit client',
    firstName: 'First name',
    lastName: 'Last name',
    company: 'Company',
    nip: 'Tax ID',
    address: 'Address',
    phone: 'Phone',
    clientEmailLabel: 'Email',
    offersCount: 'Offers',
    confirmDeleteClient: 'Delete this client? Related offers keep their data but lose the link to the client database.',
    clientCreated: 'Client added',
    clientUpdated: 'Client updated',
    clientDeleted: 'Client deleted',
    noClients: 'No clients in the database',
    clientRequiredField: 'Provide at least a company or last name',
    filterStatus: 'Status',
    filterSalesperson: 'Salesperson',
    dateFrom: 'Date from',
    dateTo: 'Date to',
    allStatuses: 'All statuses',
    allSalespeople: 'All salespeople',
    clearFilters: 'Clear filters',
    owner: 'Salesperson',
    reviewer: 'Reviewed by',
    noOffersFound: 'No offers match the criteria',
    loadFailed: 'Failed to load data',
    saveFailed: 'Failed to save',
    back: 'Back',
    actions: 'Actions',
    createdAt: 'Created',
    deletedUser: '— salesperson deleted —',
    navContacts: 'Contacts',
    noContacts: 'No contacts in the database',
    confirmDeleteContact: 'Are you sure you want to delete this contact?',
    contactUpdated: 'Contact updated',
    contactDeleted: 'Contact deleted',
    addContact: 'Add contact',
    editContact: 'Edit contact',
    person: 'Person',
    contactCreated: 'Contact added',
    noClientContacts: 'No saved contacts',
  },
};

export const cs: Translations = {
  common: {
    currency: '€/t',
    currencyLabel: 'Měna',
    tons: 't',
    logout: 'Odhlásit se',
    cancel: 'Zrušit',
    save: 'Uložit',
    delete: 'Smazat',
    edit: 'Upravit',
    duplicate: 'Duplikovat',
    add: 'Přidat',
    clear: 'Vymazat',
    yes: 'Ano',
    no: 'Ne',
    loading: 'Načítání...',
    version: 'v1.5',
  },

  navigation: {
    calculator: 'Kalkulačka',
    myOffers: 'Moje nabídky',
    panelAdmin: 'Panel administrátora',
    panelSenior: 'Panel seniora',
  },

  sort: {
    label: 'Řadit podle',
    date: 'Datum',
    name: 'Název',
    value: 'Hodnota',
    status: 'Stav',
    ascending: 'Vzestupně',
    descending: 'Sestupně',
  },

  senior: {
    panelTitle: 'Panel staršího obchodníka',
    subtitle: 'kontrola nabídek',
    pendingOffers: 'Nabídky čekající na kontrolu',
    noOffersPending: 'Žádné nabídky nečekají na kontrolu.',
    author: 'Autor',
    editInCalculator: 'Upravit v kalkulačce',
    rejectModalTitle: 'Zamítnout nabídku?',
    rejectCommentLabel: 'Komentář (povinný)',
    rejectCommentPlaceholder: 'Uveďte důvod zamítnutí nabídky…',
    rejectCommentRequired: 'Při zamítnutí nabídky je komentář povinný.',
    confirmReject: 'Zamítnout nabídku',
    offerApproved: 'Nabídka byla schválena.',
    offerRejected: 'Nabídka byla zamítnuta.',
    allOffers: 'Všechny',
    pendingOnly: 'Čekající na kontrolu',
    reviewedByMe: 'Zkontrolováno mnou',
    awaitingSend: 'Čekající na odeslání',
  },

  offers: {
    title: 'Moje nabídky',
    subtitle: 'správa nabídek',
    empty: 'Zatím nemáte žádné uložené nabídky. Vytvořte svou první nabídku v kalkulačce.',
    saveOffer: 'Uložit nabídku',
    saveOfferPrompt: 'Zadejte název nabídky',
    offerName: 'Název nabídky',
    offerNamePlaceholder: 'např. Nabídka pro klienta ABC',
    offerNameOptionalHint: 'Můžete nechat prázdné — nabídka dostane název „offer_[číslo]“.',
    searchPlaceholder: 'Hledat podle názvu nebo čísla nabídky...',
    searchNoResults: 'Žádné nabídky neodpovídají hledání.',
    saving: 'Ukládání...',
    saved: 'Nabídka byla úspěšně uložena!',
    saveFailed: 'Nabídku se nepodařilo uložit',
    editOffer: 'Upravit nabídku',
    copyOffer: 'Kopírovat nabídku',
    deleteOffer: 'Smazat nabídku',
    confirmDelete: 'Opravdu chcete tuto nabídku smazat?',
    loadOffer: 'Načíst nabídku',
    loadingOffer: 'Načítání nabídky...',
    offerLoaded: 'Nabídka byla úspěšně načtena!',
    loadFailed: 'Nabídku se nepodařilo načíst',
    createdAt: 'Vytvořeno',
    updatedAt: 'Aktualizováno',
    items: 'položek',
    totalValue: 'Celková hodnota',
    actions: 'Akce',
    noItems: 'Žádné položky',
    duplicated: 'Nabídka byla úspěšně duplikována!',
    needsReviewBadge: 'Vyžaduje schválení',
    readyToSendBadge: 'Připraveno k odeslání',
    deleted: 'Nabídka byla úspěšně smazána!',
    updated: 'Nabídka byla úspěšně aktualizována!',
  },

  login: {
    title: 'Kalkulačka příplatků',
    subtitle: 'nástroj pro výpočet příplatků za ocel',
    email: 'E-mail',
    emailPlaceholder: 'vas@email.com',
    password: 'Heslo',
    passwordPlaceholder: '••••••••',
    loginButton: 'PŘIHLÁSIT SE',
    loggingIn: 'PŘIHLAŠOVÁNÍ...',
    loginError: 'Chyba přihlášení',
    connectionError: 'Chyba připojení k serveru',
    copyright: '© 2025 · Kalkulačka příplatků za ocel',
  },

  header: {
    title: 'Kalkulačka příplatků za ocel',
    subtitle: 'nástroj pro výpočet příplatků za ocel',
    light: 'Světlý',
    dark: 'Tmavý',
    highContrastOn: 'Normální zobrazení',
    highContrastOff: 'Vysoký kontrast',
  },

  steelTypes: {
    HRS: 'HRS',
    CR: 'CR',
    HDG: 'HDG',
    HRS_full: 'Za tepla válcovaná ocel',
    CR_full: 'Za studena válcovaná ocel',
    HDG_full: 'Žárově pozinkovaná ocel',
  },

  inputs: {
    thickness: 'Tloušťka (mm)',
    width: 'Šířka (mm)',
    length: 'Délka (mm)',
    grade: 'Jakost',
    searchGrade: 'Hledat jakost...',
    coilMode: 'SVITEK',
    coilModeShort: 'Svitek (bez dělení)',
    sheetMode: 'Tabule',
    sheetModeShort: 'Tabule (dělení na míru)',
    sheetWeight: 'Hmotnost tabule',
  },

  huta: {
    title: 'Hutní příplatky',
    subtitle: 'hutní příplatky',
    pglPeriod: 'Platnost PGL',
    thicknessWidth: 'Tloušťka / šířka',
    grade: 'Jakost',
    thicknessTolerance: 'Tolerance tloušťky',
    certificate: 'Certifikát',
    coating: 'Povlak',
    protection: 'Ochrana',
    packaging: 'Balení',
    surface: 'Povrch',
    surfaceFinish: 'Úprava povrchu',
    weld: 'Svar',
    sum: 'CELKEM huť',
    unavailable: '— (nedostupné)',
  },

  ssc: {
    title: 'Zpracovatelské příplatky SSC',
    subtitle: 'zpracovatelské příplatky',
    baseSurcharge: 'Základní příplatek (délka)',
    lengthTolerance: 'Tolerance délky',
    flatness: 'Rovinnost',
    surface: 'Povrch',
    maxPackWeight: 'Max. hmotnost balíku',
    marking: 'Značení',
    edging: 'Ostřihání hran',
    yieldStrength: 'Mez kluzu (YS)',
    packaging: 'Typ balení',
    packagingDesc: {
      S01: 'Dřevěné hranoly',
      S03: 'Hranoly + ochranné žlábky',
      S12: 'Hranoly + papír nahoře a dole',
      S13: 'Hranoly + papír nahoře a dole + ochranné žlábky',
      SB2: 'Paleta + papír nahoře a dole',
      SB3: 'Paleta + papír nahoře a dole + ochranné žlábky',
    },
    labels: 'Etikety',
    scrap: 'Odpad',
    sum: 'CELKEM SSC',
  },

  summary: {
    title: 'Souhrn',
    subtitle: 'konečná cena',
    pglBase: 'Základ PGL',
    pglBelowBaseWarning: 'Základ PGL je pod hodnotou nastavenou v Nastavení — tato položka bude vyžadovat schválení',
    millSurcharges: 'Hutní příplatky',
    inputPrice: 'Vstupní cena',
    margin: 'Marže',
    marginBelowMinWarning: 'Marže je pod požadovaným minimem — tato položka bude vyžadovat schválení',
    extra: 'Příplatek',
    transport: 'Doprava',
    sscSurcharges: 'Příplatky SSC',
    finalPrice: 'Konečná cena',
    quantity: 'Množství (tuny)',
    totalValue: 'Celková hodnota',
    addToList: 'Přidat do seznamu',
    updateItem: 'Aktualizovat položku',
    cancelEdit: 'Zrušit úpravu',
  },

  zestawienie: {
    title: 'Souhrnný seznam',
    subtitle: 'souhrnný seznam',
    empty: 'V seznamu nejsou žádné položky. Přidejte svůj první výpočet tlačítkem „Přidat do seznamu".',
    type: 'Typ',
    grade: 'Jakost',
    dimensions: 'Rozměry',
    mill: 'Huť',
    ssc: 'SSC',
    margin: 'Marže',
    price: 'Cena',
    tons: 'Tuny',
    value: 'Hodnota',
    actions: 'Akce',
    total: 'CELKEM',
    clearAll: 'Vymazat vše',
    confirmClear: 'Opravdu chcete smazat všechny položky ze seznamu?',
  },

  toggles: {
    normal: 'Normální',
    lessThan5mm: '<5mm',
    enStandard: 'Norma EN',
    laser13: 'Laser 1/3',
    customerSpec: 'Spec. zákazníka',
    improved: 'Zlepšený',
    none: 'Žádné',
    engraved: 'Gravírované',
    marker: 'Fix',
    mill: 'Válcovaná hrana',
    trimmed: 'Ostřihané',
    noPaper: 'Bez papíru',
    paperPlastic: 'Papír/plast',
    seaTransport: 'Námořní přeprava',
    paperPlasticCE: 'Papír/plast (CE)',
    normalFinish: 'Normální',
    rough: 'Hrubý',
    glossy: 'Lesklý',
    semiGlossy: 'Pololesklý',
    standard: 'Standardní',
    bright: 'Světlý',
    allowed: 'Povoleno',
    notAllowed: 'Nepovoleno',
    other: 'Jiné',
    surfaceA: 'A',
    surfaceB: 'B',
    surfaceMA: 'MA',
    surfaceMB: 'MB',
    surfaceMC: 'MC',
  },

  warnings: {
    minThickness: 'Pro šířku <strong>{width} mm</strong> je minimální tloušťka <strong>{minTh} mm</strong>. Zadaná hodnota ({thickness} mm) je příliš malá.',
    maxThickness: 'Pro šířku <strong>{width} mm</strong> je maximální dostupná tloušťka <strong>{maxTh} mm</strong>. Zadaná hodnota ({thickness} mm) je příliš velká.',
    outOfRange: 'Kombinace tloušťky <strong>{thickness} mm</strong> a šířky <strong>{width} mm</strong> je mimo rozsah tabulky.',
    widthOutOfRange: 'Šířka <strong>{width} mm</strong> je mimo rozsah tabulky.',
    baseSurchargeFallback: 'Tloušťka <strong>{thickness} mm</strong> je mimo rozsah tabulky základních přirážek SSC — byla použita odhadovaná přirážka <strong>{value} €/t</strong>, která nemusí být přesná.',
    legacyItemEdit: 'Tato položka byla přidána před zavedením podrobné editace — přepínače příplatků vlevo NEBYLY automaticky obnoveny z originálu. Před uložením je ručně zkontrolujte, jinak se cena může změnit.',
  },

  client: {
    title: 'Informace o klientovi',
    subtitle: 'údaje o klientovi',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    company: 'Firma',
    address: 'Adresa',
    nip: 'DIČ (NIP)',
    sapId: 'SAP ID',
    phone: 'Telefon',
    email: 'E-mail',
    collapse: 'Sbalit',
    expand: 'Rozbalit',
    companySection: 'Údaje o firmě',
    contactSection: 'Kontaktní údaje',
    contactLocked: 'Vyplňte firmu a DIČ, abyste mohli zadat kontaktní údaje',
    searchPlaceholder: 'Začněte psát — napovíme z databáze',
    contactSearchPlaceholder: 'Vyberte osobu nebo zadejte novou',
    lookupError: 'Nepodařilo se načíst návrhy',
    saveContact: '💾 Uložit kontakt k firmě',
    contactSaving: 'Ukládání...',
    contactSaved: 'Kontakt uložen do katalogu firmy',
    contactSaveFailed: 'Nepodařilo se uložit kontakt',
    contactNameRequired: 'Zadejte jméno nebo příjmení',
  },

  pdf: {
    exportPdf: 'Exportovat do PDF',
    generating: 'Generování...',
    offerNo: 'NABÍDKA Č.',
    date: 'DATUM',
    from: 'OD',
    to: 'PRO',
    reference: 'REF.',
    quotation: 'Cenová nabídka oceli pro',
    tableNo: 'Č.',
    tableGrade: 'Jakost',
    tableThickness: 'Tloušťka',
    tableWidth: 'Šířka',
    tableLength: 'Délka',
    tableQuantity: 'Množ. [T]',
    tablePrice: 'Cena EUR/T',
    tableComments: 'Poznámky',
    total: 'CELKEM',
    terms: 'Podmínky nabídky',
    validity: 'Platnost nabídky: 48 h',
    payment: 'Platební podmínky: 30 dní od data prodeje',
    delivery: 'Dodací lhůta: po potvrzení dostupnosti materiálu',
    minQuantity: 'Minimální množství: 5 tun na položku',
    bestRegards: 'S pozdravem,',
    companyInfo: 'SSC Distribution Solutions Poland Sp. z o.o.',
  },
  excel: {
    exportExcel: 'Exportovat Excel',
  },

  roles: {
    junior: 'Mladší obchodník',
    senior: 'Starší obchodník',
    admin: 'Administrátor',
  },

  offerStatus: {
    draft: 'Koncept',
    pending_review: 'Čeká na kontrolu',
    approved: 'Schváleno',
    rejected: 'Zamítnuto',
    sent: 'Odesláno',
  },

  workflow: {
    submitForReview: 'Odeslat ke kontrole',
    sendToClient: 'Odeslat klientovi',
    approve: 'Schválit',
    reject: 'Zamítnout',
    rejectReasonLabel: 'Důvod zamítnutí',
    rejectReasonPlaceholder: 'Uveďte důvod zamítnutí nabídky...',
    rejectReasonRequired: 'Důvod zamítnutí je povinný',
    confirmApprove: 'Schválit tuto nabídku?',
    rejectionReason: 'Důvod zamítnutí',
    reviewedBy: 'Zkontroloval',
    awaitingReview: 'Čeká na kontrolu',
    submitted: 'Odesláno ke kontrole',
    approved: 'Nabídka schválena',
    rejected: 'Nabídka zamítnuta',
    sent: 'Nabídka odeslána klientovi',
    actionFailed: 'Operace se nezdařila',
    readOnlySent: 'Nabídka odeslána — pouze ke čtení',
  },

  admin: {
    panelTitle: 'Panel administrátora',
    subtitle: 'správa systému',
    navDashboard: 'Přehled',
    navSalespeople: 'Obchodníci',
    navClients: 'Klienti',
    navOffers: 'Nabídky',
    navSettings: 'Nastavení',
    settings: {
      title: 'Konfigurace',
      subtitle: 'základní hodnoty a měnový kurz',
      eurPlnRate: 'Kurz EUR → PLN',
      eurPlnRateHint: 'Kolik zlotých stojí 1 euro (např. 4,30).',
      pglBaseHrs: 'Základní PGL (HRS)',
      pglBaseCr: 'Základní PGL (CR)',
      pglBaseHdg: 'Základní PGL (HDG)',
      pglBaseHint: 'Výchozí hodnota PGL pro novou kalkulaci tohoto typu oceli. Obchodník ji může přepsat.',
      transportBase: 'Základní doprava',
      minMarginPct: 'Minimální marže (%)',
      minMarginPctHint: 'Pod touto hranicí marže položka vyžaduje schválení seniorem nebo adminem.',
      transportBaseHint: 'Výchozí hodnota dopravy pro novou kalkulaci. Obchodník ji může přepsat.',
      save: 'Uložit nastavení',
      saved: 'Nastavení uloženo.',
      saveFailed: 'Nastavení se nepodařilo uložit.',
      frozenRateNotice:
        'Změny se týkají pouze NOVÝCH kalkulací. Uložené nabídky, nabídky čekající na schválení a odeslané nabídky si ponechávají kurz a PGL ze dne ocenění.',
      historyTitle: 'Historie změn základní ceny PGL',
      historyDownload: 'Stáhnout historii (.xlsx)',
      historyEmpty: 'Zatím nejsou zaznamenány žádné změny ceny PGL.',
      historyLoading: 'Načítání historie…',
      historyColType: 'Typ oceli',
      historyColOld: 'Stará cena',
      historyColNew: 'Nová cena',
      historyColDelta: 'Změna',
      historyColBy: 'Změnil',
      historyColWhen: 'Datum změny',
    },
    totalOffers: 'Celkem nabídek',
    activeSalespeople: 'Aktivní obchodníci',
    offersByStatus: 'Nabídky podle stavu',
    addSalesperson: 'Přidat obchodníka',
    email: 'E-mail',
    password: 'Heslo',
    passwordKeepEmpty: 'Ponechte prázdné pro zachování',
    fullName: 'Celé jméno',
    role: 'Role',
    status: 'Stav',
    active: 'Aktivní',
    inactive: 'Neaktivní',
    activate: 'Aktivovat',
    deactivate: 'Deaktivovat',
    save: 'Uložit',
    cancel: 'Zrušit',
    viewOffers: 'Zobrazit nabídky',
    confirmDeactivate: 'Deaktivovat tento účet? Obchodník se nebude moci přihlásit, ale jeho nabídky budou zachovány.',
    userCreated: 'Účet vytvořen',
    userUpdated: 'Účet aktualizován',
    userDeactivated: 'Účet deaktivován',
    emailExists: 'Účet s tímto e-mailem již existuje',
    passwordTooShort: 'Heslo musí mít alespoň 6 znaků',
    addClient: 'Přidat klienta',
    editClient: 'Upravit klienta',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    company: 'Firma',
    nip: 'DIČ',
    address: 'Adresa',
    phone: 'Telefon',
    clientEmailLabel: 'E-mail',
    offersCount: 'Nabídky',
    confirmDeleteClient: 'Smazat tohoto klienta? Související nabídky si ponechají svá data, ale ztratí vazbu na databázi klientů.',
    clientCreated: 'Klient přidán',
    clientUpdated: 'Klient aktualizován',
    clientDeleted: 'Klient smazán',
    noClients: 'V databázi nejsou žádní klienti',
    clientRequiredField: 'Uveďte alespoň firmu nebo příjmení',
    filterStatus: 'Stav',
    filterSalesperson: 'Obchodník',
    dateFrom: 'Datum od',
    dateTo: 'Datum do',
    allStatuses: 'Všechny stavy',
    allSalespeople: 'Všichni obchodníci',
    clearFilters: 'Vymazat filtry',
    owner: 'Obchodník',
    reviewer: 'Zkontroloval',
    noOffersFound: 'Žádné nabídky neodpovídají kritériím',
    loadFailed: 'Data se nepodařilo načíst',
    saveFailed: 'Uložení se nezdařilo',
    back: 'Zpět',
    actions: 'Akce',
    createdAt: 'Vytvořeno',
    deletedUser: '— obchodník smazán —',
    navContacts: 'Kontakty',
    noContacts: 'V databázi nejsou žádné kontakty',
    confirmDeleteContact: 'Opravdu chcete smazat tento kontakt?',
    contactUpdated: 'Kontakt aktualizován',
    contactDeleted: 'Kontakt smazán',
    addContact: 'Přidat kontakt',
    editContact: 'Upravit kontakt',
    person: 'Osoba',
    contactCreated: 'Kontakt přidán',
    noClientContacts: 'Žádné uložené kontakty',
  },
};

export const de: Translations = {
  common: {
    currency: '€/t',
    currencyLabel: 'Währung',
    tons: 't',
    logout: 'Abmelden',
    cancel: 'Abbrechen',
    save: 'Speichern',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    duplicate: 'Duplizieren',
    add: 'Hinzufügen',
    clear: 'Leeren',
    yes: 'Ja',
    no: 'Nein',
    loading: 'Wird geladen...',
    version: 'v1.5',
  },

  navigation: {
    calculator: 'Rechner',
    myOffers: 'Meine Angebote',
    panelAdmin: 'Admin-Bereich',
    panelSenior: 'Senior-Bereich',
  },

  sort: {
    label: 'Sortieren nach',
    date: 'Datum',
    name: 'Name',
    value: 'Wert',
    status: 'Status',
    ascending: 'Aufsteigend',
    descending: 'Absteigend',
  },

  senior: {
    panelTitle: 'Bereich Senior-Vertriebsmitarbeiter',
    subtitle: 'Angebotsprüfung',
    pendingOffers: 'Angebote zur Prüfung',
    noOffersPending: 'Keine Angebote zur Prüfung vorhanden.',
    author: 'Ersteller',
    editInCalculator: 'Im Rechner bearbeiten',
    rejectModalTitle: 'Angebot ablehnen?',
    rejectCommentLabel: 'Kommentar (erforderlich)',
    rejectCommentPlaceholder: 'Geben Sie einen Grund für die Ablehnung an…',
    rejectCommentRequired: 'Bei der Ablehnung eines Angebots ist ein Kommentar erforderlich.',
    confirmReject: 'Angebot ablehnen',
    offerApproved: 'Das Angebot wurde genehmigt.',
    offerRejected: 'Das Angebot wurde abgelehnt.',
    allOffers: 'Alle',
    pendingOnly: 'Ausstehende Prüfung',
    reviewedByMe: 'Von mir geprüft',
    awaitingSend: 'Wartend auf Versand',
  },

  offers: {
    title: 'Meine Angebote',
    subtitle: 'Angebotsverwaltung',
    empty: 'Sie haben noch keine gespeicherten Angebote. Erstellen Sie Ihr erstes Angebot im Rechner.',
    saveOffer: 'Angebot speichern',
    saveOfferPrompt: 'Angebotsnamen eingeben',
    offerName: 'Angebotsname',
    offerNamePlaceholder: 'z. B. Angebot für Kunde ABC',
    offerNameOptionalHint: 'Kann leer bleiben — das Angebot erhält den Namen „offer_[Nummer]“.',
    searchPlaceholder: 'Suche nach Angebotsname oder -nummer...',
    searchNoResults: 'Keine Angebote entsprechen der Suche.',
    saving: 'Wird gespeichert...',
    saved: 'Angebot erfolgreich gespeichert!',
    saveFailed: 'Angebot konnte nicht gespeichert werden',
    editOffer: 'Angebot bearbeiten',
    copyOffer: 'Angebot kopieren',
    deleteOffer: 'Angebot löschen',
    confirmDelete: 'Möchten Sie dieses Angebot wirklich löschen?',
    loadOffer: 'Angebot laden',
    loadingOffer: 'Angebot wird geladen...',
    offerLoaded: 'Angebot erfolgreich geladen!',
    loadFailed: 'Angebot konnte nicht geladen werden',
    createdAt: 'Erstellt',
    updatedAt: 'Aktualisiert',
    items: 'Positionen',
    totalValue: 'Gesamtwert',
    actions: 'Aktionen',
    noItems: 'Keine Positionen',
    duplicated: 'Angebot erfolgreich dupliziert!',
    needsReviewBadge: 'Erfordert Genehmigung',
    readyToSendBadge: 'Versandbereit',
    deleted: 'Angebot erfolgreich gelöscht!',
    updated: 'Angebot erfolgreich aktualisiert!',
  },

  login: {
    title: 'Zuschlagsrechner',
    subtitle: 'Werkzeug zur Berechnung von Stahlzuschlägen',
    email: 'E-Mail',
    emailPlaceholder: 'ihre@email.com',
    password: 'Passwort',
    passwordPlaceholder: '••••••••',
    loginButton: 'ANMELDEN',
    loggingIn: 'ANMELDUNG...',
    loginError: 'Anmeldefehler',
    connectionError: 'Fehler bei der Serververbindung',
    copyright: '© 2025 · Stahlzuschlagsrechner',
  },

  header: {
    title: 'Stahlzuschlagsrechner',
    subtitle: 'Werkzeug zur Berechnung von Stahlzuschlägen',
    light: 'Hell',
    dark: 'Dunkel',
    highContrastOn: 'Normale Ansicht',
    highContrastOff: 'Hoher Kontrast',
  },

  steelTypes: {
    HRS: 'HRS',
    CR: 'CR',
    HDG: 'HDG',
    HRS_full: 'Warmgewalzter Stahl',
    CR_full: 'Kaltgewalzter Stahl',
    HDG_full: 'Feuerverzinkter Stahl',
  },

  inputs: {
    thickness: 'Dicke (mm)',
    width: 'Breite (mm)',
    length: 'Länge (mm)',
    grade: 'Güte',
    searchGrade: 'Güte suchen...',
    coilMode: 'COIL',
    coilModeShort: 'Coil (kein Schnitt)',
    sheetMode: 'Tafel',
    sheetModeShort: 'Tafel (Zuschnitt)',
    sheetWeight: 'Tafelgewicht',
  },

  huta: {
    title: 'Hüttenzuschläge',
    subtitle: 'Hüttenzuschläge',
    pglPeriod: 'PGL-Gültigkeitszeitraum',
    thicknessWidth: 'Dicke / Breite',
    grade: 'Güte',
    thicknessTolerance: 'Dickentoleranz',
    certificate: 'Zertifikat',
    coating: 'Beschichtung',
    protection: 'Schutz',
    packaging: 'Verpackung',
    surface: 'Oberfläche',
    surfaceFinish: 'Oberflächenausführung',
    weld: 'Schweißnaht',
    sum: 'GESAMT Hütte',
    unavailable: '— (nicht verfügbar)',
  },

  ssc: {
    title: 'SSC-Bearbeitungszuschläge',
    subtitle: 'Bearbeitungszuschläge',
    baseSurcharge: 'Grundzuschlag (Länge)',
    lengthTolerance: 'Längentoleranz',
    flatness: 'Ebenheit',
    surface: 'Oberfläche',
    maxPackWeight: 'Max. Packungsgewicht',
    marking: 'Kennzeichnung',
    edging: 'Besäumen',
    yieldStrength: 'Streckgrenze (YS)',
    packaging: 'Verpackungsart',
    packagingDesc: {
      S01: 'Holzkanthölzer',
      S03: 'Kanthölzer + Schutzrinnen',
      S12: 'Kanthölzer + Papier oben und unten',
      S13: 'Kanthölzer + Papier oben und unten + Schutzrinnen',
      SB2: 'Palette + Papier oben und unten',
      SB3: 'Palette + Papier oben und unten + Schutzrinnen',
    },
    labels: 'Etiketten',
    scrap: 'Schrott',
    sum: 'GESAMT SSC',
  },

  summary: {
    title: 'Zusammenfassung',
    subtitle: 'Endpreis',
    pglBase: 'PGL-Basis',
    pglBelowBaseWarning: 'PGL-Basis liegt unter dem in den Einstellungen festgelegten Wert — diese Position erfordert eine Genehmigung',
    millSurcharges: 'Hüttenzuschläge',
    inputPrice: 'Einsatzpreis',
    margin: 'Marge',
    marginBelowMinWarning: 'Marge liegt unter dem erforderlichen Minimum — diese Position erfordert eine Genehmigung',
    extra: 'Zuschlag',
    transport: 'Transport',
    sscSurcharges: 'SSC-Zuschläge',
    finalPrice: 'Endpreis',
    quantity: 'Menge (Tonnen)',
    totalValue: 'Gesamtwert',
    addToList: 'Zur Liste hinzufügen',
    updateItem: 'Position aktualisieren',
    cancelEdit: 'Bearbeitung abbrechen',
  },

  zestawienie: {
    title: 'Übersichtsliste',
    subtitle: 'Übersichtsliste',
    empty: 'Keine Positionen in der Liste. Fügen Sie Ihre erste Berechnung mit der Schaltfläche „Zur Liste hinzufügen" hinzu.',
    type: 'Typ',
    grade: 'Güte',
    dimensions: 'Abmessungen',
    mill: 'Hütte',
    ssc: 'SSC',
    margin: 'Marge',
    price: 'Preis',
    tons: 'Tonnen',
    value: 'Wert',
    actions: 'Aktionen',
    total: 'GESAMT',
    clearAll: 'Alles löschen',
    confirmClear: 'Möchten Sie wirklich alle Positionen aus der Liste löschen?',
  },

  toggles: {
    normal: 'Normal',
    lessThan5mm: '<5mm',
    enStandard: 'EN-Norm',
    laser13: 'Laser 1/3',
    customerSpec: 'Kundenspez.',
    improved: 'Verbessert',
    none: 'Keine',
    engraved: 'Graviert',
    marker: 'Marker',
    mill: 'Walzkante',
    trimmed: 'Besäumt',
    noPaper: 'Kein Papier',
    paperPlastic: 'Papier/Kunststoff',
    seaTransport: 'Seetransport',
    paperPlasticCE: 'Papier/Kunststoff (CE)',
    normalFinish: 'Normal',
    rough: 'Rau',
    glossy: 'Glänzend',
    semiGlossy: 'Halbglänzend',
    standard: 'Standard',
    bright: 'Blank',
    allowed: 'Zulässig',
    notAllowed: 'Nicht zulässig',
    other: 'Andere',
    surfaceA: 'A',
    surfaceB: 'B',
    surfaceMA: 'MA',
    surfaceMB: 'MB',
    surfaceMC: 'MC',
  },

  warnings: {
    minThickness: 'Für die Breite <strong>{width} mm</strong> beträgt die Mindestdicke <strong>{minTh} mm</strong>. Der eingegebene Wert ({thickness} mm) ist zu klein.',
    maxThickness: 'Für die Breite <strong>{width} mm</strong> beträgt die maximal verfügbare Dicke <strong>{maxTh} mm</strong>. Der eingegebene Wert ({thickness} mm) ist zu groß.',
    outOfRange: 'Die Kombination aus Dicke <strong>{thickness} mm</strong> und Breite <strong>{width} mm</strong> liegt außerhalb des Tabellenbereichs.',
    widthOutOfRange: 'Die Breite <strong>{width} mm</strong> liegt außerhalb des Tabellenbereichs.',
    baseSurchargeFallback: 'Die Dicke <strong>{thickness} mm</strong> liegt außerhalb des Tabellenbereichs für SSC-Grundzuschläge — es wurde ein geschätzter Zuschlag von <strong>{value} €/t</strong> verwendet, der möglicherweise ungenau ist.',
    legacyItemEdit: 'Diese Position wurde vor Einführung der Detailbearbeitung hinzugefügt — die Zuschlagsschalter links wurden NICHT automatisch aus dem Original wiederhergestellt. Bitte vor dem Speichern manuell prüfen, sonst kann sich der Preis ändern.',
  },

  client: {
    title: 'Kundeninformationen',
    subtitle: 'Kundendaten',
    firstName: 'Vorname',
    lastName: 'Nachname',
    company: 'Firma',
    address: 'Adresse',
    nip: 'USt-IdNr. (NIP)',
    sapId: 'SAP ID',
    phone: 'Telefon',
    email: 'E-Mail',
    collapse: 'Einklappen',
    expand: 'Ausklappen',
    companySection: 'Firmendaten',
    contactSection: 'Kontaktdaten',
    contactLocked: 'Firma und USt-IdNr. ausfüllen, um Kontaktdaten einzugeben',
    searchPlaceholder: 'Tippen Sie los — wir schlagen aus der Datenbank vor',
    contactSearchPlaceholder: 'Person wählen oder neue eingeben',
    lookupError: 'Vorschläge konnten nicht geladen werden',
    saveContact: '💾 Kontakt zur Firma speichern',
    contactSaving: 'Speichern...',
    contactSaved: 'Kontakt im Firmenverzeichnis gespeichert',
    contactSaveFailed: 'Kontakt konnte nicht gespeichert werden',
    contactNameRequired: 'Vor- oder Nachname angeben',
  },

  pdf: {
    exportPdf: 'Als PDF exportieren',
    generating: 'Wird generiert...',
    offerNo: 'ANGEBOT NR.',
    date: 'DATUM',
    from: 'VON',
    to: 'AN',
    reference: 'REF.',
    quotation: 'Stahlangebot für',
    tableNo: 'Nr.',
    tableGrade: 'Güte',
    tableThickness: 'Dicke',
    tableWidth: 'Breite',
    tableLength: 'Länge',
    tableQuantity: 'Menge [T]',
    tablePrice: 'Preis EUR/T',
    tableComments: 'Anmerkungen',
    total: 'GESAMT',
    terms: 'Angebotsbedingungen',
    validity: 'Angebot gültig: 48 Std.',
    payment: 'Zahlungsbedingungen: 30 Tage ab Verkaufsdatum',
    delivery: 'Lieferzeit: nach Bestätigung der Materialverfügbarkeit',
    minQuantity: 'Mindestmenge: 5 Tonnen pro Position',
    bestRegards: 'Mit freundlichen Grüßen,',
    companyInfo: 'SSC Distribution Solutions Poland Sp. z o.o.',
  },
  excel: {
    exportExcel: 'Excel exportieren',
  },

  roles: {
    junior: 'Junior-Vertriebsmitarbeiter',
    senior: 'Senior-Vertriebsmitarbeiter',
    admin: 'Administrator',
  },

  offerStatus: {
    draft: 'Entwurf',
    pending_review: 'Prüfung ausstehend',
    approved: 'Genehmigt',
    rejected: 'Abgelehnt',
    sent: 'Gesendet',
  },

  workflow: {
    submitForReview: 'Zur Prüfung einreichen',
    sendToClient: 'An Kunden senden',
    approve: 'Genehmigen',
    reject: 'Ablehnen',
    rejectReasonLabel: 'Ablehnungsgrund',
    rejectReasonPlaceholder: 'Geben Sie einen Grund für die Ablehnung an...',
    rejectReasonRequired: 'Ablehnungsgrund ist erforderlich',
    confirmApprove: 'Dieses Angebot genehmigen?',
    rejectionReason: 'Ablehnungsgrund',
    reviewedBy: 'Geprüft von',
    awaitingReview: 'Prüfung ausstehend',
    submitted: 'Zur Prüfung eingereicht',
    approved: 'Angebot genehmigt',
    rejected: 'Angebot abgelehnt',
    sent: 'Angebot an Kunden gesendet',
    actionFailed: 'Vorgang fehlgeschlagen',
    readOnlySent: 'Angebot gesendet — schreibgeschützt',
  },

  admin: {
    panelTitle: 'Admin-Bereich',
    subtitle: 'Systemverwaltung',
    navDashboard: 'Übersicht',
    navSalespeople: 'Vertriebsmitarbeiter',
    navClients: 'Kunden',
    navOffers: 'Angebote',
    navSettings: 'Einstellungen',
    settings: {
      title: 'Konfiguration',
      subtitle: 'Basiswerte und Wechselkurs',
      eurPlnRate: 'Kurs EUR → PLN',
      eurPlnRateHint: 'Wie viele Zloty ein Euro kostet (z. B. 4,30).',
      pglBaseHrs: 'Basis-PGL (HRS)',
      pglBaseCr: 'Basis-PGL (CR)',
      pglBaseHdg: 'Basis-PGL (HDG)',
      pglBaseHint: 'Startwert für PGL in einer neuen Kalkulation dieses Stahltyps. Vertrieb kann ihn überschreiben.',
      transportBase: 'Basis-Transport',
      minMarginPct: 'Mindestmarge (%)',
      minMarginPctHint: 'Unterhalb dieser Marge erfordert eine Position die Genehmigung durch Senior oder Admin.',
      transportBaseHint: 'Startwert für Transport in einer neuen Kalkulation. Vertrieb kann ihn überschreiben.',
      save: 'Einstellungen speichern',
      saved: 'Einstellungen gespeichert.',
      saveFailed: 'Einstellungen konnten nicht gespeichert werden.',
      frozenRateNotice:
        'Änderungen gelten nur für NEUE Kalkulationen. Gespeicherte, zur Freigabe anstehende und versendete Angebote behalten Kurs und PGL vom Tag der Kalkulation.',
      historyTitle: 'Änderungsverlauf Basis-PGL',
      historyDownload: 'Verlauf herunterladen (.xlsx)',
      historyEmpty: 'Noch keine PGL-Preisänderungen erfasst.',
      historyLoading: 'Verlauf wird geladen…',
      historyColType: 'Stahltyp',
      historyColOld: 'Alter Preis',
      historyColNew: 'Neuer Preis',
      historyColDelta: 'Änderung',
      historyColBy: 'Geändert von',
      historyColWhen: 'Geändert am',
    },
    totalOffers: 'Angebote gesamt',
    activeSalespeople: 'Aktive Vertriebsmitarbeiter',
    offersByStatus: 'Angebote nach Status',
    addSalesperson: 'Vertriebsmitarbeiter hinzufügen',
    email: 'E-Mail',
    password: 'Passwort',
    passwordKeepEmpty: 'Leer lassen, um unverändert zu behalten',
    fullName: 'Vollständiger Name',
    role: 'Rolle',
    status: 'Status',
    active: 'Aktiv',
    inactive: 'Inaktiv',
    activate: 'Aktivieren',
    deactivate: 'Deaktivieren',
    save: 'Speichern',
    cancel: 'Abbrechen',
    viewOffers: 'Angebote anzeigen',
    confirmDeactivate: 'Dieses Konto deaktivieren? Der Vertriebsmitarbeiter kann sich nicht mehr anmelden, seine Angebote bleiben jedoch erhalten.',
    userCreated: 'Konto erstellt',
    userUpdated: 'Konto aktualisiert',
    userDeactivated: 'Konto deaktiviert',
    emailExists: 'Ein Konto mit dieser E-Mail existiert bereits',
    passwordTooShort: 'Das Passwort muss mindestens 6 Zeichen lang sein',
    addClient: 'Kunde hinzufügen',
    editClient: 'Kunde bearbeiten',
    firstName: 'Vorname',
    lastName: 'Nachname',
    company: 'Firma',
    nip: 'USt-IdNr.',
    address: 'Adresse',
    phone: 'Telefon',
    clientEmailLabel: 'E-Mail',
    offersCount: 'Angebote',
    confirmDeleteClient: 'Diesen Kunden löschen? Zugehörige Angebote behalten ihre Daten, verlieren aber die Verknüpfung zur Kundendatenbank.',
    clientCreated: 'Kunde hinzugefügt',
    clientUpdated: 'Kunde aktualisiert',
    clientDeleted: 'Kunde gelöscht',
    noClients: 'Keine Kunden in der Datenbank',
    clientRequiredField: 'Geben Sie mindestens eine Firma oder einen Nachnamen an',
    filterStatus: 'Status',
    filterSalesperson: 'Vertriebsmitarbeiter',
    dateFrom: 'Datum von',
    dateTo: 'Datum bis',
    allStatuses: 'Alle Status',
    allSalespeople: 'Alle Vertriebsmitarbeiter',
    clearFilters: 'Filter zurücksetzen',
    owner: 'Vertriebsmitarbeiter',
    reviewer: 'Geprüft von',
    noOffersFound: 'Keine Angebote entsprechen den Kriterien',
    loadFailed: 'Daten konnten nicht geladen werden',
    saveFailed: 'Speichern fehlgeschlagen',
    back: 'Zurück',
    actions: 'Aktionen',
    createdAt: 'Erstellt',
    deletedUser: '— Vertriebsmitarbeiter gelöscht —',
    navContacts: 'Kontakte',
    noContacts: 'Keine Kontakte in der Datenbank',
    confirmDeleteContact: 'Diesen Kontakt wirklich löschen?',
    contactUpdated: 'Kontakt aktualisiert',
    contactDeleted: 'Kontakt gelöscht',
    addContact: 'Kontakt hinzufügen',
    editContact: 'Kontakt bearbeiten',
    person: 'Person',
    contactCreated: 'Kontakt hinzugefügt',
    noClientContacts: 'Keine gespeicherten Kontakte',
  },
};

// All translations map
export const translations: Record<Language, Translations> = {
  pl,
  en,
  cs,
  de,
};

// Helper function to format warning messages with variables
export function formatWarning(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

// Default language
export const DEFAULT_LANGUAGE: Language = 'pl';

// Language storage key
export const LANGUAGE_STORAGE_KEY = 'preferredLanguage';