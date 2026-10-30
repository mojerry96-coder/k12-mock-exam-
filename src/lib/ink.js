// Ink geometry. Strokes live in a persistent world space where the sheet is WORLD units wide,
// so resizing, rotating or zooming only changes the view transform, never the stored ink.
export const WORLD = 1000;

export const toWorld = (px, py, rect) => ({ x: (px / rect.width) * WORLD, y: (py / rect.width) * WORLD });
export const toView = (pt, rect) => ({ x: (pt.x / WORLD) * rect.width, y: (pt.y / WORLD) * rect.width });

function segDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Geometric eraser: indices of strokes that the eraser point touches.
export function strokesHit(strokes, p, radius) {
  const hit = [];
  strokes.forEach((s, idx) => {
    for (let k = 0; k < s.length; k++) {
      const a = s[k], b = s[k + 1] || s[k];
      if (segDistance(p, a, b) <= radius) { hit.push(idx); break; }
    }
  });
  return hit;
}

export function bounds(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// Palm rejection: while a pen is active (or was used recently) touches are ignored, and large
// contact areas are treated as palms. Finger drawing must be enabled explicitly.
export class PointerFilter {
  constructor() { this.lastPenAt = -Infinity; }
  accept(e, { fingerDrawing, now = Date.now() }) {
    if (e.pointerType === 'pen') { this.lastPenAt = now; return true; }
    if (e.pointerType === 'mouse') return true;
    if (!fingerDrawing) return false;
    if (now - this.lastPenAt < 1500) return false;
    if ((e.width || 0) > 40 || (e.height || 0) > 40) return false;
    return e.isPrimary !== false;
  }
}

// Recognition payload: strokes as x/y arrays plus their bounding box, in world units.
export function recognitionPayload(strokes) {
  return {
    strokes: strokes.map((s) => ({ x: s.map((p) => Math.round(p.x * 10) / 10), y: s.map((p) => Math.round(p.y * 10) / 10) })),
    bbox: bounds(strokes),
  };
}

// The ink a candidate has written since the last conversion: strokes[from..] are not yet typeset.
export const pendingFrom = (conversions) => conversions.reduce((m, c) => Math.max(m, c.to), 0);
