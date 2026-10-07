'use client';

// Loads the whole access configuration (GET /api/admin/access) and runs admin mutations
// against /api/admin/access/<resource>. Every successful mutation re-fetches the config, so
// the panels always render what the server now holds.

import { useCallback, useEffect, useState } from 'react';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';
import { accessErrorText, useAccessT } from '@/lib/i18n/access';

export type AccessResource =
  | 'flows'
  | 'levels'
  | 'roles'
  | 'flow-roles'
  | 'memberships'
  | 'rules'
  | 'visibility'
  | 'policies';

export type MutationVerb = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface MutationResult {
  ok: boolean;
  error?: string;
}

export type Mutate = (resource: AccessResource, method: MutationVerb, body: unknown) => Promise<MutationResult>;

export interface UseAdminAccess {
  config: AdminAccessConfig | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  mutate: Mutate;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function useAdminAccess(): UseAdminAccess {
  const t = useAccessT();
  const [config, setConfig] = useState<AdminAccessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/access', { cache: 'no-store' });
      const body = await readJson(res);
      if (!res.ok || !body) {
        setError(accessErrorText(t, body, t.loadFailed));
        return;
      }
      setConfig(body as unknown as AdminAccessConfig);
      setError(null);
    } catch (e) {
      console.error('Failed to load access configuration:', e);
      setError(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mutate = useCallback<Mutate>(
    async (resource, method, body) => {
      try {
        const res = await fetch(`/api/admin/access/${resource}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await readJson(res);
          return { ok: false, error: accessErrorText(t, data, t.loadFailed) };
        }
        await reload();
        return { ok: true };
      } catch (e) {
        console.error(`Access mutation ${method} ${resource} failed:`, e);
        return { ok: false, error: t.loadFailed };
      }
    },
    [reload, t]
  );

  return { config, loading, error, reload, mutate };
}
