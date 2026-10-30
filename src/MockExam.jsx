import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ExamSession } from './lib/session.js';
import { Backdrop } from './components/Backdrop.jsx';
import { Popover } from './components/Popover.jsx';
import { Genie } from './components/Genie.jsx';
import { Keypad } from './components/Keypad.jsx';
import { Icon } from './components/Icons.jsx';
import { MathView } from './components/Math.jsx';
import { Preparation, minutes } from './pages/Preparation.jsx';
import { DesktopExam } from './pages/DesktopExam.jsx';
import { TabletExam } from './pages/TabletExam.jsx';
import { Completion } from './pages/Completion.jsx';
import { chooseRecognizer } from './lib/recognition.js';
import { systemLineReader, systemPenText } from './lib/recognizer/system.js';

const store = (storage) => ({
  get(k) { try { return storage.getItem(k); } catch { return null; } },
  set(k, v) { try { storage.setItem(k, v); } catch { /* ignore */ } },
});

function detectMode() {
  const coarse = matchMedia('(pointer: coarse)').matches, fine = matchMedia('(any-pointer: fine)').matches;
  return coarse && !fine ? 'tablet' : 'desktop';
}

// Device check run in the browser, one check at a time so the candidate sees it progress. It is
// honest about what it is: a readiness check, not lockdown. Optional checks never block the start.
const ENGINE_LABEL = {
  host: 'Handwriting recognition connected',
  mathpix: 'Handwriting recognition: Mathpix',
  system: 'Handwriting recognition: this device’s own',
  builtin: 'Handwriting recognition: built-in (basic)',
};
const STEP_MS = 380; // each check stays on screen at least this long

function deviceChecks({ api, host, mode, storage, engine, penText }) {
  const touch = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
  return [
    ...(host.deviceCheck ? [{ label: 'Secure exam check', run: async () => {
      try { const t = await host.deviceCheck({ mode }); return { ok: !!t?.ok, detail: t?.ok ? 'Secure exam check passed' : `Secure exam check failed${t?.reason ? `: ${t.reason}` : ''}`, trusted: t }; }
      catch (e) { return { ok: false, detail: `Secure exam check failed: ${e.message}`, trusted: { ok: false } }; }
    } }] : []),
    { label: 'Connection', run: async () => { const h = await api.health(); return { ok: !!h.exam, detail: h.exam ? 'Exam server reachable' : 'Can’t reach the exam server' }; } },
    { label: 'Screen size', run: async () => { const ok = Math.max(innerWidth, innerHeight) >= 760 && Math.min(innerWidth, innerHeight) >= 500; return { ok, detail: ok ? 'Screen big enough' : 'Screen too small for the exam' }; } },
    { label: mode === 'tablet' ? 'Pen input' : 'Keyboard', run: async () => ({ ok: true, detail: mode === 'tablet' ? (touch() ? 'Touch screen or pen found' : 'Pen mode with a mouse or trackpad') : 'Keyboard mode' }) },
    { label: 'Saving', optional: true, run: async () => { let ok = true; try { storage.setItem('mock-probe', '1'); storage.removeItem('mock-probe'); } catch { ok = false; } return { ok, detail: ok ? 'Backup saving works' : 'No backup on this device' }; } },
    { label: 'Full screen', optional: true, run: async () => ({ ok: !!document.fullscreenEnabled, detail: document.fullscreenEnabled ? 'Full screen available' : 'Full screen not available' }) },
    { label: 'Handwriting', run: async () => ({ ok: true, detail: `${ENGINE_LABEL[engine]}${penText ? ` · ${penText} in answer boxes` : ''}` }) },
  ];
}

// Runs the checks in order, reporting after each: { status, results, total, current }.
async function runDeviceCheck(options, onProgress) {
  const checks = deviceChecks(options);
  const results = [];
  let trusted = null;
  for (const c of checks) {
    onProgress({ status: 'running', results: [...results], total: checks.length, current: c.label });
    const [r] = await Promise.all([c.run().catch(() => ({ ok: false, detail: `${c.label} check failed` })), new Promise((res) => setTimeout(res, STEP_MS))]);
    if (r.trusted) trusted = r.trusted;
    results.push({ label: c.label, optional: !!c.optional, ...r });
  }
  const ok = results.every((r) => r.ok || r.optional);
  const done = { status: 'done', results, total: checks.length, current: null, ok, trusted };
  onProgress(done);
  return done;
}

/**
 * The mock exam module: preparation → one timed question at a time → completion. Host-facing
 * behaviour comes in through `host` (see host.js); everything about timing comes from the server.
 */
export function MockExam({ api, examId, assets, host, storage }) {
  const local = useMemo(() => store(storage), [storage]);
  const session = useMemo(() => new ExamSession({
    api, storage,
    onComplete: (snap) => host.complete({ attemptId: snap.id, examId: snap.exam?.id, total: snap.total, submitted: snap.submitted, expired: snap.expired, completedAt: snap.completedAt }),
  }), [api]);
  const s = useSyncExternalStore((fn) => session.subscribe(fn), () => session.state);
  const [mode, setModeState] = useState(() => local.get('mock-input-mode') || detectMode());
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState({ exam: true, recognition: false });
  const [device, setDevice] = useState(null);
  const [popup, setPopup] = useState(null);
  const [toast, setToast] = useState(null);
  const [review, setReview] = useState(null);
  const [fingerDrawing, setFingerDrawing] = useState(() => local.get('mock-finger') !== 'off');
  const [fullscreen, setFullscreen] = useState(false);
  const [canResume, setCanResume] = useState(() => api.hasSession());
  const target = useRef(null);
  const keypadBtn = useRef(null);
  const rootRef = useRef(null);
  const dark = host.settings?.dark ?? false;

  const setMode = (m) => { setModeState(m); local.set('mock-input-mode', m); };
  const say = (text) => setToast({ text, id: Date.now() });
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 5200); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    let live = true;
    session.attach();
    api.exam(examId).then((x) => live && setSummary(x)).catch((e) => live && say(e.message));
    api.health().then((h) => live && setHealth(h));
    // Only an attempt of this exam that is still running can be resumed; a finished one starts afresh.
    if (api.hasSession()) api.current().then((x) => live && setCanResume(x.status === 'active' && x.exam?.id === examId)).catch(() => live && setCanResume(false));
    return () => { live = false; session.detach(); };
  }, []);

  // A question changed under an open popup (time ran out): close what belonged to that question.
  useEffect(() => {
    setPopup((p) => (p === 'submit' || p === 'keypad' ? null : p));
  }, [s.questionKey]);
  useEffect(() => { if (s.notice) { say(s.notice); session.clearNotice(); } }, [s.notice]);
  useEffect(() => {
    if (s.timeUp) setPopup((p) => (p === 'submit' || p === 'keypad' ? null : p));
  }, [s.timeUp]);

  useEffect(() => {
    const vis = () => session.visibility(document.hidden);
    const fs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('visibilitychange', vis);
    document.addEventListener('fullscreenchange', fs);
    return () => { document.removeEventListener('visibilitychange', vis); document.removeEventListener('fullscreenchange', fs); };
  }, []);

  // A stylus touching the screen suggests pen mode, but never overrides the candidate's choice.
  useEffect(() => {
    const onPen = (e) => { if (e.pointerType === 'pen' && !local.get('mock-input-mode') && mode !== 'tablet') setMode('tablet'); };
    window.addEventListener('pointerdown', onPen, true);
    return () => window.removeEventListener('pointerdown', onPen, true);
  }, [mode]);

  const [systemReader, setSystemReader] = useState(null);
  useEffect(() => { systemLineReader().then((fn) => fn && setSystemReader(() => fn)); }, []);
  const penText = useMemo(() => systemPenText(), []);
  const { recognize, engine: recognitionEngine } = useMemo(() => chooseRecognizer({ host, api, serverRecognition: health.recognition, systemReader }), [host, health.recognition, systemReader]);

  // ── actions ──
  async function checkDevice() {
    if (device?.status === 'running') return;
    await runDeviceCheck({ api, host, mode, storage, engine: recognitionEngine, penText }, setDevice);
  }
  async function start() {
    if (host.deviceCheck && !device?.trusted?.ok) { say('The secure exam check has not passed, so this exam can’t start.'); return; }
    const resuming = canResume;
    const r = resuming ? await session.resume() : await session.start(examId);
    if (!r.ok) {
      if (resuming) { setCanResume(api.hasSession()); say(r.error === 'Unknown attempt' ? 'That attempt has ended on this device. Start a new one.' : r.error); return; }
      say(r.error || 'Couldn’t start the exam. Check your connection.');
      return;
    }
    host.start({ attemptId: session.state.snap?.id, examId, mode, resumed: resuming });
  }
  async function confirmSubmit() {
    const r = await session.submit();
    setPopup(null);
    if (!r.ok && r.error) say(r.error);
  }
  async function leave() {
    await session.flush();
    setPopup(null);
    const snap = session.state.snap;
    if (!host.exit({ attemptId: snap?.id ?? null, status: s.phase === 'exam' ? 'active' : s.phase })) setPopup('away');
  }
  function exitNow() {
    const snap = session.state.snap;
    if (!host.exit({ attemptId: snap?.id ?? null, status: s.phase })) setPopup('away');
  }
  function retake() {
    const done = session.state.snap;
    host.retake({ previousAttemptId: done?.id ?? null, examId });
    session.reset();
    setDevice(null);
    setCanResume(false);
    setPopup(null);
  }
  async function openReview() {
    setPopup('review');
    setReview(null);
    try {
      const r = await api.result();
      setReview(r.status === 'pending' ? { pending: true } : r);
    } catch (e) { setReview({ error: e.message }); }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await (rootRef.current?.getRootNode()?.host ?? document.documentElement).requestFullscreen();
    } catch { say('Full screen isn’t available here. The exam works the same without it.'); }
  }
  const insertOp = (op) => { target.current?.insert(op); };
  const switchMode = () => { setPopup(null); setMode(mode === 'tablet' ? 'desktop' : 'tablet'); };

  const snap = s.snap;
  const draft = s.draft;
  const shared = {
    session, snap, draft, timeUp: s.timeUp, save: s.save, busy: s.busy,
    keypadOpen: popup === 'keypad', keypadRef: keypadBtn,
    onOp: insertOp, onKeypad: () => setPopup(popup === 'keypad' ? null : 'keypad'),
    setTarget: (api) => { target.current = api; },
    onSubmit: () => { if (!s.timeUp && !s.busy) setPopup('submit'); },
    onBack: () => setPopup('leave'), onSettings: () => setPopup('settings'), onSwitchMode: switchMode,
  };
  const last = snap && snap.index === snap.total - 1;
  const unanswered = !draft.answer.trim();

  return (
    <div className={`mx mode-${mode} phase-${s.phase}`} data-theme={dark ? 'dark' : 'light'} ref={rootRef}>
      <Backdrop />
      {s.phase === 'prepare' && (
        <Preparation assets={assets} summary={summary} mode={mode} onMode={(m) => { setMode(m); setDevice(null); }} device={device} canResume={canResume} busy={s.busy}
          onCheck={checkDevice} onStart={start} onTiming={() => setPopup('timing')} onClose={exitNow} />
      )}
      {s.phase === 'exam' && snap?.question && (mode === 'tablet'
        ? <TabletExam key={snap.question.id} {...shared} penText={penText} recognize={recognize} engine={recognitionEngine} fingerDrawing={fingerDrawing} dark={dark} fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
        : <DesktopExam key={snap.question.id} {...shared} penText={penText} />)}
      {s.phase === 'complete' && snap && <Completion assets={assets} snap={snap} onReview={openReview} onRetake={host.allowRetake ? retake : null} onDone={exitNow} onClose={exitNow} />}

      <Genie open={popup === 'keypad'} anchor={keypadBtn}>
        {(ref) => <Keypad panelRef={ref} anchor={keypadBtn} onKey={insertOp} onBackspace={() => target.current?.backspace()} onClose={() => setPopup(null)} />}
      </Genie>

      <Popover open={popup === 'timing'} title="Timing" onClose={() => setPopup(null)} fiti assets={assets}>
        {summary && (
          <>
            <ul className="timing-list">
              {summary.perSubject.map((p) => <li key={p.subject}><b>{p.subject}</b><span>{p.count} × {minutes(p.seconds)}</span></li>)}
              <li className="total"><b>Longest possible</b><span>{minutes(summary.seconds.reduce((a, b) => a + b, 0))}</span></li>
            </ul>
            <p className="quiet">Each question has its own timer, which keeps running if you leave, lose connection or switch apps. Submitting early moves straight on; you can’t go back.</p>
          </>
        )}
        <div className="row"><button className="primary" data-autofocus onClick={() => setPopup(null)}>Got it</button></div>
      </Popover>

      <Popover open={popup === 'submit'} title={last ? 'Submit your exam?' : 'Submit this question?'} onClose={() => setPopup(null)}>
        <p>{unanswered
          ? `You haven’t entered a final answer. Submit this question unanswered?`
          : last ? 'This is the last question. Your answer will be locked and the exam will finish.' : 'Your answer will be locked. You can’t return to this question.'}</p>
        {!unanswered && snap?.question?.type === 'number' && <p className="confirm-answer">{snap.question.answerPrefix ? `${snap.question.answerPrefix} = ` : 'Answer: '}<MathView text={draft.answer} /></p>}
        <div className="row">
          <button className="primary" data-autofocus disabled={s.busy || s.timeUp} onClick={confirmSubmit}>{unanswered ? 'Submit unanswered' : last ? 'Submit exam' : 'Submit & next'}</button>
          <button onClick={() => setPopup(null)}>Keep working</button>
        </div>
      </Popover>

      <Popover open={popup === 'leave'} title="Leave this exam?" onClose={() => setPopup(null)}>
        <p>The timer keeps running while you’re away. Questions lock with your last saved response when their time ends.</p>
        <div className="row">
          <button className="primary" data-autofocus onClick={() => setPopup(null)}>Stay in the exam</button>
          <button onClick={leave}>Leave exam</button>
        </div>
      </Popover>

      <Popover open={popup === 'settings'} title="Exam tools" onClose={() => setPopup(null)}>
        <p className="quiet">The timer keeps running while this is open.</p>
        <div className="tool-list">
          <button onClick={toggleFullscreen}>{fullscreen ? <Icon.shrink /> : <Icon.expand />} {fullscreen ? 'Exit full screen' : 'Full screen'}</button>
          <button onClick={switchMode}>{mode === 'tablet' ? <><Icon.keyboard /> Switch to keyboard</> : <><Icon.pen /> Switch to pen</>}</button>
          {mode === 'tablet' && (
            <button aria-pressed={fingerDrawing} className={fingerDrawing ? 'on' : ''} onClick={() => { const v = !fingerDrawing; setFingerDrawing(v); local.set('mock-finger', v ? 'on' : 'off'); }}>
              <Icon.hand /> Draw with finger: {fingerDrawing ? 'on' : 'off'}
            </button>
          )}
        </div>
        <p className="quiet">Switching keeps your saved work. Full screen only changes the display; it doesn’t lock the device.</p>
      </Popover>

      <Popover open={popup === 'review'} title="Your responses" onClose={() => setPopup(null)} fiti assets={assets} className="review-pop">
        {!review ? <p>Loading your marked responses…</p>
          : review.error ? <p>{review.error}</p>
            : review.pending ? <p>Your responses are being marked. Results appear here when they’re ready.</p> : (
              <>
                <p className="review-score"><b>{review.results.reduce((n, x) => n + x.marks, 0)}</b> / {review.results.reduce((n, x) => n + x.maxMarks, 0)} <span className="quiet">· final answers only, prototype marking</span></p>
                <ol className="review-list">
                  {review.results.map((x) => (
                    <li key={x.questionId} className={x.correct ? 'right' : 'wrong'}>
                      <p className="review-q">{x.prompt}</p>
                      <p>Your answer: <b>{x.answer ? (x.type === 'number' ? <MathView text={x.answer} /> : x.answer) : 'Not answered'}</b>{x.reason === 'expired' && <span className="quiet"> · locked when time ended</span>}</p>
                      <p className="review-mark">{x.correct ? <><Icon.tick /> Correct</> : <>Expected: <b>{x.type === 'number' ? <MathView text={x.expected} /> : x.expected}</b></>}</p>
                      <p className="quiet">{x.explanation}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
      </Popover>

      <Popover open={popup === 'away'} title="Back to dashboard" onClose={() => setPopup(null)} fiti={s.phase !== 'exam'} assets={assets}>
        <p>The dashboard isn’t connected to this standalone build.</p>
        <p className="quiet">{s.phase === 'exam' ? 'Your attempt is saved and its timer is still running. Reload to resume.' : 'Close this tab, or reload to see the exam again.'}</p>
        <div className="row"><button className="primary" data-autofocus onClick={() => setPopup(null)}>OK</button></div>
      </Popover>

      {toast && <p key={toast.id} className="toast" role="status">{toast.text}</p>}
    </div>
  );
}
