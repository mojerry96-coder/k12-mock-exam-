// Single-line pen strokes for every character the exam writes or reads (glyph units: baseline at
// y = 100, digits 14–100, lowercase 50–100). The pencil reveal (components/Handwriting.jsx) draws
// them; the on-device recogniser (lib/recognizer) learns its templates from them.
export const G = {
  0: { w: 58, d: ['M30 14 C14 14 8 38 8 56 C8 80 16 100 30 100 C45 100 51 78 51 56 C51 34 45 14 30 14'] },
  1: { w: 40, d: ['M10 30 L26 14 L26 100'] },
  2: { w: 56, d: ['M9 34 C11 20 21 13 31 14 C44 15 50 27 46 41 C42 55 25 72 8 99 L50 98'] },
  3: { w: 56, d: ['M10 24 C18 12 43 11 46 28 C48 41 36 50 24 53 C40 53 51 63 50 78 C49 96 29 104 9 93'] },
  4: { w: 58, d: ['M36 14 L8 72 L52 72', 'M40 42 L40 100'] },
  5: { w: 56, d: ['M47 14 L17 14 L13 50 C23 42 39 43 46 56 C54 71 49 96 29 99 C19 100 12 95 8 89'] },
  6: { w: 56, d: ['M45 18 C37 11 22 12 15 29 C8 46 8 70 12 84 C16 97 27 101 37 98 C48 93 51 77 45 67 C39 57 24 55 13 65'] },
  7: { w: 54, d: ['M8 14 L48 14 L22 100'] },
  8: { w: 56, d: ['M29 55 C14 51 11 39 12 29 C14 17 23 13 30 14 C39 15 46 21 46 31 C46 43 35 50 28 56 C16 64 9 74 11 86 C13 97 23 101 30 100 C41 99 50 92 49 80 C48 67 38 59 29 55'] },
  9: { w: 56, d: ['M46 34 C44 19 35 14 27 14 C16 14 10 25 11 37 C12 48 21 54 31 52 C41 50 46 42 46 34 L44 100'] },
  r: { w: 42, d: ['M10 50 L10 100', 'M10 70 C14 54 25 48 38 51'] },
  i: { w: 22, d: ['M11 52 L11 100', 'M11 32 L11.5 33.5'] },
  s: { w: 46, d: ['M38 55 C32 47 15 47 13 58 C11 69 38 71 39 85 C40 98 17 103 8 93'] },
  e: { w: 48, d: ['M10 75 L41 73 C43 58 34 49 25 50 C13 51 8 64 9 76 C10 91 21 100 31 99 C37 98 41 95 43 91'] },
  u: { w: 50, d: ['M10 50 L10 82 C10 95 19 100 28 99 C37 98 41 89 41 79', 'M41 50 L42 100'] },
  n: { w: 50, d: ['M10 50 L10 100', 'M10 69 C14 55 23 49 31 50 C38 51 41 58 41 69 L41 100'] },
  m: { w: 68, d: ['M8 50 L8 100', 'M8 68 C11 55 18 49 25 50 C31 51 33 58 33 67 L33 100', 'M33 67 C36 55 43 49 50 50 C56 51 59 58 59 67 L59 100'] },
  x: { w: 46, d: ['M9 50 L38 100', 'M38 50 L9 100'] },
  y: { w: 46, d: ['M9 50 L24 92', 'M38 50 L22 108 C19 118 11 120 6 115'] },
  a: { w: 50, d: ['M40 58 C34 49 16 48 11 62 C6 78 14 99 27 99 C36 99 40 90 41 80', 'M41 52 L41 100'] },
  b: { w: 52, d: ['M10 14 L10 100', 'M10 72 C14 55 26 49 34 51 C44 54 47 66 46 78 C45 92 36 100 27 99 C18 98 12 92 10 86'] },
  d: { w: 52, d: ['M41 58 C35 49 17 48 12 62 C7 78 15 99 28 99 C37 99 41 90 42 80', 'M42 14 L42 100'] },
  h: { w: 50, d: ['M10 14 L10 100', 'M10 69 C14 55 23 49 31 50 C38 51 41 58 41 69 L41 100'] },
  k: { w: 46, d: ['M10 14 L10 100', 'M38 50 L10 78', 'M18 70 L40 100'] },
  t: { w: 38, d: ['M18 26 L18 90 C18 98 24 101 32 98', 'M6 50 L34 50'] },
  c: { w: 44, d: ['M38 57 C33 48 19 48 13 59 C7 72 12 97 27 99 C33 100 37 97 40 93'] },
  '=': { w: 50, op: true, d: ['M7 62 L43 61', 'M7 80 L43 79'] },
  '-': { w: 44, op: true, d: ['M7 71 L37 70'] },
  '+': { w: 46, op: true, d: ['M23 53 L23 89', 'M6 71 L40 71'] },
  '×': { w: 44, op: true, d: ['M10 56 L34 86', 'M34 56 L10 86'] },
  '÷': { w: 46, op: true, d: ['M6 71 L40 71', 'M23 53 L23.5 54.5', 'M23 88 L23.5 89.5'] },
  '(': { w: 28, d: ['M22 8 C8 32 8 82 22 108'] },
  ')': { w: 28, d: ['M6 8 C20 32 20 82 6 108'] },
  '.': { w: 18, d: ['M8 97 L8.5 98.5'] },
  '/': { w: 44, d: ['M36 10 L8 106'] },
};
const OPS = '=+-×÷(';
const TRACK = 7, OP_PAD = 15;

// Lays a row out left to right (fractions: numerator, bar, denominator), in writing order.
export function layoutRow(row, base, out) {
  let x = 0;
  row.forEach((n, i) => {
    if (n.k === 'c') {
      const g = G[n.v];
      const prev = row[i - 1];
      const unary = n.v === '-' && (!prev || (prev.k === 'c' && OPS.includes(prev.v)));
      const pad = g?.op && !unary ? OP_PAD : 0;
      x += pad;
      if (g) g.d.forEach((d, k) => out.push({ d, x, y: base - 100, newGlyph: k === 0 }));
      else out.push({ text: n.v, x, y: base, newGlyph: true });
      x += (g ? g.w : 40) + TRACK + pad;
      return;
    }
    if (n.k === 'frac') {
      const num = [], den = [];
      const nw = layoutRow(n.num, base - 44, num);
      const dw = layoutRow(n.den, base + 70, den);
      const w = Math.max(nw, dw) + 18;
      num.forEach((s) => { s.x += x + (w - nw) / 2; });
      den.forEach((s) => { s.x += x + (w - dw) / 2; });
      out.push(...num, { d: `M0 0 C${w * 0.3} -1.5 ${w * 0.7} 1 ${w} -0.5`, x, y: base - 30, newGlyph: true }, ...den);
      x += w + TRACK;
      return;
    }
    // Roots and powers are rare in this step: write the body, then the sign or a raised exponent.
    const body = [];
    const bw = layoutRow(n.k === 'sqrt' ? n.body : n.exp, n.k === 'pow' ? base - 50 : base, body);
    if (n.k === 'sqrt') {
      out.push({ d: 'M2 72 L12 66 L24 104 L38 6', x, y: base - 100, newGlyph: true });
      body.forEach((s) => { s.x += x + 42; });
      out.push(...body, { d: `M0 0 L${bw + 6} 0`, x: x + 38, y: base - 94, newGlyph: false });
      x += bw + 50;
    } else {
      body.forEach((s) => { s.x += x; });
      out.push(...body);
      x += bw;
    }
  });
  return Math.max(0, x - TRACK);
}
