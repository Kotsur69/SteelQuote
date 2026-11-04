import { describe, expect, test } from 'vitest';
import { isGradeMissing } from '@/lib/gradeValidation';

describe('isGradeMissing', () => {
  test.each(['', '   ', '—', '-', '–', ' — ', undefined, null, 42])(
    'treats %j as no grade',
    grade => {
      expect(isGradeMissing(grade)).toBe(true);
    },
  );

  test.each(['S235JR+N', 'DX51D', ' P355GH ', 'S355J2-H'])('accepts a real grade %j', grade => {
    expect(isGradeMissing(grade)).toBe(false);
  });
});
