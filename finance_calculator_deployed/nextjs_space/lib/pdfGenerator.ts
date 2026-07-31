// Dane klienta podpięte pod ofertę.
//
// Podział na dwie grupy jest celowy i odzwierciedla to, co widać w kalkulatorze:
//   - dane FIRMY (company/nip/address/sapId) — obowiązkowa podstawa oferty,
//   - dane KONTAKTOWE (firstName/lastName/phone/email) — opcjonalne, przy części
//     firm po prostu nie są potrzebne.
// Kolejność pól niżej jest tą samą, w której pola stoją w formularzu.
export interface ClientInfo {
  // Dane firmy
  company: string;
  nip: string;
  address: string;
  sapId: string;
  // Dane kontaktowe
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export const EMPTY_CLIENT_INFO: ClientInfo = {
  company: '',
  nip: '',
  address: '',
  sapId: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
};

// Granica wczytania danych klienta z zapisanej oferty.
//
// offer_data to blob JSON zapisany w bazie kiedyś w przeszłości — nie ma żadnej
// gwarancji, że pasuje do DZISIEJSZEGO kształtu ClientInfo. Oferty sprzed tej
// zmiany nie mają `sapId` w ogóle, a pola przepuszczone przez bazę mogą być null
// zamiast pustego stringa. Front zakłada wszędzie stringi (kontrolowany input,
// który dostanie undefined, przełącza się w tryb niekontrolowany i React sypie
// ostrzeżeniem), dlatego normalizujemy TU, raz, zamiast rozstawiać `?? ''` po
// całym komponencie.
export function normalizeClientInfo(raw: unknown): ClientInfo {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CLIENT_INFO };

  const r = raw as Record<string, unknown>;
  const str = (value: unknown): string => (typeof value === 'string' ? value : '');

  return {
    company: str(r.company),
    nip: str(r.nip),
    address: str(r.address),
    sapId: str(r.sapId),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    phone: str(r.phone),
    email: str(r.email),
  };
}

// Reguła odblokowania danych kontaktowych, współdzielona przez formularz i backend.
// Firma + NIP to minimum identyfikujące klienta; dopóki go nie ma, sekcja
// kontaktowa jest zablokowana (decyzja produktowa, nie techniczna).
export function hasRequiredCompanyDetails(client: ClientInfo): boolean {
  return client.company.trim() !== '' && client.nip.trim() !== '';
}
