/* ═══════════════════════════════════════════════════════════════
   MODULE: Vario / Climb Rate Analysis
   Publishes: { avgClimb, maxClimb, maxSink, cumulativeClimb, cumulativeDescent }
   ═══════════════════════════════════════════════════════════════ */
ModuleRegistry.register({
  id: 'vario',
  name: 'Vario / Climb',
  charts: [],
  _pubData: null,

  init(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Climb Statistics</div>
        <div class="stats-grid" id="mod-vario-stats"></div>
      </div>
      <div class="card">
        <div class="card-title">Climb Rate vs Time</div>
        <div class="chart-container" style="height:300px"><canvas id="chart-vario-time"></canvas></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Climb Rate vs Altitude</div>
          <div class="chart-container"><canvas id="chart-vario-alt"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Climb Rate Distribution</div>
          <div class="chart-container"><canvas id="chart-vario-hist"></canvas></div>
        </div>
      </div>
    `;
  },

  update(fixes, stats) {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this._pubData = null;
    if (!fixes || fixes.length < 2) return;

    // Compute cumulative climb and descent
    let cumClimb = 0, cumDescent = 0;
    for (let i = 1; i < fixes.length; i++) {
      if (fixes[i].isGap) continue;
      const dAlt = fixes[i].alt - fixes[i - 1].alt;
      if (dAlt > 0) cumClimb += dAlt;
      else cumDescent += Math.abs(dAlt);
    }

    const climbFixes = fixes.filter(f => f.vario > 0);
    const avgClimb = climbFixes.length > 0 ? climbFixes.reduce((s, f) => s + f.vario, 0) / climbFixes.length : 0;
    const maxClimb = fixes.reduce((m, f) => Math.max(m, f.vario || 0), 0);
    const maxSink = fixes.reduce((m, f) => Math.min(m, f.vario || 0), 0);

    this._pubData = { avgClimb, maxClimb, maxSink, cumulativeClimb: cumClimb, cumulativeDescent: cumDescent };

    // Stats display
    document.getElementById('mod-vario-stats').innerHTML = `
      ${statHTML('Avg Climb', avgClimb.toFixed(2), 'm/s')}
      ${statHTML('Max Climb', maxClimb.toFixed(2), 'm/s')}
      ${statHTML('Max Sink', maxSink.toFixed(2), 'm/s')}
      ${statHTML('Cumul. Climb', cumClimb.toFixed(0), 'm')}
      ${statHTML('Cumul. Descent', cumDescent.toFixed(0), 'm')}
      ${statHTML('Climb/Descent', (cumDescent > 0 ? (cumClimb / cumDescent).toFixed(2) : '—'), '')}
    `;

    const ds = downsample(fixes, 1200);

    // Vario vs Time bar
    const vData = ds.map(f => f.vario || 0);
    this.charts.push(new Chart(document.getElementById('chart-vario-time').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ds.map(f => formatTime(f.time)),
        datasets: [{ data: vData, backgroundColor: vData.map(v => v > 0 ? 'rgba(93,211,158,0.8)' : 'rgba(224,92,108,0.8)'), borderWidth: 0, barPercentage: 1.0, categoryPercentage: 1.0 }]
      },
      options: ChartTheme.defaultOptions('Vario (m/s)', 'Time'),
    }));

    // Vario vs Altitude scatter
    const thermalPts = ds.filter(f => f.phase === 'thermal');
    const otherPts = ds.filter(f => f.phase !== 'thermal');
    this.charts.push(new Chart(document.getElementById('chart-vario-alt').getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Thermal', data: thermalPts.map(f => ({ x: f.vario, y: f.alt })), backgroundColor: 'rgba(240,136,74,0.5)', pointRadius: 2 },
          { label: 'Other', data: otherPts.map(f => ({ x: f.vario, y: f.alt })), backgroundColor: 'rgba(123,140,222,0.25)', pointRadius: 1.5 },
        ]
      },
      options: { ...ChartTheme.defaultOptions('Altitude (m)', 'Vario (m/s)'), plugins: { legend: { display: true, labels: { color: '#8b91a3', font: { family: 'DM Sans', size: 11 } } }, tooltip: ChartTheme.tooltip } }
    }));

    // Histogram
    const bins = {}; const step = 0.5;
    for (const f of fixes) { const bin = Math.round((f.vario || 0) / step) * step; bins[bin] = (bins[bin] || 0) + 1; }
    const sortedBins = Object.keys(bins).map(Number).sort((a, b) => a - b);
    this.charts.push(new Chart(document.getElementById('chart-vario-hist').getContext('2d'), {
      type: 'bar',
      data: { labels: sortedBins.map(b => b.toFixed(1)), datasets: [{ data: sortedBins.map(b => bins[b]), backgroundColor: sortedBins.map(b => b >= 0 ? 'rgba(93,211,158,0.7)' : 'rgba(224,92,108,0.7)'), borderWidth: 0 }] },
      options: ChartTheme.defaultOptions('Count', 'Vario (m/s)'),
    }));
  },

  publish() {
    if (this._pubData) ModuleRegistry.publish('vario', this._pubData);
  },

  destroy() { this.charts.forEach(c => c.destroy()); this.charts = []; }
});
