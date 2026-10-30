import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { MathModel } from '../lib/editor/model.js';

const SHOW = { '-': '−', '*': '×', '/': '∕' };
const OPS = new Set(['+', '-', '−', '×', '*', '÷', '=']);
const samePath = (a, b) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

// Renders a row. With `editor`, characters and slots are tappable and the cursor is drawn.
function Row({ row, path, editor }) {
  const here = editor && samePath(editor.cursor.path, path);
  const sel = here ? editor.selection : null;
  const out = [];
  const caret = (k) => <span key={`c${k}`} className="caret" aria-hidden="true" />;
  row.forEach((n, i) => {
    if (here && editor.cursor.i === i) out.push(caret(i));
    const selected = sel && i >= sel[0] && i < sel[1];
    if (n.k === 'c') {
      // A minus at the start, or after another operator or "(", is a sign: no operator spacing.
      const prev = row[i - 1];
      const unary = n.v === '-' && (!prev || (prev.k === 'c' && (OPS.has(prev.v) || prev.v === '(')));
      out.push(
        <span key={i} className={`mc${OPS.has(n.v) && !unary ? ' op' : ''}${selected ? ' sel' : ''}`}
          onPointerDown={editor ? (e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); editor.place(path, e.clientX > r.left + r.width / 2 ? i + 1 : i); } : undefined}>
          {SHOW[n.v] ?? n.v}
        </span>,
      );
      return;
    }
    if (n.k === 'frac') {
      out.push(
        <span key={i} className={`mfrac${selected ? ' sel' : ''}`}>
          <Slot row={n.num} path={[...path, [i, 'num']]} editor={editor} cls="mnum" />
          <Slot row={n.den} path={[...path, [i, 'den']]} editor={editor} cls="mden" />
        </span>,
      );
    } else if (n.k === 'sqrt') {
      out.push(<span key={i} className={`msqrt${selected ? ' sel' : ''}`}><span className="mroot">√</span><Slot row={n.body} path={[...path, [i, 'body']]} editor={editor} cls="mbody" /></span>);
    } else if (n.k === 'pow') {
      out.push(<sup key={i} className={`mpow${selected ? ' sel' : ''}`}><Slot row={n.exp} path={[...path, [i, 'exp']]} editor={editor} cls="mexp" /></sup>);
    }
  });
  if (here && editor.cursor.i === row.length) out.push(caret(row.length));
  return out;
}

function Slot({ row, path, editor, cls }) {
  const active = editor && samePath(editor.cursor.path, path);
  return (
    <span className={`mslot ${cls}${row.length ? '' : ' empty'}${active ? ' active' : ''}`}
      onPointerDown={editor ? (e) => { e.preventDefault(); e.stopPropagation(); editor.place(path, row.length); } : undefined}>
      <Row row={row} path={path} editor={editor} />
    </span>
  );
}

// Static, accessible rendering of a stored line.
export function MathView({ text, className = '', style }) {
  const model = MathModel.fromText(text);
  return (
    <span className={`math ${className}`} style={style} role="math" aria-label={model.toSpeech()}>
      <span aria-hidden="true"><Row row={model.root} path={[]} /></span>
    </span>
  );
}

const ALLOWED = /^[0-9a-z.+\-=()]$/i;

/**
 * Structured line editor with real numerator/denominator slots. Physical keyboard is primary;
 * operator buttons, the keypad and recognised handwriting feed it through the imperative API.
 * `onBackspaceEmpty` lets a list of lines remove an empty line; `disabled` locks it when time ends.
 */
// `penText` lets the operating system's pen-to-text (Scribble on iPad, Windows pen, Android stylus)
// write into the field: the input sink lies over the editor where the pen can reach it, and the
// recognised text arrives through onInput like any other typing.
export const MathEditor = forwardRef(function MathEditor({ text, onChange, onEnter, onUndo, onBackspaceEmpty, onFocus, onBlur, placeholder, label, inputMode, describedBy, disabled = false, autoFocus = false, className = '', penText = false }, ref) {
  const modelRef = useRef(MathModel.fromText(text));
  const emitted = useRef(text);
  const box = useRef(null); // the focusable input sink
  const insertChars = (m, t) => { for (const ch of t.replace(/\s+/g, '')) if (ch === '/' || ch === '^' || ch === '×' || ch === '÷' || ch === '*' || ALLOWED.test(ch)) m.insert(ch === '*' ? '×' : ch); };
  const [, setV] = useState(0);
  const model = modelRef.current;

  // External changes (recognition, undo, editing an old line) rebuild the model.
  useEffect(() => {
    if (text !== emitted.current) {
      modelRef.current = MathModel.fromText(text);
      emitted.current = text;
      setV((v) => v + 1);
    }
  }, [text]);

  const commit = () => {
    const t = modelRef.current.toText();
    setV((v) => v + 1);
    if (t !== emitted.current) { emitted.current = t; onChange(t); }
  };
  const act = (fn) => { fn(modelRef.current); commit(); };

  useImperativeHandle(ref, () => ({
    insert: (op) => { if (!disabled) act((m) => (op === 'a/b' ? m.insertFraction() : op === '√' ? m.insertSqrt() : m.insert(op))); },
    backspace: () => { if (!disabled) act((m) => m.backspace()); },
    focus: () => box.current?.focus({ preventScroll: true }),
    element: () => box.current,
  }));

  useEffect(() => { if (autoFocus) box.current?.focus({ preventScroll: true }); }, []);

  function onKeyDown(e) {
    const m = modelRef.current;
    if (disabled) { e.preventDefault(); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); act((x) => x.selectAll()); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); onUndo?.(); return; }
    if (mod || e.altKey) return;
    switch (e.key) {
      case 'Enter': e.preventDefault(); onEnter?.(); return;
      case 'Backspace': e.preventDefault(); if (m.isEmpty() && onBackspaceEmpty) onBackspaceEmpty(); else act((x) => x.backspace()); return;
      case 'Delete': e.preventDefault(); act((x) => { x.right(); x.backspace(); }); return;
      case 'ArrowLeft': e.preventDefault(); act((x) => x.left(e.shiftKey)); return;
      case 'ArrowRight': e.preventDefault(); act((x) => x.right(e.shiftKey)); return;
      case 'ArrowUp': if (m.vertical(-1)) { e.preventDefault(); commit(); } return;
      case 'ArrowDown': if (m.vertical(1)) { e.preventDefault(); commit(); } return;
      case 'Home': e.preventDefault(); act((x) => x.home()); return;
      case 'End': e.preventDefault(); act((x) => x.end()); return;
      case 'Tab': if (m.tab(e.shiftKey)) { e.preventDefault(); commit(); } return;
      default:
    }
    const k = e.key === '*' ? '×' : e.key;
    if (k === '/' || k === '^' || k === '÷' || k === '×' || ALLOWED.test(k)) {
      e.preventDefault();
      act((x) => x.insert(k));
    } else if (k.length === 1) e.preventDefault(); // ignore unsupported printable keys
  }

  function onPaste(e) {
    e.preventDefault();
    if (disabled) return;
    const t = e.clipboardData.getData('text').slice(0, 200);
    if (t) act((m) => insertChars(m, t));
  }

  // Text that arrives without a usable keydown (on-screen keyboards, IME, dictation).
  function onInput(e) {
    const t = e.target.value;
    e.target.value = '';
    if (t && !disabled) act((m) => insertChars(m, t));
  }

  const editor = {
    cursor: model.cursor,
    selection: model.selection(),
    place: (path, i) => { if (disabled) return; model.setCursor(path, i); setV((v) => v + 1); box.current?.focus({ preventScroll: true }); },
  };

  return (
    <div className={`math-editor math${model.isEmpty() ? ' is-empty' : ''}${disabled ? ' is-disabled' : ''}${penText ? ' pen-text' : ''} ${className}`}
      onPointerDown={(e) => { if (penText) return; if (!e.target.closest('.mc, .mslot')) { e.preventDefault(); editor.place([], model.root.length); } }}>
      <textarea ref={box} className="input-sink" rows={1} aria-label={label} aria-describedby={describedBy} aria-roledescription="maths line editor"
        aria-disabled={disabled || undefined} readOnly={disabled}
        inputMode={inputMode === 'tablet' && !penText ? 'none' : 'text'} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
        onKeyDown={onKeyDown} onPaste={onPaste} onInput={onInput} onFocus={onFocus} onBlur={onBlur} />
      {model.isEmpty() && <span className="placeholder" aria-hidden="true">{placeholder}</span>}
      <span className="math-row" aria-hidden="true"><Row row={model.root} path={[]} editor={editor} /></span>
      <span className="sr-only" aria-live="polite">{model.toSpeech() || 'empty'}</span>
    </div>
  );
});
