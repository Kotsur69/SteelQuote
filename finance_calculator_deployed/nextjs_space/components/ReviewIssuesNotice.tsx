'use client';

import { positionReviewIssues, type ReviewableItem } from '@/lib/offerReview';
import { describeReviewIssue, reviewStrings } from '@/lib/reviewMessages';
import type { AppSettings } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';

interface NoticeItem extends ReviewableItem {
  grade?: string;
  thickness?: number;
  width?: number;
  length?: number;
}

interface Props {
  items: NoticeItem[] | undefined;
  settings: AppSettings;
  language: string;
}

// Only the dimensions that are present, so a missing width/length never prints "undefined".
function dimensions(item: NoticeItem): string {
  return [item.thickness, item.width, item.length]
    .filter((d): d is number => typeof d === 'number' && d > 0)
    .join('×');
}

// Lists every position that is below the price guidelines (margin / base PGL) with the
// concrete value and the threshold it missed. Renders nothing when all positions are fine.
export default function ReviewIssuesNotice({ items, settings, language }: Props) {
  // Until /api/settings resolves, `settings` is DEFAULT_SETTINGS - flags computed against it
  // would flicker or be wrong, so show nothing yet.
  const { settingsLoaded } = useCurrency();
  const list = settingsLoaded ? (items ?? []) : [];
  const s = reviewStrings(language);
  const flagged = list
    .map((item, idx) => ({ item, idx, issues: positionReviewIssues(item, settings) }))
    .filter((entry) => entry.issues.length > 0);

  if (flagged.length === 0) return null;

  return (
    <div
      role="status"
      className="mt-3 rounded border border-[#f59e0b] bg-[rgba(245,158,11,0.08)] px-3 py-2 text-[11px] font-mono text-[var(--text-primary)]"
    >
      <p className="font-semibold">⚠️ {s.belowGuidelines(flagged.length, list.length)}</p>
      <ul className="mt-1 space-y-0.5">
        {flagged.map(({ item, idx, issues }) => (
          <li key={idx}>
            #{idx + 1} {item.type}
            {item.grade ? ` ${item.grade}` : ''}
            {dimensions(item) ? ` ${dimensions(item)}` : ''}
            {': '}
            {issues.map((issue) => describeReviewIssue(issue, s)).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
