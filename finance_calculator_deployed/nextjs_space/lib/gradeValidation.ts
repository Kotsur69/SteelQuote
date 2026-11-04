// Shared "is a grade chosen?" rule for the calculator (Add to list) and the offers API.
// The calculator used to store an empty grade as the '—' placeholder, so dash-only values
// count as missing too - a plain non-empty check let them through.

const DASH_PLACEHOLDER = /^[-–—]+$/;

/** True when the value is not a usable steel grade (empty, whitespace or a dash placeholder). */
export function isGradeMissing(grade: unknown): boolean {
  if (typeof grade !== 'string') return true;
  const trimmed = grade.trim();
  return trimmed.length === 0 || DASH_PLACEHOLDER.test(trimmed);
}
