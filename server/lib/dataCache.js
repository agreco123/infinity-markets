/**
 * Write-through data cache for Supabase.
 * Each study's API results are persisted so:
 *  1. Subsequent studies in the same area skip external API calls
 *  2. Historical data accumulates for trend analysis
 *  3. AI analysis improves with richer context
 */

class DataCache {
  constructor(supabase) { this.sb = supabase; }

  // ── Demographics: Census ACS variables ──────────────────────────
  async cacheDemographics(stateFips, countyFips, vintage, variables) {
    if (!variables || typeof variables !== 'object') return;
    const fips = `${stateFips}${countyFips}`;
    const rows = Object.entries(variables)
      .filter(([_, v]) => v !== null && v !== undefined)
      .map(([code, value]) => ({
        geography_fips: fips,
        geography_level: 'county',
        vintage: vintage || new Date().getFullYear() - 1,
        variable_code: code,
        value: typeof value === 'number' ? value : parseFloat(value) || null,
        dataset: 'acs5',
      }));
    if (rows.length === 0) return;
    try {
      await this.sb.from('census_demographics').upsert(rows, {
        onConflict: 'geography_fips,vintage,variable_code',
      });
    } catch (_) {}
  }

  // ── FRED timeseries observations ────────────────────────────────
  async cacheFredSeries(seriesId, observations) {
    if (!seriesId || !observations?.length) return;
    const rows = observations.map(o => ({
      series_id: seriesId,
      observation_date: o.date,
      value: parseFloat(o.value) || null,
    }));
    try {
      await this.sb.from('fred_timeseries').upsert(rows, {
        onConflict: 'series_id,observation_date',
      });
    } catch (_) {}
  }

  // ── Building permits ────────────────────────────────────────────
  async cachePermits(stateFips, countyFips, yearData) {
    if (!yearData?.length) return;
    const fips = `${stateFips}${countyFips}`;
    const rows = yearData.map(d => ({
      geography_fips: fips,
      geography_name: d.name || `County ${fips}`,
      geography_level: 'county',
      year: d.year,
      month: null, // Annual data — no month
      sf_units: d.sf || null,
      mf_5plus_units: d.mf || null,
      total_units: (d.sf || 0) + (d.mf || 0),
    }));
    try {
      await this.sb.from('building_permits').upsert(rows, {
        onConflict: 'geography_fips,year,month',
      });
    } catch (_) {}
  }

  // ── Competition: communities + builder profiles ─────────────────
  async cacheCompetition(targetArea, communities, builders) {
    if (communities?.length) {
      const rows = communities.map(c => ({
        study_target: targetArea,
        community_name: c.name || c.communityName || 'Unknown',
        builder_name: c.builder || c.builderName || 'Unknown',
        address: c.address || null,
        municipality: c.city || null,
        state: c.state || null,
        zip_code: c.zip || null,
        product_type: c.productType || null,
        total_lots: c.lotsTotal || c.totalLots || null,
        lots_remaining: c.lotsRemain || c.lotsRemaining || null,
        base_price_low: c.priceLow || null,
        base_price_high: c.priceHigh || null,
        data_source: c.source || 'api',
        data_source_tier: c.sourceTier || 2,
      }));
      try {
        // Delete old entries for this target, then insert fresh
        await this.sb.from('communities').delete().eq('study_target', targetArea);
        await this.sb.from('communities').insert(rows);
      } catch (_) {}
    }

    if (builders?.length) {
      const rows = builders.map(b => ({
        study_target: targetArea,
        builder_name: b.name || b.builderName || 'Unknown',
        builder_type: b.type || null,
        parent_company: b.parent || null,
        ticker_symbol: b.ticker || null,
        active_communities_pma: b.activeCommunities || null,
        product_positioning: b.positioning || null,
      }));
      try {
        await this.sb.from('builder_profiles').delete().eq('study_target', targetArea);
        await this.sb.from('builder_profiles').insert(rows);
      } catch (_) {}
    }
  }

  // ── Analysis: scorecard + proforma ──────────────────────────────
  async cacheAnalysis(targetArea, analysis) {
    if (!analysis) return;

    // Scorecard — handle both flat array and { metrics: [...] } shapes
    const scArray = analysis.scorecard?.metrics || (Array.isArray(analysis.scorecard) ? analysis.scorecard : []);
    if (scArray.length) {
      const rows = scArray.map(m => ({
        study_target: targetArea,
        metric: m.metric || m.name,
        score: Math.min(10, Math.max(1, parseInt(m.score) || 5)),
        weight_pct: parseFloat(m.weight) || null,
        weighted_score: parseFloat(m.weightedScore) || ((parseFloat(m.score) || 0) * (parseFloat(m.weight) || 0) / 100) || null,
        rationale: m.rationale || null,
      }));
      try {
        await this.sb.from('scorecard').delete().eq('study_target', targetArea);
        await this.sb.from('scorecard').insert(rows);
      } catch (_) {}
    }

    // Proforma scenarios
    if (analysis.proforma?.scenarios?.length) {
      const rows = analysis.proforma.scenarios.map(s => ({
        study_target: targetArea,
        product_type: s.productType || 'SFD',
        scenario_name: s.name || 'Base',
        avg_selling_price: s.asp || null,
        lot_cost: s.lotCost || null,
        monthly_absorption: s.absorption || null,
        gross_margin_pct: s.margin || null,
      }));
      try {
        await this.sb.from('proforma_scenarios').delete().eq('study_target', targetArea);
        await this.sb.from('proforma_scenarios').insert(rows);
      } catch (_) {}
    }
  }

  // ── Cache-first read: check Supabase before hitting external API ─
  async getCachedDemographics(stateFips, countyFips, maxAgeDays = 90) {
    try {
      const fips = `${stateFips}${countyFips}`;
      const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
      const { data } = await this.sb
        .from('census_demographics')
        .select('variable_code, value')
        .eq('geography_fips', fips)
        .gte('ingested_at', cutoff);
      if (data?.length > 10) return data; // Only use cache if we have meaningful data
    } catch (_) {}
    return null;
  }

  async getCachedCompetition(targetArea, maxAgeDays = 30) {
    try {
      const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
      const { data } = await this.sb
        .from('communities')
        .select('*')
        .eq('study_target', targetArea)
        .gte('ingested_at', cutoff);
      if (data?.length > 0) return data;
    } catch (_) {}
    return null;
  }
}

module.exports = DataCache;
