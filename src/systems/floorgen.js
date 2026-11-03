// PLACEHOLDER (owner: agent D) — Isaac-style floors. Contract: docs/REDESIGN.md §7.
export function generateFloor(rng, stage = 0) {
  const rooms = new Map();
  rooms.set(0, { id: 0, gx: 0, gy: 0, type: 'start', doors: { n: 1, e: null, s: null, w: null }, seed: 1, visited: true, cleared: true, known: true });
  rooms.set(1, { id: 1, gx: 0, gy: -1, type: 'boss', doors: { n: null, e: null, s: 0, w: null }, seed: 2, visited: false, cleared: false, known: true });
  return { stage, rooms, startId: 0, bossId: 1 };
}
export function encounterFor() { return { waves: [[{ id: 'shroomling', n: 3 }]], reward: null }; }
