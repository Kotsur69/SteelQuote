export type Lang = 'pl' | 'en';

const translations: Record<string, Record<Lang, string>> = {
  // ─── App / Header ───
  appTitle: { pl: 'Kalkulator Dopłat Stalowych', en: 'Steel Surcharge Calculator' },
  appSubtitle: { pl: 'narzędzie wyceny dopłat stalowych - v1.0', en: 'steel surcharge pricing tool - v1.0' },
  calculator: { pl: 'Kalkulator', en: 'Calculator' },
  myOffers: { pl: 'Moje oferty', en: 'My Offers' },
  language: { pl: 'Język', en: 'Language' },
  darkMode: { pl: 'Tryb ciemny', en: 'Dark Mode' },
  lightMode: { pl: 'Tryb jasny', en: 'Light Mode' },
  logout: { pl: 'Wyloguj', en: 'Log Out' },

  // ─── Login / Signup ───
  login: { pl: 'Zaloguj się', en: 'Log In' },
  signup: { pl: 'Zarejestruj się', en: 'Sign Up' },
  loginSubtitle: { pl: 'Profesjonalne narzędzie kalkulacji dopłat', en: 'Professional surcharge calculation tool' },
  email: { pl: 'Email', en: 'Email' },
  password: { pl: 'Hasło', en: 'Password' },
  confirmPassword: { pl: 'Potwierdź hasło', en: 'Confirm Password' },
  name: { pl: 'Imię', en: 'Name' },
  createAccount: { pl: 'Utwórz konto', en: 'Create Account' },
  passwordMismatch: { pl: 'Hasła nie pasują', en: 'Passwords do not match' },
  loginError: { pl: 'Nieprawidłowy email lub hasło', en: 'Invalid email or password' },
  signupError: { pl: 'Błąd rejestracji', en: 'Registration error' },
  loginAfterSignupError: { pl: 'Logowanie po rejestracji nie powiodło się', en: 'Login after registration failed' },
  genericError: { pl: 'Wystąpił błąd', en: 'An error occurred' },

  // ─── Client Panel ───
  clientPanel: { pl: 'Klient', en: 'Client' },
  firstName: { pl: 'Imię', en: 'First Name' },
  lastName: { pl: 'Nazwisko', en: 'Last Name' },
  company: { pl: 'Firma', en: 'Company' },
  address: { pl: 'Adres', en: 'Address' },
  nip: { pl: 'NIP', en: 'Tax ID (NIP)' },
  phone: { pl: 'Nr telefonu', en: 'Phone' },
  clientEmail: { pl: 'Email klienta', en: 'Client Email' },

  // ─── Params Bar ───
  thicknessMm: { pl: 'Grubość (mm)', en: 'Thickness (mm)' },
  widthMm: { pl: 'Szerokość (mm)', en: 'Width (mm)' },
  lengthMm: { pl: 'Długość (mm)', en: 'Length (mm)' },
  gradeLabel: { pl: 'Gatunek', en: 'Grade' },
  searchGrade: { pl: 'Szukaj gatunku…', en: 'Search grade…' },
  sheetWeight: { pl: 'Waga arkusza', en: 'Sheet weight' },

  // ─── Steel Types / Coil ───
  steelType: { pl: 'Typ stali', en: 'Steel Type' },
  hrsDesc: { pl: 'Gorącowalcowana', en: 'Hot Rolled Steel' },
  crDesc: { pl: 'Zimnowalcowana', en: 'Cold Rolled Steel' },
  hdgDesc: { pl: 'Ocynkowana ogniowo', en: 'Hot Dip Galvanized' },
  coilMode: { pl: 'KRĄG', en: 'COIL' },
  sheetMode: { pl: 'ARKUSZ', en: 'SHEET' },

  // ─── Column 1: Huta ───
  hutaTitle: { pl: 'Huta Dopłaty', en: 'Mill Surcharges' },
  hutaSub: { pl: 'dopłaty hutnicze', en: 'mill surcharges' },
  pglPeriod: { pl: 'Okres ważności PGL', en: 'PGL Validity Period' },
  thicknessWidth: { pl: 'Grubość / szerokość', en: 'Thickness / width' },
  grade: { pl: 'Gatunek', en: 'Grade' },
  toleranceThickness: { pl: 'Tolerancja grubości', en: 'Thickness Tolerance' },
  certificate: { pl: 'Certyfikat', en: 'Certificate' },
  coating: { pl: 'Powłoka', en: 'Coating' },
  protection: { pl: 'Zabezpieczenie', en: 'Protection' },
  packaging: { pl: 'Opakowanie', en: 'Packaging' },
  surfaceCR: { pl: 'Powierzchnia (CR)', en: 'Surface (CR)' },
  surfaceHDG: { pl: 'Powierzchnia (HDG)', en: 'Surface (HDG)' },
  surfaceFinish: { pl: 'Wykończenie pow.', en: 'Surface Finish' },
  weld: { pl: 'Zgrzew', en: 'Weld' },
  sumaHuta: { pl: 'SUMA Huta', en: 'TOTAL Mill' },

  // ─── Column 2: SSC ───
  sscTitle: { pl: 'SSC Dopłaty Processing', en: 'SSC Processing Surcharges' },
  sscSub: { pl: 'dopłaty przetwórcze', en: 'processing surcharges' },
  baseSurchargeLength: { pl: 'Podstawowa dopłata (dług.)', en: 'Base surcharge (length)' },
  lengthTolerance: { pl: 'Tolerancja długości', en: 'Length Tolerance' },
  flatness: { pl: 'Płaskość', en: 'Flatness' },
  surface: { pl: 'Powierzchnia', en: 'Surface' },
  maxPackWeight: { pl: 'Max. waga paczki', en: 'Max. bundle weight' },
  markingLabel: { pl: 'Oznakowanie', en: 'Marking' },
  edgeTrimming: { pl: 'Brzegowanie', en: 'Edge Trimming' },
  yieldStrength: { pl: 'Granica plastyczności', en: 'Yield Strength' },
  packing: { pl: 'Pakowanie', en: 'Packing' },
  specialLabels: { pl: 'Specjalne etykiety', en: 'Special Labels' },
  scrapConst: { pl: 'Złom\u00A0(stała)', en: 'Scrap\u00A0(constant)' },
  sumaSSC: { pl: 'SUMA SSC', en: 'TOTAL SSC' },

  // ─── Column 3: Summary ───
  summaryTitle: { pl: 'Podsumowanie', en: 'Summary' },
  summarySub: { pl: 'wycena końcowa', en: 'final pricing' },
  pglBase: { pl: 'PGL (cena bazowa)', en: 'PGL (base price)' },
  pglPlusHuta: { pl: 'Cena wsadu PGL + Σ Huta', en: 'PGL charge + Σ Mill' },
  marginPct: { pl: 'Marża netto %', en: 'Net margin %' },
  marginNet: { pl: 'Marża netto', en: 'Net margin' },
  extraSurcharge: { pl: 'Dodatkowa dopłata', en: 'Extra surcharge' },
  transport: { pl: 'Transport', en: 'Transport' },
  sscProcessingSum: { pl: 'Σ SSC Processing', en: 'Σ SSC Processing' },
  finalPrice: { pl: 'CENA KOŃCOWA', en: 'FINAL PRICE' },
  quantityTons: { pl: 'Ilość ton', en: 'Quantity (tons)' },
  addToList: { pl: '＋ DODAJ DO ZESTAWIENIA', en: '＋ ADD TO LIST' },
  sumTotal: { pl: 'Suma (Marża + SSC)', en: 'Total (Margin + SSC)' },

  // ─── Zestawienie Table ───
  zestawienieTitle: { pl: 'Zestawienie pozycji ofertowych', en: 'Offer items list' },
  clearAll: { pl: 'Wyczyść wszystko', en: 'Clear all' },
  noItemsHint: { pl: 'Brak pozycji – użyj kalkulatora i kliknij "DODAJ DO ZESTAWIENIA"', en: 'No items – use the calculator and click "ADD TO LIST"' },
  colDesc: { pl: 'Opis', en: 'Description' },
  colType: { pl: 'Typ', en: 'Type' },
  colHuta: { pl: 'Huta', en: 'Mill' },
  colSSC: { pl: 'SSC', en: 'SSC' },
  colPriceT: { pl: 'Cena/t', en: 'Price/t' },
  colQty: { pl: 'Ilość (t)', en: 'Qty (t)' },
  colValue: { pl: 'Wartość', en: 'Value' },
  colActions: { pl: 'Akcje', en: 'Actions' },
  total: { pl: 'RAZEM', en: 'TOTAL' },

  // ─── Offer management ───
  offerName: { pl: 'Nazwa oferty', en: 'Offer Name' },
  saveAsOffer: { pl: 'Zapisz jako ofertę', en: 'Save as Offer' },
  updateOffer: { pl: 'Aktualizuj ofertę', en: 'Update Offer' },
  editingOffer: { pl: 'Edytujesz ofertę', en: 'Editing offer' },
  cancelEdit: { pl: 'Anuluj edycję', en: 'Cancel editing' },
  items: { pl: 'pozycji', en: 'items' },
  editOffer: { pl: 'Edytuj', en: 'Edit' },
  deleteOffer: { pl: 'Usuń', en: 'Delete' },
  duplicateOffer: { pl: 'Duplikuj', en: 'Duplicate' },
  noOffers: { pl: 'Brak zapisanych ofert', en: 'No saved offers' },
  noOffersHint: { pl: 'Stwórz kalkulacje i zapisz je jako ofertę', en: 'Create calculations and save them as an offer' },
  unnamed: { pl: 'Bez nazwy', en: 'Unnamed' },
  copy: { pl: 'kopia', en: 'copy' },
  confirmDelete: { pl: 'Czy na pewno usunąć?', en: 'Are you sure you want to delete?' },
  yes: { pl: 'Tak', en: 'Yes' },
  no: { pl: 'Nie', en: 'No' },

  // ─── PDF ───
  downloadPdf: { pl: 'Pobierz PDF', en: 'Download PDF' },
  generatingPdf: { pl: 'Generowanie PDF...', en: 'Generating PDF...' },
  pdfError: { pl: 'Nie udało się wygenerować PDF', en: 'PDF generation failed' },
  pdfGenError: { pl: 'Błąd generowania PDF', en: 'PDF generation error' },
  offerDefault: { pl: 'Oferta', en: 'Offer' },
  editItem: { pl: 'Edytuj pozycję', en: 'Edit item' },
  saveChanges: { pl: 'ZAPISZ ZMIANY', en: 'SAVE CHANGES' },
  cancel: { pl: 'Anuluj', en: 'Cancel' },
  // ─── Toggle button labels ───
  // Packaging (CR & HDG)
  tNoPaper: { pl: 'Bez papieru', en: 'No paper' },
  tPaperPlastic: { pl: 'Papier/plastik', en: 'Paper/plastic' },
  tSeaTransport: { pl: 'Transport morski', en: 'Sea transport' },
  tPaperPlasticCE: { pl: 'Papier/plastik (CE)', en: 'Paper/plastic (CE)' },
  // Surface finish (CR)
  tNormal: { pl: 'Normalna', en: 'Normal' },
  tRough: { pl: 'Szorstka', en: 'Rough' },
  tGlossy: { pl: 'Połyskująca', en: 'Glossy' },
  tSemiGloss: { pl: 'Półpołysk.', en: 'Semi-gloss' },
  // Weld
  tAllowed: { pl: 'Dozwolony', en: 'Allowed' },
  tNotAllowed: { pl: 'Niedozwolony', en: 'Not allowed' },
  tOther: { pl: 'Inne', en: 'Other' },
  // HDG finish
  tStandard: { pl: 'Standard', en: 'Standard' },
  tShiny: { pl: 'Błyszczące', en: 'Shiny' },
  // SSC length tolerance
  // (tNormal reused)
  // SSC flatness
  tEnStandard: { pl: 'Wg normy EN', en: 'EN standard' },
  tLaser13: { pl: 'Laser 1/3', en: 'Laser 1/3' },
  tCustomer: { pl: 'Wg klienta', en: 'Per customer' },
  // SSC surface
  tImproved: { pl: 'Ulepszona', en: 'Improved' },
  // SSC marking
  tNone: { pl: 'Brak', en: 'None' },
  tEngraving: { pl: 'Grawerem', en: 'Engraving' },
  tMarker: { pl: 'Markerem', en: 'Marker' },
  // SSC edging
  tNo: { pl: 'Nie', en: 'No' },
  tYes: { pl: 'Tak', en: 'Yes' },
  // SSC labels
  tPlasticEnv: { pl: 'Koperta plast.', en: 'Plastic env.' },

  // ─── Misc (kept for backward compat) ───
  dimWarning: { pl: 'Grubość poniżej minimum dla tej szerokości', en: 'Thickness below minimum for this width' },
};

export function t(key: string, lang: Lang): string {
  return translations?.[key]?.[lang] ?? key;
}

export default translations;