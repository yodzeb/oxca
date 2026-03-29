/* ═══════════════════════════════════════════════════════════════
   CORE: CONFIG — Global parameters with localStorage persistence
   ═══════════════════════════════════════════════════════════════ */
const Config = (() => {
  const STORAGE_KEY = 'xc-analyzer-config';

  const DEFAULTS = {
    // Paraglider performance
    sinkRate: -1.0,
    trimSpeed: 40,
    acceleratedSpeed: 55,
    minSpeed: 22,

    // Analysis thresholds
    thermalClimbMin: 0.3,
    thermalTurnRateMin: 6,
    floatSinkMax: -0.5,
    transitionSpeedMin: 25,
    sinkRateThreshold: -2.0,
    smoothingWindow: 5,
    gapThreshold: 30,
    windCircleSamples: 3,
    minTurnDuration: 15,

    // Record thresholds
    triangleClosureMax: 3.0, // km — max distance between start/end triangle point

    // MacCready
    mcRollingWindow: 25,  // minutes — lookback window for rolling effective XC speed
  };

  let current = { ...DEFAULTS };

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) Object.assign(current, JSON.parse(saved));
    } catch (e) { /* ignore */ }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }

  function get(key) { return current[key]; }
  function set(key, val) { current[key] = val; save(); }
  function getAll() { return { ...current }; }
  function setAll(obj) { Object.assign(current, obj); save(); }
  function reset() { current = { ...DEFAULTS }; save(); }

  const META = {
    sinkRate:           { label: 'Sink rate (m/s)',            group: 'Glider' },
    trimSpeed:          { label: 'Trim speed (km/h)',          group: 'Glider' },
    acceleratedSpeed:   { label: 'Accel. speed (km/h)',        group: 'Glider' },
    minSpeed:           { label: 'Min speed (km/h)',           group: 'Glider' },
    thermalClimbMin:    { label: 'Thermal climb min (m/s)',    group: 'Thresholds' },
    thermalTurnRateMin: { label: 'Turn rate min (°/s)',        group: 'Thresholds' },
    floatSinkMax:       { label: 'Float sink max (m/s)',       group: 'Thresholds' },
    transitionSpeedMin: { label: 'Transition speed (km/h)',    group: 'Thresholds' },
    sinkRateThreshold:  { label: 'Heavy sink (m/s)',           group: 'Thresholds' },
    smoothingWindow:    { label: 'Smoothing (s)',              group: 'Analysis' },
    gapThreshold:       { label: 'Gap threshold (s)',          group: 'Analysis' },
    windCircleSamples:  { label: 'Wind circle samples',       group: 'Analysis' },
    minTurnDuration:    { label: 'Min turn duration (s)',      group: 'Analysis' },
    triangleClosureMax: { label: 'Triangle closure max (km)',  group: 'Record' },
    mcRollingWindow:    { label: 'MC rolling window (min)',    group: 'MacCready' },
  };

  load();
  return { get, set, getAll, setAll, reset, META, DEFAULTS };
})();
