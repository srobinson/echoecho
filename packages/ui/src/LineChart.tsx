import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export interface LineChartDatum {
  x: number;
  y: number;
}

export interface LineChartProps {
  data: LineChartDatum[];
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
}

export function LineChart({
  data,
  width,
  height,
  color = '#38bdf8',
  strokeWidth = 2,
  paddingHorizontal = 8,
  paddingVertical = 8,
}: LineChartProps) {
  if (data.length < 2) return null;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const usableW = width - paddingHorizontal * 2;
  const usableH = height - paddingVertical * 2;

  const toSvgX = (v: number) =>
    paddingHorizontal + ((v - minX) / rangeX) * usableW;
  const toSvgY = (v: number) =>
    paddingVertical + (1 - (v - minY) / rangeY) * usableH;

  const pathD = data
    .map((d, i) => {
      const px = toSvgX(d.x);
      const py = toSvgY(d.y);
      return i === 0 ? `M${px},${py}` : `L${px},${py}`;
    })
    .join(' ');

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path
          d={pathD}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
