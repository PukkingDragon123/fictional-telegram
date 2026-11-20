"""The golden-hour main menu as one playable page: the exported layers scroll in parallax,
wide_shader.glsl lights the frame, the signpost menu sits on top.

    python3 wide_page.py OUT.html          (after wide_menu.py has exported main_menu_wide/)
"""
import base64, json, os, sys
from PIL import Image
import wide_menu as WM

ROOT = WM.ROOT


def uri(path):
    return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


PAGE = r'''<title>Golden Hour Teahouse</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400&display=swap">
<style>
/* One screen: the game's main menu at golden hour, scaled up crisp on a dusk-violet surround. */
:root { --bg: #16101f; --ink: #f2dcc0; --muted: #a58f9a; --gold: #f6c864; color-scheme: dark;
  --ui: "Pixelify Sans", "Courier New", monospace; }
html, body { height: 100%; }
body { background: var(--bg); color: var(--ink); font-family: var(--ui); margin: 0;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.wrap { min-height: 100%; display: grid; place-items: center; padding-block: 16px; gap: 10px; align-content: center; }
.screen { width: min(100%, 1920px, calc((100vh - 90px) * 16 / 9)); aspect-ratio: 16 / 9; max-width: 100%; position: relative;
  box-shadow: 0 0 0 3px #2e2036, 0 18px 50px rgba(0,0,0,.55); background: #2a1f3a; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; }
#ui { cursor: none; touch-action: none; }
.toast { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); background: rgba(22,16,31,.82);
  color: var(--gold); padding: 6px 14px; border: 2px solid #6a4a3a; font-size: clamp(12px, 1.6vw, 20px); }
p { margin: 0; color: var(--muted); font-size: 14px; text-align: center; }
</style>
<div class="wrap">
  <div class="screen"><canvas id="gl" width="640" height="360"></canvas>
    <canvas id="ui" width="640" height="360" aria-label="Main menu"></canvas>
    <div class="toast" id="toast" hidden></div></div>
  <p>The view drifts on its own. Drag the scenery to look around; click a board on the signpost.</p>
</div>
<script id="data" type="application/json">__DATA__</script>
<script id="shader" type="x-shader/x-fragment">__SHADER__</script>
<script>
(function () {
  const D = JSON.parse(document.getElementById('data').textContent);
  const W = 640, H = 360, TW = D.tile_w;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  const [sc, sg] = mk(), [skc, skg] = mk(), [lkc, lkg] = mk();
  const load = src => { const im = new Image(); im.src = src; return im; };
  D.layers.forEach(l => l.im = load(l.src));
  D.title.im = load(D.title.src); D.post.im = load(D.post.src); D.cursor.im = load(D.cursor.src);
  D.buttons.forEach(b => { b.ims = {}; for (const k in b.states) b.ims[k] = load(b.states[k]); b.strip = b.hover_strip && load(b.hover_strip); });

  // ---- the scene: every layer at its parallax offset, plus the sky and lake masks
  function blit(g, l, f, x) {
    const i = f % l.frames, r = Math.floor(i / l.cols), k = i % l.cols;
    g.drawImage(l.im, k * l.w, r * l.h, l.w, l.h, x, l.y, l.w, l.h);
  }
  function scene(f, cam) {
    skg.clearRect(0, 0, W, H); lkg.clearRect(0, 0, W, H);
    for (const l of D.layers) {
      if (!l.im.complete) continue;
      const ox = l.tile ? ((Math.floor(cam * l.rate) % TW) + TW) % TW : 0;
      const xs = l.tile ? [l.x - ox, l.x - ox + TW, l.x - ox - TW] : [l.x];
      for (const x of xs) {
        if (x + l.w <= 0 || x >= W) continue;
        sg.globalCompositeOperation = 'source-over'; blit(sg, l, f, x);
        if (l.name === 'sky') { skg.globalCompositeOperation = 'source-over'; blit(skg, l, f, x); continue; }
        skg.globalCompositeOperation = 'destination-out'; blit(skg, l, f, x);
        lkg.globalCompositeOperation = l.name === 'lake' ? 'source-over' : 'destination-out'; blit(lkg, l, f, x);
      }
    }
    // dust and seeds drifting in the low light
    for (const m of D.motes) {
      const x = Math.floor((m.x + f * m.s) % W), y = Math.floor(m.y + 6 * Math.sin(f * 0.05 + m.p));
      if (0.5 + 0.5 * Math.sin(f * 0.3 + m.p) > 0.35) {
        sg.fillStyle = Math.hypot(x - D.sun[0], y - D.sun[1]) < 260 ? D.mote_near : D.mote_far;
        sg.fillRect(x, y, 1, 1);
      }
    }
  }

  // ---- the shader
  const glc = document.getElementById('gl');
  const gl = glc.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  let P1, P2, T = {}, fbo, quad, out2d = null;
  function prog(fs) {
    const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function texture(filter, w, h) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  try {
    if (!gl) throw new Error('no webgl');
    const src = document.getElementById('shader').textContent.split('// ==== pass 2');
    P1 = prog(src[0]); P2 = prog('//' + src[1]);
    T.scene = texture(gl.NEAREST); T.sky = texture(gl.NEAREST); T.lake = texture(gl.NEAREST);
    T.hot = texture(gl.LINEAR, W / 4, H / 4);
    fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.hot, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  } catch (e) { console.warn('shader off:', e.message); P2 = null; out2d = glc.getContext('2d') || null; }

  function upload(t, c) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); }
  function bind(p, unit, name, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(p, name), unit); }
  function light(time) {
    if (!P2) { if (out2d) out2d.drawImage(sc, 0, 0); return; }
    upload(T.scene, sc); upload(T.sky, skc); upload(T.lake, lkc);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, W / 4, H / 4); gl.useProgram(P1);
    bind(P1, 0, 'uScene', T.scene); bind(P1, 1, 'uSky', T.sky);
    gl.uniform2f(gl.getUniformLocation(P1, 'uRes'), W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(P2);
    bind(P2, 0, 'uScene', T.scene); bind(P2, 1, 'uSky', T.sky); bind(P2, 2, 'uLake', T.lake); bind(P2, 3, 'uHot', T.hot);
    gl.uniform2f(gl.getUniformLocation(P2, 'uRes'), W, H);
    gl.uniform2f(gl.getUniformLocation(P2, 'uSun'), D.sun[0], D.sun[1]);
    gl.uniform1f(gl.getUniformLocation(P2, 'uHorizon'), D.horizon);
    gl.uniform1f(gl.getUniformLocation(P2, 'uTime'), time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---- the menu on top
  const uc = document.getElementById('ui'), ug = uc.getContext('2d'); ug.imageSmoothingEnabled = false;
  let hover = null, press = null, mx = -99, my = -99, drag = null, cam = D.start, f = 0, lastF = 0, lastT = null, idle = 0;
  function at(e) { const r = uc.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
  function hit(x, y) { return D.buttons.find(b => x >= b.hit[0] && x < b.hit[0] + b.hit[2] && y >= b.hit[1] && y < b.hit[1] + b.hit[3]) || null; }
  uc.addEventListener('pointermove', e => { const [x, y] = at(e);
    if (drag) { cam -= (x - drag) / 0.62; drag = x; idle = 0; } [mx, my] = [x, y]; hover = drag ? null : hit(mx, my); });
  uc.addEventListener('pointerleave', () => { hover = press = drag = null; mx = my = -99; });
  uc.addEventListener('pointerdown', e => { [mx, my] = at(e); hover = hit(mx, my); press = hover;
    if (!hover) { drag = mx; uc.setPointerCapture(e.pointerId); } });
  uc.addEventListener('pointerup', () => {
    if (press && press === hover) { const t = document.getElementById('toast'); t.textContent = press.label; t.hidden = false;
      clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 1400); }
    press = null; drag = null; });
  function sheet(l, i, x, y) { const r = Math.floor(i / l.cols), k = i % l.cols; ug.drawImage(l.im, k * l.w, r * l.h, l.w, l.h, x, y, l.w, l.h); }
  function menu() {
    ug.clearRect(0, 0, W, H);
    if (D.title.im.complete) sheet(D.title, f % D.title.frames, D.title.x, D.title.y);
    if (D.post.im.complete) ug.drawImage(D.post.im, D.post.x, D.post.y);
    const order = D.buttons.slice().sort((a, b) => (a === hover || a === press) - (b === hover || b === press));
    for (const b of order) {
      let im = b === press ? b.ims.pressed : (b === hover ? null : b.ims.normal);
      if (!im && b.strip && b.strip.complete) { const i = Math.floor(f / 1.5) % b.strip_frames;
        ug.drawImage(b.strip, i * b.w, 0, b.w, b.h, b.x, b.y, b.w, b.h); continue; }
      if (!im) im = b.ims.hover;
      if (im && im.complete) ug.drawImage(im, b.x, b.y);
    }
    if (mx > -50 && D.cursor.im.complete) { const cw = D.cursor.w, i = Math.floor(f / 3) % D.cursor.frames;
      ug.drawImage(D.cursor.im, i * cw, 0, cw, D.cursor.h, Math.round(mx) - D.cursor.hx, Math.round(my) - D.cursor.hy, cw, D.cursor.h); }
  }

  function tick(t) {
    const dt = lastT === null ? 0 : Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (!reduce) {
      if (t - lastF >= 1000 / D.fps) { lastF = t; f = (f + 1) % D.frames; }
      idle += dt; if (!drag && idle > 1.5) cam += D.speed * dt;
    }
    scene(f, cam);
    light(reduce ? 0 : t / 1000);
    menu();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__menu = { setCam: c => { cam = c; idle = -1e9; }, setFrame: k => { f = k; } };
})();
</script>
'''


def page(out_html, start=300.0):
    sc = json.load(open(os.path.join(ROOT, 'scene.json')))
    layers = []
    for k in sc['draw_order']:
        d = os.path.join(ROOT, 'layers', k)
        m = json.load(open(os.path.join(d, f'{k}.json')))
        layers.append(dict(name=k, src=uri(os.path.join(d, m['sheet'])), x=m['x'], y=m['y'], w=m['w'], h=m['h'],
                           cols=m['sheet_cols'], frames=m['frames'], rate=m['parallax'], tile=bool(m['tile_w'])))
    U = os.path.join(ROOT, 'ui')
    lay = json.load(open(os.path.join(U, 'layout.json')))
    tm = json.load(open(os.path.join(U, lay['title']['anim']['json'])))
    title = dict(src=uri(os.path.join(U, tm['sheet'])), x=lay['title']['x'], y=lay['title']['y'], w=tm['frame_w'],
                 h=tm['frame_h'], cols=tm['sheet_cols'], frames=tm['frames'])
    post = dict(src=uri(os.path.join(U, lay['signpost']['image'])), x=lay['signpost']['x'], y=lay['signpost']['y'])
    buttons = []
    for b in lay['buttons']:
        states = {st: uri(os.path.join(U, f'btn_{b["id"]}_{st}.png')) for st in ('normal', 'hover', 'pressed')
                  if os.path.exists(os.path.join(U, f'btn_{b["id"]}_{st}.png'))}
        strip = os.path.join(U, f'btn_{b["id"]}_hover_strip.png')
        sw = Image.open(strip).width if os.path.exists(strip) else 0
        buttons.append(dict(id=b['id'], label=b['label'], x=b['x'], y=b['y'], w=b['w'], h=b['h'], states=states,
                            hover_strip=uri(strip) if sw else None, strip_frames=max(1, sw // b['w']),
                            hit=b.get('hit_rect') or [b['x'] + 7, b['y'] + 7, b['w'] - 15, 19]))
    cj = json.load(open(os.path.join(U, 'cursor.json')))
    cim = Image.open(os.path.join(U, 'cursor_strip.png'))
    cfr = cj.get('frames', 4)
    hs = cj.get('hotspot', [2, 2])
    cursor = dict(src=uri(os.path.join(U, 'cursor_strip.png')), w=cim.width // cfr, h=cim.height, frames=cfr,
                  hx=hs[0], hy=hs[1])
    import random
    rng = random.Random(3)
    motes = []
    for _ in range(46):
        motes.append(dict(x=rng.uniform(0, WM.W), y=rng.uniform(40, 300), s=rng.uniform(0.15, 0.45),
                          p=rng.uniform(0, 6.28)))
    hexc = lambda c: '#%02x%02x%02x' % tuple(c)
    data = dict(fps=WM.FPS, frames=WM.N, tile_w=WM.TW, speed=WM.SPEED, horizon=WM.HORIZON, sun=list(WM.SUN),
                start=start, layers=layers, title=title, post=post, buttons=buttons, cursor=cursor, motes=motes,
                mote_near=hexc(WM.G.GOLD['g_sun'][1]), mote_far=hexc(WM.G.GOLD['gold'][3]))
    shader = open(os.path.join(ROOT, 'wide_shader.glsl')).read()
    html = PAGE.replace('__DATA__', json.dumps(data)).replace('__SHADER__', shader)
    os.makedirs(os.path.dirname(os.path.abspath(out_html)), exist_ok=True)
    open(out_html, 'w').write(html)
    print(f'{out_html}: {os.path.getsize(out_html) / 2 ** 20:.1f} MiB')


if __name__ == '__main__':
    page(sys.argv[1])
