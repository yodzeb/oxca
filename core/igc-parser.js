/* ═══════════════════════════════════════════════════════════════
   CORE: IGC_PARSER — Parse raw IGC text into structured data
   ═══════════════════════════════════════════════════════════════ */
const IGCParser = (() => {

  function parse(text) {
    const lines = text.split(/\r?\n/);
    const headers = {};
    const fixes = [];
    let dateStr = null;

    for (const line of lines) {
      if (!line || line.length < 2) continue;
      const type = line[0];

      if (type === 'H') parseHeader(line, headers, d => dateStr = d);
      else if (type === 'B') {
        const fix = parseBRecord(line, dateStr);
        if (fix) fixes.push(fix);
      }
    }

    return { headers, fixes, date: dateStr };
  }

  function parseHeader(line, headers, setDate) {
    // HFDTE or HDTE — date
    if (/^H[FO]?DTE/.test(line)) {
      const m = line.match(/(\d{2})(\d{2})(\d{2})/);
      if (m) {
        const yy = parseInt(m[3]);
        const year = yy < 80 ? 2000 + yy : 1900 + yy;
        setDate(`${year}-${m[2]}-${m[1]}`);
        headers.date = `${m[1]}/${m[2]}/${year}`;
      }
    }
    if (line.includes('PLT') && line.includes(':'))
      headers.pilot = line.split(':').slice(1).join(':').trim();
    if (line.includes('GTY') && line.includes(':'))
      headers.gliderType = line.split(':').slice(1).join(':').trim();
    if (line.includes('GID') && line.includes(':'))
      headers.gliderID = line.split(':').slice(1).join(':').trim();
    if (line.includes('CID') && line.includes(':'))
      headers.competitionID = line.split(':').slice(1).join(':').trim();
  }

  function parseBRecord(line, dateStr) {
    if (line.length < 35) return null;
    const valid = line[24];
    if (valid !== 'A' && valid !== 'V') return null;

    const hh = parseInt(line.substring(1, 3));
    const mm = parseInt(line.substring(3, 5));
    const ss = parseInt(line.substring(5, 7));

    const latDeg = parseInt(line.substring(7, 9));
    const latMin = parseInt(line.substring(9, 14)) / 1000;
    const latDir = line[14];
    let lat = latDeg + latMin / 60;
    if (latDir === 'S') lat = -lat;

    const lonDeg = parseInt(line.substring(15, 18));
    const lonMin = parseInt(line.substring(18, 23)) / 1000;
    const lonDir = line[23];
    let lon = lonDeg + lonMin / 60;
    if (lonDir === 'W') lon = -lon;

    const pressAlt = parseInt(line.substring(25, 30));
    const gpsAlt = parseInt(line.substring(30, 35));
    const timestamp = hh * 3600 + mm * 60 + ss;

    return {
      time: timestamp,
      timeStr: `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`,
      lat, lon,
      pressAlt,
      gpsAlt,
      alt: gpsAlt > 0 ? gpsAlt : pressAlt,
      valid: valid === 'A',
    };
  }

  return { parse };
})();
