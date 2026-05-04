import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, fmtDate } from '../lib/tokens';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import {
  Page, Container, Stack, Row, Eyebrow, Display, Title, Body, Button,
  Card, Divider, EmptyState, Banner, Skeleton,
} from '../components/ui';
import Header from '../components/Header';

/**
 * Saved studies list. Hits GET /api/studies (existing endpoint per useStudy.js
 * write path). Gracefully degrades:
 *   - Not authed → CTA to sign in
 *   - 404 / not implemented → editorial empty state with no error
 *   - Error → visible banner so the user knows
 */
export default function Studies() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth() || {};
  const [studies, setStudies] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api.get('/api/studies')
      .then(r => { if (!alive) return; setStudies(r?.studies || r || []); })
      .catch(e => {
        if (!alive) return;
        // 404 / not-implemented → silent empty
        if (/404|not.found/i.test(e.message)) { setStudies([]); }
        else { setError(e.message); }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user, authLoading]);

  return (
    <Page>
      <Header onReset={() => navigate('/')} />
      <Container max="1180px" padX={T.s8} padY={T.s7}>
        <Stack gap={T.s6}>
          <Stack gap={T.s2}>
            <Eyebrow>Library</Eyebrow>
            <Display size={40} style={{ letterSpacing: "-0.02em" }}>Saved studies</Display>
            <Body color={T.inkMuted}>Every study you have run from this account, in reverse chronological order.</Body>
          </Stack>

          <Divider kind="strong" />

          {!authLoading && !user && (
            <Card padding={T.s7} style={{ textAlign: "center" }}>
              <Eyebrow color={T.brassInk} style={{ marginBottom: T.s3 }}>Sign in required</Eyebrow>
              <Title style={{ fontSize: T.fs22 }}>Saved studies are gated to your account.</Title>
              <Body color={T.inkMuted} style={{ marginTop: T.s2, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
                Sign in with your Forbes Capretto credentials to see every study you've run, regenerate deliverables, and re-export the source manifest.
              </Body>
              <Row justify="center" gap={T.s3} style={{ marginTop: T.s5 }}>
                <Button kind="primary" onClick={() => navigate('/login')}>Sign in</Button>
                <Button kind="ghost" onClick={() => navigate('/')}>Run a study without signing in</Button>
              </Row>
            </Card>
          )}

          {user && loading && (
            <Stack gap={T.s2}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} padding={T.s4}>
                  <Stack gap={T.s2}><Skeleton height={20} width="40%" /><Skeleton height={14} width="60%" /></Stack>
                </Card>
              ))}
            </Stack>
          )}

          {user && error && <Banner tone="error">{error}</Banner>}

          {user && !loading && Array.isArray(studies) && studies.length === 0 && (
            <EmptyState
              title="No saved studies yet"
              body="Studies you run while signed in are saved here automatically. Run your first one to populate the library."
              action={<Button kind="primary" onClick={() => navigate('/')}>Run your first study</Button>}
            />
          )}

          {user && !loading && Array.isArray(studies) && studies.length > 0 && (
            <Stack gap={T.s2}>
              {studies.map((s, i) => (
                <Card key={s.id || i} padding={T.s5}>
                  <Row justify="space-between" align="center" wrap="wrap" gap={T.s4}>
                    <Stack gap={T.s2}>
                      <Eyebrow color={T.brassInk}>{fmtDate(s.created_at) || "—"}</Eyebrow>
                      <Title style={{ fontSize: T.fs20 }}>{s.target_area || s.targetArea || s.name || "Untitled study"}</Title>
                      <Body size={T.fs12} color={T.inkMuted} style={{ fontFamily: T.fontMono }}>
                        {s.fips || s.geo?.fips || ""}{s.cbsa ? ` · CBSA ${s.cbsa}` : ""}
                      </Body>
                    </Stack>
                    <Button kind="ghost" onClick={() => navigate(`/dashboard?studyId=${encodeURIComponent(s.id || "")}`)}>Open ↗</Button>
                  </Row>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Container>
    </Page>
  );
}
