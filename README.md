# Gradient Lab · Mock Exam

The mock exam from `Mock_Exam_Claude_Pack`, built as a production module in the same stack and style as
the Gradient Lab practice build (`~/ai tutor outside build /ulesson-ai-tutor`) and the K12 Gradient Lab
build (`~/k12 demo /gradient-lab/v2`). Four screens, matching `docs/references/01–04`:
preparation → one timed question at a time (keyboard or pen) → completion.

- No product name or logo appears on any screen (the host app supplies its own chrome).
- **Fitila is animated** on preparation (waving) and completion (both wings up) with the K12 build's
  transparent clips (`public/assets/fitila/wave.*`, `celebrate.*`: HEVC-alpha `.mov` for Safari,
  VP9-alpha `.webm` elsewhere, transparent poster for reduced motion). Her animated head (the practice
  build's `fitila-head-loop.mp4`) tops the preparation and completion popups. **Active exam screens have
  no Fitila, hints, Ask Fiti, adaptive graphs or correctness feedback.**
- **Writing converts to text, without interrupting.** The paper always takes the pen, including over
  converted maths (which is see-through to the pen). Recognition never runs while the pen is down and
  waits until it has rested for about 1.5 s; then the ink fades into typed maths exactly where it was.
  Writing more on the same line extends that line (the whole line is read again). A quick tap on
  converted maths edits it; writing anywhere closes the editor. Undo takes back the last stroke and the
  rest of that line is read again. The **Ink** toggle shows the handwriting under converted maths.
- **Handwriting recognition, best available first:** (1) the host app's recogniser, if it supplies one;
  (2) Mathpix when the server has keys (`.env.local`); (3) the device's own recogniser, the browser's
  Handwriting Recognition API (Chrome on ChromeOS today, any browser that adds it), which reads each line
  while our layout step keeps stacked fractions; (4) the built-in recogniser (`src/lib/recognizer/`,
  runs offline on any device: digits, + − × ÷ = ( ) . /, m, x, y, stacked fractions, $P matching against
  the glyph templates). A step that fails (offline, an error) falls through to the next. A conversion
  the recogniser isn't sure of is outlined with "Check this"; every conversion stays editable;
  recognition never solves or checks anything.
- **System pen-to-text in answer boxes:** on iPad (Scribble with Apple Pencil), Windows with a pen and
  Android with a stylus, the final-answer box and the converted-maths editor accept the operating
  system's own handwriting-to-text, which is usually the most accurate option on those devices. No web
  API gives these to a drawing canvas, so the paper itself uses the chain above.
- **Input (from the practice build):** the structured maths editor with real numerator/denominator slots
  (`m=6-2/3-1` builds m = (6−2)/(3−1); `/`, Tab and arrows move between slots), several working lines
  (Enter adds one), operator buttons that never steal focus, and the genie number pad above **123**. Pen
  mode adds the ink sheet (pen, eraser, undo, palm rejection, optional finger drawing). The final answer is
  always a separate, explicit field (`m = …`), or answer cards for multiple choice.
- **The server owns time.** Each question's absolute deadline is set on the server; the client clock is
  synchronised to server time and only stops input at zero. Submitting early starts the next question
  immediately; expiry locks the last saved draft and starts the next question *at the expired deadline*,
  so time away can use up several questions. No previous-question action. Timer never pauses (popups,
  offline, background, mode switch). Last 20 s turn the timer orange.
- **Autosave:** debounced 450 ms, serialised, monotonic revisions; stale writes retry, late writes are
  refused. States: Saving…, Saved, Retrying save…, Offline · saved on this device, Connection lost · timer
  continues, Time ended · synchronising. A local backup restores only into the same question while it is
  still open. Polls every 1.5 s; reloading or leaving resumes the running attempt.
- **Device check as a loader:** pressing Check device runs each check in turn inside the card (connection,
  screen size, input, saving, full screen, handwriting, plus the host's secure check when connected),
  filling a percentage bar and ticking one circle per check until 100%, then Start appears. A failed
  check turns red and names the problem, with Check again. It is a readiness check, not lockdown.
- **Retake:** the completion screen offers Retake exam, which returns to preparation for a fresh attempt
  (the finished one stays on the server). The host can turn it off with `allowRetake: false` and hears
  `onRetake` / `mockexam:retake`.
- **Popups:** timing preview, number pad, submit
  confirmation (unanswered / last-question wording), leave exam, exam tools (full screen, switch input,
  finger drawing), review responses, and toasts. Escape, focus trap and focus return. A question that ends
  while its popup is open closes that popup and says so.
- **Answer keys stay on the server** until the attempt is complete. Marking is final-answer only (numbers,
  decimals, signed values, one simple fraction; nothing is evaluated). Review shows answers, working and
  explanations after completion; with `MARKING=queued` results stay "on the way" until released.

```bash
npm install
npm run dev        # http://localhost:5180 (API included)
npm test           # engine, HTTP, session, editor and recogniser tests (57)
npm run build && npm start   # production server on :8081
```

`?exam=three-subject` opens the 9-question Mathematics / English / Biology mock (multiple choice and
passages); the default is the two-question Gradient challenge from the references.

## Layout

| Path | What it is |
|---|---|
| `server/engine.mjs` | Deadlines, expiry, locking, revisions, draft sanitising, public snapshots, marking |
| `server/exams.mjs` | Server-side exam definitions (questions, order, timing, accommodation multiplier) |
| `server/store.mjs` | SQLite attempt store (`server/runtime/`, token hashes only) |
| `server/api.mjs` | `/api/mock/*`, `/api/recognize` (Mathpix adapter), `/api/health`; shared by dev and prod |
| `server/index.mjs` | Production server: `dist/` only, byte ranges for video, 404 for anything else |
| `src/main.jsx` | `mountMockExam(el, options)` into a shadow root; standalone page |
| `src/MockExam.jsx` | Screens, popups, device check, host events |
| `src/lib/session.js` | Client session: server-clock sync, autosave queue, polling, recovery, submit |
| `src/lib/recognition.js` | Recogniser choice (host → Mathpix → device → built-in) and debounced, stale-safe requests |
| `src/lib/recognizer/` | `index.js` (layout: fractions and lines; built-in line reader), `system.js` (browser Handwriting Recognition API, OS pen-to-text detection), `pdollar.js` ($P matcher), `path.js` (glyph path sampling) |
| `src/lib/glyphs.js`, `ink.js`, `editor/model.js` | Shared glyph strokes and layout, ink geometry, maths editor model |
| `src/pages/` | `Preparation`, `DesktopExam`, `TabletExam`, `Completion` |
| `src/components/` | `WriteOn`, `InkSheet`, `Math` (editor), `Genie`, `Keypad`, `Popover`, `Graph`, `Fitila`, `FitiHead`, `ExamChrome` |
| `data/` | The pack's 90 original placeholder questions (JSON, plus SQLite copy: `npm run bank:sqlite`) |
| `docs/references/` | The four approved screens |

## Host integration

```js
import { mountMockExam } from './src/main.jsx';
const exam = mountMockExam(el, {
  examId: 'gradient-challenge',
  assets: '/assets',
  host: {
    settings: { dark: false },
    deviceCheck: async ({ mode }) => ({ ok: true }),         // trusted secure-browser check; failing blocks Start
    allowRetake: true,                                        // false hides Retake exam on completion
    recognizeInk: async (payload, { signal, questionId }) => ({ expression: 'm=4/2' }), // optional
    onStart, onRetake: ({ previousAttemptId }) => {}, onExit: ({ attemptId, status }) => {}, onComplete: ({ attemptId, total, submitted, expired }) => {},
  },
});
exam.unmount();
```

Without a host the module still emits `mockexam:start`, `mockexam:retake`, `mockexam:exit` and `mockexam:complete` on
`window`. `onComplete` fires once per attempt after the server reports it complete; badges and XP are the
host's to award, idempotently, from its own record.

Server environment (`.env.local`): `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` (handwriting), `MARKING=queued`,
`TIME_MULTIPLIER` (extra time, 1–3), `ATTEMPTS_DB`, `QUESTION_BANK`, `PORT`.

## Not connected / not verified

- **Handwriting recognition:** the built-in recogniser is tested on synthetic handwriting and simulated
  pen input, not on real learners' writing. The browser Handwriting Recognition API path is tested
  against a fake of the API only (this Mac's Chromium doesn't have it). iPad Scribble, Windows pen and
  Android stylus pen-to-text in the answer boxes are detected and enabled but not yet tried on those
  devices. The Mathpix adapter is unit-tested with a mock only; add keys to `.env.local` to use it.
- **Identity, eligibility, accommodations and secure browser:** the bearer token is a demo stand-in for
  host authentication; `TIME_MULTIPLIER` is global, not per learner; the device check is a readiness check
  and full screen only changes the display. Connect `host.deviceCheck` to a real secure-browser attestation
  and reject the exam when it fails.
- **Persistence:** one local SQLite process, one client per attempt. Production needs authenticated
  ownership, leases for multiple tabs/devices, migrations, backups, audit and load testing.
- **Content:** all 90 questions are the pack's original placeholder material, not WAEC/JAMB past papers,
  and need subject-expert review. Working is saved but not marked; theory and partial credit need rules.
- **Devices:** checked in Chromium at 1672×941, 1440×900, 1024×768 and 768×1024. Not yet checked on real
  tablets (pen pressure, palm rejection, rotation), in Safari (HEVC-alpha clips), with screen readers, or
  under load.
