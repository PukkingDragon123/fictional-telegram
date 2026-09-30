import { pineModel, mapleModel, birchModel, boulderModel, willowModel } from '../src/world/models.js';
const tri = (g) => g.index.count / 3;
for (const far of [false, true]) {
  const k = far ? 0.5 : 1;
  for (let variant = 0; variant < 3; variant++) {
    const seed = variant * 31 + (far ? 7 : 1);
    const models = {
      pine: pineModel({ h: Math.round((50 + variant * 6) * k), r: Math.round((10 + variant) * k), seed }),
      spruce: pineModel({ h: Math.round((58 + variant * 5) * k), r: Math.round(8 * k), seed, spruce: true }),
      maple: mapleModel({ h: Math.round(34 * k), r: Math.round(11 * k), seed, variant }),
      birch: birchModel({ h: Math.round(38 * k), r: Math.round(7 * k), seed }),
      boulder: boulderModel({ seed, size: k }),
    };
    const out = Object.entries(models).map(([n, m]) => `${n}:${m.vox.size}v/${tri(m.build({ scale: far ? 0.2 : 0.1 }))}t/${tri(m.build({ greedy: false }))}ng`);
    console.log(far ? 'FAR ' : 'NEAR', variant, out.join('  '));
  }
}
console.log('willow', tri(willowModel({}).build()));
{
  const m = pineModel({ h: 28, r: 6, seed: 38 });
  console.log('far pine ao:false', tri(m.build({ scale: 0.2, ao: false })), 'ao:true', tri(m.build({ scale: 0.2 })));
  const n = pineModel({ h: 56, r: 11, seed: 32 });
  console.log('near pine ao:false', tri(n.build({ ao: false })), 'ao:true', tri(n.build({})));
}
