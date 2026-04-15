/**
 * Infinity Markets v1.0 — Auth Route (Task 10)
 *
 * POST /api/auth/signup   → { email, password }
 * POST /api/auth/login    → { email, password }
 * POST /api/auth/logout
 * GET  /api/auth/me        → returns current user
 *
 * Middleware: verifyToken — protects all /api/* routes
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Auth uses the public (anon) Supabase client, not the service-role one
function getAuthClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const supabase = getAuthClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ user: data.user, session: data.session });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const supabase = getAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  return res.json({ user: data.user, session: data.session });
});

router.post('/logout', async (req, res) => {
  const supabase = getAuthClient();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    // Set session for this specific token before signing out
    await supabase.auth.setSession({ access_token: token, refresh_token: '' });
  }
  await supabase.auth.signOut();
  return res.json({ success: true });
});

router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const supabase = getAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  return res.json({ user });
});

// ── Middleware: JWT verification ──────────────────────────────────────────────

async function verifyToken(req, res, next) {
  // Skip auth for auth routes themselves
  if (req.path.startsWith('/api/auth')) return next();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const supabase = getAuthClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = { router, verifyToken };
