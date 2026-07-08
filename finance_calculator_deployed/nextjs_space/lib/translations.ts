// Translation system for multi-language support
// Currently supports: Polish (pl), English (en)
// Easily extensible - just add new language objects following the same structure

export type Language = 'pl' | 'en';

export interface Translations {
  // Common
  common: {
    currency: string;
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
    millSurcharges: string;
    inputPrice: string;
    margin: string;
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
    phone: string;
    email: string;
    collapse: string;
    expand: string;
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
  };
}

// Polish translations (default)
export const pl: Translations = {
  common: {
    currency: '€/t',
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
    version: 'v1.0',
  },

  navigation: {
    calculator: 'Kalkulator',
    myOffers: 'Moje Oferty',
    panelAdmin: 'Panel Admina',
    panelSenior: 'Panel Seniora',
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
    pendingOnly: 'Oczekujące',
    reviewedByMe: 'Zweryfikowane przeze mnie',
  },

  offers: {
    title: 'Moje Oferty',
    subtitle: 'zarządzanie ofertami',
    empty: 'Nie masz jeszcze żadnych zapisanych ofert. Utwórz pierwszą ofertę w kalkulatorze.',
    saveOffer: 'Zapisz ofertę',
    saveOfferPrompt: 'Podaj nazwę oferty',
    offerName: 'Nazwa oferty',
    offerNamePlaceholder: 'np. Oferta dla klienta ABC',
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
    edging: 'Brzegi',
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
    millSurcharges: 'Dopłaty huta',
    inputPrice: 'Cena wsadu',
    margin: 'Marża',
    extra: 'Extra',
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
  },

  client: {
    title: 'Dane Klienta',
    subtitle: 'informacje o kliencie',
    firstName: 'Imię',
    lastName: 'Nazwisko',
    company: 'Firma',
    address: 'Adres',
    nip: 'NIP',
    phone: 'Nr telefonu',
    email: 'E-mail',
    collapse: 'Zwiń',
    expand: 'Rozwiń',
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
  },
};

// English translations
export const en: Translations = {
  common: {
    currency: '€/t',
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
    version: 'v1.0',
  },

  navigation: {
    calculator: 'Calculator',
    myOffers: 'My Offers',
    panelAdmin: 'Admin Panel',
    panelSenior: 'Senior Panel',
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
    pendingOnly: 'Pending',
    reviewedByMe: 'Reviewed by me',
  },

  offers: {
    title: 'My Offers',
    subtitle: 'offer management',
    empty: 'You don\'t have any saved offers yet. Create your first offer in the calculator.',
    saveOffer: 'Save Offer',
    saveOfferPrompt: 'Enter offer name',
    offerName: 'Offer name',
    offerNamePlaceholder: 'e.g., Offer for client ABC',
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
    millSurcharges: 'Mill surcharges',
    inputPrice: 'Input price',
    margin: 'Margin',
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
  },

  client: {
    title: 'Client Information',
    subtitle: 'client details',
    firstName: 'First Name',
    lastName: 'Last Name',
    company: 'Company',
    address: 'Address',
    nip: 'Tax ID (NIP)',
    phone: 'Phone',
    email: 'E-mail',
    collapse: 'Collapse',
    expand: 'Expand',
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
  },
};

// All translations map
export const translations: Record<Language, Translations> = {
  pl,
  en,
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