/* ═══════════════════════════════════════════════════════════════
   MODULE: Wind Analysis
   Publishes: { avgSpeed, maxSpeed, avgDir, avgDirRad, samples }
   ═══════════════════════════════════════════════════════════════ */
ModuleRegistry.register({
  id: 'wind',
  name: 'Wind',
  charts: [],
  _grid: null,
  _ready: false,
  _pubData: null,

  init(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Wind Summary</div>
        <div class="stats-grid" id="mod-wind-stats"></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Wind Direction vs Altitude</div>
          <div class="chart-container"><canvas id="chart-wind-dir-alt"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Wind Speed vs Altitude</div>
          <div class="chart-container"><canvas id="chart-wind-spd-alt"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Wind Speed — Time × Altitude Heatmap</div>
        <div id="heatmap-speed-wrap" style="position:relative;width:100%;height:320px;">
          <canvas id="heatmap-wind-speed"></canvas>
        </div>
        <div id="heatmap-speed-legend" style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.75rem;color:var(--text-muted);"></div>
      </div>
      <div class="card">
        <div class="card-title">Wind Direction — Time × Altitude Heatmap</div>
        <div id="heatmap-dir-wrap" style="position:relative;width:100%;height:320px;">
          <canvas id="heatmap-wind-dir"></canvas>
        </div>
        <div id="heatmap-dir-legend" style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.75rem;color:var(--text-muted);"></div>
      </div>
      <div class="card">
        <div class="card-title">Combined — Speed (color) + Direction (arrows)</div>
        <div id="heatmap-comb-wrap" style="position:relative;width:100%;height:360px;">
          <canvas id="heatmap-wind-combined"></canvas>
        </div>
        <div id="heatmap-combined-legend" style="display:flex;align-items:center;gap:12px;margin-top:8px;font-size:0.75rem;color:var(--text-muted);"></div>
      </div>
    `;
  },

  update(fixes, stats) {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this._grid = null;
    this._ready = false;
    this._pubData = null;
    if (!fixes || fixes.length < 2) return;

    const samples = FlightEnricher.getWindSamples();
    const statsEl = document.getElementById('mod-wind-stats');

    if (samples.length === 0) {
      statsEl.innerHTML = `<div class="stat-item" style="grid-column:1/-1"><div class="stat-label">No wind data</div><div class="stat-value" style="font-size:0.9rem;color:var(--text-muted)">No complete thermal circles detected</div></div>`;
      this._pubData = { avgSpeed: 0, maxSpeed: 0, avgDir: 0, avgDirRad: 0, samples: 0 };
      return;
    }

    const avgSpeed = samples.reduce((s, w) => s + w.speed, 0) / samples.length;
    const maxSpeed = samples.reduce((m, w) => Math.max(m, w.speed), 0);
    const avgDir = Geo.circularMean(samples.map(w => w.dir));

    this._pubData = {
      avgSpeed,
      maxSpeed,
      avgDir,
      avgDirRad: Geo.toRad(avgDir),
      samples: samples.length,
    };

    statsEl.innerHTML = `
      ${statHTML('Avg Wind', avgSpeed.toFixed(1), 'km/h')}
      ${statHTML('Max Wind', maxSpeed.toFixed(1), 'km/h')}
      ${statHTML('Avg Direction', avgDir.toFixed(0) + '° ' + degToCompass(avgDir), '')}
      ${statHTML('Circles', samples.length.toString(), '')}
    `;

    this.charts.push(new Chart(document.getElementById('chart-wind-dir-alt').getContext('2d'), {
      type: 'scatter',
      data: { datasets: [{ data: samples.map(s => ({ x: s.dir, y: s.alt })), backgroundColor: samples.map(s => windDirColor(s.dir, 0.7)), pointRadius: 5 }] },
      options: {
        ...ChartTheme.defaultOptions('Altitude (m)', 'Direction (°)'),
        scales: {
          x: { min: 0, max: 360, ticks: { color: '#8b91a3', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 45, callback: v => ({0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW',360:'N'}[v]||'') }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Wind FROM', color: '#8b91a3', font: { family: 'DM Sans', size: 11 } } },
          y: { ticks: { color: '#8b91a3', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Altitude (m)', color: '#8b91a3', font: { family: 'DM Sans', size: 11 } } }
        },
        plugins: { legend: { display: false }, tooltip: { ...ChartTheme.tooltip, callbacks: { label: ctx => `${ctx.parsed.x.toFixed(0)}° ${degToCompass(ctx.parsed.x)} at ${ctx.parsed.y.toFixed(0)}m` } } }
      }
    }));

    this.charts.push(new Chart(document.getElementById('chart-wind-spd-alt').getContext('2d'), {
      type: 'scatter',
      data: { datasets: [{ data: samples.map(s => ({ x: s.speed, y: s.alt })), backgroundColor: samples.map(s => windSpdColor(s.speed, maxSpeed, 0.7)), pointRadius: 5 }] },
      options: { ...ChartTheme.defaultOptions('Altitude (m)', 'Wind Speed (km/h)'), plugins: { legend: { display: false }, tooltip: ChartTheme.tooltip } }
    }));

    this._grid = buildWindGrid(fixes, samples);
    this._ready = true;
  },

  /** Publish wind stats to shared bus */
  publish() {
    if (this._pubData) ModuleRegistry.publish('wind', this._pubData);
  },

  onShow() {
    if (!this._ready || !this._grid) return;
    const g = this._grid;
    drawSpeedHeatmap(document.getElementById('heatmap-wind-speed'), g);
    drawSpeedLegend(document.getElementById('heatmap-speed-legend'), g.maxSpeed);
    drawDirHeatmap(document.getElementById('heatmap-wind-dir'), g);
    drawDirLegend(document.getElementById('heatmap-dir-legend'));
    drawCombinedHeatmap(document.getElementById('heatmap-wind-combined'), g);
    drawCombinedLegend(document.getElementById('heatmap-combined-legend'), g.maxSpeed);
  },

  destroy() { this.charts.forEach(c => c.destroy()); this.charts = []; this._grid = null; this._ready = false; }
});

// ─── Grid, heatmap renderers, colors, legends (unchanged from previous version) ───
function buildWindGrid(fixes, samples) {
  const tMin = fixes[0].time, tMax = fixes[fixes.length - 1].time;
  const altAll = fixes.map(f => f.alt);
  const aMin = Math.floor(Math.min(...altAll) / 100) * 100;
  const aMax = Math.ceil(Math.max(...altAll) / 100) * 100;
  const timeBins = 80, altBins = Math.max(8, Math.ceil((aMax - aMin) / 100));
  const dtBin = (tMax - tMin) / timeBins, daBin = altBins > 0 ? (aMax - aMin) / altBins : 100;
  const altSamples = Array.from({ length: altBins }, () => []);
  for (const s of samples) {
    const ai = Math.min(altBins - 1, Math.max(0, Math.floor((s.alt - aMin) / daBin)));
    const ti = Math.min(timeBins - 1, Math.max(0, Math.floor((s.time - tMin) / dtBin)));
    altSamples[ai].push({ t: ti, speed: s.speed, sin: Math.sin(Geo.toRad(s.dir)), cos: Math.cos(Geo.toRad(s.dir)) });
  }
  for (let a = 0; a < altBins; a++) {
    const byT = {};
    for (const s of altSamples[a]) { if (!byT[s.t]) byT[s.t] = { speed: 0, sin: 0, cos: 0, n: 0 }; byT[s.t].speed += s.speed; byT[s.t].sin += s.sin; byT[s.t].cos += s.cos; byT[s.t].n++; }
    altSamples[a] = Object.entries(byT).map(([t, v]) => ({ t: parseInt(t), speed: v.speed / v.n, sin: v.sin / v.n, cos: v.cos / v.n })).sort((a, b) => a.t - b.t);
  }
  const result = { speed: Array.from({ length: timeBins }, () => new Float32Array(altBins)), dir: Array.from({ length: timeBins }, () => new Float32Array(altBins)), hasData: Array.from({ length: timeBins }, () => new Uint8Array(altBins)), timeBins, altBins, tMin, tMax, aMin, aMax, dtBin, daBin, maxSpeed: 0 };
  for (let a = 0; a < altBins; a++) {
    const pts = altSamples[a]; if (pts.length === 0) continue;
    for (let t = 0; t < timeBins; t++) {
      let speed, sin, cos;
      if (pts.length === 1) { speed = pts[0].speed; sin = pts[0].sin; cos = pts[0].cos; }
      else if (t <= pts[0].t) { speed = pts[0].speed; sin = pts[0].sin; cos = pts[0].cos; }
      else if (t >= pts[pts.length - 1].t) { speed = pts[pts.length - 1].speed; sin = pts[pts.length - 1].sin; cos = pts[pts.length - 1].cos; }
      else { let before = pts[0], after = pts[pts.length - 1]; for (let k = 0; k < pts.length - 1; k++) { if (pts[k].t <= t && pts[k + 1].t >= t) { before = pts[k]; after = pts[k + 1]; break; } } const frac = after.t === before.t ? 0 : (t - before.t) / (after.t - before.t); speed = before.speed + frac * (after.speed - before.speed); sin = before.sin + frac * (after.sin - before.sin); cos = before.cos + frac * (after.cos - before.cos); }
      result.speed[t][a] = speed; result.dir[t][a] = (Geo.toDeg(Math.atan2(sin, cos)) + 360) % 360; result.hasData[t][a] = 1; result.maxSpeed = Math.max(result.maxSpeed, speed);
    }
  }
  for (let t = 0; t < timeBins; t++) { let lastA = -1; for (let a = 0; a < altBins; a++) { if (result.hasData[t][a]) { if (lastA >= 0 && a - lastA > 1) { for (let ai = lastA + 1; ai < a; ai++) { const frac = (ai - lastA) / (a - lastA); result.speed[t][ai] = result.speed[t][lastA] * (1 - frac) + result.speed[t][a] * frac; let dd = result.dir[t][a] - result.dir[t][lastA]; if (dd > 180) dd -= 360; if (dd < -180) dd += 360; result.dir[t][ai] = (result.dir[t][lastA] + frac * dd + 360) % 360; result.hasData[t][ai] = 1; } } lastA = a; } } }
  result.timeLabels = []; for (let t = 0; t < timeBins; t++) result.timeLabels.push(formatTime(tMin + t * dtBin));
  result.altLabels = []; for (let a = 0; a < altBins; a++) result.altLabels.push(Math.round(aMin + a * daBin) + 'm');
  return result;
}
function setupHeatmapCanvas(canvas) { const dpr = window.devicePixelRatio || 1; const p = canvas.parentElement; const w = p.clientWidth, h = p.clientHeight; if (w === 0 || h === 0) return null; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx, w, h }; }
function drawHeatmapAxes(ctx, w, h, grid, m, title) { ctx.fillStyle = '#8b91a3'; ctx.font = '11px DM Sans'; ctx.textAlign = 'center'; ctx.fillText(title, w / 2, 14); ctx.font = '9px JetBrains Mono'; const tStep = Math.max(1, Math.floor(grid.timeBins / 8)); const plotW = w - m.left - m.right; for (let t = 0; t < grid.timeBins; t += tStep) ctx.fillText(grid.timeLabels[t], m.left + t * (plotW / grid.timeBins) + plotW / grid.timeBins / 2, h - 8); ctx.textAlign = 'right'; const aStep = Math.max(1, Math.floor(grid.altBins / 6)); const plotH = h - m.top - m.bottom, ch = plotH / grid.altBins; for (let a = 0; a < grid.altBins; a += aStep) ctx.fillText(grid.altLabels[a], m.left - 4, m.top + (grid.altBins - 1 - a) * ch + ch / 2 + 3); }
function drawSpeedHeatmap(canvas, grid) { const s = setupHeatmapCanvas(canvas); if (!s) return; const { ctx, w, h } = s; const m = { top: 24, right: 16, bottom: 30, left: 52 }; const cw = (w - m.left - m.right) / grid.timeBins, ch = (h - m.top - m.bottom) / grid.altBins; drawHeatmapAxes(ctx, w, h, grid, m, 'Wind Speed (km/h)'); for (let t = 0; t < grid.timeBins; t++) for (let a = 0; a < grid.altBins; a++) { if (!grid.hasData[t][a]) continue; ctx.fillStyle = windSpdColor(grid.speed[t][a], grid.maxSpeed, 0.9); ctx.fillRect(m.left + t * cw, m.top + (grid.altBins - 1 - a) * ch, cw + 0.5, ch + 0.5); } }
function drawDirHeatmap(canvas, grid) { const s = setupHeatmapCanvas(canvas); if (!s) return; const { ctx, w, h } = s; const m = { top: 24, right: 16, bottom: 30, left: 52 }; const cw = (w - m.left - m.right) / grid.timeBins, ch = (h - m.top - m.bottom) / grid.altBins; drawHeatmapAxes(ctx, w, h, grid, m, 'Wind Direction'); for (let t = 0; t < grid.timeBins; t++) for (let a = 0; a < grid.altBins; a++) { if (!grid.hasData[t][a]) continue; ctx.fillStyle = windDirColor(grid.dir[t][a], 0.9); ctx.fillRect(m.left + t * cw, m.top + (grid.altBins - 1 - a) * ch, cw + 0.5, ch + 0.5); } }
function drawCombinedHeatmap(canvas, grid) { const s = setupHeatmapCanvas(canvas); if (!s) return; const { ctx, w, h } = s; const m = { top: 24, right: 16, bottom: 30, left: 52 }; const cw = (w - m.left - m.right) / grid.timeBins, ch = (h - m.top - m.bottom) / grid.altBins; drawHeatmapAxes(ctx, w, h, grid, m, 'Speed (color) + Direction (arrows)'); for (let t = 0; t < grid.timeBins; t++) for (let a = 0; a < grid.altBins; a++) { if (!grid.hasData[t][a]) continue; const x = m.left + t * cw, y = m.top + (grid.altBins - 1 - a) * ch; ctx.fillStyle = windSpdColor(grid.speed[t][a], grid.maxSpeed, 0.8); ctx.fillRect(x, y, cw + 0.5, ch + 0.5); if (cw >= 3 && ch >= 3) { const cx = x + cw / 2, cy = y + ch / 2, ang = Geo.toRad(grid.dir[t][a]), len = Math.min(cw, ch) * 0.35, dx = Math.sin(ang) * len, dy = -Math.cos(ang) * len; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx - dx, cy - dy); const hl = len * 0.45, ha = 0.5; ctx.lineTo(cx - dx + Math.sin(ang + ha) * hl, cy - dy - Math.cos(ang + ha) * hl); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx - dx + Math.sin(ang - ha) * hl, cy - dy - Math.cos(ang - ha) * hl); ctx.stroke(); } } }
function windSpdColor(speed, maxSpeed, alpha) { const t = Math.min(1, speed / Math.max(maxSpeed, 1)); const r = t < 0.5 ? 0 : Math.round(255 * (t - 0.5) * 2); const g = t < 0.25 ? Math.round(255 * t * 4) : t < 0.75 ? 255 : Math.round(255 * (1 - t) * 4); const b = t < 0.5 ? Math.round(255 * (1 - t * 2)) : 0; return `rgba(${r},${g},${b},${alpha})`; }
function windDirColor(dir, alpha) { return `hsla(${(240 - dir + 360) % 360}, 70%, 55%, ${alpha})`; }
function degToCompass(deg) { return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16]; }
function drawSpeedLegend(el, max) { let h = '<span>0</span><div style="display:flex;height:12px;flex:1;border-radius:3px;overflow:hidden;">'; for (let i = 0; i < 6; i++) h += `<div style="flex:1;background:${windSpdColor((i/5)*max, max, 1)}"></div>`; el.innerHTML = h + `</div><span>${max.toFixed(0)} km/h</span>`; }
function drawDirLegend(el) { const dirs = [0,45,90,135,180,225,270,315], names = ['N','NE','E','SE','S','SW','W','NW']; el.innerHTML = dirs.map((d,i) => `<span style="display:inline-flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${windDirColor(d,0.9)}"></span>${names[i]}</span>`).join(''); }
function drawCombinedLegend(el, max) { let h = '<span>Speed: </span><div style="display:flex;height:10px;width:120px;border-radius:2px;overflow:hidden;">'; for (let i = 0; i < 5; i++) h += `<div style="flex:1;background:${windSpdColor((i/4)*max,max,1)}"></div>`; el.innerHTML = h + `</div><span>${max.toFixed(0)} km/h</span><span style="margin-left:16px;">↗ arrows show where wind goes</span>`; }
