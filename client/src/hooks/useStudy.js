import { useState, useCallback } from 'react';
import { api } from '../lib/api';

const PHASES = [
  'geocode', 'demographics', 'housing', 'competition', 'analysis',
];

export function useStudy() {
  const [geo, setGeo] = useState(null);
  const [demographics, setDemographics] = useState(null);
  const [housing, setHousing] = useState(null);
  const [competition, setCompetition] = useState(null);
  const [analysis, setAnalysis] = useState(null); // { absorption, pricing, land, proforma, regulatory, scorecard, swot }
  const [phase, setPhase] = useState(null); // current phase name
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async (query) => {
    setRunning(true);
    setError(null);
    setPhase('geocode');
    setProgress(0);

    try {
      // Phase 1: Geocode
      const geoData = await api.post('/api/geocode', { query });
      setGeo(geoData);
      setProgress(15);

      // Phase 2-3: Demographics + Housing + Competition in parallel
      setPhase('demographics');
      const params = `stateFips=${geoData.stateFips}&countyFips=${geoData.countyFips}&subdivFips=${geoData.subdivFips}&cbsa=${geoData.cbsa}&zips=${geoData.zips.join(',')}`;

      const [demoRes, housingRes, compRes] = await Promise.allSettled([
        api.get(`/api/demographics?${params}`),
        api.get(`/api/housing?${params}`),
        api.get(`/api/competition?${params}&city=${encodeURIComponent(geoData.name)}&state=${encodeURIComponent(geoData.stateAbbr || '')}`),
      ]);

      const demoData = demoRes.status === 'fulfilled' ? demoRes.value : null;
      let housingData = housingRes.status === 'fulfilled' ? housingRes.value : null;
      const compData = compRes.status === 'fulfilled' ? compRes.value : null;

      // NEW-2 fix: Merge vacancy/vintage/affordableCeiling from demographics into housing
      // Demographics computes these from ACS, but Dashboard renders them from housing object
      if (housingData && demoData) {
        housingData.vacancyRate = housingData.vacancyRate ?? demoData.vacancyRate ?? null;
        housingData.vintage = housingData.vintage?.length ? housingData.vintage : (demoData.vintage || []);
        housingData.affordableCeiling = housingData.affordableCeiling ?? demoData.affordableCeiling ?? null;
      }

      setDemographics(demoData);
      setPhase('housing');
      setProgress(40);
      setHousing(housingData);
      setProgress(55);
      setCompetition(compData);
      setPhase('competition');
      setProgress(65);

      // Phase 4-9: Claude Analysis
      setPhase('analysis');
      const analysisData = await api.post('/api/analysis', {
        targetArea: geoData.name,
        demographics: demoData,
        housing: housingData,
        competition: compData,
      });
      setAnalysis(analysisData);
      setProgress(100);
      setPhase('complete');

      // Auto-save study
      try {
        await api.post('/api/studies', {
          study: {
            targetArea: geoData.name,
            geo: geoData,
            demographics: demoData,
            housing: housingData,
            competition: compData,
            ...analysisData,
          },
        });
      } catch (_) { /* non-critical */ }

    } catch (err) {
      setError(err.message);
      setPhase('error');
    } finally {
      setRunning(false);
    }
  }, []);

  // Assembled study object for deliverables
  const study = geo ? {
    targetArea: geo.name,
    geo, demographics, housing, competition,
    absorption: analysis?.absorption,
    pricing: analysis?.pricing,
    land: analysis?.land,
    proforma: analysis?.proforma,
    regulatory: analysis?.regulatory,
    scorecard: analysis?.scorecard,
    swot: analysis?.swot,
  } : null;

  return { geo, demographics, housing, competition, analysis, study, phase, progress, error, running, run };
}
