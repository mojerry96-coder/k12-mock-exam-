// HTTP adapter for the mock exam API (server/api.mjs). The bearer token is the demo's stand-in for
// the host's authenticated identity; it lives in sessionStorage for this tab only.
export class ServiceUnavailable extends Error {
  constructor(message) { super(message); this.name = 'ServiceUnavailable'; }
}

export function createHttpAdapter(base = '/api', storage = globalThis.sessionStorage, fetchImpl = (...a) => fetch(...a)) {
  const key = 'mock-exam-token-v2';
  let token = null;
  try { token = storage.getItem(key); } catch { /* storage blocked: the attempt lasts while the page is open */ }

  async function request(route, data, signal) {
    const res = await fetchImpl(base + route, {
      method: data === undefined ? 'GET' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 503) throw new ServiceUnavailable(body.message || 'Service not connected.');
    if (!res.ok) throw Object.assign(new Error(body.error || body.message || 'Connection unavailable'), { status: res.status });
    return { ...body, httpStatus: res.status };
  }

  return {
    hasSession: () => !!token,
    clear() { token = null; try { storage.removeItem(key); } catch { /* ignore */ } },
    health: () => request('/health').catch(() => ({ exam: false, recognition: false })),
    exam: (id) => request(`/mock/exams/${encodeURIComponent(id)}`),
    async start(examId) {
      const s = await request('/mock/start', { examId });
      token = s.token;
      try { storage.setItem(key, token); } catch { /* ignore */ }
      return s;
    },
    current: () => request('/mock/current'),
    save: (d) => request('/mock/save', d),
    submit: (questionId) => request('/mock/submit', { questionId }),
    event: (kind) => request('/mock/event', { kind }),
    result: () => request('/mock/result'),
    recognize: (payload, signal) => request('/recognize', payload, signal),
  };
}
