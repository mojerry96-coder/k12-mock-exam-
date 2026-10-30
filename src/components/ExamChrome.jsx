import { forwardRef, useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';

const clock = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Header shared by both exam layouts: back, subject • topic, tools (and full screen on tablet).
export function ExamHeader({ question, mode, fullscreen, onBack, onSettings, onFullscreen }) {
  return (
    <header className="exam-header">
      <button className="ghost back" onClick={onBack}><Icon.back /> Mock Exam</button>
      <p className="exam-subject"><b>{question.subject}</b> <span aria-hidden="true">•</span> <span>{question.topic}</span></p>
      <div className="header-tools">
        <button className="round" onClick={onSettings} aria-label="Exam tools (the timer keeps running)"><Icon.gear /></button>
        {mode === 'tablet' && <button className="round" onClick={onFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? <Icon.shrink /> : <Icon.expand />}</button>}
      </div>
    </header>
  );
}

export function Progress({ index, total }) {
  return (
    <div className="q-progress">
      <span>Question {index + 1} of {total}</span>
      <span className="q-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < index ? 'done' : i === index ? 'current' : ''} />)}
      </span>
    </div>
  );
}

// The countdown reads the session's server-synchronised clock four times a second. It is
// announced to screen readers once a minute and in the last 20 seconds, never every tick.
export function Timer({ session, compact = false }) {
  const [left, setLeft] = useState(() => session.remaining());
  useEffect(() => {
    const id = setInterval(() => { session.tick(); setLeft(session.remaining()); }, 250);
    return () => clearInterval(id);
  }, [session]);
  const secs = Math.ceil(left / 1000);
  const low = secs <= 20;
  const spoken = secs === 0 ? 'Time is up for this question' : secs % 60 === 0 || (low && secs % 5 === 0) ? `${clock(left)} left for this question` : null;
  return (
    <div className={`timer${low ? ' low' : ''}${secs === 0 ? ' out' : ''}${compact ? ' compact' : ''}`} role="timer" aria-label={`${clock(left)} left for this question`}>
      <Icon.clock />
      <span className="timer-text"><strong>{clock(left)}</strong><small>This question</small></span>
      <span className="sr-only" aria-live="polite">{spoken ?? ''}</span>
    </div>
  );
}

const OPS = ['+', '-', '×', '÷', '=', 'a/b', '√'];
const LABEL = { '-': '−' };
const NAME = { '+': 'plus', '-': 'minus', '×': 'times', '÷': 'divide', '=': 'equals', 'a/b': 'fraction', '√': 'square root' };

// Maths operator buttons. They never take focus, so the caret stays in the field being written.
export const Operators = forwardRef(function Operators({ onOp, onKeypad, keypadOpen, disabled, ops = OPS }, keypadRef) {
  const keep = (e) => e.preventDefault();
  return (
    <div className="operators" role="toolbar" aria-label="Maths symbols">
      {ops.map((op) => (
        <button key={op} className="op-btn" aria-label={`Insert ${NAME[op]}`} disabled={disabled} onPointerDown={keep} onClick={() => onOp(op)}>
          {op === 'a/b' ? <span className="ab"><span>a</span><span>b</span></span> : LABEL[op] ?? op}
        </button>
      ))}
      <button ref={keypadRef} className={`op-btn num${keypadOpen ? ' on' : ''}`} aria-expanded={keypadOpen} aria-label="Number pad" disabled={disabled} onPointerDown={keep} onClick={onKeypad}>123</button>
    </div>
  );
});

export function SubmitButton({ last, disabled, onClick }) {
  return <button className="primary submit-btn" disabled={disabled} onClick={onClick}>{last ? 'Submit exam' : 'Submit & next'} <Icon.next /></button>;
}

export function SaveStatus({ text, pill = false }) {
  return <span className={`save-status${pill ? ' pill' : ''}${/Offline|lost|Retry/.test(text) ? ' warn' : ''}`} role="status">{text}</span>;
}

// Multiple-choice answers (English, Biology and any `choice` item): large cards, one selectable.
export function Choices({ question, value, disabled, onChange }) {
  return (
    <fieldset className="choices" disabled={disabled}>
      <legend>Choose one answer</legend>
      {question.options.map((o, i) => (
        <label key={o} className={`choice${value === o ? ' chosen' : ''}`}>
          <input type="radio" name={`answer-${question.id}`} value={o} checked={value === o} onChange={() => onChange(o)} />
          <span className="choice-key" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
          <span className="choice-text">{o}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Coordinates in a prompt are picked out in the graph's orange, as in the references.
export function Prompt({ question, className = '' }) {
  const parts = question.prompt.split(/(\(\s*[−-]?\d+(?:\.\d+)?\s*,\s*[−-]?\d+(?:\.\d+)?\s*\))/g);
  return (
    <h1 className={`question ${className}`} id={`q-${question.id}`}>
      {parts.map((p, i) => (i % 2 ? <span key={i} className="pt-text">{p}</span> : p))}
    </h1>
  );
}
