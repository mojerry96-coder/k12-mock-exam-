import { useEffect, useRef } from 'react';

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Fitila's transparent looping clips from the K12 Gradient Lab build (Kling 3.0, matted frame by
// frame): HEVC-with-alpha .mov for Safari, VP9-alpha .webm for Chrome, Edge and Firefox, and the
// transparent poster as the still for reduced motion or a blocked autoplay. Only the preparation
// and completion screens show her.
export function Fitila({ pose, assets = '/assets', label, className = '' }) {
  const video = useRef(null);
  const still = reducedMotion();
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.play?.().catch(() => {}); // a blocked autoplay just leaves the poster showing
  }, [pose]);
  const base = `${assets}/fitila/${pose}`;
  return (
    <figure className={`fitila ${className}`} role="img" aria-label={label}>
      {still ? <img src={`${base}_poster.webp`} alt="" /> : (
        <video ref={video} key={pose} poster={`${base}_poster.webp`} autoPlay loop muted playsInline disablePictureInPicture preload="auto" tabIndex={-1} aria-hidden="true">
          <source src={`${base}.mov`} type={'video/quicktime; codecs="hvc1"'} />
          <source src={`${base}.webm`} type="video/webm" />
        </video>
      )}
    </figure>
  );
}
