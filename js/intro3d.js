/* Operation: Best Human — real-time 3D opening cinematic (three.js).
   Every shot is built and lit in code: the trophy case, the theft, the suspect lineup,
   the midnight clock and the logo hit. game.js drives the beats so music, sound,
   narration and picture stay in sync. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const dotTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const smokeTex = canvasTex(256, 256, (g, w) => {
  for (let i = 0; i < 26; i++) {
    const x = w / 2 + rand(-50, 50), y = w / 2 + rand(-50, 50), r = rand(30, 90);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }
});

// volumetric light cone: additive shader, bright at the source, fading with distance and at grazing angles
function beam(color, radius, height, op) {
  const g = new THREE.ConeGeometry(radius, height, 48, 1, true);
  g.translate(0, -height / 2, 0); // apex at the origin, opening downwards
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: op }, uH: { value: height } },
    vertexShader: `uniform float uH; varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ vH = clamp(-position.y / uH, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp; varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ float e = pow(abs(dot(vN, vV)), 1.4); float a = e * pow(1.0 - vH, 1.6) * uOp; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  return new THREE.Mesh(g, m);
}

class Intro3D {
  constructor(canvas) {
    this.canvas = canvas;
    const phone = Math.min(innerWidth, innerHeight) < 560;
    this.phone = phone;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(phone ? 1.5 : 2, devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x030207);
    s.fog = new THREE.FogExp2(0x05030a, 0.07);
    const pm = new THREE.PMREMGenerator(r);
    s.environment = pm.fromScene(new RoomEnvironment(r), 0.04).texture;
    s.environmentIntensity = 0.35;
    this.cam = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(s, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.clock = new THREE.Clock();
    this.t = 0; this.beatT = 0; this.beatName = null; this.shake = 0; this.hooks = [];
    this.build();
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.cam.aspect = w / h;
    // keep the subject framed on tall phone screens
    this.cam.fov = w / h < 1 ? 58 : 38;
    this.cam.updateProjectionMatrix();
  }

  /* ---------------- scene building ---------------- */
  build() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0x261c38, 0.6));
    // endless glossy floor
    if (!this.phone) {
      const mirror = new Reflector(new THREE.PlaneGeometry(400, 400), { textureWidth: innerWidth / 2, textureHeight: innerHeight / 2, color: 0x6a6378, multisample: 0 });
      mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.002; s.add(mirror);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x08060c, roughness: 0.45, metalness: 0.2, transparent: !this.phone, opacity: this.phone ? 1 : 0.86 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // drifting dust in the light
    const n = this.phone ? 900 : 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-8, 70); pos[i * 3 + 1] = rand(0, 6); pos[i * 3 + 2] = rand(-6, 6); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dotTex, color: 0xffd9a0, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.add(this.dust);
    this.buildTrophy(); this.buildLineup(); this.buildClock(); this.buildFinale();
  }

  buildTrophy() {
    const g = this.trophy = new THREE.Group(); this.scene.add(g);
    const marble = new THREE.MeshStandardMaterial({ color: 0x17131f, roughness: 0.22, metalness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.22, emissive: 0x3a1c00, emissiveIntensity: 0.4 });
    this.goldMat = gold;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.3, 1.25), marble); ped.position.y = 0.65; ped.castShadow = ped.receiveShadow = true; g.add(ped);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.42), marble); cap.position.y = 1.34; g.add(cap);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), marble); base.position.y = 0.06; g.add(base);
    [1.29, 0.13].forEach(y => { const t = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.02, 1.44), gold); t.position.y = y; g.add(t); });
    // engraved plaque on the pedestal
    const plaqueTex = canvasTex(512, 160, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5a3a10'); gr.addColorStop(0.5, '#e6b35a'); gr.addColorStop(1, '#6b4413');
      c.fillStyle = gr; c.fillRect(0, 0, w, h); c.strokeStyle = '#2a1a05'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#2a1805'; c.textAlign = 'center'; c.font = '700 54px Georgia, serif'; c.fillText('HALLOWEEN HEIST', w / 2, 82);
      c.font = '600 30px Georgia, serif'; c.fillText('CHAMPION · 99TH PRECINCT', w / 2, 128);
    });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.9, roughness: 0.3 }));
    plaque.position.set(0, 0.85, 0.626); g.add(plaque);
    // glass case with glowing edges
    const caseG = new THREE.BoxGeometry(1.1, 0.95, 1.1);
    const glass = new THREE.Mesh(caseG, new THREE.MeshPhysicalMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.08, roughness: 0, metalness: 0, clearcoat: 1, depthWrite: false }));
    glass.position.y = 1.86; g.add(glass);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(caseG), new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.85 }));
    edges.position.copy(glass.position); g.add(edges);
    this.glass = glass; this.edges = edges;
    // the golden cummerbund: a pleated, curved sash with an engraved buckle plate
    const sash = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 128, 40, true, -Math.PI * 0.8, Math.PI * 1.6);
    const p = sash.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // four sharp horizontal pleats, pinched a little at the back
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (y / 0.3 + 0.5) * 4, f = Math.abs((u % 1) - 0.5) * 2;
      const k = 1 + 0.05 * (1 - f * f) - 0.02 * Math.max(0, -z / 0.4);
      p.setXYZ(i, x * k, y, z * k);
    }
    sash.computeVertexNormals();
    const belt = new THREE.Group();
    const sashMesh = new THREE.Mesh(sash, new THREE.MeshPhysicalMaterial({ color: 0xc98a2a, metalness: 0.7, roughness: 0.42, sheen: 1, sheenColor: 0xffe2a0, sheenRoughness: 0.35, side: THREE.DoubleSide }));
    sashMesh.castShadow = true; sashMesh.rotation.y = Math.PI; belt.add(sashMesh);
    const plateTex = canvasTex(512, 256, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff1c4'); gr.addColorStop(0.6, '#e2a740'); gr.addColorStop(1, '#7a4a10');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#5a3606'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
      c.fillStyle = '#4a2a03'; c.textAlign = 'center'; c.font = '700 78px Georgia, serif'; c.fillText('BEST HUMAN', w / 2, 128);
      c.font = '600 34px Georgia, serif'; c.fillText('★  DETECTIVE  ★', w / 2, 186);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.03), [gold, gold, gold, gold, new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.85, roughness: 0.25, emissive: 0xffb050, emissiveMap: plateTex, emissiveIntensity: 0.25 }), gold]);
    plate.position.z = 0.445; belt.add(plate);
    belt.position.y = 1.78; belt.rotation.x = 0.12;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 16), gold); stand.position.y = 1.58; g.add(stand);
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.09, 64), new THREE.MeshPhysicalMaterial({ color: 0x2a0309, roughness: 0.9, sheen: 1, sheenColor: 0xa0202c, sheenRoughness: 0.5 }));
    cushion.position.y = 1.43; cushion.receiveShadow = true; g.add(cushion); this.cushion = cushion;
    g.add(belt); this.belt = belt; this.stand = stand;
    // key light from above with a visible beam
    const key = new THREE.SpotLight(0xffe0b0, 45, 12, 0.3, 0.55, 1.6); key.position.set(0.6, 7, 1.6); key.target.position.set(0, 1.6, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    g.add(key, key.target); this.key = key;
    const kb = beam(0xffd9a0, 1.4, 6.4, 0.22); kb.position.set(0, 7, 0.4); g.add(kb); this.keyBeam = kb;
    // gold sparkle glints around the sash
    const sp = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) { const a = rand(0, 7), r = rand(0.3, 0.75); sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = 1.5 + rand(0, 0.7); sp[i * 3 + 2] = Math.sin(a) * r; }
    const spg = new THREE.BufferGeometry(); spg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(spg, new THREE.PointsMaterial({ map: dotTex, color: 0xffe7b0, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.sparks);
    const rimL = new THREE.SpotLight(0x7fa6ff, 25, 10, 0.5, 0.6, 1.5); rimL.position.set(-1.5, 3.5, -3); rimL.target.position.set(0, 1.8, 0); g.add(rimL, rimL.target);
    // police lights washing the room
    this.red = new THREE.PointLight(0xff2030, 0, 14, 1.4); this.red.position.set(-4, 2.2, 2);
    this.blue = new THREE.PointLight(0x2050ff, 0, 14, 1.4); this.blue.position.set(4, 2.2, 2);
    g.add(this.red, this.blue);
    // background: rows of distant columns so the camera has parallax to move against
    const colMat = new THREE.MeshStandardMaterial({ color: 0x100c16, roughness: 0.5, metalness: 0.3 });
    for (let i = -4; i <= 4; i++) {
      if (!i) continue;
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.45, 8, 0.45), colMat); c.position.set(i * 2.4, 4, -6); g.add(c);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 7.5, 0.03), new THREE.MeshBasicMaterial({ color: 0xff8a3d })); strip.position.set(i * 2.4 + 0.24 * Math.sign(i), 4, -5.76); g.add(strip);
    }
    // the precinct emblem on the back wall: a neon shield with 99
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshStandardMaterial({ color: 0x0d0a12, roughness: 0.9 })); wall.position.set(0, 6, -6.4); g.add(wall);
    const sh = new THREE.Shape(); sh.moveTo(0, 1.5); sh.lineTo(1.25, 1.05); sh.lineTo(1.25, 0.1); sh.quadraticCurveTo(1.15, -1.0, 0, -1.55); sh.quadraticCurveTo(-1.15, -1.0, -1.25, 0.1); sh.lineTo(-1.25, 1.05); sh.closePath();
    const shieldLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sh.getPoints(64)), new THREE.LineBasicMaterial({ color: 0xffc070 }));
    shieldLine.position.set(0, 3.3, -6.3); g.add(shieldLine);
    const t99 = canvasTex(512, 512, (c, w) => { c.font = '400 330px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd08a'; c.shadowColor = '#ff8a3d'; c.shadowBlur = 30; c.fillText('99', w / 2, w / 2 + 20); });
    const e99 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: t99, transparent: true, depthWrite: false })); e99.position.set(0, 3.25, -6.28); g.add(e99);
    this.emblem = [shieldLine, e99];
    // theft: shattered glass and smoke
    this.shards = [];
    const shardMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.55, roughness: 0, metalness: 0.2, side: THREE.DoubleSide, emissive: 0x334466, emissiveIntensity: 0.6 });
    for (let i = 0; i < 70; i++) {
      const tri = new THREE.BufferGeometry(); const sz = rand(0.04, 0.16);
      tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, sz, rand(-sz, sz), 0, rand(-sz, sz), sz, 0]), 3)); tri.computeVertexNormals();
      const m = new THREE.Mesh(tri, shardMat); m.visible = false; g.add(m);
      this.shards.push({ m, v: V(0, 0, 0), w: V(rand(-6, 6), rand(-6, 6), rand(-6, 6)) });
    }
    this.smoke = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x3a2f48, transparent: true, opacity: 0, depthWrite: false }));
      m.position.set(rand(-3, 3), rand(0.2, 3), rand(-4, -0.5)); m.scale.setScalar(rand(2, 4)); g.add(m);
      this.smoke.push({ m, sp: rand(0.05, 0.2), rot: rand(-0.2, 0.2) });
    }
    this.alarmLight = new THREE.SpotLight(0xff1a1a, 0, 15, 0.5, 0.4, 1.2); this.alarmLight.position.set(0, 4.6, -2.5); g.add(this.alarmLight, this.alarmLight.target);
    const ab = beam(0xff2a2a, 1.6, 6, 0.0); ab.position.copy(this.alarmLight.position); g.add(ab); this.alarmBeam = ab;
  }

  buildLineup() {
    const g = this.lineup = new THREE.Group(); g.position.x = 30; this.scene.add(g); g.visible = false;
    // height chart wall, lit from the front so the suspects read as black cut-outs against it
    const wallTex = canvasTex(2048, 1024, (c, w, h) => {
      const bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1d1a24'); bg.addColorStop(1, '#322c3b');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      for (let i = 0; i <= 16; i++) {
        const y = h - 30 - i * 60; c.fillStyle = i % 2 ? '#6d6480' : '#a59bb8'; c.fillRect(0, y, w, i % 2 ? 3 : 6);
        if (!(i % 2)) { c.font = '600 34px Inter, Arial, sans-serif'; c.fillStyle = '#b8aecb'; c.fillText(`${(i / 2 + 3)}'`, 24, y - 10); c.fillText(`${(i / 2 + 3)}'`, w - 70, y - 10); }
      }
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
    wall.position.set(0, 3.0, -0.9); wall.receiveShadow = true; g.add(wall);
    const ink = new THREE.MeshStandardMaterial({ color: 0x030205, roughness: 0.35, metalness: 0.4 });
    // hand-drawn silhouettes: half an outline, mirrored, with per-person build
    const person = ({ sh = 1, hip = 1, head = 1, hair = 0, h = 1, arms = 'side', skirt = 0, bulk = 1 }) => {
      const R = [
        [0, 0.82], [0.045, 0.06], [0.05, 0], [0.17, 0], [0.15, 0.07], [0.165 * hip, 0.48], [0.18 * hip + skirt, 0.8 + skirt * 0.6],
        ...(arms === 'side' ? [[0.19 * hip, 0.86], [0.205 * bulk, 0.9], [0.22 * bulk, 0.76], [0.27 * bulk, 0.74], [0.285 * bulk, 0.86], [0.3 * bulk, 1.08], [0.29 * sh * bulk, 1.3]]
          : arms === 'hips' ? [[0.19 * hip, 0.88], [0.2, 0.95], [0.33 * bulk, 1.0], [0.36 * bulk, 1.08], [0.3 * sh * bulk, 1.3]]
          : [[0.19 * hip, 0.9], [0.24 * bulk, 1.05], [0.26 * bulk, 1.12], [0.28 * sh * bulk, 1.3]]),
        [0.27 * sh * bulk, 1.42], [0.2 * sh, 1.5], [0.07, 1.53], [0.055, 1.58],
        ...(hair ? [[0.13 * head, 1.5], [0.125 * head, 1.68], [0.1 * head, 1.79]] : [[0.075 * head, 1.6], [0.1 * head, 1.68], [0.095 * head, 1.77]]),
        [0.06 * head, 1.82], [0, 1.83],
      ];
      const shp = new THREE.Shape();
      R.forEach(([x, y], i) => shp[i ? 'lineTo' : 'moveTo'](x, y * h));
      [...R].reverse().forEach(([x, y]) => shp.lineTo(-x, y * h));
      const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3, curveSegments: 4 });
      geo.translate(0, 0, -0.06);
      const m = new THREE.Mesh(geo, ink); m.castShadow = true; return m;
    };
    const people = [
      { n: 'PERALTA', o: { h: 1.0, arms: 'pockets' }, lean: 0.05 },
      { n: 'DIAZ', o: { h: 0.95, hair: 1, arms: 'crossed', sh: 0.95 }, lean: 0 },
      { n: 'BOYLE', o: { h: 0.9, hip: 1.1, sh: 0.95 }, lean: -0.03 },
      { n: 'LINETTI', o: { h: 0.94, hair: 1, arms: 'hips', hip: 0.95, sh: 0.9 }, lean: 0.07 },
      { n: 'JEFFORDS', o: { h: 1.06, sh: 1.35, bulk: 1.3, hip: 1.15, head: 1.05 }, lean: 0 },
      { n: 'HOLT', o: { h: 1.04, sh: 1.05 }, lean: 0 },
    ];
    this.suspects = people.map((p, i) => {
      const x = (i - 2.5) * 1.5;
      const f = new THREE.Group(); f.add(person(p.o)); f.rotation.z = p.lean; f.position.set(x, 6, 0); g.add(f);
      // a pool of light on the wall behind each suspect, and a hot rim from above
      const pool = new THREE.SpotLight(0xffe4c8, 0, 9, 0.36, 0.75, 1.2); pool.position.set(x, 5.6, 0.25); pool.target.position.set(x, 1.7, -0.9); g.add(pool, pool.target);
      const rim = new THREE.SpotLight(0xff9a50, 0, 6, 0.5, 0.5, 1.4); rim.position.set(x, 4.2, -0.6); rim.target.position.set(x, 0.8, 0.2); g.add(rim, rim.target);
      const bm = beam(0xffc890, 0.75, 4.2, 0); bm.position.set(x, 4.3, 0.4); g.add(bm);
      const placard = canvasTex(512, 140, (c, w, h) => {
        c.fillStyle = '#16131a'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#d8cfbf'; c.font = '400 96px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.fillText(`${i + 1}  ${p.n}`, w / 2, 104);
      });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.17), new THREE.MeshStandardMaterial({ map: placard, transparent: true, opacity: 0, roughness: 0.6 }));
      pl.position.set(x, 0.9, 0.12); f.add(pl); pl.position.set(0, 0.95 * (p.o.h || 1), 0.11);
      return { f, rim, pool, bm, pl, x, drop: -1 };
    });
    this.lineKey = new THREE.SpotLight(0xff3020, 0, 20, 0.9, 0.6, 1); this.lineKey.position.set(0, 7, 5); this.lineKey.target.position.set(0, 1, 0); g.add(this.lineKey, this.lineKey.target);
  }

  buildClock() {
    const g = this.clockG = new THREE.Group(); g.position.set(60, 3, 0); this.scene.add(g); g.visible = false;
    const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 1, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0a10, metalness: 0.6, roughness: 0.4 });
    // gears turning behind the dial
    const gear = (R, teeth, depth) => {
      const sh = new THREE.Shape(), inner = R * 0.86;
      for (let i = 0; i < teeth * 2; i++) { const a0 = i / (teeth * 2) * Math.PI * 2, a1 = (i + 1) / (teeth * 2) * Math.PI * 2, r = i % 2 ? inner : R; const f = i ? 'lineTo' : 'moveTo'; sh[f](Math.cos(a0) * r, Math.sin(a0) * r); sh.lineTo(Math.cos(a1) * r, Math.sin(a1) * r); }
      const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.25, 0, Math.PI * 2, true); sh.holes.push(hole);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, c = new THREE.Path(); c.absarc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.16, 0, Math.PI * 2, true); sh.holes.push(c); }
      return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 6 });
    };
    this.gears = [[2.2, 36, -2.2, 1.4, -1.6, 1], [1.4, 24, 2.6, -1.2, -1.2, -1.5], [1.0, 18, 2.4, 1.9, -1.0, 2.2], [1.7, 30, -2.6, -2.0, -1.9, -0.8]].map(([R, t, x, y, z, sp]) => {
      const m = new THREE.Mesh(gear(R, t, 0.18), brass); m.position.set(x, y, z); g.add(m); return { m, sp };
    });
    // the dial
    const face = new THREE.Mesh(new THREE.CircleGeometry(2.3, 96), dark); g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.36, 0.07, 16, 128), new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.2 })); g.add(rim);
    this.tickMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffb050, emissiveIntensity: 0.9 });
    for (let i = 0; i < 60; i++) {
      const big = i % 5 === 0, a = i / 60 * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.07 : 0.03, big ? 0.3 : 0.14, 0.03), this.tickMat);
      const r = big ? 2.0 : 2.07; t.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.03); t.rotation.z = -a; g.add(t);
    }
    const numTex = canvasTex(1024, 1024, (c, w) => {
      c.fillStyle = '#ffd99a'; c.font = '400 120px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; c.fillText(String(i), w / 2 + Math.sin(a) * 340, w / 2 - Math.cos(a) * 340); }
    });
    const nums = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: numTex, transparent: true, color: 0xffd9a0 }));
    nums.position.z = 0.02; g.add(nums); this.nums = nums;
    const hand = (len, wid, mat) => { const geo = new THREE.BoxGeometry(wid, len, 0.04); geo.translate(0, len / 2 - 0.18, 0); const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
    const handMat = new THREE.MeshStandardMaterial({ color: 0xfff0d0, metalness: 0.8, roughness: 0.25, emissive: 0xffd9a0, emissiveIntensity: 0.35 });
    this.hHour = hand(1.25, 0.12, handMat); this.hHour.position.z = 0.08;
    this.hMin = hand(1.8, 0.08, handMat); this.hMin.position.z = 0.12;
    this.hSec = hand(2.0, 0.025, new THREE.MeshBasicMaterial({ color: 0xff3b2f })); this.hSec.position.z = 0.16;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 24), handMat); pin.rotation.x = Math.PI / 2; pin.position.z = 0.2; g.add(pin);
    this.setTime(10, 59, 55);
    this.clockLight = new THREE.PointLight(0xffb060, 10, 12, 1.6); this.clockLight.position.set(0, 0.5, 3.5); g.add(this.clockLight);
  }
  setTime(h, m, s) {
    const A = x => -x * Math.PI * 2;
    this.hSec.rotation.z = A(s / 60); this.hMin.rotation.z = A((m + s / 60) / 60); this.hHour.rotation.z = A(((h % 12) + m / 60) / 12);
  }

  buildFinale() {
    const g = this.finale = new THREE.Group(); g.position.set(90, 2.5, 0); this.scene.add(g); g.visible = false;
    const n = this.phone ? 700 : 1400; this.burstN = n;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); this.burstV = [];
    for (let i = 0; i < n; i++) {
      const d = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 9));
      this.burstV.push(d);
      const c = new THREE.Color().setHSL(rand(0.02, 0.11), 1, rand(0.5, 0.7)); col.set([c.r, c.g, c.b], i * 3);
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.burst = new THREE.Points(bg, new THREE.PointsMaterial({ map: dotTex, size: 0.12, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.burst);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 128), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    g.add(ring); this.ring = ring;
    this.finaleLight = new THREE.PointLight(0xff8a3d, 0, 30, 1.2); g.add(this.finaleLight);
  }

  /* ---------------- beats ---------------- */
  beat(name) {
    this.beatName = name; this.beatT = 0;
    this.trophy.visible = name === 'trophy' || name === 'theft';
    this.lineup.visible = name === 'lineup';
    this.clockG.visible = name === 'clock';
    this.finale.visible = name === 'finale';
    if (name === 'theft') {
      this.belt.visible = false; this.stand.visible = true; this.sparks.visible = false;
      this.glass.material.opacity = 0.05; this.edges.material.color.set(0xff6b5e);
      // the front pane has already blown out: shards hang in the air in slow motion
      this.shards.forEach(sh => { sh.m.visible = true; sh.m.position.set(rand(-0.55, 0.55), rand(1.4, 2.3), 0.56 + rand(0, 0.1)); sh.v.set(rand(-0.6, 0.6), rand(-0.1, 0.6), rand(0.4, 1.6)); });
    }
    if (name === 'finale') {
      const p = this.burst.geometry.attributes.position; p.array.fill(0); p.needsUpdate = true;
      this.burstT = -1;
    }
  }
  drop(i) { if (this.suspects[i]) this.suspects[i].drop = 0; }
  hit() { this.shake = 1; }
  alarm() { this.isAlarm = true; this.tickMat.emissive.set(0xff2a1a); this.nums.material.color.set(0xff6a5a); this.clockLight.color.set(0xff3020); }
  boom() { this.burstT = 0; this.shake = 1.2; }
  tick(s) { this.setTime(s < 60 ? 10 : 11, s < 60 ? 59 : 0, s % 60); this.tickPulse = 1; }

  /* ---------------- per-frame animation ---------------- */
  frame(draw = true) {
    const dt = this.forceDt != null ? this.forceDt : Math.min(0.05, this.clock.getDelta()); this.t += dt; this.beatT += dt;
    const t = this.t, bt = this.beatT, cam = this.cam;
    const look = V(0, 1.7, 0);
    // dust drifts
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) { let y = dp.getY(i) + dt * 0.05; if (y > 6) y = 0; dp.setY(i, y); dp.setX(i, dp.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.02); }
    dp.needsUpdate = true;

    if (this.beatName === 'trophy') {
      // slow crane down and push in on the case while the sash turns
      const k = ease(clamp(bt / 7.5, 0, 1));
      cam.position.set(lerp(-2.6, 0.9, k), lerp(3.6, 1.95, k), lerp(7.5, 2.7, k));
      look.set(0, lerp(1.4, 1.8, k), 0);
      this.belt.rotation.y = Math.sin(t * 0.35) * 0.55;
      this.red.intensity = 22 * Math.max(0, Math.sin(t * 7)); this.blue.intensity = 22 * Math.max(0, Math.sin(t * 7 + Math.PI));
      this.sparks.material.opacity = 0.5 + 0.5 * Math.sin(t * 9);
      this.sparks.rotation.y = t * 0.2;
      this.key.intensity = 45; this.keyBeam.material.uniforms.uOp.value = 0.35;
    } else if (this.beatName === 'theft') {
      // handheld camera, key light flickering, red alarm sweeping through smoke
      const k = ease(clamp(bt / 6, 0, 1));
      cam.position.set(lerp(1.8, 0.4, k) + Math.sin(t * 1.7) * 0.04, lerp(2.2, 1.9, k) + Math.sin(t * 2.3) * 0.03, lerp(3.6, 2.3, k));
      look.set(0, 1.8, 0);
      const flick = Math.random() < 0.08 ? 0.1 : 1;
      this.key.intensity = 30 * flick; this.keyBeam.material.uniforms.uOp.value = 0.22 * flick;
      this.red.intensity = 0; this.blue.intensity = 0;
      this.alarmLight.intensity = 140; this.alarmBeam.material.uniforms.uOp.value = 0.45;
      const a = t * 2.4; this.alarmLight.target.position.set(Math.sin(a) * 4, 0, Math.cos(a) * 4); this.alarmBeam.lookAt(this.alarmLight.target.position); this.alarmBeam.rotateX(-Math.PI / 2);
      this.shards.forEach(sh => { sh.m.position.addScaledVector(sh.v, dt * 0.35); sh.v.y -= dt * 0.9; if (sh.m.position.y < 0.02) { sh.m.position.y = 0.02; sh.v.multiplyScalar(0.3); } sh.m.rotation.x += sh.w.x * dt * 0.3; sh.m.rotation.y += sh.w.y * dt * 0.3; });
      this.smoke.forEach(s => { s.m.material.opacity = Math.min(0.32, bt * 0.15); s.m.position.y += s.sp * dt; s.m.material.rotation += s.rot * dt; s.m.scale.multiplyScalar(1 + dt * 0.05); });
    } else if (this.beatName === 'lineup') {
      // track along the line as each suspect drops in, then pull back to see all six
      const n = this.suspects.filter(s => s.drop >= 0).length;
      const target = n >= 6 ? 0 : this.suspects[Math.max(0, n - 1)].x;
      this.lineX = this.lineX === undefined ? -4 : lerp(this.lineX, target, 1 - Math.pow(0.02, dt));
      const wide = n >= 6 ? ease(clamp((bt - 2.1) / 2.4, 0, 1)) : 0;
      cam.position.set(30 + this.lineX * (1 - wide) + Math.sin(t * 0.4) * 0.15, lerp(1.25, 1.6, wide), lerp(4.6, 9.6, wide));
      look.set(30 + this.lineX * (1 - wide), lerp(1.35, 1.45, wide), 0);
      this.lineKey.intensity = 2 + 2 * Math.max(0, Math.sin(t * 6));
      this.suspects.forEach(s => {
        if (s.drop < 0) return;
        s.drop += dt;
        const d = clamp(s.drop / 0.42, 0, 1);
        const y = d < 1 ? 6 * (1 - easeOut(d) * easeOut(d)) : Math.abs(Math.sin((s.drop - 0.42) * 14)) * 0.06 * Math.exp(-(s.drop - 0.42) * 8);
        s.f.position.y = y;
        const on = clamp((s.drop - 0.3) / 0.25, 0, 1);
        s.pool.intensity = 55 * on * (0.9 + 0.1 * Math.sin(t * 23 + s.x * 3)); s.rim.intensity = 30 * on; s.bm.material.uniforms.uOp.value = 0.18 * on; s.pl.material.opacity = on;
      });
    } else if (this.beatName === 'clock') {
      // drift in on the dial while the gears grind
      const k = ease(clamp(bt / 6.5, 0, 1));
      cam.position.set(60 + lerp(-4.2, 0.2, k), 3 + lerp(-1.6, 0.1, k), lerp(6.5, 7.6, k));
      look.set(60, 3, 0);
      this.gears.forEach(gq => { gq.m.rotation.z += gq.sp * dt * 0.35; });
      this.tickPulse = (this.tickPulse || 0) * Math.pow(0.02, dt);
      this.tickMat.emissiveIntensity = 0.8 + this.tickPulse * 1.2 + (this.isAlarm ? 0.9 * Math.max(0, Math.sin(t * 7)) : 0);
      this.clockLight.intensity = 10 + this.tickPulse * 18;
    } else if (this.beatName === 'finale') {
      cam.position.set(90 + Math.sin(t * 0.3) * 0.5, 2.5, 9 - Math.min(bt, 6) * 0.25);
      look.set(90, 2.5, 0);
      if (this.burstT >= 0) {
        this.burstT += dt;
        const bt2 = this.burstT, p = this.burst.geometry.attributes.position;
        const k = 1 - Math.exp(-bt2 * 2.2);
        for (let i = 0; i < this.burstN; i++) { const v = this.burstV[i]; p.setXYZ(i, v.x * k, v.y * k - bt2 * bt2 * 0.12, v.z * k); }
        p.needsUpdate = true;
        this.burst.material.opacity = clamp(1.4 - bt2 * 0.28, 0, 1);
        this.ring.material.opacity = clamp(1 - bt2 * 0.9, 0, 1); this.ring.scale.setScalar(0.5 + easeOut(clamp(bt2 / 1.2, 0, 1)) * 16);
        this.finaleLight.intensity = 300 * Math.exp(-bt2 * 2.5);
      }
    }
    // camera shake on hits
    if (this.shake > 0.001) { cam.position.x += rand(-1, 1) * 0.06 * this.shake; cam.position.y += rand(-1, 1) * 0.05 * this.shake; this.shake *= Math.pow(0.004, dt); }
    cam.lookAt(look);
    if (draw) this.composer.render(dt);
  }
  start() {
    if (this.raf) return;
    this.clock.start();
    const loop = () => { this.raf = requestAnimationFrame(loop); try { this.frame(); } catch (e) { console.warn('intro 3D', e); this.stop(); } };
    loop();
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  // test hook: advance the film by a fixed amount of time without the render loop
  advance(sec, fps = 30) { this.stop(); this.forceDt = 1 / fps; const n = Math.round(sec * fps); for (let i = 0; i < n; i++) this.frame(i === n - 1); this.forceDt = null; }
  dispose() { this.stop(); this.renderer.dispose(); this.canvas.remove(); }
}

try {
  const canvas = document.getElementById('intro3d');
  if (canvas) window.Intro3D = new Intro3D(canvas);
} catch (e) { console.warn('3D intro unavailable', e); }
window.dispatchEvent(new Event('intro3d-ready'));
