import { useMemo } from 'react';
import { Fitila } from '../components/Fitila.jsx';
import { WriteOn } from '../components/WriteOn.jsx';
import { Icon } from '../components/Icons.jsx';
import { CloseButton } from './Preparation.jsx';

const COLORS = ['#5ABBF2', '#FE6011', '#FFC93C', '#12AA75', '#7147CF', '#F49AA5'];

// Completion: Fitila celebrating among sparkles, the finisher badge, result readiness and the
// attempt summary. "Review responses" appears only when the server has released marking.
export function Completion({ assets, snap, onReview, onRetake, onDone, onClose }) {
  const confetti = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    dx: `${Math.round(Math.cos((i / 34) * Math.PI * 2) * (180 + (i % 5) * 50))}px`,
    dy: `${Math.round(Math.sin((i / 34) * Math.PI * 2) * (160 + (i % 4) * 46) + 120)}px`,
    r: `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg`, c: COLORS[i % COLORS.length], d: `${(i % 6) * 40}ms`,
  })), []);
  const subjects = snap.exam?.subjects ?? snap.subjects;
  const topics = snap.exam?.topics ?? snap.topics;
  const scope = subjects.length === 1 ? `${subjects[0]} · ${topics.length === 1 ? topics[0] : `${topics.length} topics`}` : subjects.join(' · ');
  const ready = snap.marking === 'ready';
  return (
    <main className="intro done">
      <CloseButton onClose={onClose} label="Close and return to dashboard" />
      <section className="intro-left">
        <div className="celebrate-stage">
          <Sparkles />
          <Fitila pose="celebrate" assets={assets} label="Fitila the parrot celebrates with both wings up" className="intro-fitila pop" />
          <div className="confetti" aria-hidden="true">{confetti.map((p, i) => <i key={i} style={{ '--dx': p.dx, '--dy': p.dy, '--r': p.r, background: p.c, animationDelay: p.d }} />)}</div>
        </div>
        <WriteOn className="intro-title" lines={['Mock complete!']} delay={400} />
        <p className="intro-sub done-sub"><i className="ok-dot"><Icon.tick /></i> {snap.expired ? 'Responses locked in' : 'Responses submitted'}</p>
      </section>

      <section className="intro-card" aria-label="Your mock exam">
        <div className="badge-panel rise" style={{ '--d': '160ms' }}>
          <span className="badge-wrap"><img className="badge" src={`${assets}/badge.webp`} alt="" /><i className="badge-check"><Icon.tick /></i></span>
          <div>
            <p className="badge-kicker">Completion badge</p>
            <h2 className="badge-title">Mock Finisher</h2>
          </div>
        </div>

        <div className="result-panel rise" style={{ '--d': '240ms' }}>
          <Gem />
          <div>
            <h3>{ready ? 'Your review is ready' : 'Results on the way'}</h3>
            <p>{ready ? 'See your answers beside the marking.' : 'Score and XP appear after marking.'}</p>
          </div>
          {ready && <button className="small" onClick={onReview}>Review</button>}
        </div>

        <div className="summary rise" style={{ '--d': '320ms' }}>
          <p className="summary-kicker">Exam summary</p>
          <div className="summary-row">
            <i className="tile blue"><Icon.calc /></i>
            <b>{scope}</b>
            <span className="pill ok"><Icon.tick /> {snap.submitted} of {snap.total} submitted</span>
          </div>
          {snap.expired > 0 && <p className="summary-note">{snap.expired} {snap.expired === 1 ? 'question was' : 'questions were'} locked when time ended, with the last saved response.</p>}
        </div>

        <div className="done-actions rise" style={{ '--d': '400ms' }}>
          {onRetake && <button className="big secondary" onClick={onRetake}>Retake exam</button>}
          <button className="primary big done-btn" onClick={onDone} data-autofocus>Back to dashboard</button>
        </div>
      </section>
    </main>
  );
}

const Sparkles = () => (
  <svg className="sparkles" viewBox="0 0 640 560" aria-hidden="true" focusable="false">
    {[[520, 60, 1.2], [60, 330, 1], [600, 470, 1], [300, 20, 0.6]].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <path className="sparkle" style={{ animationDelay: `${i * 0.35}s` }} d="M0 -26C3 -8 8 -3 26 0C8 3 3 8 0 26C-3 8 -8 3 -26 0C-8 -3 -3 -8 0 -26Z" fill="#FFC93C" />
      </g>
    ))}
    <g stroke="#5ABBF2" strokeWidth="9" strokeLinecap="round" className="dash"><path d="M28 165l14 30" /><path d="M44 158l14 30" /></g>
    <g stroke="#5ABBF2" strokeWidth="9" strokeLinecap="round" className="dash"><path d="M628 285l-30 16" /><path d="M638 300l-30 16" /></g>
    <rect className="bit" x="105" y="520" width="26" height="26" rx="5" fill="#5ABBF2" transform="rotate(45 118 533)" />
    <rect className="bit" x="572" y="500" width="14" height="30" rx="7" fill="#F49AA5" transform="rotate(-25 579 515)" />
  </svg>
);

const Gem = () => (
  <svg className="gem" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M32 4L56 20V44L32 60L8 44V20Z" fill="#3E8FEA" />
    <path d="M32 4L56 20L32 28L8 20Z" fill="#7CC0FB" />
    <path d="M8 20L32 28V60L8 44Z" fill="#2F7AD8" />
    <path d="M56 20L32 28V60L56 44Z" fill="#1F5FBF" />
    <path d="M32 28L20 24L32 4L44 24Z" fill="#A9D8FF" opacity=".8" />
    <path d="M50 6l1.4 3.4L55 11l-3.6 1.6L50 16l-1.4-3.4L45 11l3.6-1.6z" fill="#BFE3FF" />
  </svg>
);
