import { Fitila } from '../components/Fitila.jsx';
import { WriteOn } from '../components/WriteOn.jsx';
import { Icon } from '../components/Icons.jsx';

export const minutes = (s) => (s % 60 === 0 ? `${s / 60} min` : s < 60 ? `${s} sec` : `${Math.floor(s / 60)} min ${s % 60} s`);

// Preparation: Fitila waving on the left, the exam's badge, size, rules and input choice on the
// right, then the device check. Nothing about the questions themselves is shown before the start.
export function Preparation({ assets, summary, mode, onMode, device, canResume, busy, onCheck, onStart, onTiming, onClose }) {
  const deviceReady = device?.status === 'done' && device.ok;
  const sameTime = summary && summary.seconds.every((s) => s === summary.seconds[0]);
  return (
    <main className="intro prep">
      <CloseButton onClose={onClose} label="Close mock exam" />
      <section className="intro-left">
        <Fitila pose="wave" assets={assets} label="Fitila the parrot waves hello" className="intro-fitila hop" />
        <WriteOn className="intro-title" lines={['Your space', 'to focus.']} delay={500} />
        <p className="intro-sub">Ready for your mock exam?</p>
      </section>

      <section className="intro-card" aria-label="About this mock exam">
        <div className="badge-panel rise" style={{ '--d': '120ms' }}>
          <img className="badge" src={`${assets}/badge.webp`} alt="" />
          <div>
            <p className="badge-kicker">{summary?.label ?? 'Mock exam'}</p>
            <h2 className="badge-title">{summary?.title ?? '…'}</h2>
          </div>
        </div>

        <div className="stat-panel rise" style={{ '--d': '200ms' }}>
          <span className="stat"><i className="tile purple"><Icon.doc /></i><b>{summary ? `${summary.count} question${summary.count === 1 ? '' : 's'}` : '…'}</b></span>
          <span className="stat-sep" aria-hidden="true" />
          <span className="stat"><i className="tile green"><Icon.clock /></i><b>{summary ? (sameTime ? `${minutes(summary.seconds[0])} each` : `Up to ${minutes(Math.max(...summary.seconds))}`) : '…'}</b></span>
        </div>

        <div className="rules rise" style={{ '--d': '280ms' }}>
          <h3>Before you begin</h3>
          <p>Each question has its own timer.<br />Answers lock when time ends.</p>
          <div className="choose" role="radiogroup" aria-label="Pen or keyboard">
            <span>Pen or keyboard</span>
            <button role="radio" aria-checked={mode === 'tablet'} className={`chip pen${mode === 'tablet' ? ' chosen' : ''}`} onClick={() => onMode('tablet')}><Icon.pen /> Pen</button>
            <button role="radio" aria-checked={mode === 'desktop'} className={`chip keys${mode === 'desktop' ? ' chosen' : ''}`} onClick={() => onMode('desktop')}><Icon.keyboard /> Keyboard</button>
          </div>
        </div>

        <div className="start-row rise" style={{ '--d': '360ms' }}>
          <DeviceCheck device={device} />
          {deviceReady
            ? <button className="primary big" disabled={busy || !summary} onClick={onStart} data-autofocus>{canResume ? 'Resume exam' : 'Start exam'}</button>
            : <button className="primary big" disabled={!summary || device?.status === 'running'} onClick={onCheck}>
              {device?.status === 'running' ? 'Checking…' : device?.status === 'done' ? 'Check again' : 'Check device'}
            </button>}
        </div>
        <button className="link timing-link" onClick={onTiming} disabled={!summary}>Preview timing</button>
      </section>
    </main>
  );
}

// The device check as a loader: a percentage bar and one tick per check, filling in as each passes.
function DeviceCheck({ device }) {
  if (!device) return (
    <p className="device-state"><i className="state-dot"><Icon.alert /></i>Device check required</p>
  );
  const { status, results, total, current, ok } = device;
  const pct = Math.round((results.length / total) * 100);
  const failed = results.find((r) => !r.ok && !r.optional);
  const label = status === 'running' ? `Checking ${current.toLowerCase()}…` : ok ? 'Device ready' : failed?.detail ?? 'Check failed';
  return (
    <div className={`device-check ${status}${status === 'done' ? (ok ? ' ok' : ' bad') : ''}`} role="status" aria-live="polite" aria-label={`${label}, ${pct}%`}>
      <div className="dc-top"><span className="dc-label">{label}</span><b className="dc-pct">{pct}%</b></div>
      <div className="dc-bar"><i style={{ width: `${pct}%` }} /></div>
      <ol className="dc-ticks">
        {Array.from({ length: total }, (_, i) => {
          const r = results[i];
          const cls = !r ? (i === results.length && status === 'running' ? 'now' : '') : r.ok ? 'ok' : r.optional ? 'warn' : 'bad';
          return <li key={i} className={cls} title={r?.detail ?? ''}>{r ? (r.ok ? <Icon.tick /> : <Icon.alert />) : null}<span className="sr-only">{r?.detail ?? 'Waiting'}</span></li>;
        })}
      </ol>
    </div>
  );
}

export function CloseButton({ onClose, label }) {
  return <button className="round close-x" onClick={onClose} aria-label={label}><Icon.close /></button>;
}
