/* ═══════════════════════════════════════════════════════════════
   CORE: MODULE_REGISTRY — Plugin system + shared data bus

   Modules can publish stats via publish(key, data) and read
   other modules' stats via get(key). This enables cross-module
   data sharing (e.g., wind module publishes avg wind, MacCready
   module reads it).

   Convention: key = moduleId (e.g., 'wind', 'vario', 'record')
   ═══════════════════════════════════════════════════════════════ */
const ModuleRegistry = (() => {
  const modules = [];
  const sharedData = {};

  /**
   * Register an analysis module.
   * @param {Object} mod - Must implement:
   *   id:    string
   *   name:  string
   *   init(containerEl)
   *   update(enrichedFixes, stats, headers)
   *   publish?() — optional, called after update() to publish shared data
   *   onShow?()  — optional, called when tab becomes visible
   *   destroy?() — optional, cleanup
   */
  function register(mod) {
    modules.push(mod);
  }

  function getAll() { return modules; }

  /** Publish shared data under a key (typically the module id) */
  function publish(key, data) {
    sharedData[key] = data;
  }

  /** Read shared data published by another module */
  function get(key) {
    return sharedData[key] || null;
  }

  /** Clear all shared data (on new file load) */
  function clearShared() {
    for (const k of Object.keys(sharedData)) delete sharedData[k];
  }

  return { register, getAll, publish, get, clearShared };
})();
