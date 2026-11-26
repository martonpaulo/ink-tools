/**
 * The found drawing as pen strokes, for «Insert Sticker» (#35, owner D62 A): the tablet makes a
 * sticker only from strokes and geometries, never from a picture (error 205, docs/supernote.md).
 * A vector original (SVG) gives its own outlines; any other picture gives the traced outline of
 * its dark pixels. Both end as polylines in sticker pixels, simplified to a point budget, since
 * every point is three bridge calls (#148: 151 points took 718 ms).
 * Pure: no SDK, no file, no network.
 */

export type Point = {x: number; y: number};
export type Polyline = Point[];

/** At most this many points in one sticker: about 3 s of point writes at #148's rate. */
export const MAX_STICKER_POINTS = 600;
/** At most this many strokes: the longest stay. */
export const MAX_STICKER_STROKES = 60;
/** Segments per Bézier curve before simplification. */
const CURVE_STEPS = 8;
/** Segments per full circle or ellipse. */
const ELLIPSE_STEPS = 24;
/** The first simplification tolerance in sticker pixels; doubled until the budget holds. */
const FIRST_TOLERANCE = 0.75;
/** No simplification coarser than this: a drawing that still does not fit drops strokes. */
const MAX_TOLERANCE = 12;
/** A traced outline shorter than this, in mask pixels, is noise. */
const MIN_TRACE_LENGTH = 8;

/** A 2D affine transform `[a, b, c, d, e, f]`, as SVG's `matrix()`. */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** `matrix()` takes six values. */
const MATRIX_VALUES = IDENTITY.length;
/** Degrees in half a turn, for `rotate()` and the skews. */
const HALF_TURN = 180;
const radians = (degrees: number) => (degrees * Math.PI) / HALF_TURN;
/** The Bernstein weight of a cubic's inner control points. */
const CUBIC_WEIGHT = 3;

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, p: Point): Point {
  return {x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5]};
}

function numbers(text: string): number[] {
  return (text.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
}

/** An SVG `transform` attribute as one matrix: matrix, translate, scale, rotate, skewX, skewY. */
export function parseTransform(text: string | undefined): Matrix {
  let result = IDENTITY;
  for (const [, name, args] of (text ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = numbers(args);
    let m: Matrix = IDENTITY;
    if (name === 'matrix' && v.length === MATRIX_VALUES) {
      m = v as Matrix;
    } else if (name === 'translate') {
      m = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    } else if (name === 'scale') {
      m = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    } else if (name === 'rotate') {
      const r = radians(v[0] ?? 0);
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      m = multiply(
        multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
        [1, 0, 0, 1, -cx, -cy],
      );
    } else if (name === 'skewX') {
      m = [1, 0, Math.tan(radians(v[0] ?? 0)), 1, 0, 0];
    } else if (name === 'skewY') {
      m = [1, Math.tan(radians(v[0] ?? 0)), 0, 1, 0, 0];
    }
    result = multiply(result, m);
  }
  return result;
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, out: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x +
        CUBIC_WEIGHT * u * u * t * p1.x +
        CUBIC_WEIGHT * u * t * t * p2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        CUBIC_WEIGHT * u * u * t * p1.y +
        CUBIC_WEIGHT * u * t * t * p2.y +
        t * t * t * p3.y,
    });
  }
}

function quadratic(p0: Point, p1: Point, p2: Point, out: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
}

/** Arguments each path command takes per repeat. */
const ARITY: Record<string, number> = {M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0};

/**
 * An SVG path's `d` as polylines, one per subpath; curves are cut into CURVE_STEPS segments.
 * shortcut: an elliptical arc (`A`) is drawn as a line to its end point; upgrade if traced
 * stickers of real Commons drawings show flat arcs.
 */
export function pathPolylines(d: string): Polyline[] {
  const polylines: Polyline[] = [];
  let current: Point[] = [];
  let pen: Point = {x: 0, y: 0};
  let start: Point = pen;
  let control: Point | null = null;
  let lastCommand = '';
  const close = () => {
    if (current.length > 1) {
      polylines.push(current);
    }
    current = [];
  };
  for (const [, letter, args] of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const command = letter.toUpperCase();
    const relative = letter !== command;
    const values = numbers(args);
    const arity = ARITY[command];
    if (command === 'Z') {
      if (current.length > 0) {
        current.push(start);
      }
      close();
      pen = start;
      control = null;
      lastCommand = 'Z';
      continue;
    }
    for (let i = 0; i + arity <= values.length; i += arity) {
      const v = values.slice(i, i + arity);
      const at = (dx: number, dy: number): Point =>
        relative ? {x: pen.x + dx, y: pen.y + dy} : {x: dx, y: dy};
      // A repeated M is an implicit L (SVG 1.1, 8.3.2).
      const step = command === 'M' && i > 0 ? 'L' : command;
      let next: Point;
      let nextControl: Point | null = null;
      if (step === 'M') {
        close();
        next = at(v[0], v[1]);
        start = next;
        current = [next];
      } else {
        if (current.length === 0) {
          current = [pen];
        }
        if (step === 'L') {
          next = at(v[0], v[1]);
          current.push(next);
        } else if (step === 'H') {
          next = {x: relative ? pen.x + v[0] : v[0], y: pen.y};
          current.push(next);
        } else if (step === 'V') {
          next = {x: pen.x, y: relative ? pen.y + v[0] : v[0]};
          current.push(next);
        } else if (step === 'C') {
          const c1 = at(v[0], v[1]);
          nextControl = at(v[2], v[3]);
          next = at(v[4], v[5]);
          cubic(pen, c1, nextControl, next, current);
        } else if (step === 'S') {
          const c1 =
            control && 'CS'.includes(lastCommand)
              ? {x: 2 * pen.x - control.x, y: 2 * pen.y - control.y}
              : pen;
          nextControl = at(v[0], v[1]);
          next = at(v[2], v[3]);
          cubic(pen, c1, nextControl, next, current);
        } else if (step === 'Q') {
          nextControl = at(v[0], v[1]);
          next = at(v[2], v[3]);
          quadratic(pen, nextControl, next, current);
        } else if (step === 'T') {
          nextControl =
            control && 'QT'.includes(lastCommand)
              ? {x: 2 * pen.x - control.x, y: 2 * pen.y - control.y}
              : pen;
          next = at(v[0], v[1]);
          quadratic(pen, nextControl, next, current);
        } else {
          // 'A': the shortcut above.
          next = at(v[5], v[6]);
          current.push(next);
        }
      }
      pen = next;
      control = nextControl;
      lastCommand = step;
    }
  }
  close();
  return polylines;
}

function attributes(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, , value] of text.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
    found[name] = value;
  }
  return found;
}

function num(value: string | undefined, fallback = 0): number {
  const parsed = numbers(value ?? '')[0];
  return parsed === undefined ? fallback : parsed;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Polyline {
  const points: Polyline = [];
  for (let i = 0; i <= ELLIPSE_STEPS; i += 1) {
    const a = (2 * Math.PI * i) / ELLIPSE_STEPS;
    points.push({x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a)});
  }
  return points;
}

/** The polylines one drawing element gives, before its transform. */
function shapePolylines(tag: string, a: Record<string, string>): Polyline[] {
  if (tag === 'path') {
    return pathPolylines(a.d ?? '');
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const v = numbers(a.points ?? '');
    const points: Polyline = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      points.push({x: v[i], y: v[i + 1]});
    }
    if (tag === 'polygon' && points.length > 2) {
      points.push(points[0]);
    }
    return points.length > 1 ? [points] : [];
  }
  if (tag === 'line') {
    return [[{x: num(a.x1), y: num(a.y1)}, {x: num(a.x2), y: num(a.y2)}]];
  }
  if (tag === 'rect') {
    const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
    return w > 0 && h > 0
      ? [[{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}, {x, y}]]
      : [];
  }
  if (tag === 'circle') {
    const r = num(a.r);
    return r > 0 ? [ellipse(num(a.cx), num(a.cy), r, r)] : [];
  }
  if (tag === 'ellipse') {
    const [rx, ry] = [num(a.rx), num(a.ry)];
    return rx > 0 && ry > 0 ? [ellipse(num(a.cx), num(a.cy), rx, ry)] : [];
  }
  return [];
}

/**
 * True when the SVG embeds raster pictures (`<image>`): its vector shapes are then at most a frame
 * around them, and a sticker of its outlines is an empty square (device round 6, #35).
 */
export function svgEmbedsPictures(svg: string): boolean {
  return /<(?:svg:)?image[\s/>]/i.test(svg);
}

/** Containers whose content is never drawn where it stands. */
const HIDDEN = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'metadata', 'title', 'desc', 'style']);

/**
 * Every drawn outline of an SVG document, in its user units, with the transforms of its groups.
 * shortcut: `<use>`, CSS `display:none` and nested `<svg>` viewports are not followed; upgrade if
 * a Commons drawing comes out empty or misplaced on the device.
 */
export function svgPolylines(svg: string): Polyline[] {
  const polylines: Polyline[] = [];
  const stack: {tag: string; matrix: Matrix}[] = [];
  let hidden = 0;
  const top = () => (stack.length ? stack[stack.length - 1].matrix : IDENTITY);
  const body = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  for (const [, closing, rawTag, rest, selfClosing] of body.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const tag = rawTag.replace(/^svg:/, '');
    if (closing) {
      const open = stack.pop();
      if (open && HIDDEN.has(open.tag)) {
        hidden -= 1;
      }
      continue;
    }
    const a = attributes(rest);
    const matrix = multiply(top(), parseTransform(a.transform));
    if (!hidden && a.display !== 'none' && a.visibility !== 'hidden') {
      for (const line of shapePolylines(tag, a)) {
        polylines.push(line.map(p => apply(matrix, p)));
      }
    }
    if (!selfClosing) {
      stack.push({tag, matrix});
      if (HIDDEN.has(tag)) {
        hidden += 1;
      }
    }
  }
  return polylines;
}

/** A dark-pixel mask: `dark[y * width + x]` is true for ink. */
export type InkMask = {width: number; height: number; dark: ArrayLike<boolean | number>};

/** The mask the native image module sends: one '1' or '0' per pixel, row after row. */
export function maskFromRows(width: number, height: number, rows: string): InkMask {
  if (rows.length !== width * height) {
    throw new Error(`mask: ${rows.length} pixels for ${width} x ${height}`);
  }
  return {width, height, dark: Array.from(rows, c => c === '1')};
}

/**
 * The outlines of the mask's dark regions, holes included, along pixel edges: each dark pixel's
 * side that faces light (or the border) is one directed edge, clockwise round the ink, and the
 * edges are chained into closed loops. A loop shorter than MIN_TRACE_LENGTH is noise.
 */
export function traceMask(mask: InkMask): Polyline[] {
  const {width, height, dark} = mask;
  const isDark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && Boolean(dark[y * width + x]);
  const key = (x: number, y: number) => y * (width + 1) + x;
  /** Outgoing edges by start corner: the end corner's key. */
  const outgoing = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const from = key(x0, y0);
    const list = outgoing.get(from);
    if (list) {
      list.push(key(x1, y1));
    } else {
      outgoing.set(from, [key(x1, y1)]);
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isDark(x, y)) {
        continue;
      }
      if (!isDark(x, y - 1)) add(x, y, x + 1, y);
      if (!isDark(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!isDark(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!isDark(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const corner = (k: number): Point => ({x: k % (width + 1), y: Math.floor(k / (width + 1))});
  const loops: Polyline[] = [];
  for (const [first, ends] of outgoing) {
    while (ends.length > 0) {
      const loop: Polyline = [corner(first)];
      let at = ends.pop() as number;
      while (at !== first) {
        loop.push(corner(at));
        const next = outgoing.get(at);
        if (!next || next.length === 0) {
          break;
        }
        at = next.pop() as number;
      }
      loop.push(corner(first));
      if (loop.length - 1 >= MIN_TRACE_LENGTH) {
        loops.push(loop);
      }
    }
  }
  return loops;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker: the fewest points within `tolerance` of the line; the ends always stay. */
export function simplify(line: Polyline, tolerance: number): Polyline {
  // Two points or fewer are already the fewest.
  if (line.length <= 2) {
    return line;
  }
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;
  const spans: [number, number][] = [[0, line.length - 1]];
  // A closed loop starts and ends on one point: split it at its farthest point first.
  const closed = line[0].x === line[line.length - 1].x && line[0].y === line[line.length - 1].y;
  if (closed) {
    let far = 1;
    let best = -1;
    for (let i = 1; i < line.length - 1; i += 1) {
      const d = Math.hypot(line[i].x - line[0].x, line[i].y - line[0].y);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    keep[far] = true;
    spans.splice(0, 1, [0, far], [far, line.length - 1]);
  }
  while (spans.length > 0) {
    const [from, to] = spans.pop() as [number, number];
    let index = -1;
    let best = tolerance;
    for (let i = from + 1; i < to; i += 1) {
      const d = distanceToSegment(line[i], line[from], line[to]);
      if (d > best) {
        best = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = true;
      spans.push([from, index], [index, to]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

function length(line: Polyline): number {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  }
  return total;
}

/**
 * The polylines scaled, keeping proportions, so the drawing's bounding box is `width` wide, or
 * `maxHeight` tall when it is taller, with its top-left corner at (0, 0). Empty stays empty.
 */
export function fitPolylines(lines: Polyline[], width: number, maxHeight: number): Polyline[] {
  const points = lines.flat();
  if (points.length === 0) {
    return [];
  }
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  const boxWidth = Math.max(...xs) - left;
  const boxHeight = Math.max(...ys) - top;
  if (boxWidth <= 0 && boxHeight <= 0) {
    return [];
  }
  const scale = Math.min(
    boxWidth > 0 ? width / boxWidth : Infinity,
    boxHeight > 0 ? maxHeight / boxHeight : Infinity,
  );
  return lines.map(line => line.map(p => ({x: (p.x - left) * scale, y: (p.y - top) * scale})));
}

/**
 * The strokes a sticker is written with: simplified, coarser and coarser, until they hold at most
 * MAX_STICKER_POINTS points; then the longest MAX_STICKER_STROKES that still fit. Points are
 * rounded to whole pixels, and repeats are dropped.
 */
export function strokeBudget(
  lines: Polyline[],
  maxPoints = MAX_STICKER_POINTS,
  maxStrokes = MAX_STICKER_STROKES,
): Polyline[] {
  let tolerance = FIRST_TOLERANCE;
  let simplified = lines.map(line => simplify(line, tolerance));
  const count = (set: Polyline[]) => set.reduce((n, line) => n + line.length, 0);
  while (count(simplified) > maxPoints && tolerance < MAX_TOLERANCE) {
    tolerance *= 2;
    simplified = lines.map(line => simplify(line, tolerance));
  }
  const rounded = simplified
    .map(line =>
      line
        .map(p => ({x: Math.round(p.x), y: Math.round(p.y)}))
        .filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y),
    )
    .filter(line => line.length > 1)
    .sort((a, b) => length(b) - length(a));
  const kept: Polyline[] = [];
  let points = 0;
  for (const line of rounded) {
    if (kept.length >= maxStrokes) {
      break;
    }
    if (points + line.length <= maxPoints) {
      kept.push(line);
      points += line.length;
    }
  }
  return kept;
}
