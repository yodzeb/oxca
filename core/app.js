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

    buildTabs();
  }

  // ── Theme ──
  function initTheme() {
    const saved = localStorage.getItem('xc-theme');
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
    updateThemeButton();

    document.getElementById('btn-theme').addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('xc-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('xc-theme', 'light');
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

  return { init };
})();

App.init();
