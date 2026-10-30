import { useEffect, useRef, useState } from 'react';
import { MathEditor, MathView } from '../components/Math.jsx';
import { Graph } from '../components/Graph.jsx';
import { InkSheet } from '../components/InkSheet.jsx';
import { Icon } from '../components/Icons.jsx';
import { ExamHeader, Progress, Timer, Operators, SubmitButton, SaveStatus, Choices, Prompt } from '../components/ExamChrome.jsx';
import { bounds, pendingFrom, WORLD } from '../lib/ink.js';
import { Recognizer } from '../lib/recognition.js';

let nextId = 0;
const cid = () => `c${Date.now().toString(36)}${(nextId++).toString(36)}`;

// Pen exam: one large sheet of grid paper. The question sits at the top and the fixed graph on the
// right; everywhere else takes ink, always, including over converted maths. Recognition only
// watches: once the pen has rested, the ink turns into typed maths exactly where it was, and writing
// more beside a converted line extends that line. A quick tap on converted maths edits it; a
// conversion the recogniser isn't sure of asks to be checked. The final answer stays separate and
// explicit.
const REST_MS = 1500;

// New ink continues the last converted line when it sits on the same line, just after (or over) it.
function continuesLine(last, box) {
  if (!last || !box) return false;
  const b = last.box, h = Math.max(b.h, box.h, 20);
  const vOverlap = Math.min(b.y + b.h, box.y + box.h) - Math.max(b.y, box.y);
  const gap = box.x - (b.x + b.w);
  return vOverlap > 0.3 * Math.min(b.h || h, box.h || h) && gap < 1.2 * h && box.x + box.w > b.x - 0.3 * h;
}
export function TabletExam({ session, snap, draft, timeUp, save, busy, recognize, engine, penText, fingerDrawing, dark, keypadOpen, keypadRef, onOp, onKeypad, setTarget, onSubmit, onBack, onSettings, onSwitchMode, fullscreen, onFullscreen }) {
  const q = snap.question;
  const isNumber = q.type === 'number';
  const [tool, setTool] = useState('pen');
  const [editing, setEditing] = useState(null);
  const [fresh, setFresh] = useState(() => new Set());
  const [unsure, setUnsure] = useState(() => new Set());
  const [ghosts, setGhosts] = useState([]);
  const [rec, setRec] = useState({ state: 'idle', message: '' });
  const [showInk, setShowInk] = useState(false);
  const [edited, setEdited] = useState(() => new Set());
  const [restTick, setRestTick] = useState(0);
  const penDown = useRef(false);
  const convRefs = useRef({});
  const [sheet, setSheet] = useState({ w: 1000, h: 800 });
  const sheetRef = useRef(null);
  const answerRef = useRef(null);
  const editorRef = useRef(null);
  const latest = useRef({});
  latest.current = { draft, qid: q.id, timeUp };
  const recognizeRef = useRef(recognize);
  recognizeRef.current = recognize; // the engine can change once the server reports what's connected
  const recognizer = useRef(null);
  if (!recognizer.current) recognizer.current = new Recognizer({ recognize: (...a) => recognizeRef.current(...a), delayMs: REST_MS });

  const hidden = pendingFrom(draft.conversions);
  const pending = draft.strokes.slice(hidden);
  const pendingBox = pending.length ? bounds(pending) : null;

  useEffect(() => { if (answerRef.current) setTarget(answerRef.current); }, [q.id]);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSheet({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => recognizer.current.cancel(), [q.id]);
  useEffect(() => { if (timeUp) { recognizer.current.cancel(); setEditing(null); } }, [timeUp]);

  // Recognise the ink written since the last conversion once the pen has rested, never while it is
  // down. Ink that carries on the last converted line is read together with that line.
  useEffect(() => {
    if (!pending.length || timeUp || penDown.current) { recognizer.current.cancel(); return; }
    const last = draft.conversions.at(-1);
    const extend = last && last.to === hidden && !edited.has(last.id) && continuesLine(last, pendingBox) ? last : null;
    const info = { questionId: q.id, from: extend ? extend.from : hidden, hidden, to: draft.strokes.length };
    recognizer.current.schedule(draft.strokes.slice(info.from), info, {
      isCurrent: (i) => { const l = latest.current; return !penDown.current && !l.timeUp && l.qid === i.questionId && l.draft.strokes.length === i.to && pendingFrom(l.draft.conversions) === i.hidden; },
      onStart: () => setRec({ state: 'reading', message: 'Reading handwriting…' }),
      onResult: ({ text, confidence }) => {
        if (!text) { setRec({ state: 'error', message: 'That couldn’t be read. Your ink is kept: write it again, or type your answer.' }); return; }
        const id = cid();
        const all = latest.current.draft.strokes;
        const conversion = { id, text, from: info.from, to: info.to, box: bounds(all.slice(info.from, info.to)) };
        const ok = session.edit((d) => ({ ...d, conversions: extend ? [...d.conversions.slice(0, -1), conversion] : [...d.conversions, conversion] }));
        if (!ok) return;
        setRec({ state: 'idle', message: '' });
        setFresh((s) => new Set(s).add(id));
        setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n; }), 700);
        if (confidence < 0.5) setUnsure((s) => new Set(s).add(id));
        setGhosts((g) => [...g, { id, strokes: all.slice(info.hidden, info.to) }]);
        setTimeout(() => setGhosts((g) => g.filter((x) => x.id !== id)), 1100);
      },
      onError: () => setRec({ state: 'error', message: 'That couldn’t be read. Your ink is kept: write it again, or type your answer.' }),
    });
  }, [draft.strokes.length, hidden, timeUp, q.id, restTick]);

  const addStroke = (stroke) => session.edit((d) => ({ ...d, strokes: [...d.strokes, stroke] }));
  // Undo takes back the last stroke. If it was part of a converted line, the rest of that line
  // turns back into ink and is read again.
  const undo = () => session.edit((d) => {
    if (!d.strokes.length) return d;
    const last = d.conversions.at(-1);
    const convertedLast = last && last.to === d.strokes.length;
    return { ...d, strokes: d.strokes.slice(0, -1), conversions: convertedLast ? d.conversions.slice(0, -1) : d.conversions };
  });
  const setConversion = (id, text) => {
    setUnsure((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; }); // checked by the candidate
    setEdited((s) => (s.has(id) ? s : new Set(s).add(id))); // the candidate's text is never re-read over
    session.edit((d) => ({ ...d, conversions: d.conversions.map((c) => (c.id === id ? { ...c, text } : c)) }));
  };
  // The pen always writes. A quick tap that lands on converted maths opens it for editing instead.
  const tapAt = (x, y) => {
    for (const [id, el] of Object.entries(convRefs.current)) {
      const r = el?.getBoundingClientRect();
      if (r && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) { setEditing(id); return true; }
    }
    return false;
  };
  const penStart = () => {
    penDown.current = true;
    recognizer.current.cancel();
    if (editing) finishEdit(editing);
  };
  const penEnd = () => { penDown.current = false; setRestTick((t) => t + 1); };
  const finishEdit = (id) => {
    setEditing(null);
    setTarget(answerRef.current);
    const c = latest.current.draft.conversions.find((x) => x.id === id);
    // Emptying converted maths removes it, with its ink, if it was the last thing written.
    if (c && !c.text.trim()) session.edit((d) => {
      const i = d.conversions.findIndex((x) => x.id === id);
      const last = i === d.conversions.length - 1 && pendingFrom(d.conversions) === d.strokes.length;
      return last ? { ...d, strokes: d.strokes.slice(0, c.from), conversions: d.conversions.slice(0, -1) } : d;
    });
  };

  const px = (v) => (v / WORLD) * sheet.w;
  const statusText = rec.message;
  const lastConversion = draft.conversions.at(-1);

  return (
    <main className="exam tablet" aria-describedby={`q-${q.id}`}>
      <ExamHeader question={q} mode="tablet" fullscreen={fullscreen} onBack={onBack} onSettings={onSettings} onFullscreen={onFullscreen} />

      <section className="sheet enter" ref={sheetRef} aria-label="Writing paper">
        <InkSheet strokes={draft.strokes} hiddenBefore={hidden} showConverted={showInk} tool={tool} fingerDrawing={fingerDrawing}
          disabled={timeUp} dark={dark} onStroke={addStroke} onErase={(strokes) => session.edit((d) => ({ ...d, strokes }))}
          onPenDown={penStart} onPenUp={penEnd} onTap={tapAt} />

        <div className="sheet-top">
          <Progress index={snap.index} total={snap.total} />
          <Timer session={session} compact />
        </div>
        <div className="sheet-question">
          <Prompt question={q} />
          {q.passage && <p className="passage">{q.passage}</p>}
          {draft.lines.some((l) => l.trim()) && <p className="mode-note">Your typed working is saved with this answer. Switch to keyboard mode to see it.</p>}
        </div>
        {q.graph && <div className="sheet-graph"><Graph points={q.graph.points} /></div>}

        {ghosts.map((g) => (
          <svg key={g.id} className="ink-ghost" viewBox={`0 0 ${WORLD} ${(WORLD * sheet.h) / sheet.w}`} preserveAspectRatio="xMinYMin meet" aria-hidden="true">
            {g.strokes.map((s, i) => <polyline key={i} points={s.map((p) => `${p.x},${p.y}`).join(' ')} />)}
          </svg>
        ))}

        {draft.conversions.map((c) => {
          // Typed at the size it was written: a fraction's two rows share the ink's height.
          const rows = c.text.includes('/') ? 2.3 : 1;
          const size = Math.max(30, Math.min(72, (px(c.box.h) / rows) * 1.15));
          const style = { left: `${c.box.x / 10}cqw`, top: `${c.box.y / 10}cqw` };
          if (editing === c.id) return (
            <div key={c.id} className="conv editing" style={style}>
              <MathEditor ref={editorRef} autoFocus text={c.text} inputMode="tablet" label="Edit converted maths" disabled={timeUp} penText={!!penText}
                onFocus={() => setTarget(editorRef.current)} onChange={(t) => setConversion(c.id, t)} onEnter={() => finishEdit(c.id)} onBlur={() => finishEdit(c.id)} />
              <small className="conv-hint">Editing · tap outside or press Enter when done</small>
            </div>
          );
          const isFresh = fresh.has(c.id);
          // Converted maths never takes the pen (it is see-through to the paper); keyboard users can
          // still reach it with Tab.
          return (
            <div key={c.id} className={`conv${isFresh ? ' conv-in' : ''}`} style={style}>
              <button ref={(el) => { if (el) convRefs.current[c.id] = el; else delete convRefs.current[c.id]; }} className="conv-btn" disabled={timeUp}
                onClick={() => setEditing(c.id)} aria-label="Converted maths. Press to edit.">
                <MathView text={c.text} className="conv-math" style={{ fontSize: size }} />
              </button>
              {!isFresh && unsure.has(c.id) && <p className="conv-hint check">Check this: tap it to fix it if it isn’t what you wrote</p>}
              {c === lastConversion && !isFresh && !pending.length && !unsure.has(c.id) && (
                <p className="conv-hint">Keep writing, or tap converted maths to edit{engine === 'builtin' ? ' · read by the built-in reader' : ''}</p>
              )}
            </div>
          );
        })}

        {pendingBox && statusText && (
          <p className={`ink-status ${rec.state}`} role="status" style={{ left: `${pendingBox.x / 10}cqw`, top: `${(pendingBox.y + pendingBox.h) / 10 + 1}cqw` }}>{statusText}</p>
        )}

        <div className="sheet-tools">
          <div className="seg-tools" role="toolbar" aria-label="Pen tools">
            <button className={tool === 'pen' ? 'on' : ''} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} disabled={timeUp}><Icon.pen /> Pen</button>
            <button className={tool === 'eraser' ? 'on' : ''} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')} disabled={timeUp}><Icon.eraser /> Eraser</button>
            <button onClick={undo} disabled={timeUp || !draft.strokes.length}><Icon.undo /> Undo</button>
            <button className={showInk ? 'on' : ''} aria-pressed={showInk} onClick={() => setShowInk((v) => !v)} disabled={!draft.conversions.length}
              aria-label={showInk ? 'Hide my handwriting under converted maths' : 'Show my handwriting under converted maths'}><Icon.eye /> Ink</button>
          </div>
          {isNumber && <Operators ref={keypadRef} ops={['+', '-', '×', '÷', '=', 'a/b']} onOp={onOp} onKeypad={onKeypad} keypadOpen={keypadOpen} disabled={timeUp} />}
        </div>

        <div className={`sheet-answer${isNumber ? '' : ' with-choices'}`}>
          {isNumber ? (
            <div className="final">
              <span className="final-prefix hand">{q.answerPrefix ? `${q.answerPrefix} =` : 'Answer'}</span>
              <MathEditor ref={answerRef} className="answer-box" text={draft.answer} disabled={timeUp} inputMode="tablet" penText={!!penText}
                label={`Final answer${q.answerPrefix ? `, ${q.answerPrefix} equals` : ''}`} describedBy={`q-${q.id}`} placeholder={penText ? 'Write your answer here' : ''}
                onFocus={() => setTarget(answerRef.current)} onChange={(t) => session.edit((d) => ({ ...d, answer: t }))} onEnter={onSubmit} />
            </div>
          ) : (
            <Choices question={q} value={draft.answer} disabled={timeUp} onChange={(o) => session.edit((d) => ({ ...d, answer: o }))} />
          )}
          <SaveStatus text={save} pill />
          <SubmitButton last={snap.index === snap.total - 1} disabled={busy || timeUp} onClick={onSubmit} />
        </div>
        {timeUp && <p className="time-up" role="alert">Time’s up. Locking your last saved response…</p>}
      </section>

      <button className="side-tab" onClick={onSwitchMode}><Icon.keyboard /><span>Keyboard mode</span></button>
    </main>
  );
}
