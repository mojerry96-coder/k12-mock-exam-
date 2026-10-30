import { useLayoutEffect, useRef } from 'react';

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * A headline uncovered line by line, left to right. The text is real text throughout (screen readers
 * read it at once); reduced motion shows it straight away.
 */
export function WriteOn({ lines, as: Tag = 'h1', className = '', delay = 0, msPerChar = 45 }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (reducedMotion() || !root.current?.animate) return undefined;
    const anims = [];
    let at = delay;
    root.current.querySelectorAll('.wo-ink').forEach((ink) => {
      const dur = Math.max(320, ink.textContent.length * msPerChar);
      anims.push(ink.animate([{ clipPath: 'inset(-20% 100% -30% 0)' }, { clipPath: 'inset(-20% 0% -30% 0)' }], { duration: dur, delay: at, fill: 'both', easing: 'cubic-bezier(.35,.1,.45,1)' }));
      at += dur + 120;
    });
    return () => anims.forEach((a) => a.cancel());
  }, [lines.join('\n')]);

  return (
    <Tag ref={root} className={`write-on ${className}`}>
      {lines.map((text, i) => <span key={i} className="wo-line"><span className="wo-ink">{text}</span></span>)}
    </Tag>
  );
}
