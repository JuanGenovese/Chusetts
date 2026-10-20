/**
 * Pure geometry/format helpers for the dashboard charts. The legacy app drew them with Plotly Express
 * (`px.bar`, `px.pie`) through `st.plotly_chart`; these functions reproduce the bits of Plotly's behaviour that
 * are visible: 1-2-5 axis ticks, SI tick labels ("15k"), the Streamlit colour sequence and pie slice maths.
 */

/** Streamlit's Plotly colorway (light theme); the dark theme starts with the light blue. */
export const COLORWAY_LIGHT = ["#0068c9", "#83c9ff", "#ff2b2b", "#ffabab", "#29b09d", "#7defa1", "#ff8700", "#ffd16a", "#6d3fc0", "#d5dae5"];
export const COLORWAY_DARK = ["#83c9ff", "#0068c9", "#ffabab", "#ff2b2b", "#7defa1", "#29b09d", "#ffd16a", "#ff8700", "#d5dae5", "#6d3fc0"];

/** Smallest 1-2-5 x 10^k step that is >= `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

export interface LinearAxis {
  ticks: number[];
  /** Upper bound of the axis (Plotly pads the autorange of bars by 5%). */
  max: number;
}

/** Axis from 0 to just above `maxValue`, with roughly `targetCount` ticks. */
export function linearAxis(maxValue: number, targetCount = 5): LinearAxis {
  const max = maxValue > 0 ? maxValue * 1.05 : 1;
  const step = niceStep(max / targetCount);
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(Math.round(value * 1e9) / 1e9);
  return { ticks, max };
}

/** d3 "~s" style labels used by Plotly: 15000 -> "15k", 2500 -> "2.5k", 1500000 -> "1.5M", 250 -> "250". */
export function formatSi(value: number): string {
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${trimZeros((value / size).toPrecision(3))}${suffix}`;
  }
  return trimZeros(value.toPrecision(3));
}

function trimZeros(text: string): string {
  const number = Number(text);
  return Number.isFinite(number) ? String(number) : text;
}

export interface PieSlice {
  index: number;
  fraction: number;
  /** Radians, 0 = 12 o'clock, clockwise. */
  start: number;
  end: number;
}

/** Slices in the order given (Plotly sorts by value, the caller already did). */
export function pieSlices(values: number[]): PieSlice[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return [];
  let angle = 0;
  return values.map((value, index) => {
    const fraction = value / total;
    const start = angle;
    angle += fraction * Math.PI * 2;
    return { index, fraction, start, end: angle };
  });
}

/** Point on a circle where 0 rad is 12 o'clock and angles grow clockwise. */
export function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

/** SVG path of a pie slice (a full circle when the slice covers everything). */
export function slicePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  if (end - start >= Math.PI * 2 - 1e-9) {
    return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.001} ${cy - radius} Z`;
  }
  const a = polar(cx, cy, radius, start);
  const b = polar(cx, cy, radius, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** "2026-10-05" -> "Oct 5" (Plotly date-axis label). */
export function formatAxisDay(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}`;
}

/** Tick step (in days) that keeps labels from overlapping: 1, 2, 5, 7, 14, 30... */
export function dayTickStep(dayCount: number, maxTicks: number): number {
  for (const step of [1, 2, 5, 7, 14, 30, 60, 90, 180, 365]) {
    if (Math.ceil(dayCount / step) <= maxTicks) return step;
  }
  return 365;
}
