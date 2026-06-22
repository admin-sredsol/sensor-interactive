import * as React from "react";

import { Point, SparklinesContext } from "../components/sparkline";

// adapted from https://github.com/borisyankov/react-sparklines/blob/master/src/SparklinesLine.js

interface Props {
  data?: number[] | undefined;
  points?: Point[] | undefined;
  color?: React.SVGAttributes<React.ReactSVGElement>['color'] | undefined;
  style?: React.SVGAttributes<React.ReactSVGElement>['style'] | undefined;
  onMouseMove?: ((event: 'enter' | 'click', value: number, point: Point) => void) | undefined;
}

const SparklinesPoints = (props: Props) => {

  const { color, style, onMouseMove } = props;
  const context = React.useContext(SparklinesContext);
  // Use points from props if provided, otherwise from Sparklines context
  const points = props.points ?? context.points;
  const data = props.data ?? context.data;

  const fillStyle: React.SVGAttributes<React.ReactSVGElement>['style'] = {
    stroke: style?.stroke || 'none',
    strokeWidth: '0',
    fillOpacity: style?.fillOpacity || '1',
    fill: style?.fill || color || 'slategray',
    pointerEvents: 'auto',
  };

  const tooltips = points?.map((p, i) => {
    const value = data?.[i] || 0;
    return (
      <circle
        key={i}
        cx={p.x}
        cy={p.y}
        r={2}
        style={fillStyle}
        onMouseEnter={e => onMouseMove?.('enter', value, p)}
        onClick={e => onMouseMove?.('click', value, p)}
      />
    );
  });

  return (
    <g>
      {tooltips}
    </g>
  );
}

export default SparklinesPoints;
