// Looping wireframe micro-animations shown inside each portal card (200×120 box).
// Shapes under `.wire` are line art that redraws itself when the card is hovered.

const svg = (name, body) =>
  `<svg class="art art-${name}" viewBox="0 0 200 120" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">${body}</svg>`;

const f1 = (n) => n.toFixed(1);

export const ART = {
  // DCMesh: blinking rack LEDs; one node runs hot until the scan line passes it.
  rack() {
    let units = '', leds = '';
    [36, 82, 128].forEach((x, r) => {
      for (let k = 0; k < 9; k++) {
        const y = 24 + k * 9.4;
        units += `<path d="M${x + 4} ${f1(y)}h30"/>`;
        if (r !== 1 || k !== 2) leds += `<circle class="led" cx="${x + 31}" cy="${f1(y + 4.4)}" r="1.3" style="--d:${(((r * 9 + k) * 0.37) % 2.4).toFixed(2)}s"/>`;
      }
    });
    return svg('rack', `
      <g class="wire"><rect x="36" y="16" width="38" height="92"/><rect x="82" y="16" width="38" height="92"/><rect x="128" y="16" width="38" height="92"/><path d="M24 108H178"/></g>
      <g class="wire thin">${units}</g>
      <g class="leds">${leds}</g>
      <circle class="led-hot" cx="113" cy="47.2" r="2.4"/>
      <rect class="scan" x="30" y="14" width="142" height="1.4"/>`);
  },

  // Port: ship-to-shore crane trolley shuttling a container.
  crane() {
    let truss = 'M22 36';
    for (let x = 22; x < 186; x += 8) truss += `L${x + 4} 30L${x + 8} 36`;
    return svg('crane', `
      <g class="wire">
        <path d="M54 104V38M80 104V38M50 38H84M54 66H80M54 66L80 38"/>
        <path d="M58 38L67 10L76 38"/>
        <path d="M22 30H186M22 36H186M22 30V36M186 30V36"/>
        <path d="M67 10L182 30M67 10L26 30"/>
        <rect x="30" y="22" width="16" height="8"/>
        <path d="M0 104H104"/>
        <path d="M104 104H196L190 114H110Z"/>
        <rect x="118" y="94" width="20" height="10"/><rect x="140" y="94" width="20" height="10"/><rect x="162" y="94" width="20" height="10"/><rect x="140" y="84" width="20" height="10"/>
      </g>
      <g class="wire thin"><path d="${truss}"/></g>
      <path class="water" d="M-20 117q5-3 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0"/>
      <g class="trolley">
        <rect class="cab" x="122" y="36" width="14" height="5"/>
        <path class="hoist" d="M126 41V72M132 41V72"/>
        <rect class="load" x="117" y="72" width="24" height="10"/>
      </g>`);
  },

  // Manufacturing: conveyor flow, a swinging gantry arm and a turning gear.
  factory() {
    let rollers = '', teeth = '', items = '';
    for (let x = 28; x <= 186; x += 14) rollers += `<circle cx="${x}" cy="88" r="3"/>`;
    for (let i = 0; i < 8; i++) teeth += `<rect x="-2" y="-16" width="4" height="5" transform="rotate(${i * 45})"/>`;
    for (let i = 0; i < 4; i++) items += `<rect class="item" x="-16" y="70" width="14" height="12" style="--d:${-i * 1.5}s"/>`;
    return svg('factory', `
      <g class="wire">
        <path d="M18 82H192M18 94H192M30 94V112M100 94V112M170 94V112M8 112H200"/>
        <path d="M18 14H192M18 8V14M192 8V14"/>
      </g>
      <g class="wire thin">${rollers}</g>
      <g class="wire items">${items}</g>
      <g class="arm"><g class="wire"><rect x="112" y="11" width="18" height="6"/><path d="M121 17V40L134 54M130 58L134 54L139 57M121 40h0"/><circle cx="121" cy="40" r="2.5"/></g></g>
      <g transform="translate(46 46)"><g class="gear"><g class="wire"><circle r="11"/><circle r="4"/>${teeth}</g></g></g>`);
  },

  // Smart Campus: windows lighting up across a skyline, a sensor mast pinging.
  campus() {
    const blds = [[18, 56, 32, 52], [56, 30, 36, 78], [98, 64, 28, 44], [132, 42, 44, 66]];
    let wins = '', i = 0;
    for (const [x, y, w, h] of blds) {
      for (let yy = y + 8; yy < y + h - 6; yy += 9) {
        for (let xx = x + 5; xx < x + w - 5; xx += 8) {
          wins += `<rect class="win" x="${xx}" y="${yy}" width="4" height="4" style="--d:${((i++ * 0.73) % 5).toFixed(2)}s"/>`;
        }
      }
    }
    return svg('campus', `
      <g class="wire">${blds.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('')}<path d="M8 108H196M74 30V14M98 64Q112 50 126 64"/></g>
      <g class="wins">${wins}</g>
      <circle class="ping" cx="74" cy="14" r="3"/>
      <circle class="ping p2" cx="74" cy="14" r="3"/>`);
  },

  // Airport: radar sweep, tower, and an aircraft departing the runway.
  airport() {
    const route = 'M100 110C100 88 112 60 150 38S214 4 240 -6';
    return svg('airport', `
      <g class="wire">
        <path d="M44 114L92 66M156 114L108 66M92 66H108M10 114H196"/>
        <path d="M168 112V60M162 60H174L178 50H158ZM160 50L163 44H173L176 50"/>
        <circle cx="40" cy="34" r="20"/><circle cx="40" cy="34" r="11"/>
      </g>
      <g class="wire thin"><path d="M100 110V104M100 98V93M100 88V84M100 80V77M100 74V72M40 14V54M20 34H60"/></g>
      <g class="radar"><path class="sweep" d="M40 34L40 14A20 20 0 0 1 54.1 19.9Z"/><path class="beam" d="M40 34V14"/></g>
      <g class="plane"><path d="M-9 0H9M9 0L6-1.6M9 0L6 1.6M2 0L-3-8M2 0L-3 8M-6 0L-9-3.5M-6 0L-9 3.5"/><animateMotion dur="5s" repeatCount="indefinite" rotate="auto" path="${route}"/></g>`);
  },

  // Retail: footfall heat zones pulsing over the shop floor, a shopper's path.
  retail() {
    const route = 'M24 104C56 100 70 64 100 68S150 104 176 72';
    return svg('retail', `
      <defs><radialGradient id="retail-heat"><stop offset="0" stop-color="currentColor" stop-opacity=".85"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>
      <g class="wire">
        <path d="M18 36H182V110H18Z"/><path d="M14 36L26 20H174L186 36"/>
        <path d="M50 20L44 36M80 20L77 36M110 20L111 36M140 20L144 36"/>
      </g>
      <g class="wire thin"><path d="M34 58H86M34 76H86M34 94H86M114 58H166M114 76H166M114 94H166"/></g>
      <g class="heat"><circle cx="58" cy="76" r="16"/><circle cx="142" cy="88" r="20" style="--d:-.9s"/><circle cx="100" cy="100" r="11" style="--d:-1.7s"/></g>
      <path class="route" d="${route}"/>
      <circle class="shopper" r="2.6"><animateMotion dur="6s" repeatCount="indefinite" path="${route}"/></circle>`);
  },

  // SIA Xcel: a conversation that generates a dashboard.
  chat() {
    return svg('chat', `
      <g class="bubble b1"><g class="wire">
        <path d="M28 18H100Q108 18 108 26V46Q108 54 100 54H52L40 64V54H28Q20 54 20 46V26Q20 18 28 18Z"/>
        <path class="thin" d="M30 30H92M30 40H74"/>
      </g></g>
      <g class="bubble b2"><g class="wire">
        <path d="M100 62H172Q180 62 180 70V88Q180 96 172 96H160V106L148 96H100Q92 96 92 88V70Q92 62 100 62Z"/>
      </g>
        <circle class="dot" cx="122" cy="79" r="3"/><circle class="dot" cx="136" cy="79" r="3" style="--d:.15s"/><circle class="dot" cx="150" cy="79" r="3" style="--d:.3s"/>
      </g>
      <g class="bars"><rect x="22" y="86" width="8" height="24"/><rect x="34" y="78" width="8" height="32" style="--d:.2s"/><rect x="46" y="92" width="8" height="18" style="--d:.4s"/><rect x="58" y="72" width="8" height="38" style="--d:.6s"/><rect x="70" y="84" width="8" height="26" style="--d:.8s"/></g>`);
  },

  // SIA Facility: a heartbeat running across the building it is managing.
  facility() {
    const ecg = 'M0 74H36L42 74L48 54L55 96L61 64L66 74H118L124 74L130 48L137 100L143 66L148 74H200';
    return svg('facility', `
      <g class="wire">
        <path d="M60 46L104 32L150 44V96L106 110L60 98Z"/>
        <path d="M60 46L106 58L150 44M106 58V110"/>
        <path class="thin" d="M60 63L106 75L150 61M60 80L106 92L150 78M75 50.5V102M90 54.5V106M121 54V105.5M136 49.5V100.5"/>
        <ellipse cx="104" cy="45" rx="9" ry="3.5"/>
      </g>
      <circle class="node" cx="104" cy="45" r="2.5"/><circle class="node" cx="80" cy="70" r="2" style="--d:.6s"/><circle class="node" cx="132" cy="84" r="2" style="--d:1.2s"/>
      <path class="ecg-base" d="${ecg}"/>
      <path class="ecg" pathLength="1" d="${ecg}"/>`);
  },
};
