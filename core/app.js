/* ═══════════════════════════════════════════════════════════════
   CORE: APP — Main application controller
   ═══════════════════════════════════════════════════════════════ */
const App = (() => {
  const uploadScreen = document.getElementById('upload-screen');
  const analysisView = document.getElementById('analysis-view');
  const tabBar = document.getElementById('tab-bar');
  const tabPanels = document.getElementById('tab-panels');
  const flightInfo = document.getElementById('flight-info');
  const loading = document.getElementById('loading');
  const fileInput = document.getElementById('file-input');

  let activeTab = null;
  let dataReady = false;

  function init() {
    // Theme
    initTheme();

    document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

    const zone = document.getElementById('upload-zone');
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('settings-close').addEventListener('click', closeSettings);
    document.getElementById('settings-save').addEventListener('click', saveSettings);
    document.getElementById('settings-modal').addEventListener('click', e => { if (e.target === document.getElementById('settings-modal')) closeSettings(); });

    document.getElementById('btn-about').addEventListener('click', openAbout);
    document.getElementById('about-close').addEventListener('click', closeAbout);
    document.getElementById('about-modal').addEventListener('click', e => { if (e.target === document.getElementById('about-modal')) closeAbout(); });

    buildTabs();
  }

  // ── Theme ──
  function initTheme() {
    const saved = localStorage.getItem('oxca-theme');
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
    updateThemeButton();

    document.getElementById('btn-theme').addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('oxca-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('oxca-theme', 'light');
      }
      updateThemeButton();
      // Re-render if data loaded (charts need fresh theme colors)
      if (dataReady && FlightStore.getRaw()) showAnalysis();
    });
  }

  function updateThemeButton() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    document.getElementById('btn-theme').textContent = isLight ? '🌙' : '☀';
  }

  function buildTabs() {
    const modules = ModuleRegistry.getAll();
    tabBar.innerHTML = ''; tabPanels.innerHTML = '';
    modules.forEach((mod, i) => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
      btn.textContent = mod.name; btn.dataset.tab = mod.id;
      btn.addEventListener('click', () => switchTab(mod.id));
      tabBar.appendChild(btn);
      const panel = document.createElement('div');
      panel.className = 'tab-panel' + (i === 0 ? ' active' : '');
      panel.id = `panel-${mod.id}`;
      tabPanels.appendChild(panel);
      mod.init(panel);
    });
    activeTab = modules[0]?.id;
  }

  function switchTab(id) {
    if (activeTab === id) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${id}`));
    activeTab = id;
    if (dataReady) {
      const mod = ModuleRegistry.getAll().find(m => m.id === id);
      if (mod && typeof mod.onShow === 'function') requestAnimationFrame(() => mod.onShow());
    }
  }

  async function loadFile(file) {
    loading.classList.remove('hidden');
    try { const text = await file.text(); FlightStore.load(text); dataReady = true; showAnalysis(); }
    catch (e) { alert('Error parsing IGC file: ' + e.message); }
    finally { loading.classList.add('hidden'); }
  }

  function showAnalysis() {
    uploadScreen.style.display = 'none';
    analysisView.classList.add('active');
    const h = FlightStore.getHeaders(), s = FlightStore.getStats();
    const infoParts = [];
    if (h.date) infoParts.push(infoItem('Date', h.date));
    if (h.pilot) infoParts.push(infoItem('Pilot', h.pilot));
    if (h.gliderType) infoParts.push(infoItem('Glider', h.gliderType));
    if (h.gliderID) infoParts.push(infoItem('ID', h.gliderID));
    if (s) infoParts.push(infoItem('Duration', formatTime(s.duration)));
    if (s) infoParts.push(infoItem('Distance', s.totalDist.toFixed(1) + ' km'));
    flightInfo.innerHTML = infoParts.join('');

    const fixes = FlightStore.getEnriched(), stats = FlightStore.getStats(), headers = FlightStore.getHeaders();
    ModuleRegistry.clearShared();
    for (const mod of ModuleRegistry.getAll()) mod.update(fixes, stats, headers);
    for (const mod of ModuleRegistry.getAll()) { if (typeof mod.publish === 'function') mod.publish(); }
    for (const mod of ModuleRegistry.getAll()) { if (typeof mod.lateUpdate === 'function') mod.lateUpdate(fixes, stats, headers); }
    const activeMod = ModuleRegistry.getAll().find(m => m.id === activeTab);
    if (activeMod && typeof activeMod.onShow === 'function') requestAnimationFrame(() => activeMod.onShow());
  }

  function infoItem(label, value) { return `<div class="flight-info-item"><span class="flight-info-label">${label}:</span><span class="flight-info-value">${value}</span></div>`; }

  function openSettings() {
    const form = document.getElementById('settings-form');
    const all = Config.getAll(), meta = Config.META;
    form.innerHTML = Object.entries(meta).map(([key, m]) => `<div class="setting-group"><label>${m.label}</label><input type="number" step="any" data-key="${key}" value="${all[key]}"></div>`).join('');
    document.getElementById('settings-modal').style.display = 'flex';
  }
  function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
  function saveSettings() {
    const inputs = document.querySelectorAll('#settings-form input');
    const obj = {}; inputs.forEach(inp => { obj[inp.dataset.key] = parseFloat(inp.value); });
    Config.setAll(obj); closeSettings();
    if (FlightStore.getRaw()) { FlightStore.analyze(); dataReady = true; showAnalysis(); }
  }

  function openAbout() {
    const modal = document.getElementById('about-modal');
    const content = document.getElementById('about-content');
    modal.style.display = 'flex';
    // Try to fetch README.md, fall back to inline content
    fetch('./README.md').then(r => r.ok ? r.text() : null).then(md => {
      if (md) {
        content.innerHTML = simpleMarkdown(md);
      } else {
        content.innerHTML = aboutFallback();
      }
    }).catch(() => {
      content.innerHTML = aboutFallback();
    });
  }

  function closeAbout() { document.getElementById('about-modal').style.display = 'none'; }

  /** Minimal markdown → HTML (no deps) */
  function simpleMarkdown(md) {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h4 style="color:var(--text-primary);margin:18px 0 6px;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="color:var(--text-primary);margin:22px 0 8px;">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2 style="color:var(--text-primary);margin:24px 0 10px;">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--bg-input);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:0.85em;">$1</code>')
      .replace(/^```(\w*)\n([\s\S]*?)```$/gm, '<pre style="background:var(--bg-input);padding:12px;border-radius:6px;overflow-x:auto;font-family:var(--font-mono);font-size:0.82em;line-height:1.5;margin:10px 0;"><code>$2</code></pre>')
      .replace(/^\| (.+) \|$/gm, (_, row) => {
        const cells = row.split('|').map(c => c.trim());
        return '<tr>' + cells.map(c => `<td style="padding:4px 10px;border-bottom:1px solid var(--border);">${c}</td>`).join('') + '</tr>';
      })
      .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0;">')
      .replace(/^\> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent);padding-left:12px;margin:12px 0;color:var(--text-muted);font-style:italic;">$1</blockquote>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent);">$1</a>')
      .replace(/\n\n/g, '</p><p style="margin:8px 0;">')
      .replace(/\n/g, '<br>');
  }

  function aboutFallback() {
    return `
      <h2 style="color:var(--text-primary);">Open XC Analytics (OXCA)</h2>
      <p>A fully client-side paragliding cross-country flight analyzer.</p>
      <p>Drop an IGC file to analyze your flight with 6 modules: Overview, Vario, Wind, Phases, Record distances, and MacCready speed-to-fly theory.</p>
      <p style="margin-top:16px;color:var(--text-muted);">No server, no account, no telemetry. Your data stays in your browser.</p>
      <p style="margin-top:12px;"><a href="README.md" target="_blank" style="color:var(--accent);">Full documentation (README.md)</a>
      · <a href="README-FR.md" target="_blank" style="color:var(--accent);">Version française</a></p>
    `;
  }

  return { init };
})();

App.init();
