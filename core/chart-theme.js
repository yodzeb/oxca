/* ═══════════════════════════════════════════════════════════════
   CORE: CHART_THEME — Reads CSS variables for light/dark adaptation
   ═══════════════════════════════════════════════════════════════ */
const ChartTheme = {
  _css(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  },

  get fontColor() { return this._css('--chart-font') || '#8b91a3'; },
  get gridColor() { return this._css('--chart-grid') || 'rgba(255,255,255,0.05)'; },
  get gridBorder() { return this._css('--chart-grid-border') || 'rgba(255,255,255,0.08)'; },

  get tooltip() {
    return {
      backgroundColor: this._css('--chart-tooltip-bg') || '#1e2330',
      titleColor: this._css('--chart-tooltip-title') || '#e8eaf0',
      bodyColor: this._css('--chart-tooltip-body') || '#8b91a3',
      borderColor: this._css('--chart-tooltip-border') || '#252a36',
      borderWidth: 1, cornerRadius: 6, padding: 10,
      titleFont: { family: 'DM Sans', weight: '600', size: 12 },
      bodyFont: { family: 'JetBrains Mono', size: 11 },
    };
  },

  scales(yLabel, xLabel) {
    return {
      x: {
        ticks: { color: this.fontColor, font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 },
        grid: { color: this.gridColor },
        border: { color: this.gridBorder },
        title: xLabel ? { display: true, text: xLabel, color: this.fontColor, font: { family: 'DM Sans', size: 11 } } : undefined,
      },
      y: {
        ticks: { color: this.fontColor, font: { family: 'JetBrains Mono', size: 10 } },
        grid: { color: this.gridColor },
        border: { color: this.gridBorder },
        title: yLabel ? { display: true, text: yLabel, color: this.fontColor, font: { family: 'DM Sans', size: 11 } } : undefined,
      }
    };
  },

  defaultOptions(yLabel, xLabel) {
    return {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: this.tooltip,
        zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } }
      },
      scales: this.scales(yLabel, xLabel),
      elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
    };
  }
};
