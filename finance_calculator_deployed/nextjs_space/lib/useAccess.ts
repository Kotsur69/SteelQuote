'use client';

// The signed-in user's access summary (memberships, active flow, permissions there) for the
// UI. Purely for rendering - every API route re-checks on the server. switchFlow() changes
// the active flow (new offers are created in it) and reloads the summary.
//
// One request per page load: every component calling useAccess() shares the same in-flight
// promise (Navigation, Calculator and the review page all need it), and reload() refreshes
// it for all of them.

import { useCallback, useEffect, useState } from 'react';
import type { AccessSummary } from '@/lib/access/types';

export interface UseAccess {
  access: AccessSummary | null;
  /** True until the first summary (or a failure) arrived. */
  loading: boolean;
  switchFlow: (flowId: number) => Promise<boolean>;
  reload: () => Promise<void>;
}

let shared: Promise<AccessSummary | null> | null = null;
const listeners = new Set<(value: AccessSummary | null) => void>();

function fetchSummary(): Promise<AccessSummary | null> {
  return fetch('/api/auth/me')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data?.access as AccessSummary | undefined) ?? null)
    .catch(() => null);
}

function load(force = false): Promise<AccessSummary | null> {
  if (!shared || force) {
    const request = fetchSummary();
    shared = request;
    void request.then((value) => listeners.forEach((notify) => notify(value)));
  }
  return shared;
}

export function useAccess(): UseAccess {
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const notify = (value: AccessSummary | null) => {
      if (!active) return;
      setAccess(value);
      setLoading(false);
    };
    listeners.add(notify);
    void load().then(notify);
    return () => {
      active = false;
      listeners.delete(notify);
    };
  }, []);

  const reload = useCallback(async () => {
    await load(true);
  }, []);

  const switchFlow = useCallback(async (flowId: number) => {
    try {
      const res = await fetch('/api/auth/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId }),
      });
      if (res.ok) await load(true);
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { access, loading, switchFlow, reload };
}
