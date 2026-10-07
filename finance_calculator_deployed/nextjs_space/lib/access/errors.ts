// Access / workflow errors with a stable `code` the UI translates (translations.ts
// accessErrors.<code>); `error` keeps a Polish fallback for callers that show it verbatim.
import { NextResponse } from 'next/server';

const MESSAGES = {
  no_flow: { status: 403, text: 'Nie masz przypisanego flow - skontaktuj się z administratorem.' },
  cannot_create: { status: 403, text: 'Twoja rola w tym flow nie może tworzyć ofert.' },
  cannot_edit: { status: 403, text: 'Nie możesz edytować tej oferty.' },
  cannot_submit: { status: 403, text: 'Twoja rola nie może wysyłać ofert do walidacji.' },
  cannot_review: { status: 403, text: 'Ta oferta nie czeka na Twoją walidację.' },
  cannot_send: { status: 409, text: 'Nie można wysłać tej oferty do klienta w obecnym statusie.' },
  needs_validation: { status: 409, text: 'Oferta wymaga walidacji przed wysłaniem do klienta.' },
  level_conflict: { status: 409, text: 'Konflikt konfiguracji: wymagany poziom akceptacji nie istnieje w tym flow.' },
  pgl_locked: { status: 403, text: 'Twoja rola nie może zmieniać bazy PGL.' },
  margin_locked: { status: 403, text: 'Twoja rola nie może zmieniać ceny / marży.' },
  wrong_status: { status: 409, text: 'Oferta nie jest w odpowiednim statusie.' },
} as const;

export type AccessErrorCode = keyof typeof MESSAGES;

export function accessError(code: AccessErrorCode, extra: Record<string, unknown> = {}): NextResponse {
  const m = MESSAGES[code];
  return NextResponse.json({ error: m.text, code, ...extra }, { status: m.status });
}
