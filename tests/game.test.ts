import { describe, expect, it } from 'vitest';
import { CLASSIC } from '../src/engine/code';
import { CodebreakerGame, CodemakerGame, MAX_TURNS } from '../src/engine/game';

describe('CodebreakerGame', () => {
  it('wins when the guess matches the secret', () => {
    const game = new CodebreakerGame(CLASSIC, [1, 2, 3, 4]);
    expect(game.submit([4, 3, 2, 1])).toEqual({ black: 0, white: 4 });
    expect(game.status).toBe('playing');
    game.submit([1, 2, 3, 4]);
    expect(game.status).toBe('won');
  });

  it('loses after the last row', () => {
    const game = new CodebreakerGame(CLASSIC, [1, 2, 3, 4]);
    for (let i = 0; i < MAX_TURNS; i++) game.submit([0, 0, 0, 0]);
    expect(game.status).toBe('lost');
    expect(() => game.submit([1, 2, 3, 4])).toThrow();
  });

  it('rejects incomplete guesses and repeats when they are off', () => {
    const game = new CodebreakerGame({ ...CLASSIC, allowRepeats: false }, [0, 1, 2, 3]);
    expect(game.problemWith([0, 1, null, 3])).toMatch(/Fill/);
    expect(game.problemWith([0, 0, 1, 2])).toMatch(/once/);
    expect(game.problemWith([0, 1, 2, 3])).toBeNull();
  });

  it('wins by following hints alone within five guesses', () => {
    const game = new CodebreakerGame(CLASSIC, [5, 3, 5, 0]);
    while (game.status === 'playing') game.submit(game.hint());
    expect(game.status).toBe('won');
    expect(game.turns.length).toBeLessThanOrEqual(5);
    expect(game.hintsUsed).toBe(game.turns.length);
  });

  it('counts the codes still possible', () => {
    const game = new CodebreakerGame(CLASSIC, [0, 1, 2, 3]);
    expect(game.possibleCount()).toBe(1296);
    game.submit([0, 1, 2, 3]);
    expect(game.possibleCount()).toBe(1);
  });
});

describe('CodemakerGame', () => {
  it('cracks a code it is told about only through feedback', () => {
    const secret = [2, 4, 4, 1];
    const auto = new CodemakerGame(CLASSIC, secret);
    while (auto.status === 'playing') auto.respond(auto.autoFeedback()!);
    expect(auto.status).toBe('won');
    expect(auto.turns.at(-1)!.guess).toEqual(secret);
  });

  it('detects contradictory feedback and allows undo', () => {
    const game = new CodemakerGame(CLASSIC);
    game.respond({ black: 0, white: 0 }); // no 0s or 1s
    game.respond({ black: 0, white: 0 });
    game.respond({ black: 0, white: 0 });
    expect(['contradiction', 'playing']).toContain(game.status);
    while (game.status === 'playing') game.respond({ black: 0, white: 0 });
    expect(game.status).toBe('contradiction');
    game.undo();
    expect(game.status).toBe('playing');
    expect(game.current).not.toBeNull();
  });

  it('refuses impossible feedback', () => {
    const game = new CodemakerGame(CLASSIC);
    expect(() => game.respond({ black: 3, white: 1 })).toThrow(/impossible/);
  });
});
