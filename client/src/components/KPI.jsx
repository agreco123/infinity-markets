import { T } from '../lib/tokens';
import { KPI as KPIBase } from './ui';

/**
 * Legacy KPI shim. The original component took { label, value, sub, trend, icon, color }.
 * The new design system's KPI takes { eyebrow, value, delta, deltaTone, foot, accent, chip }.
 * This shim adapts old props to new so the Dashboard's existing JSX compiles unchanged.
 */
export default function KPI({ label, value, sub, trend, icon, color = T.green }) {
  const deltaTone = trend > 0 ? "positive" : trend < 0 ? "negative" : "neutral";
  const delta = (trend !== undefined && trend !== null && !Number.isNaN(Number(trend)))
    ? `${Math.abs(Number(trend)).toFixed(1)}%`
    : null;
  return (
    <KPIBase
      eyebrow={label}
      value={value}
      delta={delta}
      deltaTone={deltaTone}
      foot={sub}
      accent={color}
    />
  );
}
