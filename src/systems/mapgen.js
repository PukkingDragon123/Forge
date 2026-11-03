// Act map (docs/REDESIGN.md §5.2): a Slay-the-Spire style DAG drawn on the old map. Rows go from the
// landing (row 0) to the Herald's lair (last row). 2–4 nodes per row, no crossing paths, at most 3
// ways on from any node — in first person they are the left / forward / right tunnels, so
// `node.out` is sorted by x (left → right).
import { ACTS } from '../data/regions.js';

/** Legacy export (old crossroads scene). */
export const FLOORS = 10;
export const rowsFor = (act) => (ACTS[act] && ACTS[act].rows) || 10;

export function generateMap(rng, act = 0) {
  const ROWS = rowsFor(act);
  const nodes = [];
  const rows = [];
  let id = 0;
  for (let r = 0; r < ROWS; r++) {
    const n = r === 0 || r === ROWS - 1 ? 1 : r === 1 || r === ROWS - 2 ? rng.int(2, 3) : rng.int(2, 4);
    const row = [];
    for (let c = 0; c < n; c++) {
      const x = n === 1 ? 0.5 : 0.16 + (c / (n - 1)) * 0.68 + rng.float(-0.045, 0.045);
      const node = { id: id++, row: r, col: c, x, y: r / (ROWS - 1) + (r > 0 && r < ROWS - 1 ? rng.float(-0.02, 0.02) : 0), type: 'monster', out: [], in: [], done: false, seed: rng.int(1, 1e9) };
      row.push(node); nodes.push(node);
    }
    rows.push(row);
  }
  const edges = [];
  const link = (a, b) => {
    if (a.out.includes(b.id)) return;
    a.out.push(b.id); b.in.push(a.id);
    edges.push({ a: a.id, b: b.id });
  };
  const crosses = (a, b) => edges.some((e) => {
    const ea = nodes[e.a], eb = nodes[e.b];
    if (ea.row !== a.row || ea === a || eb === b) return false;
    return (ea.x < a.x && eb.x > b.x) || (ea.x > a.x && eb.x < b.x);
  });
  for (let r = 0; r < ROWS - 1; r++) {
    const A = rows[r], B = rows[r + 1];
    if (A.length === 1) { B.forEach((b) => link(A[0], b)); continue; }
    if (B.length === 1) { A.forEach((a) => link(a, B[0])); continue; }
    // monotonic proportional mapping → no crossings
    A.forEach((a, i) => link(a, B[Math.round((i / (A.length - 1)) * (B.length - 1))]));
    B.forEach((b, j) => {
      if (b.in.length) return;
      const i = Math.round((j / (B.length - 1)) * (A.length - 1));
      const cand = [A[i], A[Math.max(0, i - 1)], A[Math.min(A.length - 1, i + 1)]].find((a) => !crosses(a, b)) || A[i];
      link(cand, b);
    });
    // extra branches (more choice), never crossing, never more than 3 ways on
    A.forEach((a) => {
      if (a.out.length >= 3 || !rng.chance(0.5)) return;
      const cand = B.filter((b) => !a.out.includes(b.id) && Math.abs(b.x - a.x) < 0.4 && !crosses(a, b));
      if (cand.length) link(a, rng.pick(cand));
    });
  }
  for (const n of nodes) n.out.sort((p, q) => nodes[p].x - nodes[q].x);

  // ---- encounter types
  rows[0][0].type = 'start';
  rows[ROWS - 1][0].type = 'boss';
  for (const n of rows[ROWS - 2]) n.type = 'camp';
  const r1 = rng.shuffle(['monster', 'vein', 'monster', 'vein']);
  rows[1].forEach((n, i) => (n.type = r1[i % r1.length]));
  const weights = (r) => [
    ['monster', 42], ['vein', 18], ['event', 16], ['elite', r >= 3 ? 10 : 0], ['treasure', 6], ['camp', r >= 4 ? 8 : 0],
  ].filter((w) => w[1] > 0);
  for (let r = 2; r <= ROWS - 3; r++) for (const n of rows[r]) n.type = rng.weighted(weights(r));
  // the short last act: no camps mid-way besides the one before Medusa
  const mid = nodes.filter((n) => n.row >= 2 && n.row <= ROWS - 3);
  const need = (type, count, pred = () => true) => {
    while (mid.filter((n) => n.type === type).length < count) {
      const c = mid.filter((n) => n.type === 'monster' && pred(n));
      if (!c.length) break;
      rng.pick(c).type = type;
    }
  };
  need('vein', act === 3 ? 1 : 2);
  need('treasure', 1);
  need('event', act === 3 ? 1 : 2);
  if (ROWS >= 8) need('camp', 1, (n) => n.row >= 4 && n.row <= ROWS - 4);
  if (ROWS >= 8) need('elite', 1, (n) => n.row >= 3);
  // no two camps or two elites in a row on the same path
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    if (a.type === b.type && (b.type === 'camp' || b.type === 'elite') && b.row < ROWS - 2) b.type = 'monster';
  }
  // monsters stay the most common type
  const count = (t) => nodes.filter((n) => n.type === t).length;
  for (const t of ['vein', 'event']) while (count(t) >= count('monster') && count(t) > 1) {
    const c = mid.filter((n) => n.type === t);
    if (!c.length) break;
    rng.pick(c).type = 'monster';
  }
  return { act, region: act, nodes, edges, rows, current: rows[0][0].id, visited: [rows[0][0].id] };
}

export const nodeOf = (map, id) => map.nodes[id];
export const edgeOf = (map, a, b) => map.edges.find((e) => e.a === a && e.b === b);
/** The ways on from the current node, left → right. */
export function nextOptions(map) { return map.nodes[map.current].out.map((id) => map.nodes[id]); }
/** For first person: the next nodes as tunnel directions (-1 left, 0 forward, 1 right). */
export function nextExits(map) {
  const opts = nextOptions(map);
  const dirs = opts.length === 1 ? [0] : opts.length === 2 ? [-1, 1] : [-1, 0, 1];
  return opts.map((node, i) => ({ dir: dirs[i], node }));
}
/** Move the marker onto a node (call when you arrive there). */
export function arriveAt(map, id) {
  map.current = id;
  if (!map.visited.includes(id)) map.visited.push(id);
  return map.nodes[id];
}
