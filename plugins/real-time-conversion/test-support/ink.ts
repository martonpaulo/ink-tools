/** Synthetic strokes for the word rule and the shape rules: no real handwriting. */
import type {InkStroke, Point} from '../src/words';

let next = 0;

/** A stroke as a zigzag inside its box: a letter-like shape with no self-crossing. */
export function stroke(left: number, top: number, width: number, height: number): InkStroke {
  const points: Point[] = [];
  for (let i = 0; i <= 4; i += 1) {
    points.push({x: left + (width * i) / 4, y: i % 2 ? top : top + height});
  }
  next += 1;
  return {
    id: `s${next}`,
    rect: {left, top, right: left + width, bottom: top + height},
    points,
  };
}

/** A letter on a line whose band runs from y 100 to 140 (letter height 40). */
export const letter = (left: number, width = 20) => stroke(left, 100, width, 40);

/** An accent over the line: short, above the band. */
export const accent = (left: number) => stroke(left, 80, 10, 10);

/** A spiral scribble: many self-crossings. */
export function scribble(left: number, top: number): InkStroke {
  const points: Point[] = [];
  for (let i = 0; i < 120; i += 1) {
    points.push({x: left + 20 + 20 * Math.cos(i), y: top + 20 + 20 * Math.sin(i * 1.3)});
  }
  next += 1;
  return {id: `s${next}`, rect: {left, top, right: left + 40, bottom: top + 40}, points};
}
