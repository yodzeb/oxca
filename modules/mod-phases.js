/* ═══════════════════════════════════════════════════════════════
   MODULE: Phase Analysis
   ═══════════════════════════════════════════════════════════════ */
ModuleRegistry.register({
  id: 'phases',
  name: 'Phases',
  charts: [],

  init(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Phase Timeline</div>
        <div class="chart-container" style="height:120px"><canvas id="chart-phase-timeline"></canvas></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">Phase Duration Breakdown</div>
          <div class="chart-container"><canvas id="chart-phase-pie"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Thermal Segments</div>
          <div id="thermal-segments-list" style="max-height:320px;overflow-y:auto;"></div>
        </div>
      </div>
    `;
  },

  update(fixes, stats) {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    if (!fixes || fixes.length < 2 || !stats) return;

    const phaseColorMap = {
      thermal: 'rgba(240,136,74,0.9)',
      float: 'rgba(160,168,192,0.6)',
      transition: 'rgba(123,140,222,0.7)',
      sink: 'rgba(224,92,108,0.8)',
    };

    const ds = downsample(fixes, 1500);

    // Phase timeline
    this.charts.push(new Chart(document.getElementById('chart-phase-timeline').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ds.map(f => formatTime(f.time)),
        datasets: [{
          data: ds.map(() => 1),
          backgroundColor: ds.map(f => phaseColorMap[f.phase] || 'rgba(100,100,100,0.3)'),
          borderWidth: 0,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: true, ticks: { color: '#8b91a3', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
          y: { display: false, max: 1.2 }
        }
      }
    }));

    // Phase doughnut
    const phNames = ['Thermal', 'Float', 'Transition', 'Sink'];
    const phKeys = ['thermal', 'float', 'transition', 'sink'];
    const phColors = [
      'rgba(240,136,74,0.85)', 'rgba(160,168,192,0.6)',
      'rgba(123,140,222,0.75)', 'rgba(224,92,108,0.8)'
    ];
    this.charts.push(new Chart(document.getElementById('chart-phase-pie').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: phNames,
        datasets: [{
          data: phKeys.map(k => stats.phases[k] || 0),
          backgroundColor: phColors,
          borderColor: '#181c25',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#8b91a3', font: { family: 'DM Sans', size: 12 }, padding: 14 }
          },
          tooltip: {
            ...ChartTheme.tooltip,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
                return ` ${ctx.label}: ${formatTime(ctx.parsed)} (${pct}%)`;
              }
            }
          }
        }
      }
    }));

    // Thermal segments list
    const segments = extractThermalSegments(fixes);
    const listEl = document.getElementById('thermal-segments-list');
    if (segments.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">No thermal segments detected.</div>';
    } else {
      listEl.innerHTML = segments.map((seg, i) => `
        <div style="display:flex;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.82rem;">
          <span style="color:var(--thermal);font-family:var(--font-mono);min-width:24px;">#${i+1}</span>
          <span style="font-family:var(--font-mono);min-width:60px;">${formatTime(seg.start)}</span>
          <span style="color:var(--text-secondary);min-width:50px;">${seg.duration}s</span>
          <span style="color:var(--climb);min-width:70px;">↑ ${seg.avgClimb.toFixed(2)} m/s</span>
          <span style="color:var(--text-muted);">${seg.altGain.toFixed(0)}m gained</span>
        </div>
      `).join('');
    }
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }
});

function extractThermalSegments(fixes) {
  const segments = [];
  let segStart = null;

  for (let i = 0; i < fixes.length; i++) {
    if (fixes[i].phase === 'thermal' && segStart === null) {
      segStart = i;
    } else if (fixes[i].phase !== 'thermal' && segStart !== null) {
      const dur = fixes[i - 1].time - fixes[segStart].time;
      if (dur >= Config.get('minTurnDuration')) {
        const segFixes = fixes.slice(segStart, i);
        const avgClimb = segFixes.reduce((s, f) => s + (f.vario || 0), 0) / segFixes.length;
        const altGain = fixes[i - 1].alt - fixes[segStart].alt;
        segments.push({ start: fixes[segStart].time, end: fixes[i - 1].time, duration: dur, avgClimb, altGain });
      }
      segStart = null;
    }
  }
  return segments;
}
