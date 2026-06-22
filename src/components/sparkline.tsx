import * as React from "react";

/**
 * Lightweight SVG sparkline components to replace the abandoned `react-sparklines` library.
 * These components render sparklines as inline SVG elements.
 */

// --- Shared Types ---

export interface SparklinesProps {
  data: number[];
  limit?: number;
  width?: number;
  height?: number;
  margin?: number;
  children?: React.ReactNode;
}

export interface SparklinesLineProps {
  color?: string;
  style?: React.CSSProperties;
}

export interface SparklinesBarsProps {
  style?: React.CSSProperties;
}

// --- Internal Helpers ---

interface Point {
  x: number;
  y: number;
}

function dataToPoints(data: number[], width: number, height: number, margin: number): Point[] {
  const len = data.length;
  if (len === 0) return [];

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const effectiveWidth = width - margin * 2;
  const effectiveHeight = height - margin * 2;

  return data.map((value, index) => ({
    x: margin + (effectiveWidth * index) / (len - 1 || 1),
    y: margin + effectiveHeight - (effectiveHeight * (value - min)) / range,
  }));
}

// --- Sparklines Container ---

export const Sparklines: React.FC<SparklinesProps> = ({ data, limit, width = 100, height = 20, margin = 5, children }) => {
  // If limit is specified, only use the last `limit` data points
  const displayData = limit != null && limit < data.length ? data.slice(-limit) : data;
  const points = dataToPoints(displayData, width, height, margin);

  // Pass points down to children via React context
  return (
    <SparklinesContext.Provider value={{ points, data, width, height, margin }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {children}
      </svg>
    </SparklinesContext.Provider>
  );
};

// --- Context for passing computed points to children ---

interface SparklinesContextValue {
  points: Point[];
  data: number[];
  width: number;
  height: number;
  margin: number;
}

export const SparklinesContext = React.createContext<SparklinesContextValue>({
  points: [],
  data: [],
  width: 100,
  height: 20,
  margin: 5,
});

// --- SparklinesLine ---

export const SparklinesLine: React.FC<SparklinesLineProps> = ({ color = "slategray", style }) => {
  const { points } = React.useContext(SparklinesContext);

  if (points.length < 2) return null;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");

  return (
    <path
      d={linePath}
      fill="none"
      stroke={color}
      strokeWidth={1}
      style={style}
    />
  );
};

// --- SparklinesBars ---

export const SparklinesBars: React.FC<SparklinesBarsProps> = ({ style }) => {
  const { points, height, margin } = React.useContext(SparklinesContext);

  if (points.length === 0) return null;

  const barWidth = Math.max(1, (points.length > 1 ? points[1].x - points[0].x : 4) * 0.6);
  const baseline = height - margin;

  return (
    <g>
      {points.map((p, i) => (
        <rect
          key={i}
          x={p.x - barWidth / 2}
          y={p.y}
          width={barWidth}
          height={baseline - p.y}
          style={style}
          fill={style?.fill || "slategray"}
        />
      ))}
    </g>
  );
};

// Re-export the Point type for backward compatibility with SparklinesPoints
export type { Point };