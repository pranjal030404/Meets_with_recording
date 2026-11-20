// Capacity arithmetic for docs/100K_CAPACITY_PLAN.md. This is a CALCULATOR, not a benchmark: every output is a function of the
// inputs below. Values marked REPO come from the code; ASSUMPTION values are illustrative defaults you must replace with load-test results.
//   node tests/load/capacity-calc.mjs [--users 100000] [--consumers-per-core N] [--nic-gbps 10] [--cores-per-node 8] [--nic-util 0.6]
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? parseFloat(process.argv[i + 1]) : d; };
const USERS = arg('users', 100000);
const CONSUMERS_PER_CORE = arg('consumers-per-core', null);   // MEASURE THIS. No default on purpose.
const NIC_GBPS = arg('nic-gbps', 10), NIC_UTIL = arg('nic-util', 0.6), CORES = arg('cores-per-node', 8);

// REPO facts (frontend/src/lib/mediasoupClient.js, backend/src/media/subscriptionPolicy.js defaults)
const A_KBPS = 64;                       // Opus maxaveragebitrate 64k (upper bound; typical speech lower)
const V_LAYER_KBPS = { low: 200, mid: 700, high: 2500 }; // simulcast encodings
const SCREEN_KBPS = 4000;
// ASSUMPTIONS (illustrative)
const SPEAKING_FRACTION = 0.2;           // share of audio producers actually sending voice (DTX off => all send, see note)
const THUMB_KBPS = V_LAYER_KBPS.low, SPEAKER_KBPS = V_LAYER_KBPS.high;
const limits = { small: { v: 12, a: 12 }, medium: { v: 16, a: 50 }, large: { v: 9, a: 25 }, webinar: { v: 6, a: 6 } };

const scenarios = {
  'audio-only (8/meeting)':      { size: 8,    mode: 'small',   audioPct: 1, videoPct: 0, screenPct: 0 },
  'camera meetings (8/meeting)': { size: 8,    mode: 'small',   audioPct: 1, videoPct: 1, screenPct: 0 },
  'screen sharing (12/meeting)': { size: 12,   mode: 'small',   audioPct: 1, videoPct: 0.5, screenPct: 0.08 },
  'mixed interactive (25)':      { size: 25,   mode: 'medium',  audioPct: 0.3, videoPct: 0.6, screenPct: 0.04 },
  'webinar (1000 / 3 presenters)': { size: 1000, mode: 'webinar', audioPct: 0.003, videoPct: 0.003, screenPct: 0.001, presenters: 3 },
};
const rows = [];
for (const [name, s] of Object.entries(scenarios)) {
  const meetings = Math.ceil(USERS / s.size);
  const lim = limits[s.mode];
  const prodA = Math.round(USERS * s.audioPct), prodV = Math.round(USERS * s.videoPct), prodS = Math.max(0, Math.round(USERS * s.screenPct));
  // per viewer subscriptions are bounded by min(producers in room, budget)
  const aPerRoom = Math.round(s.size * s.audioPct), vPerRoom = Math.round(s.size * s.videoPct);
  const subA = Math.min(Math.max(0, aPerRoom - 1), lim.a), subV = Math.min(Math.max(0, vPerRoom - 1), lim.v);
  const subS = s.screenPct > 0 ? Math.min(1, Math.round(s.size * s.screenPct)) : 0;
  const cons = USERS * (subA + subV + subS);
  const egressMbps = (USERS * subA * A_KBPS * SPEAKING_FRACTION + USERS * subV * ((THUMB_KBPS * 0.8 + SPEAKER_KBPS * 0.2)) + USERS * subS * SCREEN_KBPS) / 1000;
  const ingressMbps = (prodA * A_KBPS + prodV * (V_LAYER_KBPS.low + V_LAYER_KBPS.mid + V_LAYER_KBPS.high) + prodS * SCREEN_KBPS) / 1000;
  const nicMbps = NIC_GBPS * 1000 * NIC_UTIL;
  const nodesByNic = Math.ceil(Math.max(egressMbps, ingressMbps) / nicMbps);
  const nodesByCpu = CONSUMERS_PER_CORE ? Math.ceil(cons / (CONSUMERS_PER_CORE * CORES)) : null;
  rows.push({ scenario: name, meetings, audioProducers: prodA, videoProducers: prodV, screenProducers: prodS, consumers: cons, egressGbps: +(egressMbps / 1000).toFixed(2), ingressGbps: +(ingressMbps / 1000).toFixed(2), nodesByNic, nodesByCpu: nodesByCpu ?? 'needs --consumers-per-core (measure)' });
}
console.log(JSON.stringify({ users: USERS, inputs: { nicGbps: NIC_GBPS, nicUtil: NIC_UTIL, coresPerNode: CORES, consumersPerCore: CONSUMERS_PER_CORE ?? 'UNKNOWN' }, rows }, null, 2));
// Non-media load (ESTIMATE formulas): sockets = USERS; join rate = USERS / avg_session_s; typing/presence events ~ USERS * evt_per_user_s.
