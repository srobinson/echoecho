import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export interface BarChartDatum {
  x: number;
  y: number;
  label?: string;
}

export interface BarChartProps {
  data: BarChartDatum[];
  width: number;
  height: number;
  color?: string;
  barRadius?: number;
  paddingHorizontal?: number;
}

export function BarChart({
  data,
  width,
  height,
  color = '#6c63ff',
  barRadius = 4,
  paddingHorizontal = 12,
}: BarChartProps) {
  if (data.length === 0) return null;

  const maxY = Math.max(...data.map((d) => d.y), 1);
  const usableWidth = width - paddingHorizontal * 2;
  const barGap = 4;
  const barWidth = Math.max(
    2,
    (usableWidth - barGap * (data.length - 1)) / data.length,
  );

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const barHeight = (d.y / maxY) * (height - 8);
          const x = paddingHorizontal + i * (barWidth + barGap);
          const y = height - barHeight;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={barRadius}
              ry={barRadius}
              fill={color}
            />
          );
        })}
      </Svg>
    </View>
  );
}