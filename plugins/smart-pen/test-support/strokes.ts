// Stroke generators copied from Snap v0.9.0 __tests__/recognize.test.ts (MIT, Copyright (c) 2026 Charles Cheval), see ../NOTICE.md (#253).
import type {P} from '../src/recognize';

export function hand(points: P[], amp: number, seed = 7): P[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  let dx = 0;
  let dy = 0;
  return points.map(p => {
    dx = dx * 0.9 + rnd() * amp * 0.3;
    dy = dy * 0.9 + rnd() * amp * 0.3;
    return {x: p.x + dx + rnd() * amp * 0.3, y: p.y + dy + rnd() * amp * 0.3};
  });
}

export function polyline(vertices: P[], perSide = 40): P[] {
  const out: P[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    for (let j = 0; j < perSide; j++) {
      const t = j / perSide;
      out.push({x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)});
    }
  }
  out.push(vertices[vertices.length - 1]);
  return out;
}

export function arc(cx: number, cy: number, rx: number, ry: number, turns: number, start = 0, n = 150): P[] {
  return Array.from({length: n}, (_, i) => {
    const a = start + (i / (n - 1)) * turns * 2 * Math.PI;
    return {x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a)};
  });
}

export function rotateAll(points: P[], deg: number, c: P): P[] {
  const a = (deg * Math.PI) / 180;
  return points.map(p => ({
    x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a),
    y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a),
  }));
}

/** Rectangle drawn from top-left, clockwise; `end` = where the pen stops. */
export const rect = (l: number, t: number, r: number, b: number, end: P = {x: l, y: t + 10}) =>
  polyline([{x: l, y: t}, {x: r, y: t}, {x: r, y: b}, {x: l, y: b}, end]);

/** Hand-drawn arrow: shaft from `a` to `b`, then a head of size `h` drawn in one of the usual ways. */
export function arrow(a: P, b: P, h: number, style: 'barb-tip-barb' | 'triangle' | 'open-v', deg = 30, bow = 0): P[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const bx = (a.x - b.x) / len;
  const by = (a.y - b.y) / len;
  const r = (deg * Math.PI) / 180;
  const barb = (s: number) => ({
    x: b.x + h * (bx * Math.cos(s * r) - by * Math.sin(s * r)),
    y: b.y + h * (bx * Math.sin(s * r) + by * Math.cos(s * r)),
  });
  const heads = {
    'barb-tip-barb': [b, barb(1), b, barb(-1)],
    triangle: [b, barb(1), barb(-1), b],
    'open-v': [b, barb(1), barb(-1)],
  };
  // Optional bow: the shaft passes through a midpoint pushed sideways by `bow` × its length.
  const mid = {x: (a.x + b.x) / 2 - by * bow * len, y: (a.y + b.y) / 2 + bx * bow * len};
  const shaft = bow ? [a, mid] : [a];
  return polyline([...shaft, ...heads[style]], 30);
}
