// UI strings of the assistant panel. Polish first (plan D14); every other interface language
// falls back to English.

export type PanelLang = 'pl' | 'en';

export const panelLang = (language: string): PanelLang => (language === 'pl' ? 'pl' : 'en');

export const STRINGS = {
  pl: {
    title: 'Asystent',
    open: 'Otwórz asystenta',
    close: 'Zamknij asystenta',
    expand: 'Otwórz na całej stronie',
    newChat: 'Nowy czat',
    placeholder: 'Zapytaj o oferty, liczby albo aplikację...',
    inputLabel: 'Pytanie do asystenta',
    send: 'Wyślij',
    stop: 'Zatrzymaj',
    thinking: 'Sprawdzam dane...',
    notice: 'Asystent AI - liczby pochodzą z danych aplikacji, sprawdź w Analityce.',
    emptyTitle: 'W czym mogę pomóc?',
    suggestions: ['Co czeka na moją decyzję?', 'Ile ofert wysłałem w tym miesiącu?', 'Moja średnia marża w tym kwartale', 'Co mam do wysłania?'],
    helpful: 'Pomocna odpowiedź',
    notHelpful: 'Niepomocna odpowiedź',
    thanks: 'Dziękuję za ocenę.',
    cached: 'z pamięci podręcznej',
    openOffer: 'Otwórz ofertę',
    owner: 'Handlowiec',
    client: 'Klient',
    margin: 'Marża',
    created: 'Utworzona',
    shown: (shown: number, total: number) => `Pokazano ${shown} z ${total}.`,
    networkError: 'Brak połączenia z serwerem. Spróbuj ponownie.',
    stopped: 'Zatrzymano.',
    you: 'Ty',
    assistant: 'Asystent',
  },
  en: {
    title: 'Assistant',
    open: 'Open the assistant',
    close: 'Close the assistant',
    expand: 'Open as a full page',
    newChat: 'New chat',
    placeholder: 'Ask about offers, figures or the app...',
    inputLabel: 'Question for the assistant',
    send: 'Send',
    stop: 'Stop',
    thinking: 'Checking the data...',
    notice: 'AI assistant - figures come from the app data, verify in Analytics.',
    emptyTitle: 'How can I help?',
    suggestions: ['What is waiting for my decision?', 'How many offers did I send this month?', 'My average margin this quarter', 'What do I have to send?'],
    helpful: 'Helpful answer',
    notHelpful: 'Unhelpful answer',
    thanks: 'Thanks for the rating.',
    cached: 'from cache',
    openOffer: 'Open offer',
    owner: 'Salesperson',
    client: 'Client',
    margin: 'Margin',
    created: 'Created',
    shown: (shown: number, total: number) => `Showing ${shown} of ${total}.`,
    networkError: 'Could not reach the server. Try again.',
    stopped: 'Stopped.',
    you: 'You',
    assistant: 'Assistant',
  },
} as const;

export type PanelStrings = (typeof STRINGS)[PanelLang];
