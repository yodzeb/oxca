/* ═══════════════════════════════════════════════════════════════
   CORE: FLIGHT_STORE — Holds the current flight data
   ═══════════════════════════════════════════════════════════════ */
const FlightStore = (() => {
  let raw = null;
  let enriched = null;
  let stats = null;

  function load(igcText) {
    raw = IGCParser.parse(igcText);
    analyze();
  }

  function analyze() {
    if (!raw) return;
    enriched = FlightEnricher.enrich(raw.fixes);
    stats = computeStats(enriched);
  }

  function computeStats(fixes) {
    if (!fixes || fixes.length < 2) return null;

    const totalDist = fixes[fixes.length - 1].cumDist;
    const duration = fixes[fixes.length - 1].time - fixes[0].time;

    const climbFixes = fixes.filter(f => f.vario > 0);
    const avgClimb = climbFixes.length > 0
      ? climbFixes.reduce((s, f) => s + f.vario, 0) / climbFixes.length : 0;
    const maxClimb = fixes.reduce((m, f) => Math.max(m, f.vario || 0), 0);
    const minSink = fixes.reduce((m, f) => Math.min(m, f.vario || 0), 0);
    const maxAlt = fixes.reduce((m, f) => Math.max(m, f.alt), 0);
    const minAlt = fixes.reduce((m, f) => Math.min(m, f.alt), Infinity);
    const maxSpeed = fixes.reduce((m, f) => Math.max(m, f.groundSpeed || 0), 0);

    // Phase ratios
    const phases = { thermal: 0, float: 0, transition: 0, sink: 0 };
    for (let i = 1; i < fixes.length; i++) {
      if (!fixes[i].isGap && fixes[i].phase) {
        phases[fixes[i].phase] += fixes[i].dt;
      }
    }
    const totalPhaseTime = Object.values(phases).reduce((a, b) => a + b, 0);
    const phaseRatios = {};
    for (const [k, v] of Object.entries(phases)) {
      phaseRatios[k] = totalPhaseTime > 0 ? v / totalPhaseTime : 0;
    }

    // Average turn duration
    const turnDurations = [];
    let inTurn = false, lastDur = null;
    for (const f of fixes) {
      if (f.turnDuration && f.turnDuration !== lastDur) {
        turnDurations.push(f.turnDuration);
        lastDur = f.turnDuration;
      }
      if (!f.turnDuration) lastDur = null;
    }
    const avgTurnDuration = turnDurations.length > 0
      ? turnDurations.reduce((a, b) => a + b, 0) / turnDurations.length : 0;

    // Wind stats
    const windFixes = fixes.filter(f => f.windSpeed != null);
    const avgWindSpeed = windFixes.length > 0
      ? windFixes.reduce((s, f) => s + f.windSpeed, 0) / windFixes.length : 0;
    const avgWindDir = windFixes.length > 0
      ? Geo.circularMean(windFixes.map(f => f.windDir)) : 0;

    return {
      totalDist, duration, avgClimb, maxClimb, minSink,
      maxAlt, minAlt, maxSpeed, phaseRatios, phases,
      avgTurnDuration, avgWindSpeed, avgWindDir,
    };
  }

  function getRaw() { return raw; }
  function getEnriched() { return enriched; }
  function getStats() { return stats; }
  function getHeaders() { return raw?.headers || {}; }

  return { load, analyze, getRaw, getEnriched, getStats, getHeaders };
})();
