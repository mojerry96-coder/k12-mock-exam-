import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => v * v * (3 - 2 * v); // S-curve for the window's sides
const easeInOut = (v) => (v < 0.5 ? 2 * v * v : 1 - ((-2 * v + 2) ** 2) / 2);
const easeIn = (v) => v * v * v; // the window speeds up as it pours into the button

// Copies of the panel used only while animating: no duplicate ids, no live video, not focusable.
function snapshot(el) {
  const copy = el.cloneNode(true);
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  copy.querySelectorAll('video').forEach((v) => {
    const img = document.createElement('img');
    img.src = v.getAttribute('poster') || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    v.replaceWith(img);
  });
  return copy;
}

/**
 * macOS "genie" between a panel and its button. The panel is drawn as thin horizontal strips; each
 * strip's width and position follow an S-curve from the panel's full width (top) down to the button
 * (bottom), so the sides bend into a funnel, and the strips then slide down through it into the
 * button. `t` runs 0 (open) → 1 (inside the button); opening plays it backwards. `from` lets a
 * reversed click carry on from wherever the last animation was instead of jumping.
 * Returns { stop(), t }: stop() removes the strips (the caller decides the panel's visibility).
 */
export function runGenie(el, button, direction, ms, done, from = direction === 'close' ? 0 : 1) {
  const r = el.getBoundingClientRect();
  const b = button.getBoundingClientRect();
  const { left: L, right: R, top: T, width: W, height: H, bottom: B } = r;
  const bx = b.left + b.width / 2;
  const dockY = Math.max(B, b.top + b.height * 0.35); // where the window disappears into the button
  const wt = Math.min(W, Math.max(22, b.width * 0.8)); // the funnel's narrowest width
  const N = Math.max(24, Math.min(110, Math.round(H / 6)));
  const sh = H / N;

  const layer = document.createElement('div');
  layer.className = 'genie-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const base = snapshot(el);
  const strips = [];
  for (let i = 0; i < N; i++) {
    const s = i === 0 ? base : base.cloneNode(true);
    Object.assign(s.style, {
      position: 'fixed', left: `${L}px`, top: `${T}px`, width: `${W}px`, height: `${H}px`, right: 'auto', bottom: 'auto',
      margin: '0', translate: 'none', scale: 'none', animation: 'none', transition: 'none', visibility: 'visible',
      transformOrigin: `0 ${i * sh}px`, pointerEvents: 'none', willChange: 'transform', // the strip's own top-left
      clipPath: `inset(${i * sh}px 0 ${Math.max(0, H - (i + 1) * sh - 0.8)}px 0)`, // tiny overlap hides seams
    });
    layer.appendChild(s);
    strips.push({ el: s, y0: T + i * sh });
  }
  // Inside a shadow root the strips must stay in it, or they lose the module's styles.
  const root = el.getRootNode();
  (root instanceof ShadowRoot ? root : document.body).appendChild(layer);
  el.style.visibility = 'hidden';

  const apply = (t) => {
    const funnel = easeInOut(clamp(t / 0.5)); // the sides bend in
    const slide = easeIn(clamp((t - 0.22) / 0.78)); // then everything pours down into the button
    const travel = dockY - T;
    const edges = (y) => {
      const k = funnel * smooth(clamp((y - T) / (dockY - T)));
      return [L + (bx - wt / 2 - L) * k, R + (bx + wt / 2 - R) * k];
    };
    for (const s of strips) {
      const y = s.y0 + slide * travel;
      // Match the curve at both the strip's top and bottom: scale to the average width and skew by
      // the left edge's slope, so neighbouring strips join into one smooth bent edge (no steps).
      const [lt, rt] = edges(y);
      const [lb, rb] = edges(y + sh);
      const sx = Math.max(0.002, ((rt - lt) + (rb - lb)) / 2 / W);
      const kx = (lb - lt) / sh;
      s.el.style.transform = `translate(${lt - L}px, ${y - s.y0}px) matrix(${sx}, 0, ${kx}, 1, 0, 0)`;
      s.el.style.opacity = y + sh / 2 > dockY ? '0' : '1';
    }
  };

  const to = direction === 'close' ? 1 : 0;
  const dur = ms * Math.abs(to - from);
  const start = performance.now();
  let t = from;
  let raf = 0;
  const frame = (now) => {
    const p = dur ? Math.min(1, (now - start) / dur) : 1;
    t = from + (to - from) * p;
    apply(t);
    if (p < 1) { raf = requestAnimationFrame(frame); return; }
    layer.remove();
    // Opening reveals the real panel; closing leaves it hidden until it unmounts, so it never
    // flashes back for a frame after being drawn into the button.
    if (direction === 'open') el.style.visibility = '';
    done?.();
  };
  apply(t);
  raf = requestAnimationFrame(frame);
  return { stop() { cancelAnimationFrame(raf); layer.remove(); }, get t() { return t; } };
}

/**
 * Mounts its child while open and plays the genie out of `anchor` (a ref to the button); on close
 * the panel pours back into the button before unmounting.
 * Usage: <Genie open={…} anchor={btnRef}>{(ref) => <section ref={ref}>…</section>}</Genie>
 */
export function Genie({ open, anchor, children, openMs = 560, closeMs = 500 }) {
  const [mounted, setMounted] = useState(open);
  const panel = useRef(null);
  const run = useRef(null);

  useLayoutEffect(() => { if (open) setMounted(true); }, [open]);

  useLayoutEffect(() => {
    const el = panel.current;
    const btn = anchor?.current;
    if (!mounted || !el) return;
    const prev = run.current;
    run.current = null;
    prev?.stop();
    if (!btn || reduced()) {
      el.style.visibility = '';
      if (!open) setMounted(false);
      return;
    }
    // Clicked again mid-animation: reverse from where it is rather than restarting.
    const from = prev ? prev.t : open ? 1 : 0;
    run.current = runGenie(el, btn, open ? 'open' : 'close', open ? openMs : closeMs, () => {
      run.current = null;
      if (!open) setMounted(false);
    }, from);
  }, [open, mounted]);

  useEffect(() => () => run.current?.stop(), []);

  if (!mounted) return null;
  return children(panel);
}
