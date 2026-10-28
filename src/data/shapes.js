// Backpack polyomino shapes (cells as [x, y]).
export const SHAPES = {
  o1: [[0, 0]],
  i2: [[0, 0], [1, 0]],
  v2: [[0, 0], [0, 1]],
  i3: [[0, 0], [1, 0], [2, 0]],
  v3: [[0, 0], [0, 1], [0, 2]],
  o4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  l3: [[0, 0], [0, 1], [1, 1]],
  j3: [[1, 0], [0, 1], [1, 1]],
  l4: [[0, 0], [0, 1], [0, 2], [1, 2]],
  t4: [[0, 0], [1, 0], [2, 0], [1, 1]],
  s4: [[1, 0], [2, 0], [0, 1], [1, 1]],
  pick: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]], // T with long handle
  o6: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]],
};

/** Rotate a cell list 90° clockwise `r` times and normalise to origin. */
export function rotateCells(cells, r = 0) {
  let out = cells.map(([x, y]) => [x, y]);
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) out = out.map(([x, y]) => [-y, x]);
  const minX = Math.min(...out.map((c) => c[0])), minY = Math.min(...out.map((c) => c[1]));
  return out.map(([x, y]) => [x - minX, y - minY]);
}
export function cellsSize(cells) {
  return { w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 };
}
