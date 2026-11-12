'use client';

// Renders the server-built parts of an answer (lib/assistant/blocks.ts): tables, a trend chart,
// offer cards, the definition footer with its links, clarification buttons and follow-up chips. Everything here is data the server computed -
// the component only lays it out, it never formats or derives a number.

import { useId } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BarChart3, Download, Info } from 'lucide-react';
import type { AnswerBlock, ClarifyBlock, FollowUpsBlock, FooterBlock, FooterLink, OffersBlock, TableBlock } from '@/lib/assistant/blocks';
import { MiniChart } from './MiniChart';
import type { PanelStrings } from './strings';

type BlocksProps = {
  blocks: AnswerBlock[];
  strings: PanelStrings;
  /**
   * Sends a clarification choice or follow-up chip as the next user message, with its signed
   * tool call. null = buttons are inert (old turn).
   */
  onChoose: ((value: string, followUp?: string) => void) | null;
};

// Footer links are server-built, but the panel still only follows its own two destinations.
const LINK_PREFIX: Record<FooterLink['kind'], string> = { panel: '/analytics?', download: '/api/assistant/export/' };
const isSafeLink = (link: FooterLink) => link.href.startsWith(LINK_PREFIX[link.kind]) && !link.href.includes('//');

const LINK_CLASS =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-accent underline-offset-2 transition-colors duration-150 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// A cell that starts with a digit (or a minus) is a figure: right-aligned, tabular.
const isNumeric = (cell: string) => /^-?\d/.test(cell);
// "1 234,00 EUR (5 308,64 PLN)" may break before the PLN part instead of forcing the table to scroll
// sideways in the 420 px panel (the spaces inside each amount are no-break spaces).
const MAX_NOWRAP_CHARS = 16;

function DataTable({ block }: { block: TableBlock }) {
  return (
    <figure className="m-0">
      {block.title && <figcaption className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-txt-muted">{block.title}</figcaption>}
      <div className="overflow-x-auto rounded-md border border-brd">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--accent-tint)]">
              {block.columns.map((column, i) => (
                <th key={column} scope="col" className={`px-3 py-2 text-xs font-semibold text-txt-secondary ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={`${r}-${row[0]}`} className="border-t border-brd">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-2 align-top ${c === 0 ? 'text-left text-txt-primary' : 'text-txt-value'} ${c > 0 && isNumeric(cell) ? `text-right font-medium tabular-nums ${cell.length <= MAX_NOWRAP_CHARS ? 'whitespace-nowrap' : 'min-w-[8.5rem]'}` : c > 0 ? 'text-right' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className="mt-1 text-xs text-txt-muted">{block.note}</p>}
    </figure>
  );
}

function OfferCards({ block, strings }: { block: OffersBlock; strings: PanelStrings }) {
  return (
    <div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {block.offers.map((offer) => (
          <li key={offer.id}>
            <Link
              href={offer.href}
              aria-label={`${strings.openOffer}: ${offer.name}`}
              className="group block rounded-md border border-brd bg-[var(--bg-input)] px-3 py-2.5 transition-colors duration-150 hover:border-brd-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-txt-primary">{offer.name}</div>
                  <div className="truncate text-xs text-txt-secondary">{offer.client ?? '-'}</div>
                </div>
                <ArrowUpRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-txt-muted transition-colors group-hover:text-accent" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="rounded-full border border-brd-hi px-2 py-0.5 font-medium text-txt-secondary">
                  {offer.status}
                  {offer.decision ? ` · ${offer.decision}` : ''}
                </span>
                <span className="font-semibold tabular-nums text-txt-value">{offer.tons}</span>
                <span className="tabular-nums text-txt-secondary">{offer.value}</span>
              </div>
              <dl className="m-0 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-txt-muted">
                {offer.owner && (
                  <div className="flex gap-1">
                    <dt>{strings.owner}:</dt>
                    <dd className="m-0 text-txt-secondary">{offer.owner}</dd>
                  </div>
                )}
                {offer.margin && (
                  <div className="flex gap-1">
                    <dt>{strings.margin}:</dt>
                    <dd className="m-0 tabular-nums text-txt-secondary">{offer.margin}</dd>
                  </div>
                )}
                {offer.created && (
                  <div className="flex gap-1">
                    <dt>{strings.created}:</dt>
                    <dd className="m-0 tabular-nums text-txt-secondary">{offer.created}</dd>
                  </div>
                )}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      {block.offers.length < block.total && <p className="mt-1 text-xs text-txt-muted">{strings.shown(block.offers.length, block.total)}</p>}
    </div>
  );
}

function FooterLinks({ links }: { links: FooterLink[] }) {
  const safe = links.filter(isSafeLink);
  if (safe.length === 0) return null;
  return (
    <div className="-mx-2 mt-1 flex flex-wrap gap-x-1">
      {safe.map((link) =>
        link.kind === 'panel' ? (
          <Link key={link.href} href={link.href} className={LINK_CLASS}>
            <BarChart3 aria-hidden className="h-3.5 w-3.5" />
            {link.label}
          </Link>
        ) : (
          // A file download, not a page: a plain anchor so the router does not try to render it.
          <a key={link.href} href={link.href} download className={LINK_CLASS}>
            <Download aria-hidden className="h-3.5 w-3.5" />
            {link.label}
          </a>
        )
      )}
    </div>
  );
}

function AnswerFooter({ block }: { block: FooterBlock }) {
  // The definitions are what makes a figure checkable, so they stay visible - small, not hidden.
  return (
    <aside className="flex gap-2 rounded-md bg-[var(--accent-tint)] px-3 py-2 text-xs leading-relaxed text-txt-secondary">
      <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <div className="min-w-0">
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {block.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {block.links && <FooterLinks links={block.links} />}
      </div>
    </aside>
  );
}

function ClarifyButtons({ block, onChoose }: { block: ClarifyBlock; onChoose: BlocksProps['onChoose'] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {block.options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={!onChoose}
          onClick={() => onChoose?.(option.value, option.followUp)}
          className="min-h-[44px] cursor-pointer rounded-full border border-accent px-4 text-sm font-medium text-accent transition-colors duration-150 hover:bg-[var(--accent-tint-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:border-brd disabled:text-txt-muted disabled:hover:bg-transparent"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FollowUpChips({ block, onChoose }: { block: FollowUpsBlock; onChoose: BlocksProps['onChoose'] }) {
  const questionId = useId();
  // An old turn's chips are not shown at all: they would point at a stale question.
  if (!onChoose) return null;
  return (
    // A group of actions, not a navigation landmark - a long chat would otherwise list one per answer.
    <div role="group" aria-labelledby={questionId}>
      <p id={questionId} className="mb-1.5 text-xs text-txt-muted">{block.question}</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {block.chips.map((chip) => (
          <li key={chip.label}>
            <button
              type="button"
              onClick={() => onChoose(chip.label, chip.followUp)}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-brd-hi bg-[var(--bg-input)] px-3.5 text-sm text-txt-primary transition-colors duration-150 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {chip.label}
              <ArrowRight aria-hidden className="h-3.5 w-3.5 text-txt-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnswerBlocks({ blocks, strings, onChoose }: BlocksProps) {
  if (blocks.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {blocks.map((block, i) => {
        const key = `${block.type}-${i}`;
        if (block.type === 'table') return <DataTable key={key} block={block} />;
        if (block.type === 'offers') return <OfferCards key={key} block={block} strings={strings} />;
        if (block.type === 'footer') return <AnswerFooter key={key} block={block} />;
        if (block.type === 'chart') return <MiniChart key={key} block={block} />;
        if (block.type === 'followups') return <FollowUpChips key={key} block={block} onChoose={onChoose} />;
        return <ClarifyButtons key={key} block={block} onChoose={onChoose} />;
      })}
    </div>
  );
}
