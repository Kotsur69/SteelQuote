'use client';

// Add / remove juniors on a senior's team. Rendered by the senior on their own panel
// (seniorId = their own id) and by an admin on /admin/handlowcy for each senior row. Authz is
// the server's job: /api/teams pins a senior to their own id and lets an admin name any senior.
// Every mutation response carries the freshly re-read team + still-assignable list, so this
// component never patches state by hand.

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Member {
  id: number;
  email: string;
  full_name: string | null;
}

interface TeamPayload {
  team: Member[];
  assignable: Member[];
}

interface TeamEditorProps {
  /** The senior whose team this is. For a senior editing their own team, their own user id. */
  seniorId: number;
  /** Tighter layout for the admin table row; default is standalone-card spacing. */
  compact?: boolean;
}

const memberName = (m: Member): string => (m.full_name && m.full_name.trim()) || m.email;

export default function TeamEditor({ seniorId, compact = false }: TeamEditorProps) {
  const { t } = useLanguage();
  const tt = t.team;

  const [team, setTeam] = useState<Member[]>([]);
  const [assignable, setAssignable] = useState<Member[]>([]);
  const [pick, setPick] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (data: TeamPayload) => {
    setTeam(data.team);
    setAssignable(data.assignable);
    setPick('');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams?seniorId=${seniorId}`);
      if (!res.ok) throw new Error();
      apply((await res.json()) as TeamPayload);
    } catch {
      setError(tt.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [seniorId, tt.loadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const mutate = async (run: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await run();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error);
      apply(data as TeamPayload);
    } catch (e) {
      setError((e as Error).message || tt.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const juniorId = Number.parseInt(pick, 10);
    if (!Number.isInteger(juniorId)) return;
    return mutate(() =>
      fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seniorId, juniorId }),
      })
    );
  };

  const remove = (juniorId: number) =>
    mutate(() =>
      fetch(`/api/teams?seniorId=${seniorId}&juniorId=${juniorId}`, { method: 'DELETE' })
    );

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {!compact && (
        <p className="text-[11px] text-[var(--text-secondary)] font-mono">{tt.hint}</p>
      )}

      {loading ? (
        <p className="text-xs text-[var(--text-secondary)] font-mono">{tt.loading}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {team.length === 0 && (
              <span className="text-xs text-[var(--text-muted)] font-mono">{tt.empty}</span>
            )}
            {team.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)]"
              >
                {memberName(m)}
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  disabled={busy}
                  title={tt.remove}
                  aria-label={`${tt.remove}: ${memberName(m)}`}
                  className="text-[var(--accent-sum)] leading-none hover:opacity-70 disabled:opacity-40"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={busy || assignable.length === 0}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-cr)] disabled:opacity-50"
            >
              <option value="">
                {assignable.length === 0 ? tt.noneAssignable : tt.addPlaceholder}
              </option>
              {assignable.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={add}
              disabled={busy || !pick}
              className="px-3 py-1 text-xs font-medium rounded border border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-40"
            >
              + {tt.add}
            </button>
          </div>

          {error && <p className="text-[11px] text-[var(--accent-sum)] font-mono">{error}</p>}
        </>
      )}
    </div>
  );
}
