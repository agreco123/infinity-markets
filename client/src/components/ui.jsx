import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { T, BRAND, fmt, fmtPct, fmtDollar, provFor } from '../lib/tokens';

/**
 * Forbes Capretto / Infinity Markets — Editorial UI Primitives
 *
 * Single-file design system (kept in one module for atomic LAW #0 writes and
 * easy verification). Every component is purely presentational; no fetches,
 * no app state. Prefer composition: import { Card, KPI, Chip } from ui;
 *
 * Contract: all components accept `style` for ad-hoc overrides; pure className
 * props are intentionally avoided because the legacy app does not use a CSS
 * framework — every style ships inline through `T`.
 */

/* ── Brand atoms ─────────────────────────────────────────────────────────── */

export function ForbesLogo({ variant = "primary", height = 28, style = {} }) {
  // primary = green text + brass mark (light backgrounds)
  // reverse = white text + brass mark (dark sidebar/cover)
  const src = variant === "reverse"
    ? "/brand/forbes-capretto-logo-reverse.svg"
    : "/brand/forbes-capretto-logo.svg";
  return (
    <img
      src={src}
      alt="Forbes Capretto Homes"
      style={{ height, width: "auto", display: "block", ...style }}
    />
  );
}

export function ForbesMark({ size = 28, color = T.brass, style = {} }) {
  // Distilled brass mark — used as standalone in tight slots (sidebar collapsed,
  // favicons, page-corner watermark). Vector-pure, no SVG dependency.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", ...style }} aria-hidden>
      <g fill={color}>
        <path d="M24 4 L42 14 V34 L24 44 L6 34 V14 Z" opacity="0.12"/>
        <path d="M24 8 L38 16 V32 L24 40 L10 32 V16 Z" fill="none" stroke={color} strokeWidth="1.4"/>
        <path d="M16 22 H32 M16 26 H28 M16 30 H24" stroke={color} strokeWidth="1.4" strokeLinecap="square"/>
        <circle cx="24" cy="14" r="1.6"/>
      </g>
    </svg>
  );
}

/* ── Layout primitives ───────────────────────────────────────────────────── */

export function Page({ children, style = {} }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: T.canvas,
      color: T.ink,
      fontFamily: T.fontBody,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Container({ children, max = T.pageMaxW, padX = T.s8, padY = T.s8, style = {} }) {
  return (
    <div style={{
      maxWidth: max,
      margin: "0 auto",
      padding: `${padY} ${padX}`,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Stack({ children, gap = T.s5, style = {} }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;
}

export function Row({ children, gap = T.s4, align = "center", justify = "flex-start", wrap = "nowrap", style = {} }) {
  return (
    <div style={{
      display: "flex",
      gap,
      alignItems: align,
      justifyContent: justify,
      flexWrap: wrap,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Grid({ children, cols = 3, min = "240px", gap = T.s5, style = {} }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: typeof cols === "number"
        ? `repeat(auto-fit, minmax(${min}, 1fr))`
        : cols,
      gap,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Divider({ kind = "hair", style = {} }) {
  const map = {
    hair:    { borderTop: `1px solid ${T.rule}` },
    soft:    { borderTop: `1px solid ${T.ruleStrong}` },
    strong:  { borderTop: `2px solid ${T.green}` },
    brass:   { borderTop: `2px solid ${T.brass}` },
    dotted:  { borderTop: `1px dotted ${T.ruleStrong}` },
  };
  return <hr style={{ border: 0, width: "100%", ...map[kind], ...style }} />;
}

export function Spacer({ size = T.s5 }) {
  return <div style={{ height: size, flex: "0 0 auto" }} aria-hidden />;
}

/* ── Typography primitives ───────────────────────────────────────────────── */

export function Display({ size = 48, children, style = {}, as = "h1" }) {
  const Tag = as;
  return (
    <Tag style={{
      fontFamily: T.fontDisplay,
      fontWeight: T.fwReg,
      fontSize: size,
      lineHeight: T.lhDisplay,
      letterSpacing: "-0.015em",
      color: T.ink,
      margin: 0,
      ...style,
    }}>
      {children}
    </Tag>
  );
}

export function Title({ children, style = {}, as = "h2" }) {
  const Tag = as;
  return (
    <Tag style={{
      fontFamily: T.fontDisplay,
      fontWeight: T.fwReg,
      fontSize: T.fs26,
      lineHeight: 1.22,
      letterSpacing: "-0.01em",
      color: T.ink,
      margin: 0,
      ...style,
    }}>
      {children}
    </Tag>
  );
}

export function Subtitle({ children, style = {} }) {
  return (
    <p style={{
      fontFamily: T.fontBody,
      fontWeight: T.fwReg,
      fontSize: T.fs15,
      lineHeight: T.lhBody,
      color: T.inkMuted,
      margin: 0,
      ...style,
    }}>
      {children}
    </p>
  );
}

export function Eyebrow({ children, color = T.green, style = {} }) {
  return (
    <div style={{
      fontFamily: T.fontBody,
      fontSize: T.fs11,
      fontWeight: T.fwSemi,
      letterSpacing: T.trackEyebrow,
      textTransform: "uppercase",
      color,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Ribbon({ children, color = T.brassInk, bg = T.brassWash, style = {} }) {
  return (
    <span style={{
      display: "inline-block",
      fontFamily: T.fontBody,
      fontSize: T.fs10,
      fontWeight: 700,
      letterSpacing: T.trackRibbon,
      textTransform: "uppercase",
      color,
      background: bg,
      padding: "5px 10px",
      borderRadius: T.rSm,
      ...style,
    }}>
      {children}
    </span>
  );
}

export function Body({ children, size = T.fs15, color = T.inkSoft, style = {} }) {
  return (
    <p style={{
      fontFamily: T.fontBody,
      fontSize: size,
      lineHeight: T.lhBody,
      color,
      margin: 0,
      ...style,
    }}>
      {children}
    </p>
  );
}

export function Lede({ children, style = {} }) {
  return (
    <p style={{
      fontFamily: T.fontDisplay,
      fontSize: T.fs20,
      lineHeight: 1.5,
      letterSpacing: "-0.005em",
      color: T.ink,
      fontWeight: 400,
      maxWidth: T.proseMaxW,
      margin: 0,
      ...style,
    }}>
      {children}
    </p>
  );
}

/* ── Card / Tile primitives ──────────────────────────────────────────────── */

export function Card({ children, padding = T.s6, accent = null, style = {} }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.rule}`,
      borderRadius: T.rLg,
      borderTop: accent ? `2px solid ${accent}` : `1px solid ${T.rule}`,
      padding,
      boxShadow: T.shadowSoft,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Section({ title, eyebrow, action, children, dividerColor = T.green, style = {} }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: T.s5, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: T.s5 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: T.s2 }}>
          {eyebrow && <Eyebrow color={dividerColor}>{eyebrow}</Eyebrow>}
          {title && <Title>{title}</Title>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={{ borderTop: `2px solid ${dividerColor}`, height: 0 }} />
      <div>{children}</div>
    </section>
  );
}

/**
 * KPI tile — the editorial replacement for the dark "card" KPIs.
 *   - eyebrow (small caps green label, e.g. "MEDIAN HOUSEHOLD INCOME")
 *   - value   (display serif, large, tabular-num)
 *   - delta   (optional, e.g. "+3.2% YoY")
 *   - foot    (optional, e.g. "ACS 2023 5-yr · measured")
 *   - accent  (left rule color; defaults to green)
 *   - chip    (optional <Chip /> rendered top-right; usually <ProvenanceChip />)
 */
export function KPI({ eyebrow, value, delta, deltaTone = "positive", foot, accent = T.green, chip = null, style = {} }) {
  const deltaTones = {
    positive: { color: T.greenSoft, prefix: "▲ " },
    negative: { color: T.red, prefix: "▼ " },
    neutral:  { color: T.inkMuted, prefix: "• " },
  };
  const dt = deltaTones[deltaTone] || deltaTones.neutral;
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.rule}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: T.rMd,
      padding: `${T.s5} ${T.s6}`,
      display: "flex",
      flexDirection: "column",
      gap: T.s3,
      minHeight: 116,
      ...style,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: T.s3 }}>
        <div style={{ fontFamily: T.fontBody, fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.green }}>
          {eyebrow}
        </div>
        {chip}
      </div>
      <div style={{
        fontFamily: T.fontDisplay,
        fontSize: T.fs32,
        fontWeight: 400,
        lineHeight: 1.05,
        letterSpacing: "-0.015em",
        color: T.ink,
        fontVariantNumeric: "tabular-nums lining-nums",
      }}>
        {value ?? "—"}
      </div>
      {(delta || foot) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: T.s3, marginTop: "auto" }}>
          {delta != null
            ? <div style={{ fontSize: T.fs12, fontWeight: 500, color: dt.color }}>{dt.prefix}{delta}</div>
            : <span/>}
          {foot && <div style={{ fontSize: T.fs11, color: T.inkMuted, fontVariantNumeric: "tabular-nums" }}>{foot}</div>}
        </div>
      )}
    </div>
  );
}

/* ── Chip family ─────────────────────────────────────────────────────────── */

export function Chip({ tone = "neutral", children, style = {}, title }) {
  const tones = {
    measured: T.provMeasured,
    derived:  T.provDerived,
    modeled:  T.provModeled,
    llm:      T.provLLM,
    missing:  T.provMissing,
    error:    T.provError,
    proxy:    T.provProxy,
    neutral:  { fill: "rgba(26,26,26,0.04)", stroke: T.ruleStrong, ink: T.ink, label: "" },
    brand:    { fill: T.greenWash, stroke: T.green, ink: T.greenDeep, label: "" },
    brass:    { fill: T.brassWash, stroke: T.brass, ink: T.brassInk, label: "" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span title={title} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontFamily: T.fontBody,
      fontSize: T.fs10,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: t.ink,
      background: t.fill,
      border: `0.5px solid ${t.stroke}`,
      padding: "2px 7px",
      borderRadius: T.rPill,
      lineHeight: 1.4,
      ...style,
    }}>
      {children ?? t.label}
    </span>
  );
}

export function ProvenanceChip({ study, bucket, field, override = null, style = {} }) {
  const tone = override || provFor(study, bucket, field);
  const tt = {
    measured: "Measured — direct observation from a primary source.",
    derived:  "Derived — computed from measured inputs.",
    modeled:  "Modeled — projection or fitted curve; see footnote for R².",
    llm:      "LLM — synthesized text annotation, not a measured value.",
    missing:  "Missing — value not available; em-dash rendered.",
    error:    "Error — upstream cascade returned a known failure.",
    proxy:    "Proxy — backed by a market-wide proxy; not a per-row measure.",
  };
  return <Chip tone={tone} title={tt[tone] || ""} style={style} />;
}

export function Verdict({ kind = "go", style = {} }) {
  // kind: 'go' | 'conditional' | 'no-go'
  const map = {
    "go":          T.verdictGo,
    "conditional": T.verdictCondition,
    "no-go":       T.verdictNoGo,
  };
  const v = map[kind] || map["conditional"];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontFamily: T.fontBody,
      fontSize: T.fs12,
      fontWeight: 700,
      letterSpacing: T.trackRibbon,
      textTransform: "uppercase",
      color: v.ink,
      background: v.fill,
      padding: "8px 18px",
      borderRadius: T.rPill,
      ...style,
    }}>
      {v.label}
    </span>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

export function Button({ kind = "primary", size = "md", children, onClick, disabled, type = "button", style = {} }) {
  const sizes = {
    sm: { padding: "8px 14px", fontSize: T.fs12 },
    md: { padding: "11px 22px", fontSize: T.fs13 },
    lg: { padding: "14px 28px", fontSize: T.fs14 },
  };
  const kinds = {
    primary: { background: T.green, color: "#FFFFFF", border: `1px solid ${T.green}` },
    brass:   { background: T.brass, color: "#1A1A1A", border: `1px solid ${T.brass}` },
    ghost:   { background: "transparent", color: T.ink, border: `1px solid ${T.ruleStrong}` },
    text:    { background: "transparent", color: T.green, border: "1px solid transparent" },
    danger:  { background: "transparent", color: T.red, border: `1px solid ${T.red}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        ...kinds[kind],
        fontFamily: T.fontBody,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        borderRadius: T.rMd,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "background 120ms ease, border-color 120ms ease, transform 80ms ease",
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "translateY(1px)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {children}
    </button>
  );
}

/* ── Table primitive — editorial, hairline rules, tabular nums ───────────── */

export function Table({ columns, rows, footnote = null, style = {} }) {
  // columns: [{ key, label, align, width, render }]
  return (
    <div style={{ width: "100%", overflowX: "auto", ...style }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: T.fontBody,
        fontSize: T.fs13,
        color: T.ink,
        fontVariantNumeric: "tabular-nums lining-nums",
      }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                textAlign: c.align || "left",
                fontFamily: T.fontBody,
                fontSize: T.fs10,
                fontWeight: 700,
                letterSpacing: T.trackEyebrow,
                textTransform: "uppercase",
                color: T.green,
                padding: "10px 12px",
                borderBottom: `1.5px solid ${T.green}`,
                width: c.width,
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r, ri) => (
            <tr key={ri}>
              {columns.map((c, ci) => (
                <td key={c.key} style={{
                  textAlign: c.align || "left",
                  padding: "11px 12px",
                  borderBottom: `1px solid ${T.rule}`,
                  color: ci === 0 ? T.ink : T.inkSoft,
                  fontWeight: ci === 0 ? 500 : 400,
                  whiteSpace: c.nowrap ? "nowrap" : "normal",
                }}>
                  {c.render ? c.render(r) : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footnote && (
        <div style={{ fontSize: T.fs11, color: T.inkMuted, marginTop: T.s3, fontStyle: "italic" }}>
          {footnote}
        </div>
      )}
    </div>
  );
}

/* ── Sidebar / Topbar / Breadcrumb ───────────────────────────────────────── */

export function Sidebar({ items = [], active = null, onSelect, footer = null }) {
  // Dark institutional rail. Forbes reverse logo at top; brass active-pill.
  return (
    <aside style={{
      width: T.sidebarW,
      minHeight: "100vh",
      background: T.green,
      color: "#FFFFFF",
      display: "flex",
      flexDirection: "column",
      flex: "0 0 auto",
      padding: `${T.s7} 0 ${T.s5} 0`,
      borderRight: `1px solid ${T.greenDeep}`,
    }}>
      <div style={{ padding: `0 ${T.s6} ${T.s7}` }}>
        <ForbesLogo variant="reverse" height={26} />
        <div style={{ fontFamily: T.fontBody, fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackRibbon, color: T.brass, marginTop: T.s4 }}>
          INFINITY MARKETS
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: `0 ${T.s4}` }}>
        {items.map(it => {
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onSelect && onSelect(it.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.s3,
                padding: "10px 14px",
                background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                color: isActive ? T.brass : "rgba(255,255,255,0.86)",
                fontFamily: T.fontBody,
                fontSize: T.fs13,
                fontWeight: 500,
                letterSpacing: "0.01em",
                textAlign: "left",
                borderRadius: T.rMd,
                borderLeft: isActive ? `2px solid ${T.brass}` : "2px solid transparent",
                cursor: "pointer",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {it.icon ? <span style={{ width: 16, display: "inline-flex" }}>{it.icon}</span> : null}
              <span>{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      {footer ? <div style={{ padding: `0 ${T.s6}`, borderTop: `1px solid ${T.greenDeep}`, paddingTop: T.s4, marginTop: T.s4 }}>{footer}</div> : null}
    </aside>
  );
}

export function Topbar({ left = null, right = null }) {
  return (
    <header style={{
      height: T.topbarH,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `0 ${T.s7}`,
      borderBottom: `1px solid ${T.rule}`,
      background: T.surface,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.s4 }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: T.s4 }}>{right}</div>
    </header>
  );
}

export function Breadcrumb({ items = [] }) {
  // items: [{ label, to? }]
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: T.s2, fontSize: T.fs12, color: T.inkMuted }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: T.s2 }}>
          {it.to ? <Link to={it.to} className="fc-link-naked" style={{ color: T.inkMuted, borderBottom: 0 }}>{it.label}</Link> : <span style={{ color: T.ink }}>{it.label}</span>}
          {i < items.length - 1 && <span style={{ color: T.inkFaint }}>›</span>}
        </span>
      ))}
    </nav>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, eyebrow, children, footer = null, width = 640 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(26,26,26,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: T.s5,
        animation: "fc-fade-in 160ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "min(90vh, 760px)",
          overflow: "auto",
          background: T.surface,
          borderRadius: T.rLg,
          boxShadow: "0 24px 64px -12px rgba(0,77,65,0.25), 0 0 0 1px rgba(26,26,26,0.10)",
          display: "flex", flexDirection: "column",
          fontFamily: T.fontBody,
          color: T.ink,
        }}
      >
        <div style={{ padding: `${T.s6} ${T.s6} ${T.s4}`, borderBottom: `1px solid ${T.rule}` }}>
          {eyebrow && <Eyebrow style={{ marginBottom: T.s2 }}>{eyebrow}</Eyebrow>}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: T.s4 }}>
            <Title style={{ fontSize: T.fs22 }}>{title}</Title>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ fontSize: 20, color: T.inkMuted, cursor: "pointer", lineHeight: 1, padding: 4 }}
            >×</button>
          </div>
        </div>
        <div style={{ padding: T.s6, flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: `${T.s4} ${T.s6}`, borderTop: `1px solid ${T.rule}`, background: T.canvas }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ── EmptyState / Skeleton / ErrorState / Banner ─────────────────────────── */

export function EmptyState({ title, body, action = null, style = {} }) {
  return (
    <div style={{
      padding: T.s9,
      textAlign: "center",
      color: T.inkMuted,
      border: `1px dashed ${T.ruleStrong}`,
      borderRadius: T.rLg,
      ...style,
    }}>
      <ForbesMark size={32} color={T.brass} style={{ margin: "0 auto", marginBottom: T.s4 }} />
      <Title style={{ fontSize: T.fs18, color: T.ink }}>{title}</Title>
      {body && <Body style={{ marginTop: T.s2 }}>{body}</Body>}
      {action && <div style={{ marginTop: T.s5 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", detail, onRetry }) {
  return (
    <Card padding={T.s7} accent={T.red} style={{ background: T.provError.fill }}>
      <Eyebrow color={T.provError.ink}>ERROR</Eyebrow>
      <Title style={{ fontSize: T.fs20, marginTop: T.s2 }}>{title}</Title>
      {detail && <Body style={{ marginTop: T.s3, color: T.ink }}>{detail}</Body>}
      {onRetry && <div style={{ marginTop: T.s5 }}><Button kind="ghost" onClick={onRetry}>Try again</Button></div>}
    </Card>
  );
}

export function Banner({ tone = "info", children, style = {} }) {
  const tones = {
    info: { fill: T.greenTint, stroke: T.green, ink: T.greenDeep },
    warn: { fill: T.brassTint, stroke: T.brass, ink: T.brassInk },
    error: { fill: T.provError.fill, stroke: T.provError.stroke, ink: T.provError.ink },
    note: { fill: T.canvas, stroke: T.ruleStrong, ink: T.inkSoft },
  };
  const t = tones[tone];
  return (
    <div style={{
      padding: `${T.s4} ${T.s5}`,
      background: t.fill,
      borderLeft: `3px solid ${t.stroke}`,
      borderRadius: T.rMd,
      color: t.ink,
      fontSize: T.fs13,
      lineHeight: T.lhBody,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius = T.rSm, style = {} }) {
  return (
    <div style={{
      height, width,
      background: "linear-gradient(90deg, rgba(26,26,26,0.05), rgba(26,26,26,0.10), rgba(26,26,26,0.05))",
      backgroundSize: "200% 100%",
      animation: "fc-skel 1.4s ease-in-out infinite",
      borderRadius: radius,
      ...style,
    }} />
  );
}

/* ── Bar — small horizontal data viz used in KPI strips ─────────────────── */

export function MicroBars({ values = [], height = 24, color = T.green, style = {} }) {
  if (!values?.length) return null;
  const max = Math.max(...values.map(v => Math.abs(Number(v) || 0)), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, ...style }}>
      {values.map((v, i) => {
        const h = ((Math.abs(Number(v) || 0)) / max) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(h, 4)}%`,
              background: color,
              opacity: 0.35 + (h / 100) * 0.65,
              borderRadius: 1,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── ErrorBoundary — catches client crashes from data shape changes ───────── */

import React from 'react';
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { /* eslint-disable no-console */ console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <Page>
          <Container>
            <Stack gap={T.s5}>
              <Eyebrow color={T.red}>Component error</Eyebrow>
              <Title>The dashboard ran into an unexpected shape</Title>
              <Body style={{ maxWidth: T.proseMaxW }}>
                {String(this.state.error?.message || this.state.error)}. The app stayed up — reload to retry.
              </Body>
              <div><Button kind="primary" onClick={() => window.location.reload()}>Reload</Button></div>
            </Stack>
          </Container>
        </Page>
      );
    }
    return this.props.children;
  }
}

/* Inject keyframes for skeleton on first import */
if (typeof document !== "undefined" && !document.getElementById("fc-skel-kf")) {
  const s = document.createElement("style");
  s.id = "fc-skel-kf";
  s.textContent = "@keyframes fc-skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }";
  document.head.appendChild(s);
}
