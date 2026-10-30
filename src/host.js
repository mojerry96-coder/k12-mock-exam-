// Host integration. The Gradient Lab app supplies navigation, theme, a trusted device check and
// (optionally) handwriting recognition through mountMockExam(el, { host }) or
// window.__GRADIENT_HOST__. Without a host, events are still emitted on window
// (mockexam:start, mockexam:exit, mockexam:complete) and nothing is invented here.
export function resolveHost(explicit) {
  const h = explicit ?? globalThis.__GRADIENT_HOST__ ?? {};
  const emit = (name, detail) => globalThis.dispatchEvent?.(new CustomEvent(`mockexam:${name}`, { detail }));
  return {
    connected: !!(explicit ?? globalThis.__GRADIENT_HOST__),
    settings: h.settings ?? null, // { dark }
    // async () => ({ ok, reason }) from a trusted secure-browser / attestation check
    deviceCheck: typeof h.deviceCheck === 'function' ? h.deviceCheck : null,
    // async (payload, { signal, questionId }) => ({ expression }); otherwise the server adapter is used
    recognizeInk: typeof h.recognizeInk === 'function' ? h.recognizeInk : null,
    // Whether the candidate may retake after finishing (the host's rules decide; on by default).
    allowRetake: h.allowRetake !== false,
    start(detail) { emit('start', detail); h.onStart?.(detail); },
    retake(detail) { emit('retake', detail); h.onRetake?.(detail); },
    exit(detail) { emit('exit', detail); if (h.onExit) { h.onExit(detail); return true; } return false; },
    // Fired once per attempt after the server reports it complete. Badges and XP are the host's
    // to award, idempotently, from its own record of the attempt.
    complete(detail) { emit('complete', detail); h.onComplete?.(detail); },
  };
}
