/* ═══════════════════════════════════════════════════════════════
   MODULE: Overview — Global Stats + cross-module summary
   Uses lateUpdate() to read published data from wind/vario modules
   ═══════════════════════════════════════════════════════════════ */
ModuleRegistry.register({
  id: 'overview',
  name: 'Overview',
  charts: [],

  init(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Flight Statistics</div>
        <div class="stats-grid" id="mod-overview-stats"></div>
      </div>
      <div class="card">
        <div class="card-title">Cross-Module Summary</div>
        <div class="stats-grid" id="mod-overview-xmod"></div>
      </div>
      <div class="card">
        <div class="card-title">Phase Distribution</div>
        <div class="phase-bar-container" id="mod-overview-phases"></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Altitude vs Time</div>
          <div class="chart-container"><canvas id="chart-alt-time"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Ground Speed vs Time</div>
          <div class="chart-container"><canvas id="chart-speed-time"></canvas></div>
        </div>
      </div>
    `;
  },

  update(fixes, stats) {
    if (!stats) return;

    document.getElementById('mod-overview-stats').innerHTML = `
      ${statHTML('Total Distance', stats.totalDist.toFixed(1), 'km')}
      ${statHTML('Duration', formatTime(stats.duration), '')}
      ${statHTML('Max Altitude', stats.maxAlt.toFixed(0), 'm')}
      ${statHTML('Min Altitude', stats.minAlt.toFixed(0), 'm')}
      ${statHTML('Max Speed', stats.maxSpeed.toFixed(1), 'km/h')}
      ${statHTML('Avg Turn', stats.avgTurnDuration.toFixed(1), 's')}
    `;

    const ph = stats.phaseRatios;
    document.getElementById('mod-overview-phases').innerHTML = `
      <div class="phase-bar">
        <div class="phase-segment" style="width:${ph.thermal*100}%;background:var(--thermal)"></div>
        <div class="phase-segment" style="width:${ph.float*100}%;background:var(--float)"></div>
        <div class="phase-segment" style="width:${ph.transition*100}%;background:var(--transition)"></div>
        <div class="phase-segment" style="width:${ph.sink*100}%;background:var(--sink)"></div>
      </div>
      <div class="phase-legend">
        ${phaseLegend('Thermal', 'var(--thermal)', ph.thermal)}
        ${phaseLegend('Float', 'var(--float)', ph.float)}
        ${phaseLegend('Transition', 'var(--transition)', ph.transition)}
        ${phaseLegend('Sink', 'var(--sink)', ph.sink)}
      </div>
    `;

    this.charts.forEach(c => c.destroy());
    this.charts = [];

    const ds = downsample(fixes, 1200);
    const labels = ds.map(f => formatTime(f.time));

    const phaseColors = ds.map(f => {
      if (f.phase === 'thermal') return 'rgba(240,136,74,0.9)';
      if (f.phase === 'sink') return 'rgba(224,92,108,0.9)';
      if (f.phase === 'float') return 'rgba(160,168,192,0.7)';
      return 'rgba(123,140,222,0.7)';
    });

    this.charts.push(new Chart(document.getElementById('chart-alt-time').getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ data: ds.map(f => f.alt), borderColor: '#4f9cf7', backgroundColor: 'rgba(79,156,247,0.08)', fill: true, segment: { borderColor: ctx => phaseColors[ctx.p0DataIndex] || '#4f9cf7' }, tension: 0.15 }] },
      options: ChartTheme.defaultOptions('Altitude (m)', 'Time'),
    }));

    this.charts.push(new Chart(document.getElementById('chart-speed-time').getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ data: ds.map(f => f.groundSpeed || 0), borderColor: '#7b8cde', backgroundColor: 'rgba(123,140,222,0.08)', fill: true, tension: 0.15 }] },
      options: ChartTheme.defaultOptions('Speed (km/h)', 'Time'),
    }));
  },

  /** Called after all modules have published their stats */
  lateUpdate(fixes, stats) {
    const wind = ModuleRegistry.get('wind');
    const vario = ModuleRegistry.get('vario');

    const xmodEl = document.getElementById('mod-overview-xmod');
    let html = '';

    if (vario) {
      html += statHTML('Avg Climb', vario.avgClimb.toFixed(2), 'm/s');
      html += statHTML('Max Climb', vario.maxClimb.toFixed(2), 'm/s');
      html += statHTML('Max Sink', vario.maxSink.toFixed(2), 'm/s');
      html += statHTML('Cumul. Climb', vario.cumulativeClimb.toFixed(0), 'm');
      html += statHTML('Cumul. Descent', vario.cumulativeDescent.toFixed(0), 'm');
    }

    if (wind && wind.avgSpeed > 0) {
      html += statHTML('Avg Wind', wind.avgSpeed.toFixed(1), 'km/h');
      html += statHTML('Wind Direction', wind.avgDir.toFixed(0) + '° ' + degToCompass(wind.avgDir), '');
      html += statHTML('Max Wind', wind.maxSpeed.toFixed(1), 'km/h');
    }

    xmodEl.innerHTML = html || '<div class="stat-item" style="grid-column:1/-1"><div class="stat-label">No cross-module data yet</div></div>';
  },

  destroy() { this.charts.forEach(c => c.destroy()); this.charts = []; }
});
