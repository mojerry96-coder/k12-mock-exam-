// On-device handwriting recogniser for exam maths: digits, + − × ÷ = ( ) . /, m, x, y and stacked
// fractions. It runs in the browser on any device, offline, with no account or key. It is basic
// compared with a service such as Mathpix, so every result carries a confidence and the candidate
// always reviews and edits it; it never solves or checks anything.
//
// 1. Each stroke is measured; horizontal bars and dots are recognised by shape.
// 2. A bar with ink above and below it is a fraction: its numerator and denominator are read
//    recursively, then whatever is left and right of it.
// 3. Remaining strokes are grouped into symbols by horizontal overlap (= + 4 x 5 7 …), and each
//    group is either a structural symbol (− = ÷ .) or matched by $P against templates built from the
//    same glyph strokes the pencil reveal writes with.
import { G } from '../glyphs.js';
import { cloud, classify } from './pdollar.js';
import { samplePath } from './path.js';

// Extra hand variants beside each glyph in lib/glyphs.js.
const VARIANTS = {
  1: [['M26 14 L26 100'], ['M10 30 L26 14 L26 100', 'M12 100 L40 100']],
  4: [['M40 100 L40 14 L8 72 L52 72'], ['M30 14 L8 70 L52 70', 'M40 30 L40 100']],
  7: [['M8 14 L48 14 L22 100', 'M18 58 L44 58'], ['M8 22 L8 14 L48 14 L26 100']],
  9: [['M46 34 C44 19 35 14 27 14 C16 14 10 25 11 37 C12 48 21 54 31 52 C41 50 46 42 46 34', 'M46 30 L46 100']],
  2: [['M10 30 C14 16 40 10 46 30 C50 46 20 70 8 98 L50 98']],
  5: [['M17 14 L13 50 C23 42 39 43 46 56 C54 71 49 96 29 99 C19 100 12 95 8 89', 'M17 14 L47 14']],
  6: [['M42 14 C20 30 10 60 12 80 C14 100 46 104 48 80 C50 60 20 58 13 74']],
  8: [['M30 55 C10 50 12 14 30 14 C48 14 50 50 30 55 C8 60 10 100 30 100 C50 100 52 60 30 55']],
  0: [['M30 14 C4 14 4 100 30 100 C56 100 56 14 30 14']],
  x: [['M9 50 L38 100', 'M9 100 L38 50']],
  y: [['M9 50 C9 80 38 80 38 50 L38 100 C38 120 10 118 8 110']],
  m: [['M8 100 L8 50 C14 46 30 44 33 60 L33 100 M33 64 C36 48 58 44 59 64 L59 100']],
};
const VOCAB = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '×', '(', ')', '/', 'm', 'x', 'y'];

let templates = null;
function getTemplates() {
  if (templates) return templates;
  templates = [];
  const add = (name, paths) => templates.push({ name, points: cloud(paths.map((d) => samplePath(d))) });
  for (const ch of VOCAB) {
    const name = ch === '×' ? 'x' : ch; // × and x look the same; context decides below
    add(name, G[ch].d);
    for (const v of VARIANTS[ch] ?? []) add(name, v.flatMap((d) => d.split(/(?=M)/)));
  }
  return templates;
}

function measure(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  points.forEach((p, i) => {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    if (i) len += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
  });
  const chord = Math.hypot(points.at(-1).x - points[0].x, points.at(-1).y - points[0].y);
  return { points, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, len, chord };
}

const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function context(strokes) {
  const tall = strokes.filter((s) => !(s.h <= 0.32 * s.w && s.len <= 1.35 * s.chord + 1)).map((s) => Math.max(s.h, s.w * 0.6));
  const H = median(tall.filter((h) => h > 0)) || Math.max(...strokes.map((s) => s.w), 1);
  return {
    H,
    isDot: (s) => Math.max(s.w, s.h) < 0.2 * H,
    isBar: (s) => s.w >= 0.28 * H && s.h <= 0.32 * s.w && s.len <= 1.35 * s.chord + 0.05 * H,
  };
}

const wrap = (t) => (/^-?[0-9a-z.]+$/i.test(t) ? t : `(${t})`);

// Layout: a fraction bar (the widest bar with real ink, not just ÷ dots, above and below it) splits
// its region into left, numerator, denominator and right; anything else is one line of symbols.
function layout(strokes, ctx) {
  if (!strokes.length) return null;
  let best = null;
  for (const b of strokes) {
    if (!ctx.isBar(b) || b.w < 0.55 * ctx.H) continue;
    const pad = 0.12 * b.w;
    const over = (s) => s !== b && s.cx >= b.x0 - pad && s.cx <= b.x1 + pad;
    const above = strokes.filter((s) => over(s) && s.cy < b.cy - 0.1 * ctx.H && !ctx.isDot(s));
    const below = strokes.filter((s) => over(s) && s.cy > b.cy + 0.1 * ctx.H && !ctx.isDot(s));
    if (above.length && below.length && (!best || b.w > best.bar.w)) best = { bar: b, over };
  }
  if (!best) return { line: strokes };
  const { bar, over } = best;
  const num = strokes.filter((s) => over(s) && s.cy < bar.cy);
  const den = strokes.filter((s) => over(s) && s.cy > bar.cy);
  const rest = strokes.filter((s) => s !== bar && !num.includes(s) && !den.includes(s));
  return {
    left: layout(rest.filter((s) => s.cx < bar.cx), ctx), num: layout(num, ctx),
    den: layout(den, ctx), right: layout(rest.filter((s) => s.cx >= bar.cx), ctx),
  };
}

// Reads a layout tree to linear text, asking `readLine` for each line of symbols.
async function render(node, readLine) {
  if (!node) return '';
  if (node.line) return readLine(node.line);
  const [l, n, d, r] = await Promise.all([render(node.left, readLine), render(node.num, readLine), render(node.den, readLine), render(node.right, readLine)]);
  return `${l}${wrap(n)}/${wrap(d)}${r}`;
}
function renderSync(node, readLine) {
  if (!node) return '';
  if (node.line) return readLine(node.line);
  return `${renderSync(node.left, readLine)}${wrap(renderSync(node.num, readLine))}/${wrap(renderSync(node.den, readLine))}${renderSync(node.right, readLine)}`;
}

// The built-in line reader: strokes grouped into symbols, each named by shape or by $P.
function readSymbols(strokes, ctx, scores) {
  // Symbols: strokes belong together when they overlap horizontally, one sits within the other's
  // span (the upright of + or 4), or they touch (the arches of m). Dots join the nearest symbol.
  const groups = [];
  const sorted = [...strokes].sort((a, b) => a.x0 - b.x0);
  const minW = 0.18 * ctx.H, reach = 0.07 * ctx.H;
  const segDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const near = (p, st) => st.points.some((q, i) => segDist(p, q, st.points[i + 1] ?? q) < reach);
  const touches = (a, b) => [a.points[0], a.points.at(-1)].some((p) => near(p, b)) || [b.points[0], b.points.at(-1)].some((p) => near(p, a));
  const belongs = (g, s) => {
    const ov = Math.min(g.x1, s.x1) - Math.max(g.x0, s.x0);
    const vClose = Math.min(g.y1, s.y1) - Math.max(g.y0, s.y0) > -0.5 * ctx.H;
    if (!vClose) return false;
    if (ov > 0.45 * Math.min(Math.max(g.x1 - g.x0, minW), Math.max(s.w, minW))) return true;
    if ((s.cx > g.x0 && s.cx < g.x1) || ((g.x0 + g.x1) / 2 > s.x0 && (g.x0 + g.x1) / 2 < s.x1)) return true;
    return g.strokes.some((t) => touches(t, s));
  };
  for (const s of sorted.filter((x) => !ctx.isDot(x))) {
    const g = groups.find((gr) => belongs(gr, s));
    if (g) { g.strokes.push(s); g.x0 = Math.min(g.x0, s.x0); g.x1 = Math.max(g.x1, s.x1); g.y0 = Math.min(g.y0, s.y0); g.y1 = Math.max(g.y1, s.y1); }
    else groups.push({ strokes: [s], x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 });
  }
  for (const dot of strokes.filter(ctx.isDot)) {
    const near = groups.find((g) => dot.cx >= g.x0 - 0.1 * ctx.H && dot.cx <= g.x1 + 0.1 * ctx.H && g.strokes.some(ctx.isBar));
    if (near) near.strokes.push(dot);
    else groups.push({ strokes: [dot], x0: dot.x0, x1: dot.x1, y0: dot.y0, y1: dot.y1 });
  }
  groups.sort((a, b) => a.x0 - b.x0);

  const symbols = groups.map((g) => {
    const bars = g.strokes.filter(ctx.isBar), dots = g.strokes.filter(ctx.isDot);
    if (dots.length === g.strokes.length) return { ch: '.', score: 0.8 };
    if (bars.length === g.strokes.length && bars.length === 1) return { ch: '-', score: 0.9 };
    if (bars.length === 2 && g.strokes.length === 2) return { ch: '=', score: 0.9 };
    if (bars.length === 1 && dots.length >= 1 && g.strokes.length === bars.length + dots.length) return { ch: '÷', score: 0.85 };
    const r = classify(cloud(g.strokes.map((s) => s.points)), getTemplates());
    // Calibrated on roughened glyphs: clear writing matches at 0.4–0.65, scribbles below 0.1.
    return { ch: r.name, score: Math.min(1, r.score / 0.45) };
  });
  // × and x share a shape: between numbers it is a times sign.
  symbols.forEach((s, i) => {
    if (s.ch !== 'x') return;
    const prev = symbols[i - 1]?.ch ?? '', next = symbols[i + 1]?.ch ?? '';
    if (/[0-9)]/.test(prev) && /[0-9(]/.test(next)) s.ch = '×';
  });
  symbols.forEach((s) => scores.push(s.score));
  return symbols.map((s) => s.ch).join('');
}

const toLists = (strokes) => strokes.map((s) => (Array.isArray(s) ? s : s.x.map((x, i) => ({ x, y: s.y[i] })))).filter((s) => s.length);

/**
 * strokes: [{ x: number[], y: number[] }] (the recognition payload) or [[{x, y}]].
 * Returns { expression, confidence (0–1), engine: 'builtin' }.
 */
export function recognizeOnDevice(strokes) {
  const lists = toLists(strokes);
  if (!lists.length) return { expression: '', confidence: 0, engine: 'builtin' };
  const measured = lists.map(measure);
  const ctx = context(measured), scores = [];
  const expression = renderSync(layout(measured, ctx), (line) => readSymbols(line, ctx, scores));
  const confidence = scores.length ? Math.min(...scores) : 0;
  return { expression, confidence: Math.round(confidence * 100) / 100, engine: 'builtin' };
}

// Text from a system recogniser, kept to the characters exam maths uses.
export function cleanLine(text) {
  return String(text ?? '').replace(/\s+/g, '').replace(/[−–—]/g, '-').replace(/[*✕✖]/g, '×').replace(/:/g, '÷')
    .replace(/[Xx](?=\d)|(?<=\d)[Xx]/g, (m, i, all) => (/\d/.test(all[i - 1] ?? '') && /\d/.test(all[i + 1] ?? '') ? '×' : 'x'))
    .replace(/[^0-9a-z+\-×÷=().\/]/gi, '').toLowerCase();
}

/**
 * Same layout (stacked fractions, left/right of them), but each line of symbols is read by
 * `readLine(strokes)` — a system recogniser such as the browser's — falling back to the built-in
 * reader for a line it can't read. Resolves to { expression, confidence, engine }.
 */
export async function recognizeWithLines(strokes, readLine, engine) {
  const lists = toLists(strokes);
  if (!lists.length) return { expression: '', confidence: 0, engine };
  const measured = lists.map(measure);
  const ctx = context(measured), scores = [];
  let fellBack = false;
  const expression = await render(layout(measured, ctx), async (line) => {
    let text = '';
    try { text = cleanLine(await readLine(line.map((s) => s.points))); } catch { text = ''; }
    if (text) { scores.push(0.9); return text; }
    fellBack = true;
    return readSymbols(line, ctx, scores);
  });
  const confidence = scores.length ? Math.min(...scores) : 0;
  return { expression, confidence: Math.round(confidence * 100) / 100, engine: fellBack ? `${engine}+builtin` : engine };
}
