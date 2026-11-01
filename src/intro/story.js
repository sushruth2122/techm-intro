// What the intro says about each dashboard, in tour order (matches PORTALS in config.js).
// `title` may wrap trending terms in <mark>; `hot` are keyword chips under the caption.
// Call-outs are pinned to points in that scene (`p`, world units) and appear in order;
// `lift` is the leader-line length in px, `side` places the label left/right/centre.
// A call-out with `resolved` flips to that text once the DCMesh scan has passed it.

export const STORY = [
  {
    kicker: 'DCMesh · Data Center',
    title: '<mark>Predictive Maintenance</mark> & <mark>AI Cooling</mark> for every rack',
    hot: ['Digital Twin', 'PUE', 'AI-ready Capacity', 'Sustainability'],
    callouts: [
      { p: [-1.76, 2.0, 1.66], tone: 'red', lift: 70, side: 'l', title: 'Thermal Anomaly', sub: 'Rack A-03 · failure predicted', resolved: { title: 'Predictive Maintenance', sub: 'Fixed before failure' } },
      { p: [2.93, 2.35, -1.34], tone: 'red', lift: 96, side: 'r', title: 'Thermal Anomaly', sub: 'Rack B-07 · hotspot forming', resolved: { title: 'AI Cooling', sub: 'Airflow rebalanced' } },
      { p: [5.72, 2.3, 1.0], tone: 'cyan', lift: 54, side: 'l', title: 'PUE Optimization', sub: 'CRAC setpoints tuned live' },
      { p: [-3.5, 3.55, -2.0], tone: 'blue', lift: 40, side: 'c', title: 'Digital Twin', sub: 'Every rack, live in 3D' },
    ],
  },
  {
    kicker: 'Port Construction',
    title: 'A <mark>Digital Twin</mark> of every crane, vessel & build',
    hot: ['Smart Port', 'IoT', 'BIM', 'Asset Tracking'],
    callouts: [
      { p: [-3.5, 7.0, -4.0], tone: 'cyan', lift: 56, side: 'c', title: 'IoT Telemetry', sub: 'Load, cycles & wind sensors' },
      { p: [-11.2, 5.0, -5.1], tone: 'blue', lift: 40, side: 'r', title: 'Vessel Tracking', sub: 'ETA & berth slot' },
      { p: [7, 7.6, 4.6], tone: 'cyan', lift: 60, side: 'l', title: 'BIM · Build Progress', sub: 'Construction vs plan, live' },
      { p: [-3.5, 0.1, 1.0], tone: 'green', lift: 34, side: 'c', title: 'Autonomous AGVs', sub: 'Yard-to-quay routing' },
    ],
  },
  {
    kicker: 'Manufacturing',
    title: '<mark>Industry 4.0</mark> with <mark>Edge AI</mark> & <mark>Computer Vision</mark>',
    hot: ['Smart Factory', 'OEE', 'Predictive Quality', 'Robotics'],
    callouts: [
      { p: [0.35, 2.2, -0.83], tone: 'red', lift: 60, side: 'c', title: 'Robotic Cells', sub: 'Orchestrated in real time' },
      { p: [6.5, 2.4, 0], tone: 'cyan', lift: 50, side: 'l', title: 'Computer Vision QC', sub: 'Defects caught in-line' },
      { p: [-4.5, 1.7, -3.7], tone: 'blue', lift: 44, side: 'r', title: 'OEE · Live', sub: 'Machine uptime & throughput' },
      { p: [8.3, 2.1, 3.7], tone: 'green', lift: 40, side: 'l', title: 'Edge AI', sub: 'Inference on the shop floor' },
    ],
  },
  {
    kicker: 'ZMU · Smart Campus',
    title: 'A <mark>Net Zero</mark> campus: occupancy, air quality & energy',
    hot: ['ESG', 'IAQ', 'Space Utilization', 'Smart Lighting'],
    callouts: [
      { p: [-7, 5.0, -1.0], tone: 'cyan', lift: 50, side: 'r', title: 'Occupancy Analytics', sub: 'Floor by floor, live' },
      { p: [3.2, 3.6, -1.5], tone: 'blue', lift: 56, side: 'c', title: 'Indoor Air Quality', sub: 'CO₂ · PM2.5 · humidity' },
      { p: [-2, 4.9, -4], tone: 'green', lift: 36, side: 'l', title: 'Solar Generation', sub: 'Roof arrays toward Net Zero' },
      { p: [7.5, 1.0, 3.6], tone: 'green', lift: 40, side: 'l', title: 'EV Charging', sub: 'Smart load balancing' },
    ],
  },
  {
    kicker: 'Airport',
    title: '<mark>Passenger Flow</mark> & <mark>Air-side Ops</mark> in one view',
    hot: ['Smart Airport', 'Crowd Analytics', 'A-CDM', 'Predictive Ops'],
    callouts: [
      { p: [-4, 3.3, -2], tone: 'cyan', lift: 50, side: 'c', title: 'Passenger Flow', sub: 'Queues & dwell times forecast' },
      { p: [-3, 1.8, -11], tone: 'blue', lift: 40, side: 'r', title: 'Baggage Tracking', sub: 'Bag to belt, end to end' },
      { p: [4.6, 2.2, -13.6], tone: 'cyan', lift: 44, side: 'l', title: 'Gate & Stand AI', sub: 'Turnarounds optimized' },
      { p: [9, 8.4, -9], tone: 'red', lift: 36, side: 'l', title: 'Air-side Ops', sub: 'Stands, runway & ground fleet' },
    ],
  },
  {
    kicker: 'Retail',
    title: '<mark>Footfall Analytics</mark> & live <mark>Heatmaps</mark> for every store',
    hot: ['Smart Shelves', 'Queue Prediction', 'Omnichannel', 'Store Energy'],
    callouts: [
      { p: [0, 0.1, -1.6], tone: 'red', lift: 60, side: 'c', title: 'Footfall Heatmap', sub: 'Where shoppers dwell' },
      { p: [4.6, 1.4, 4.2], tone: 'cyan', lift: 44, side: 'r', title: 'Queue Management', sub: 'Open lanes before lines form' },
      { p: [-5, 1.9, -2.6], tone: 'blue', lift: 50, side: 'l', title: 'Shelf Intelligence', sub: 'Out-of-stock alerts' },
      { p: [6, 4.3, -4], tone: 'green', lift: 36, side: 'l', title: 'Energy per Store', sub: 'HVAC & lighting load' },
    ],
  },
  {
    kicker: 'SIA Xcel · Dashboards & Chatbots',
    title: '<mark>Generative AI</mark> that builds dashboards from a question',
    hot: ['Conversational AI', 'Copilot', 'Agentic AI', 'NLQ'],
    callouts: [
      { p: [-5.6, 7.0, -1.95], tone: 'cyan', lift: 40, side: 'l', title: 'Conversational AI', sub: 'Ask in plain language' },
      { p: [6.0, 6.9, -1.95], tone: 'red', lift: 46, side: 'r', title: 'Generative Dashboards', sub: 'Built from your question' },
      { p: [-5.3, 1.25, -1.95], tone: 'white', lift: 30, side: 'l', title: 'Natural-Language Query', sub: 'Type it, or just ask' },
      { p: [6.6, 10.9, -1.0], tone: 'blue', lift: 26, side: 'l', title: 'Agentic AI', sub: 'Acts on insights automatically' },
    ],
  },
  {
    kicker: 'SIA Facility · BMS',
    title: 'AI-driven <mark>BMS</mark>: <mark>HVAC</mark>, lighting, access & <mark>Energy</mark>',
    hot: ['Smart Buildings', 'FDD', 'Energy Management', 'Net Zero'],
    callouts: [
      { p: [-3.2, 7.6, -2.2], tone: 'cyan', lift: 48, side: 'l', title: 'HVAC Optimization', sub: 'Chillers & AHUs tuned by AI' },
      { p: [3.6, 8.1, -2.2], tone: 'red', lift: 40, side: 'r', title: 'Fault Detection (FDD)', sub: 'Issues found before failure' },
      { p: [-2.25, 4.7, 1.0], tone: 'blue', lift: 40, side: 'l', title: 'Smart Lighting', sub: 'Daylight & occupancy aware' },
      { p: [0, 1.1, 3.9], tone: 'green', lift: 50, side: 'r', title: 'Access Control', sub: 'Badges, gates & cameras' },
    ],
  },
];
