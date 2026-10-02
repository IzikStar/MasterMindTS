import { allCodes, feedbackKey, score, type Code, type Feedback, type Rules } from './code';

export interface Turn {
  readonly guess: Code;
  readonly feedback: Feedback;
}

/** Codes that would have produced exactly the feedback seen so far. */
export function consistentCodes(history: readonly Turn[], rules: Rules, pool = allCodes(rules)): Code[] {
  const key = history.map((t) => feedbackKey(t.feedback));
  return pool.filter((code) =>
    history.every((t, i) => feedbackKey(score(t.guess, code, rules.colors)) === key[i]),
  );
}

/**
 * Every code under one rule set, numbered, with the feedback of every
 * (guess, secret) pair precomputed. 1296 x 1296 = 1.7M bytes for the classic
 * game, built once and shared, so the solver's inner loop is a table lookup.
 */
class CodeSpace {
  readonly codes: Code[];
  readonly table: Uint8Array;
  private readonly ids = new Map<string, number>();

  constructor(readonly rules: Rules) {
    this.codes = allCodes(rules);
    const n = this.codes.length;
    this.table = new Uint8Array(n * n);
    this.codes.forEach((code, i) => this.ids.set(code.join(), i));
    for (let g = 0; g < n; g++) {
      for (let s = g; s < n; s++) {
        const key = feedbackKey(score(this.codes[g], this.codes[s], rules.colors));
        this.table[g * n + s] = key;
        this.table[s * n + g] = key; // scoring is symmetric
      }
    }
  }

  id(code: Code): number {
    const id = this.ids.get(code.join());
    if (id === undefined) throw new Error(`Illegal code ${code.join()}`);
    return id;
  }

  private static cache = new Map<string, CodeSpace>();

  static for(rules: Rules): CodeSpace {
    const key = `${rules.pegs}/${rules.colors}/${rules.allowRepeats}`;
    let space = CodeSpace.cache.get(key);
    if (!space) CodeSpace.cache.set(key, (space = new CodeSpace(rules)));
    return space;
  }
}

const MAX_KEY = 100; // feedbackKey = black * 10 + white

/**
 * Knuth's minimax ("The computer as master mind", 1977).
 *
 * For every legal guess, split the remaining candidates by the feedback they
 * would return and look at the biggest group: the worst case if we play that
 * guess. Pick the guess whose worst case is smallest. Ties go to a guess that
 * could itself be the secret (so it might win right now), then to the
 * lexicographically first one, which keeps the solver deterministic.
 *
 * In classic Mastermind (4 pegs, 6 colors, repeats allowed) this cracks any
 * of the 1296 codes in at most 5 guesses.
 */
export class KnuthSolver {
  private readonly space: CodeSpace;
  private candidates: number[];

  constructor(rules: Rules) {
    this.space = CodeSpace.for(rules);
    this.candidates = this.space.codes.map((_, i) => i);
  }

  get remaining(): readonly Code[] {
    return this.candidates.map((i) => this.space.codes[i]);
  }

  /** Narrows the candidates after a guess was scored. */
  record(guess: Code, feedback: Feedback): void {
    const n = this.space.codes.length;
    const row = this.space.id(guess) * n;
    const key = feedbackKey(feedback);
    this.candidates = this.candidates.filter((c) => this.space.table[row + c] === key);
  }

  /** The next guess, or null if no code matches the feedback (someone made a mistake). */
  nextGuess(): Code | null {
    const { codes, rules } = this.space;
    if (this.candidates.length === 0) return null;
    if (this.candidates.length <= 2) return codes[this.candidates[0]];
    if (this.candidates.length === codes.length && isClassic(rules)) return [0, 0, 1, 1];
    return codes[this.minimax()];
  }

  private minimax(): number {
    const { codes, table } = this.space;
    const n = codes.length;
    const isCandidate = new Uint8Array(n);
    for (const c of this.candidates) isCandidate[c] = 1;
    const buckets = new Uint16Array(MAX_KEY);

    let best = this.candidates[0];
    let bestWorst = Infinity;
    for (let g = 0; g < n; g++) {
      buckets.fill(0);
      const row = g * n;
      let worst = 0;
      for (const c of this.candidates) {
        const size = ++buckets[table[row + c]];
        if (size > worst) {
          worst = size;
          if (worst > bestWorst) break; // can't beat the current best
        }
      }
      if (worst < bestWorst || (worst === bestWorst && isCandidate[g] && !isCandidate[best])) {
        best = g;
        bestWorst = worst;
      }
    }
    return best;
  }
}

/** Knuth proved 1122 (two of one color, two of another) is an optimal opening for the classic game. */
const isClassic = (r: Rules): boolean => r.pegs === 4 && r.colors === 6 && r.allowRepeats;

/** Plays a full game against a known secret. Returns every guess, the last one being the secret. */
export function solve(secret: Code, rules: Rules): Code[] {
  const solver = new KnuthSolver(rules);
  const guesses: Code[] = [];
  for (;;) {
    const guess = solver.nextGuess();
    if (!guess) throw new Error('No consistent code left');
    guesses.push(guess);
    const fb = score(guess, secret, rules.colors);
    if (fb.black === rules.pegs) return guesses;
    solver.record(guess, fb);
  }
}

/** Builds a solver that already knows the given history. */
export function solverFrom(history: readonly Turn[], rules: Rules): KnuthSolver {
  const solver = new KnuthSolver(rules);
  for (const t of history) solver.record(t.guess, t.feedback);
  return solver;
}
