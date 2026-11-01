// The eight dashboards, in the order the intro tours them. Point each `url` at the live
// dashboard. `hot` are the trending terms shown on its link; `flag.tone`: live | ai | new.

export const BRAND = {
  techm: { src: '/brand/tech-mahindra-reversed.svg', alt: 'Tech Mahindra' },
  astrikos: { src: '/brand/astrikos-ai.svg', alt: 'Astrikos AI' },
};

// Seconds each dashboard stays on screen when the scene loop runs behind the hub.
export const LOOP_DWELL = 5;

export const PORTALS = [
  { id: 'dcmesh', title: 'Data Center', tag: 'DCMesh', art: 'rack', url: '#dcmesh', flag: { label: 'Live', tone: 'live' }, hot: ['Predictive Maintenance', 'Digital Twin'] },
  { id: 'port', title: 'Port Construction', art: 'crane', url: '#port', flag: { label: 'Live', tone: 'live' }, hot: ['Smart Port', 'IoT Telemetry'] },
  { id: 'manufacturing', title: 'Manufacturing', art: 'factory', url: '#manufacturing', flag: { label: 'Live', tone: 'live' }, hot: ['Industry 4.0', 'Edge AI'] },
  { id: 'campus', title: 'Smart Campus', tag: 'ZMU', art: 'campus', url: '#campus', flag: { label: 'Live', tone: 'live' }, hot: ['Net Zero', 'Occupancy'] },
  { id: 'airport', title: 'Airport', art: 'airport', url: '#airport', flag: { label: 'Live', tone: 'live' }, hot: ['Passenger Flow', 'Air-side Ops'] },
  { id: 'retail', title: 'Retail', art: 'retail', url: '#retail', flag: { label: 'New', tone: 'new' }, hot: ['Footfall', 'Heatmaps'] },
  { id: 'sia-xcel', title: 'SIA Xcel', tag: 'GenAI', art: 'chat', url: '#sia-xcel', flag: { label: 'AI', tone: 'ai' }, hot: ['Conversational AI', 'Auto Dashboards'] },
  { id: 'sia-facility', title: 'SIA Facility', tag: 'BMS', art: 'facility', url: '#sia-facility', flag: { label: 'AI', tone: 'ai' }, hot: ['HVAC', 'Energy'] },
];
