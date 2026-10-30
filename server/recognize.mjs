// Server-side handwriting adapter. Credentials stay on the server (MATHPIX_APP_ID / MATHPIX_APP_KEY).
// Returns the recognised expression as editable linear text; it never solves or simplifies.

// Convert Mathpix LaTeX into the linear syntax the editor and checker share.
export function latexToLinear(latex) {
  let s = String(latex)
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:,|;|:|!|quad|qquad)/g, ' ')
    .replace(/\\times|\\cdot/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/[{}]\s*\^\s*\{/g, (m) => m);
  // \frac{a}{b} → (a)/(b), innermost first so nested fractions resolve.
  const frac = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/;
  while (frac.test(s)) s = s.replace(frac, '($1)/($2)');
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    .replace(/\^\s*\{([^{}]*)\}/g, '^($1)')
    .replace(/_\s*\{([^{}]*)\}/g, '$1')
    .replace(/_(\w)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop brackets around a single number: (4)/(2) → 4/2
  return s.replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');
}

export function createRecognizer({ appId, appKey, fetchImpl = fetch, endpoint = 'https://api.mathpix.com/v3/strokes' }) {
  if (!appId || !appKey) return null;
  return async function recognize({ strokes, signal }) {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', app_id: appId, app_key: appKey },
      body: JSON.stringify({ strokes: { strokes: { x: strokes.map((s) => s.x), y: strokes.map((s) => s.y) } } }),
      signal,
    });
    if (!res.ok) throw new Error(`Recognition provider returned ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(String(data.error));
    const latex = data.latex_styled || data.latex_simplified || data.text || '';
    return {
      expression: latexToLinear(latex),
      latex,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      alternatives: [],
    };
  };
}
