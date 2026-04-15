/**
 * Infinity Markets v1.0 — Express Server Entry
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const supabase = require('./lib/supabase');
const { loadConfig } = require('./lib/config');
const Cache = require('./lib/cache');
const SourceLog = require('./lib/sourceLog');
const DataCache = require('./lib/dataCache');

const geocodeRoute = require('./routes/geocode');
const demographicsRoute = require('./routes/demographics');
const housingRoute = require('./routes/housing');
const competitionRoute = require('./routes/competition');
const analysisRoute = require('./routes/analysis');
const deliverablesRoute = require('./routes/deliverables');
const { router: authRouter, verifyToken } = require('./routes/auth');
const healthRoute = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// -- Startup: load config, attach shared deps --

async function start() {
    try {
          const config = await loadConfig(supabase);
          const cache = new Cache();
          const sourceLog = new SourceLog(supabase);
          const dataCache = new DataCache(supabase);

      // Attach to app.locals for route access
      app.locals.config = config;
          app.locals.supabase = supabase;
          app.locals.cache = cache;
          app.locals.sourceLog = sourceLog;
          app.locals.dataCache = dataCache;

      // -- Auth middleware (protect only save/deliverable routes) --
      app.use('/api', (req, res, next) => {
              // Public routes -- no auth required
                    const publicPaths = ['/auth', '/geocode', '/demographics', '/housing',
                                                 '/competition', '/analysis', '/health', '/deliverables'];
              if (publicPaths.some(p => req.path.startsWith(p))) return next();
              // In development, allow unauthenticated access if no SUPABASE_ANON_KEY
                    if (!process.env.SUPABASE_ANON_KEY && process.env.NODE_ENV !== 'production') return next();
              return verifyToken(req, res, next);
      });

      // -- Routes --
      app.use('/api/auth', authRouter);
          app.use('/api/geocode', geocodeRoute);
          app.use('/api/demographics', demographicsRoute);
          app.use('/api/housing', housingRoute);
          app.use('/api/competition', competitionRoute);
          app.use('/api/analysis', analysisRoute);
          app.use('/api/deliverables', deliverablesRoute);
          app.use('/api/health', healthRoute);

      // -- Studies CRUD --
      app.post('/api/studies', async (req, res) => {
              const { study } = req.body;
              const userId = req.user?.id;
              const { data, error } = await supabase.from('studies').insert({
                        user_id: userId,
                        target_area: study.targetArea,
                        data: study,
                        created_at: new Date().toISOString(),
              }).select().single();
              if (error) return res.status(500).json({ error: error.message });
              return res.json(data);
      });

      app.get('/api/studies', async (req, res) => {
              const userId = req.user?.id;
              const { data, error } = await supabase
                .from('studies')
                .select('id, target_area, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
              if (error) return res.status(500).json({ error: error.message });
              return res.json(data || []);
      });

      app.get('/api/studies/:id', async (req, res) => {
              const { data, error } = await supabase
                .from('studies')
                .select('*')
                .eq('id', req.params.id)
                .single();
              if (error) return res.status(404).json({ error: 'Study not found' });
              return res.json(data);
      });

      // -- Serve static client in production --
      if (process.env.NODE_ENV === 'production') {
              app.use(express.static(path.join(__dirname, '../client/dist')));
              app.get('*', (req, res) => {
                        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
              });
      }

      app.listen(PORT, () => {
              console.log(`[server] Infinity Markets v1.4.2 listening on :${PORT}`);
      });
    } catch (err) {
          console.error('[server] Failed to start:', err);
          process.exit(1);
    }
}

start();
