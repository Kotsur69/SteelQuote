'use client';

// The signed-in user's access summary (memberships, active flow, permissions there) for the
// UI. Purely for rendering - every API route re-checks on the server. switchFlow() changes
// the active flow (new offers are created in it) and reloads the summary.

import { useCallback, useEffect, useState } from 'react';
import type { AccessSummary } from '@/lib/access/types';

export interface UseAccess {
  access: AccessSummary | null;
  loading: boolean;
  switchFlow: (flowId: number) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useAccess(): UseAccess {
  const [access, setAccess] = useState<AccessSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = res.ok ? await res.json() : null;
      setAccess((data?.access as AccessSummary | undefined) ?? null);
    } catch {
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const switchFlow = useCallback(
    async (flowId: number) => {
      const res = await fetch('/api/auth/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId }),
      });
      if (res.ok) await reload();
      return res.ok;
    },
    [reload]
  );

  return { access, loading, switchFlow, reload };
}
