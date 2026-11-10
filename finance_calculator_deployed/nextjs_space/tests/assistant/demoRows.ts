// In-memory stand-in for the demo database: the demo spec's offers as the rows
// lib/analyticsQuery.fetchAnalyticsRows would return, plus a fetchRows that mirrors its WHERE
// clause (visibility of the asking user, date window on the basis column, user / status /
// decision / client filters). Lets the metric catalog be tested against the golden numbers
// without Postgres; the real SQL is covered by scripts/assistant-demo/verify.ts.

import type { AnalyticsFilters } from '@/lib/analytics';
import type { AnalyticsOfferRow, RowQueryWindow } from '@/lib/analyticsQuery';
import type { LostReasonDef } from '@/lib/lostReasons';
import type { MetricsDeps } from '@/lib/assistant/metrics';
import type { Lang } from '@/lib/assistant/format';
import { rows as oracleRows } from '../../scripts/assistant-demo/oracle';
import { CLIENTS, LOST_REASONS, PEOPLE, SPEC_TODAY } from '../../scripts/assistant-demo/spec';
import { askerByKey, expectedOwners } from '../../scripts/assistant-demo/visibility';

export const userIdOf = (key: string): number => PEOPLE.findIndex((p) => p.key === key) + 1;
export const clientIdOf = (key: string): number => CLIENTS.findIndex((c) => c.key === key) + 1;
export const userKeyOf = (id: string): string => PEOPLE[Number(id) - 1]?.key ?? id;
export const clientKeyOf = (id: string): string => CLIENTS[Number(id) - 1]?.key ?? id;

interface DemoRow extends AnalyticsOfferRow {
  ownerKey: string;
}

function demoRows(): DemoRow[] {
  return oracleRows().map((r) => ({
    ownerKey: r.owner,
    id: r.id,
    root_offer_id: null,
    version_number: 1,
    display_name: `offer_${r.id}`,
    status: r.status,
    client_decision: r.decision,
    client_decision_reason: r.lostReason,
    user_id: userIdOf(r.owner),
    owner_name: PEOPLE.find((p) => p.key === r.owner)?.fullName ?? null,
    owner_email: null,
    client_id: clientIdOf(r.client),
    client_company: CLIENTS.find((c) => c.key === r.client)?.company ?? null,
    created_date: r.created,
    sent_date: r.sent,
    decided_date: r.decided,
    offer_data: {
      eurPlnRate: r.rate,
      zestawienie: r.items.map((i) => ({
        type: i.type,
        tons: i.tons,
        totalValue: i.valueEur,
        inputs: i.marginPct === null ? {} : { marginPct: i.marginPct },
      })),
    },
  }));
}

function fetchRowsFor(askerKey: string): MetricsDeps['fetchRows'] {
  const owners = expectedOwners(askerByKey(askerKey));
  const all = demoRows();
  return async (filters: AnalyticsFilters, window: RowQueryWindow) =>
    all.filter((r) => {
      if (!owners.has(r.ownerKey)) return false;
      if (filters.userIds.length > 0 && !filters.userIds.includes(r.user_id!)) return false;
      const date = filters.basis === 'created' ? r.created_date : filters.basis === 'sent' ? r.sent_date : r.decided_date;
      if (filters.basis !== 'created' && !date) return false;
      if (window.from && (!date || date < window.from)) return false;
      if (window.to && (!date || date > window.to)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(r.status)) return false;
      if (filters.decisions.length > 0 && !filters.decisions.includes(r.client_decision)) return false;
      if (filters.clientIds.length > 0 && !filters.clientIds.includes(r.client_id!)) return false;
      return true;
    });
}

const REASONS: LostReasonDef[] = LOST_REASONS.map((code, i) => ({
  code,
  labels: { pl: `pl:${code}`, en: `en:${code}`, cs: code, de: code },
  sortOrder: i,
  archived: false,
  isSystem: code === 'other',
}));

export function demoDeps(askerKey: string, lang: Lang = 'pl', today: string = SPEC_TODAY): MetricsDeps {
  const asker = askerByKey(askerKey);
  const self = PEOPLE.find((p) => p.email === asker.email);
  return {
    today,
    lang,
    selfId: self ? userIdOf(self.key) : 999,
    teamUserIds: [],
    fetchRows: fetchRowsFor(askerKey),
    loadLostReasons: async () => REASONS,
  };
}
