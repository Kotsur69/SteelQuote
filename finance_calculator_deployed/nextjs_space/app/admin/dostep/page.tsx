'use client';

// Superuser-only "Uprawnienia" page: flows & members, roles & levels, validation rules,
// simulator and the visibility matrix of the configurable flow / role model. The API
// (/api/admin/access) enforces the superuser check; this page only renders.

import { Suspense, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Eye, FlaskConical, GitBranch, ListChecks, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import FlowsPanel from '@/components/access/FlowsPanel';
import RolesPanel from '@/components/access/RolesPanel';
import RulesPanel from '@/components/access/RulesPanel';
import SimulatorPanel from '@/components/access/SimulatorPanel';
import VisibilityPanel from '@/components/access/VisibilityPanel';
import { Flash, useFlash, type PanelProps } from '@/components/access/ui';
import { useAdminAccess } from '@/components/access/useAdminAccess';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAccessT } from '@/lib/i18n/access';

const TAB_IDS = ['flows', 'roles', 'rules', 'simulator', 'visibility'] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_ICONS: Record<TabId, LucideIcon> = {
  flows: GitBranch,
  roles: ShieldCheck,
  rules: ListChecks,
  simulator: FlaskConical,
  visibility: Eye,
};

const PANELS: Record<TabId, (props: PanelProps) => JSX.Element> = {
  flows: FlowsPanel,
  roles: RolesPanel,
  rules: RulesPanel,
  simulator: SimulatorPanel,
  visibility: VisibilityPanel,
};

function isTab(value: string | null): value is TabId {
  return value !== null && (TAB_IDS as readonly string[]).includes(value);
}

function AccessAdmin() {
  const t = useAccessT();
  const { t: tc } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { config, loading, error, mutate } = useAdminAccess();
  const { message, report } = useFlash(t.saved);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const rawTab = params.get('tab');
  const tab: TabId = isTab(rawTab) ? rawTab : 'flows';

  const selectTab = (next: TabId, focus = false) => {
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
    if (focus) tabRefs.current[next]?.focus();
  };

  // Roving focus between tabs: arrows move, Home/End jump (WAI-ARIA tabs pattern).
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TAB_IDS.indexOf(tab);
    const target =
      e.key === 'ArrowRight' ? TAB_IDS[(i + 1) % TAB_IDS.length]
      : e.key === 'ArrowLeft' ? TAB_IDS[(i - 1 + TAB_IDS.length) % TAB_IDS.length]
      : e.key === 'Home' ? TAB_IDS[0]
      : e.key === 'End' ? TAB_IDS[TAB_IDS.length - 1]
      : null;
    if (!target) return;
    e.preventDefault();
    selectTab(target, true);
  };

  const Panel = PANELS[tab];

  return (
    <>
      <Flash message={message} />
      <h2 className="text-sm font-semibold tracking-widest uppercase text-[var(--text-primary)] mb-4">{t.nav.access}</h2>

      <div role="tablist" aria-label={t.nav.access} className="flex flex-wrap gap-2 mb-6">
        {TAB_IDS.map((id) => {
          const Icon = TAB_ICONS[id];
          const selected = id === tab;
          return (
            <button
              key={id}
              ref={(el) => { tabRefs.current[id] = el; }}
              id={`access-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`access-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(id)}
              onKeyDown={handleKeyDown}
              className={`inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                selected
                  ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {t.tabs[id]}
            </button>
          );
        })}
      </div>

      <div id={`access-panel-${tab}`} role="tabpanel" aria-labelledby={`access-tab-${tab}`} className="min-w-0">
        {loading && !config ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{tc.common.loading}</div>
        ) : !config ? (
          <div role="alert" className="bg-[var(--bg-card)] border border-[var(--accent-sum)] rounded-md p-4 text-sm text-[var(--accent-sum)]">
            {error ?? t.loadFailed}
          </div>
        ) : (
          <Panel config={config} mutate={mutate} report={report} />
        )}
      </div>
    </>
  );
}

export default function AdminAccessPage() {
  return (
    <AdminLayout>
      <Suspense fallback={null}>
        <AccessAdmin />
      </Suspense>
    </AdminLayout>
  );
}
