import { useId } from 'react';

const W = 420, H = 340, PAD = { l: 40, r: 16, t: 18, b: 34 };

// Equal unit scale on both axes so steepness on screen is honest, ranges grown to fill the box
// (the practice build's layout). In the exam the graph is fixed: it shows exactly what the question
// states and never reacts to the candidate's working.
function layout(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  let x0 = Math.min(0, Math.min(...xs) - 1), x1 = Math.max(0, Math.max(...xs) + 1);
  let y0 = Math.min(0, Math.min(...ys) - 1), y1 = Math.max(0, Math.max(...ys) + 1);
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
  const unit = Math.min(pw / (x1 - x0), ph / (y1 - y0));
  const growX = Math.floor(pw / unit - (x1 - x0)), growY = Math.floor(ph / unit - (y1 - y0));
  if (x0 < 0 && x1 > 0) { x0 -= Math.floor(growX / 2); x1 += Math.ceil(growX / 2); } else x1 += growX;
  if (y0 < 0 && y1 > 0) { y0 -= Math.floor(growY / 2); y1 += Math.ceil(growY / 2); } else y1 += growY;
  const span = Math.max(x1 - x0, y1 - y0);
  const step = span > 28 ? 5 : span > 16 ? 2 : 1;
  return { x0, x1, y0, y1, step, X: (x) => PAD.l + (x - x0) * unit, Y: (y) => PAD.t + ph - (y - y0) * unit };
}

const fmt = (v) => (v < 0 ? `−${-v}` : `${v}`);

export function Graph({ points }) {
  const clip = useId().replace(/:/g, '');
  const g = layout(points);
  const { X, Y } = g;
  const [[ax, ay], [bx, by]] = points;
  const ticksX = [], ticksY = [];
  for (let x = Math.ceil(g.x0 / g.step) * g.step; x <= g.x1; x += g.step) ticksX.push(x);
  for (let y = Math.ceil(g.y0 / g.step) * g.step; y <= g.y1; y += g.step) ticksY.push(y);
  const axisX = g.y0 <= 0 && g.y1 >= 0 ? Y(0) : Y(g.y0);
  const axisY = g.x0 <= 0 && g.x1 >= 0 ? X(0) : X(g.x0);
  const right = X(g.x1), top = Y(g.y1), bottom = Y(g.y0), left = X(g.x0);
  // Point labels flip side near the edges so they always stay inside the plot.
  const label = (x, y, other) => {
    const px = X(x), py = Y(y);
    const flipX = px > right - 70, below = py < top + 24 || (y < other && py < bottom - 24);
    return { x: flipX ? px - 12 : px + 12, y: below ? py + 26 : py - 12, anchor: flipX ? 'end' : 'start' };
  };
  const la = label(ax, ay, by), lb = label(bx, by, ay);

  return (
    <figure className="graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fixed graph: a line through (${fmt(ax)}, ${fmt(ay)}) and (${fmt(bx)}, ${fmt(by)}).`} preserveAspectRatio="xMidYMid meet">
        <defs><clipPath id={clip}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
        {ticksX.map((x) => <line key={`gx${x}`} className="grid" x1={X(x)} y1={top} x2={X(x)} y2={bottom} />)}
        {ticksY.map((y) => <line key={`gy${y}`} className="grid" x1={left} y1={Y(y)} x2={right} y2={Y(y)} />)}
        <line className="axis" x1={left} y1={axisX} x2={right} y2={axisX} />
        <line className="axis" x1={axisY} y1={bottom} x2={axisY} y2={top} />
        {/* numbers sit along the bottom and left edges, clear of the line and points */}
        {ticksX.map((x) => <text key={`tx${x}`} className="tick" x={X(x)} y={bottom + 24} textAnchor="middle">{fmt(x)}</text>)}
        {ticksY.map((y) => <text key={`ty${y}`} className="tick" x={left - 10} y={Y(y) + 6} textAnchor="end">{fmt(y)}</text>)}
        <g clipPath={`url(#${clip})`}><line className="target" x1={X(ax)} y1={Y(ay)} x2={X(bx)} y2={Y(by)} /></g>
        <circle className="pt" cx={X(ax)} cy={Y(ay)} r="7" />
        <circle className="pt" cx={X(bx)} cy={Y(by)} r="7" />
        <text className="pt-label" x={la.x} y={la.y} textAnchor={la.anchor}>({fmt(ax)}, {fmt(ay)})</text>
        <text className="pt-label" x={lb.x} y={lb.y} textAnchor={lb.anchor}>({fmt(bx)}, {fmt(by)})</text>
      </svg>
    </figure>
  );
}
