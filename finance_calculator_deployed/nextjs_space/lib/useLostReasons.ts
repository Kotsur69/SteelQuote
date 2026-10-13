'use client';

import { useEffect, useState } from 'react';
import { FALLBACK_LOST_REASONS, type LostReasonDef } from '@/lib/lostReasons';

// The admin-managed lost-reason list (GET /api/lost-reasons), archived reasons included so old
// losses keep their label. Until it loads (or if it fails) the 024 fallback list is used, so
// labels of the long-standing codes render immediately.
export function useLostReasons(): { reasons: readonly LostReasonDef[]; loaded: boolean } {
  const [reasons, setReasons] = useState<readonly LostReasonDef[]>(FALLBACK_LOST_REASONS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/lost-reasons', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { reasons?: LostReasonDef[] }) => {
        if (Array.isArray(data.reasons)) setReasons(data.reasons);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.error('Error fetching lost reasons:', error);
        setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  return { reasons, loaded };
}
