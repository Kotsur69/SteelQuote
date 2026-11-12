// The golden set (tests/assistant/golden.json) as typed cases, and the mapping of a case's
// params to a query_metrics input. Shared by the catalog test and the panel-link parity test.

import golden from './golden.json';
import { metricsQuerySchema, type MetricId, type MetricsQuery } from '@/lib/assistant/metrics';
import type { PeriodInput } from '@/lib/assistant/periods';
import { clientIdOf, userIdOf } from './demoRows';

export interface GoldenParams {
  metrics: string[];
  period: string;
  basis: 'created' | 'sent' | 'decided';
  filters: { people?: string[]; clients?: string[]; steelTypes?: string[] };
  group_by?: 'person' | 'client' | 'steel_type' | 'month';
  limit?: number;
  compare?: string;
}

export interface Case {
  id: string;
  group: string;
  asker: string;
  question: string;
  expect: { behavior: string; params?: GoldenParams; numbers?: Record<string, number | null> };
}

export const cases = golden.cases as unknown as Case[];

export function periodOf(label: string): PeriodInput {
  if (label === 'thisYear') return { preset: 'ytd' };
  if (label === 'last30days') return { preset: 'last30' };
  if (/^\d{4}$/.test(label)) return { year: Number(label) };
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return { year: Number(month[1]), month: Number(month[2]) };
  const quarter = /^(\d{4})-Q(\d)$/.exec(label);
  if (quarter) return { year: Number(quarter[1]), quarter: Number(quarter[2]) };
  return { preset: label as PeriodInput['preset'] };
}

export function queryOf(p: GoldenParams): MetricsQuery {
  const metrics = p.metrics.flatMap((m) => (m === 'margin' ? ['margin_weighted', 'margin_simple'] : [m])) as MetricId[];
  return metricsQuerySchema.parse({
    metrics,
    period: periodOf(p.period),
    basis: p.basis,
    filters: {
      ...(p.filters.people ? { people: p.filters.people.map(userIdOf) } : {}),
      ...(p.filters.clients ? { clients: p.filters.clients.map(clientIdOf) } : {}),
      ...(p.filters.steelTypes ? { steel_types: p.filters.steelTypes } : {}),
    },
    ...(p.group_by ? { group_by: p.group_by, sort: 'desc', limit: p.limit } : {}),
  });
}
