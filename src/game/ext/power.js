// [v26 power] The power grid. Every industrial machine needs power now.
//
// Sources: Solar Panel (day only, weaker in rain / snow / winter), Water Wheel (on a flowing
// river tile, output by current speed), Wind Turbine (game.wind), the coal Steam Generator
// (burns only when its grid runs short, pollutes) and Battery Banks (bank the surplus, spend
// it at night). Power Poles carry it: buildings within a pole's reach join that pole's
// network, poles link to poles, and power buildings that touch (or have one tile between
// them) are plugged into each other. Cables sag between poles and buildings; an overloaded
// grid sparks and its machines brown out (run slower); a machine with no power stops and a
// plug icon flashes over it.
//
//   game.power.supply() / .demand()      total power made / wanted right now (all grids)
//   game.power.powered(s)                0..1 for building s (0 = no power, < 1 = brownout)
//   game.power.status(s)                 'ok' | 'brown' | 'dark' | 'nogrid' | 'off'
//   game.power.info(s)                   its grid: { supply, demand, ratio, charge, cap, sources, consumers, ... }
//   game.power.output(s)                 what a source makes right now
//   game.power.open(s)                   the grid card (src/ui/IndustryUI.js)
//   game.power.flowAt(x, z)              { dir: [dx, dz], speed } | null: river current (game.world.riverAt)
// Consumers: def.ind.power (src/data/structuresIndustry.js) or def.power.use; they draw only
// while they want to run (game.industry.wants(s)). Sources / batteries / poles: def.pw
// (src/data/ext/power.js) + the generator (def.ind.kind 'power').
// State: game.state.power = { bat: { 'type@x,z': charge } }
import * as THREE from 'three';
import { KIND, WATER_Y } from '../../world/grid.js';
import { BIOME, RIVER } from '../../world/worldgen.js';
import { Badges } from '../industry/badges.js';

const POLE_TOP = 1.72;
const SOLAR_WEATHER = { clear: 1, heat: 1.05, wind: 0.95, fog: 0.5, rain: 0.35, storm: 0.2, snow: 0.3 };
const SOLAR_SEASON = { spring: 1, summer: 1.1, autumn: 0.85, winter: 0.6 };
const WIND_WEATHER = { clear: 1, heat: 0.7, wind: 1.7, fog: 0.6, rain: 1.15, storm: 1.9, snow: 1.2 };
const keyOf = (s) => `${s.type}@${s.x},${s.z}`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function install(game) {
  return new Power(game);
}

class Power {
  constructor(game) {
    this.game = game;
    this.nets = [];
    this.netOf = new Map(); // s -> net
    this.nodes = [];
    this.outs = new Map(); // s -> output now
    this.draws = new Map(); // s -> draw now
    this.badges = new Badges(game);
    this.group = new THREE.Group();
    this.group.name = 'powerCables';
    game.scene.add(this.group);
    this.cableMat = new THREE.LineBasicMaterial({ color: 0x241a1c });
    this.hotMat = new THREE.LineBasicMaterial({ color: 0x241a1c });
    this.cables = null; this.hotCables = null;
    this.sig = '';
    this.gridT = 0;
    this.time = 0;
    this.sparkT = 0;
    this.dirty = true;
    game.placeRules ||= {};
    game.placeRules.river = (type, x, z, t) => this.riverRule(type, x, z, t);
    game.on('built', (s) => { if (this.isNode(s)) this.dirty = true; });
    game.on('structureMoved', ({ s, from }) => this.onMoved(s, from));
    // tap a pole / source / battery: the grid card
    const ts = game.tapStructure.bind(game);
    game.tapStructure = (s) => (this.tap(s) ? true : ts(s));
  }

  get S() {
    const st = this.game.state;
    if (!st.power || typeof st.power !== 'object') st.power = {};
    st.power.bat ||= {};
    return st.power;
  }

  // ------------------------------------------------------------ node kinds
  use(s) { return s.def.ind?.power || s.def.power?.use || 0; }
  isSource(s) { const k = s.def.pw?.kind; return k === 'solar' || k === 'water' || k === 'wind' || s.def.ind?.kind === 'power'; }
  isBattery(s) { return s.def.pw?.kind === 'battery'; }
  isPole(s) { return s.def.pw?.kind === 'pole'; }
  isConsumer(s) { const k = s.def.ind?.kind; return this.use(s) > 0 && k !== 'belt' && k !== 'tree' && k !== 'power'; }
  isNode(s) { return !!s?.def && (this.isSource(s) || this.isBattery(s) || this.isPole(s) || this.isConsumer(s)); }
  rect(s) { const [w, d] = s.def.size || [1, 1]; return { x0: s.x, z0: s.z, x1: s.x + w, z1: s.z + d }; }
  center(s) { const [w, d] = s.def.size || [1, 1]; return { x: s.x + w / 2, z: s.z + d / 2 }; }
  baseY(s) { return this.game.structures.baseY(s); }
  // where a cable plugs in (world)
  plug(s, side = 0) {
    const c = this.center(s), y = this.baseY(s);
    if (this.isPole(s)) return { x: c.x + side * 0.24, y: y + POLE_TOP, z: c.z };
    const p = s.extraModel?.userData?.plug;
    if (p) return { x: c.x + p[0], y: y + p[1], z: c.z + p[2] };
    const [w] = s.def.size || [1, 1];
    return { x: c.x, y: y + (w > 1 ? 1.25 : 0.8), z: c.z };
  }

  // ------------------------------------------------------------ the grid (topology)
  rebuild() {
    const list = [];
    for (const s of this.game.structures.list) if (s.built && !s.removed && this.isNode(s)) list.push(s);
    this.nodes = list;
    const n = list.length;
    const parent = list.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    const links = [];
    const R = list.map((s) => this.rect(s));
    const gap = (a, b) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.z0 - b.z1, b.z0 - a.z1);
    const rectDist = (r, x, z) => Math.hypot(Math.max(0, r.x0 - x, x - r.x1), Math.max(0, r.z0 - z, z - r.z1));
    const nearestPole = new Map(); // node index -> [pole index, dist]
    for (let i = 0; i < n; i++) {
      const a = list[i];
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        const pa = this.isPole(a), pb = this.isPole(b);
        if (pa && pb) {
          const ca = this.center(a), cb = this.center(b);
          if (Math.hypot(ca.x - cb.x, ca.z - cb.z) <= Math.min(a.def.pw.link || 8, b.def.pw.link || 8) + 0.01) { join(i, j); links.push([a, b, 'pp']); }
        } else if (pa || pb) {
          const [p, q, qi, pi] = pa ? [a, b, j, i] : [b, a, i, j];
          const c = this.center(p);
          const d = rectDist(R[qi], c.x, c.z);
          if (d <= (p.def.pw.reach || 4) + 0.01) {
            join(i, j);
            const cur = nearestPole.get(qi);
            if (!cur || d < cur[1]) nearestPole.set(qi, [pi, d]);
          }
        } else {
          const g = gap(R[i], R[j]);
          if (g <= 1) { join(i, j); if (g === 1) links.push([a, b, 'nn']); }
        }
      }
    }
    for (const [qi, [pi]] of nearestPole) links.push([list[pi], list[qi], 'pn']);
    // networks
    const byRoot = new Map();
    this.netOf.clear();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let net = byRoot.get(r);
      if (!net) { net = { id: byRoot.size + 1, nodes: [], sources: [], gens: [], bats: [], poles: [], users: [], supply: 0, demand: 0, ratio: 0, charge: 0, cap: 0, over: false, live: false }; byRoot.set(r, net); }
      const s = list[i];
      net.nodes.push(s);
      if (this.isPole(s)) net.poles.push(s);
      else if (this.isBattery(s)) net.bats.push(s);
      else if (s.def.ind?.kind === 'power') net.gens.push(s);
      else if (this.isSource(s)) net.sources.push(s);
      else net.users.push(s);
      this.netOf.set(s, net);
    }
    // keep last frame's flow numbers for continuity (same id order is fine for a frame)
    this.nets = [...byRoot.values()];
    this.links = links;
    this.buildCables();
    this.dirty = false;
  }
  topoSig() {
    let s = '';
    for (const o of this.game.structures.list) if (o.built && !o.removed && this.isNode(o)) s += `${o.type[0]}${o.type.length}${o.x},${o.z};`;
    return s;
  }

  // sagging cables (1-pixel lines: they read as drawn wire at the pixel scale)
  buildCables() {
    for (const m of [this.cables, this.hotCables]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.cables = this.hotCables = null;
    const cold = [], hot = [];
    const seg = (arr, a, b) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const sag = Math.min(0.42, 0.05 * len + 0.04);
      const N = Math.max(4, Math.min(12, Math.ceil(len * 1.4)));
      let px = a.x, py = a.y, pz = a.z;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
        arr.push(px, py, pz, x, y, z);
        px = x; py = y; pz = z;
      }
    };
    for (const [a, b, kind] of this.links) {
      const net = this.netOf.get(a);
      const arr = net?.over ? hot : cold;
      if (kind === 'pp') { seg(arr, this.plug(a, -1), this.plug(b, -1)); seg(arr, this.plug(a, 1), this.plug(b, 1)); }
      else if (kind === 'pn') {
        const pa = this.center(a), pb = this.center(b);
        seg(arr, this.plug(a, pb.x >= pa.x ? 1 : -1), this.plug(b));
      } else seg(arr, this.plug(a), this.plug(b));
    }
    const mk = (arr, mat) => {
      if (!arr.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const m = new THREE.LineSegments(g, mat);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
      return m;
    };
    this.cables = mk(cold, this.cableMat);
    this.hotCables = mk(hot, this.hotMat);
    this.overSig = this.nets.map((n) => (n.over ? 1 : 0)).join('');
  }

  onMoved(s, from) {
    if (!this.isNode(s)) return;
    const S = this.S;
    const ok = `${s.type}@${from[0]},${from[1]}`, nk = keyOf(s);
    if (ok !== nk && S.bat[ok] != null) { S.bat[nk] = S.bat[ok]; delete S.bat[ok]; }
    this.dirty = true;
  }

  // ------------------------------------------------------------ sources
  sun() {
    const h = this.game.state.hour ?? 12;
    if (h < 6.5 || h > 19.8) return 0;
    return Math.max(0, Math.sin(((h - 6.5) / 13.3) * Math.PI)) ** 0.8;
  }
  weather() { return this.game.seasons?.weather || 'clear'; }
  season() { return this.game.seasons?.season || 'summer'; }
  solarK() { return this.sun() * (SOLAR_WEATHER[this.weather()] ?? 1) * (this.game.seasons ? SOLAR_SEASON[this.season()] ?? 1 : 1); }
  windK(s) {
    const w = clamp(this.game.wind ?? 1, 0.15, 2.5) * (WIND_WEATHER[this.weather()] ?? 1);
    const t = this.time * 0.13 + (s ? s.x * 0.37 + s.z * 0.11 : 0);
    const gust = 0.82 + 0.18 * Math.sin(t) * Math.sin(t * 2.3 + 1.1) + 0.12 * Math.sin(t * 5.1);
    return w * gust;
  }
  flowAt(x, z) {
    const w = this.game.world;
    if (typeof w?.riverAt === 'function') {
      try { const r = w.riverAt(x, z); if (r && r.speed > 0) return r; } catch { /* the world helper's */ }
    }
    const g = this.game.grid;
    if (!g.inb(x, z)) return null;
    const i = z * g.w + x;
    if (g.kind[i] !== KIND.WATER || g.biome?.[i] !== BIOME.RIVER) return null;
    // the river runs down the RIVER polyline (worldgen.js): the nearest segment's direction
    let best = null, bd = Infinity;
    for (let k = 0; k < RIVER.length - 1; k++) {
      const [ax, az] = RIVER[k], [bx, bz] = RIVER[k + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const t = clamp(((x + 0.5 - ax) * vx + (z + 0.5 - az) * vz) / L2, 0, 1);
      const d = Math.hypot(x + 0.5 - (ax + vx * t), z + 0.5 - (az + vz * t));
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { dir: [vx / L, vz / L], speed: clamp(0.75 - bd * 0.12, 0.35, 0.8) }; }
    }
    return best;
  }
  output(s) { return this.outs.get(s) || 0; }
  sourceOut(s, dt) {
    const pw = s.def.pw;
    if (!pw) return 0;
    if (pw.kind === 'solar') return pw.out * this.solarK();
    if (pw.kind === 'wind') return pw.out * this.windK(s);
    if (pw.kind === 'water') {
      const f = s._flow || (s._flow = this.flowAt(s.x, s.z)) || null;
      if (!f) return 0;
      const ice = this.game.seasons?.season === 'winter' ? ((this.game.seasons.temp ?? 0) < -4 ? 0 : 0.6) : 1;
      return (pw.base + pw.flow * f.speed) * ice;
    }
    void dt;
    return 0;
  }

  // ------------------------------------------------------------ the steam generator (coal from storage)
  genRec(s) { return this.game.industry?.rec?.(s) || (s._genRec ||= { h: {}, fuel: 0 }); }
  burn(s, need, sdt) {
    const r = this.genRec(s);
    if (r.off) { r.burning = false; r.why = 'off'; return 0; }
    const B = s.def.ind.burn || { coal: 30, wood: 18 };
    if (sdt > 0 && (r.fuel || 0) > 0 && r.burning) r.fuel = Math.max(0, r.fuel - sdt);
    if ((r.fuel || 0) <= 0) {
      r.burning = false;
      if (!need) { r.why = 'standby'; return 0; }
      // belt-fed coal first, then the nearest storage, then logs from the Wood Garages
      const c = this.center(s);
      let got = null;
      for (const id of ['coal', 'wood']) {
        if ((r.h?.[id] || 0) > 0) { r.h[id]--; got = id; break; }
        if (id === 'coal' && this.game.res?.take?.('coal', 1, c.x, c.z)) { got = id; break; }
        if (id === 'wood' && (this.game.state.wood || 0) >= 1) { this.game.state.wood -= 1; this.game.emit('wood', this.game.state.wood); got = id; break; }
      }
      if (!got) { r.why = 'nofuel'; return 0; }
      r.fuel = B[got] || 20; r.fuelId = got;
      this.game.audio?.play('ind_power', { volume: 0.25, pitch: 0.8 });
    }
    r.burning = true;
    r.why = 'run';
    return s.def.ind.out || 6;
  }

  // ------------------------------------------------------------ flow
  wants(s) { const f = this.game.industry?.wants; return f ? !!f.call(this.game.industry, s) : true; }
  step(sdt, dt) {
    const S = this.S;
    let gs = 0, gd = 0;
    this.outs.clear(); this.draws.clear();
    const solar = this.solarK();
    for (const net of this.nets) {
      let supply = 0, demand = 0;
      for (const s of net.sources) { const o = this.sourceOut(s, sdt); this.outs.set(s, o); supply += o; }
      for (const s of net.users) { const d = this.wants(s) ? this.use(s) : 0; this.draws.set(s, d); demand += d; }
      let charge = 0, cap = 0, rate = 0;
      for (const b of net.bats) { const k = keyOf(b); const c = clamp(S.bat[k] || 0, 0, b.def.pw.cap); S.bat[k] = c; charge += c; cap += b.def.pw.cap; rate += b.def.pw.rate || 6; }
      // coal generators light up only when the sun / wind / water and the batteries can't cover it
      const deficit = demand - supply;
      const batOk = charge > Math.max(demand, 1) * 12 && deficit <= rate;
      for (const g of net.gens) {
        const need = deficit > 0.01 && !batOk;
        const o = this.burn(g, need && supply < demand, sdt);
        this.outs.set(g, o);
        supply += o;
      }
      // batteries: bank the surplus, cover the shortfall
      let give = 0;
      if (supply >= demand) {
        if (sdt > 0 && net.bats.length) {
          let surplus = Math.min(supply - demand, rate);
          for (const b of net.bats) {
            const k = keyOf(b), room = b.def.pw.cap - S.bat[k];
            const put = Math.min(room, surplus * sdt * ((b.def.pw.rate || 6) / rate));
            S.bat[k] += put;
          }
          void surplus;
        }
      } else if (charge > 0) {
        give = Math.min(demand - supply, rate);
        if (sdt > 0) {
          let need = give * sdt;
          for (const b of net.bats) {
            const k = keyOf(b);
            const take = Math.min(S.bat[k], need * ((b.def.pw.rate || 6) / rate) + 1e-6);
            S.bat[k] -= take;
          }
          need = 0;
        }
      }
      charge = 0;
      for (const b of net.bats) charge += S.bat[keyOf(b)] || 0;
      const avail = supply + give;
      net.supply = supply; net.demand = demand; net.give = give; net.charge = charge; net.cap = cap; net.rate = rate;
      net.live = supply > 0.01 || charge > 0.5;
      net.ratio = !net.live ? 0 : demand > 0 ? Math.min(1, avail / demand) : 1;
      net.over = demand > 0 && net.ratio < 0.999;
      net.solar = solar;
      gs += supply; gd += demand;
    }
    this.total = { supply: gs, demand: gd };
  }

  // ------------------------------------------------------------ public API
  supply() { return this.total?.supply || 0; }
  demand() { return this.total?.demand || 0; }
  netFor(s) { return this.netOf.get(s) || null; }
  powered(s) {
    if (!s) return 0;
    const net = this.netOf.get(s);
    if (!net) return 0;
    if (this.isConsumer(s) && this.game.industry?.rec && s.def.ind && this.game.industry.rec(s).off) return 0;
    return net.ratio;
  }
  status(s) {
    if (!s) return 'nogrid';
    if (s.def.ind && s.def.ind.kind !== 'belt' && this.game.industry?.rec?.(s)?.off) return 'off';
    const net = this.netOf.get(s);
    if (!net || (!net.sources.length && !net.gens.length && !net.bats.length)) return 'nogrid';
    if (!net.live || net.ratio < 0.15) return 'dark';
    if (net.ratio < 0.999) return 'brown';
    return 'ok';
  }
  info(s) {
    const net = this.netOf.get(s);
    if (!net) return null;
    return {
      id: net.id, supply: net.supply, demand: net.demand, ratio: net.ratio, charge: net.charge, cap: net.cap, give: net.give || 0, live: net.live,
      sources: [...net.sources, ...net.gens].map((x) => ({ s: x, out: this.output(x) })), users: net.users.map((x) => ({ s: x, draw: this.draws.get(x) || 0 })),
      bats: net.bats.map((x) => ({ s: x, charge: this.S.bat[keyOf(x)] || 0, cap: x.def.pw.cap })), poles: net.poles.length,
    };
  }
  charge(s) { return this.S.bat[keyOf(s)] || 0; }
  tap(s) {
    if (!s?.built || !s.def?.pw) return false;
    if (this.game.tool?.kind && this.game.tool.kind !== 'feed') return false;
    return this.open(s);
  }
  open(s) {
    const ui = this.game.industry?.ensureUI?.();
    if (!ui?.openGrid) return false;
    ui.openGrid(s);
    return true;
  }

  // a Water Wheel goes in flowing river water next to your land
  riverRule(type, x, z, t) {
    if (!t.water) return { ok: false, reason: 'Must go in a flowing river' };
    if (t.occ !== -1) return { ok: false, reason: 'Something is already there' };
    const f = this.flowAt(x, z);
    if (!f || !(f.speed > 0.05)) return { ok: false, reason: 'The water is too still here: find a river' };
    const g = this.game.grid;
    let near = !!t.meadow;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (g.inb(x + dx, z + dz) && g.meadow[(z + dz) * g.w + x + dx]) { near = true; break; }
    if (!near) return { ok: false, reason: 'Not your riverbank yet! Clear the land up to the river.' };
    return { ok: true };
  }

  // ------------------------------------------------------------ hooks
  onLoad() {
    this.dirty = true;
    this.sig = '';
    this.badges.clear();
    for (const s of this.game.structures.list) delete s._flow;
  }

  update(simDt, dt) {
    const game = this.game;
    if (!game.started) return;
    this.time += dt;
    this.gridT -= dt;
    if (this.gridT <= 0 || this.dirty) {
      this.gridT = 0.5;
      const sig = this.topoSig();
      if (sig !== this.sig || this.dirty) { this.sig = sig; this.rebuild(); }
    }
    this.step(simDt, dt);
    const overSig = this.nets.map((n) => (n.over ? 1 : 0)).join('');
    if (overSig !== this.overSig) this.buildCables();
    this.visuals(simDt, dt);
  }

  visuals(simDt, dt) {
    const game = this.game;
    const night = game.sky?.state?.night || 0;
    // overloaded cables flicker hot, sparks fly at the poles
    const flick = Math.sin(this.time * 31) > 0.35;
    this.hotMat.color.setHex(flick ? 0xffb040 : 0x241a1c);
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.35;
      for (const net of this.nets) {
        if (!net.over || !net.live) continue;
        const pts = net.poles.length ? net.poles : net.nodes;
        const s = pts[Math.floor(Math.random() * pts.length)];
        const p = this.plug(s, Math.random() < 0.5 ? -1 : 1);
        game.particles.sparkle(p.x, p.y, p.z, 3, 0xffe070);
        if (Math.random() < 0.3 && this.near(p.x, p.z)) game.audio?.play('click', { volume: 0.12, pitch: 2.2 });
      }
    }
    for (const s of this.nodes) {
      const u = s.extraModel?.userData;
      const net = this.netOf.get(s);
      const c = this.center(s);
      if (this.isPole(s)) { u?.setLive?.(!!net?.live, net?.over && flick, night); continue; }
      if (this.isBattery(s)) {
        const k = (this.S.bat[keyOf(s)] || 0) / s.def.pw.cap;
        u?.setCharge?.(k, net ? (net.give > 0.01 ? -1 : net.supply > net.demand + 0.01 && k < 0.999 ? 1 : 0) : 0);
        if (u?.st) { u.st.on = !!net?.live; u.st.lamp = k < 0.08 ? 'warn' : 'on'; }
        continue;
      }
      if (this.isSource(s) && s.def.pw) {
        const o = this.outs.get(s) || 0;
        const peak = s.def.pw.kind === 'water' ? s.def.pw.base + s.def.pw.flow : s.def.pw.out;
        if (u?.st) { u.st.on = o > 0.05; u.st.k = clamp(o / peak, 0, 1.6); u.st.lamp = o > 0.05 ? 'on' : 'idle'; }
        if (s.def.pw.kind === 'water') { const f = s._flow || this.flowAt(s.x, s.z); u?.setFlow?.(f ? f.speed : 0, f ? Math.atan2(f.dir[0], f.dir[1]) : 0, WATER_Y - this.baseY(s)); if (o > 0 && Math.random() < dt * 3 && this.near(c.x, c.z)) game.particles.splash?.(c.x + (Math.random() - 0.5) * 0.6, c.z + (Math.random() - 0.5) * 0.6, 2, 0.25); }
        if (s.def.pw.kind === 'wind') u?.setWind?.(this.windK(s));
        if (s.def.pw.kind === 'solar') u?.setSun?.(this.solarK());
        continue;
      }
      // consumers: a flashing plug when they want to run but get no power, a bolt in a brownout
      if (this.isConsumer(s) && (this.wants(s) || (s.def.ind && this.game.industry?.rec?.(s)?.dark))) {
        const st = this.status(s);
        const y = this.baseY(s) + ((s.def.size?.[0] || 1) > 1 ? 2.1 : 1.45);
        if (st === 'nogrid' || st === 'dark') this.badges.set('plug:' + keyOf(s), 'pw_plug', c.x, y, c.z, { blink: true, size: 0.58 });
        else if (st === 'brown') this.badges.set('brown:' + keyOf(s), 'pw_bolt', c.x, y, c.z, { blink: Math.floor(this.time * 0.8) % 2 === 0, size: 0.38 });
      }
    }
    // generators out of fuel while their grid needs them
    for (const net of this.nets) for (const g of net.gens) {
      const r = this.genRec(g);
      if (r.why === 'nofuel') { const c = this.center(g); this.badges.set('fuel:' + keyOf(g), 'res_coal', c.x, this.baseY(g) + 1.5, c.z, { blink: true, size: 0.4 }); }
    }
    this.badges.frame(dt);
  }
  near(x, z, r = 22) { const t = this.game.rig?.target; return !t || (Math.abs(x - t.x) < r && Math.abs(z - t.z) < r); }
}
