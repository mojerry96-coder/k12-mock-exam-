// Structured maths editor model: rows of characters and structures with real slots.
//   Row  = Node[]
//   Node = {k:'c', v} | {k:'frac', num, den} | {k:'sqrt', body} | {k:'pow', exp}
// Cursor = {path: [[nodeIndex, slot], ...], i}; selection is an anchor index in the cursor's row.
export const SLOTS = { frac: ['num', 'den'], sqrt: ['body'], pow: ['exp'] };
const OPERAND = /^[0-9a-z.]$/i;

const clone = (row) => row.map((n) => (n.k === 'c' ? { ...n } : Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Array.isArray(v) ? clone(v) : v]))));

export class MathModel {
  constructor(root = []) {
    this.root = root;
    this.cursor = { path: [], i: root.length };
    this.anchor = null;
  }

  static fromText(text) { return new MathModel(parseText(text)); }

  snapshot() { return { root: clone(this.root), cursor: { path: this.cursor.path.map((p) => [...p]), i: this.cursor.i } }; }
  restore(s) { this.root = clone(s.root); this.cursor = { path: s.cursor.path.map((p) => [...p]), i: s.cursor.i }; this.anchor = null; }

  rowAt(path = this.cursor.path) {
    let row = this.root;
    for (const [idx, slot] of path) row = row[idx][slot];
    return row;
  }
  get row() { return this.rowAt(); }
  isEmpty() { return this.root.length === 0; }
  clear() { this.root = []; this.cursor = { path: [], i: 0 }; this.anchor = null; }
  setCursor(path, i) { this.cursor = { path: path.map((p) => [...p]), i: Math.max(0, Math.min(i, this.rowAt(path).length)) }; this.anchor = null; }

  // ── selection (within one row) ──
  selection() {
    if (this.anchor === null || this.anchor === this.cursor.i) return null;
    return [Math.min(this.anchor, this.cursor.i), Math.max(this.anchor, this.cursor.i)];
  }
  selectAll() { this.cursor = { path: [], i: this.root.length }; this.anchor = 0; }
  deleteSelection() {
    const sel = this.selection();
    if (!sel) return false;
    this.row.splice(sel[0], sel[1] - sel[0]);
    this.cursor.i = sel[0];
    this.anchor = null;
    return true;
  }

  // ── insertion ──
  insert(ch) {
    this.deleteSelection();
    if (ch === '/') return this.insertFraction();
    if (ch === '^') return this.insertPower();
    if (ch === '√') return this.insertSqrt();
    // "=" while inside a fraction finishes it: m = 6−2 / 3−1 = 2 can be typed in one go.
    if (ch === '=') {
      while (this.cursor.path.length && ['num', 'den'].includes(this.cursor.path.at(-1)[1])) {
        const [idx] = this.cursor.path.at(-1);
        this.cursor = { path: this.cursor.path.slice(0, -1), i: idx + 1 };
      }
    }
    this.row.splice(this.cursor.i, 0, { k: 'c', v: ch });
    this.cursor.i++;
  }

  insertFraction() {
    this.deleteSelection();
    // In a numerator, "/" (or a/b) moves down to the denominator rather than nesting a fraction.
    const last = this.cursor.path.at(-1);
    if (last?.[1] === 'num') {
      const base = this.cursor.path.slice(0, -1);
      const node = this.rowAt(base)[last[0]];
      this.cursor = { path: [...base, [last[0], 'den']], i: node.den.length };
      return;
    }
    const row = this.row;
    // The numerator is everything typed since the last "=" (or an open bracket), so 6 − 2 then "/"
    // puts all of 6 − 2 on top, as a learner writing a gradient expects.
    let start = this.cursor.i;
    for (let depth = 0; start > 0; start--) {
      const n = row[start - 1];
      if (n.k !== 'c') continue;
      if (n.v === ')') depth++;
      else if (n.v === '(') { if (depth === 0) break; depth--; } else if (n.v === '=' && depth === 0) break;
    }
    let num = row.splice(start, this.cursor.i - start);
    if (num.length >= 2 && num[0].v === '(' && num[num.length - 1].v === ')' && operandStart(num, num.length) === 0) num = num.slice(1, -1);
    const node = { k: 'frac', num, den: [] };
    row.splice(start, 0, node);
    this.cursor = { path: [...this.cursor.path, [start, num.length ? 'den' : 'num']], i: 0 };
  }

  insertSqrt() {
    this.deleteSelection();
    const node = { k: 'sqrt', body: [] };
    this.row.splice(this.cursor.i, 0, node);
    this.cursor = { path: [...this.cursor.path, [this.cursor.i, 'body']], i: 0 };
  }

  insertPower() {
    this.deleteSelection();
    const node = { k: 'pow', exp: [] };
    this.row.splice(this.cursor.i, 0, node);
    this.cursor = { path: [...this.cursor.path, [this.cursor.i, 'exp']], i: 0 };
  }

  // ── deletion ──
  backspace() {
    if (this.deleteSelection()) return;
    const { path, i } = this.cursor;
    const row = this.row;
    if (i > 0) {
      const prev = row[i - 1];
      if (prev.k === 'c') { row.splice(i - 1, 1); this.cursor.i--; return; }
      if (SLOTS[prev.k].every((s) => prev[s].length === 0)) { row.splice(i - 1, 1); this.cursor.i--; return; }
      const last = SLOTS[prev.k].at(-1);
      this.cursor = { path: [...path, [i - 1, last]], i: prev[last].length };
      return;
    }
    if (!path.length) return;
    const [idx, slot] = path.at(-1);
    const parentPath = path.slice(0, -1);
    const node = this.rowAt(parentPath)[idx];
    const slots = SLOTS[node.k];
    const k = slots.indexOf(slot);
    if (k > 0) { this.cursor = { path: [...parentPath, [idx, slots[k - 1]]], i: node[slots[k - 1]].length }; return; }
    // At the start of the first slot: remove an empty structure, otherwise step out to its left.
    if (slots.every((s) => node[s].length === 0)) this.rowAt(parentPath).splice(idx, 1);
    this.cursor = { path: parentPath, i: idx };
  }

  // ── navigation ──
  left(extend = false) {
    if (extend) { this.anchor ??= this.cursor.i; if (this.cursor.i > 0) this.cursor.i--; return; }
    this.anchor = null;
    const { path, i } = this.cursor;
    if (i > 0) {
      const prev = this.row[i - 1];
      if (prev.k === 'c') { this.cursor.i--; return; }
      const last = SLOTS[prev.k].at(-1);
      this.cursor = { path: [...path, [i - 1, last]], i: prev[last].length };
      return;
    }
    if (!path.length) return;
    const [idx, slot] = path.at(-1);
    const parentPath = path.slice(0, -1);
    const node = this.rowAt(parentPath)[idx];
    const k = SLOTS[node.k].indexOf(slot);
    if (k > 0) { const s = SLOTS[node.k][k - 1]; this.cursor = { path: [...parentPath, [idx, s]], i: node[s].length }; return; }
    this.cursor = { path: parentPath, i: idx };
  }

  right(extend = false) {
    if (extend) { this.anchor ??= this.cursor.i; if (this.cursor.i < this.row.length) this.cursor.i++; return; }
    this.anchor = null;
    const { path, i } = this.cursor;
    if (i < this.row.length) {
      const next = this.row[i];
      if (next.k === 'c') { this.cursor.i++; return; }
      this.cursor = { path: [...path, [i, SLOTS[next.k][0]]], i: 0 };
      return;
    }
    if (!path.length) return;
    const [idx, slot] = path.at(-1);
    const parentPath = path.slice(0, -1);
    const node = this.rowAt(parentPath)[idx];
    const k = SLOTS[node.k].indexOf(slot);
    if (k < SLOTS[node.k].length - 1) { this.cursor = { path: [...parentPath, [idx, SLOTS[node.k][k + 1]]], i: 0 }; return; }
    this.cursor = { path: parentPath, i: idx + 1 };
  }

  // Up/down move between numerator and denominator of the innermost fraction.
  vertical(dir) {
    this.anchor = null;
    const path = this.cursor.path;
    for (let d = path.length - 1; d >= 0; d--) {
      const [idx, slot] = path[d];
      const target = dir < 0 ? (slot === 'den' ? 'num' : null) : (slot === 'num' ? 'den' : null);
      if (!target) continue;
      const base = path.slice(0, d);
      const node = this.rowAt(base)[idx];
      this.cursor = { path: [...base, [idx, target]], i: Math.min(this.cursor.i, node[target].length) };
      return true;
    }
    return false;
  }

  // Tab: next slot, or out of the structure. Returns false at the top level so focus can move on.
  tab(back = false) {
    this.anchor = null;
    const path = this.cursor.path;
    if (!path.length) return false;
    const [idx, slot] = path.at(-1);
    const parentPath = path.slice(0, -1);
    const node = this.rowAt(parentPath)[idx];
    const slots = SLOTS[node.k];
    const k = slots.indexOf(slot) + (back ? -1 : 1);
    if (k >= 0 && k < slots.length) this.cursor = { path: [...parentPath, [idx, slots[k]]], i: back ? node[slots[k]].length : 0 };
    else this.cursor = { path: parentPath, i: back ? idx : idx + 1 };
    return true;
  }

  home() { this.anchor = null; this.cursor.i = 0; }
  end() { this.anchor = null; this.cursor.i = this.row.length; }

  toText() { return serializeRow(this.root); }
  toSpeech() { return speakRow(this.root); }
}

// Start index of the operand ending at i: a run of digits/letters, or a balanced (...) group.
function operandStart(row, i) {
  if (i === 0) return 0;
  const prev = row[i - 1];
  if (prev.k !== 'c') return i - 1;
  if (prev.v === ')') {
    let depth = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (row[j].v === ')') depth++;
      if (row[j].v === '(') depth--;
      if (depth === 0) return j;
    }
    return i;
  }
  let j = i;
  while (j > 0 && row[j - 1].k === 'c' && OPERAND.test(row[j - 1].v)) j--;
  return j;
}

const simple = (s) => /^[0-9a-z.]+$/i.test(s) || /^-?\d*\.?\d+$/.test(s);
const wrap = (s) => (simple(s) ? s : `(${s})`);

export function serializeRow(row) {
  let out = '';
  row.forEach((n, idx) => {
    if (n.k === 'c') { out += n.v; return; }
    if (n.k === 'frac') {
      const f = `${wrap(serializeRow(n.num))}/${wrap(serializeRow(n.den))}`;
      const prev = row[idx - 1];
      // A stacked fraction directly after an operand is a product, never a run-on number.
      out += prev && (prev.k !== 'c' || OPERAND.test(prev.v) || prev.v === ')') ? `(${f})` : f;
      return;
    }
    if (n.k === 'sqrt') { out += `√(${serializeRow(n.body)})`; return; }
    if (n.k === 'pow') out += `^${wrap(serializeRow(n.exp))}`;
  });
  return out;
}

const SPOKEN = { '-': ' minus ', '+': ' plus ', '*': ' times ', '×': ' times ', '÷': ' divided by ', '=': ' equals ', '(': ' open bracket ', ')': ' close bracket ', '−': ' minus ', '/': ' over ' };
export function speakRow(row) {
  return row.map((n) => {
    if (n.k === 'c') return SPOKEN[n.v] ?? n.v;
    if (n.k === 'frac') return ` fraction, ${speakRow(n.num) || 'empty'}, over ${speakRow(n.den) || 'empty'}, end fraction `;
    if (n.k === 'sqrt') return ` square root of ${speakRow(n.body) || 'empty'}, end root `;
    return ` to the power ${speakRow(n.exp) || 'empty'} `;
  }).join('').replace(/\s+/g, ' ').trim();
}

// Linear text → structured row. "(6-2)/(3-1)" becomes a fraction with real slots.
export function parseText(text) {
  const chars = String(text).replace(/\s+/g, '').replace(/\*/g, '×').replace(/sqrt/gi, '√');
  const items = [];
  let i = 0;
  const readGroup = () => {
    // chars[i] === '('; returns inner text and advances past the matching ')'
    let depth = 0, j = i;
    for (; j < chars.length; j++) {
      if (chars[j] === '(') depth++;
      if (chars[j] === ')') depth--;
      if (depth === 0) break;
    }
    const inner = chars.slice(i + 1, j);
    i = j + 1;
    return inner;
  };
  const readOperand = () => {
    if (chars[i] === '(') return parseText(readGroup());
    let j = i;
    if (chars[j] === '-') j++;
    while (j < chars.length && OPERAND.test(chars[j])) j++;
    const s = chars.slice(i, j);
    i = j;
    return [...s].map((v) => ({ k: 'c', v }));
  };
  while (i < chars.length) {
    const c = chars[i];
    if (c === '√') {
      i++;
      const body = chars[i] === '(' ? parseText(readGroup()) : readOperand();
      items.push({ k: 'sqrt', body });
      continue;
    }
    if (c === '^') { i++; items.push({ k: 'pow', exp: readOperand() }); continue; }
    if (c === '/') {
      i++;
      const start = operandStart(items, items.length);
      let num = items.splice(start);
      if (num.length >= 2 && num[0].v === '(' && num.at(-1).v === ')') num = parseText(serializeRow(num.slice(1, -1)));
      items.push({ k: 'frac', num, den: readOperand() });
      continue;
    }
    items.push({ k: 'c', v: c });
    i++;
  }
  return items;
}
