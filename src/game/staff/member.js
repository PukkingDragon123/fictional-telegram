// [v26 staff] One beaver on the payroll. Lives in game.state.staff.list (saved as
// JSON through toJSON: only the fields below), with runtime links (agent = the
// BeaverSystem beaver that walks around, its rig) kept off the save.
import { SKILLS } from '../../data/staffGen.js';

const SAVE = ['id', 'name', 'seed', 'look', 'traits', 'personality', 'skills', 'level', 'xp', 'mood', 'energy', 'job', 'home', 'hurt',
  'wage', 'origin', 'lodge', 'hiredDay', 'sadDays', 'unpaid', 'train', 'bandage', 'stats', 'answer'];

export class StaffMember {
  constructor(data = {}) {
    // runtime only (not enumerable: never saved, never cloned)
    Object.defineProperty(this, 'agent', { value: null, writable: true, enumerable: false });
    Object.defineProperty(this, '_x', { value: 0, writable: true, enumerable: false });
    Object.defineProperty(this, '_z', { value: 0, writable: true, enumerable: false });
    Object.assign(this, {
      id: 0, name: 'Beaver', seed: 1, look: {}, traits: [], personality: 'chill', skills: {}, level: 1, xp: 0, mood: 70, energy: 100,
      job: null, home: null, hurt: null, wage: 0, origin: 'hire', lodge: null, hiredDay: 1, sadDays: 0, unpaid: 0, train: null, bandage: 0,
      stats: { worked: 0, rescued: 0, hurt: 0 },
    });
    for (const k of SAVE) if (data[k] !== undefined) this[k] = data[k];
    if (data.x != null) this._x = +data.x;
    if (data.z != null) this._z = +data.z;
    for (const k of SKILLS) this.skills[k] = Math.max(1, Math.min(5, Math.round(this.skills[k] || 1)));
    if (!Array.isArray(this.traits)) this.traits = [];
    this.stats = { worked: 0, rescued: 0, hurt: 0, ...(this.stats || {}) };
  }
  get x() { return this.agent ? this.agent.x : this._x; }
  set x(v) { if (this.agent) this.agent.x = v; else this._x = v; }
  get z() { return this.agent ? this.agent.z : this._z; }
  set z(v) { if (this.agent) this.agent.z = v; else this._z = v; }
  get y() { return this.agent ? this.agent.y || 0 : 0; }
  get rig() { return this.agent?.rig || null; }
  has(t) { return this.traits.includes(t); }
  toJSON() {
    const o = {};
    for (const k of SAVE) if (this[k] !== undefined && this[k] !== null) o[k] = this[k];
    o.job = this.job ?? null; o.home = this.home ?? null;
    if (this.hurt) o.hurt = { ...this.hurt };
    o.x = +(+this.x || 0).toFixed(2); o.z = +(+this.z || 0).toFixed(2);
    o.mood = Math.round(this.mood); o.energy = Math.round(this.energy); o.xp = Math.round(this.xp * 10) / 10;
    return o;
  }
}
