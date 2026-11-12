'use client';

// The /analytics panel state, kept in the URL (docs/ai-assistant-plan.md 6.1, D23).
//
// The URL is read once on load and again whenever it changes from outside (the assistant's
// "Otwórz panel analizy" link clicked while the panel is already open); every change made in
// the panel is written back with router.replace, so refresh, back and a shared link all show the
// same view. The schema itself lives in lib/analyticsUrlState.ts, shared with the assistant.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  parseUrlState,
  sectionId,
  toApiQuery,
  toSearch,
  type AnalyticsUrlState,
  type BreakdownChartKindValue,
  type TimeChartKindValue,
} from '@/lib/analyticsUrlState';
import type { Dimension, Measure } from '@/lib/analytics';
import type { AnalyticsUiFilters } from './FilterBar';

type Update<T> = T | ((previous: T) => T);
const resolve = <T,>(update: Update<T>, previous: T): T =>
  typeof update === 'function' ? (update as (p: T) => T)(previous) : update;

/** The FilterBar shape (userIds / steelTypes / clientIds) of a URL state. */
function toUiFilters(s: AnalyticsUrlState): AnalyticsUiFilters {
  return {
    preset: s.preset, from: s.from, to: s.to, basis: s.basis, granularity: s.granularity, split: s.split,
    userIds: s.users, steelTypes: s.types, statuses: s.statuses, decisions: s.decisions, clientIds: s.clients,
  };
}

function fromUiFilters(s: AnalyticsUrlState, f: AnalyticsUiFilters): AnalyticsUrlState {
  return {
    ...s,
    preset: f.preset, from: f.from, to: f.to, basis: f.basis, granularity: f.granularity, split: f.split,
    users: f.userIds, types: f.steelTypes, statuses: f.statuses, decisions: f.decisions, clients: f.clientIds,
  };
}

/** `ready` = the data on screen belongs to the current filters, so a focus scroll lands right. */
export function useAnalyticsUrlState(ready: (apiQuery: string) => boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.toString();

  const [state, setState] = useState<AnalyticsUrlState>(() => parseUrlState(params));
  // The search string the URL holds or is about to hold, and every search this hook wrote that
  // has not landed yet. router.replace is asynchronous: with two quick edits the first URL lands
  // after the second was written, and must not be mistaken for an outside change (which would
  // revert the second edit). Only a search the hook never wrote comes from outside.
  const synced = useRef(current);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (pending.current.delete(current)) return;
    if (current === synced.current) return;
    synced.current = current;
    setState(parseUrlState(new URLSearchParams(current)));
  }, [current]);

  useEffect(() => {
    const search = toSearch(state);
    if (search === synced.current) return;
    synced.current = search;
    pending.current.add(search);
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [state, pathname, router]);

  // One scroll to the section the link points at, once its data is on screen; then the focus
  // leaves the URL so a refresh or a filter change does not jump again.
  useEffect(() => {
    if (!state.focus || !ready(toApiQuery(state))) return;
    document.getElementById(sectionId(state.focus))?.scrollIntoView({ block: 'start' });
    setState((s) => ({ ...s, focus: null }));
  }, [ready, state]);

  const field = <K extends keyof AnalyticsUrlState>(key: K) =>
    (value: AnalyticsUrlState[K]) => setState((s) => ({ ...s, [key]: value }));

  const setFilters = useCallback(
    (update: Update<AnalyticsUiFilters>) => setState((s) => fromUiFilters(s, resolve(update, toUiFilters(s)))),
    []
  );

  return {
    filters: toUiFilters(state),
    setFilters,
    apiQuery: toApiQuery(state),
    measure: state.measure,
    setMeasure: field('measure') as (value: Measure) => void,
    timeKind: state.timeKind,
    setTimeKind: field('timeKind') as (value: TimeChartKindValue) => void,
    breakdownDimension: state.breakdown,
    setBreakdownDimension: field('breakdown') as (value: Dimension) => void,
    breakdownKind: state.breakdownKind,
    setBreakdownKind: field('breakdownKind') as (value: BreakdownChartKindValue) => void,
    role: state.role,
    setRole: field('role') as (value: string) => void,
  };
}
