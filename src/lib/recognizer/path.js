// Samples the absolute M / L / C paths used by the glyph table into points (no DOM needed).
export function samplePath(d, steps = 14) {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out = [];
  let i = 0, cmd = 'M', cur = { x: 0, y: 0 };
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLC]/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === 'M' || cmd === 'L') {
      cur = { x: num(), y: num() };
      out.push(cur);
      if (cmd === 'M') cmd = 'L';
    } else if (cmd === 'C') {
      const p0 = cur, p1 = { x: num(), y: num() }, p2 = { x: num(), y: num() }, p3 = { x: num(), y: num() };
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        out.push({
          x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
        });
      }
      cur = p3;
    } else break;
  }
  return out;
}
