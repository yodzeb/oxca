/* ═══════════════════════════════════════════════════════════════
   CORE: HELPERS — Shared utility functions
   ═══════════════════════════════════════════════════════════════ */

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatTimeBrief(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
}

function downsample(fixes, maxPoints) {
  if (fixes.length <= maxPoints) return fixes;
  const step = Math.ceil(fixes.length / maxPoints);
  return fixes.filter((_, i) => i % step === 0);
}

function statHTML(label, value, unit) {
  return `<div class="stat-item"><div class="stat-label">${label}</div><div class="stat-value">${value}<span class="stat-unit">${unit}</span></div></div>`;
}

function phaseLegend(name, color, ratio) {
  return `<div class="phase-legend-item"><div class="phase-dot" style="background:${color}"></div>${name}<span class="phase-pct">${(ratio*100).toFixed(1)}%</span></div>`;
}

function formatCoord(lat, lon) {
  const latD = Math.abs(lat).toFixed(4) + (lat >= 0 ? 'N' : 'S');
  const lonD = Math.abs(lon).toFixed(4) + (lon >= 0 ? 'E' : 'W');
  return `${latD} ${lonD}`;
}
