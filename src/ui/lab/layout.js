// Research tree layout for the lab computer (src/ui/LabTree.js). Pure data in,
// world-space boxes and orthogonal wire paths out (no DOM), so it can be cached
// and unit-tested in node.
//
// Sections (= research branches) are stacked top to bottom as full-width bands,
// in BRANCHES order. Inside a band, nodes flow left to right by requirement
// depth (column = 1 + the deepest prerequisite IN THE SAME SECTION) and sit on
// an integer row grid packed like a tidy tree:
//   - every node's "primary" parent is its deepest in-section prerequisite, so a
//     primary wire always spans exactly one column;
//   - a parent's first child sits on the parent's row (a straight wire), the
//     others stack below it and hang off one vertical bus in the gutter;
//   - sibling / root subtrees are packed by column contours (Reingold-Tilford
//     style) so short subtrees tuck under long ones; a parent's bus reserves its
//     gutter rows, so two buses never share a stretch of gutter.
// Extra in-section prerequisites ("links") are routed through the gutters and
// the gaps between rows, which never contain nodes (crossings stay at right
// angles). Prerequisites from OTHER sections are not wired across the map: the
// node carries a small "port" tag naming them (click it to jump).
//
//   const L = layoutTree(BRANCHES, RESEARCH);
//   L.sections[i] = { b, id, i, y0, y1, h, top, cols, rows, nodes: [N], grid: Map('c,r' -> N) }
//   L.nodes[k]    = { id, d, S, col, row, x, y, w, h, cx, cy, req: [id], parents: [N], kids: [N], ext: [id] }
//   L.edges[k]    = { a: N, b: N, kind: 'tree' | 'link', pts: [[x, y], ...] }   (orthogonal polyline)
//   L.W, L.H, L.byId (Map), L.hit(wx, wy) -> N | null, L.sectionAt(wy) -> S | null

export const GEO = {
  NW: 168, // node box
  NH: 46,
  CW: 216, // column pitch (box + gutter)
  RH: 66, // row pitch (box + row gap)
  PADL: 28, // band padding left of column 0
  PADR: 40,
  HEAD: 44, // band header (section title line)
  PADT: 18, // header -> first row (room for port tags above row 0)
  PADB: 24, // last row -> band bottom
};

const key = (c, r) => c + ',' + r;

/**
 * @param {Array<{id:string,name?:string}>} branches
 * @param {Array<{id:string,branch:string,req?:string[]}>} research
 * @param {Partial<typeof GEO>} [geo]
 */
export function layoutTree(branches, research, geo = {}) {
  const G = { ...GEO, ...geo };
  const all = new Map();
  for (const d of research || []) if (d && d.id && !all.has(d.id)) all.set(d.id, d);
  const sections = [];
  const nodes = [];
  const byId = new Map();
  const bySec = new Map();
  for (const b of branches || []) if (b && b.id && !bySec.has(b.id)) bySec.set(b.id, []);
  for (const d of all.values()) bySec.get(d.branch)?.push(d);

  let y = 0;
  let maxCols = 1;
  for (const b of branches || []) {
    const list = bySec.get(b.id);
    if (!list || !list.length || sections.some((s) => s.id === b.id)) continue;
    const S = { b, id: b.id, i: sections.length, nodes: [], grid: new Map(), links: [] };
    // ---- nodes + in-section graph
    const local = new Map();
    for (const d of list) {
      const N = { id: d.id, d, S, req: (d.req || []).filter((q) => all.has(q)), parents: [], kids: [], ext: [], col: 0, row: 0, layer: -1, prim: null, tkids: [] };
      local.set(d.id, N);
      S.nodes.push(N);
    }
    for (const N of S.nodes) {
      for (const q of N.req) {
        const P = local.get(q);
        if (P && P !== N) N.parents.push(P);
        else if (!P) N.ext.push(q);
      }
    }
    // depth (cycle-safe)
    const depth = (N, seen) => {
      if (N.layer >= 0) return N.layer;
      if (seen.has(N)) return 0;
      seen.add(N);
      let L = 0;
      for (const P of N.parents) L = Math.max(L, depth(P, seen) + 1);
      seen.delete(N);
      N.layer = L;
      return L;
    };
    for (const N of S.nodes) depth(N, new Set());
    // primary parent = the deepest in-section prerequisite (first one on ties)
    for (const N of S.nodes) {
      let best = null;
      for (const P of N.parents) if (P.layer === N.layer - 1 && (!best || P.layer > best.layer)) best = P;
      N.prim = best;
      if (best) best.tkids.push(N);
    }
    const roots = S.nodes.filter((N) => !N.prim);
    const leaves = (N) => (N._lv ??= N.tkids.length ? N.tkids.reduce((a, K) => a + leaves(K), 0) : 1);
    // ---- contour packing. A contour maps a half-column key (2c = node column,
    // 2c+1 = the gutter right of it) to [minRow, maxRow] relative to the subtree root.
    // merge(): stack the subtrees `order` (contours in `subs`) under / beside C0.
    const merge = (C0, order, subs, first) => {
      const C = new Map([...C0].map(([k, v]) => [k, v.slice()]));
      const rels = new Map();
      let prev = -1, last = 0;
      order.forEach((K, i) => {
        const sub = subs.get(K);
        let o = i === 0 ? first : prev + 1;
        for (const [k, [a]] of sub) { const c = C.get(k); if (c) o = Math.max(o, c[1] - a + 1); }
        rels.set(K, o);
        prev = last = o;
        for (const [k, [a, z]] of sub) {
          const c = C.get(k);
          if (c) { c[0] = Math.min(c[0], a + o); c[1] = Math.max(c[1], z + o); } else C.set(k, [a + o, z + o]);
        }
      });
      let h = 0;
      for (const v of C.values()) h = Math.max(h, v[1]);
      return { C, rels, last, h };
    };
    const pack = (N) => {
      const subs = new Map(N.tkids.map((K) => [K, pack(K)]));
      const base = new Map([[2 * N.layer, [0, 0]]]);
      // kid order: as written, small subtrees first or big ones first: whichever packs lowest
      let best = null;
      if (N.tkids.length) {
        const cands = [N.tkids];
        if (N.tkids.length > 1) {
          const idx = new Map(N.tkids.map((K, i) => [K, i]));
          cands.push(N.tkids.slice().sort((a, b) => leaves(a) - leaves(b) || idx.get(a) - idx.get(b)));
          cands.push(N.tkids.slice().sort((a, b) => leaves(b) - leaves(a) || idx.get(a) - idx.get(b)));
        }
        for (const order of cands) {
          const m = merge(base, order, subs, 0);
          if (!best || m.h < best.h) best = { ...m, order };
        }
        N.tkids = best.order;
        for (const K of N.tkids) K.rel = best.rels.get(K);
      }
      const C = best ? best.C : base;
      // the bus down the gutter right of N (only when it fans out)
      if (N.tkids.length > 1) {
        const g = 2 * N.layer + 1;
        const c = C.get(g);
        if (c) { c[0] = Math.min(c[0], 0); c[1] = Math.max(c[1], best.last); } else C.set(g, [0, best.last]);
      }
      return C;
    };
    // roots in the order written; deeper columns tuck under shorter neighbours
    const rootSubs = new Map(roots.map((R) => [R, pack(R)]));
    const top = merge(new Map(), roots, rootSubs, 0);
    for (const R of roots) R.rel = top.rels.get(R);
    const place = (N, row) => {
      N.row = row;
      N.col = N.layer;
      for (const K of N.tkids) place(K, row + K.rel);
    };
    for (const R of roots) place(R, R.rel);
    // any collision left (should not happen): nudge down
    for (const N of S.nodes) {
      while (S.grid.has(key(N.col, N.row))) N.row++;
      S.grid.set(key(N.col, N.row), N);
    }
    S.cols = Math.max(1, ...S.nodes.map((N) => N.col + 1));
    S.rows = Math.max(1, ...S.nodes.map((N) => N.row + 1));
    maxCols = Math.max(maxCols, S.cols);
    // ---- geometry
    S.y0 = y;
    S.top = y + G.HEAD + G.PADT; // y of row 0
    S.h = G.HEAD + G.PADT + S.rows * G.RH - (G.RH - G.NH) + G.PADB;
    S.y1 = y + S.h;
    y = S.y1;
    for (const N of S.nodes) {
      N.w = G.NW;
      N.h = G.NH;
      N.x = G.PADL + N.col * G.CW;
      N.y = S.top + N.row * G.RH;
      N.cx = N.x + G.NW / 2;
      N.cy = N.y + G.NH / 2;
      nodes.push(N);
      byId.set(N.id, N);
    }
    sections.push(S);
  }
  const W = G.PADL + maxCols * G.CW - (G.CW - G.NW) + G.PADR;
  for (const S of sections) { S.x0 = 0; S.x1 = W; }
  for (const N of nodes) N.kids = [];
  for (const N of nodes) for (const q of N.req) { const P = byId.get(q); if (P) P.kids.push(N); }

  // ---- wires
  const edges = [];
  const GUT = G.CW - G.NW;
  const gutX = (c) => G.PADL + c * G.CW + G.NW; // left edge of the gutter right of column c
  const rowY = (S, r) => S.top + r * G.RH; // top of row r
  // primary trees: straight line to the first child, a bus for the rest
  for (const N of nodes) {
    if (!N.tkids.length) continue;
    const bx = gutX(N.col) + Math.round(GUT / 2);
    for (const K of N.tkids) {
      const pts = K.row === N.row
        ? [[N.x + N.w, N.cy], [K.x, K.cy]]
        : [[N.x + N.w, N.cy], [bx, N.cy], [bx, K.cy], [K.x, K.cy]];
      edges.push({ a: N, b: K, kind: 'tree', pts });
    }
  }
  // links: extra in-section prerequisites, through gutters + row gaps, one track each
  const tracks = new Map();
  const track = (k) => { const n = tracks.get(k) || 0; tracks.set(k, n + 1); return n; };
  const OFF = [-9, 9, -16, 16, -4, 4];
  for (const S of sections) {
    for (const K of S.nodes) {
      for (const P of K.parents) {
        if (P === K.prim) continue;
        const pts = [];
        // free straight run on the same row?
        let clear = P.row === K.row;
        for (let c = P.col + 1; clear && c < K.col; c++) if (S.grid.has(key(c, P.row))) clear = false;
        if (clear) {
          pts.push([P.x + P.w, P.cy], [K.x, K.cy]);
        } else {
          const t1 = OFF[track('g' + S.i + ':' + P.col) % OFF.length];
          const gx1 = gutX(P.col) + Math.round(GUT / 2) + t1;
          if (K.col === P.col + 1) {
            pts.push([P.x + P.w, P.cy], [gx1, P.cy], [gx1, K.cy], [K.x, K.cy]);
          } else {
            // horizontal run in the row gap next to the child's row (above it when coming from above)
            const down = K.row > P.row || (K.row === P.row);
            const gapR = down ? K.row - 1 : K.row; // gap below row gapR
            const gy0 = gapR < 0 ? S.top - Math.round(G.PADT / 2) : rowY(S, gapR) + G.NH + Math.round((G.RH - G.NH) / 2);
            const ty = [0, -4, 4, -7, 7][track('r' + S.i + ':' + gapR) % 5];
            const gy = gy0 + ty;
            const t2 = OFF[track('g' + S.i + ':' + (K.col - 1)) % OFF.length];
            const gx2 = gutX(K.col - 1) + Math.round(GUT / 2) + t2;
            pts.push([P.x + P.w, P.cy], [gx1, P.cy], [gx1, gy], [gx2, gy], [gx2, K.cy], [K.x, K.cy]);
          }
        }
        edges.push({ a: P, b: K, kind: 'link', pts });
      }
    }
  }
  // clean the helper fields that would keep the graph alive in odd ways
  for (const N of nodes) { delete N.rel; delete N._lv; }

  const H = y;
  const sectionAt = (wy) => {
    let lo = 0, hi = sections.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const S = sections[m];
      if (wy < S.y0) hi = m - 1; else if (wy >= S.y1) lo = m + 1; else return S;
    }
    return null;
  };
  const hit = (wx, wy, pad = 0) => {
    const S = sectionAt(wy);
    if (!S) return null;
    const c = Math.floor((wx - G.PADL + (G.CW - G.NW) / 2) / G.CW);
    const r = Math.floor((wy - S.top + (G.RH - G.NH) / 2) / G.RH);
    const N = S.grid.get(key(c, r));
    if (!N) return null;
    if (wx < N.x - pad || wx > N.x + N.w + pad || wy < N.y - pad || wy > N.y + N.h + pad) return null;
    return N;
  };
  return { G, sections, nodes, edges, byId, W, H, hit, sectionAt };
}
