# 🪂 Open XC Analytics

**[🇫🇷 Version française](README-FR.md)**

---

**Your paragliding flights deserve better than a squiggly line on a map.**

Drop an IGC file. Get obsessed with your data.

---

```
        ___
   ____/   \____          ╭─────────────────────────╮
  /  ___   ___  \    ←    │  Was that a 2.3 or a    │
 / /   / | \   \ \        │  2.4 m/s thermal?       │
  /   /  |  \   \         │  NOW YOU'LL KNOW.       │
      \  |  /             ╰─────────────────────────╯
       \ ● /
        \|/
         │
        / \
```

## What Is This Thing?

OXCA is a fully client-side web app that tears apart your IGC flight traces and tells you everything you were too busy flying to notice. No server. No account. No telemetry. Just you and your data, in a browser.

Built for **paragliding** pilots who think about thermals in the shower.

## ⚡ Quickstart

```bash
# Option A: Just open the single file
open oxca-bundle.html

# Option B: Serve it properly (PWA + Leaflet tiles need this)
cd xc-analyzer && python3 -m http.server
# → http://localhost:8000
```

Drop a `.igc` file on it. Watch the magic.

## 📊 Six Modules, Zero Patience Required

| Module | What It Does | Why You Care |
|---|---|---|
| **Overview** | Stats grid, phase bar, altitude & speed charts | The executive summary of your flight |
| **Vario / Climb** | Climb rate vs time, altitude, distribution histogram | Find your best thermals, quantify your worst sink |
| **Wind** | Heatmaps (speed × altitude × time), scatter plots, combined arrows | See the invisible air that was pushing you around |
| **Phases** | Thermal / float / transition / sink detection with timeline | How much time did you actually spend going somewhere? |
| **Record** | Straight distance, flat triangle, FAI triangle optimization | Your official bragging numbers, on a Leaflet map |
| **MacCready** | Polar curve, sliding MC, speed-to-fly analysis, wind correction | Were you flying smart, or just flying? |

## 🏗️ Architecture

```
xc-analyzer/
├── index.html          ← PWA shell (fullscreen, installable)
├── manifest.json       ← "Add to Home Screen" config
├── sw.js               ← Offline-first service worker
├── icon.svg            ← Vector logo
├── style.css           ← Dark + Light themes via CSS vars
│
├── core/               ← The brain
│   ├── config.js       ← 16 tunable params, localStorage-backed
│   ├── geo.js          ← Haversine, bearing, circular mean
│   ├── igc-parser.js   ← B-record + H-record parsing
│   ├── flight-enricher.js  ← Derivatives, smoothing, phase detection, wind
│   ├── flight-store.js     ← Central data store
│   ├── module-registry.js  ← Plugin system + shared data bus
│   ├── chart-theme.js      ← Chart.js theme (adapts to light/dark)
│   ├── helpers.js           ← Formatters, downsamplers
│   └── app.js               ← Controller, tabs, settings, theme toggle
│
└── modules/            ← Each one is self-contained
    ├── mod-overview.js     ← reads from shared bus (vario + wind stats)
    ├── mod-vario.js        ← publishes: avgClimb, maxClimb, cumulative
    ├── mod-wind.js         ← publishes: avgSpeed, avgDir, maxSpeed
    ├── mod-phases.js
    ├── mod-record.js       ← Leaflet map + 3 distance optimizers
    └── mod-mccready.js     ← reads wind from shared bus
```

### The Plugin Dance

```
App.showAnalysis()
  │
  ├── Pass 1: mod.update()     ← each module computes its own data
  ├── Pass 2: mod.publish()    ← modules export stats to the shared bus
  └── Pass 3: mod.lateUpdate() ← modules that consume shared data refresh
```

Want to add a module? It's this easy:

```javascript
ModuleRegistry.register({
  id: 'mymod',
  name: 'My Module',
  init(container) { container.innerHTML = '<h1>Hello</h1>'; },
  update(fixes, stats, headers) { /* go wild */ },
  publish() { ModuleRegistry.publish('mymod', { myValue: 42 }); },
  lateUpdate() { const wind = ModuleRegistry.get('wind'); },
  onShow() { /* called when tab becomes visible (deferred rendering) */ },
  destroy() { /* cleanup */ },
});
```

## 🌡️ The Enrichment Pipeline

Raw IGC B-records go in. Enriched flight data comes out.

```
Raw fixes (lat, lon, alt, time)
  → Midnight rollover handling
  → Basic derivatives (speed, distance, heading, vario)
  → Smoothing (configurable window, circular heading averaging)
  → Turn rate computation
  → Phase detection (3-pass: instantaneous → majority vote → micro-segment absorption)
  → Wind estimation (thermal drift analysis → time interpolation)
  → Enriched fixes with 20+ computed fields per point
```

The phase detector was the trickiest part. Turns out "am I thermaling?" is a surprisingly philosophical question when your turn rate dips for 2 seconds mid-circle. The solution: a majority-vote smoothing window where thermal gets priority at 30% representation, then a minimum-duration filter that absorbs micro-phases back into their neighbors.

## 🎯 MacCready Theory (Adapted for Paragliders)

Classic MacCready says: "fly faster between strong thermals." The module builds a quadratic polar curve from your glider's 3 speed points and computes:

- **Sliding MC**: Average climb evolves over the flight (¼ duration window)
- **Rolling effective XC speed**: Configurable lookback window (default 25 min)
- **Wind correction toggle**: Adds avg wind to theoretical speed for straight-flight comparison

> *"A paraglider pilot applying MacCready theory is like a cyclist applying Formula 1 aerodynamics — technically correct but the speed range is... limited."*

## 📐 Record Optimization

Three types of distance records, computed via brute-force on sampled points:

- **Straight**: Takeoff → TP1 → TP2 → TP3 → Landing (O(n³))
- **Flat Triangle**: Closure ≤ 3km, maximize perimeter (two-pass: coarse + refine)
- **FAI Triangle**: Each leg ≥ 28% of perimeter

All visualized on a Leaflet map with route overlays.

## 🌬️ Wind Estimation

No airspeed sensor? No problem. When you thermal in circles, the GPS drift of the circle center IS the wind. The enricher:

1. Tracks accumulated heading change through thermal phases
2. Detects complete 360° circles
3. Measures displacement (= wind drift) over each circle
4. Collects samples per altitude band
5. Interpolates between samples (time + altitude) for full-flight wind field

The heatmaps show this as time × altitude grids with speed-as-color and tiny arrows for direction. It's basically a poor man's radiosonde.

## ⚙️ Settings

Everything is tunable. `⚙ Settings` button or just hack `localStorage`:

```javascript
// Glider performance
sinkRate: -1.0          // m/s (your wing's still-air sink)
trimSpeed: 40           // km/h
acceleratedSpeed: 55    // km/h (full bar)
minSpeed: 22            // km/h

// Phase detection
thermalClimbMin: 0.3    // m/s — below this isn't thermaling
thermalTurnRateMin: 6   // °/s — gotta be turning

// MacCready
mcRollingWindow: 25     // minutes — XC speed lookback
```

## 🌗 Light Mode

Click ☀ / 🌙 in the header. All charts adapt. Persisted to localStorage.

## 📱 PWA

Install it on your phone. It goes fullscreen. Works offline after first load. Perfect for the drive home from launch when you have no signal but desperately need to know if that last thermal was your best of the day.

## 🛠️ Tech Stack

- **Vanilla JS** — no framework, no build step, no node_modules black hole
- **Chart.js 4** + zoom plugin — all the graphs
- **Leaflet** — the map
- **CSS variables** — theming
- **Service Worker** — offline support
- **~2,200 lines of JS** across 15 modules

## 📄 IGC Format

The app reads standard IGC files as defined by the [FAI/IGC specification](https://xp-soaring.github.io/igc_file_format/igc_format_2008.html). Handles midnight rollover, data gaps, and the creative interpretation of the spec that different flight recorders enjoy.

## License

Do what you want with it. If you fly further because of it, tell your friends.

---

```
  "In the end, we only regret the thermals we didn't take."
                                        — Ancient paragliding proverb
```
