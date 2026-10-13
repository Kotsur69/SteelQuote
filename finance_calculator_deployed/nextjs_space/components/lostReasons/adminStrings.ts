// UI strings of the lost-reason editor (/admin/powody-przegranej) and its admin nav tab.
// Kept next to the feature, like lib/lostReasons.ts keeps the dialog strings.

import { pickReasonLang, type ReasonLang } from '@/lib/lostReasons';

export interface LostReasonsAdminStrings {
  navLabel: string;
  title: string;
  subtitle: string;
  notMigrated: string;
  loadFailed: string;
  addLegend: string;
  add: string;
  langNames: Record<ReasonLang, string>;
  colOrder: string;
  colUsage: string;
  colActions: string;
  usage: (count: number) => string;
  systemMark: string;
  archivedMark: string;
  showArchived: (count: number) => string;
  moveUp: string;
  moveDown: string;
  edit: string;
  save: string;
  cancel: string;
  archive: string;
  restore: string;
  confirmArchive: (name: string) => string;
  added: string;
  saved: string;
  errors: {
    label_required: (lang: string) => string;
    label_too_long: (lang: string) => string;
    label_invalid: (lang: string) => string;
    duplicate: (lang: string) => string;
    order_mismatch: string;
    not_found: string;
    system_reason: string;
    not_migrated: string;
    failed: string;
    busy: string;
  };
}

const PL: LostReasonsAdminStrings = {
  navLabel: 'Powody przegranej',
  title: 'Powody przegranych ofert',
  subtitle: 'Lista, z której handlowiec wybiera powód, gdy klient odrzuci ofertę. Wybór jest obowiązkowy, a dane trafiają do panelu analityki. Archiwizacja ukrywa powód przy nowych ofertach, ale stare oferty i statystyki go zachowują.',
  notMigrated: 'Tabela powodów nie istnieje - uruchom migrations/032_lost_reasons.sql. Do tego czasu obowiązuje lista domyślna, a zmiany nie są zapisywane.',
  loadFailed: 'Nie udało się wczytać listy powodów.',
  addLegend: 'Nowy powód',
  add: 'Dodaj',
  langNames: { pl: 'Polski', en: 'Angielski', cs: 'Czeski', de: 'Niemiecki' },
  colOrder: 'Kolejność',
  colUsage: 'Użyty',
  colActions: 'Akcje',
  usage: (n) => `${n} ${n === 1 ? 'oferta' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'oferty' : 'ofert'}`,
  systemMark: 'wbudowany',
  archivedMark: 'archiwalny',
  showArchived: (n) => `Pokaż archiwalne (${n})`,
  moveUp: 'Przesuń wyżej',
  moveDown: 'Przesuń niżej',
  edit: 'Edytuj',
  save: 'Zapisz',
  cancel: 'Anuluj',
  archive: 'Archiwizuj',
  restore: 'Przywróć',
  confirmArchive: (name) => `Zarchiwizować powód „${name}"? Zniknie z listy wyboru, ale zostanie na starych ofertach i w statystykach.`,
  added: 'Dodano powód',
  saved: 'Zapisano',
  errors: {
    label_required: (lang) => `Uzupełnij nazwę: ${lang}`,
    label_too_long: (lang) => `Nazwa za długa (maks. 80 znaków): ${lang}`,
    label_invalid: (lang) => `Nazwa zawiera niewidoczne lub sterujące znaki: ${lang}`,
    duplicate: (lang) => `Powód o tej nazwie już istnieje (${lang}) - jeśli jest archiwalny, przywróć go`,
    order_mismatch: 'Lista zmieniła się w międzyczasie - odśwież stronę',
    not_found: 'Ten powód już nie istnieje - odśwież stronę',
    system_reason: 'Powodu „Inne" nie można zarchiwizować',
    not_migrated: 'Brak tabeli powodów - uruchom migrations/032_lost_reasons.sql',
    failed: 'Nie udało się zapisać',
    busy: 'Poczekaj na zakończenie poprzedniej zmiany',
  },
};

const EN: LostReasonsAdminStrings = {
  navLabel: 'Lost reasons',
  title: 'Lost offer reasons',
  subtitle: 'The list a salesperson picks from when a client rejects an offer. Picking one is mandatory and the result feeds the analytics panel. Archiving hides a reason for new losses; old offers and statistics keep it.',
  notMigrated: 'The reasons table does not exist - run migrations/032_lost_reasons.sql. Until then the default list applies and changes are not saved.',
  loadFailed: 'Could not load the reason list.',
  addLegend: 'New reason',
  add: 'Add',
  langNames: { pl: 'Polish', en: 'English', cs: 'Czech', de: 'German' },
  colOrder: 'Order',
  colUsage: 'Used',
  colActions: 'Actions',
  usage: (n) => `${n} ${n === 1 ? 'offer' : 'offers'}`,
  systemMark: 'built-in',
  archivedMark: 'archived',
  showArchived: (n) => `Show archived (${n})`,
  moveUp: 'Move up',
  moveDown: 'Move down',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  archive: 'Archive',
  restore: 'Restore',
  confirmArchive: (name) => `Archive "${name}"? It leaves the picker but stays on old offers and in statistics.`,
  added: 'Reason added',
  saved: 'Saved',
  errors: {
    label_required: (lang) => `Fill in the name: ${lang}`,
    label_too_long: (lang) => `Name too long (max 80 characters): ${lang}`,
    label_invalid: (lang) => `Name contains invisible or control characters: ${lang}`,
    duplicate: (lang) => `A reason with this name already exists (${lang}) - if archived, restore it`,
    order_mismatch: 'The list changed meanwhile - refresh the page',
    not_found: 'This reason no longer exists - refresh the page',
    system_reason: '"Other" cannot be archived',
    not_migrated: 'Reasons table missing - run migrations/032_lost_reasons.sql',
    failed: 'Could not save',
    busy: 'Wait for the previous change to finish',
  },
};

const CS: LostReasonsAdminStrings = {
  ...EN,
  navLabel: 'Důvody prohry',
  title: 'Důvody prohraných nabídek',
  subtitle: 'Seznam, ze kterého obchodník vybírá důvod, když klient nabídku odmítne. Výběr je povinný a data jdou do analytiky. Archivace skryje důvod u nových nabídek, staré nabídky a statistiky ho zachovají.',
  notMigrated: 'Tabulka důvodů neexistuje - spusťte migrations/032_lost_reasons.sql. Do té doby platí výchozí seznam a změny se neukládají.',
  loadFailed: 'Seznam důvodů se nepodařilo načíst.',
  addLegend: 'Nový důvod',
  add: 'Přidat',
  langNames: { pl: 'Polsky', en: 'Anglicky', cs: 'Česky', de: 'Německy' },
  colOrder: 'Pořadí',
  colUsage: 'Použito',
  colActions: 'Akce',
  usage: (n) => `${n} ${n === 1 ? 'nabídka' : n >= 2 && n <= 4 ? 'nabídky' : 'nabídek'}`,
  systemMark: 'vestavěný',
  archivedMark: 'archivováno',
  showArchived: (n) => `Zobrazit archivované (${n})`,
  moveUp: 'Posunout nahoru',
  moveDown: 'Posunout dolů',
  edit: 'Upravit',
  save: 'Uložit',
  cancel: 'Zrušit',
  archive: 'Archivovat',
  restore: 'Obnovit',
  confirmArchive: (name) => `Archivovat „${name}"? Zmizí z výběru, ale zůstane u starých nabídek a ve statistikách.`,
  added: 'Důvod přidán',
  saved: 'Uloženo',
  errors: {
    label_required: (lang) => `Vyplňte název: ${lang}`,
    label_too_long: (lang) => `Název je příliš dlouhý (max. 80 znaků): ${lang}`,
    label_invalid: (lang) => `Název obsahuje neviditelné nebo řídicí znaky: ${lang}`,
    duplicate: (lang) => `Důvod s tímto názvem již existuje (${lang}) - pokud je archivovaný, obnovte ho`,
    order_mismatch: 'Seznam se mezitím změnil - obnovte stránku',
    not_found: 'Tento důvod již neexistuje - obnovte stránku',
    system_reason: 'Důvod „Jiné" nelze archivovat',
    not_migrated: 'Chybí tabulka důvodů - spusťte migrations/032_lost_reasons.sql',
    failed: 'Uložení se nezdařilo',
    busy: 'Počkejte na dokončení předchozí změny',
  },
};

const DE: LostReasonsAdminStrings = {
  ...EN,
  navLabel: 'Verlustgründe',
  title: 'Gründe für verlorene Angebote',
  subtitle: 'Die Liste, aus der der Vertrieb wählt, wenn ein Kunde ein Angebot ablehnt. Die Auswahl ist Pflicht und fließt in die Analyse. Archivieren blendet einen Grund für neue Verluste aus; alte Angebote und Statistiken behalten ihn.',
  notMigrated: 'Die Tabelle der Gründe fehlt - migrations/032_lost_reasons.sql ausführen. Bis dahin gilt die Standardliste und Änderungen werden nicht gespeichert.',
  loadFailed: 'Liste der Gründe konnte nicht geladen werden.',
  addLegend: 'Neuer Grund',
  add: 'Hinzufügen',
  langNames: { pl: 'Polnisch', en: 'Englisch', cs: 'Tschechisch', de: 'Deutsch' },
  colOrder: 'Reihenfolge',
  colUsage: 'Verwendet',
  colActions: 'Aktionen',
  usage: (n) => `${n} ${n === 1 ? 'Angebot' : 'Angebote'}`,
  systemMark: 'integriert',
  archivedMark: 'archiviert',
  showArchived: (n) => `Archivierte anzeigen (${n})`,
  moveUp: 'Nach oben',
  moveDown: 'Nach unten',
  edit: 'Bearbeiten',
  save: 'Speichern',
  cancel: 'Abbrechen',
  archive: 'Archivieren',
  restore: 'Wiederherstellen',
  confirmArchive: (name) => `„${name}" archivieren? Der Grund verschwindet aus der Auswahl, bleibt aber bei alten Angeboten und in Statistiken.`,
  added: 'Grund hinzugefügt',
  saved: 'Gespeichert',
  errors: {
    label_required: (lang) => `Name ausfüllen: ${lang}`,
    label_too_long: (lang) => `Name zu lang (max. 80 Zeichen): ${lang}`,
    label_invalid: (lang) => `Name enthält unsichtbare oder Steuerzeichen: ${lang}`,
    duplicate: (lang) => `Ein Grund mit diesem Namen existiert bereits (${lang}) - falls archiviert, wiederherstellen`,
    order_mismatch: 'Die Liste hat sich inzwischen geändert - Seite neu laden',
    not_found: 'Dieser Grund existiert nicht mehr - Seite neu laden',
    system_reason: '„Sonstiges" kann nicht archiviert werden',
    not_migrated: 'Tabelle der Gründe fehlt - migrations/032_lost_reasons.sql ausführen',
    failed: 'Speichern fehlgeschlagen',
    busy: 'Bitte warten, bis die vorherige Änderung gespeichert ist',
  },
};

const STRINGS: Record<ReasonLang, LostReasonsAdminStrings> = { pl: PL, en: EN, cs: CS, de: DE };

export function lostReasonsAdminStrings(language: string): LostReasonsAdminStrings {
  return STRINGS[pickReasonLang(language)];
}

/** Turns an API error ({ code, lang? }) into a message in the admin's language. */
export function adminErrorText(s: LostReasonsAdminStrings, data: { code?: unknown; lang?: unknown } | null): string {
  const lang = typeof data?.lang === 'string' && data.lang in s.langNames ? s.langNames[data.lang as ReasonLang] : '';
  switch (data?.code) {
    case 'label_required': return s.errors.label_required(lang);
    case 'label_too_long': return s.errors.label_too_long(lang);
    case 'label_invalid': return s.errors.label_invalid(lang);
    case 'duplicate': return s.errors.duplicate(lang);
    case 'order_mismatch': return s.errors.order_mismatch;
    case 'not_found': return s.errors.not_found;
    case 'system_reason': return s.errors.system_reason;
    case 'not_migrated': return s.errors.not_migrated;
    default: return s.errors.failed;
  }
}
