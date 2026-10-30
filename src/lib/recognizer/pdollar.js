// $P point-cloud recogniser (Vatavu, Anthony & Wobbrock, 2012). A symbol is a cloud of points: stroke
// order, direction and count don't matter, which suits handwriting (a 5 in one stroke or two, a 4
// drawn open or closed). Clouds are resampled, scaled uniformly (aspect is kept, so 1, / and ( stay
// distinct) and centred, then matched greedily against every template.
export const N = 32;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) d += dist(pts[i - 1], pts[i]);
  return d;
}

function resample(input, n) {
  const pts = input.map((p) => ({ ...p }));
  const interval = pathLength(pts) / (n - 1);
  if (!(interval > 0)) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const out = [{ ...pts[0] }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].id !== pts[i - 1].id) continue;
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d;
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), id: pts[i].id };
      out.push(q);
      pts.splice(i, 0, q);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

function normalise(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  const scaled = pts.map((p) => ({ x: (p.x - x0) / size, y: (p.y - y0) / size, id: p.id }));
  const cx = scaled.reduce((s, p) => s + p.x, 0) / scaled.length, cy = scaled.reduce((s, p) => s + p.y, 0) / scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

// strokes: [[{x, y}, …], …] in any units → a normalised cloud of N points.
export function cloud(strokes) {
  const pts = [];
  strokes.forEach((s, id) => s.forEach((p) => pts.push({ x: p.x, y: p.y, id })));
  return normalise(resample(pts, N));
}

function cloudDistance(a, b, start) {
  const matched = new Array(N).fill(false);
  let sum = 0, i = start;
  do {
    let min = Infinity, index = -1;
    for (let j = 0; j < N; j++) {
      if (matched[j]) continue;
      const d = dist(a[i], b[j]);
      if (d < min) { min = d; index = j; }
    }
    matched[index] = true;
    sum += (1 - ((i - start + N) % N) / N) * min;
    i = (i + 1) % N;
  } while (i !== start);
  return sum;
}

function greedyMatch(a, b) {
  const step = Math.floor(N ** 0.5);
  let min = Infinity;
  for (let i = 0; i < N; i += step) min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  return min;
}

// Best and runner-up labels with a 0–1 score ($P's own scaling of the match distance).
export function classify(points, templates) {
  const best = new Map();
  for (const t of templates) {
    const d = greedyMatch(points, t.points);
    if (!best.has(t.name) || d < best.get(t.name)) best.set(t.name, d);
  }
  const ranked = [...best].sort((a, b) => a[1] - b[1]).map(([name, d]) => ({ name, score: Math.max(0, (2 - d) / 2) }));
  return { ...ranked[0], runnerUp: ranked[1] ?? null };
}
