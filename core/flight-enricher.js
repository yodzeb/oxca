/* ═══════════════════════════════════════════════════════════════
   CORE: FLIGHT_ENRICHER — Enrich raw fixes with derived values
   ═══════════════════════════════════════════════════════════════ */
const FlightEnricher = (() => {

  let _lastWindSamples = [];

  function enrich(rawFixes) {
    if (!rawFixes || rawFixes.length < 2) return [];
    const fixes = handleMidnight(rawFixes);
    computeBasicDerivatives(fixes);
    const win = Config.get('smoothingWindow');
    smoothField(fixes, 'rawVario', 'vario', win);
    smoothField(fixes, 'rawGroundSpeed', 'groundSpeed', win);
    smoothHeading(fixes, win);
    computeTurnRate(fixes);
    detectPhases(fixes);
    estimateWind(fixes);
    return fixes;
  }

  function handleMidnight(fixes) {
    const out = [];
    let offset = 0;
    for (let i = 0; i < fixes.length; i++) {
      const f = { ...fixes[i] };
      if (i > 0 && f.time + offset < out[out.length - 1].time - 1000) offset += 86400;
      f.time += offset;
      out.push(f);
    }
    return out;
  }

  function computeBasicDerivatives(fixes) {
    fixes[0].dt = 0; fixes[0].rawVario = 0; fixes[0].rawGroundSpeed = 0;
    fixes[0].rawHeading = 0; fixes[0].dist = 0; fixes[0].cumDist = 0; fixes[0].isGap = false;
    for (let i = 1; i < fixes.length; i++) {
      const prev = fixes[i - 1], cur = fixes[i];
      const dt = cur.time - prev.time;
      cur.dt = dt;
      const d = Geo.distance(prev.lat, prev.lon, cur.lat, cur.lon);
      cur.dist = d;
      cur.cumDist = prev.cumDist + d;
      cur.rawVario = dt > 0 ? (cur.alt - prev.alt) / dt : 0;
      cur.rawGroundSpeed = dt > 0 ? (d / dt) * 3600 : 0;
      cur.rawHeading = Geo.bearing(prev.lat, prev.lon, cur.lat, cur.lon);
      cur.isGap = dt > Config.get('gapThreshold');
    }
  }

  function smoothField(fixes, rawKey, smoothKey, windowSec) {
    const half = Math.floor(windowSec / 2);
    for (let i = 0; i < fixes.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(fixes.length - 1, i + half); j++) {
        if (!fixes[j].isGap) { sum += fixes[j][rawKey]; count++; }
      }
      fixes[i][smoothKey] = count > 0 ? sum / count : fixes[i][rawKey];
    }
  }

  function smoothHeading(fixes, windowSec) {
    const half = Math.floor(windowSec / 2);
    for (let i = 0; i < fixes.length; i++) {
      let sinSum = 0, cosSum = 0, count = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(fixes.length - 1, i + half); j++) {
        if (!fixes[j].isGap) {
          sinSum += Math.sin(Geo.toRad(fixes[j].rawHeading));
          cosSum += Math.cos(Geo.toRad(fixes[j].rawHeading));
          count++;
        }
      }
      fixes[i].heading = count > 0
        ? (Geo.toDeg(Math.atan2(sinSum / count, cosSum / count)) + 360) % 360
        : fixes[i].rawHeading;
    }
  }

  function computeTurnRate(fixes) {
    fixes[0].turnRate = 0;
    for (let i = 1; i < fixes.length; i++) {
      if (fixes[i].dt > 0 && !fixes[i].isGap) {
        let dh = fixes[i].heading - fixes[i - 1].heading;
        if (dh > 180) dh -= 360;
        if (dh < -180) dh += 360;
        fixes[i].turnRate = dh / fixes[i].dt;
      } else { fixes[i].turnRate = 0; }
    }
    smoothField(fixes, 'turnRate', 'turnRateSmooth', Config.get('smoothingWindow'));
  }

  /**
   * Phase detection with temporal continuity.
   * 1. Instantaneous raw classification
   * 2. Majority-vote smoothing over wide window (thermal gets priority at 30%)
   * 3. Remove micro-segments (<8s) by absorbing into neighbors
   */
  function detectPhases(fixes) {
    // Step 1: instantaneous
    for (const f of fixes) {
      const absRate = Math.abs(f.turnRateSmooth || 0);
      const climb = f.vario || 0;
      const speed = f.groundSpeed || 0;

      if (absRate > Config.get('thermalTurnRateMin') && climb > Config.get('floatSinkMax')) {
        f.rawPhase = 'thermal';
      } else if (climb > Config.get('floatSinkMax') && climb <= Config.get('thermalClimbMin') && absRate <= Config.get('thermalTurnRateMin')) {
        f.rawPhase = 'float';
      } else if (speed > Config.get('transitionSpeedMin') && climb > Config.get('sinkRateThreshold')) {
        f.rawPhase = 'transition';
      } else if (climb <= Config.get('sinkRateThreshold')) {
        f.rawPhase = 'sink';
      } else {
        f.rawPhase = 'transition';
      }
    }

    // Step 2: majority-vote smoothing
    const phaseWindow = Math.max(10, Config.get('smoothingWindow') * 2);
    const half = Math.floor(phaseWindow / 2);
    for (let i = 0; i < fixes.length; i++) {
      const counts = { thermal: 0, float: 0, transition: 0, sink: 0 };
      for (let j = Math.max(0, i - half); j <= Math.min(fixes.length - 1, i + half); j++) {
        counts[fixes[j].rawPhase]++;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      // Thermal priority: if turning & not sinking hard, keep as thermal
      if (counts.thermal / total >= 0.30) {
        fixes[i].phase = 'thermal';
      } else {
        let maxPhase = fixes[i].rawPhase, maxCount = 0;
        for (const p of ['thermal', 'float', 'transition', 'sink']) {
          if (counts[p] > maxCount) { maxCount = counts[p]; maxPhase = p; }
        }
        fixes[i].phase = maxPhase;
      }
    }

    // Step 3: absorb micro-segments
    const minPhaseDur = 8;
    let segStart = 0;
    for (let i = 1; i <= fixes.length; i++) {
      if (i === fixes.length || fixes[i].phase !== fixes[segStart].phase) {
        const segDur = (fixes[Math.min(i, fixes.length) - 1].time || 0) - (fixes[segStart].time || 0);
        if (segDur < minPhaseDur && segStart > 0) {
          const prevPhase = fixes[segStart - 1].phase;
          for (let k = segStart; k < i && k < fixes.length; k++) fixes[k].phase = prevPhase;
        }
        segStart = i;
      }
    }
  }

  function estimateWind(fixes) {
    const windSamples = [];
    let headingAccum = 0, circleStartIdx = null;

    for (let i = 1; i < fixes.length; i++) {
      if (fixes[i].phase !== 'thermal' || fixes[i].isGap) {
        headingAccum = 0; circleStartIdx = null; continue;
      }
      if (circleStartIdx === null) { circleStartIdx = i; headingAccum = 0; continue; }

      let dh = fixes[i].rawHeading - fixes[i - 1].rawHeading;
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      headingAccum += dh;

      if (Math.abs(headingAccum) >= 350) {
        const dt = fixes[i].time - fixes[circleStartIdx].time;
        if (dt >= Config.get('minTurnDuration') && dt < 180) {
          const driftDist = Geo.distance(fixes[circleStartIdx].lat, fixes[circleStartIdx].lon, fixes[i].lat, fixes[i].lon);
          const driftSpeed = (driftDist / dt) * 3600;
          const driftDir = Geo.bearing(fixes[circleStartIdx].lat, fixes[circleStartIdx].lon, fixes[i].lat, fixes[i].lon);
          const windFromDir = (driftDir + 180) % 360;
          const avgAlt = (fixes[circleStartIdx].alt + fixes[i].alt) / 2;
          const midTime = (fixes[circleStartIdx].time + fixes[i].time) / 2;
          if (driftSpeed < 80) {
            windSamples.push({ time: midTime, alt: avgAlt, speed: driftSpeed, dir: windFromDir, turnDuration: dt });
            for (let k = circleStartIdx; k <= i; k++) fixes[k].turnDuration = dt;
          }
        }
        headingAccum = 0; circleStartIdx = i;
      }
    }

    _lastWindSamples = windSamples;
    windSamples.sort((a, b) => a.time - b.time);

    for (const f of fixes) {
      if (windSamples.length === 0) { f.windSpeed = null; f.windDir = null; continue; }
      let before = null, after = null;
      for (const s of windSamples) {
        if (s.time <= f.time) before = s;
        if (s.time >= f.time && !after) after = s;
      }
      if (before && after && before !== after) {
        const t = (f.time - before.time) / (after.time - before.time);
        f.windSpeed = before.speed + t * (after.speed - before.speed);
        let dd = after.dir - before.dir;
        if (dd > 180) dd -= 360; if (dd < -180) dd += 360;
        f.windDir = (before.dir + t * dd + 360) % 360;
      } else if (before) { f.windSpeed = before.speed; f.windDir = before.dir; }
      else if (after) { f.windSpeed = after.speed; f.windDir = after.dir; }
      else { f.windSpeed = null; f.windDir = null; }
    }
  }

  function getWindSamples() { return _lastWindSamples; }

  return { enrich, getWindSamples };
})();
