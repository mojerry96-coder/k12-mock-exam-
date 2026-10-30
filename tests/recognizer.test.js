// On-device recogniser: synthetic handwriting laid out like the pencil reveal, then roughened with
// seeded jitter, slant, per-symbol size changes and hand variants that are not templates.
import { test, expect } from 'vitest';
import { recognizeOnDevice } from '../src/lib/recognizer/index.js';
import { samplePath } from '../src/lib/recognizer/path.js';
import { layoutRow } from '../src/lib/glyphs.js';
import { MathModel } from '../src/lib/editor/model.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

// Writes `text` as world-unit strokes, the way a learner's ink arrives from the sheet.
function write(text, { seed = 1, scale = 0.45, slant = 0.12, jitter = 1.6, wobble = 0.12, swap = {} } = {}) {
  const r = rng(seed);
  const laid = [];
  layoutRow(MathModel.fromText(text).root, 0, laid);
  const strokes = [];
  let glyph = null;
  laid.forEach((s) => {
    if (!s.d) return;
    if (s.newGlyph) glyph = { k: 1 + (r() - 0.5) * 2 * wobble, dx: (r() - 0.5) * 6, dy: (r() - 0.5) * 6 };
    const paths = swap[s.d] ?? [s.d];
    for (const d of paths) {
      strokes.push(samplePath(d).map((p) => {
        const gx = s.x + p.x * glyph.k + glyph.dx, gy = s.y + p.y * glyph.k + glyph.dy;
        return { x: 120 + (gx - slant * gy) * scale + (r() - 0.5) * jitter, y: 300 + gy * scale + (r() - 0.5) * jitter };
      }));
    }
  });
  return strokes;
}

const cases = ['2', '-3', 'm=2', 'm=4/2', 'm=(6-2)/(3-1)', 'm=(5+10)/(-2-3)', '15/5', '0.5', '3/8', 'm=-15/5', 'y=2x+1', '(7-1)/(4-1)=2', '6800', '11/12', '9×4'];

test.each(cases)('reads %s', (text) => {
  for (const seed of [1, 2, 3]) {
    const { expression, confidence } = recognizeOnDevice(write(text, { seed }));
    expect(expression, `seed ${seed}`).toBe(text);
    expect(confidence).toBeGreaterThan(0.5);
  }
});

test('reads other hands: plain 1, crossed 7, one-stroke 4, two-stroke 5', () => {
  const swap = {
    'M10 30 L26 14 L26 100': ['M24 14 L25 100'],
    'M8 14 L48 14 L22 100': ['M8 14 L48 14 L22 100', 'M16 60 L40 58'],
    'M36 14 L8 72 L52 72': ['M40 100 L40 14 L8 72 L54 72'],
    'M40 42 L40 100': [],
    'M47 14 L17 14 L13 50 C23 42 39 43 46 56 C54 71 49 96 29 99 C19 100 12 95 8 89': ['M17 14 L13 50 C23 42 39 43 46 56 C54 71 49 96 29 99 C19 100 12 95 8 89', 'M18 13 L48 15'],
  };
  expect(recognizeOnDevice(write('147/57', { seed: 4, swap })).expression).toBe('147/57');
});

test('size, position and payload shape do not matter', () => {
  const ink = write('m=(6-2)/(3-1)', { seed: 9, scale: 1.1, slant: 0 });
  const payload = ink.map((s) => ({ x: s.map((p) => p.x + 300), y: s.map((p) => p.y + 900) }));
  expect(recognizeOnDevice(payload).expression).toBe('m=(6-2)/(3-1)');
  expect(recognizeOnDevice(write('m=(6-2)/(3-1)', { seed: 9, scale: 0.25 })).expression).toBe('m=(6-2)/(3-1)');
});

test('÷ is not mistaken for a fraction, and nothing written gives nothing', () => {
  expect(recognizeOnDevice(write('8÷2', { seed: 5 })).expression).toBe('8÷2');
  expect(recognizeOnDevice([])).toMatchObject({ expression: '', confidence: 0 });
});

test('a scribble comes back with low confidence, for the candidate to fix', () => {
  const r = rng(7);
  const scribble = [Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 3 + r() * 30, y: 200 + Math.sin(i) * 25 + r() * 30 }))];
  const out = recognizeOnDevice(scribble);
  expect(out.confidence).toBeLessThan(0.8);
});

test('recogniser choice: host first, then Mathpix when connected, falling back to this device', async () => {
  const { chooseRecognizer } = await import('../src/lib/recognition.js');
  const payload = { strokes: write('m=4/2', { seed: 3 }).map((s) => ({ x: s.map((p) => p.x), y: s.map((p) => p.y) })) };
  const host = { recognizeInk: async () => ({ expression: 'm=9' }) };
  expect(await chooseRecognizer({ host }).recognize(payload)).toMatchObject({ expression: 'm=9', engine: 'host' });

  const api = { recognize: async () => ({ expression: 'm=4/2', confidence: 0.97 }) };
  const mathpix = chooseRecognizer({ api, serverRecognition: true });
  expect(mathpix.engine).toBe('mathpix');
  expect(await mathpix.recognize(payload)).toMatchObject({ expression: 'm=4/2', engine: 'mathpix' });

  const offline = chooseRecognizer({ api: { recognize: async () => { throw new Error('fetch failed'); } }, serverRecognition: true });
  expect(await offline.recognize(payload)).toMatchObject({ expression: 'm=4/2', engine: 'builtin' });

  const aborted = chooseRecognizer({ api: { recognize: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } }, serverRecognition: true });
  await expect(aborted.recognize(payload)).rejects.toThrow();

  const none = chooseRecognizer({ api, serverRecognition: false });
  expect(none.engine).toBe('builtin');
  expect(await none.recognize(payload)).toMatchObject({ expression: 'm=4/2', engine: 'builtin' });
});

test('a device recogniser reads each line while the layout keeps stacked fractions', async () => {
  const { recognizeWithLines, cleanLine } = await import('../src/lib/recognizer/index.js');
  const ink = write('m=(6-2)/(3-1)', { seed: 2 });
  // A stand-in for the browser's recogniser: it answers from where the line sits on the page.
  const ys = ink.flat().map((p) => p.y), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const readLine = async (line) => {
    const y = line.flat().reduce((s, p) => s + p.y, 0) / line.flat().length;
    const x = Math.min(...line.flat().map((p) => p.x));
    return x < 160 ? 'm =' : y < mid ? '6 − 2' : '3 – 1';
  };
  expect(await recognizeWithLines(ink, readLine, 'system')).toMatchObject({ expression: 'm=(6-2)/(3-1)', engine: 'system' });
  // A line it can't read falls back to the built-in reader.
  const partial = await recognizeWithLines(ink, async (line) => (Math.min(...line.flat().map((p) => p.x)) < 160 ? '' : 'nope?!'), 'system');
  expect(partial.engine).toBe('system+builtin');
  expect(partial.expression.startsWith('m=')).toBe(true);
  expect(cleanLine(' M = 2 X 3 ')).toBe('m=2×3');
  expect(cleanLine('y = 2x + 1')).toBe('y=2x+1');
  expect(cleanLine('6 − 2 : 2')).toBe('6-2÷2');
});

test('the browser Handwriting Recognition API is used when present, and missing when not', async () => {
  const sys = await import('../src/lib/recognizer/system.js?fake');
  const added = [];
  globalThis.HandwritingStroke = class { constructor() { this.points = []; } addPoint(p) { this.points.push(p); } };
  const nav = {
    queryHandwritingRecognizer: async () => ({ textAlternatives: true }),
    createHandwritingRecognizer: async () => ({ startDrawing: (hints) => ({ addStroke: (s) => added.push([hints.graphemeSet.includes('×'), s.points.length]), getPrediction: async () => [{ text: '4/2' }], clear() {} }) }),
  };
  const reader = await sys.systemLineReader(nav);
  expect(await reader([[{ x: 0, y: 0 }, { x: 5, y: 9 }]])).toBe('4/2');
  expect(added).toEqual([[true, 2]]);
  delete globalThis.HandwritingStroke;
  const none = await import('../src/lib/recognizer/system.js?none');
  expect(await none.systemLineReader({})).toBeNull();
  expect(none.systemPenText({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('Scribble');
  expect(none.systemPenText({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10 })).toBe('Windows pen input');
  expect(none.systemPenText({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 })).toBe('stylus handwriting');
  expect(none.systemPenText({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 })).toBeNull();
});

test('recogniser choice uses the device recogniser before the built-in one, and survives its failure', async () => {
  const { chooseRecognizer } = await import('../src/lib/recognition.js');
  const payload = { strokes: write('15/5', { seed: 6 }).map((s) => ({ x: s.map((p) => p.x), y: s.map((p) => p.y) })) };
  const sys = chooseRecognizer({ serverRecognition: false, systemReader: async () => 'x' });
  expect(sys.engine).toBe('system');
  const ok = chooseRecognizer({ systemReader: async (line) => (line.length > 1 ? '15' : '5') });
  expect(await ok.recognize(payload)).toMatchObject({ expression: '15/5', engine: 'system' });
  const broken = chooseRecognizer({ systemReader: async () => { throw new Error('not allowed'); } });
  expect((await broken.recognize(payload)).expression).toBe('15/5');
});
