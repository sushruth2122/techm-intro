import { ASTRIKOS } from './edition.js';

// The eight dashboards, in the order the intro tours them. Point each `url` at the live
// dashboard. `short` names it in the intro's progress strip; `hot` are the trending terms
// shown on its link.

// The Astrikos-only edition has no Tech Mahindra logo (see edition.js).
export const BRAND = {
  techm: ASTRIKOS ? null : { src: 'brand/tech-mahindra-reversed.svg', alt: 'Tech Mahindra' },
  astrikos: { src: 'brand/astrikos-ai.svg', alt: 'Astrikos AI' },
};

// Seconds each dashboard stays on screen when the scene loop runs behind the hub.
export const LOOP_DWELL = 5;

// Each edition links to its own deployments: link(Tech Mahindra × Astrikos URL, Astrikos-only URL).
const link = (techm, astrikos) => (ASTRIKOS ? astrikos : techm);

export const PORTALS = [
  { id: 'sia-xcel', title: 'Sia Xcel', art: 'chat', url: link('https://techm-sia-xcel.demo.holasia.ai/', 'https://sia-xcel.demo.holasia.ai/'), hot: ['Conversational AI', 'Auto Dashboards'] },
  { id: 'sia-facility', title: 'Sia Facility', art: 'facility', url: link('https://techm-sia-facility.demo.holasia.ai/', 'https://sia-facility.demo.holasia.ai/'), hot: ['HVAC', 'Energy'] },
  { id: 'retail', title: 'Retail Command Center', short: 'Retail', art: 'retail', url: 'https://retail.astrikos.xyz:8443/', hot: ['Footfall', 'Heatmaps'] },
  { id: 'port', title: 'Port Construction Management', short: 'Port Construction', art: 'crane', url: 'https://techm-construction.astrikos.xyz:8443/', hot: ['Smart Port', 'IoT Telemetry'] },
  { id: 'campus', title: 'Smart Campus Management', short: 'Smart Campus', art: 'campus', url: link('https://techm-smartcampus.astrikos.xyz:8443/', 'https://zmu.astrikos.xyz:8443/'), hot: ['Net Zero', 'Occupancy'] },
  { id: 'dcmesh', title: 'DataCenter Management System', short: 'Data Center', art: 'rack', url: link('https://techm-datacenter.astrikos.xyz:8443/', 'https://dcmesh.astrikos.xyz:8443/'), hot: ['Predictive Maintenance', 'Digital Twin'] },
  { id: 'airport', title: 'Airport Management System', short: 'Airport', art: 'airport', url: link('https://techm-airport.astrikos.xyz:8443/', 'https://airport.astrikos.xyz:8443/'), hot: ['Passenger Flow', 'Air-side Ops'] },
  { id: 'manufacturing', title: 'Smart Manufacturing', short: 'Manufacturing', art: 'factory', url: link('https://techm-manufacturing.astrikos.xyz:8443/', 'https://kiln.astrikos.xyz:8443/'), hot: ['Industry 4.0', 'Edge AI'] },
];
