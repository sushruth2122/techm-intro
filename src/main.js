import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { Intro } from './intro/Intro.js';
import { mountHub } from './hub/hub.js';

// The intro plays once per browser session; `?intro` forces it, `R` or the refresh button replays it.
const SEEN_KEY = 'astrikos.intro.seen';

const skipBtn = document.getElementById('skip');
let intro = null;
const hub = mountHub(document.getElementById('hub'), {
  onReplay: () => play(),
  onPreview: (i) => {
    intro?.preview(i);
    hub.setPaused(true);
  },
  onRelease: () => {
    intro?.resume();
    hub.setPaused(false);
  },
});

const showHub = (lock) => {
  hub.reveal({ lock });
  document.body.classList.add('is-hub');
};

try {
  intro = new Intro({
    canvas: document.getElementById('stage'),
    overlay: document.getElementById('intro'),
    stage: document.getElementById('stage-ui'),
    linkRects: () => hub.linkRects(),
    onReveal: ({ skipped }) => showHub(!skipped),
    onScene: (i, dwell) => hub.setActive(i, dwell),
    onDone: () => {
      skipBtn.hidden = true;
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {}
    },
  });
} catch (err) {
  // No WebGL: the hub still works on its own.
  console.warn('Intro disabled:', err);
  document.body.classList.add('no-webgl');
}

function play() {
  if (!intro) return;
  hub.conceal();
  document.body.classList.remove('is-hub');
  skipBtn.hidden = false;
  intro.play();
}

skipBtn.addEventListener('click', () => intro?.skip());
addEventListener('keydown', (e) => {
  if (intro?.playing && ['Escape', 'Enter', ' '].includes(e.key)) {
    e.preventDefault();
    intro.skip();
  } else if (
    !intro?.playing &&
    (e.key === 'r' || e.key === 'R') &&
    !e.ctrlKey && !e.metaKey && !e.altKey &&
    !e.target.closest?.('input, textarea')
  ) {
    play();
  }
});

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let seen = false;
try {
  seen = sessionStorage.getItem(SEEN_KEY) === '1';
} catch {}

const params = new URLSearchParams(location.search);
if (intro && (params.has('intro') || params.has('at') || (!seen && !reduceMotion))) {
  play();
  if (params.has('at')) intro.hold(Number(params.get('at')));
} else {
  intro?.startLoop({ still: reduceMotion });
  showHub(false);
}
if (import.meta.env.DEV) window.__intro = intro;
