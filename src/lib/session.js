// Client side of an attempt: mirrors the server's snapshot, keeps the draft, autosaves it in order,
// polls, and shows a clock synchronised to server time. Framework-free so it can be tested alone;
// the React shell subscribes to it. The server stays authoritative for deadlines and locking: the
// client only stops input when its synchronised clock reaches zero.
export const emptyDraft = () => ({ answer: '', lines: [], strokes: [], conversions: [] });

const SAVE_DELAY = 450, POLL_MS = 1500;

export class ExamSession {
  constructor({ api, storage = globalThis.sessionStorage, clock = () => performance.now(), onComplete = () => {}, saveDelay = SAVE_DELAY, pollMs = POLL_MS } = {}) {
    Object.assign(this, { api, storage, clock, onComplete, saveDelay, pollMs });
    this.s = { phase: 'prepare', snap: null, draft: emptyDraft(), save: 'Saved', timeUp: false, notice: null, questionKey: 0, busy: false };
    this.listeners = new Set();
    this.dirty = false; this.editVersion = 0; this.revision = 0; this.queue = Promise.resolve();
    this.anchor = 0; this.serverTime = 0; this.dead = false; this.submitting = false; this.nearDeadlineFlush = false;
    this.saveTimer = null; this.pollTimer = null; this.timeUpTimer = null;
  }

  // ── store plumbing ──
  get state() { return this.s; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(patch) { if (this.dead) return; this.s = { ...this.s, ...patch }; this.listeners.forEach((fn) => fn()); }
  setSave(text) { if (this.s.save !== text) this.set({ save: text }); }

  // ── clock ──
  syncClock(snap) { this.anchor = this.clock(); this.serverTime = snap.serverNow; }
  now() { return this.serverTime + (this.clock() - this.anchor); }
  remaining() { const d = this.s.snap?.deadline; return d ? Math.max(0, d - this.now()) : 0; }

  // Called by the UI every 250 ms while a question is open.
  tick() {
    if (this.dead || this.s.phase !== 'exam') return;
    const left = this.remaining();
    if (left < 1200 && this.dirty && !this.nearDeadlineFlush) { this.nearDeadlineFlush = true; this.flush(); }
    if (left === 0 && !this.s.timeUp) {
      this.set({ timeUp: true, save: 'Time ended · synchronising' });
      clearTimeout(this.timeUpTimer);
      this.timeUpTimer = setTimeout(() => this.poll(), 350); // the server has locked it by now
    }
  }

  // ── local recovery (same question only, while it is still open) ──
  key(id) { return `mock-draft-${id}`; }
  localSave() {
    const snap = this.s.snap;
    if (!snap?.question) return;
    try { this.storage.setItem(this.key(snap.id), JSON.stringify({ questionId: snap.question.id, draft: this.s.draft, revision: this.revision })); }
    catch { this.set({ notice: 'This device can’t store a backup. Keep this page open.' }); }
  }
  localLoad(snap) {
    try {
      const stored = JSON.parse(this.storage.getItem(this.key(snap.id)));
      return stored?.questionId === snap.question?.id && stored.revision >= (snap.revision || 0) ? stored : null;
    } catch { return null; }
  }

  // ── lifecycle ──
  async start(examId) { return this.open(() => this.api.start(examId), false); }
  async resume() { return this.open(() => this.api.current(), true); }
  async open(load, resuming) {
    if (this.s.busy) return { ok: false };
    this.set({ busy: true });
    try {
      const snap = await load();
      this.syncClock(snap);
      let draft = snap.draft ?? emptyDraft();
      this.revision = snap.revision || 0;
      this.dirty = false;
      if (resuming && snap.status === 'active') {
        const stored = this.localLoad(snap);
        if (stored) { draft = stored.draft; this.revision = Math.max(this.revision, stored.revision || 0); this.dirty = true; }
      }
      this.set({ snap, draft, phase: snap.status === 'complete' ? 'complete' : 'exam', timeUp: false, questionKey: this.s.questionKey + 1, save: this.dirty ? 'Saving…' : 'Saved' });
      if (snap.status === 'complete') this.notifyComplete(snap);
      else this.startPolling();
      if (this.dirty) this.flush();
      return { ok: true };
    } catch (e) {
      if (resuming && e.status === 401) this.api.clear?.();
      return { ok: false, error: e.message };
    } finally { this.set({ busy: false }); }
  }

  startPolling() { clearInterval(this.pollTimer); this.pollTimer = setInterval(() => this.poll(), this.pollMs); }

  notifyComplete(snap) {
    clearInterval(this.pollTimer);
    const flag = `mock-complete-${snap.id}`;
    try { if (this.storage.getItem(flag)) return; this.storage.setItem(flag, '1'); } catch { /* still notify once per page */ }
    if (this.notified === snap.id) return;
    this.notified = snap.id;
    this.onComplete(snap);
  }

  // A newer snapshot from the server. Older ones (a slow poll overtaken by a save) are ignored.
  accept(snap) {
    const cur = this.s.snap;
    if (this.dead || !snap?.id) return;
    if (cur && cur.id === snap.id && (snap.index < cur.index || (snap.index === cur.index && snap.revision < cur.revision))) return;
    this.syncClock(snap);
    const moved = cur?.question?.id !== snap.question?.id || cur?.status !== snap.status;
    this.revision = Math.max(this.revision, snap.revision || 0);
    if (moved) {
      let notice = null;
      if (cur && !this.submitting && snap.index > cur.index) {
        const n = snap.index - cur.index;
        notice = n === 1 ? `Time ended for question ${cur.index + 1}. Your last saved response was locked.`
          : `Time ended for questions ${cur.index + 1}–${snap.index}. Your last saved responses were locked.`;
      }
      this.dirty = false; this.nearDeadlineFlush = false;
      this.revision = snap.revision || 0;
      clearTimeout(this.saveTimer);
      this.set({ snap, draft: snap.draft ?? emptyDraft(), phase: snap.status === 'complete' ? 'complete' : 'exam', timeUp: false, questionKey: this.s.questionKey + 1, save: 'Saved', ...(notice ? { notice } : {}) });
      if (snap.status === 'complete') this.notifyComplete(snap);
    } else {
      this.set(this.dirty ? { snap } : { snap, draft: snap.draft ?? emptyDraft(), save: this.s.timeUp ? this.s.save : 'Saved' });
    }
  }

  // ── editing and saving ──
  edit(update) {
    const snap = this.s.snap;
    if (this.dead || this.s.phase !== 'exam' || snap?.status !== 'active' || this.remaining() <= 0) return false;
    const draft = update(this.s.draft);
    if (draft === this.s.draft) return false;
    this.dirty = true; this.editVersion++;
    this.set({ draft, save: 'Saving…' });
    this.localSave();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), this.saveDelay);
    return true;
  }

  flush() {
    this.queue = this.queue.then(async () => {
      const snap = this.s.snap;
      if (!this.dirty || !snap?.question || snap.status !== 'active') return;
      const version = this.editVersion, questionId = snap.question.id, draft = this.s.draft;
      this.revision++;
      try {
        const r = await this.api.save({ questionId, revision: this.revision, draft });
        if (this.dead) return;
        if (version === this.editVersion && r.accepted) this.dirty = false;
        if (r.reason === 'stale') {
          this.revision = Math.max(this.revision, r.revision || 0);
          this.setSave('Retrying save…');
          clearTimeout(this.saveTimer);
          this.saveTimer = setTimeout(() => this.flush(), 150);
        } else if (r.reason === 'locked') this.set({ notice: 'Time ended. Your last saved response was locked.' });
        this.accept(r);
        if (!this.dirty) { this.localSave(); if (!this.s.timeUp) this.setSave('Saved'); }
      } catch {
        this.setSave('Offline · saved on this device');
        this.localSave();
      }
    });
    return this.queue;
  }

  async poll() {
    if (this.dead || this.s.phase !== 'exam' || this.s.busy) return;
    try {
      if (this.dirty) await this.flush();
      this.accept(await this.api.current());
    } catch { if (!this.s.timeUp) this.setSave('Connection lost · timer continues'); }
  }

  async submit() {
    const snap = this.s.snap;
    if (this.s.busy || !snap?.question || this.remaining() <= 0) return { ok: false };
    this.set({ busy: true });
    this.submitting = true;
    const id = snap.question.id;
    try {
      clearTimeout(this.saveTimer);
      await this.flush();
      if (this.dirty) throw Error('Reconnect so your latest response can be saved before submitting.');
      if (this.s.snap.question?.id !== id) return { ok: true, moved: true }; // time ended meanwhile
      this.accept(await this.api.submit(id));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally { this.submitting = false; this.set({ busy: false }); }
  }

  visibility(hidden) {
    if (this.s.phase !== 'exam') return;
    this.api.event(hidden ? 'background' : 'foreground').catch(() => {});
    if (hidden) { this.localSave(); this.flush(); } else this.poll();
  }

  // Back to preparation for a new attempt (retake). The finished attempt stays on the server.
  reset() {
    clearTimeout(this.saveTimer); clearTimeout(this.timeUpTimer); clearInterval(this.pollTimer);
    this.dirty = false; this.revision = 0; this.nearDeadlineFlush = false;
    this.set({ phase: 'prepare', snap: null, draft: emptyDraft(), save: 'Saved', timeUp: false, notice: null, questionKey: this.s.questionKey + 1 });
  }

  clearNotice() { if (this.s.notice) this.set({ notice: null }); }

  // detach() stops every timer and drops late responses; attach() resumes (React may remount).
  detach() {
    this.dead = true;
    clearTimeout(this.saveTimer); clearTimeout(this.timeUpTimer); clearInterval(this.pollTimer);
  }
  attach() {
    this.dead = false;
    if (this.s.phase === 'exam') { this.startPolling(); if (this.dirty) this.flush(); }
  }
}
