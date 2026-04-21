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
  const [analysis, setAnalysis] = useState(null);
  const [phase, setPhase] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastQuery, setLastQuery] = useState(null);

  const run = useCallback(async (query) => {
    setRunning(true);
    setError(null);
    setPhase('geocode');
    setProgress(0);
    setLastQuery(query);

    try {
      const geoData = await api.post('/api/geocode', { query });
      setGeo(geoData);
      setProgress(15);

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

      if (housingData && demoData) {
        housingData.vacancyRate = housingData.vacancyRate ?? demoData.vacancyRate ?? null;
        housingData.vintage = housingData.vintage?.length ? housingData.vintage : (demoData.vintage || []);
        housingData.affordableCeiling = housingData.affordableCeiling ?? demoData.affordableCeiling ?? null;
        housingData.ownerOccupied = housingData.ownerOccupied ?? demoData.ownerOccupied ?? null;
        housingData.renterOccupied = housingData.renterOccupied ?? demoData.renterOccupied ?? null;
        if (demoData.totalHousingUnits) housingData.totalUnits = demoData.totalHousingUnits;
      }

      // v2.5: cascade DOM from housing into competition.marketKPIs so Section 6 Days on Market populates
      if (compData && housingData) {
        compData.marketKPIs = compData.marketKPIs || {};
        if (compData.marketKPIs.daysOnMarket == null) {
          compData.marketKPIs.daysOnMarket = housingData.medianDOM ?? housingData.daysOnMarket ?? null;
        }
        compData.daysOnMarket = compData.daysOnMarket ?? compData.marketKPIs.daysOnMarket ?? housingData.medianDOM ?? null;
      }

      setDemographics(demoData);
      setPhase('housing');
      setProgress(40);
      setHousing(housingData);
      setProgress(55);
      setCompetition(compData);
      setPhase('competition');
      setProgress(65);

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

  return { geo, demographics, housing, competition, analysis, study, phase, progress, error, running, run, lastQuery };
}
