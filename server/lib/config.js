/**
 * Loads all API keys from market_study.config into a plain object.
 * Called once at startup.
 */
async function loadConfig(supabase) {
  const { data, error } = await supabase.from('config').select('key, value');
  if (error) throw new Error(`Failed to load config: ${error.message}`);
  const config = {};
  for (const row of data || []) config[row.key] = row.value;
  console.log(`[config] Loaded ${Object.keys(config).length} keys from market_study.config`);
  return config;
}

module.exports = { loadConfig };
