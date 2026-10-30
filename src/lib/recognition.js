// Debounced, cancellable handwriting recognition (after the practice build's RecognitionClient).
// A newer stroke cancels the pending request, and a result is only delivered if nothing has
// changed since it was asked for: same strokes, same question, time not up. It never solves or
// checks anything; the candidate reviews and edits every conversion.
import { recognitionPayload } from './ink.js';
import { recognizeOnDevice, recognizeWithLines } from './recognizer/index.js';

// Handwriting recognition on every device, best available first:
//   1. the host's recogniser, if the app supplies one;
//   2. Mathpix, when the server has keys (maths-specialised);
//   3. the device's own recogniser (the browser's Handwriting Recognition API), reading each line
//      while our layout step finds stacked fractions;
//   4. the recogniser built into this module.
// A step that fails (offline, an error) falls through to the next; a cancelled request doesn't.
export function chooseRecognizer({ host, api, serverRecognition, systemReader }) {
  const engine = host?.recognizeInk ? 'host' : serverRecognition ? 'mathpix' : systemReader ? 'system' : 'builtin';
  async function recognize(payload, { signal, questionId } = {}) {
    if (host?.recognizeInk) return { engine: 'host', ...(await host.recognizeInk(payload, { signal, questionId })) };
    if (serverRecognition) {
      try { return { ...(await api.recognize({ ...payload, questionId }, signal)), engine: 'mathpix' }; }
      catch (e) { if (e.name === 'AbortError') throw e; }
    }
    if (systemReader) {
      try { return await recognizeWithLines(payload.strokes, systemReader, 'system'); }
      catch { /* fall through to the built-in reader */ }
    }
    return recognizeOnDevice(payload.strokes);
  }
  return { engine, recognize };
}

export class Recognizer {
  constructor({ recognize, delayMs = 900 }) {
    Object.assign(this, { recognize, delayMs });
    this.timer = null; this.ctrl = null; this.ticket = 0;
  }

  cancel() {
    clearTimeout(this.timer);
    this.ctrl?.abort();
    this.ctrl = null;
    this.ticket++;
  }

  // `isCurrent(ticketInfo)` is asked again when the answer arrives; a stale answer is dropped.
  schedule(strokes, info, { onStart, onResult, onError, isCurrent }) {
    this.cancel();
    if (!strokes.length) return;
    const ticket = this.ticket;
    this.timer = setTimeout(async () => {
      this.ctrl = new AbortController();
      onStart?.();
      try {
        const out = await this.recognize(recognitionPayload(strokes), { signal: this.ctrl.signal, ...info });
        if (ticket !== this.ticket || !isCurrent(info)) return;
        if (typeof out?.expression !== 'string') throw new Error('Invalid recognition response');
        onResult({ text: out.expression.trim(), confidence: typeof out.confidence === 'number' ? out.confidence : 1, engine: out.engine ?? 'service' });
      } catch (e) {
        if (e.name === 'AbortError' || ticket !== this.ticket || !isCurrent(info)) return;
        onError(e);
      }
    }, this.delayMs);
  }
}
