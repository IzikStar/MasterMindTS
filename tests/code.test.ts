import { describe, expect, it } from 'vitest';
import { allCodes, CLASSIC, isPossibleFeedback, isValidCode, score } from '../src/engine/code';

describe('score', () => {
  it('counts exact matches as black', () => {
    expect(score([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ black: 4, white: 0 });
  });

  it('counts misplaced colors as white', () => {
    expect(score([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ black: 0, white: 4 });
  });

  it('returns nothing for disjoint codes', () => {
    expect(score([0, 0, 1, 1], [2, 3, 4, 5])).toEqual({ black: 0, white: 0 });
  });

  it('does not double count repeated colors in the guess', () => {
    // Only one red in the secret, so three reds in the guess earn one peg.
    expect(score([0, 0, 0, 1], [0, 2, 3, 4])).toEqual({ black: 1, white: 0 });
    expect(score([2, 0, 0, 0], [0, 2, 3, 4])).toEqual({ black: 0, white: 2 });
  });

  it('does not double count repeated colors in the secret', () => {
    expect(score([0, 1, 2, 3], [1, 1, 1, 1])).toEqual({ black: 1, white: 0 });
    expect(score([1, 0, 0, 0], [0, 1, 1, 1])).toEqual({ black: 0, white: 2 });
  });

  it('is symmetric', () => {
    const codes = allCodes(CLASSIC);
    for (let i = 0; i < 300; i++) {
      const a = codes[(i * 37) % codes.length];
      const b = codes[(i * 101 + 7) % codes.length];
      expect(score(a, b)).toEqual(score(b, a));
    }
  });
});

describe('allCodes', () => {
  it('has 6^4 codes with repeats and 6*5*4*3 without', () => {
    expect(allCodes(CLASSIC)).toHaveLength(1296);
    expect(allCodes({ ...CLASSIC, allowRepeats: false })).toHaveLength(360);
  });
});

describe('isValidCode', () => {
  it('rejects wrong length, out of range and forbidden repeats', () => {
    expect(isValidCode([0, 1, 2], CLASSIC)).toBe(false);
    expect(isValidCode([0, 1, 2, 6], CLASSIC)).toBe(false);
    expect(isValidCode([0, 0, 1, 2], CLASSIC)).toBe(true);
    expect(isValidCode([0, 0, 1, 2], { ...CLASSIC, allowRepeats: false })).toBe(false);
  });
});

describe('isPossibleFeedback', () => {
  it('matches exactly the feedbacks that some pair of codes produces', () => {
    const codes = allCodes(CLASSIC);
    const seen = new Set<string>();
    for (const s of codes) seen.add(JSON.stringify(score(codes[0], s)));
    for (const g of codes.slice(0, 50)) for (const s of codes) seen.add(JSON.stringify(score(g, s)));
    for (let b = 0; b <= 4; b++) {
      for (let w = 0; w <= 4 - b; w++) {
        expect(isPossibleFeedback({ black: b, white: w }, 4)).toBe(
          seen.has(JSON.stringify({ black: b, white: w })),
        );
      }
    }
  });
});
