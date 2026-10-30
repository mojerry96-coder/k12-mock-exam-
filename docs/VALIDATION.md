# Validation record

## Automated (`npm test`, Node 22.16, 60 tests)

- **Engine (11):** deadline locks the last acknowledged draft and refuses late edits; stale revisions refused;
  retried submit advances once and early submission starts the next clock at submission time; time away
  expires every elapsed question at its own deadline; snapshots omit answer, explanation and provenance;
  results gated until complete; numeric marking (fractions, signs, decimals, no evaluation); draft
  sanitising (ink clamped, conversions must reference real strokes); locked responses keep typed working,
  ink and converted text; the bank (90 unique original placeholder items, valid keys) and exam definitions;
  subject exams draw 2 random questions from their own subject (20 draws give many different pairs),
  mixed draws across all three; unseen questions first, then the longest-ago ones.
- **HTTP (6):** exam summary exposes size and timing only; full start → save → stale save → submit →
  idempotent retry → recognition → expiry while away → review flow with a controlled clock; unknown or
  missing tokens refused, recognition needs a live attempt; 503 and `recognition: false` without a
  recognition service; queued marking returns 202 "pending"; the subject list; 15 attempts by one learner
  get all 30 maths questions with no repeats, and the 16th brings back the longest-ago ones.
- **Client session (8):** clock follows server time; debounced, ordered saves with rising revisions; stale
  retry above the server revision; offline backup restored on resume for the same open question only;
  expiry elsewhere moves on with a notice and older snapshots are ignored; input stops at zero and the
  server is polled at once; submit flushes first, refuses while offline, completion reported once;
  retake returns to preparation and a new start opens a fresh attempt.
- **Maths editor (12):** the practice build's structured-editor tests.
- **On-device recogniser (20):** 15 expressions (m = 2, −3, m = (6−2)/(3−1), m = (5+10)/(−2−3), 0.5, 3/8,
  y = 2x+1, 9×4, …) written three ways each with seeded jitter, slant and uneven sizes; other hands (plain
  1, crossed 7, one-stroke 4, two-stroke 5); size and position independence; ÷ not taken for a fraction;
  scribbles get low confidence; recogniser choice (host → Mathpix → device → built-in, each failure
  falling through, aborts respected); a device recogniser reads each line inside a stacked fraction
  and a line it can't read falls back to the built-in reader; the browser API adapter against a fake
  `navigator.createHandwritingRecognizer`; platform detection for Scribble, Windows pen, Android stylus.

Production server probe: `/data/question-bank.json`, `/server/runtime/attempts.sqlite` → 404; encoded
traversal (`/..%2fdata/…`, `/%2e%2e/server/…`) → 403; video byte ranges → 206, out of range → 416.

## In the browser (Chromium, dev server)

- Preparation at 1672×941 against `references/01`: layout, badge, stats, rules, Pen/Keyboard choice,
  device check loader (0% → 100%, one tick per check, no popup), Start, Preview timing; Fitila wave clip playing; headline uncovered left to right; no product name or logo.
- Desktop exam against `references/02`: fixed graph, structured working lines (stacked fractions typed
  inline), genie number pad into the focused field, final answer, submit confirmation, advance.
- Tablet exam against `references/03`: pen strokes sent as pointer events with no test hooks are read by
  the built-in recogniser (m = (6−2)/(3−1)) and the ink turns into typed maths in place; a
  scribble is flagged "Check this"; tap to edit; operator buttons insert into the converted line.
  Continuous writing: strokes 0.25–0.5 s apart are never converted mid-writing; "m =" converts after a
  2 s rest; a stroke starting on top of converted maths is taken as ink (the editor does not open);
  the fraction written next to it after the rest joins the same line (m = (5+10)/(−2−3)); a quick tap
  opens the editor and writing elsewhere closes it.
- Timer: low-time emphasis; expiry locks and advances; expiry of the last question completes the attempt;
  resume after reload keeps the server clock.
- Completion against `references/04`: celebrate clip, sparkles, confetti, finisher badge, honest summary
  (submitted vs. locked at time end), review popup with marks and explanations.
- Retake: completion → Retake exam → preparation → check → a fresh attempt with full time.
- Subject picker: Mathematics / English / Biology / Mixed with counts and timing; English attempts drew
  different random questions each time; a running attempt locks the subject until it ends.
- Three-subject exam: multiple choice in keyboard and pen layouts; answer kept across mode switch.
- Sizes: 1672×941, 1440×900, 1024×768 landscape, 768×1024 portrait.
- Console: no errors or React warnings.

## Not done

Real tablets and styluses, Safari and iPadOS (HEVC-alpha clips, pointer events), screen readers, 200%
zoom, a real Mathpix account, multi-tab or multi-device attempts, security and load testing, subject-expert
review of the question bank, host integration, the on-device recogniser on real learners' handwriting.
