/**
 * Infinity Markets — SourceLog
 *
 * v4.1 (V41-2 / H-1): adds FETCH_STATUS enum + makeFetchStatus() helper
 *   so per-source outcomes can be surfaced on study envelopes, not just
 *   persisted to the source_log table. The legacy log() method is
 *   preserved byte-exactly so existing callers keep working.
 */

const FETCH_STATUS = Object.freeze({
  FETCHED: 'fetched',   // allSettled: fulfilled, value truthy
  NULL:    'null',      // allSettled: fulfilled but value null/empty (API reachable, nothing returned)
  FAILED:  'failed',    // allSettled: rejected (network error, 5xx, timeout, parse failure)
  CACHED:  'cached',    // served from Supabase cache (no upstream call)
  STALE:   'stale',     // cached but past freshness window
});

/**
 * Convert a Promise.allSettled entry into a FETCH_STATUS enum value.
 * @param {{status: 'fulfilled'|'rejected', value?: any, reason?: any}} settled
 * @param {{cached?: boolean, stale?: boolean}} [opts]
 * @returns {string} one of FETCH_STATUS values
 */
function makeFetchStatus(settled, opts = {}) {
  if (opts && opts.stale)  return FETCH_STATUS.STALE;
  if (opts && opts.cached) return FETCH_STATUS.CACHED;
  if (!settled) return FETCH_STATUS.NULL;
  if (settled.status === 'rejected') return FETCH_STATUS.FAILED;
  const v = settled.value;
  if (v == null) return FETCH_STATUS.NULL;
  if (Array.isArray(v) && v.length === 0) return FETCH_STATUS.NULL;
  if (typeof v === 'object' && v !== null && Object.keys(v).length === 0) return FETCH_STATUS.NULL;
  return FETCH_STATUS.FETCHED;
}

class SourceLog {
  constructor(supabase) { this.supabase = supabase; }

  async log({ source, tier = 2, url = '', status = 'success', error_message = null, confidence = 'medium', study_target = null, phase = null, data_point = null }) {
    try {
      const tierInt = typeof tier === 'string' ? (tier === 'primary' ? 1 : tier === 'secondary' ? 2 : 3) : (tier || 2);
      const { error } = await this.supabase.from('source_log').insert({
        source_name: source,
        data_point: data_point || source,
        source_tier: tierInt,
        access_method: status,
        url: url || '',
        confidence,
        date_accessed: new Date().toISOString().split('T')[0],
        study_target: study_target || 'unknown',
        phase: phase || null,
        notes: error_message,
      });
      if (error) console.warn(`[sourceLog] Supabase error for ${source}: ${error.message}`);
    } catch (err) {
      console.warn(`[sourceLog] Failed to log ${source}: ${err.message}`);
    }
  }
}

module.exports = SourceLog;
module.exports.FETCH_STATUS = FETCH_STATUS;
module.exports.makeFetchStatus = makeFetchStatus;
