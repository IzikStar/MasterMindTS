/** A code is a fixed-length list of color indices (0 .. colors - 1). */
export type Code = readonly number[];

/** Black = right color in the right slot. White = right color in the wrong slot. */
export interface Feedback {
  readonly black: number;
  readonly white: number;
}

export interface Rules {
  readonly pegs: number;
  readonly colors: number;
  readonly allowRepeats: boolean;
}

export const CLASSIC: Rules = { pegs: 4, colors: 6, allowRepeats: true };

/**
 * Scores a guess against a secret.
 * Whites are counted as "colors in common" minus blacks, which handles
 * repeated colors correctly.
 */
export function score(guess: Code, secret: Code, colors = 6): Feedback {
  let black = 0;
  const guessCounts = new Array<number>(colors).fill(0);
  const secretCounts = new Array<number>(colors).fill(0);
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) black++;
    guessCounts[guess[i]]++;
    secretCounts[secret[i]]++;
  }
  let common = 0;
  for (let c = 0; c < colors; c++) common += Math.min(guessCounts[c], secretCounts[c]);
  return { black, white: common - black };
}

export function isValidCode(code: Code, rules: Rules): boolean {
  if (code.length !== rules.pegs) return false;
  if (code.some((c) => !Number.isInteger(c) || c < 0 || c >= rules.colors)) return false;
  return rules.allowRepeats || new Set(code).size === code.length;
}

/** Every legal code under the given rules, in lexicographic order. */
export function allCodes(rules: Rules): Code[] {
  const out: Code[] = [];
  const current: number[] = [];
  const walk = (): void => {
    if (current.length === rules.pegs) {
      out.push([...current]);
      return;
    }
    for (let c = 0; c < rules.colors; c++) {
      if (!rules.allowRepeats && current.includes(c)) continue;
      current.push(c);
      walk();
      current.pop();
    }
  };
  walk();
  return out;
}

export function randomCode(rules: Rules, rng: () => number = Math.random): Code {
  const codes = allCodes(rules);
  return codes[Math.floor(rng() * codes.length)];
}

/**
 * Whether a feedback can exist at all. With 4 pegs, "3 black + 1 white" is
 * impossible: if three pegs are right, the fourth can't be in a wrong slot.
 */
export function isPossibleFeedback(fb: Feedback, pegs: number): boolean {
  const total = fb.black + fb.white;
  if (fb.black < 0 || fb.white < 0 || total > pegs) return false;
  return !(fb.black === pegs - 1 && fb.white === 1);
}

export const feedbackKey = (fb: Feedback): number => fb.black * 10 + fb.white;

export const sameCode = (a: Code, b: Code): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
