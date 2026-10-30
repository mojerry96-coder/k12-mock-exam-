import { useEffect, useRef } from 'react';
import { FitiHead } from './FitiHead.jsx';
import { Icon } from './Icons.jsx';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const active = (node) => node?.getRootNode?.().activeElement ?? document.activeElement;

/**
 * Centred popup over a soft scrim, as in the K12 and practice builds. Traps focus, closes on Escape
 * (unless `dismissable` is false) and restores focus to the trigger. Fiti's head appears only where
 * she is allowed: preparation and completion, never on an active exam screen.
 */
export function Popover({ open, title, onClose, className = '', children, fiti = false, dismissable = true, assets }) {
  const ref = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = active(ref.current);
    const first = ref.current?.querySelector('[data-autofocus]') ?? ref.current?.querySelector(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return () => { if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true }); };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); if (dismissable) onClose(); return; }
    if (e.key !== 'Tab') return;
    const nodes = [...ref.current.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) return;
    const i = nodes.indexOf(active(ref.current));
    if (e.shiftKey && i <= 0) { e.preventDefault(); nodes.at(-1).focus(); }
    else if (!e.shiftKey && i === nodes.length - 1) { e.preventDefault(); nodes[0].focus(); }
  }

  return (
    <>
      <div className="scrim" onClick={dismissable ? onClose : undefined} aria-hidden="true" />
      <section ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`popover ${className}`} onKeyDown={onKeyDown}>
        {dismissable && <button className="icon-btn close" onClick={onClose} aria-label={`Close ${title}`}><Icon.close /></button>}
        {fiti && <FitiHead size={72} className="popover-fiti" assets={assets} />}
        <h2 className="popover-title">{title}</h2>
        {children}
      </section>
    </>
  );
}
