/* ═══════════════════════════════════════════════════════════════
   CORE: GEO — Geographic utility functions
   ═══════════════════════════════════════════════════════════════ */
const Geo = (() => {
  const R = 6371; // Earth radius km

  /** Haversine distance in km between two lat/lon points */
  function distance(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Bearing in degrees [0, 360) from point 1 to point 2 */
  function bearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  /** Circular mean of angles in degrees */
  function circularMean(angles) {
    if (!angles.length) return 0;
    let sinSum = 0, cosSum = 0;
    for (const a of angles) {
      sinSum += Math.sin(toRad(a));
      cosSum += Math.cos(toRad(a));
    }
    return (toDeg(Math.atan2(sinSum / angles.length, cosSum / angles.length)) + 360) % 360;
  }

  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }

  return { distance, bearing, circularMean, toRad, toDeg };
})();
