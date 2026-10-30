const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Fitila's animated circular head, the practice build's crop of the K12 "hint" loop. Decorative;
// with reduced motion it shows the still frame.
export function FitiHead({ size = 50, className = '', assets = '/assets' }) {
  return (
    <span className={`fiti-head ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <video src={`${assets}/fitila-head-loop.mp4`} poster={`${assets}/fitila-head-poster.png`} width={size} height={size}
        autoPlay={!reducedMotion()} loop muted playsInline disablePictureInPicture preload="auto" tabIndex={-1} />
    </span>
  );
}
