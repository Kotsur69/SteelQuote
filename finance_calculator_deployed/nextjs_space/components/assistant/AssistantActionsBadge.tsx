'use client';

// "przez asystenta" next to the offer number in the calculator (docs/ai-assistant-plan.md D25):
// shown when a change to this offer row was confirmed on an assistant card. The confirmed
// pending-action rows are the audit record; opening the badge lists who confirmed what and when.
// A native <details> keeps the list reachable by keyboard and touch, not only by hovering.

import { Bot } from 'lucide-react';

export interface AssistantActionRecord {
  kind: string;
  at: string;
  by: string | null;
}

const LABELS = {
  pl: {
    badge: 'przez asystenta',
    intro: 'Zmiany potwierdzone w asystencie AI',
    kinds: { draft: 'utworzenie szkicu', edit: 'zmiana oferty', duplicate: 'kopia oferty', submit: 'przekazanie do akceptacji', send: 'oznaczenie jako wysłana', approve: 'akceptacja', reject: 'odrzucenie', decision: 'decyzja klienta' } as Record<string, string>,
  },
  en: {
    badge: 'via assistant',
    intro: 'Changes confirmed in the AI assistant',
    kinds: { draft: 'draft created', edit: 'offer changed', duplicate: 'offer copied', submit: 'submitted for approval', send: 'marked as sent', approve: 'approved', reject: 'rejected', decision: 'client decision' } as Record<string, string>,
  },
};

/** The API payload is data from the server, still checked before it is rendered. */
export function toAssistantRecords(raw: unknown): AssistantActionRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const rec = r as Partial<AssistantActionRecord> | null;
    if (!rec || typeof rec.kind !== 'string' || typeof rec.at !== 'string' || !Number.isFinite(Date.parse(rec.at))) return [];
    return [{ kind: rec.kind, at: rec.at, by: typeof rec.by === 'string' ? rec.by : null }];
  });
}

type Props = {
  records: AssistantActionRecord[];
  language: string;
};

export function AssistantActionsBadge({ records, language }: Props) {
  if (records.length === 0) return null;
  const lang = language === 'pl' ? 'pl' : 'en';
  const t = LABELS[lang];
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <details className="relative ml-2 inline-block align-middle font-sans">
      <summary className="inline-flex min-h-[24px] cursor-pointer list-none items-center gap-1 rounded-full border border-[var(--border-hi)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cr)] [&::-webkit-details-marker]:hidden">
        <Bot aria-hidden className="h-3.5 w-3.5" />
        {t.badge}
      </summary>
      <div className="absolute left-0 top-full z-20 mt-1 min-w-[16rem] rounded-md border border-[var(--border-hi)] bg-[var(--bg-card)] p-2.5 text-xs text-[var(--text-secondary)] shadow-lg">
        <p className="m-0 mb-1 font-semibold text-[var(--text-primary)]">{t.intro}</p>
        <ul className="m-0 list-none p-0">
          {records.map((r, i) => (
            <li key={`${i}-${r.at}`}>{`${t.kinds[r.kind] ?? r.kind} - ${r.by ?? '-'}, ${when(r.at)}`}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
