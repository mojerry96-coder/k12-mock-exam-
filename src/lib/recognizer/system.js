// The device's own handwriting recognition, wherever it exists.
//
// 1. The browser's Handwriting Recognition API (navigator.createHandwritingRecognizer): today in
//    Chrome on ChromeOS, and in any browser or platform that adds it. It reads one line of strokes;
//    the layout step in ./index.js still finds stacked fractions and asks it for each line.
// 2. Operating-system pen-to-text in text fields: Scribble on iPad (Apple Pencil), pen handwriting on
//    Windows, stylus handwriting on Android. No web API exposes these to a drawing canvas, so they
//    work in the answer box and in the converted-maths editor (see MathEditor's `penText`).
const GRAPHEMES = [...'0123456789+-×÷=().x/my'];

let reader; // undefined until first asked; then a function or null
export async function systemLineReader(nav = globalThis.navigator) {
  if (reader !== undefined) return reader;
  reader = null;
  try {
    if (typeof nav?.createHandwritingRecognizer !== 'function' || typeof globalThis.HandwritingStroke !== 'function') return reader;
    const constraint = { languages: ['en'] };
    const query = nav.queryHandwritingRecognizer ?? nav.queryHandwritingRecognizerSupport;
    if (query && !(await query.call(nav, constraint))) return reader;
    const recognizer = await nav.createHandwritingRecognizer(constraint);
    reader = async (strokes) => {
      const drawing = recognizer.startDrawing({ recognitionType: 'text', inputType: 'stylus', alternatives: 1, graphemeSet: GRAPHEMES });
      try {
        let t = 0;
        for (const s of strokes) {
          const stroke = new globalThis.HandwritingStroke();
          for (const p of s) stroke.addPoint({ x: p.x, y: p.y, t: (t += 8) });
          drawing.addStroke(stroke);
          t += 150;
        }
        const predictions = await drawing.getPrediction();
        return predictions?.[0]?.text ?? '';
      } finally { drawing.clear?.(); }
    };
  } catch { reader = null; }
  return reader;
}

// Which system pen-to-text this device has for text fields, if any.
export function systemPenText(nav = globalThis.navigator) {
  if (!nav) return null;
  const ua = nav.userAgent || '';
  const touch = (nav.maxTouchPoints || 0) > 0;
  if (/iPad/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'Scribble';
  if (/Android/.test(ua) && touch) return 'stylus handwriting';
  if (/Windows/.test(ua) && touch) return 'Windows pen input';
  return null;
}
