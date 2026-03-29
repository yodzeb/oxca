/* ═══════════════════════════════════════════════════════════════
   MODULE: Record — Distance optimization with Leaflet map
   ═══════════════════════════════════════════════════════════════ */
ModuleRegistry.register({
  id: 'record',
  name: 'Record',
  charts: [],
  _map: null,
  _mapReady: false,
  _results: null,
  _fixes: null,

  init(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Distance Records</div>
        <div id="record-computing" style="display:none; padding:12px; color:var(--text-muted); font-size:0.85rem;">
          Computing optimal routes…
        </div>
        <div class="three-col" id="record-results"></div>
      </div>
      <div class="card">
        <div class="card-title">Route Visualization</div>
        <div id="record-map" class="leaflet-map-container"></div>
      </div>
    `;
  },

  update(fixes, stats) {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    if (this._map) { this._map.remove(); this._map = null; }
    this._mapReady = false;
    this._results = null;
    this._fixes = fixes;
    if (!fixes || fixes.length < 10 || !stats) return;

    const resultsEl = document.getElementById('record-results');
    const computingEl = document.getElementById('record-computing');
    computingEl.style.display = 'block';
    resultsEl.innerHTML = '';
    const duration = stats.duration;

    setTimeout(() => {
      const step = Math.max(1, Math.floor(fixes.length / 600));
      const sampled = fixes.filter((_, i) => i % step === 0);
      if (sampled[sampled.length - 1] !== fixes[fixes.length - 1]) sampled.push(fixes[fixes.length - 1]);

      const straight = optimizeStraight(sampled);
      const flatTri = optimizeFlatTriangle(sampled);
      const faiTri = optimizeFAITriangle(sampled);

      if (straight) straight.avgSpeed = (straight.distance / duration) * 3600;
      if (flatTri) flatTri.avgSpeed = (flatTri.distance / duration) * 3600;
      if (faiTri) faiTri.avgSpeed = (faiTri.distance / duration) * 3600;

      computingEl.style.display = 'none';
      resultsEl.innerHTML =
        renderResult('Straight Distance', '3 turning points', straight) +
        renderResult('Flat Triangle', 'closure ≤ ' + Config.get('triangleClosureMax') + ' km', flatTri) +
        renderResult('FAI Triangle', 'min leg ≥ 28%', faiTri);

      this._results = { straight, flatTri, faiTri };
      this._mapReady = true;

      const panel = document.getElementById('panel-record');
      if (panel && panel.classList.contains('active')) this.onShow();
    }, 50);
  },

  onShow() {
    if (!this._mapReady || !this._results || !this._fixes) return;
    if (this._map) return;

    const mapEl = document.getElementById('record-map');
    if (!mapEl || mapEl.clientWidth === 0) return;

    const fixes = this._fixes;
    const { straight, flatTri, faiTri } = this._results;

    const map = L.map(mapEl, { zoomControl: true });
    this._map = map;

    // Try multiple tile providers — OSM is the most reliable
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Flight trace
    const traceCoords = downsample(fixes, 2000).map(f => [f.lat, f.lon]);
    // Flight trace — dark outline + bright magenta for contrast against green topo
    L.polyline(traceCoords, { color: '#1a1a2e', weight: 6, opacity: 0.5 }).addTo(map); // shadow
    L.polyline(traceCoords, { color: '#e040a0', weight: 3.5, opacity: 0.75 }).addTo(map);

    const allCoords = [...traceCoords];
    const addRoute = (result, color, label) => {
      if (!result || !result.points) return;
      const coords = result.points.map(p => [p.lat, p.lon]);
      L.polyline(coords, { color, weight: 3, opacity: 0.85 }).addTo(map);
      result.points.forEach((p, i) => {
        L.circleMarker([p.lat, p.lon], { radius: 6, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9 })
          .addTo(map)
          .bindTooltip(`${label}: ${result.labels[i]}<br>${formatTime(p.time)} — ${p.alt.toFixed(0)}m`, { permanent: false });
      });
      allCoords.push(...coords);
    };

    addRoute(straight, '#4f9cf7', 'Straight');
    addRoute(flatTri, '#5dd39e', 'Flat △');
    addRoute(faiTri, '#f0884a', 'FAI △');

    if (allCoords.length > 0) map.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });

    const legend = L.control({ position: 'topright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', '');
      div.style.cssText = 'background:rgba(24,28,37,0.92);padding:8px 12px;border-radius:6px;font-size:12px;color:#e8eaf0;line-height:1.8;font-family:DM Sans;';
      div.innerHTML = `
        <div><span style="color:#e040a0">━━</span> Track</div>
        <div><span style="color:#4f9cf7">━━</span> Straight ${straight ? straight.distance.toFixed(1)+'km' : '—'}</div>
        <div><span style="color:#5dd39e">━━</span> Flat △ ${flatTri ? flatTri.distance.toFixed(1)+'km' : '—'}</div>
        <div><span style="color:#f0884a">━━</span> FAI △ ${faiTri ? faiTri.distance.toFixed(1)+'km' : '—'}</div>
      `;
      return div;
    };
    legend.addTo(map);
  },

  destroy() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    if (this._map) { this._map.remove(); this._map = null; }
    this._mapReady = false;
  }
});

/* ─── Optimizers (unchanged) ────────────────────────────────── */
function optimizeStraight(fixes) {
  const n = fixes.length;
  if (n < 5) return null;
  const takeoff = fixes[0], landing = fixes[n - 1];
  let bestDist = 0, bestI = -1, bestJ = -1, bestK = -1;
  const dFromTakeoff = fixes.map(f => Geo.distance(takeoff.lat, takeoff.lon, f.lat, f.lon));
  const dToLanding = fixes.map(f => Geo.distance(f.lat, f.lon, landing.lat, landing.lon));
  for (let i = 1; i < n - 3; i++)
    for (let j = i + 1; j < n - 2; j++) {
      const dIJ = Geo.distance(fixes[i].lat, fixes[i].lon, fixes[j].lat, fixes[j].lon);
      for (let k = j + 1; k < n - 1; k++) {
        const total = dFromTakeoff[i] + dIJ + Geo.distance(fixes[j].lat, fixes[j].lon, fixes[k].lat, fixes[k].lon) + dToLanding[k];
        if (total > bestDist) { bestDist = total; bestI = i; bestJ = j; bestK = k; }
      }
    }
  if (bestI < 0) return null;
  return {
    distance: bestDist,
    points: [takeoff, fixes[bestI], fixes[bestJ], fixes[bestK], landing],
    labels: ['Takeoff', 'TP1', 'TP2', 'TP3', 'Landing'],
    legs: [
      { from: 'Takeoff', to: 'TP1', dist: dFromTakeoff[bestI] },
      { from: 'TP1', to: 'TP2', dist: Geo.distance(fixes[bestI].lat, fixes[bestI].lon, fixes[bestJ].lat, fixes[bestJ].lon) },
      { from: 'TP2', to: 'TP3', dist: Geo.distance(fixes[bestJ].lat, fixes[bestJ].lon, fixes[bestK].lat, fixes[bestK].lon) },
      { from: 'TP3', to: 'Landing', dist: dToLanding[bestK] },
    ],
  };
}

function optimizeFlatTriangle(fixes) { return optimizeTriangle(fixes, false); }
function optimizeFAITriangle(fixes) { return optimizeTriangle(fixes, true); }

function optimizeTriangle(fixes, fai) {
  const n = fixes.length; if (n < 6) return null;
  const closureMax = Config.get('triangleClosureMax');
  const takeoff = fixes[0], landing = fixes[n - 1];
  let bestP = 0, bestR = null;
  const step = Math.max(1, Math.floor(n / 150));
  for (let si = 1; si < n - 5; si += step)
    for (let ei = si + 4; ei < n - 1; ei += step) {
      if (Geo.distance(fixes[si].lat, fixes[si].lon, fixes[ei].lat, fixes[ei].lon) > closureMax) continue;
      const tri = findBestTriangle(fixes, si, ei, fai);
      if (tri && tri.perimeter > bestP) { bestP = tri.perimeter; bestR = { ...tri, startIdx: si, endIdx: ei, closure: Geo.distance(fixes[si].lat, fixes[si].lon, fixes[ei].lat, fixes[ei].lon) }; }
    }
  if (bestR) {
    const ref = step * 2;
    for (let si = Math.max(1, bestR.startIdx - ref); si <= Math.min(n - 6, bestR.startIdx + ref); si++)
      for (let ei = Math.max(si + 4, bestR.endIdx - ref); ei <= Math.min(n - 2, bestR.endIdx + ref); ei++) {
        const cl = Geo.distance(fixes[si].lat, fixes[si].lon, fixes[ei].lat, fixes[ei].lon);
        if (cl > closureMax) continue;
        const tri = findBestTriangle(fixes, si, ei, fai);
        if (tri && tri.perimeter > bestP) { bestP = tri.perimeter; bestR = { ...tri, startIdx: si, endIdx: ei, closure: cl }; }
      }
  }
  if (!bestR) return null;
  const { ai, bi, ci, startIdx, endIdx, closure, perimeter } = bestR;
  const legs = [
    { from: 'A', to: 'B', dist: Geo.distance(fixes[ai].lat, fixes[ai].lon, fixes[bi].lat, fixes[bi].lon) },
    { from: 'B', to: 'C', dist: Geo.distance(fixes[bi].lat, fixes[bi].lon, fixes[ci].lat, fixes[ci].lon) },
    { from: 'C', to: 'A', dist: Geo.distance(fixes[ci].lat, fixes[ci].lon, fixes[ai].lat, fixes[ai].lon) },
  ];
  return { distance: perimeter, closure, points: [takeoff, fixes[startIdx], fixes[ai], fixes[bi], fixes[ci], fixes[endIdx], landing], labels: ['Takeoff', 'Start △', 'A', 'B', 'C', 'End △', 'Landing'], legs, legPcts: legs.map(l => ((l.dist / perimeter) * 100).toFixed(1)), fai };
}

function findBestTriangle(fixes, si, ei, fai) {
  const range = ei - si; if (range < 3) return null;
  const step = Math.max(1, Math.floor(range / 60));
  const idx = []; for (let i = si; i <= ei; i += step) idx.push(i);
  if (idx[idx.length - 1] !== ei) idx.push(ei);
  let bestP = 0, bA = -1, bB = -1, bC = -1;
  for (let ia = 0; ia < idx.length - 2; ia++)
    for (let ib = ia + 1; ib < idx.length - 1; ib++) {
      const dAB = Geo.distance(fixes[idx[ia]].lat, fixes[idx[ia]].lon, fixes[idx[ib]].lat, fixes[idx[ib]].lon);
      for (let ic = ib + 1; ic < idx.length; ic++) {
        const dBC = Geo.distance(fixes[idx[ib]].lat, fixes[idx[ib]].lon, fixes[idx[ic]].lat, fixes[idx[ic]].lon);
        const dCA = Geo.distance(fixes[idx[ic]].lat, fixes[idx[ic]].lon, fixes[idx[ia]].lat, fixes[idx[ia]].lon);
        const p = dAB + dBC + dCA;
        if (fai && (dAB < 0.28 * p || dBC < 0.28 * p || dCA < 0.28 * p)) continue;
        if (p > bestP) { bestP = p; bA = idx[ia]; bB = idx[ib]; bC = idx[ic]; }
      }
    }
  return bA < 0 ? null : { perimeter: bestP, ai: bA, bi: bB, ci: bC };
}

function renderResult(title, subtitle, result) {
  if (!result) return `<div class="record-result"><div class="record-result-title">${title}</div><div class="record-distance">—</div><div class="record-detail">${subtitle}<br>No valid solution</div></div>`;
  const legInfo = result.legs.map((l, i) => { const pct = result.legPcts ? ` (${result.legPcts[i]}%)` : ''; return `${l.from}→${l.to}: ${l.dist.toFixed(2)} km${pct}`; }).join('<br>');
  const closureInfo = result.closure !== undefined ? ` · Closure: ${result.closure.toFixed(2)} km` : '';
  const speedInfo = result.avgSpeed ? `<div class="record-detail" style="margin-top:6px;">Eff. avg speed: <span style="color:var(--accent)">${result.avgSpeed.toFixed(1)} km/h</span></div>` : '';
  const tpList = result.points.map((p, i) => `<div class="tp-row"><span class="tp-idx">${result.labels[i]}</span><span class="tp-time">${formatTime(p.time)}</span><span class="tp-alt">${p.alt.toFixed(0)}m</span><span class="tp-coord">${formatCoord(p.lat, p.lon)}</span></div>`).join('');
  return `<div class="record-result"><div class="record-result-title">${title}</div><div class="record-distance">${result.distance.toFixed(2)} <span class="unit">km</span></div><div class="record-detail">${subtitle}${closureInfo}</div>${speedInfo}<div class="record-detail" style="margin-top:6px;">${legInfo}</div><div class="record-tp-list">${tpList}</div></div>`;
}
