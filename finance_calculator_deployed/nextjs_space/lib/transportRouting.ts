// Odległość drogowa między dwoma adresami — wyłącznie server-side (klucz Geoapify
// nie może trafić do przeglądarki).
//
// Łańcuch dostawców (decyzja usera 2026-09-10):
//   1. Geoapify (klucz w GEOAPIFY_API_KEY) — geokodowanie + trasa profilem heavy_truck
//   2. fallback: Nominatim (geokodowanie) + OSRM (trasa) — publiczne demo, bez klucza
// Fallback włącza się przy BRAKU klucza, wyczerpanym limicie (401/429) i każdym innym
// błędzie Geoapify, więc aplikacja działa też zanim ktokolwiek wygeneruje klucz.
//
// Wynik jest cache'owany w tabeli route_cache przez app/api/transport/route.ts — ten
// moduł sam nie dotyka bazy.

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Adres w formie zwróconej przez dostawcę — handlowiec widzi, co faktycznie znaleziono. */
  label: string;
}

export type RouteProvider = 'geoapify' | 'osm';

export interface RouteResult {
  distanceKm: number;
  origin: GeoPoint;
  dest: GeoPoint;
  provider: RouteProvider;
}

export type RoutingErrorCode =
  | 'EMPTY_ADDRESS'
  | 'ORIGIN_NOT_FOUND'
  | 'DEST_NOT_FOUND'
  | 'NO_ROUTE'
  | 'PROVIDER_UNAVAILABLE';

export class RoutingError extends Error {
  constructor(public code: RoutingErrorCode, message: string) {
    super(message);
    this.name = 'RoutingError';
  }
}

const REQUEST_TIMEOUT_MS = 8000;
const MAX_ADDRESS_LENGTH = 300;
// Nominatim wymaga identyfikacji aplikacji i dopuszcza ~1 zapytanie/s (Usage Policy).
const NOMINATIM_USER_AGENT = 'AMSteel-Quote/1.0 (internal quoting tool)';
const NOMINATIM_MIN_INTERVAL_MS = 1100;

// --- Wejście ----------------------------------------------------------------

/**
 * Adres z formularza -> forma nadająca się do wysłania do geokodera. Odrzuca puste
 * i absurdalnie długie wejścia (walidacja na granicy systemu) oraz znaki sterujące.
 */
export function normalizeAddress(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new RoutingError('EMPTY_ADDRESS', 'Adres musi być tekstem');
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) {
    throw new RoutingError('EMPTY_ADDRESS', 'Adres jest pusty');
  }
  return cleaned.slice(0, MAX_ADDRESS_LENGTH);
}

/** Klucz cache — ten sam adres zapisany różną wielkością liter to jeden wpis. */
export function addressCacheKey(address: string): string {
  return normalizeAddress(address).toLowerCase();
}

/**
 * Warianty zapytania do geokodera, od najbardziej do najmniej dosłownego.
 *
 * Nominatim jest wrażliwy na kolejność członów: "Gdańsk, ul. Marynarki Polskiej 100"
 * nie zwraca NIC, a "Marynarki Polskiej 100, Gdańsk" trafia poprawnie (sprawdzone
 * 2026-09-10). Handlowiec nie ma o tym wiedzieć, więc próbujemy po kolei: oryginał,
 * bez skrótów typu "ul.", oraz z odwróconą kolejnością członów.
 */
export function addressVariants(address: string): string[] {
  const base = normalizeAddress(address);
  const withoutPrefixes = base
    .replace(/\b(ul|al|os|pl|ulica|aleja|osiedle|plac)\.?\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = withoutPrefixes.split(',').map(p => p.trim()).filter(Boolean);
  const reversed = parts.length > 1 ? [...parts].reverse().join(', ') : '';

  // Dedup z zachowaniem kolejności prób.
  return [base, withoutPrefixes, reversed].filter(
    (v, i, arr) => v.length > 0 && arr.indexOf(v) === i
  );
}

// --- HTTP -------------------------------------------------------------------

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new RoutingError('PROVIDER_UNAVAILABLE', `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Geoapify ---------------------------------------------------------------

async function geoapifyGeocode(address: string, apiKey: string): Promise<GeoPoint | null> {
  for (const variant of addressVariants(address)) {
    const url =
      'https://api.geoapify.com/v1/geocode/search' +
      `?text=${encodeURIComponent(variant)}` +
      '&filter=countrycode:pl&format=json&limit=1' +
      `&apiKey=${encodeURIComponent(apiKey)}`;
    const data = (await fetchJson(url)) as { results?: { lat?: number; lon?: number; formatted?: string }[] };
    const hit = data.results?.[0];
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
      return { lat: hit.lat as number, lng: hit.lon as number, label: hit.formatted || variant };
    }
  }
  return null;
}

async function geoapifyDistanceKm(origin: GeoPoint, dest: GeoPoint, apiKey: string): Promise<number> {
  // heavy_truck = profil TIR-a: omija zakazy tonażowe i niskie wiadukty, więc km są
  // bliższe temu, co realnie przejedzie przewoźnik, niż trasa samochodu osobowego.
  const url =
    'https://api.geoapify.com/v1/routing' +
    `?waypoints=${origin.lat},${origin.lng}|${dest.lat},${dest.lng}` +
    '&mode=heavy_truck&units=metric' +
    `&apiKey=${encodeURIComponent(apiKey)}`;
  const data = (await fetchJson(url)) as {
    features?: { properties?: { distance?: number } }[];
  };
  const meters = data.features?.[0]?.properties?.distance;
  if (!Number.isFinite(meters)) {
    throw new RoutingError('NO_ROUTE', 'Geoapify nie zwrócił trasy');
  }
  return (meters as number) / 1000;
}

// --- Nominatim + OSRM (fallback bez klucza) ---------------------------------

let nominatimLastCallAt = 0;

/** Serializuje zapytania do Nominatim, żeby nie przekroczyć ~1 req/s z Usage Policy. */
async function throttleNominatim(): Promise<void> {
  const waitMs = nominatimLastCallAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  nominatimLastCallAt = Date.now();
}

async function nominatimGeocode(address: string): Promise<GeoPoint | null> {
  for (const variant of addressVariants(address)) {
    await throttleNominatim();
    const url =
      'https://nominatim.openstreetmap.org/search' +
      `?q=${encodeURIComponent(variant)}` +
      '&format=jsonv2&limit=1&countrycodes=pl';
    const data = (await fetchJson(url, { 'User-Agent': NOMINATIM_USER_AGENT })) as
      { lat?: string; lon?: string; display_name?: string }[];
    const hit = Array.isArray(data) ? data[0] : undefined;
    const lat = hit ? parseFloat(hit.lat ?? '') : NaN;
    const lng = hit ? parseFloat(hit.lon ?? '') : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: hit?.display_name || variant };
    }
  }
  return null;
}

async function osrmDistanceKm(origin: GeoPoint, dest: GeoPoint): Promise<number> {
  // Publiczne demo OSRM ma tylko profil samochodowy — dla tras międzymiastowych
  // różnica względem TIR-a to zwykle pojedyncze kilometry, a handlowiec i tak może
  // nadpisać wynik ręcznie.
  const url =
    'https://router.project-osrm.org/route/v1/driving/' +
    `${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
  const data = (await fetchJson(url)) as { code?: string; routes?: { distance?: number }[] };
  const meters = data.routes?.[0]?.distance;
  if (data.code !== 'Ok' || !Number.isFinite(meters)) {
    throw new RoutingError('NO_ROUTE', 'OSRM nie zwrócił trasy');
  }
  return (meters as number) / 1000;
}

// --- Orkiestracja -----------------------------------------------------------

async function routeViaGeoapify(originAddress: string, destAddress: string, apiKey: string): Promise<RouteResult> {
  const origin = await geoapifyGeocode(originAddress, apiKey);
  if (!origin) throw new RoutingError('ORIGIN_NOT_FOUND', 'Nie znaleziono adresu nadania');
  const dest = await geoapifyGeocode(destAddress, apiKey);
  if (!dest) throw new RoutingError('DEST_NOT_FOUND', 'Nie znaleziono adresu dostawy');
  const distanceKm = await geoapifyDistanceKm(origin, dest, apiKey);
  return { distanceKm: round2(distanceKm), origin, dest, provider: 'geoapify' };
}

async function routeViaOsm(originAddress: string, destAddress: string): Promise<RouteResult> {
  const origin = await nominatimGeocode(originAddress);
  if (!origin) throw new RoutingError('ORIGIN_NOT_FOUND', 'Nie znaleziono adresu nadania');
  const dest = await nominatimGeocode(destAddress);
  if (!dest) throw new RoutingError('DEST_NOT_FOUND', 'Nie znaleziono adresu dostawy');
  const distanceKm = await osrmDistanceKm(origin, dest);
  return { distanceKm: round2(distanceKm), origin, dest, provider: 'osm' };
}

/**
 * Odległość drogowa origin -> dest. Geoapify, a gdy go nie ma / padł / wyczerpał limit,
 * to publiczne Nominatim+OSRM.
 *
 * "Nie znaleziono adresu" NIE uruchamia fallbacku: skoro Geoapify (lepszy geokoder)
 * nie zna tego adresu, Nominatim też go nie znajdzie, a druga próba tylko przedłuża
 * czekanie handlowca o kolejne sekundy.
 */
export async function resolveRoute(originAddressRaw: unknown, destAddressRaw: unknown): Promise<RouteResult> {
  const originAddress = normalizeAddress(originAddressRaw);
  const destAddress = normalizeAddress(destAddressRaw);
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();

  if (apiKey) {
    try {
      return await routeViaGeoapify(originAddress, destAddress, apiKey);
    } catch (error) {
      if (error instanceof RoutingError && (error.code === 'ORIGIN_NOT_FOUND' || error.code === 'DEST_NOT_FOUND')) {
        throw error;
      }
      console.warn('Geoapify niedostępny lub limit wyczerpany — przechodzę na Nominatim+OSRM:', error);
    }
  }

  try {
    return await routeViaOsm(originAddress, destAddress);
  } catch (error) {
    if (error instanceof RoutingError) throw error;
    throw new RoutingError('PROVIDER_UNAVAILABLE', 'Serwis tras nie odpowiada');
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
