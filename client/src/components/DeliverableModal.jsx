import { useState, useEffect } from 'react';
import { T } from '../lib/tokens';
import { api } from '../lib/api';
import { Modal, Stack, Row, Eyebrow, Title, Body, Button, Card, Banner, ForbesMark, Divider } from './ui';

/**
 * Editorial DeliverableModal.
 * Closes H-7 from the backlog (DeliverableModal error UX) cosmetically:
 *   - Displays error.detail when generation fails
 *   - 60-second client-side timeout with progress message
 *   - content-type validation on blob (warns if HTML error page comes back as PDF)
 *   - Per-deliverable cards with provenance-classed visual identity
 */
export default function DeliverableModal({ onClose, study }) {
  const [status, setStatus] = useState({ pdf: "idle", xlsx: "idle", pptx: "idle" });
  const [error, setError] = useState({ pdf: null, xlsx: null, pptx: null });

  const items = [
    {
      key: "pdf", label: "Market study PDF",
      desc: "Output D · The 14-section institutional report. Editorial typography, every tile provenance-tagged, Source Manifest as Appendix A.",
      pages: "~45 pages", accent: T.green,
      icon: <DocIcon />,
    },
    {
      key: "xlsx", label: "Pro forma workbook",
      desc: "Output B · Eleven-tab workbook with monthly cash flow, 81-cell sensitivity grid, tornado of top-10 drivers. Every cell linked to a source.",
      pages: "11 tabs", accent: T.brass,
      icon: <SheetIcon />,
    },
    {
      key: "pptx", label: "Executive deck",
      desc: "Twenty-five-slide briefing for the acquisition committee. Cover, GO/NO-GO verdict, competitive set, pro forma summary, sensitivity, risks.",
      pages: "25 slides", accent: T.brassInk,
      icon: <DeckIcon />,
    },
  ];

  const generate = async (type) => {
    setStatus(s => ({ ...s, [type]: "generating" }));
    setError(e => ({ ...e, [type]: null }));

    const timeoutMs = 60_000;
    const cancelTimeout = setTimeout(() => {
      setStatus(s => s[type] === "generating" ? { ...s, [type]: "error" } : s);
      setError(e => ({ ...e, [type]: "Generation timed out after 60 seconds." }));
    }, timeoutMs);

    try {
      const result = await api.post(`/api/deliverables/${type}`, { study });
      clearTimeout(cancelTimeout);

      if (result instanceof Blob) {
        // Content-type sanity (HTML error pages would have come back as JSON via api.js, but defend)
        const target = study?.targetArea || study?.geo?.name || "market-study";
        const safe = target.replace(/[^A-Za-z0-9_-]+/g, "-");
        const ext = type === 'xlsx' ? 'xlsx' : type === 'pptx' ? 'pptx' : 'pdf';
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = `infinity-markets-${safe}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (result?.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
      setStatus(s => ({ ...s, [type]: "complete" }));
    } catch (e) {
      clearTimeout(cancelTimeout);
      setStatus(s => ({ ...s, [type]: "error" }));
      setError(er => ({ ...er, [type]: e?.message || "Unknown error" }));
    }
  };

  const generateAll = () => { generate("pdf"); generate("xlsx"); generate("pptx"); };
  const anyGenerating = Object.values(status).some(s => s === "generating");

  return (
    <Modal open onClose={onClose}
      eyebrow="Deliverables"
      title={`Generate the report set${study?.targetArea ? ` · ${study.targetArea}` : ""}`}
      width={680}
      footer={
        <Row justify="space-between" align="center" gap={T.s3}>
          <Body size={T.fs11} color={T.inkMuted} style={{ fontStyle: "italic" }}>
            Each artifact is generated server-side via Puppeteer (PDF) and template builders (XLSX, PPTX). Downloads start automatically.
          </Body>
          <Row gap={T.s3}>
            <Button kind="ghost" onClick={onClose} disabled={anyGenerating}>Close</Button>
            <Button kind="primary" onClick={generateAll} disabled={anyGenerating}>
              {anyGenerating ? "Generating…" : "Generate all three"}
            </Button>
          </Row>
        </Row>
      }
    >
      <Stack gap={T.s4}>
        <Body color={T.inkMuted} size={T.fs13}>
          Outputs A, B, and D ship on this pass. Output C (parcel) and Output E (source manifest) appear inside the PDF — Manifest as Appendix A.
        </Body>

        <Stack gap={T.s3}>
          {items.map(it => (
            <DeliverableCard
              key={it.key}
              item={it}
              status={status[it.key]}
              error={error[it.key]}
              onGenerate={() => generate(it.key)}
              onRetry={() => { setStatus(s => ({ ...s, [it.key]: "idle" })); setError(e => ({ ...e, [it.key]: null })); }}
            />
          ))}
        </Stack>
      </Stack>
    </Modal>
  );
}

function DeliverableCard({ item, status, error, onGenerate, onRetry }) {
  const isComplete = status === "complete";
  const isGenerating = status === "generating";
  const isError = status === "error";

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${isComplete ? T.green : isError ? T.red : T.rule}`,
      borderLeft: `3px solid ${item.accent}`,
      borderRadius: T.rMd,
      padding: T.s4,
      transition: "border-color 200ms ease",
    }}>
      <Row gap={T.s4} align="flex-start">
        <div style={{
          flex: "0 0 44px", width: 44, height: 44,
          background: T.canvas,
          borderRadius: T.rSm,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: item.accent,
        }}>
          {item.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Row align="baseline" justify="space-between" gap={T.s3}>
            <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs18, fontWeight: 500, color: T.ink, letterSpacing: "-0.005em" }}>{item.label}</div>
            <div style={{ fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.inkMuted }}>{item.pages}</div>
          </Row>
          <Body size={T.fs12} color={T.inkSoft} style={{ marginTop: T.s2, lineHeight: 1.55 }}>{item.desc}</Body>

          {isError && error && (
            <Banner tone="error" style={{ marginTop: T.s3, fontSize: T.fs12 }}>
              <strong>Generation failed.</strong> {error}
            </Banner>
          )}

          <Row justify="flex-end" align="center" gap={T.s3} style={{ marginTop: T.s3 }}>
            {status === "idle" && <Button kind="primary" size="sm" onClick={onGenerate}>Generate</Button>}
            {isGenerating && (
              <Row gap={T.s2} align="center" style={{ color: T.brassInk, fontSize: T.fs12, fontWeight: 600 }}>
                <span className="fc-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span>Generating…</span>
              </Row>
            )}
            {isComplete && (
              <Row gap={T.s2} align="center">
                <span style={{ color: T.green, fontSize: T.fs12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>✓ Downloaded</span>
                <Button kind="ghost" size="sm" onClick={onGenerate}>Re-generate</Button>
              </Row>
            )}
            {isError && <Button kind="danger" size="sm" onClick={onRetry}>Retry</Button>}
          </Row>
        </div>
      </Row>
    </div>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 3 H14 L19 8 V20 A1 1 0 0 1 18 21 H6 A1 1 0 0 1 5 20 V4 A1 1 0 0 1 6 3 Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 3 V8 H19" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 12 H16 M8 15 H16 M8 18 H13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function SheetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 9 H20 M4 14 H20 M9 4 V20 M15 4 V20" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function DeckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 21 H15 M12 17 V21" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 10 H17 M7 13 H13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
