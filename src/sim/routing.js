// src/sim/routing.js
//
// Route planning for tenants: "how do I get from here to there?"
//
// The tower is turned into a small graph:
//   - a NODE is "standing at stairs/elevator T on floor F"
//   - a WALK EDGE joins two nodes on the same floor if they are on the same
//     run of connected floor (cost = distance / walking speed)
//   - a STAIRS EDGE joins the same stairs on adjacent floors
//     (cost = time to climb one floor)
//   - an ELEVATOR EDGE joins every stop of a shaft
//     (cost = typical wait + 1.5 s per person already in line + ride time)
// Dijkstra's algorithm then finds the cheapest path. Because the elevator
// cost includes the CURRENT line length, a busy shaft looks more expensive
// and tenants naturally spread out, or take the stairs for short hops.
//
// The answer is a list of legs the tenant then follows:
//   { type: 'walk',     floor, from, to }
//   { type: 'stairs',   id, x, fromFloor, toFloor }
//   { type: 'elevator', shaftId, x, fromFloor, toFloor }
// Positions are in cell units (1 = one grid cell, can be fractional).

import { getReach } from './tower.js';
import { queueLength } from './elevators.js';

// The static part of the graph only changes when the tower changes.
function getGraph(game, config) {
  const tower = game.tower;
  if (tower._routeGraph && tower._routeGraph.version === tower.version) return tower._routeGraph;
  const reach = getReach(tower, config);

  const nodes = [];
  const byFloor = new Map(); // floor -> [node index]
  const byTransport = new Map(); // transport id -> [node index]
  const lookup = new Map(); // "transportId:floor" -> node index
  const addNode = (t, floor) => {
    const run = reach.runAt(floor, Math.floor(t.x));
    if (run === undefined) return;
    const index = nodes.length;
    nodes.push({ tid: t.id, kind: t.kind, floor, x: t.x, run });
    lookup.set(`${t.id}:${floor}`, index);
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor).push(index);
    if (!byTransport.has(t.id)) byTransport.set(t.id, []);
    byTransport.get(t.id).push(index);
  };

  for (const f of tower.facilities.values()) {
    const kind = config.facilities[f.type].transport;
    if (!kind) continue;
    const t = { id: f.id, kind, x: f.cell + f.width / 2 };
    if (kind === 'stairs') {
      // stairs on floors b..t join floors b-1 .. t
      for (let fl = f.floor - 1; fl < f.floor + f.height; fl++) addNode(t, fl);
    } else {
      for (let fl = f.floor; fl < f.floor + f.height; fl++) addNode(t, fl);
    }
  }
  tower._routeGraph = { version: tower.version, nodes, byFloor, byTransport, lookup, reach };
  return tower._routeGraph;
}

// Tiny binary min-heap of [cost, nodeIndex].
class Heap {
  constructor() {
    this.a = [];
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

// from / to: { floor, x }. Returns a list of legs, or null if there is no way.
export function planRoute(game, config, from, to) {
  const tc = config.tenants;
  const walk = tc.walkSpeedCellsPerSec;
  const rt = tc.routing;
  const graph = getGraph(game, config);
  const { nodes, byFloor, byTransport, lookup, reach } = graph;

  const startRun = reach.runAt(from.floor, Math.floor(from.x));
  const goalRun = reach.runAt(to.floor, Math.floor(to.x));
  if (startRun === undefined || goalRun === undefined) return null;
  if (from.floor === to.floor && startRun === goalRun) {
    return [{ type: 'walk', floor: from.floor, from: from.x, to: to.x }];
  }

  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-2); // -1 = came from the start
  const heap = new Heap();
  const relax = (index, cost, from2) => {
    if (cost < dist[index]) {
      dist[index] = cost;
      prev[index] = from2;
      heap.push([cost, index]);
    }
  };

  for (const i of byFloor.get(from.floor) ?? []) {
    if (nodes[i].run === startRun) relax(i, Math.abs(nodes[i].x - from.x) / walk, -1);
  }

  let goalCost = Infinity;
  let goalFrom = -1;
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    if (d >= goalCost) break;
    const n = nodes[i];

    if (n.floor === to.floor && n.run === goalRun) {
      const c = d + Math.abs(n.x - to.x) / walk;
      if (c < goalCost) {
        goalCost = c;
        goalFrom = i;
      }
    }
    for (const j of byFloor.get(n.floor) ?? []) {
      const m = nodes[j];
      if (j !== i && m.run === n.run) relax(j, d + Math.abs(m.x - n.x) / walk, i);
    }
    if (n.kind === 'stairs') {
      for (const g of [n.floor - 1, n.floor + 1]) {
        const j = lookup.get(`${n.tid}:${g}`);
        if (j !== undefined) relax(j, d + tc.stairSecPerFloor, i);
      }
    } else {
      const line = queueLength(game, n.tid, n.floor);
      const wait = rt.elevatorBaseWaitSec + rt.elevatorPerWaiterSec * line;
      for (const j of byTransport.get(n.tid)) {
        // every other stop of this shaft
        if (j === i) continue;
        relax(j, d + wait + rt.elevatorRideSecPerFloor * Math.abs(nodes[j].floor - n.floor), i);
      }
    }
  }
  if (goalFrom < 0) return null;

  // Walk the chain of predecessors back to the start.
  const path = [];
  for (let i = goalFrom; i >= 0; i = prev[i]) path.push(i);
  path.reverse();

  const legs = [];
  const walkLeg = (floor, a, b) => {
    if (Math.abs(a - b) > 0.02) legs.push({ type: 'walk', floor, from: a, to: b });
  };
  let cur = { floor: from.floor, x: from.x };
  for (const i of path) {
    const n = nodes[i];
    if (n.floor === cur.floor && cur.tid === undefined) {
      walkLeg(n.floor, cur.x, n.x);
    } else if (cur.tid === n.tid && cur.floor !== n.floor) {
      legs.push(
        n.kind === 'stairs'
          ? { type: 'stairs', id: n.tid, x: n.x, fromFloor: cur.floor, toFloor: n.floor }
          : { type: 'elevator', shaftId: n.tid, x: n.x, fromFloor: cur.floor, toFloor: n.floor },
      );
    } else {
      walkLeg(n.floor, cur.x, n.x);
    }
    cur = { floor: n.floor, x: n.x, tid: n.tid };
  }
  walkLeg(cur.floor, cur.x, to.x);
  return legs;
}
