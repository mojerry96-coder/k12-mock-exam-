const S = (props) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props} />;

export const Icon = {
  back: () => <S><path d="M19 12H5M11 6l-6 6 6 6" /></S>,
  next: () => <S><path d="M5 12h14M13 6l6 6-6 6" /></S>,
  close: () => <S strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18" /></S>,
  gear: () => <S><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>,
  expand: () => <S><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></S>,
  shrink: () => <S><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></S>,
  clock: () => <S><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>,
  doc: () => <S><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></S>,
  pen: () => <S><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" /><path d="M14 6l3 3" /></S>,
  eraser: () => <S><path d="M7 20h13M4.5 14.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 17H7.5l-3-3z" /></S>,
  undo: () => <S><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></S>,
  tick: () => <S strokeWidth="3"><path d="M5 12.5l4.5 4.5L19 7" /></S>,
  alert: () => <S strokeWidth="2.8"><path d="M12 6.5v7M12 17.5v.01" /></S>,
  keyboard: () => <S><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></S>,
  calc: () => <S><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01" /></S>,
  backspace: () => <S><path d="M21 5H9l-6 7 6 7h12V5z" /><path d="M17 9l-5 6M12 9l5 6" /></S>,
  hand: () => <S><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5v-2a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.5-2L3.5 16a1.5 1.5 0 0 1 2.1-2.1L8 16" /></S>,
  eye: () => <S><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></S>,
  shield: () => <S><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></S>,
};
