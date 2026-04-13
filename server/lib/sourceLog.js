class SourceLog {
  constructor(supabase) { this.supabase = supabase; }

  async log({ source, tier = 2, url = '', status = 'success', error_message = null, confidence = 'medium', study_target = null, phase = null, data_point = null }) {
    try {
      const tierInt = typeof tier === 'string' ? (tier === 'primary' ? 1 : tier === 'secondary' ? 2 : 3) : (tier || 2);
      await this.supabase.from('source_log').insert({
        source_name: source,
        data_point: data_point || source,
        source_tier: tierInt,
        access_method: status,
        url,
        confidence,
        date_accessed: new Date().toISOString().split('T')[0],
        study_target,
        phase,
        notes: error_message,
      });
    } catch (err) {
      console.warn(`[sourceLog] Failed to log ${source}: ${err.message}`);
    }
  }
}

module.exports = SourceLog;
