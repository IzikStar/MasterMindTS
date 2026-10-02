import {
  isPossibleFeedback,
  isValidCode,
  randomCode,
  score,
  type Code,
  type Feedback,
  type Rules,
} from './code';
import { solverFrom, type Turn } from './solver';

export const MAX_TURNS = 10;

export type Status = 'playing' | 'won' | 'lost';

/** You try to crack a hidden code. Pure state, no DOM, so it can be tested. */
export class CodebreakerGame {
  readonly turns: Turn[] = [];
  status: Status = 'playing';
  hintsUsed = 0;

  constructor(
    readonly rules: Rules,
    readonly secret: Code = randomCode(rules),
  ) {}

  /** Why a guess can't be submitted, or null if it can. */
  problemWith(guess: readonly (number | null)[]): string | null {
    if (guess.some((c) => c === null)) return 'Fill all four slots first.';
    if (!isValidCode(guess as Code, this.rules)) return 'Each color can appear only once in this mode.';
    return null;
  }

  submit(guess: Code): Feedback {
    if (this.status !== 'playing') throw new Error('Game is over');
    const problem = this.problemWith(guess);
    if (problem) throw new Error(problem);
    const feedback = score(guess, this.secret, this.rules.colors);
    this.turns.push({ guess, feedback });
    if (feedback.black === this.rules.pegs) this.status = 'won';
    else if (this.turns.length >= MAX_TURNS) this.status = 'lost';
    return feedback;
  }

  /** How many secrets are still possible given what you have learned. */
  possibleCount(): number {
    return solverFrom(this.turns, this.rules).remaining.length;
  }

  /** The guess Knuth's algorithm would play now. */
  hint(): Code {
    this.hintsUsed++;
    return solverFrom(this.turns, this.rules).nextGuess()!;
  }
}

/** The computer tries to crack your code; you score its guesses (or let it score itself). */
export class CodemakerGame {
  readonly turns: Turn[] = [];
  status: Status | 'contradiction' = 'playing';
  current: Code | null;

  constructor(
    readonly rules: Rules,
    /** If set, guesses are scored automatically against it. */
    readonly secret: Code | null = null,
  ) {
    this.current = solverFrom([], rules).nextGuess();
  }

  autoFeedback(): Feedback | null {
    return this.secret && this.current ? score(this.current, this.secret, this.rules.colors) : null;
  }

  respond(feedback: Feedback): void {
    if (this.status !== 'playing' || !this.current) throw new Error('Game is over');
    if (!isPossibleFeedback(feedback, this.rules.pegs)) throw new Error('That feedback is impossible.');
    this.turns.push({ guess: this.current, feedback });
    if (feedback.black === this.rules.pegs) {
      this.status = 'won';
      this.current = null;
      return;
    }
    const solver = solverFrom(this.turns, this.rules);
    this.current = solver.nextGuess();
    if (!this.current) this.status = 'contradiction';
    else if (this.turns.length >= MAX_TURNS) this.status = 'lost';
  }

  /** Takes back the last answer (useful after a contradiction). */
  undo(): void {
    if (this.turns.length === 0) return;
    const last = this.turns.pop()!;
    this.current = last.guess;
    this.status = 'playing';
  }

  remainingCount(): number {
    return solverFrom(this.turns, this.rules).remaining.length;
  }
}
