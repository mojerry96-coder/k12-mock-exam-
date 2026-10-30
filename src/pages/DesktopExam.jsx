import { useEffect, useRef } from 'react';
import { MathEditor } from '../components/Math.jsx';
import { Graph } from '../components/Graph.jsx';
import { Icon } from '../components/Icons.jsx';
import { ExamHeader, Progress, Timer, Operators, SubmitButton, SaveStatus, Choices, Prompt } from '../components/ExamChrome.jsx';

// Keyboard exam: the question and its fixed graph on the left; working (structured maths lines on
// grid paper) and the explicit final answer on the right. Working is saved with the response but
// only the final answer is marked.
export function DesktopExam({ session, snap, draft, timeUp, save, busy, penText, canSwitch = true, keypadOpen, keypadRef, onOp, onKeypad, setTarget, onSubmit, onBack, onSettings, onSwitchMode }) {
  const q = snap.question;
  const isNumber = q.type === 'number';
  const lines = draft.lines.length ? draft.lines : [''];
  const lineRefs = useRef([]);
  const answerRef = useRef(null);
  const focusNext = useRef(null);
  const history = useRef({ stack: [], at: 0 });

  // The final answer takes the operator buttons and number pad until another field is focused.
  useEffect(() => { if (answerRef.current) setTarget(answerRef.current); }, [q.id]);
  useEffect(() => {
    if (focusNext.current === null) return;
    const el = lineRefs.current[focusNext.current];
    focusNext.current = null;
    el?.focus();
  });

  const setLines = (next, structural = false) => {
    const h = history.current, now = Date.now();
    if (structural || now - h.at > 900) h.stack = [...h.stack.slice(-80), lines];
    h.at = now;
    session.edit((d) => ({ ...d, lines: next }));
  };
  const undo = () => {
    const prev = history.current.stack.pop();
    if (prev) session.edit((d) => ({ ...d, lines: prev }));
  };
  const clear = () => { if (lines.some((l) => l)) setLines([''], true); };
  const newLine = (i) => { const next = [...lines]; next.splice(i + 1, 0, ''); focusNext.current = i + 1; setLines(next, true); };
  const dropLine = (i) => { if (lines.length < 2) return; focusNext.current = Math.max(0, i - 1); setLines(lines.filter((_, k) => k !== i), true); };

  return (
    <main className="exam desktop" aria-describedby={`q-${q.id}`}>
      <ExamHeader question={q} mode="desktop" onBack={onBack} onSettings={onSettings} />
      <div className="status-row">
        <Progress index={snap.index} total={snap.total} />
        <Timer session={session} />
      </div>

      <div className="columns">
        <section className="card problem-card enter" aria-label="Question">
          <Prompt question={q} />
          {q.passage && <p className="passage">{q.passage}</p>}
          {q.graph && <div className="graph-wrap"><Graph points={q.graph.points} /></div>}
        </section>

        <div className="response">
          {isNumber ? (
            <section className="card working-card enter" style={{ '--d': '80ms' }} aria-label="Your working">
              <div className="working-head">
                <h2>Your working</h2>
                <div className="row">
                  <button className="small" onClick={undo} disabled={timeUp || !history.current.stack.length}>Undo</button>
                  <button className="small" onClick={clear} disabled={timeUp}>Clear</button>
                </div>
              </div>
              <div className="paper" onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); lineRefs.current[lines.length - 1]?.focus(); } }}>
                {lines.map((text, i) => (
                  <MathEditor key={i} ref={(el) => { lineRefs.current[i] = el; }} className="work-line" text={text} disabled={timeUp}
                    label={`Working line ${i + 1}`} describedBy={`q-${q.id}`} inputMode="desktop"
                    placeholder={i === 0 && lines.length === 1 ? 'Type your working…  ( / makes a fraction, Enter adds a line )' : ''}
                    onFocus={() => setTarget(lineRefs.current[i])}
                    onChange={(t) => { const next = [...lines]; next[i] = t; setLines(next); }}
                    onEnter={() => newLine(i)} onBackspaceEmpty={() => dropLine(i)} onUndo={undo} />
                ))}
              </div>
              {draft.strokes.length > 0 && <p className="mode-note">Your pen working is saved with this answer. Switch to pen mode to see it.</p>}
              <Operators ref={keypadRef} onOp={onOp} onKeypad={onKeypad} keypadOpen={keypadOpen} disabled={timeUp} />
            </section>
          ) : (
            <section className="card working-card choice-card enter" style={{ '--d': '80ms' }} aria-label="Your answer">
              <Choices question={q} value={draft.answer} disabled={timeUp} onChange={(o) => session.edit((d) => ({ ...d, answer: o }))} />
            </section>
          )}

          <section className="card answer-bar enter" style={{ '--d': '140ms' }} aria-label="Final answer">
            {isNumber ? (
              <div className="final">
                <span className="final-label">Final answer</span>
                {q.answerPrefix && <span className="final-prefix">{q.answerPrefix} =</span>}
                <MathEditor ref={answerRef} className="answer-box" text={draft.answer} disabled={timeUp} inputMode="desktop" penText={!!penText}
                  label={`Final answer${q.answerPrefix ? `, ${q.answerPrefix} equals` : ''}`} describedBy={`q-${q.id}`} placeholder=""
                  onFocus={() => setTarget(answerRef.current)}
                  onChange={(t) => session.edit((d) => ({ ...d, answer: t }))} onEnter={onSubmit} />
              </div>
            ) : (
              <p className="final-label chosen-answer">{draft.answer ? <>Your answer: <b>{String.fromCharCode(65 + q.options.indexOf(draft.answer))}</b></> : 'No answer chosen yet'}</p>
            )}
            <SaveStatus text={save} />
            <SubmitButton last={snap.index === snap.total - 1} disabled={busy || timeUp} onClick={onSubmit} />
          </section>
        </div>
      </div>

      {canSwitch && <button className="side-tab" onClick={onSwitchMode}><Icon.pen /><span>Pen mode</span></button>}
      {timeUp && <p className="time-up" role="alert">Time’s up. Locking your last saved response…</p>}
    </main>
  );
}
