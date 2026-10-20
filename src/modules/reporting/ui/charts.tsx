"use client";

import { useEffect, useRef, useState } from "react";
import { dayIndex, dayTickStep, formatAxisDay, formatSi, linearAxis, pieSlices, polar, slicePath } from "./chart-math";

/**
 * Lightweight SVG replicas of the legacy Plotly Express charts (`px.bar`, `px.pie` inside `st.plotly_chart`).
 * Decision: no chart library (Plotly is ~3.5 MB); the visible Plotly behaviour (title, 1-2-5 ticks, SI labels,
 * Streamlit colorway, legend, percent labels, 450px height) is reproduced and tooltips use native `<title>`.
 * Not reproduced: the hover modebar and zoom/pan.
 */

const HEIGHT = 450;
const MARGIN = { top: 100, bottom: 80, right: 0 };
const CHAR_WIDTH = 6.4;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export interface BarDatum {
  /** Category label, or an ISO date when `axis` is "date". */
  label: string;
  value: number;
  tooltip: string;
}

export function BarChart({
  title,
  xTitle,
  yTitle,
  data,
  axis = "category",
}: {
  title: string;
  xTitle: string;
  yTitle: string;
  data: BarDatum[];
  axis?: "category" | "date";
}) {
  const { ref, width } = useWidth();
  const maxValue = Math.max(0, ...data.map((d) => d.value));
  const yAxis = linearAxis(maxValue);
  const tickLabels = yAxis.ticks.map(formatSi);
  const left = Math.max(60, 43 + Math.max(...tickLabels.map((t) => t.length)) * CHAR_WIDTH);
  const plot = { x: left, y: MARGIN.top, w: Math.max(0, width - left - MARGIN.right), h: HEIGHT - MARGIN.top - MARGIN.bottom };
  const yOf = (value: number) => plot.y + plot.h - (value / yAxis.max) * plot.h;

  // Horizontal geometry: a band per category, or one band per calendar day.
  let bands: { x: number; w: number; label: string; datum: BarDatum }[] = [];
  let xTicks: { x: number; label: string; sub?: string }[] = [];
  if (axis === "category") {
    const band = plot.w / Math.max(1, data.length);
    bands = data.map((datum, i) => ({ x: plot.x + band * i + band * 0.1, w: band * 0.8, label: datum.label, datum }));
    xTicks = data.map((datum, i) => ({ x: plot.x + band * (i + 0.5), label: datum.label }));
  } else if (data.length > 0) {
    const first = dayIndex(data[0].label);
    const last = dayIndex(data[data.length - 1].label);
    const span = last - first + 1;
    const perDay = plot.w / span;
    bands = data.map((datum) => ({ x: plot.x + (dayIndex(datum.label) - first) * perDay + perDay * 0.1, w: perDay * 0.8, label: datum.label, datum }));
    const step = dayTickStep(span, Math.max(2, Math.floor(plot.w / 70)));
    for (let d = 0; d < span; d += step) {
      const iso = new Date((first + d) * 86_400_000).toISOString().slice(0, 10);
      xTicks.push({ x: plot.x + (d + 0.5) * perDay, label: formatAxisDay(iso), sub: d === 0 ? iso.slice(0, 4) : undefined });
    }
  }

  return (
    <div ref={ref} className="chart" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label={title}>
          <text x={4} y={50} fontSize={17} fontWeight={700} fill="var(--chart-text)">
            {title}
          </text>
          {yAxis.ticks.map((tick, i) => (
            <g key={`y-${tick}`}>
              <line x1={plot.x} x2={plot.x + plot.w} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--chart-grid)" />
              <text x={plot.x - 8} y={yOf(tick) + 4} textAnchor="end" fontSize={12} fill="var(--chart-muted)">
                {tickLabels[i]}
              </text>
            </g>
          ))}
          {bands.map((band) => (
            <rect key={band.label} x={band.x} y={yOf(band.datum.value)} width={band.w} height={Math.max(0, plot.y + plot.h - yOf(band.datum.value))} fill="var(--c0)">
              <title>{band.datum.tooltip}</title>
            </rect>
          ))}
          {xTicks.map((tick) => (
            <g key={`x-${tick.label}`}>
              <text x={tick.x} y={plot.y + plot.h + 17} textAnchor="middle" fontSize={12} fill="var(--chart-muted)">
                {tick.label}
              </text>
              {tick.sub ? (
                <text x={tick.x} y={plot.y + plot.h + 31} textAnchor="middle" fontSize={12} fill="var(--chart-muted)">
                  {tick.sub}
                </text>
              ) : null}
            </g>
          ))}
          <text x={10} y={plot.y + plot.h / 2} textAnchor="middle" fontSize={12} fill="var(--chart-muted)" transform={`rotate(-90 10 ${plot.y + plot.h / 2})`}>
            {yTitle}
          </text>
          <text x={plot.x + plot.w / 2} y={plot.y + plot.h + 42} textAnchor="middle" fontSize={14} fill="var(--chart-muted)">
            {xTitle}
          </text>
        </svg>
      ) : null}
    </div>
  );
}

export interface PieDatum {
  label: string;
  value: number;
  tooltip: string;
}

export function PieChart({ title, data }: { title: string; data: PieDatum[] }) {
  const { ref, width } = useWidth();
  const slices = pieSlices(data.map((d) => d.value));
  const legendWidth = 34 + Math.max(0, ...data.map((d) => d.label.length)) * CHAR_WIDTH;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const domainWidth = Math.max(0, width - legendWidth - 5);
  const radius = Math.max(0, Math.min(plotHeight / 2, domainWidth / 2));
  const cx = domainWidth / 2;
  const cy = MARGIN.top + plotHeight / 2;

  return (
    <div ref={ref} className="chart" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label={title}>
          <text x={4} y={50} fontSize={17} fontWeight={700} fill="var(--chart-text)">
            {title}
          </text>
          {slices.map((slice) => {
            const datum = data[slice.index];
            const color = slice.index % 10;
            const mid = polar(cx, cy, radius * 0.62, (slice.start + slice.end) / 2);
            return (
              <g key={datum.label}>
                <path d={slicePath(cx, cy, radius, slice.start, slice.end)} fill={`var(--c${color})`}>
                  <title>{datum.tooltip}</title>
                </path>
                <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize={12} fill={`var(--t${color})`}>
                  {(slice.fraction * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}
          {data.map((datum, i) => (
            <g key={`legend-${datum.label}`} transform={`translate(${width - legendWidth - 5}, ${105 + i * 19})`}>
              <rect width={12} height={12} y={-1} fill={`var(--c${i % 10})`} />
              <text x={18} y={10} fontSize={12} fill="var(--chart-text)">
                {datum.label}
              </text>
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
