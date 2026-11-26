/**
 * The geometry Smart Shapes inserts for a recognized shape (#253), in page pixels, drawn with the
 * active pen. Field names follow `insertGeometry` in sn-plugin-lib 0.2.3; the arrow's head length and
 * fill follow Snap v0.9.0 (MIT, see ../NOTICE.md).
 */
import {arrowPoints, type P, type Shape} from './recognize';

export type Pen = {type: number; color: number; width: number};

/** The thinnest pen width the host draws (about 100 units per pixel of line). */
const MIN_PEN_WIDTH = 100;
/** Snap's head at its default 100 % setting, 70 % of its first size. */
const HEAD_SCALE = 0.7;

/** Arrow head length (px), from the pen width only: 0.5 pen gives 43 px before HEAD_SCALE. */
export function arrowHeadLength(penWidth: number): number {
  return Math.round(Math.min(130, 24 + (3.2 * penWidth) / 100));
}

const round = (p: P): P => ({x: Math.round(p.x), y: Math.round(p.y)});

export function geometryFor(shape: Shape, pen: Pen, select: boolean): object {
  const base = {
    penColor: pen.color,
    penType: pen.type,
    penWidth: Math.max(MIN_PEN_WIDTH, Math.round(pen.width)),
    showLassoAfterInsert: select,
  };
  if (shape.kind === 'circle') {
    return {
      ...base,
      type: 'GEO_circle',
      points: [],
      ellipseCenterPoint: round({x: shape.cx, y: shape.cy}),
      ellipseMajorAxisRadius: Math.round(shape.r),
      ellipseMinorAxisRadius: Math.round(shape.r),
      ellipseAngle: 0,
    };
  }
  let points: P[];
  if (shape.kind === 'arrow') {
    const fill = Math.max(2, (0.4 * base.penWidth) / 100);
    points = arrowPoints(
      shape.tail,
      shape.tip,
      arrowHeadLength(base.penWidth) * HEAD_SCALE,
      fill,
    );
  } else {
    points = [...shape.corners, shape.corners[0]];
  }
  return {
    ...base,
    type: 'GEO_polygon',
    points: points.map(round),
    ellipseCenterPoint: null,
    ellipseMajorAxisRadius: 0,
    ellipseMinorAxisRadius: 0,
    ellipseAngle: 0,
  };
}
