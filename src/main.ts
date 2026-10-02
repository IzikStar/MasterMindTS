import './style.css';
import { CLASSIC, isPossibleFeedback, type Code, type Feedback, type Rules } from './engine/code';
import { CodebreakerGame, CodemakerGame, MAX_TURNS, type Status } from './engine/game';

const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#a855f7' },
] as const;

const PEGS = CLASSIC.pegs;
const AUTO_DELAY_MS = 650;

type Mode = 'breaker' | 'maker';
type Slot = number | null;

interface State {
  mode: Mode;
  rules: Rules;
  message: string;
  tone: 'info' | 'good' | 'bad';
  /** Row that was just scored, so only it animates. */
  fresh: number | null;
  busy: boolean;
  // Codebreaker
  breaker: CodebreakerGame;
  draft: Slot[];
  cursor: number;
  hinted: boolean;
  /** "Solve it" was pressed, so the win belongs to the solver. */
  autoSolved: boolean;
  // Codemaker
  maker: CodemakerGame | null;
  makerSecret: Slot[];
  answer: Feedback;
}

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: settings just don't persist */
    }
  },
};

const initialRules: Rules = { ...CLASSIC, allowRepeats: storage.get('mm.repeats') !== 'off' };
const emptyRow = (): Slot[] => Array<Slot>(PEGS).fill(null);

const state: State = {
  mode: 'breaker',
  rules: initialRules,
  message: '',
  tone: 'info',
  fresh: null,
  busy: false,
  breaker: new CodebreakerGame(initialRules),
  draft: emptyRow(),
  cursor: 0,
  hinted: false,
  autoSolved: false,
  maker: null,
  makerSecret: emptyRow(),
  answer: { black: 0, white: 0 },
};

let autoTimer: number | undefined;

// ---------- actions ----------

function say(message: string, tone: State['tone'] = 'info'): void {
  state.message = message;
  state.tone = tone;
}

function stopAuto(): void {
  window.clearTimeout(autoTimer);
  state.busy = false;
}

function newGame(): void {
  stopAuto();
  state.fresh = null;
  if (state.mode === 'breaker') {
    state.breaker = new CodebreakerGame(state.rules);
    state.draft = emptyRow();
    state.cursor = 0;
    state.hinted = false;
    state.autoSolved = false;
    say(
      state.rules.allowRepeats
        ? 'Crack the hidden code. Colors may repeat.'
        : 'Crack the hidden code. Every color appears at most once.',
    );
  } else {
    state.maker = null;
    state.makerSecret = emptyRow();
    state.cursor = 0;
    say('Pick a secret code for the computer, or keep one in your head and score its guesses yourself.');
  }
  render();
}

function setMode(mode: Mode): void {
  if (state.mode === mode) return;
  state.mode = mode;
  newGame();
}

function toggleRepeats(): void {
  state.rules = { ...state.rules, allowRepeats: !state.rules.allowRepeats };
  storage.set('mm.repeats', state.rules.allowRepeats ? 'on' : 'off');
  newGame();
}

/** The row of slots the palette currently writes into, if any. */
function editableRow(): Slot[] | null {
  if (state.busy) return null;
  if (state.mode === 'breaker') return state.breaker.status === 'playing' ? state.draft : null;
  return state.maker ? null : state.makerSecret;
}

function pickColor(color: number): void {
  const row = editableRow();
  if (!row) return;
  row[state.cursor] = color;
  state.hinted = false;
  const nextEmpty = [...row.keys()].find((i) => i > state.cursor && row[i] === null) ?? row.indexOf(null);
  state.cursor = nextEmpty === -1 ? Math.min(state.cursor + 1, PEGS - 1) : nextEmpty;
  render();
}

function selectSlot(index: number): void {
  const row = editableRow();
  if (!row) return;
  if (state.cursor === index && row[index] !== null) row[index] = null;
  state.cursor = index;
  render();
}

function backspace(): void {
  const row = editableRow();
  if (!row) return;
  if (row[state.cursor] === null && state.cursor > 0) state.cursor--;
  row[state.cursor] = null;
  render();
}

function submitGuess(): void {
  const game = state.breaker;
  if (state.mode !== 'breaker' || game.status !== 'playing' || state.busy) return;
  const problem = game.problemWith(state.draft);
  if (problem) {
    say(problem, 'bad');
    render();
    return;
  }
  const fb = game.submit(state.draft as Code);
  state.fresh = game.turns.length - 1;
  state.draft = emptyRow();
  state.cursor = 0;
  state.hinted = false;
  const status = game.status as Status; // submit() changed it
  if (status === 'won') {
    const n = game.turns.length;
    if (state.autoSolved) say(`The solver cracked it in ${n} guess${n > 1 ? 'es' : ''}.`, 'good');
    else {
      const help = game.hintsUsed ? ` with ${game.hintsUsed} hint${game.hintsUsed > 1 ? 's' : ''}` : '';
      say(`Cracked in ${n} guess${n > 1 ? 'es' : ''}${help}!`, 'good');
    }
  } else if (status === 'lost') {
    say('Out of rows. The code is revealed above.', 'bad');
  } else {
    const left = game.possibleCount();
    say(`${pegsText(fb)}. ${left} possible code${left === 1 ? '' : 's'} left.`);
  }
  render();
}

function hint(): void {
  const game = state.breaker;
  if (state.mode !== 'breaker' || game.status !== 'playing' || state.busy) return;
  state.draft = [...game.hint()];
  state.cursor = 0;
  state.hinted = true;
  const left = game.possibleCount();
  say(
    left === 1
      ? 'Only one code fits everything so far. This is it.'
      : `Knuth's minimax pick: whatever the answer, it leaves the fewest of the ${left} possible codes.`,
  );
  render();
}

/** Lets the solver finish the current game, one guess at a time. */
function autoSolve(): void {
  const game = state.breaker;
  if (state.mode !== 'breaker' || game.status !== 'playing' || state.busy) return;
  state.busy = true;
  state.autoSolved = true;
  const step = (): void => {
    if (game.status !== 'playing') {
      state.busy = false;
      render();
      return;
    }
    state.busy = false;
    state.draft = [...game.hint()];
    submitGuess();
    state.busy = game.status === 'playing';
    render();
    if (state.busy) autoTimer = window.setTimeout(step, AUTO_DELAY_MS);
  };
  step();
}

function startMaker(): void {
  if (state.mode !== 'maker' || state.maker) return;
  const full = state.makerSecret.every((c) => c !== null);
  if (state.makerSecret.some((c) => c !== null) && !full) {
    say('Finish your secret code, or clear it to score the guesses yourself.', 'bad');
    render();
    return;
  }
  if (full && !state.rules.allowRepeats && new Set(state.makerSecret).size < PEGS) {
    say('Repeats are off, so use four different colors.', 'bad');
    render();
    return;
  }
  state.maker = new CodemakerGame(state.rules, full ? (state.makerSecret as Code) : null);
  state.answer = { black: 0, white: 0 };
  if (full) {
    say('The computer is guessing. It sees only the black and white pegs.');
    state.busy = true;
    autoTimer = window.setTimeout(autoRespond, AUTO_DELAY_MS);
  } else {
    say('Score the computer’s guess against the code in your head.');
  }
  render();
}

function autoRespond(): void {
  const game = state.maker;
  if (!game || game.status !== 'playing') return stopAuto();
  respond(game.autoFeedback()!);
  if (game.status === 'playing') autoTimer = window.setTimeout(autoRespond, AUTO_DELAY_MS);
  else stopAuto();
  render();
}

function respond(feedback: Feedback): void {
  const game = state.maker;
  if (!game || game.status !== 'playing') return;
  if (!isPossibleFeedback(feedback, PEGS)) {
    say('That score can’t happen: if three pegs are exact, the fourth can’t be a misplaced color.', 'bad');
    render();
    return;
  }
  game.respond(feedback);
  state.fresh = game.turns.length - 1;
  state.answer = { black: 0, white: 0 };
  const n = game.turns.length;
  const status = game.status as CodemakerGame['status']; // respond() changed it
  if (status === 'won') say(`Your code was cracked in ${n} guess${n > 1 ? 'es' : ''}.`, 'good');
  else if (status === 'contradiction')
    say('No code fits all of those scores, so one of them is off. Undo and check.', 'bad');
  else if (status === 'lost') say('Ten guesses and no luck. Did a score slip?', 'bad');
  else {
    const left = game.remainingCount();
    say(`${left} possible code${left === 1 ? '' : 's'} left. Score the next guess.`);
  }
  render();
}

function undoAnswer(): void {
  const game = state.maker;
  if (!game || game.secret || state.busy) return;
  game.undo();
  state.fresh = null;
  say('Last score taken back. Score that guess again.');
  render();
}

function adjust(kind: keyof Feedback, delta: number): void {
  const next = { ...state.answer, [kind]: state.answer[kind] + delta };
  if (next[kind] < 0 || next.black + next.white > PEGS) return;
  state.answer = next;
  render();
}

// ---------- rendering ----------

const app = document.querySelector<HTMLDivElement>('#app')!;

const pegsText = (fb: Feedback): string =>
  fb.black + fb.white === 0 ? 'No pegs' : `${fb.black} black, ${fb.white} white`;

function peg(color: Slot, opts: { slot?: number; active?: boolean; small?: boolean } = {}): string {
  const label = color === null ? 'empty' : COLORS[color].name;
  const style = color === null ? '' : ` style="--peg:${COLORS[color].hex}"`;
  const classes = [
    'peg',
    color === null ? 'empty' : '',
    opts.active ? 'active' : '',
    opts.small ? 'small' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (opts.slot === undefined)
    return `<span class="${classes}"${style} role="img" aria-label="${label}"></span>`;
  return `<button class="${classes}"${style} data-slot="${opts.slot}" aria-label="Slot ${opts.slot + 1}: ${label}"></button>`;
}

function pins(fb: Feedback | null): string {
  const kinds: string[] = [];
  if (fb) {
    for (let i = 0; i < fb.black; i++) kinds.push('black');
    for (let i = 0; i < fb.white; i++) kinds.push('white');
  }
  while (kinds.length < PEGS) kinds.push('none');
  const label = fb ? pegsText(fb) : 'not scored';
  return `<span class="pins" role="img" aria-label="${label}">${kinds.map((k) => `<i class="pin ${k}"></i>`).join('')}</span>`;
}

function boardRows(): string {
  const turns = state.mode === 'breaker' ? state.breaker.turns : (state.maker?.turns ?? []);
  const rows: string[] = [];
  for (let r = 0; r < MAX_TURNS; r++) {
    const turn = turns[r];
    const classes = ['row'];
    let pegsHtml: string;
    let pinsHtml: string;
    if (turn) {
      pegsHtml = turn.guess.map((c) => peg(c)).join('');
      pinsHtml = pins(turn.feedback);
      if (state.fresh === r) classes.push('fresh');
    } else if (r === turns.length && isLiveRow()) {
      classes.push('current');
      if (state.mode === 'breaker') {
        const editable = editableRow() !== null;
        pegsHtml = state.draft
          .map((c, i) => (editable ? peg(c, { slot: i, active: i === state.cursor }) : peg(c)))
          .join('');
        if (state.hinted) classes.push('hinted');
      } else {
        pegsHtml = state.maker!.current!.map((c) => peg(c)).join('');
        classes.push('thinking');
      }
      pinsHtml = pins(null);
    } else {
      pegsHtml = emptyRow()
        .map(() => peg(null))
        .join('');
      pinsHtml = pins(null);
      classes.push('future');
    }
    rows.push(
      `<li class="${classes.join(' ')}"><span class="num">${r + 1}</span><span class="pegs">${pegsHtml}</span>${pinsHtml}</li>`,
    );
  }
  return rows.join('');
}

function isLiveRow(): boolean {
  if (state.mode === 'breaker') return state.breaker.status === 'playing';
  return state.maker?.status === 'playing' && state.maker.current !== null;
}

function secretRow(): string {
  if (state.mode === 'breaker') {
    const game = state.breaker;
    const show = game.status !== 'playing';
    const slots = game.secret.map((c) =>
      show ? peg(c) : '<span class="peg hidden" aria-label="hidden">?</span>',
    );
    return `<div class="secret ${show ? 'revealed' : ''}"><span class="label">Secret</span><span class="pegs">${slots.join('')}</span></div>`;
  }
  if (!state.maker) {
    const editable = editableRow() !== null;
    const slots = state.makerSecret.map((c, i) =>
      editable ? peg(c, { slot: i, active: i === state.cursor }) : peg(c),
    );
    return `<div class="secret editing"><span class="label">Your code</span><span class="pegs">${slots.join('')}</span></div>`;
  }
  const secret = state.maker.secret;
  const slots = secret
    ? secret.map((c) => peg(c))
    : emptyRow().map(() => '<span class="peg hidden" aria-label="in your head">?</span>');
  return `<div class="secret revealed"><span class="label">${secret ? 'Your code' : 'In your head'}</span><span class="pegs">${slots.join('')}</span></div>`;
}

function palette(): string {
  const enabled = editableRow() !== null;
  return `<div class="palette" aria-label="Colors">${COLORS.map(
    (c, i) =>
      `<button class="swatch" style="--peg:${c.hex}" data-color="${i}" ${enabled ? '' : 'disabled'} aria-label="${c.name} (key ${i + 1})"><kbd>${i + 1}</kbd></button>`,
  ).join('')}</div>`;
}

function breakerControls(): string {
  const game = state.breaker;
  const playing = game.status === 'playing' && !state.busy;
  if (game.status !== 'playing') {
    return `<div class="actions"><button class="btn primary wide" data-action="new">Play again</button></div>`;
  }
  return `
    ${palette()}
    <div class="actions">
      <button class="btn ghost" data-action="back" ${playing ? '' : 'disabled'} aria-label="Delete">⌫</button>
      <button class="btn primary" data-action="check" ${playing ? '' : 'disabled'}>Check</button>
    </div>
    <div class="actions">
      <button class="btn" data-action="hint" ${playing ? '' : 'disabled'}>💡 Hint</button>
      <button class="btn" data-action="solve" ${playing ? '' : 'disabled'}>🤖 Solve it</button>
    </div>`;
}

function makerControls(): string {
  const game = state.maker;
  if (!game) {
    const any = state.makerSecret.some((c) => c !== null);
    return `
      ${palette()}
      <div class="actions">
        <button class="btn ghost" data-action="clear" ${any ? '' : 'disabled'}>Clear</button>
        <button class="btn primary" data-action="start">${any ? 'Start, score for me' : 'Start, I’ll score'}</button>
      </div>`;
  }
  if (game.status === 'won' || game.status === 'lost') {
    return `<div class="actions"><button class="btn primary wide" data-action="new">New code</button></div>`;
  }
  if (game.status === 'contradiction') {
    return `<div class="actions"><button class="btn primary wide" data-action="undo">Undo last score</button></div>`;
  }
  if (game.secret) {
    return `<div class="actions"><button class="btn wide" data-action="new">Stop</button></div>`;
  }
  const { black, white } = state.answer;
  const full = black + white >= PEGS;
  return `
    <div class="scorer">
      <div class="stepper">
        <span class="pin black big"></span><span class="what">Right color, right spot</span>
        <button class="btn round" data-adjust="black:-1" ${black ? '' : 'disabled'} aria-label="One less black">−</button>
        <output>${black}</output>
        <button class="btn round" data-adjust="black:1" ${full ? 'disabled' : ''} aria-label="One more black">+</button>
      </div>
      <div class="stepper">
        <span class="pin white big"></span><span class="what">Right color, wrong spot</span>
        <button class="btn round" data-adjust="white:-1" ${white ? '' : 'disabled'} aria-label="One less white">−</button>
        <output>${white}</output>
        <button class="btn round" data-adjust="white:1" ${full ? 'disabled' : ''} aria-label="One more white">+</button>
      </div>
    </div>
    <div class="actions">
      <button class="btn ghost" data-action="undo" ${game.turns.length ? '' : 'disabled'}>Undo</button>
      <button class="btn primary" data-action="score">Score</button>
    </div>`;
}

function render(): void {
  const breaker = state.mode === 'breaker';
  app.innerHTML = `
    <header class="top">
      <h1><span class="dot r"></span><span class="dot b"></span><span class="dot y"></span><span class="dot g"></span>MasterMind</h1>
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected="${breaker}" data-mode="breaker">You guess</button>
        <button role="tab" aria-selected="${!breaker}" data-mode="maker">Computer guesses</button>
      </nav>
    </header>
    <main class="layout">
      <section class="board" aria-label="Board">
        ${secretRow()}
        <ol class="rows">${boardRows()}</ol>
      </section>
      <aside class="panel">
        <p class="message ${state.tone}" role="status" aria-live="polite">${state.message}</p>
        ${breaker ? breakerControls() : makerControls()}
        <div class="settings">
          <label class="toggle"><input type="checkbox" data-action="repeats" ${state.rules.allowRepeats ? 'checked' : ''}/> Colors can repeat</label>
          <button class="btn link" data-action="new">New game</button>
        </div>
        <details class="how">
          <summary>How it works</summary>
          <p>The code is ${PEGS} pegs from ${COLORS.length} colors. After each guess, a <b>black</b> pin means a right color in the right spot and a <b>white</b> pin means a right color in the wrong spot. You get ${MAX_TURNS} tries.</p>
          <p><b>Hint</b> and <b>Solve it</b> use Donald Knuth’s 1977 minimax algorithm: it plays the guess whose worst-case answer leaves the fewest possible codes. With repeats allowed it never needs more than 5 guesses.</p>
          <p>Keys: <kbd>1</kbd>–<kbd>6</kbd> pick a color, <kbd>⌫</kbd> deletes, <kbd>Enter</kbd> checks, <kbd>H</kbd> hint.</p>
        </details>
      </aside>
    </main>
    <footer class="foot">
      <a href="https://github.com/IzikStar/MasterMindTS">Source on GitHub</a>
      <span>·</span>
      <a href="./legacy/index.html">The original version</a>
    </footer>`;
  if (state.fresh !== null)
    app.querySelector('.row.current, .row.fresh')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  state.fresh = null;
}

// ---------- events ----------

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, input');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const { mode, color, slot, action, adjust: adj } = el.dataset;
  if (mode) return setMode(mode as Mode);
  if (color !== undefined) return pickColor(Number(color));
  if (slot !== undefined) return selectSlot(Number(slot));
  if (adj) {
    const [kind, delta] = adj.split(':');
    return adjust(kind as keyof Feedback, Number(delta));
  }
  switch (action) {
    case 'new':
      return newGame();
    case 'check':
      return submitGuess();
    case 'back':
      return backspace();
    case 'hint':
      return hint();
    case 'solve':
      return autoSolve();
    case 'start':
      return startMaker();
    case 'clear':
      state.makerSecret = emptyRow();
      state.cursor = 0;
      return render();
    case 'score':
      return respond(state.answer);
    case 'undo':
      return undoAnswer();
    case 'repeats':
      return toggleRepeats();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= COLORS.length) return pickColor(n - 1);
  if (e.key === 'Backspace') return backspace();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!editableRow()) return;
    state.cursor = (state.cursor + (e.key === 'ArrowRight' ? 1 : PEGS - 1)) % PEGS;
    return render();
  }
  if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
    if (state.mode === 'breaker') return submitGuess();
    return state.maker ? respond(state.answer) : startMaker();
  }
  if (e.key.toLowerCase() === 'h') return hint();
});

newGame();
