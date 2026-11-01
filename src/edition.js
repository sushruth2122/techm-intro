// Two editions share this code. The default build is Tech Mahindra × Astrikos AI;
// `--mode astrikos` (npm run dev:astrikos / build:astrikos) builds the Astrikos-only
// edition. What differs lives here, in config.js, vite.config.js and index.html's
// <!-- techm --> blocks.
export const ASTRIKOS = import.meta.env.MODE === 'astrikos';

// Brand accent: Tech Mahindra red, or Astrikos magenta (astrikos.ai's alternate colour).
export const ACCENT = ASTRIKOS ? '#FF00B7' : '#E31837';
