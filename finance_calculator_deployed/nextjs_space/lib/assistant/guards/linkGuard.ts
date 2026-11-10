// Link guard (docs/ai-assistant-plan.md 9.1 point 3): the model's text has no exfiltration
// channel. Markdown images are removed outright (an image URL is fetched by the browser without
// a click, which is how prompt-injected answers leak data), external URLs are dropped, and only
// links to the app's own pages survive. Links the user should follow are built by the server
// (offer cards, footer) - the model does not need to write any.

const INTERNAL_PREFIXES = ['/offers', '/calculator', '/analytics', '/asystent', '/senior', '/admin'];

function isInternal(href: string): boolean {
  // "//host" is protocol-relative, i.e. external.
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  return INTERNAL_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));
}

export interface LinkGuardResult {
  text: string;
  /** Images, external links and bare URLs taken out. */
  removed: number;
}

export function sanitizeLinks(input: string): LinkGuardResult {
  let removed = 0;

  // ![alt](url) -> nothing.
  let text = input.replace(/!\[[^\]]*\]\([^)]*\)/g, () => {
    removed++;
    return '';
  });

  // [label](url) -> kept only for internal pages, otherwise just the label.
  text = text.replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (whole, label: string, href: string) => {
    if (isInternal(href)) return whole;
    removed++;
    return label;
  });

  // Bare external URLs and raw HTML tags.
  text = text.replace(/\b(?:https?:\/\/|www\.)[^\s<>)\]]+/gi, () => {
    removed++;
    return '';
  });
  text = text.replace(/<\/?[a-z][^>]*>/gi, () => {
    removed++;
    return '';
  });

  return { text, removed };
}
