import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import css from './styles.css?inline';
import { MockExam } from './MockExam.jsx';
import { createHttpAdapter } from './lib/api.js';
import { resolveHost } from './host.js';

// Fonts must be declared on the document: @font-face inside a shadow root is ignored.
function installFonts(assets) {
  if (document.getElementById('mock-exam-fonts')) return;
  const style = document.createElement('style');
  style.id = 'mock-exam-fonts';
  style.textContent = `
@font-face { font-family: 'Patrick Hand'; src: url('${assets}/fonts/PatrickHand-Regular.ttf') format('truetype'); font-display: block; }
@font-face { font-family: 'SN Pro'; src: url('${assets}/fonts/SNPro-VariableFont_wght.ttf') format('truetype'); font-weight: 200 900; font-display: block; }`;
  document.head.appendChild(style);
}

/**
 * Mounts the mock exam into `el` inside a shadow root, so its styles and the host's never mix.
 *   mountMockExam(el, { examId, assets, api, host, storage })
 * Returns { unmount() }. Unmount before mounting into the same element again.
 */
export function mountMockExam(el, { examId = null, assets = '/assets', api, host, storage = window.sessionStorage } = {}) {
  installFonts(assets);
  const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${css}</style><div class="mx-root"></div>`;
  const root = createRoot(shadow.querySelector('.mx-root'));
  root.render(
    <StrictMode>
      <MockExam api={api ?? createHttpAdapter('/api', storage)} examId={examId} assets={assets} host={resolveHost(host)} storage={storage} />
    </StrictMode>,
  );
  return { unmount() { root.unmount(); shadow.replaceChildren(); } };
}

// Standalone page (index.html): ?exam=english (mathematics, english, biology, mixed,
// gradient-challenge) opens that exam; otherwise the candidate picks a subject.
const el = document.getElementById('mock-exam');
if (el) mountMockExam(el, { examId: new URLSearchParams(location.search).get('exam') });
