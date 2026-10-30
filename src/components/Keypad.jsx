import { useLayoutEffect } from 'react';
import { Icon } from './Icons.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.'];

// Number pad that sits directly above the 123 button, its tail pointing at it (practice build).
// Positioned before paint so the genie animation starts from the right place. Keys go into the
// last focused field, which keeps focus while they are tapped.
export function Keypad({ panelRef, anchor, onKey, onBackspace, onClose }) {
  useLayoutEffect(() => {
    const place = () => {
      const el = panelRef.current;
      const b = anchor.current?.getBoundingClientRect();
      if (!el || !b) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = Math.max(12, Math.min(window.innerWidth - w - 12, b.left + b.width / 2 - w / 2));
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(12, b.top - h - 16)}px`;
      el.style.setProperty('--tail', `${b.left + b.width / 2 - left}px`);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  const keep = (e) => e.preventDefault();
  return (
    <section ref={panelRef} className="keypad-pop" role="dialog" aria-modal="false" aria-label="Number pad"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <header className="keypad-head">
        <span>Number pad</span>
        <button className="icon-btn close" onPointerDown={keep} onClick={onClose} aria-label="Close number pad"><Icon.close /></button>
      </header>
      <div className="keypad">
        {KEYS.map((d) => <button key={d} onPointerDown={keep} onClick={() => onKey(d)}>{d}</button>)}
        <button aria-label="Delete" onPointerDown={keep} onClick={onBackspace}><Icon.backspace /></button>
      </div>
    </section>
  );
}
