// [v26 seasons] What the seasons and the weather look like.
//
// Everything is shader uniforms on the existing materials (no mesh rebuilds):
//   - nature sprites (trees, clutter, garden plants, the valley ring): a class
//     texture over the nature atlas tells each sprite what it is (broadleaf,
//     conifer, grass, rock...). Broadleaf crowns turn fresh green with blossoms
//     in spring, deep green in summer, keep the autumn art in autumn and go bare
//     (a sparse cross-hatch of twigs) in winter; grass goes golden, gets buried
//     in snow; every upright sprite gets snow caps on its top edges.
//   - terrain: fresh / dry / golden grass, leaf specks, spring flowers, wet dark
//     ground with puddles (rain rings), snow cover (the atlas snow tile).
//   - water: ice creeping out from the banks, frosty rims, snow on the ice.
//   - voxel models (roofs, the hut, structures, forest canopy): snow on top faces.
//   - sky (Sky.weather hook): overcast, fog, heat glare, lightning flashes.
// Weather particles are GPU layers (one instanced draw each, positions animated
// in the vertex shader, pixel-sized in the low-res target): rain streaks, snow,
// leaves, blossom petals, heat shimmer, ground mist. Plus rain rings on the
// water (the height-field sim), lightning bolts, scene fog for foggy days.
import * as THREE from 'three';
import { voxelMaterial } from '../core/voxel.js';
import { SPRITE_UNIFORMS } from '../core/spriteBatch.js';
import { WATER_Y } from './grid.js';
import { SEASONS, dayInSeason, seasonIndex } from '../game/seasons/calendar.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ shared uniforms
export const SEA_U = {
  uSeaTime: { value: 0 },
  uSeaGreen: { value: 1 }, // broadleaf crowns: 1 = summer green, 0 = the autumn art
  uSeaFresh: { value: 0 }, // spring: light, yellowish fresh green
  uSeaBloom: { value: 0 }, // spring blossoms
  uSeaBare: { value: 0 }, // leaves gone (winter)
  uSeaFall: { value: 0 }, // autumn: golden grass, leaf specks
  uSeaDry: { value: 0 }, // summer heat: straw grass
  uSeaWinter: { value: 0 }, // winter grading
  uSeaLitter: { value: 0.3 }, // share of leaf-litter sprites shown
  uSeaSnow: { value: 0 }, // snow cover
  uSeaIce: { value: 0 }, // pond ice
  uSeaWet: { value: 0 }, // wet ground / puddles
  uSeaRain: { value: 0 }, // rain falling now (puddle rings)
  uSeaFog: { value: 0 },
  uSeaWaterY: { value: WATER_Y },
  uSeaSky: { value: new THREE.Color(0.5, 0.6, 0.75) },
  uSeaCls: { value: null },
};

const GLSL_COMMON = /* glsl */ `
float seaH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;
const SEA_PARS = Object.keys(SEA_U).filter((k) => k !== 'uSeaCls' && k !== 'uSeaSky').map((k) => `uniform float ${k};`).join('\n') + '\nuniform vec3 uSeaSky;\n';

// ------------------------------------------------------------------ sprite classes
// 0 none, 1 broadleaf (autumn art), 2 conifer, 3 grass / flowers, 4 green bush,
// 5 water plant, 6 rock / wood, 7 leaf litter, 8 mushroom, 9 garden plant
const CLASS_RULES = [
  [1, /^(maple_|birch_|aspen_|sapling|greatwillow|cypress_|appletree$|sugarmaple|beehive_tree)/],
  [2, /^(pine_|spruce_)/],
  [4, /^(bush_|sumac)/],
  [5, /^(lilypad_|lilyflower|duckweed|algae_|bogpad_|seaweed_)/],
  [7, /^(leaf_|pinecone|chips_)/],
  [6, /^(boulder_|rock_|mossrock|pebble_|log_|stump|driftwood|riverrock|steppingstone|deadtree_|snag|woodpile|rubble_|mushlog|applertree_bare|appletree_bare)/],
  [8, /^(giantshroom|shroomcluster|glowcap|mushroom_)/],
  [9, /^(crop_|blueberry|raspberry|strawberry|cranberry|saskatoon|cloudberry|elderberry|goldenberry|flowerbed_|pumpkinpatch|sunflower|wildrice|cattailpatch|farm_)/],
  [3, /^(tuft_|tallgrass|fern_|clover|dandelion|daisy|susan|trillium|fireweed|aster|lupine_|cattail_|reeds_|swampgrass|swampreeds|weed_|pitcherplant|rose)/],
];
export function classOf(name) {
  for (const [c, re] of CLASS_RULES) if (re.test(name)) return c;
  return 0;
}
// one texel per atlas pixel: the class of the frame covering it (DataTexture rows bottom-up, like flipY)
function buildClassTexture(frames, W, H) {
  const data = new Uint8Array(W * H);
  for (const [name, list] of Object.entries(frames || {})) {
    const c = classOf(name);
    if (!c || !list) continue;
    for (const f of list) {
      if (!f) continue;
      const r0 = Math.max(0, H - (f.y + f.h)), r1 = Math.min(H - 1, H - 1 - f.y);
      const x0 = Math.max(0, f.x), x1 = Math.min(W - 1, f.x + f.w - 1);
      for (let r = r0; r <= r1; r++) data.fill(c, r * W + x0, r * W + x1 + 1);
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

const SPRITE_VERT_PARS = /* glsl */ `
uniform sampler2D uSeaCls;
varying float vSeaCls;
varying vec3 vSeaPos;
varying float vSeaMode;
`;
const SPRITE_VERT_MAIN = /* glsl */ `
vSeaCls = floor(texture2D(uSeaCls, vec2((aUV.x + aUV.z) * 0.5, (aUV.y + aUV.w) * 0.5)).r * 255.0 + 0.5);
vSeaPos = aPos;
vSeaMode = aParams.z;
`;
const SPRITE_FRAG_PARS = /* glsl */ `
varying float vSeaCls;
varying vec3 vSeaPos;
varying float vSeaMode;
${SEA_PARS}
${GLSL_COMMON}
vec3 seaGreen(float l, float fresh) {
  vec3 c0 = vec3(0.0061, 0.027, 0.0177), c1 = vec3(0.023, 0.099, 0.032), c2 = vec3(0.069, 0.226, 0.052), c3 = vec3(0.193, 0.413, 0.089), c4 = vec3(0.521, 0.684, 0.228);
  float x = clamp((l - 0.1) / 0.68 + fresh * 0.12, 0.0, 1.0) * 4.0;
  vec3 c = x < 1.0 ? mix(c0, c1, x) : x < 2.0 ? mix(c1, c2, x - 1.0) : x < 3.0 ? mix(c2, c3, x - 2.0) : mix(c3, c4, x - 3.0);
  return mix(c, c * vec3(1.15, 1.12, 0.62), fresh);
}
vec3 seaAutumn(float l, float h) {
  vec3 a = h < 0.33 ? vec3(0.3, 0.02, 0.02) : h < 0.66 ? vec3(0.36, 0.08, 0.01) : vec3(0.36, 0.2, 0.02);
  vec3 b = h < 0.33 ? vec3(0.9, 0.18, 0.06) : h < 0.66 ? vec3(0.98, 0.42, 0.06) : vec3(1.0, 0.72, 0.16);
  return mix(a * 0.3, b, clamp((l - 0.08) * 1.7, 0.0, 1.0));
}
vec3 seaStraw(float l) { return mix(vec3(0.09, 0.05, 0.012), vec3(0.78, 0.56, 0.17), clamp(l * 1.5, 0.0, 1.0)); }
// broadleaf foliage pixel? (saturated; the autumn art is warm, the bushes green)
bool seaLeaf(vec3 sr, float cls) {
  float mx = max(sr.r, max(sr.g, sr.b)), mn = min(sr.r, min(sr.g, sr.b));
  float sat = mx > 0.02 ? (mx - mn) / mx : 0.0;
  return sat > 0.38 && mx > 0.1 && (cls > 1.5 || sr.r >= sr.b);
}
bool seaTwig(vec2 tx) {
  float tw = step(fract((tx.x * 0.5 + tx.y) / 5.0), 0.2) + step(fract((tx.y - tx.x * 0.5) / 6.0), 0.18);
  return tw > 0.5 && seaH(tx * 1.37 + 3.0) >= 0.35;
}
`;
// main colour pass (after the sprite tint)
const SPRITE_FRAG_MAIN = /* glsl */ `
{
  float cls = vSeaCls;
  if (cls > 0.5) {
    vec2 tsz = vec2(textureSize(map, 0));
    vec2 tx = floor(vMapUv * tsz);
    float ih = seaH(floor(vSeaPos.xz * 3.0) + 0.37);
    float th = seaH(tx * 0.731 + ih * 17.0);
    vec3 sr = sqrt(max(sampledDiffuseColor.rgb, vec3(0.0)));
    float ls = dot(sr, vec3(0.299, 0.587, 0.114));
    vec3 col = diffuseColor.rgb;
    vec3 tnt = vSTint;
    bool bare = false;
    if (cls < 1.5 || (cls > 3.5 && cls < 4.5)) {
      if (seaLeaf(sr, cls)) {
        if (th < uSeaBare) {
          if (!seaTwig(tx)) discard;
          bare = true;
          col = mix(vec3(0.03, 0.022, 0.02), vec3(0.09, 0.07, 0.058), step(0.45, ls)) * tnt;
          if (seaH(tx * 2.1 + ih) < uSeaSnow * 0.55) col = vec3(0.8, 0.84, 0.92) * tnt;
        } else if (cls < 1.5) {
          if (th < uSeaGreen) col = seaGreen(ls, uSeaFresh) * tnt;
          vec2 cl = floor(tx * 0.5);
          if (ls > 0.28 && seaH(cl * 0.913 + ih * 7.0) < uSeaBloom * 0.13 * step(0.3, ih)) col = (ih > 0.85 ? vec3(0.96, 0.9, 0.9) : vec3(0.92, 0.36, 0.5)) * tnt;
        } else {
          col = mix(col, col * vec3(1.1, 1.15, 0.7), uSeaFresh * 0.5);
          if (th >= uSeaGreen) col = seaAutumn(ls, ih) * tnt;
        }
      }
    } else if (cls < 2.5) {
      if (uSeaSnow > 0.01 && ls > 0.3 && seaH(tx * 1.7 + ih) < uSeaSnow * 0.75) col = vec3(0.8, 0.85, 0.94) * tnt;
      col *= mix(vec3(1.0), vec3(0.88, 0.94, 1.06), uSeaWinter);
    } else if (cls < 3.5) {
      if (ih < uSeaSnow * 0.92 - 0.04) discard;
      float gr = clamp((sr.g - max(sr.r, sr.b)) * 5.0, 0.0, 1.0);
      col = mix(col, seaStraw(ls) * tnt, gr * clamp(uSeaFall * 0.7 + uSeaDry * 0.5 + uSeaWinter * 0.9, 0.0, 0.92));
      col = mix(col, col * vec3(1.0, 1.16, 0.8), gr * uSeaFresh * 0.5);
      col *= 1.0 - uSeaWet * 0.12;
    } else if (cls < 5.5) {
      if (vSeaMode > 0.5 && vSeaMode < 1.5) {
        if (uSeaIce > 0.3 && ih < (uSeaIce - 0.3) * 1.2 && ls > 0.55) discard; // flowers frozen under
        col = mix(col, vec3(0.62, 0.74, 0.86) * tnt, uSeaIce * 0.6);
      }
    } else if (cls > 6.5 && cls < 7.5) {
      if (ih > uSeaLitter || ih < uSeaSnow * 0.95) discard;
    }
    // snow caps on the top edges of upright sprites
    if (uSeaSnow > 0.01 && vSeaMode < 0.5 && vSeaPos.y > uSeaWaterY && !(cls > 4.5 && cls < 5.5) && !bare) {
      vec2 ts = 1.0 / tsz;
      float a1 = texture2D(map, vMapUv + vec2(0.0, ts.y)).a;
      float a2 = texture2D(map, vMapUv + vec2(0.0, 2.0 * ts.y)).a;
      float capK = a1 < 0.5 ? 1.0 : a2 < 0.5 ? 0.5 : 0.0;
      if (capK > 0.0 && seaH(tx * 1.31 + 7.0 + ih) < uSeaSnow * 1.3 * capK) col = mix(vec3(0.66, 0.72, 0.86), vec3(0.94, 0.96, 1.0), step(0.32, ls)) * tnt;
    }
    diffuseColor.rgb = col;
  }
}
`;
// shadow (depth) pass: drop the same pixels so bare trees cast bare shadows
const SPRITE_DEPTH_MAIN = /* glsl */ `
{
  float cls = vSeaCls;
  if (cls > 0.5) {
    vec2 tsz = vec2(textureSize(map, 0));
    vec2 tx = floor(vMapUv * tsz);
    float ih = seaH(floor(vSeaPos.xz * 3.0) + 0.37);
    float th = seaH(tx * 0.731 + ih * 17.0);
    vec3 sr = sqrt(max(diffuseColor.rgb, vec3(0.0)));
    if ((cls < 1.5 || (cls > 3.5 && cls < 4.5)) && th < uSeaBare && seaLeaf(sr, cls) && !seaTwig(tx)) discard;
    if (cls > 2.5 && cls < 3.5 && ih < uSeaSnow * 0.92 - 0.04) discard;
    if (cls > 6.5 && cls < 7.5 && (ih > uSeaLitter || ih < uSeaSnow * 0.95)) discard;
  }
}
`;

export function patchSpriteMaterial(mesh) {
  const mat = mesh?.material;
  if (!mat || mat.userData.seaPatched) return false;
  mat.userData.seaPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uSeaCls = SEA_U.uSeaCls;
    Object.assign(shader.uniforms, SEA_U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SPRITE_VERT_PARS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + SPRITE_VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SPRITE_FRAG_PARS)
      .replace('diffuseColor.rgb *= vSTint;', 'diffuseColor.rgb *= vSTint;\n' + SPRITE_FRAG_MAIN);
  };
  const key = mat.customProgramCacheKey?.() || 'sprite';
  mat.customProgramCacheKey = () => key + '+sea';
  mat.needsUpdate = true;
  const depth = mesh.customDepthMaterial;
  if (depth && !depth.userData.seaPatched) {
    depth.userData.seaPatched = true;
    const prevD = depth.onBeforeCompile;
    depth.onBeforeCompile = (shader, r) => {
      prevD?.call(depth, shader, r);
      Object.assign(shader.uniforms, SEA_U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + SPRITE_VERT_PARS)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + SPRITE_VERT_MAIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SPRITE_FRAG_PARS)
        .replace('diffuseColor.a = 1.0;', 'diffuseColor.a = 1.0;\n' + SPRITE_DEPTH_MAIN);
    };
    const dk = depth.customProgramCacheKey?.() || 'spriteDepth';
    depth.customProgramCacheKey = () => dk + '+sea';
    depth.needsUpdate = true;
  }
  return true;
}

// ------------------------------------------------------------------ terrain
const TERRAIN_PARS = /* glsl */ `
${SEA_PARS}
int gSeaId = -1;
`;
const TERRAIN_MAIN = /* glsl */ `
if (abs(vWNor.y) > 0.5 && vWPos.y > uWaterY - 0.02) {
  vec2 sp = floor(vWPos.xz * 24.0) / 24.0;
  float th = h21(sp * 1.37 + 3.1);
  vec3 c = diffuseColor.rgb;
  bool grassy = gSeaId == 0 || gSeaId == 1 || gSeaId == 8 || gSeaId == 10 || gSeaId == 11;
  float gr = clamp((c.g - max(c.r, c.b)) * 9.0, 0.0, 1.0);
  if (grassy) {
    c = mix(c, c * vec3(0.92, 1.14, 0.72), uSeaFresh * 0.6 * gr);
    float lum = dot(c, vec3(0.45, 0.45, 0.1));
    c = mix(c, vec3(lum) * vec3(1.45, 1.05, 0.42), clamp(uSeaDry * 0.5 + uSeaFall * 0.55 + uSeaWinter * 0.4, 0.0, 0.85) * gr);
    // fallen leaves / spring flowers, one texel each
    float lh = h21(sp * 0.71 + 9.3);
    if (lh < uSeaFall * 0.05) { float k = h21(sp * 3.1); c = (k < 0.33 ? vec3(0.62, 0.06, 0.03) : k < 0.66 ? vec3(0.85, 0.3, 0.04) : vec3(0.9, 0.62, 0.1)) * vColor.rgb; }
    else if (lh > 1.0 - uSeaBloom * 0.004) { float k = h21(sp * 2.3); c = (k < 0.2 ? vec3(0.95, 0.95, 0.9) : k < 0.6 ? vec3(0.95, 0.78, 0.15) : vec3(0.92, 0.45, 0.62)) * vColor.rgb; }
  }
  if (uSeaWet > 0.01) {
    c *= 1.0 - 0.26 * uSeaWet;
    bool soft = grassy || gSeaId == 2 || gSeaId == 3 || gSeaId == 7;
    float pn = vn2(vWPos.xz * 0.55 + 17.0) * 0.65 + vn2(vWPos.xz * 1.6 + 4.0) * 0.35;
    if (soft && pn < uSeaWet * 0.24) {
      vec3 pc = mix(uSeaSky * 0.45, c * 0.55, 0.4);
      vec2 g2 = vWPos.xz * 2.0;
      vec2 cell = floor(g2), f = fract(g2) - 0.5;
      float rate = 1.4;
      float seed = h21(cell + 0.5);
      float age = fract(uSeaTime * rate + seed * 5.0);
      vec2 o = vec2(h21(cell + 1.7 + floor(uSeaTime * rate + seed * 5.0)), h21(cell + 4.1 + floor(uSeaTime * rate + seed * 5.0))) - 0.5;
      float rr = length(f - o * 0.5);
      pc += step(abs(rr - age * 0.42), 0.04) * (1.0 - age) * uSeaRain * 0.3;
      c = mix(c, pc, 0.85);
    }
  }
  if (uSeaSnow > 0.001) {
    float n = vn2(vWPos.xz * 0.35 + 3.0) * 0.6 + vn2(vWPos.xz * 1.7) * 0.4;
    float cover = smoothstep(n - 0.06, n + 0.06, uSeaSnow * 1.3 - 0.15);
    if (gSeaId == 7) cover *= 0.55;
    if (step(th, cover) > 0.5) c = surfTex(6, vWPos.xz) * vColor.rgb * 1.08;
  }
  diffuseColor.rgb = c;
}
`;
export function patchTerrainMaterial(mat) {
  if (!mat || mat.userData.seaPatched) return false;
  mat.userData.seaPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, SEA_U);
    let fs = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + TERRAIN_PARS);
    if (fs.includes('tex = surfTex(id, p);')) fs = fs.replace('tex = surfTex(id, p);', 'tex = surfTex(id, p);\n    gSeaId = id;');
    if (fs.includes('diffuseColor.rgb *= tex * 1.12;')) fs = fs.replace('diffuseColor.rgb *= tex * 1.12;', 'diffuseColor.rgb *= tex * 1.12;\n' + TERRAIN_MAIN);
    else console.warn('[seasons] terrain shader: hook not found');
    shader.fragmentShader = fs;
  };
  const key = mat.customProgramCacheKey?.() || 'terrain';
  mat.customProgramCacheKey = () => key + '+sea';
  mat.needsUpdate = true;
  return true;
}

// the valley ring ground: snow on its tops
export function patchRingGround(mat) {
  if (!mat || mat.userData.seaPatched) return false;
  mat.userData.seaPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, SEA_U);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SEA_PARS + GLSL_COMMON)
      .replace('diffuseColor.rgb *= ringTex(id, p) * 1.12;', `diffuseColor.rgb *= ringTex(id, p) * 1.12;
  if (abs(vRNor.y) > 0.5 && uSeaSnow > 0.001) {
    float n = seaH(floor(p * 3.0) * 0.37) * 0.35 + 0.5 * (sin(p.x * 0.31) * sin(p.y * 0.27) * 0.5 + 0.5);
    if (n < uSeaSnow * 1.15 - 0.05) diffuseColor.rgb = ringTex(6, p) * vColor.rgb * 1.05;
  } else if (abs(vRNor.y) > 0.5) {
    float gr = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 9.0, 0.0, 1.0);
    float lum = dot(diffuseColor.rgb, vec3(0.45, 0.45, 0.1));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.45, 1.05, 0.42), clamp(uSeaDry * 0.5 + uSeaFall * 0.5 + uSeaWinter * 0.4, 0.0, 0.8) * gr);
  }`);
  };
  const key = mat.customProgramCacheKey?.() || 'ring';
  mat.customProgramCacheKey = () => key + '+sea';
  mat.needsUpdate = true;
  return true;
}

// ------------------------------------------------------------------ water
const WATER_PARS = /* glsl */ `
${SEA_PARS}
`;
const WATER_MAIN = /* glsl */ `
  // [v26 seasons] ice from the banks, frosty rims, snow on the ice, fog
  if (uSeaIce > 0.001) {
    float iceN = noised(p * 0.6 + 2.0).x * 0.5 + noised(p * 2.1 + 3.0).x * 0.5;
    float edge = uSeaIce * (flowK > 0.05 ? 0.3 : 0.8) - shore + (iceN - 0.5) * 0.22;
    if (edge > 0.0) {
      vec3 ic = mix(vec3(0.5, 0.7, 0.82), vec3(0.8, 0.9, 0.97), smoothstep(0.0, 0.2, edge));
      float cr = step(abs(noised(p * 3.3 + 7.0).x - 0.5), 0.018) + step(abs(noised(p * 7.1 + 9.0).x - 0.5), 0.012);
      ic *= 1.0 - min(cr, 1.0) * 0.22;
      ic = mix(ic, vec3(0.95, 0.97, 1.0), clamp(uSeaSnow * 1.3 - iceN * 0.7, 0.0, 1.0) * 0.9);
      ic *= mix(vec3(1.0), uSkyTint * 0.6 + 0.5, 0.25) * (1.0 - uNight * 0.55);
      ic += uSunCol * step(0.985, hash2(floor(p * 24.0) + floor(t * 3.0) * 7.0)) * 0.5 * uDayK;
      col = ic;
      alpha = 0.97;
    } else if (edge > -0.045) {
      col = mix(col, vec3(0.86, 0.94, 1.0) * (1.0 - uNight * 0.5), 0.55);
      alpha = max(alpha, 0.75);
    }
  }
  if (uSeaFog > 0.001) col = mix(col, uSeaSky, uSeaFog * 0.35);
`;
export function patchWaterMaterial(mat) {
  if (!mat || mat.userData.seaPatched) return false;
  mat.userData.seaPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, SEA_U);
    let fs = shader.fragmentShader;
    if (!fs.includes('gl_FragColor = vec4(col, alpha);')) { console.warn('[seasons] water shader: hook not found'); return; }
    fs = fs.replace('uniform float uTime;', 'uniform float uTime;\n' + WATER_PARS);
    fs = fs.replace('gl_FragColor = vec4(col, alpha);', WATER_MAIN + '\n  gl_FragColor = vec4(col, alpha);');
    shader.fragmentShader = fs;
  };
  const key = mat.customProgramCacheKey?.() || mat.name || 'water';
  mat.customProgramCacheKey = () => key + '+sea';
  mat.needsUpdate = true;
  return true;
}

// ------------------------------------------------------------------ voxels (roofs, structures, the hut)
export function patchVoxelMaterial(mat) {
  if (!mat || mat.userData.seaPatched) return false;
  mat.userData.seaPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, SEA_U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;\nvarying float vSeaUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSeaUp = normalize(mat3(modelMatrix) * normal).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;\nvarying float vSeaUp;\n' + SEA_PARS + GLSL_COMMON)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uSeaSnow > 0.01 && vSeaUp > 0.6 && vSeaW.y > uSeaWaterY + 0.04) {
  float n = seaH(floor(vSeaW.xz * 10.0 + 0.001) * 0.37 + floor(vSeaW.y * 10.0) * 0.11);
  if (n < uSeaSnow * 1.2 - 0.08) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 1.0), 0.94);
}
diffuseColor.rgb *= 1.0 - uSeaWet * 0.1;`);
  };
  const key = mat.customProgramCacheKey?.() || 'voxel';
  mat.customProgramCacheKey = () => key + '+sea';
  mat.needsUpdate = true;
  return true;
}

// ------------------------------------------------------------------ precipitation layers
// One instanced quad per drop / flake / leaf; the vertex shader moves it (world
// locked tiling around the camera) and sizes it in low-res pixels.
const PRECIP_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uFall;
uniform float uHeight;
uniform float uExtent;
uniform float uLen;
uniform float uWidth;
uniform float uKind;
uniform vec3 uCenter;
uniform vec2 uWind;
uniform vec2 uRes;
varying float vA;
varying vec2 vC;
varying float vSeed;
void main() {
  vSeed = aSeed.w;
  if (aSeed.w > uAmount) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float H = uHeight;
  float fall = uFall * (0.8 + 0.4 * fract(aSeed.w * 13.7));
  float y = mod(aSeed.x * H - uTime * fall, H);
  vec3 p;
  p.y = uCenter.y - 1.5 + y;
  float E2 = uExtent * 2.0;
  vec2 drift = uWind * (H - y) * 0.35;
  if (uKind > 0.5) drift += vec2(sin(uTime * 1.3 + aSeed.y * 40.0), cos(uTime * 1.1 + aSeed.z * 40.0)) * 0.35 * uKind;
  vec2 base = vec2(aSeed.y, aSeed.z) * E2 - drift;
  p.xz = uCenter.xz + (fract((base - uCenter.xz) / E2 + 0.5) - 0.5) * E2;
  vec4 c0 = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vec2 px = 2.0 / uRes;
  vec2 corner = position.xy;
  vC = corner;
  vA = 1.0;
  if (uKind < 0.5) {
    // rain: a streak along the fall direction, 1 px wide
    vec3 vel = vec3(uWind.x * 0.35, -fall, uWind.y * 0.35);
    vec4 c1 = projectionMatrix * viewMatrix * vec4(p - vel * uLen, 1.0);
    vec2 d = (c1.xy - c0.xy) / px;
    float L = length(d);
    vec2 dir = L > 0.01 ? d / L : vec2(0.0, 1.0);
    L = clamp(L, 2.0, 7.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    vec2 q = c0.xy + (dir * L * corner.y + nrm * (corner.x - 0.5) * uWidth) * px;
    gl_Position = vec4(q, c0.z, 1.0);
  } else {
    // flakes / leaves / petals / shimmer: little squares (leaves flutter between shapes)
    float s = uWidth * (0.75 + 0.5 * fract(aSeed.x * 7.3));
    vec2 sz = vec2(s, s);
    if (uKind > 1.5 && uKind < 3.5) { float f = step(0.0, sin(uTime * 6.0 + aSeed.y * 30.0)); sz = mix(vec2(s * 1.5, s * 0.75), vec2(s * 0.75, s * 1.5), f); }
    if (uKind > 3.5) sz = vec2(1.0, uLen);
    vec2 q = c0.xy + (floor((corner - 0.5) * sz + 0.5)) * px;
    gl_Position = vec4(q, c0.z, 1.0);
  }
}
`;
const PRECIP_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uAlpha;
uniform float uKind;
uniform float uTime;
varying float vA;
varying vec2 vC;
varying float vSeed;
void main() {
  vec3 c = uColor;
  float k = fract(vSeed * 91.7);
  if (k > 0.66) c = uColor3; else if (k > 0.33) c = uColor2;
  float a = uAlpha * vA;
  if (uKind > 3.5) a *= 0.5 + 0.5 * sin(uTime * 7.0 + vSeed * 50.0);
  if (uKind < 0.5) a *= 0.55 + 0.45 * vC.y;
  gl_FragColor = vec4(c, a);
}
`;

class PrecipLayer {
  constructor(scene, { count, kind, color, color2, color3, alpha = 0.6, width = 1, len = 0.06, fall = 18, height = 14, name }) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = (i + Math.random()) / count; // the "amount" threshold: drops switch on in order
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    this.u = {
      uTime: { value: 0 }, uAmount: { value: 0 }, uFall: { value: fall }, uHeight: { value: height }, uExtent: { value: 20 },
      uLen: { value: len }, uWidth: { value: width }, uKind: { value: kind }, uCenter: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(640, 400) },
      uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(color2 ?? color) }, uColor3: { value: new THREE.Color(color3 ?? color) }, uAlpha: { value: alpha },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG, uniforms: this.u, transparent: true, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.mesh.name = name || 'precip';
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  set(amount, center, extent, wind, res, time) {
    const u = this.u;
    u.uAmount.value = amount;
    this.mesh.visible = amount > 0.004;
    if (!this.mesh.visible) return;
    u.uCenter.value.copy(center);
    u.uExtent.value = extent;
    u.uWind.value.copy(wind);
    u.uRes.value.copy(res);
    u.uTime.value = time;
  }
}

// ground mist: big soft dithered puffs drifting low over the land
const MIST_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uExtent;
uniform vec3 uCenter;
uniform vec2 uWind;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
varying vec2 vC;
varying float vK;
void main() {
  vK = 0.0;
  if (aSeed.w > uAmount) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  float E2 = uExtent * 2.0;
  vec2 base = vec2(aSeed.y, aSeed.z) * E2 + uWind * uTime * 0.25 + vec2(sin(uTime * 0.05 + aSeed.x * 9.0), 0.0) * 2.0;
  vec3 p;
  p.xz = uCenter.xz + (fract((base - uCenter.xz) / E2 + 0.5) - 0.5) * E2;
  p.y = uCenter.y + 0.2 + aSeed.x * 1.2;
  float s = 3.5 + aSeed.x * 4.5;
  vC = position.xy - 0.5;
  vK = 0.5 + 0.5 * sin(uTime * 0.3 + aSeed.z * 20.0);
  vec3 w = p + uCamRight * vC.x * s * 1.6 + uCamUp * vC.y * s * 0.7;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;
const MIST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vC;
varying float vK;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  float r = length(vC * vec2(1.0, 1.4)) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, r)) * uAlpha * (0.6 + 0.4 * vK);
  if (a < bayer4(gl_FragCoord.xy) * 0.9 + 0.05) discard;
  gl_FragColor = vec4(uColor, 0.55);
}
`;
class MistLayer {
  constructor(scene, count = 70) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = (i + Math.random()) / count; }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    this.u = {
      uTime: { value: 0 }, uAmount: { value: 0 }, uExtent: { value: 30 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() },
      uCamRight: SPRITE_UNIFORMS.uCamRight, uCamUp: SPRITE_UNIFORMS.uCamUp, uColor: { value: new THREE.Color(0.85, 0.88, 0.92) }, uAlpha: { value: 0.4 },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, uniforms: this.u, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 39;
    this.mesh.name = 'mist';
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
}

// ------------------------------------------------------------------ lightning
function boltGeometry(x, z, y0, y1) {
  const pos = [];
  const idx = [];
  let px = x + (Math.random() - 0.5) * 6, pz = z + (Math.random() - 0.5) * 6, py = y1;
  const segs = 12;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const tx = lerp(px, x, t) + (i && i < segs ? (Math.random() - 0.5) * 1.6 : 0);
    const tz = lerp(pz, z, t) + (i && i < segs ? (Math.random() - 0.5) * 1.6 : 0);
    pts.push([tx, lerp(py, y0, t), tz]);
  }
  const addStrip = (P, w) => {
    const base = pos.length / 3;
    for (const [a, b, c] of P) { pos.push(a - w, b, c, a + w, b, c); }
    for (let i = 0; i < P.length - 1; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  };
  addStrip(pts, 0.14);
  // a fork
  const f0 = pts[4 + Math.floor(Math.random() * 3)];
  const fork = [f0];
  for (let i = 1; i <= 4; i++) fork.push([f0[0] + i * (Math.random() * 0.8 + 0.4) * (Math.random() < 0.5 ? -1 : 1), f0[1] - i * 2.2, f0[2] + (Math.random() - 0.5) * 1.2]);
  addStrip(fork, 0.09);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ the controller
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const OVERCAST_TOP = new THREE.Color(0x5c6676), OVERCAST_BOT = new THREE.Color(0x9aa2ae);
const SNOWSKY_TOP = new THREE.Color(0x8a96a8), SNOWSKY_BOT = new THREE.Color(0xd8dde6);
const FOG_COL = new THREE.Color(0xc2cad2);
const HEAT_BOT = new THREE.Color(0xfff0b0);
const GREY = new THREE.Color(0x8a909a);

// season keyframes over the year (t = season index * 7 + day in season + hour share)
const KEYS = {
  green: [[0, 1], [14.2, 1], [15, 0.62], [16, 0.25], [17, 0], [27.5, 0], [28, 1]],
  bare: [[0, 0.8], [0.6, 0.6], [1.6, 0.2], [2.6, 0], [17.8, 0], [18.6, 0.12], [19.6, 0.4], [20.6, 0.75], [21.2, 1], [28, 0.8]],
  fresh: [[0, 1], [3, 0.9], [7, 0.25], [8, 0], [28, 0]],
  bloom: [[0, 0.1], [0.8, 0.4], [1.6, 1], [4, 1], [5.6, 0.3], [7, 0], [27.6, 0], [28, 0.1]],
  fall: [[0, 0.15], [2, 0], [14, 0], [15.5, 0.45], [17, 0.85], [19, 1], [21, 0.8], [24, 0.45], [28, 0.15]],
  dry: [[0, 0], [7, 0.1], [10, 0.32], [13, 0.4], [14.5, 0.2], [16, 0], [28, 0]],
  winter: [[0, 0.3], [1.5, 0], [19.5, 0], [21, 0.8], [22, 1], [27, 1], [28, 0.3]],
  litter: [[0, 0.3], [3, 0.15], [7, 0.1], [14, 0.15], [16, 0.7], [18, 1], [21, 0.8], [28, 0.3]],
};
function keyAt(keys, t) {
  t = ((t % 28) + 28) % 28;
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i], [b, vb] = keys[i + 1];
    if (t >= a && t <= b) return lerp(va, vb, (t - a) / Math.max(1e-6, b - a));
  }
  return keys[keys.length - 1][1];
}

export class WeatherFx {
  constructor(game, seasons) {
    this.game = game;
    this.S = seasons;
    this.time = 0;
    this.over = 0; // overcast 0..1 (smoothed)
    this.fogK = 0;
    this.heatK = 0;
    this.flash = 0;
    this.boltT = 0;
    this.strikeT = 6;
    this.rainSfxT = 0;
    this.windSfxT = 2;
    this.patched = new WeakSet();
    this.center = new THREE.Vector3();
    this.windV = new THREE.Vector2();
    this.res = new THREE.Vector2(640, 400);
    const scene = game.scene;
    this.rain = new PrecipLayer(scene, { count: 1800, kind: 0, color: 0xc4d8ee, color2: 0xa8c0dc, color3: 0xe0ecf8, alpha: 0.8, width: 1, len: 0.05, fall: 19, height: 14, name: 'rain' });
    this.snow = new PrecipLayer(scene, { count: 1400, kind: 1, color: 0xffffff, color2: 0xe8f0fa, color3: 0xd0dcec, alpha: 0.95, width: 1.4, fall: 1.25, height: 12, name: 'snowfall' });
    this.leaves = new PrecipLayer(scene, { count: 260, kind: 2, color: 0xd8401e, color2: 0xf08a1c, color3: 0xf2c030, alpha: 1, width: 1.6, fall: 1.0, height: 10, name: 'leaves' });
    this.petals = new PrecipLayer(scene, { count: 220, kind: 3, color: 0xf8b4c8, color2: 0xffe8ee, color3: 0xf27aa0, alpha: 1, width: 1.2, fall: 0.7, height: 9, name: 'petals' });
    this.shimmer = new PrecipLayer(scene, { count: 320, kind: 4, color: 0xfff6d8, color2: 0xffffff, color3: 0xffe8b0, alpha: 0.32, width: 1, len: 3, fall: -0.55, height: 3, name: 'shimmer' });
    this.mist = new MistLayer(scene, 70);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xeaf4ff, side: THREE.DoubleSide, fog: false });
    this.bolt = null;
    // scene fog (off: far away) so foggy days need no shader recompiles
    if (!scene.fog) scene.fog = new THREE.Fog(FOG_COL.getHex(), 1e5, 1e5 + 1);
    this.sceneFog = scene.fog;
    // sky hook (src/world/sky.js calls it inside update, before the water copies the sky)
    game.sky.weather = (sky, hour, time, night) => this.applySky(sky, hour, time, night);
    this.patchAll();
    this.wrapAmbient();
    this.snap();
  }

  // ---------------------------------------------------------------- materials
  patchAll() {
    const game = this.game, world = game.world;
    try {
      if (!SEA_U.uSeaCls.value) {
        const nat = world.natureFrames?.();
        const img = nat?.tex?.image;
        if (nat && img) SEA_U.uSeaCls.value = buildClassTexture(nat.frames, img.width, img.height);
      }
    } catch (e) { console.warn('[seasons] class texture', e); }
    const sprite = (mesh) => { if (mesh && !this.patched.has(mesh)) { this.patched.add(mesh); try { patchSpriteMaterial(mesh); } catch (e) { console.warn('[seasons] sprite patch', e); } } };
    if (SEA_U.uSeaCls.value) {
      sprite(world.treeBatch?.mesh);
      sprite(world.clutterBatch?.mesh);
      sprite(world.flatBatch?.mesh);
      for (const B of world.ring?.trees || []) sprite(B.mesh);
      sprite(game.structures?.sprites?.mesh);
      sprite(game.forage?.batch?.mesh);
    }
    try { patchTerrainMaterial(world.terrainMat); } catch (e) { console.warn('[seasons] terrain patch', e); }
    try { patchWaterMaterial(world.waterFx?.mat || world.water?.material); } catch (e) { console.warn('[seasons] water patch', e); }
    try { if (world.waterFx?.outer?.material) patchWaterMaterial(world.waterFx.outer.material); } catch (e) { console.warn('[seasons] river patch', e); }
    try { patchVoxelMaterial(voxelMaterial()); } catch (e) { console.warn('[seasons] voxel patch', e); }
    try { const gm = world.ring?.ground?.[0]?.material; if (gm) patchRingGround(gm); } catch (e) { console.warn('[seasons] ring patch', e); }
  }

  // ambient leaves / fireflies follow the season (Ambient.js calls particles.leaf / firefly)
  wrapAmbient() {
    const P = this.game.particles;
    if (!P || P._seaWrapped) return;
    P._seaWrapped = true;
    const leaf0 = P.leaf.bind(P), ff0 = P.firefly.bind(P);
    const PETAL = [0xf8b4c8, 0xffe8ee, 0xf27aa0], GREEN = [0x6a9a3a, 0x8ab040, 0x5a8a34];
    P.leaf = (x, y, z, color) => {
      if (y < 1.8) return leaf0(x, y, z, color); // sprouts, harvests: always
      const s = this.S.season;
      if (s === 'winter') return undefined;
      if (s === 'spring') { if (Math.random() < 0.55) return undefined; return leaf0(x, y, z, PETAL[Math.floor(Math.random() * 3)]); }
      if (s === 'summer') { if (Math.random() < 0.75) return undefined; return leaf0(x, y, z, GREEN[Math.floor(Math.random() * 3)]); }
      return leaf0(x, y, z, color);
    };
    P.firefly = (x, y, z) => {
      const s = this.S.season;
      if (s === 'winter' || (s === 'autumn' && Math.random() < 0.6) || (this.S.info.precip && Math.random() < 0.8)) return undefined;
      return ff0(x, y, z);
    };
  }

  // ---------------------------------------------------------------- season params
  seasonT() {
    const S = this.S;
    if (S.forced) return seasonIndex(S.forcedDay()) * 7 + 3.5;
    const day = S.day, h = S.hour;
    const share = clamp((h < 6 ? h + 24 : h) - 6, 0, 18) / 18;
    return seasonIndex(day) * 7 + dayInSeason(day) + share * 0.95;
  }

  snap() {
    this.over = this.S.info.over;
    this.fogK = this.S.weather === 'fog' ? this.S.intensityAt(this.S.hour) : 0;
    this.heatK = this.S.weather === 'heat' ? 1 : 0;
    this.applyUniforms(1);
  }

  applyUniforms(k = 1) {
    const S = this.S, U = SEA_U;
    const T = this.seasonT();
    const set = (u, v) => { U[u].value = k >= 1 ? v : lerp(U[u].value, v, k); };
    set('uSeaGreen', keyAt(KEYS.green, T));
    set('uSeaBare', keyAt(KEYS.bare, T));
    set('uSeaFresh', keyAt(KEYS.fresh, T));
    set('uSeaBloom', keyAt(KEYS.bloom, T));
    set('uSeaFall', keyAt(KEYS.fall, T));
    set('uSeaDry', clamp(keyAt(KEYS.dry, T) + (S.weather === 'heat' ? 0.3 : 0) - S.wet * 0.3, 0, 1));
    set('uSeaWinter', keyAt(KEYS.winter, T));
    set('uSeaLitter', keyAt(KEYS.litter, T));
    U.uSeaSnow.value = S.snow;
    U.uSeaIce.value = S.ice;
    U.uSeaWet.value = S.wet;
    U.uSeaRain.value = S.info.precip && S.snowShare < 0.5 ? S.intensity : 0;
    U.uSeaFog.value = this.fogK;
  }

  // ---------------------------------------------------------------- per frame
  update(simDt, dt) {
    this.time += dt;
    SEA_U.uSeaTime.value = this.time;
    const S = this.S;
    const W = S.info;
    this.over = lerp(this.over, W.over * (W.precip || S.weather === 'fog' ? 0.6 + 0.4 * S.intensity : 1), Math.min(1, dt * 0.5));
    this.fogK = lerp(this.fogK, S.weather === 'fog' ? S.intensity : W.precip ? S.intensity * 0.05 : 0, Math.min(1, dt * 0.4));
    this.heatK = lerp(this.heatK, S.weather === 'heat' ? S.intensity : 0, Math.min(1, dt * 0.4));
    this.applyUniforms(Math.min(1, dt * 0.5));
    // late-built sprite batches (garden plants, forage) get the season look too
    if ((this._pT = (this._pT || 0) - dt) <= 0) { this._pT = 2; this.patchAll(); }
    this.weatherSounds(dt);
    this.lightning(dt);
    this.rainOnWater(simDt > 0 ? simDt : dt * 0.5);
  }

  // positions the particle layers around the camera (render time)
  render(dt = 0.016) {
    const game = this.game, S = this.S;
    const rig = game.rig, R = game.renderer;
    const show = !game.titleMode && !game.overrideScene && !document.body.classList.contains('lt-pc');
    const W = S.info;
    const inten = show ? S.intensity : 0;
    const t = rig.target;
    this.center.set(t.x, t.y || 0, t.z);
    const half = (R.rtW || 640) * (rig.wupp || 0.05) * 0.5;
    const ext = Math.pow(2, Math.round(Math.log2(clamp(half * 1.25, 8, 64))));
    this.res.set(R.rtW || 640, R.rtH || 400);
    const wind = S.wind;
    const ang = 0.6 + Math.sin(this.time * 0.05) * 0.3;
    this.windV.set(Math.cos(ang) * (wind - 0.7) * 1.6, Math.sin(ang) * (wind - 0.7) * 0.8);
    const sn = S.snowShare;
    const precip = W.precip ? inten : 0;
    this.rain.set(precip * (1 - sn) * (S.weather === 'storm' ? 1 : 0.75), this.center, ext * 0.75, this.windV, this.res, this.time);
    this.rain.u.uFall.value = S.weather === 'storm' ? 24 : 18;
    this.snow.set(precip * sn * (S.weather === 'storm' ? 1 : 0.8), this.center, ext * 0.75, this.windV, this.res, this.time);
    this.snow.u.uKind.value = 1 + (wind - 1) * 0.6;
    const season = S.season;
    const leafAmt = show ? (season === 'autumn' ? (S.weather === 'wind' || S.weather === 'storm' ? 0.9 : 0.25) : season === 'summer' && S.weather === 'wind' ? 0.12 : 0) : 0;
    this.leaves.set(leafAmt, this.center, ext * 0.7, this.windV.clone().multiplyScalar(1.6), this.res, this.time);
    if (season === 'summer' && leafAmt) { this.leaves.u.uColor.value.setHex(0x5a9a34); this.leaves.u.uColor2.value.setHex(0x7ab040); this.leaves.u.uColor3.value.setHex(0x9ac050); }
    else { this.leaves.u.uColor.value.setHex(0xd8401e); this.leaves.u.uColor2.value.setHex(0xf08a1c); this.leaves.u.uColor3.value.setHex(0xf2c030); }
    const bloom = SEA_U.uSeaBloom.value;
    this.petals.set(show && season === 'spring' && !W.precip ? bloom * (S.weather === 'wind' ? 0.9 : 0.35) : 0, this.center, ext * 0.6, this.windV, this.res, this.time);
    const day = 1 - (game.sky.state.night || 0);
    this.shimmer.set(show ? this.heatK * day * 0.9 : 0, this.center, ext * 0.5, this.windV.clone().multiplyScalar(0.2), this.res, this.time);
    // ground mist on foggy days (and a little after rain)
    const M = this.mist;
    const mistAmt = show && S.weather === 'fog' ? clamp(this.fogK * 1.1, 0, 1) * clamp((half - 6) / 10, 0, 1) : 0; // close up the puffs would fill the screen
    M.u.uAmount.value = mistAmt;
    M.mesh.visible = mistAmt > 0.01;
    M.u.uTime.value = this.time;
    M.u.uCenter.value.copy(this.center);
    M.u.uExtent.value = ext * 0.8;
    M.u.uWind.value.copy(this.windV);
    const night = game.sky.state.night || 0;
    M.u.uColor.value.setRGB(0.86 - night * 0.6, 0.88 - night * 0.58, 0.92 - night * 0.5);
    // scene fog
    const F = this.sceneFog;
    if (F && game.scene.fog === F) {
      const k = show ? this.fogK : 0;
      if (k > 0.01) {
        const dist = rig.dist || 110;
        F.near = dist - 45 * k;
        F.far = dist + 30 + 160 * (1 - k);
        F.color.copy(FOG_COL).lerp(_c.setRGB(0.12, 0.14, 0.22), night * 0.85);
        SEA_U.uSeaSky.value.copy(F.color);
      } else { F.near = 1e5; F.far = 1e5 + 1; }
    }
    // the lightning flash on the post pass
    const U = R.postMat?.uniforms;
    if (U && show) {
      if (this.flash > 0.001) { U.flash.value = Math.max(U.flash.value, this.flash * 0.5); U.flashColor.value.setRGB(0.88, 0.92, 1.0); this._flashing = true; }
      else if (this._flashing) { this._flashing = false; U.flash.value = 0; }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    if (this.bolt) { this.boltT -= dt; this.bolt.visible = this.boltT > 0 && (this.boltT > 0.12 || this.boltT < 0.06); if (this.boltT <= -0.05) { this.game.scene.remove(this.bolt); this.bolt.geometry.dispose(); this.bolt = null; } }
  }

  // ---------------------------------------------------------------- sky
  applySky(sky, hour, time, night) {
    const game = this.game;
    if (game.titleMode) return;
    const u = sky.uniforms, s = sky.state;
    const ov = clamp(this.over, 0, 1) * (1 - Math.min(1, sky.bloodMoon || 0));
    const sn = this.S.snowShare * (this.S.info.precip ? 1 : 0.3);
    if (ov > 0.01) {
      const top = _c.copy(OVERCAST_TOP).lerp(SNOWSKY_TOP, sn), bot = _c2.copy(OVERCAST_BOT).lerp(SNOWSKY_BOT, sn);
      const nk = 1 - night * 0.75;
      u.uTop.value.lerp(top.multiplyScalar(nk), ov * 0.85);
      u.uBottom.value.lerp(bot.multiplyScalar(nk), ov * 0.8);
      sky.sun.intensity *= 1 - 0.68 * ov;
      sky.sun.color.lerp(GREY, ov * 0.45);
      sky.hemi.intensity *= 1 - 0.3 * ov + sn * 0.16;
      sky.hemi.color.lerp(_c.setRGB(0.78, 0.82, 0.9), ov * 0.4);
      s.waterShallow.lerp(_c.setRGB(0.25, 0.42, 0.45), ov * 0.4);
      s.waterDeep.lerp(_c.setRGB(0.16, 0.26, 0.36), ov * 0.4);
      s.skyTint.lerp(_c.setRGB(0.62, 0.66, 0.72), ov * 0.5);
      u.uNight.value *= 1 - ov * 0.85; // no stars through the clouds
      u.uAurora.value *= 1 - ov;
      s.aurora *= 1 - ov;
    }
    if (this.fogK > 0.01) {
      const f = this.fogK;
      u.uBottom.value.lerp(_c.copy(FOG_COL).multiplyScalar(1 - night * 0.8), f * 0.8);
      u.uTop.value.lerp(_c.copy(FOG_COL).multiplyScalar(0.85 - night * 0.7), f * 0.6);
      sky.sun.intensity *= 1 - 0.3 * f;
    }
    if (this.heatK > 0.01) {
      const h = this.heatK * (1 - night);
      u.uBottom.value.lerp(HEAT_BOT, h * 0.45);
      sky.sun.intensity *= 1 + 0.12 * h;
      sky.sun.color.lerp(_c.setRGB(1, 0.92, 0.72), h * 0.35);
      s.skyTint.lerp(_c.setRGB(1, 0.94, 0.8), h * 0.3);
    }
    // a clear winter day: crisp, cold light
    const w = SEA_U.uSeaWinter.value;
    if (w > 0.01 && ov < 0.5) { sky.sun.color.lerp(_c.setRGB(0.92, 0.95, 1.0), w * 0.35); sky.hemi.color.lerp(_c.setRGB(0.8, 0.86, 1.0), w * 0.25); }
    if (this.flash > 0.01) { sky.sun.intensity += this.flash * 2.2; sky.hemi.intensity += this.flash * 1.2; sky.sun.color.lerp(_c.setRGB(0.85, 0.9, 1), this.flash); }
    if (ov < 0.99) SEA_U.uSeaSky.value.copy(u.uBottom.value);
    void time; void hour;
  }

  // ---------------------------------------------------------------- storms
  lightning(dt) {
    const S = this.S, game = this.game;
    if (S.weather !== 'storm' || game.titleMode || S.intensity < 0.6) return;
    this.strikeT -= dt;
    if (this.strikeT > 0) return;
    this.strikeT = 6 + Math.random() * 9;
    this.strike();
  }

  strike(x = null, z = null) {
    const game = this.game;
    const t = game.rig.target;
    const R = game.renderer, half = (R.rtW || 640) * (game.rig.wupp || 0.05) * 0.5;
    if (x == null) { const a = Math.random() * Math.PI * 2, d = half * (0.5 + Math.random() * 0.7); x = t.x + Math.cos(a) * d; z = t.z + Math.sin(a) * d * 0.6 - half * 0.3; }
    const gy = game.grid?.inb(Math.floor(x), Math.floor(z)) ? game.grid.surfaceY(Math.floor(x), Math.floor(z)) : 0;
    if (this.bolt) { game.scene.remove(this.bolt); this.bolt.geometry.dispose(); }
    this.bolt = new THREE.Mesh(boltGeometry(x, z, gy, gy + 32), this.boltMat);
    this.bolt.renderOrder = 41;
    this.bolt.frustumCulled = false;
    game.scene.add(this.bolt);
    this.boltT = 0.22;
    this.flash = 1;
    const dist = Math.hypot(x - t.x, z - t.z);
    game.audio.play('thunder', { volume: clamp(0.85 - dist * 0.012, 0.35, 0.85), delay: 0.15 + dist * 0.025 });
    setTimeout(() => { if (this.game) this.flash = Math.max(this.flash, 0.6); }, 110);
    game.particles.puff?.(x, gy + 0.1, z, 6, 0.3);
    this.S.bears?.startle?.();
    game.emit('lightning', { x, z });
    return { x, z };
  }

  // rain rings on the water: real ripples in the height-field sim
  rainOnWater(dt) {
    const S = this.S, game = this.game;
    if (!S.info.precip || S.snowShare > 0.6 || !(dt > 0)) return;
    const sim = game.world?.sim, g = game.grid;
    if (!sim || !g) return;
    const rate = 40 * S.intensity * (S.weather === 'storm' ? 1.5 : 1);
    this._ringAcc = (this._ringAcc || 0) + rate * dt;
    const t = game.rig.target;
    const R = game.renderer, half = (R.rtW || 640) * (game.rig.wupp || 0.05) * 0.45;
    let tries = 0;
    while (this._ringAcc >= 1 && tries++ < 12) {
      this._ringAcc -= 1;
      const x = t.x + (Math.random() - 0.5) * half * 2, z = t.z + (Math.random() - 0.5) * half * 1.4;
      if (!g.isWater(Math.floor(x), Math.floor(z))) {
        if (Math.random() < 0.15) game.particles.fx.spawn('drop_s', x, g.groundAt?.(x, z) + 0.05 || 0.1, z, { vx: (Math.random() - 0.5) * 0.6, vy: 1, vz: (Math.random() - 0.5) * 0.6, grav: 8, life: 0.25, size: 0.05, bright: true });
        continue;
      }
      if (S.ice > 0.2) continue;
      sim.disturb(x, z, 0.1, 0.045);
    }
    if (this._ringAcc > 5) this._ringAcc = 0;
  }

  weatherSounds(dt) {
    const S = this.S, game = this.game;
    if (game.titleMode || !game.started) return;
    const precip = S.info.precip ? S.intensity : 0;
    if (precip > 0.08 && S.snowShare < 0.7) {
      this.rainSfxT -= dt;
      if (this.rainSfxT <= 0) { this.rainSfxT = 3.3; game.audio.play('rain_loop', { volume: 0.18 + precip * 0.4 * (S.weather === 'storm' ? 1.2 : 1) }); }
    }
    if (S.wind > 1.6) {
      this.windSfxT -= dt;
      if (this.windSfxT <= 0) { this.windSfxT = 3.5 + Math.random() * 5; game.audio.play('wind_gust', { volume: clamp((S.wind - 1.4) * 0.4, 0.1, 0.45), pan: Math.random() * 1.6 - 0.8 }); }
    }
    if (S.snow > 0.5) {
      // crunchy snow under the nearest walking bear
      this.crunchT = (this.crunchT || 0) - dt;
      if (this.crunchT <= 0) {
        this.crunchT = 0.42;
        const t = game.rig.target;
        let best = null, bd = 14;
        for (const b of game.bears?.list || []) { if (!b.visible || !b.moving || b.inWater) continue; const d = Math.hypot(b.x - t.x, b.z - t.z); if (d < bd) { bd = d; best = b; } }
        if (best) game.audio.play('snow_crunch', { volume: 0.22 * (1 - bd / 16), pitch: 0.9 + Math.random() * 0.25 });
      }
    }
  }
}

export { SEASONS };
