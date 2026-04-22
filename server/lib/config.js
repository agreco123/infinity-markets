/**
 * Loads all API keys from market_study.config into a plain object.
 * Called once at startup.
 *
 * CRITICAL: Validates and normalizes base URLs to prevent doubled-path bugs.
 * Known issue: census_api_base was previously set to
 * "https://api.census.gov/data/2024/acs/acs5" (doubled path) instead of
 * "https://api.census.gov/data". This caused ALL Census API calls to 404.
 */
async function loadConfig(supabase) {
  const { data, error } = await supabase.from('config').select('key, value');
  if (error) throw new Error(`Failed to load config: ${error.message}`);
  const config = {};
  for (const row of data || []) config[row.key] = row.value;
  console.log(`[config] Loaded ${Object.keys(config).length} keys from market_study.config`);

  // ── Normalize base URLs (prevent doubled-path bugs) ──────────────────────
  const fixes = {
    census_api_base: 'https://api.census.gov/data',
    fred_api_base: 'https://api.stlouisfed.org/fred',
    bea_api_base: 'https://apps.bea.gov/api/data',
  };

  for (const [key, correctBase] of Object.entries(fixes)) {
    const val = config[key];
    if (!val) {
      // Not set — use correct default
      config[key] = correctBase;
      console.log(`[config] ${key} not set, using default: ${correctBase}`);
    } else if (val !== correctBase) {
      // Set but wrong — override with correct value
      console.warn(`[config] WARNING: ${key} is "${val}" — overriding to "${correctBase}"`);
      config[key] = correctBase;
    }
  }

  // Strip trailing slashes from all base URLs
  for (const key of Object.keys(config)) {
    if (key.endsWith('_base') && typeof config[key] === 'string') {
      config[key] = config[key].replace(/\/+$/, '');
    }
  }

  return config;
}

module.exports = { loadConfig };
