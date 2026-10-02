import { describe, expect, it } from 'vitest';
import { allCodes, CLASSIC, sameCode, score } from '../src/engine/code';
import { consistentCodes, KnuthSolver, solve, solverFrom } from '../src/engine/solver';

describe('KnuthSolver', () => {
  it('opens with 1122', () => {
    expect(new KnuthSolver(CLASSIC).nextGuess()).toEqual([0, 0, 1, 1]);
  });

  it('cracks every one of the 1296 classic codes in at most 5 guesses', () => {
    const histogram = new Map<number, number>();
    for (const secret of allCodes(CLASSIC)) {
      const guesses = solve(secret, CLASSIC);
      expect(sameCode(guesses.at(-1)!, secret)).toBe(true);
      histogram.set(guesses.length, (histogram.get(guesses.length) ?? 0) + 1);
    }
    expect(Math.max(...histogram.keys())).toBeLessThanOrEqual(5);
    const total = [...histogram].reduce((sum, [n, count]) => sum + n * count, 0);
    expect(total / 1296).toBeLessThan(4.5);
  }, 60_000);

  it('cracks every one of the 360 no-repeat codes in at most 5 guesses', () => {
    const rules = { ...CLASSIC, allowRepeats: false };
    for (const secret of allCodes(rules)) {
      expect(solve(secret, rules).length).toBeLessThanOrEqual(5);
    }
  }, 60_000);

  it('only keeps codes consistent with the history', () => {
    const secret = [3, 1, 4, 1];
    const solver = new KnuthSolver(CLASSIC);
    const guess = solver.nextGuess()!;
    solver.record(guess, score(guess, secret));
    expect(solver.remaining.some((c) => sameCode(c, secret))).toBe(true);
    for (const code of solver.remaining) expect(score(guess, code)).toEqual(score(guess, secret));
    expect(solver.remaining).toEqual(consistentCodes([{ guess, feedback: score(guess, secret) }], CLASSIC));
  });

  it('returns null when the feedback contradicts itself', () => {
    const solver = solverFrom(
      [
        { guess: [0, 0, 0, 0], feedback: { black: 4, white: 0 } },
        { guess: [1, 1, 1, 1], feedback: { black: 4, white: 0 } },
      ],
      CLASSIC,
    );
    expect(solver.nextGuess()).toBeNull();
  });
});
