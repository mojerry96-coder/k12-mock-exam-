import { useEffect, useRef } from 'react';
import { PointerFilter, strokesHit, toView, toWorld, WORLD } from '../lib/ink.js';

/**
 * Full-paper pen/finger surface (the practice build's InkSheet). Strokes are stored in sheet units
 * (lib/ink.js) so resizing or rotating never moves existing ink. Strokes before `hiddenBefore` have
 * been converted to typeset maths and are only drawn faintly when `showConverted` is on; the eraser
 * can't reach them (remove converted maths by editing it, or with Undo).
 */
// `onPenDown` / `onPenUp` bracket every contact (recognition waits for the pen to lift); a quick tap
// that `onTap(clientX, clientY)` claims (true) is not kept as ink.
export function InkSheet({ strokes, hiddenBefore = 0, showConverted = false, tool, fingerDrawing, disabled, dark, onStroke, onErase, onPenDown, onPenUp, onTap }) {
  const canvas = useRef(null);
  const filter = useRef(new PointerFilter());
  const active = useRef(null);
  const contact = useRef(null);
  const props = useRef({});
  props.current = { strokes, hiddenBefore, showConverted, dark };

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
      c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const { strokes: all, hiddenBefore: hidden, showConverted: show, dark: isDark } = props.current;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const list = active.current ? [...all, active.current] : all;
    list.forEach((s, idx) => {
      if (!s.length) return;
      const converted = idx < hidden && s !== active.current;
      if (converted && !show) return;
      ctx.globalAlpha = converted ? 0.28 : 1;
      ctx.strokeStyle = isDark ? '#eef5ff' : '#15375e';
      ctx.beginPath();
      s.forEach((p, i) => {
        const v = toView(p, rect);
        ctx.lineWidth = 2 + 2.2 * (p.p ?? 0.5) * (rect.width / WORLD);
        if (i) ctx.lineTo(v.x, v.y); else ctx.moveTo(v.x, v.y);
      });
      if (s.length === 1) { const v = toView(s[0], rect); ctx.lineTo(v.x + 0.1, v.y); }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  };

  useEffect(draw);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    ro.observe(canvas.current);
    return () => ro.disconnect();
  }, []);

  const point = (e) => {
    const rect = canvas.current.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top, rect);
    return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10, p: Math.round((e.pressure || 0.5) * 100) / 100 };
  };

  const erase = (e) => {
    const rect = canvas.current.getBoundingClientRect();
    const { strokes: all, hiddenBefore: hidden } = props.current;
    const hit = strokesHit(all, point(e), (14 / rect.width) * WORLD).filter((i) => i >= hidden);
    if (hit.length) onErase(all.filter((_, i) => !hit.includes(i)));
  };

  function down(e) {
    if (disabled || active.current || !filter.current.accept(e, { fingerDrawing, now: performance.now() })) return;
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    contact.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), far: false };
    onPenDown?.();
    if (tool === 'eraser' || e.button === 5) { canvas.current.dataset.erasing = e.pointerId; erase(e); return; }
    active.current = [point(e)];
    active.current.pointerId = e.pointerId;
  }
  function move(e) {
    const c = contact.current;
    if (c && c.id === e.pointerId && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 8) c.far = true;
    if (canvas.current.dataset.erasing == e.pointerId) { erase(e); return; }
    if (!active.current || active.current.pointerId !== e.pointerId) return;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) active.current.push(point(ev));
    draw();
  }
  function up(e) {
    const c = contact.current?.id === e.pointerId ? contact.current : null;
    if (c) contact.current = null;
    if (canvas.current.dataset.erasing == e.pointerId) { delete canvas.current.dataset.erasing; onPenUp?.(); return; }
    if (!active.current || active.current.pointerId !== e.pointerId) return;
    const stroke = [...active.current];
    active.current = null;
    const tap = c && !c.far && performance.now() - c.t < 350;
    if (e.type === 'pointercancel' || disabled || (tap && e.type === 'pointerup' && onTap?.(e.clientX, e.clientY))) { draw(); onPenUp?.(); return; }
    onStroke(stroke);
    onPenUp?.();
  }

  return (
    <canvas ref={canvas} className={`ink${tool === 'eraser' ? ' erasing' : ''}${disabled ? ' locked' : ''}`}
      aria-label="Writing paper. Write your working with a pen; finger drawing can be turned on."
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
  );
}
