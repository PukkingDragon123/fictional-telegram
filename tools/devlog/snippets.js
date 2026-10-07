// Code the devlog "types" on screen. Plain JS, coloured by a tiny tokenizer.
const KW = new Set(['const', 'let', 'function', 'return', 'if', 'else', 'for', 'of', 'new', 'this', 'while', 'true', 'false', 'null', 'uniform', 'float', 'vec2', 'vec3', 'vec4', 'void']);
function tokens(line) {
  const out = [];
  const re = /(\/\/.*$)|('[^']*'|"[^"]*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|([{}()[\];,.=<>+\-*/!?:&|]+)|(\s+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) out.push(['c', m[1]]);
    else if (m[2]) out.push(['s', m[2]]);
    else if (m[3]) out.push(['n', m[3]]);
    else if (m[4]) out.push([KW.has(m[4]) ? 'k' : 'f', m[4]]);
    else if (m[5]) out.push([KW.has(m[5]) ? 'k' : '', m[5]]);
    else if (m[6]) out.push(['p', m[6]]);
    else out.push(['', m[7]]);
  }
  return out;
}
const snip = (file, code, start = 1) => ({ file, start, lines: code.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n').map(tokens) });

export const SNIPPETS = {
  fish: snip('fish.js', `
function swim(fish, dt) {
  // wander: turn a little bit, randomly
  fish.angle += (Math.random() - 0.5) * 6 * dt;
  // too close to the shore? swim back
  if (distToShore(fish) < 1) turnToward(fish, pond.center);
  fish.x += Math.sin(fish.angle) * fish.speed * dt;
  fish.z += Math.cos(fish.angle) * fish.speed * dt;
  // two happy fish meet -> baby fish
  const mate = nearest(fish);
  if (mate && fish.love > 1 && mate.love > 1) spawnBaby(fish, mate);
}`, 12),
  rush: snip('bears.js', `
if (clock.hour >= 17 && !rushStarted) {
  rushStarted = true;   // 5:00 PM. office is out
  for (let i = 0; i < todaysBears; i++) {
    const bear = spawnBear(officeDoor, { delay: i * 0.3 });
    bear.goTo(randomPondEdge()).then(() => bear.cannonball());
  }
}`, 41),
  pixel: snip('pixel.frag', `
// 1. the scene renders at 1/3 resolution
vec4 col = texture(tColor, lowResUV);
// 2. outlines where the depth jumps
float d = depthAt(uv), edge = 0.0;
for (int i = 0; i < 4; i++) edge = max(edge, d - depthAt(uv + dir[i]));
col.rgb = mix(col.rgb, outlineTint, step(0.004, edge) * outlineAmt);
// 3. grade it: saturation, contrast, warm tint
col.rgb = grade(col.rgb) + bloom(uv) * bloomAmt;`, 88),
  build: snip('build.js', `
function place(type, x, z) {
  const s = structures.place(type, x, z);
  s.popT = 0.45;               // squash & stretch
  particles.puff(x, 0.2, z, 12); // dust ring
  particles.word('pow', x, 1.3, z);
  audio.play('pop_in', { pitch: 1 + combo * 0.06 });
  camera.shake = 0.1;
}`, 7),
  juice: snip('eat.js', `
onBite(bear, fish) {
  particles.word(pick(['chomp', 'munch', 'nom']), bear.mouth);
  bear.rig.squash(1.2);
  camera.shake += 0.05;
  audio.play('chomp', { pitch: 0.9 + Math.random() * 0.3 });
  ui.coins.fly(bear.mouth, fish.price);  // +$
}`, 64),
};
