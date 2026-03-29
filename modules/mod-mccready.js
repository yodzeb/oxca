/* ═══════════════════════════════════════════════════════════════
   MODULE: MacCready v6
   
   Wind correction: avg wind is ADDED to the theoretical XC speed
   (tailwind helps, headwind hurts — for straight flights the net
   effect is additive to the airmass speed). The efficiency breakdown
   updates live when the checkbox is toggled.
   ═══════════════════════════════════════════════════════════════ */
ModuleRegistry.register({
  id: 'mccready',
  name: 'MacCready',
  charts: [],
  _fixes: null, _slidingData: null, _rollingXC: null, _lookbackMin: 25,
  _xcChart: null, _globalTheorXC: 0, _avgEffXC: 0, _globalMC: 0,
  _avgTransSpeed: 0, _globalOpt: null,

  init(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">MacCready Analysis Summary</div>
        <div class="stats-grid" id="mod-mc-stats"></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Glider Polar Curve (global average MC)</div>
          <div class="chart-container"><canvas id="chart-mc-polar"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">MacCready Speed Ring</div>
          <div class="chart-container"><canvas id="chart-mc-ring"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Sliding MC &amp; Optimal Speed vs Time</div>
        <div class="chart-container" style="height:300px;"><canvas id="chart-mc-sliding"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Actual Speed vs Sliding Optimal (transitions)</div>
        <div class="chart-container" style="height:300px;"><canvas id="chart-mc-actual"></canvas></div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div class="card-title" style="margin-bottom:0;">Effective XC Speed (rolling) vs Theory</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text-secondary);cursor:pointer;">
            <input type="checkbox" id="mc-wind-toggle"> Add avg wind to theory (straight flights)
          </label>
        </div>
        <div id="mc-wind-info" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;display:none;"></div>
        <div class="chart-container" style="height:300px;"><canvas id="chart-mc-xcspeed"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Efficiency Breakdown</div>
        <div id="mc-efficiency" style="font-size:0.85rem;color:var(--text-secondary);line-height:1.8;"></div>
      </div>
    `;
  },

  update(fixes, stats) {
    this.charts.forEach(c => c.destroy()); this.charts = []; this._xcChart = null; this._fixes = fixes;
    if (!fixes || fixes.length < 10 || !stats) return;

    const polar = buildPolar();
    const duration = stats.duration;
    const thermalFixes = fixes.filter(f => f.phase === 'thermal' && f.vario > 0);
    const globalMC = thermalFixes.length > 0 ? thermalFixes.reduce((s, f) => s + f.vario, 0) / thermalFixes.length : 1.0;
    const globalOpt = mcOptimalSpeed(polar, globalMC);
    const globalOptSink = Math.abs(polar.sink(globalOpt.speed));
    const globalTheorXC = globalOpt.speed / (1 + globalOptSink / globalMC);

    this._globalMC = globalMC; this._globalOpt = globalOpt; this._globalTheorXC = globalTheorXC;

    const mcWindow = Math.max(300, Math.floor(duration / 4));
    this._slidingData = computeSlidingMC(fixes, polar, mcWindow);
    this._lookbackMin = Config.get('mcRollingWindow');
    this._rollingXC = computeRollingXCSpeed(fixes, this._lookbackMin * 60);

    const validRolling = this._rollingXC.filter(v => v !== null);
    this._avgEffXC = validRolling.length > 0 ? validRolling.reduce((a, b) => a + b, 0) / validRolling.length : 0;

    const transitions = extractTransitions(fixes);
    this._avgTransSpeed = transitions.length > 0 ? transitions.reduce((s, t) => s + t.avgSpeed, 0) / transitions.length : 0;

    const sd = this._slidingData;

    document.getElementById('mod-mc-stats').innerHTML = `
      ${statHTML('Global MC', globalMC.toFixed(2), 'm/s')}
      ${statHTML('MC Window', formatTimeBrief(mcWindow), '')}
      ${statHTML('Optimal Speed', globalOpt.speed.toFixed(1), 'km/h')}
      ${statHTML('Best L/D', polar.bestLD.ratio.toFixed(1), ':1')}
      ${statHTML('Theor. XC', globalTheorXC.toFixed(1), 'km/h')}
      ${statHTML('Avg Eff. XC', this._avgEffXC.toFixed(1), 'km/h')}
      ${statHTML('XC Efficiency', (globalTheorXC > 0 ? (this._avgEffXC / globalTheorXC * 100).toFixed(0) : '—'), '%')}
      ${statHTML('Avg Trans.', this._avgTransSpeed.toFixed(1), 'km/h')}
    `;

    this.drawPolarChart(polar, globalMC, globalOpt);
    this.drawSpeedRing(polar);
    this.drawSlidingMCChart(fixes, sd);
    this.drawActualVsOptimal(fixes, sd);
    this.drawXCSpeedChart(null);
    this._updateEfficiencyText(null);

    document.getElementById('mc-wind-toggle').addEventListener('change', () => {
      const windOn = document.getElementById('mc-wind-toggle').checked;
      const wind = windOn ? ModuleRegistry.get('wind') : null;
      if (this._xcChart) { this._xcChart.destroy(); this._xcChart = null; }
      this.drawXCSpeedChart(wind);
      this._updateEfficiencyText(wind);
    });
  },

  lateUpdate() {
    const wind = ModuleRegistry.get('wind');
    const infoEl = document.getElementById('mc-wind-info');
    if (wind && wind.avgSpeed > 0) {
      infoEl.style.display = 'block';
      infoEl.innerHTML = `Wind: avg <strong>${wind.avgSpeed.toFixed(1)} km/h</strong> from ${wind.avgDir.toFixed(0)}° (${degToCompass(wind.avgDir)}). When checked, avg wind speed is added to the theoretical XC line — most meaningful for straight flights with/against the wind.`;
    } else {
      infoEl.style.display = 'block';
      infoEl.innerHTML = 'No wind data from the Wind module.';
    }
  },

  _updateEfficiencyText(wind) {
    const sd = this._slidingData;
    const windCorr = (wind && wind.avgSpeed > 0) ? wind.avgSpeed : 0;
    const theorRef = this._globalTheorXC + windCorr;
    const xcEff = theorRef > 0 ? (this._avgEffXC / theorRef * 100) : 0;
    const speedEff = this._globalOpt.speed > 0 ? (this._avgTransSpeed / this._globalOpt.speed * 100) : 0;

    const windNote = windCorr > 0
      ? `<br>With avg wind of <span style="color:var(--wind)">${windCorr.toFixed(1)} km/h</span> added, adjusted theoretical XC: <span style="color:var(--climb)">${theorRef.toFixed(1)} km/h</span>.`
      : '';

    document.getElementById('mc-efficiency').innerHTML = `
      <strong>MacCready analysis:</strong><br>
      Global MC: <span style="color:var(--thermal)">${this._globalMC.toFixed(2)} m/s</span>,
      sliding range: ${sd.mcMin.toFixed(2)}–${sd.mcMax.toFixed(2)} m/s.<br>
      Theoretical XC (no wind): <span style="color:var(--climb)">${this._globalTheorXC.toFixed(1)} km/h</span>.${windNote}<br>
      Avg effective XC (${this._lookbackMin}m rolling): <span style="color:var(--accent)">${this._avgEffXC.toFixed(1)} km/h</span>
      (${xcEff.toFixed(0)}% of ${windCorr > 0 ? 'wind-adjusted' : ''} theoretical).<br>
      Avg transition speed: ${this._avgTransSpeed.toFixed(1)} km/h vs optimal ${this._globalOpt.speed.toFixed(1)} km/h
      (${speedEff.toFixed(0)}%).<br><br>
      <span style="color:var(--text-muted)">
      ${windCorr > 0 ? 'Wind-adjusted mode: avg wind is added to the theoretical max, accounting for tailwind boost on straight flights. For headwind flights the actual XC speed will be lower than theory.' : 'Toggle "Add avg wind" to see wind-corrected comparison — useful for straight-line flights.'}
      Typical efficiency: 30–60% for a good paragliding XC.
      </span>
    `;
  },

  drawXCSpeedChart(wind) {
    const fixes = this._fixes, sd = this._slidingData, rollingXC = this._rollingXC, lookbackMin = this._lookbackMin;
    const ctx = document.getElementById('chart-mc-xcspeed').getContext('2d');
    const ds = downsample(fixes, 800);
    const step = Math.max(1, Math.floor(fixes.length / 800));
    const rollingDS = ds.map((_, i) => rollingXC[Math.min(rollingXC.length - 1, i * step)]);
    const theorLine = ds.map((_, i) => sd.theorXC[Math.min(sd.theorXC.length - 1, i * step)]);

    const datasets = [
      { label: `Effective XC (${lookbackMin}m rolling)`, data: rollingDS, borderColor: 'rgba(79,156,247,0.9)', backgroundColor: 'rgba(79,156,247,0.06)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: 'Sliding MC theoretical', data: theorLine, borderColor: 'rgba(240,136,74,0.7)', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, tension: 0.3, fill: false },
    ];

    if (wind && wind.avgSpeed > 0) {
      const windAdd = wind.avgSpeed;
      datasets.push({
        label: `Theory + wind (+${windAdd.toFixed(1)} km/h)`,
        data: theorLine.map(v => v + windAdd),
        borderColor: 'rgba(199,146,234,0.8)', borderWidth: 2,
        borderDash: [4, 4], pointRadius: 0, tension: 0.3, fill: false,
      });
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: ds.map(f => formatTime(f.time)), datasets },
      options: { ...ChartTheme.defaultOptions('XC Speed (km/h)', 'Time'), plugins: { legend: { display: true, labels: { color: ChartTheme.fontColor, font: { family: 'DM Sans', size: 11 } } }, tooltip: ChartTheme.tooltip } }
    });
    this._xcChart = chart; this.charts.push(chart);
  },

  drawPolarChart(polar, mc, optResult) {
    const ctx = document.getElementById('chart-mc-polar').getContext('2d');
    const vMin = Config.get('minSpeed'), vMax = Config.get('acceleratedSpeed') + 5;
    const speeds = [], sinks = [];
    for (let v = vMin; v <= vMax; v += 0.5) { speeds.push(v); sinks.push(-polar.sink(v)); }
    const optSink = -polar.sink(optResult.speed), slope = (optSink - mc) / optResult.speed;
    this.charts.push(new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [
        { label: 'Polar curve', data: speeds.map((v, i) => ({ x: v, y: sinks[i] })), showLine: true, borderColor: '#4f9cf7', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4 },
        { label: `MC tangent (${mc.toFixed(1)})`, data: [{ x: 0, y: mc }, { x: optResult.speed, y: optSink }, { x: vMax, y: mc + slope * vMax }], showLine: true, borderColor: 'rgba(240,136,74,0.8)', borderWidth: 1.5, borderDash: [6,3], pointRadius: [0,6,0], pointBackgroundColor: 'rgba(240,136,74,0.9)', fill: false },
        { label: 'Best L/D', data: [{ x: 0, y: 0 }, { x: vMax, y: (-polar.sink(polar.bestLD.speed) / polar.bestLD.speed) * vMax }], showLine: true, borderColor: 'rgba(93,211,158,0.5)', borderWidth: 1.5, borderDash: [4,4], pointRadius: 0, fill: false },
      ] },
      options: { ...ChartTheme.defaultOptions('Sink rate (m/s)', 'Airspeed (km/h)'), plugins: { legend: { display: true, labels: { color: ChartTheme.fontColor, font: { family: 'DM Sans', size: 11 }, usePointStyle: true } }, tooltip: ChartTheme.tooltip } }
    }));
  },

  drawSpeedRing(polar) {
    const ctx = document.getElementById('chart-mc-ring').getContext('2d');
    const mcVals = [], optSpeeds = [], optXC = [];
    for (let mc = 0.2; mc <= 4.0; mc += 0.2) { const opt = mcOptimalSpeed(polar, mc); mcVals.push(mc); optSpeeds.push(opt.speed); optXC.push(opt.speed / (1 + Math.abs(polar.sink(opt.speed)) / mc)); }
    this.charts.push(new Chart(ctx, {
      type: 'line', data: { labels: mcVals.map(v => v.toFixed(1)), datasets: [
        { label: 'Optimal airspeed', data: optSpeeds, borderColor: '#4f9cf7', backgroundColor: 'rgba(79,156,247,0.08)', fill: true, tension: 0.3 },
        { label: 'Theoretical XC speed', data: optXC, borderColor: '#5dd39e', backgroundColor: 'rgba(93,211,158,0.08)', fill: true, tension: 0.3 },
      ] },
      options: { ...ChartTheme.defaultOptions('Speed (km/h)', 'MC Setting (m/s)'), plugins: { legend: { display: true, labels: { color: ChartTheme.fontColor, font: { family: 'DM Sans', size: 11 } } }, tooltip: ChartTheme.tooltip } }
    }));
  },

  drawSlidingMCChart(fixes, sd) {
    const ctx = document.getElementById('chart-mc-sliding').getContext('2d');
    const ds = downsample(fixes, 800), step = Math.max(1, Math.floor(fixes.length / 800));
    const mcLine = [], optLine = [], thLine = [];
    for (let i = 0; i < ds.length; i++) { const si = Math.min(sd.mc.length - 1, i * step); mcLine.push(sd.mc[si]); optLine.push(sd.optSpeed[si]); thLine.push(sd.theorXC[si]); }
    const fc = ChartTheme.fontColor;
    this.charts.push(new Chart(ctx, {
      type: 'line', data: { labels: ds.map(f => formatTime(f.time)), datasets: [
        { label: 'Sliding MC (m/s)', data: mcLine, borderColor: 'rgba(240,136,74,0.9)', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
        { label: 'Optimal speed (km/h)', data: optLine, borderColor: 'rgba(79,156,247,0.7)', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' },
        { label: 'Theoretical XC (km/h)', data: thLine, borderColor: 'rgba(93,211,158,0.7)', borderWidth: 1.5, borderDash: [4,4], pointRadius: 0, tension: 0.3, yAxisID: 'y1' },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: true, labels: { color: fc, font: { family: 'DM Sans', size: 11 } } }, tooltip: ChartTheme.tooltip, zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } } },
        scales: {
          x: { ticks: { color: fc, font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 }, grid: { color: ChartTheme.gridColor } },
          y: { position: 'left', ticks: { color: 'rgba(240,136,74,0.8)', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: ChartTheme.gridColor }, title: { display: true, text: 'MC (m/s)', color: 'rgba(240,136,74,0.8)', font: { family: 'DM Sans', size: 11 } } },
          y1: { position: 'right', ticks: { color: 'rgba(79,156,247,0.7)', font: { family: 'JetBrains Mono', size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Speed (km/h)', color: 'rgba(79,156,247,0.7)', font: { family: 'DM Sans', size: 11 } } },
        },
        elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
      }
    }));
  },

  drawActualVsOptimal(fixes, sd) {
    const ctx = document.getElementById('chart-mc-actual').getContext('2d');
    const ds = downsample(fixes, 1000), step = Math.max(1, Math.floor(fixes.length / 1000));
    const optLine = ds.map((f, i) => (f.phase !== 'transition' && f.phase !== 'sink') ? null : sd.optSpeed[Math.min(sd.optSpeed.length - 1, i * step)]);
    this.charts.push(new Chart(ctx, {
      type: 'line', data: { labels: ds.map(f => formatTime(f.time)), datasets: [
        { label: 'Actual ground speed', data: ds.map(f => (f.phase === 'transition' || f.phase === 'float') ? f.groundSpeed : null), borderColor: 'rgba(79,156,247,0.8)', borderWidth: 1.5, pointRadius: 0, tension: 0.2, spanGaps: false },
        { label: 'Sliding optimal', data: optLine, borderColor: 'rgba(240,136,74,0.7)', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, spanGaps: false },
      ] },
      options: { ...ChartTheme.defaultOptions('Speed (km/h)', 'Time'), plugins: { legend: { display: true, labels: { color: ChartTheme.fontColor, font: { family: 'DM Sans', size: 11 } } }, tooltip: ChartTheme.tooltip } }
    }));
  },

  destroy() { this.charts.forEach(c => c.destroy()); this.charts = []; this._xcChart = null; }
});

// ── Helpers ──
function computeSlidingMC(fixes, polar, windowSec) {
  const n = fixes.length, halfWin = Math.floor(windowSec / 2);
  const mc = new Float32Array(n), optSpeed = new Float32Array(n), theorXC = new Float32Array(n);
  let mcMin = Infinity, mcMax = -Infinity, optMin = Infinity, optMax = -Infinity, thMin = Infinity, thMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const tC = fixes[i].time, tS = tC - halfWin, tE = tC + halfWin;
    let sum = 0, count = 0;
    for (let j = i; j >= 0 && fixes[j].time >= tS; j--) { if (fixes[j].phase === 'thermal' && fixes[j].vario > 0) { sum += fixes[j].vario; count++; } }
    for (let j = i + 1; j < n && fixes[j].time <= tE; j++) { if (fixes[j].phase === 'thermal' && fixes[j].vario > 0) { sum += fixes[j].vario; count++; } }
    const lmc = count > 0 ? sum / count : 0.5; mc[i] = lmc;
    const opt = mcOptimalSpeed(polar, lmc); optSpeed[i] = opt.speed;
    theorXC[i] = opt.speed / (1 + Math.abs(polar.sink(opt.speed)) / lmc);
    mcMin = Math.min(mcMin, lmc); mcMax = Math.max(mcMax, lmc);
    optMin = Math.min(optMin, opt.speed); optMax = Math.max(optMax, opt.speed);
    thMin = Math.min(thMin, theorXC[i]); thMax = Math.max(thMax, theorXC[i]);
  }
  return { mc, optSpeed, theorXC, mcMin, mcMax, optSpeedMin: optMin, optSpeedMax: optMax, theorXCMin: thMin, theorXCMax: thMax };
}
function computeRollingXCSpeed(fixes, lookbackSec) {
  const n = fixes.length, result = new Array(n).fill(null); let trail = 0;
  for (let i = 0; i < n; i++) {
    while (trail < i - 1 && fixes[trail + 1].time <= fixes[i].time - lookbackSec) trail++;
    const dt = fixes[i].time - fixes[trail].time; if (dt < 120) continue;
    result[i] = (Geo.distance(fixes[trail].lat, fixes[trail].lon, fixes[i].lat, fixes[i].lon) / dt) * 3600;
  } return result;
}
function buildPolar() {
  const v1 = Config.get('minSpeed'), v2 = Config.get('trimSpeed'), v3 = Config.get('acceleratedSpeed');
  const sT = Math.abs(Config.get('sinkRate')), s1 = sT * 0.85, s2 = sT, s3 = sT * 2.8;
  const d = (v1-v2)*(v1-v3)*(v2-v3);
  const a = (v3*(s2-s1)+v2*(s1-s3)+v1*(s3-s2))/d, b = (v3*v3*(s1-s2)+v2*v2*(s3-s1)+v1*v1*(s2-s3))/d, c = (v2*v3*(v2-v3)*s1+v3*v1*(v3-v1)*s2+v1*v2*(v1-v2)*s3)/d;
  const sink = v => a*v*v+b*v+c, ldV = a > 0 ? Math.sqrt(c/a) : v2;
  return { a, b, c, sink, bestLD: { speed: ldV, sink: sink(ldV), ratio: (ldV/3.6)/sink(ldV) } };
}
function mcOptimalSpeed(polar, mc) { const vMin = Config.get('minSpeed'), vMax = Config.get('acceleratedSpeed'); let best = vMin, bestXC = -Infinity; for (let v = vMin; v <= vMax; v += 0.2) { const xc = v / (1 + polar.sink(v) / mc); if (xc > bestXC) { bestXC = xc; best = v; } } return { speed: best, xcSpeed: bestXC }; }
function extractTransitions(fixes) { const segs = []; let start = null; for (let i = 0; i < fixes.length; i++) { if (fixes[i].phase === 'transition' && start === null) start = i; else if (fixes[i].phase !== 'transition' && start !== null) { const dur = fixes[i-1].time - fixes[start].time; if (dur >= 10) { const sf = fixes.slice(start, i); segs.push({ start: fixes[start].time, duration: dur, avgSpeed: sf.reduce((s,f)=>s+(f.groundSpeed||0),0)/sf.length }); } start = null; } } return segs; }
function degToCompass(deg) { return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16]; }
