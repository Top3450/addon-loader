'use strict';
/* 3D viewport: Bedrock-coordinate model rendering, touch orbit/zoom/pan, picking, pose preview */
const D2R = Math.PI / 180;
S.View = {
  init(canvas) {
    this.cv = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.setClearColor(0x0f1810);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.55); d1.position.set(-0.6, 1, -0.8); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.28); d2.position.set(0.7, 0.4, 0.9); this.scene.add(d2);
    const g1 = new THREE.GridHelper(48, 48, 0x22332a, 0x1b281d); this.scene.add(g1);
    const g2 = new THREE.GridHelper(48, 3, 0x4c6e50, 0x4c6e50); g2.position.y = 0.02; this.scene.add(g2);
    const front = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 3), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
    front.rotation.x = -Math.PI / 2; front.position.set(0, 0.05, -26); this.scene.add(front); // marks the model's front (-Z)
    const ax = (to, col) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), to]); return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col })); };
    this.scene.add(ax(new THREE.Vector3(-8, 0.05, 0), 0xe0574f), ax(new THREE.Vector3(0, 0.05, 8), 0x4f8fe0)); // Bedrock +X is -X here
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.orb = { theta: Math.PI - 0.62, phi: 0.38, r: 70, target: new THREE.Vector3(0, 12, 0) };
    this.meshes = []; this.boneObj = {}; this.texMap = new Map();
    this.paint = false; this.dirty = true; this.ticker = null; this.asset = null;
    this._bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const live = this.ticker ? this.ticker(dt) : false;
      if ((live || this.dirty) && this.cv.offsetParent !== null) { this._render(); this.dirty = false; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  resize() {
    const p = this.cv.parentElement, w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.dirty = true;
  },
  _render() {
    const o = this.orb;
    this.cam.position.set(o.target.x + o.r * Math.cos(o.phi) * Math.sin(o.theta), o.target.y + o.r * Math.sin(o.phi), o.target.z + o.r * Math.cos(o.phi) * Math.cos(o.theta));
    this.cam.lookAt(o.target);
    this.r.render(this.scene, this.cam);
  },
  frame(a) {
    let min = [-8, 0, -8], max = [8, 16, 8];
    if (a && a.model && (a.kind === 'entity' || a.cfg.custom)) { const b = S.bounds(a); min = b.min; max = b.max; }
    const c = [(min[0] + max[0]) / -2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 8);
    this.orb.target.set(c[0], c[1], c[2]); this.orb.r = size * 2.3 + 12; this.orb.theta = Math.PI - 0.62; this.orb.phi = 0.38;
    this.dirty = true;
  },
  // ---------- textures ----------
  texFor(a) {
    const cv = S.texCanvas(a);
    let t = this.texMap.get(cv);
    if (!t) {
      t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      this.texMap.set(cv, t);
    }
    return t;
  },
  texUpdated(a) { const cv = S.texCache.get(a.id); if (cv) { const t = this.texMap.get(cv.canvas); if (t) t.needsUpdate = true; } this.dirty = true; },
  // ---------- geometry ----------
  cubeGeo(c, W, H) {
    const inf = c.inflate || 0;
    const hx = Math.max(0.001, c.size[0] / 2 + inf), hy = Math.max(0.001, c.size[1] / 2 + inf), hz = Math.max(0.001, c.size[2] / 2 + inf);
    const x0 = -hx, x1 = hx, y0 = -hy, y1 = hy, z0 = -hz, z1 = hz;
    const R = S.faceRects(c);
    if (c.mirror) { const e = R.east; R.east = R.west; R.west = e; }
    // vertex order: TL, TR, BL, BR (as seen on the texture)
    const F = {
      north: { n: [0, 0, -1], v: [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]] },
      south: { n: [0, 0, 1], v: [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]] },
      east: { n: [1, 0, 0], v: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]] },
      west: { n: [-1, 0, 0], v: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]] },
      up: { n: [0, 1, 0], v: [[x1, y1, z1], [x0, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
      down: { n: [0, -1, 0], v: [[x1, y0, z0], [x0, y0, z0], [x1, y0, z1], [x0, y0, z1]] }
    };
    const pos = [], nor = [], uv = [], idx = [], faces = [];
    for (const f in F) {
      const [u, v, w, h] = R[f], base = pos.length / 3;
      let uL = u / W, uR = (u + w) / W; const vT = 1 - v / H, vB = 1 - (v + h) / H;
      if (c.mirror) { const t = uL; uL = uR; uR = t; }
      const uvs = [[uL, vT], [uR, vT], [uL, vB], [uR, vB]];
      F[f].v.forEach((p, i) => { pos.push(...p); nor.push(...F[f].n); uv.push(...uvs[i]); });
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      faces.push(f, f);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.userData.faces = faces;
    return g;
  },
  clear() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.root.clear(); this.meshes = []; this.boneObj = {};
  },
  build(a) {
    this.clear(); this.asset = a; this.dirty = true;
    if (!a) return;
    const mat = new THREE.MeshLambertMaterial({ map: this.texFor(a), transparent: true, alphaTest: 0.04, side: THREE.DoubleSide });
    if (a.kind === 'item') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), mat); m.position.set(0, 9, 0); m.rotation.y = Math.PI;
      m.userData = { flat: true }; this.root.add(m); this.meshes.push(m); return;
    }
    if (a.kind === 'block' && !a.cfg.custom) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), mat); m.position.set(0, 8, 0);
      m.userData = { flat: true }; this.root.add(m); this.meshes.push(m); return;
    }
    if (!a.model) return;
    const P3 = p => new THREE.Vector3(-p[0], p[1], p[2]);
    for (const b of S.boneOrder(a)) {
      const g = new THREE.Group(); g.rotation.order = 'ZYX';
      const parent = b.parent && this.boneObj[b.parent] ? this.boneObj[b.parent] : null;
      const pv = P3(b.pivot), ppv = parent ? P3(S.bone(a, b.parent).pivot) : new THREE.Vector3();
      g.position.copy(pv).sub(ppv);
      g.rotation.set(-b.rot[0] * D2R, -b.rot[1] * D2R, b.rot[2] * D2R);
      g.userData = { boneId: b.id, base: { p: g.position.clone(), r: g.rotation.clone() } };
      (parent || this.root).add(g); this.boneObj[b.id] = g;
      for (const c of b.cubes) {
        const m = new THREE.Mesh(this.cubeGeo(c, a.tex.w, a.tex.h), mat);
        const center = new THREE.Vector3(-(c.origin[0] + c.size[0] / 2), c.origin[1] + c.size[1] / 2, c.origin[2] + c.size[2] / 2);
        m.userData = { cubeId: c.id, boneId: b.id };
        if (c.rot && (c.rot[0] || c.rot[1] || c.rot[2])) {
          const cg = new THREE.Group(); cg.rotation.order = 'ZYX';
          const cp = P3(c.pivot); cg.position.copy(cp).sub(pv);
          cg.rotation.set(-c.rot[0] * D2R, -c.rot[1] * D2R, c.rot[2] * D2R);
          m.position.copy(center).sub(cp); cg.add(m); g.add(cg);
        } else { m.position.copy(center).sub(pv); g.add(m); }
        this.meshes.push(m);
      }
    }
    this.highlight();
  },
  highlight() {
    this.meshes.forEach(m => { const h = m.getObjectByName('hl'); if (h) { h.geometry.dispose(); m.remove(h); } });
    Object.values(this.boneObj).forEach(g => { const h = g.getObjectByName('pv'); if (h) g.remove(h); });
    if (!this.showSel) { this.dirty = true; return; }
    this.meshes.forEach(m => {
      const isCube = m.userData.cubeId && m.userData.cubeId === S.sel.cube;
      const inBone = m.userData.boneId && m.userData.boneId === S.sel.bone;
      if (!isCube && !inBone) return;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: isCube ? 0xf1c40f : 0x4fd0e0, depthTest: false, transparent: true }));
      l.name = 'hl'; l.renderOrder = 9; m.add(l);
    });
    const g = this.boneObj[S.sel.bone];
    if (g) {
      if (!this._pvMat) this._pvMat = new THREE.MeshBasicMaterial({ color: 0xff4fd8, depthTest: false, transparent: true });
      const pv = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), this._pvMat); pv.name = 'pv'; pv.renderOrder = 10; g.add(pv);
    }
    this.dirty = true;
  },
  applyPose(pose) {
    for (const id in this.boneObj) {
      const g = this.boneObj[id], b = g.userData.base, p = pose && pose[id];
      g.position.copy(b.p); g.rotation.copy(b.r); g.scale.set(1, 1, 1);
      if (!p) continue;
      if (p.rot) { g.rotation.x = b.r.x - p.rot[0] * D2R; g.rotation.y = b.r.y - p.rot[1] * D2R; g.rotation.z = b.r.z + p.rot[2] * D2R; }
      if (p.pos) { g.position.x -= p.pos[0]; g.position.y += p.pos[1]; g.position.z += p.pos[2]; }
      if (p.scl) g.scale.set(p.scl[0] || 0.0001, p.scl[1] || 0.0001, p.scl[2] || 0.0001);
    }
    this.dirty = true;
  },
  pick(cx, cy) {
    const rc = this.cv.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1);
    this.ray = this.ray || new THREE.Raycaster();
    this.ray.setFromCamera(v, this.cam);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit) return null;
    return { cubeId: hit.object.userData.cubeId || null, boneId: hit.object.userData.boneId || null, uv: hit.uv ? [hit.uv.x, hit.uv.y] : null };
  },
  // ---------- input ----------
  _bindInput() {
    const cv = this.cv, pts = new Map();
    let start = null, gesture = null, painting = false;
    const pinch = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
        if (this.paint && this.onPaint) { painting = true; this.onPaint('start', this.pick(e.clientX, e.clientY)); }
      } else if (pts.size === 2) {
        if (painting && this.onPaint) this.onPaint('cancel'); painting = false;
        gesture = pinch(); start = null;
      }
    });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) start.moved = true;
        if (painting) { this.onPaint('move', this.pick(e.clientX, e.clientY)); return; }
        if (start && !start.moved) return;
        this.orb.theta -= dx * 0.009; this.orb.phi = S.clamp(this.orb.phi + dy * 0.009, -1.5, 1.5); this.dirty = true;
      } else if (pts.size === 2 && gesture) {
        const g = pinch();
        if (g.d > 10 && gesture.d > 10) this.orb.r = S.clamp(this.orb.r * gesture.d / g.d, 6, 600);
        const mdx = g.mx - gesture.mx, mdy = g.my - gesture.my;
        if (this.paint) { this.orb.theta -= mdx * 0.009; this.orb.phi = S.clamp(this.orb.phi + mdy * 0.009, -1.5, 1.5); }
        else this._pan(mdx, mdy);
        gesture = g; this.dirty = true;
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (painting && pts.size === 0) { painting = false; this.onPaint('end'); }
      else if (start && pts.size === 0 && !start.moved && performance.now() - start.t < 400 && !this.paint && this.onTap) this.onTap(this.pick(e.clientX, e.clientY));
      if (pts.size < 2) gesture = null;
      if (pts.size === 0) start = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.orb.r = S.clamp(this.orb.r * (e.deltaY > 0 ? 1.12 : 0.89), 6, 600); this.dirty = true; }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  },
  _pan(dx, dy) {
    const o = this.orb, k = o.r * 0.0016;
    const right = new THREE.Vector3(), upv = new THREE.Vector3();
    this.cam.updateMatrixWorld(); right.setFromMatrixColumn(this.cam.matrixWorld, 0); upv.setFromMatrixColumn(this.cam.matrixWorld, 1);
    o.target.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k);
  }
};
