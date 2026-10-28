// Region map: 7 floors of rooms joined by tunnels (Slay-the-Spire style DAG, no crossing edges).
import { REGIONS } from '../data/regions.js';

export const FLOORS = 7;

export function generateMap(rng, regionIdx) {
  const region = REGIONS[regionIdx];
  const nodes = [];
  const rows = [];
  let id = 0;
  for (let r = 0; r < FLOORS; r++) {
    const n = r === 0 || r === FLOORS - 1 ? 1 : rng.int(3, 4);
    const row = [];
    for (let c = 0; c < n; c++) {
      const x = n === 1 ? 0.5 : 0.14 + (c / (n - 1)) * 0.72 + rng.float(-0.05, 0.05);
      const node = { id: id++, row: r, col: c, x, y: r / (FLOORS - 1) + (r > 0 && r < FLOORS - 1 ? rng.float(-0.025, 0.025) : 0), type: 'monster', out: [], in: [], done: false };
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
    if (ea.row !== a.row) return false;
    return (ea.x < a.x && eb.x > b.x) || (ea.x > a.x && eb.x < b.x);
  });
  for (let r = 0; r < FLOORS - 1; r++) {
    const A = rows[r], B = rows[r + 1];
    // primary: proportional mapping (monotonic → no crossings)
    A.forEach((a, i) => {
      const j = A.length === 1 ? null : Math.round((i / (A.length - 1)) * (B.length - 1));
      if (j === null) B.forEach((b) => link(a, b));
      else link(a, B[j]);
    });
    // ensure every B has an incoming edge
    B.forEach((b, j) => {
      if (b.in.length) return;
      const a = A.reduce((best, x) => (Math.abs(x.x - b.x) < Math.abs(best.x - b.x) ? x : best), A[0]);
      if (!crosses(a, b)) link(a, b); else link(A[Math.min(A.length - 1, Math.round((j / Math.max(1, B.length - 1)) * (A.length - 1)))], b);
    });
    // extra branches
    A.forEach((a) => {
      if (rng.chance(0.55)) {
        const cand = B.filter((b) => !a.out.includes(b.id) && Math.abs(b.x - a.x) < 0.42 && !crosses(a, b));
        if (cand.length) link(a, rng.pick(cand));
      }
    });
  }

  // ---- room types
  rows[0][0].type = 'start';
  rows[FLOORS - 1][0].type = 'boss';
  const r1 = rng.shuffle(['mining', 'monster', rng.pick(['mining', 'event']), 'monster']);
  rows[1].forEach((n, i) => (n.type = r1[i]));
  const pool = (r) => [
    ['monster', 30], ['mining', 22], ['event', 16], ['treasure', 10], ['merchant', 8],
    ['elite', r >= 3 ? 12 : r === 2 ? 4 : 0], ['camp', r === 4 ? 6 : 0],
  ];
  for (let r = 2; r <= 4; r++) for (const n of rows[r]) n.type = rng.weighted(pool(r).filter((p) => p[1] > 0));
  rows[5].forEach((n, i) => (n.type = i === 0 && rows[5].length > 2 ? rng.pick(['merchant', 'mining']) : 'camp'));
  // guarantees: one merchant, one treasure, one elite in rows 2–4
  const mid = [...rows[2], ...rows[3], ...rows[4]];
  for (const t of ['merchant', 'treasure', 'elite']) {
    if (!mid.some((n) => n.type === t)) {
      const c = mid.filter((n) => n.type === 'monster' || n.type === 'mining' || n.type === 'event').filter((n) => t !== 'elite' || n.row >= 3);
      if (c.length) rng.pick(c).type = t;
    }
  }
  // no merchant directly after merchant
  for (const e of edges) if (nodes[e.a].type === 'merchant' && nodes[e.b].type === 'merchant') nodes[e.b].type = 'treasure';

  // ---- tunnels
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    const dx = Math.abs(a.x - b.x);
    let t = rng.pick(region.tunnels);
    if (dx < 0.06 && region.tunnels.includes('elevator') && rng.chance(0.5)) t = 'elevator';
    if (dx < 0.06 && region.tunnels.includes('stairs') && rng.chance(0.5)) t = 'stairs';
    e.tunnel = t;
    e.sight = rng.chance(0.3) ? rng.pick(['glint', 'shadow', 'cart', 'note']) : null;
  }
  return { region: regionIdx, nodes, edges, rows, current: rows[0][0].id, visited: [rows[0][0].id] };
}

export const nodeOf = (map, id) => map.nodes[id];
export const edgeOf = (map, a, b) => map.edges.find((e) => e.a === a && e.b === b);
export function nextOptions(map) { return map.nodes[map.current].out.map((id) => map.nodes[id]); }
