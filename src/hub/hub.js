import { BRAND, PORTALS } from '../config.js';
import { STORY } from '../intro/story.js';
import { ART } from './art.js';

const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
const REFRESH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.9 0 3.3.9 4.3 2.2M12.8 1.8v3.1H9.7"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function link(p, i) {
  return `
    <a class="link" href="${esc(p.url)}" data-index="${i}" style="--i:${i}">
      <span class="link-art">${ART[p.art]?.() ?? ''}</span>
      <span class="link-body">
        <span class="link-top">
          <b>${String(i + 1).padStart(2, '0')}</b>
        </span>
        <span class="link-title">${esc(p.title)}</span>
        <span class="link-hot">${(p.hot || []).map(esc).join(' · ')}</span>
      </span>
      <span class="link-go" aria-hidden="true">${ARROW}</span>
      <span class="link-bar" aria-hidden="true"><i></i></span>
    </a>`;
}

export function mountHub(root, { onReplay, onPreview, onRelease }) {
  const half = Math.ceil(PORTALS.length / 2);
  const words = [...new Set(STORY.flatMap((s) => [...s.title.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => m[1]).concat(s.hot)))];
  const ticker = words.map((w) => `<span>${esc(w)}</span>`).join('');

  root.innerHTML = `
    <div class="hub-inner">
      <header class="hub-top">
        <div class="logos">
          ${BRAND.techm ? `<img class="logo-techm" src="${BRAND.techm.src}" alt="${esc(BRAND.techm.alt)}" />
          <i aria-hidden="true"></i>` : ''}
          <img class="logo-astrikos" src="${BRAND.astrikos.src}" alt="${esc(BRAND.astrikos.alt)}" />
        </div>
        <div class="hub-title">
          <h1>Intelligence Command Center</h1>
        </div>
        <div class="hub-actions">
          <time class="clock" data-clock></time>
          <button class="refresh" type="button" data-replay aria-label="Replay intro" title="Replay intro (R)">${REFRESH}</button>
        </div>
      </header>
      <nav class="links links-l" aria-label="Dashboards">${PORTALS.slice(0, half).map((p, i) => link(p, i)).join('')}</nav>
      <nav class="links links-r" aria-label="More dashboards">${PORTALS.slice(half).map((p, i) => link(p, i + half)).join('')}</nav>
      <footer class="hub-foot" aria-hidden="true"><div class="ticker"><div class="ticker-track">${ticker}${ticker}</div></div></footer>
    </div>`;

  root.querySelectorAll('.wire :is(path, rect, circle, ellipse, line)').forEach((el) => el.setAttribute('pathLength', '1'));

  // SMIL motion (plane, shopper) isn't covered by the CSS reduced-motion rule.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => root.querySelectorAll('svg.art').forEach((s) => (reduce.matches ? s.pauseAnimations() : s.unpauseAnimations()));
  syncMotion();
  reduce.addEventListener?.('change', syncMotion);

  const clock = root.querySelector('[data-clock]');
  const fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const tick = () => {
    const now = new Date();
    clock.textContent = fmt.format(now);
    clock.dateTime = now.toISOString();
  };
  tick();
  setInterval(tick, 1000);

  root.querySelector('[data-replay]').addEventListener('click', () => onReplay?.());

  // Hovering or focusing a link previews its scene in the centre; leaving resumes the loop.
  const links = [...root.querySelectorAll('.link')];
  let hoverTimer = 0;
  const preview = (el) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => onPreview?.(Number(el.dataset.index)), 120);
  };
  const release = () => {
    clearTimeout(hoverTimer);
    onRelease?.();
  };
  for (const el of links) {
    el.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && preview(el));
    el.addEventListener('focus', () => preview(el));
  }
  for (const nav of root.querySelectorAll('.links')) {
    nav.addEventListener('pointerleave', release);
    nav.addEventListener('focusout', (e) => !nav.contains(e.relatedTarget) && release());
  }

  return {
    linkRects() {
      return links.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
    },
    // Highlight the dashboard whose scene is playing; the bar counts down to the next one.
    setActive(i, dwell) {
      for (const el of links) {
        const on = Number(el.dataset.index) === i;
        if (on) {
          el.classList.remove('is-active');
          void el.offsetWidth; // restart the countdown bar
          el.style.setProperty('--dwell', `${dwell}s`);
        }
        el.classList.toggle('is-active', on);
      }
    },
    setPaused(paused) {
      root.classList.toggle('is-paused', paused);
    },
    // `lock`: the links ignite where the globe's fragments land; otherwise a plain fade.
    reveal({ lock }) {
      root.classList.toggle('is-lock', !!lock);
      root.classList.add('is-on');
      root.inert = false;
      root.removeAttribute('aria-hidden');
    },
    conceal() {
      root.classList.remove('is-on', 'is-lock');
      root.inert = true;
      root.setAttribute('aria-hidden', 'true');
    },
  };
}
