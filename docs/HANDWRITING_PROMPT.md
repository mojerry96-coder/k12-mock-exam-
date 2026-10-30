# Prompt: add the mock exam's handwriting recognition to another build

Paste everything below the line into Claude Code, opened in the build you want to change (for example
`~/ai tutor outside build /ulesson-ai-tutor`). Replace the bracketed parts first.

---

Add handwriting-to-text to this build's pen/tablet writing area, copying the working implementation
from the mock exam build at `~/Mock_Exam_k12/mock-exam`. Read these files there first:
`src/lib/recognizer/index.js`, `src/lib/recognizer/system.js`, `src/lib/recognizer/pdollar.js`,
`src/lib/recognizer/path.js`, `src/lib/glyphs.js`, `src/lib/recognition.js`, `src/lib/ink.js`,
`src/components/InkSheet.jsx`, `src/components/Math.jsx` (the `penText` prop), `src/pages/TabletExam.jsx`,
`tests/recognizer.test.js`, and the "Handwriting recognition" parts of `README.md`.

**Where to apply it here:** [name the writing area, e.g. "the tablet-mode ink sheet in `src/App.jsx`
and `src/components/InkSheet.jsx`"].

**Behaviour to match exactly:**
1. The pen is never interrupted. The paper always takes ink, including over converted text (converted
   text has `pointer-events: none`). Recognition never runs while the pen is down; it waits until the
   pen has rested about 1.5 s (`REST_MS`). New ink on the same line as the last conversion extends that
   line and the whole line is re-read. A quick tap (under 350 ms, under 8 px of movement) on converted
   text opens it for editing; writing anywhere closes the editor. Undo removes the last stroke, and the
   rest of that line is re-read.
2. Converted text appears as typed maths exactly where the ink was, sized to the ink, while the ink
   fades. No pencil or pen animation.
3. Recognition chain, best first, each failure falling through to the next, a cancelled request
   stopping: (a) a host-supplied recogniser if this build has one; (b) Mathpix through the server's
   `/api/recognize` when `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` are set; (c) the device's own recogniser,
   the browser Handwriting Recognition API (`navigator.createHandwritingRecognizer`), run per line
   through `recognizeWithLines` so the layout step still finds stacked fractions; (d) the built-in
   recogniser `recognizeOnDevice`. Use `chooseRecognizer` from `src/lib/recognition.js`.
4. On iPad (Scribble), Windows with a pen and Android with a stylus (`systemPenText()`), the answer box
   and the converted-text editor accept the operating system's pen-to-text: pass `penText` to the
   maths editor (input sink over the field, `inputmode="text"`, no `preventDefault` on pointer down).
5. Each conversion carries a 0–1 confidence; below 0.5 it is outlined and says "Check this: tap it to
   fix it if it isn't what you wrote". Every conversion stays editable. Recognition never solves,
   marks or hints, and a late result for older ink, another question or after time is up is dropped.
6. The device check / settings name the recogniser in use.

**Steps:**
1. Copy `src/lib/recognizer/` and `src/lib/glyphs.js`. If this build has its own glyph table (e.g. `G`
   and `layoutRow` inside a `Handwriting.jsx`), move it into `src/lib/glyphs.js` and import it, rather
   than keeping two copies.
2. Copy or merge `chooseRecognizer` and the `Recognizer` debounce class from `src/lib/recognition.js`
   into this build's recognition client, keeping its existing stale-revision checks and its existing
   "unsure / confirm" state if it has one (map confidence < 0.5 onto it).
3. Wire the writing area as in `TabletExam.jsx`: `onPenDown` / `onPenUp` / `onTap` on the ink surface,
   the extend-the-line rule (`continuesLine`), conversions stored as `{ id, text, from, to, box }` over
   the stroke list, pass-through converted text, the Ink show/hide toggle in the toolbar.
4. Vocabulary: the built-in recogniser reads `0–9 + − × ÷ = ( ) . /`, `m`, `x`, `y` and stacked
   fractions. [If this build needs words such as `rise` / `run`: add `r i s e u n` to `VOCAB` in
   `recognizer/index.js` (their glyphs are in `G`), and let a dot directly above a short upright stroke
   join it as the dot of `i` (today dots only join symbols containing a bar, for ÷). Add tests.]
5. Copy and adapt `tests/recognizer.test.js` (synthetic handwriting with jitter, slant and other hands;
   chain order and fallbacks; the fake browser API; platform detection). Keep all existing tests passing.
6. Verify in the dev server: dispatch pointer events with glyph-shaped strokes on the ink canvas, with
   0.3–0.5 s gaps between strokes, and confirm (a) nothing converts while strokes keep coming, (b) it
   converts after a rest, (c) a stroke starting on converted text is kept as ink, (d) writing beside a
   line extends it, (e) a tap opens the editor and writing closes it. Check the console for errors.
7. Update this build's README "not verified" section honestly: the built-in recogniser is basic and
   untested on real learners' handwriting; the browser API and iPad/Windows/Android pen-to-text are
   untested on those devices unless you have tried them.

Done when: the writing area converts handwriting on any device with no keys, uses the better
recognisers when they exist, never blocks the pen, all tests pass, and the README is updated. Don't
commit unless asked.
