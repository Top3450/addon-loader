'use strict';
/* Mod Studio TH — core: state, storage, undo, templates, UV layout, molang, animation sampling */
const S = (typeof window !== 'undefined' ? window : globalThis).S = {};
const HAS_DOM = typeof document !== 'undefined';

// ---------------- utils ----------------
S.$ = (q, el) => (el || document).querySelector(q);
S.el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
};
S.uid = () => Math.random().toString(36).slice(2, 10);
S.uuid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
S.clone = o => JSON.parse(JSON.stringify(o));
S.round = (v, d = 4) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
S.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
S.isAndroid = typeof window !== 'undefined' && !!window.Android;
S.keyOk = k => /^[a-z][a-z0-9_]{0,40}$/.test(k || '');
S.slug = s => (String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'thing').replace(/^([0-9])/, 'x$1');
S.toast = (msg, ms = 2600) => {
  if (!HAS_DOM) return;
  const t = S.$('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(S._tt); S._tt = setTimeout(() => t.classList.remove('show'), ms);
};
S.log = (...a) => { if (S.debug) console.log('[studio]', ...a); };
S.debug = false;

// ---------------- events ----------------
S._ev = {};
S.on = (n, f) => (S._ev[n] = S._ev[n] || []).push(f);
S.emit = (n, d) => (S._ev[n] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });

// ---------------- storage (Android bridge or localStorage) ----------------
S.store = {
  list() {
    try {
      if (S.isAndroid) return JSON.parse(Android.listProjects() || '[]');
      return JSON.parse(localStorage.getItem('mms_index') || '[]');
    } catch (e) { return []; }
  },
  read(id) {
    try {
      const s = S.isAndroid ? Android.readProject(id) : localStorage.getItem('mms_p_' + id);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },
  write(p) {
    const json = JSON.stringify(p);
    if (S.isAndroid) { Android.writeProject(p.id, json, p.name); return true; }
    try {
      localStorage.setItem('mms_p_' + p.id, json);
      const idx = S.store.list().filter(x => x.id !== p.id);
      idx.unshift({ id: p.id, name: p.name, updated: p.updated });
      localStorage.setItem('mms_index', JSON.stringify(idx));
      return true;
    } catch (e) { S.toast('⚠️ พื้นที่เก็บเต็ม — ส่งออกสำรองโปรเจกต์ไว้ก่อน'); return false; }
  },
  del(id) {
    if (S.isAndroid) { Android.deleteProject(id); return; }
    localStorage.removeItem('mms_p_' + id);
    localStorage.setItem('mms_index', JSON.stringify(S.store.list().filter(x => x.id !== id)));
  }
};

// ---------------- project state + undo ----------------
S.P = null;               // current project
S.sel = { bone: null, cube: null };
S.undoStack = []; S.redoStack = [];
S._lastSnap = { key: null, t: 0 };

S.A = () => S.P && (S.P.assets.find(a => a.id === S.P.cur) || S.P.assets[0]) || null;
S.snap = (key) => {
  if (!S.P) return;
  const now = Date.now();
  if (key && S._lastSnap.key === key && now - S._lastSnap.t < 900) { S._lastSnap.t = now; return; }
  S._lastSnap = { key: key || null, t: now };
  S.undoStack.push(JSON.stringify(S.P));
  if (S.undoStack.length > 60) S.undoStack.shift();
  S.redoStack.length = 0;
};
S.undo = () => {
  if (!S.undoStack.length) return S.toast('ไม่มีอะไรให้ย้อน');
  S.redoStack.push(JSON.stringify(S.P));
  S.P = JSON.parse(S.undoStack.pop()); S._lastSnap.key = null;
  S.fixSel(); S.emit('project'); S.saveSoon();
};
S.redo = () => {
  if (!S.redoStack.length) return;
  S.undoStack.push(JSON.stringify(S.P));
  S.P = JSON.parse(S.redoStack.pop()); S._lastSnap.key = null;
  S.fixSel(); S.emit('project'); S.saveSoon();
};
S.changed = (what) => { if (!S.P) return; S.P.updated = Date.now(); S.emit(what || 'change'); S.saveSoon(); };
S.saveSoon = () => { clearTimeout(S._st); S._st = setTimeout(S.saveNow, 700); };
S.saveNow = () => { clearTimeout(S._st); if (S.P) S.store.write(S.P); };
S.fixSel = () => {
  const a = S.A(); if (!a || !a.model) { S.sel = { bone: null, cube: null }; return; }
  const b = a.model.bones.find(b => b.id === S.sel.bone);
  if (!b) { S.sel.bone = a.model.bones[0] ? a.model.bones[0].id : null; S.sel.cube = null; return; }
  if (S.sel.cube && !b.cubes.find(c => c.id === S.sel.cube)) S.sel.cube = null;
};

// ---------------- model helpers ----------------
S.bone = (a, id) => a.model.bones.find(b => b.id === id);
S.boneByName = (a, n) => a.model.bones.find(b => b.name === n);
S.cubeOwner = (a, cid) => a.model.bones.find(b => b.cubes.some(c => c.id === cid));
S.children = (a, id) => a.model.bones.filter(b => b.parent === id);
S.descendants = (a, id) => { const out = []; const walk = i => S.children(a, i).forEach(c => { out.push(c); walk(c.id); }); walk(id); return out; };
S.boneOrder = (a) => { // parents before children, stable
  const out = [], seen = new Set();
  const add = b => { if (seen.has(b.id)) return; seen.add(b.id); out.push(b); S.children(a, b.id).forEach(add); };
  a.model.bones.filter(b => !b.parent || !S.bone(a, b.parent)).forEach(add);
  a.model.bones.forEach(add);
  return out;
};
S.depth = (a, b) => { let d = 0, p = b.parent; while (p && d < 32) { const pb = S.bone(a, p); if (!pb) break; p = pb.parent; d++; } return d; };
S.uniqueBoneName = (a, base) => { let n = base, i = 2; while (S.boneByName(a, n)) n = base + '_' + (i++); return n; };
S.mkCube = (origin, size, extra) => Object.assign({ id: S.uid(), origin: origin.slice(), size: size.slice(), uv: [0, 0], inflate: 0, mirror: false, rot: [0, 0, 0], pivot: [origin[0] + size[0] / 2, origin[1] + size[1] / 2, origin[2] + size[2] / 2] }, extra || {});
S.mkBone = (name, pivot, parent, cubes) => ({ id: S.uid(), name, parent: parent || null, pivot: pivot.slice(), rot: [0, 0, 0], cubes: cubes || [] });
S.allCubes = (a) => a.model ? a.model.bones.flatMap(b => b.cubes) : [];
S.bounds = (a) => {
  const cs = S.allCubes(a); if (!cs.length) return { min: [0, 0, 0], max: [16, 16, 16] };
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  cs.forEach(c => { for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], c.origin[i] - c.inflate); max[i] = Math.max(max[i], c.origin[i] + c.size[i] + c.inflate); } });
  return { min, max };
};

// Box-UV face rectangles in texture pixels: [u, v, w, h]
S.faceRects = (c) => {
  const [w, h, d] = c.size.map(v => Math.max(0, v));
  const [u, v] = c.uv;
  const r = {
    up: [u + d, v, w, d], down: [u + d + w, v, w, d],
    east: [u, v + d, d, h], north: [u + d, v + d, w, h],
    west: [u + d + w, v + d, d, h], south: [u + d + w + d, v + d, w, h]
  };
  return r;
};
S.uvFootprint = (c) => { const [w, h, d] = c.size.map(v => Math.ceil(Math.max(0, v))); return [2 * (d + w), d + h]; };

// Shelf-pack all cubes into the texture; grows the texture if needed
S.autoUV = (a) => {
  const cubes = S.allCubes(a); if (!cubes.length) return;
  const items = cubes.map(c => ({ c, fp: S.uvFootprint(c) })).sort((p, q) => q.fp[1] - p.fp[1] || q.fp[0] - p.fp[0]);
  let W = a.tex.w;
  const widest = Math.max(...items.map(i => i.fp[0]));
  while (W < widest) W *= 2;
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x + it.fp[0] > W) { x = 0; y += rowH; rowH = 0; }
    it.c.uv = [x, y]; x += it.fp[0]; rowH = Math.max(rowH, it.fp[1]);
  }
  let H = a.tex.h; const need = y + rowH;
  while (H < need) H *= 2;
  if (W !== a.tex.w || H !== a.tex.h) S.resizeTex(a, W, H, true);
};

// ---------------- textures ----------------
S.texCache = new Map(); // asset.id -> {canvas, data}
S.newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
S.texCanvas = (a) => {
  let e = S.texCache.get(a.id);
  if (e && e.data === a.tex.data && e.canvas.width === a.tex.w && e.canvas.height === a.tex.h) return e.canvas;
  const cv = e && e.canvas.width === a.tex.w && e.canvas.height === a.tex.h ? e.canvas : S.newCanvas(a.tex.w, a.tex.h);
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  e = { canvas: cv, data: a.tex.data, ver: (e ? e.ver : 0) + 1 };
  S.texCache.set(a.id, e);
  if (a.tex.data) {
    const img = new Image(), ent = e, src = a.tex.data;
    img.onload = () => { if (S.texCache.get(a.id) !== ent || ent.data !== src) return; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0); S.emit('tex', a.id); };
    img.src = src;
  }
  return cv;
};
S.syncTex = (a) => { // canvas -> asset data
  const e = S.texCache.get(a.id); if (!e) return;
  a.tex.data = e.canvas.toDataURL('image/png'); e.data = a.tex.data;
};
S.resizeTex = (a, w, h, keep) => {
  const old = S.texCanvas(a); const cv = S.newCanvas(w, h);
  if (keep) cv.getContext('2d').drawImage(old, 0, 0);
  a.tex.w = w; a.tex.h = h; a.tex.data = cv.toDataURL('image/png');
  S.texCache.set(a.id, { canvas: cv, data: a.tex.data, ver: 1 });
};
S.hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
// Fills every cube face with a shaded colour per bone so the model looks right straight away
S.paintTemplate = (a) => {
  const cv = S.texCanvas(a), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const shade = { up: 62, north: 52, south: 46, east: 48, west: 48, down: 34 };
  a.model.bones.forEach((b, bi) => {
    const hue = (bi * 67 + 95) % 360;
    b.cubes.forEach(c => {
      const r = S.faceRects(c);
      for (const f in r) {
        const [u, v, w, h] = r[f]; if (w <= 0 || h <= 0) continue;
        for (let py = Math.floor(v); py < Math.ceil(v + h); py++) for (let px = Math.floor(u); px < Math.ceil(u + w); px++) {
          const l = shade[f] + (Math.random() * 8 - 4);
          ctx.fillStyle = S.hsl(hue, 45, l); ctx.fillRect(px, py, 1, 1);
        }
        if (f === 'north' && /head/i.test(b.name) && w >= 4 && h >= 4) { // simple face
          ctx.fillStyle = '#fff'; const ey = Math.floor(v + h * 0.45);
          ctx.fillRect(Math.floor(u + w * 0.2), ey, Math.max(1, Math.floor(w * 0.2)), Math.max(1, Math.floor(h * 0.15)));
          ctx.fillRect(Math.floor(u + w * 0.6), ey, Math.max(1, Math.floor(w * 0.2)), Math.max(1, Math.floor(h * 0.15)));
          ctx.fillStyle = '#222'; ctx.fillRect(Math.floor(u + w * 0.2), ey, 1, Math.max(1, Math.floor(h * 0.15)));
          ctx.fillRect(Math.floor(u + w * 0.6) + Math.max(1, Math.floor(w * 0.2)) - 1, ey, 1, Math.max(1, Math.floor(h * 0.15)));
        }
      }
    });
  });
  S.syncTex(a);
};
S.paintNoise = (a, base, amt) => { // fills whole texture with MC-style noisy colour (blocks)
  const cv = S.texCanvas(a), ctx = cv.getContext('2d');
  const c = S.hexToRgb(base);
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const k = 1 + (Math.random() * 2 - 1) * amt;
    ctx.fillStyle = `rgb(${S.clamp(c[0] * k, 0, 255) | 0},${S.clamp(c[1] * k, 0, 255) | 0},${S.clamp(c[2] * k, 0, 255) | 0})`;
    ctx.fillRect(x, y, 1, 1);
  }
  S.syncTex(a);
};
S.paintItemTemplate = (a) => { // a simple gem so a new item is not invisible
  const cv = S.texCanvas(a), ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
  const n = cv.width, m = n / 16;
  const pts = [[7, 2], [8, 2], [6, 3], [9, 3], [5, 4], [10, 4], [4, 5], [11, 5], [3, 6], [12, 6], [4, 7], [11, 7], [5, 8], [10, 8], [6, 9], [9, 9], [7, 10], [8, 10]];
  ctx.fillStyle = '#1b5e78'; pts.forEach(([x, y]) => ctx.fillRect(x * m, y * m, m, m));
  for (let y = 3; y <= 9; y++) for (let x = 3; x <= 12; x++) {
    const inside = Math.abs(x - 7.5) + Math.abs(y - 6) * 1.6 < 4.6;
    if (inside) { ctx.fillStyle = (x + y) % 3 ? '#4fc3e8' : '#9ae6ff'; ctx.fillRect(x * m, y * m, m, m); }
  }
  S.syncTex(a);
};
S.hexToRgb = h => { h = String(h || '#000000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
S.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => (v | 0).toString(16).padStart(2, '0')).join('');
S.dataUrlBytes = (url) => {
  const b64 = String(url || '').split(',')[1] || '';
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
S.blankPng = (w, h) => { const c = S.newCanvas(w, h); return c.toDataURL('image/png'); };

// ---------------- templates ----------------
S.TEMPLATES = {
  entity: {
    humanoid: { label: '🧍 คน/มนุษย์', tex: [64, 64], bones: [
      ['body', null, [0, 24, 0], [[[-4, 12, -2], [8, 12, 4]]]],
      ['head', 'body', [0, 24, 0], [[[-4, 24, -4], [8, 8, 8]]]],
      ['rightArm', 'body', [-5, 22, 0], [[[-8, 12, -2], [4, 12, 4]]]],
      ['leftArm', 'body', [5, 22, 0], [[[4, 12, -2], [4, 12, 4]]]],
      ['rightLeg', null, [-1.9, 12, 0], [[[-3.9, 0, -2], [4, 12, 4]]]],
      ['leftLeg', null, [1.9, 12, 0], [[[-0.1, 0, -2], [4, 12, 4]]]]] },
    quadruped: { label: '🐷 สัตว์สี่ขา', tex: [64, 64], bones: [
      ['body', null, [0, 12, 0], [[[-5, 8, -8], [10, 8, 16]]]],
      ['head', 'body', [0, 14, -8], [[[-4, 10, -14], [8, 8, 6]]]],
      ['leg_front_right', null, [-3, 8, -6], [[[-5, 0, -8], [4, 8, 4]]]],
      ['leg_front_left', null, [3, 8, -6], [[[1, 0, -8], [4, 8, 4]]]],
      ['leg_back_right', null, [-3, 8, 6], [[[-5, 0, 4], [4, 8, 4]]]],
      ['leg_back_left', null, [3, 8, 6], [[[1, 0, 4], [4, 8, 4]]]]] },
    spider: { label: '🕷 แมลง 6 ขา', tex: [64, 64], bones: [
      ['body', null, [0, 6, 0], [[[-4, 4, -6], [8, 5, 12]]]],
      ['head', 'body', [0, 7, -6], [[[-3, 4, -11], [6, 5, 5]]]],
      ['leg_r1', 'body', [-4, 6, -4], [[[-12, 5, -5], [8, 2, 2]]]], ['leg_l1', 'body', [4, 6, -4], [[[4, 5, -5], [8, 2, 2]]]],
      ['leg_r2', 'body', [-4, 6, 0], [[[-12, 5, -1], [8, 2, 2]]]], ['leg_l2', 'body', [4, 6, 0], [[[4, 5, -1], [8, 2, 2]]]],
      ['leg_r3', 'body', [-4, 6, 4], [[[-12, 5, 3], [8, 2, 2]]]], ['leg_l3', 'body', [4, 6, 4], [[[4, 5, 3], [8, 2, 2]]]]] },
    slime: { label: '🟩 สไลม์/กล่อง', tex: [64, 32], bones: [['body', null, [0, 0, 0], [[[-8, 0, -8], [16, 16, 16]]]]] },
    blank: { label: '⬜ เปล่า', tex: [32, 32], bones: [['root', null, [0, 0, 0], [[[-4, 0, -4], [8, 8, 8]]]]] }
  },
  block: {
    full: { label: '🧱 บล็อกเต็มก้อน', tex: [16, 16] },
    slab: { label: '▭ แผ่นครึ่งก้อน (โมเดลเอง)', tex: [64, 32], bones: [['block', null, [0, 0, 0], [[[-8, 0, -8], [16, 8, 16]]]]] },
    post: { label: '🕯 เสา/ตะเกียง (โมเดลเอง)', tex: [32, 32], bones: [['block', null, [0, 0, 0], [[[-2, 0, -2], [4, 12, 4]], [[-3, 12, -3], [6, 4, 6]]]]] }
  },
  item: { flat: { label: '🗡 ไอเทม 2D', tex: [16, 16] } }
};

S.defaultCfg = (kind) => {
  if (kind === 'entity') return {
    health: 20, speed: 0.25, damage: 3, follow: 16, width: 0.6, height: 1.8, scale: 1, behavior: 'passive',
    tameable: false, tameItems: 'minecraft:bone', rideable: false, breedable: false, breedItems: 'minecraft:wheat',
    fireImmune: false, waterBreathing: false, family: '',
    eggBase: '#3f8f3f', eggDots: '#f1c40f', spawn: false, spawnWeight: 8, herdMin: 1, herdMax: 3, biome: 'overworld', nightOnly: false,
    drops: [{ item: 'minecraft:leather', min: 0, max: 2 }], xp: 3
  };
  if (kind === 'item') return {
    stack: 64, category: 'items', damage: 0, durability: 0, glint: false, handheld: false,
    food: false, nutrition: 4, saturation: 0.6, alwaysEat: false,
    recipe: { on: false, grid: ['', '', '', '', '', '', '', '', ''], count: 1 }
  };
  return {
    destroy: 1.5, resist: 6, light: 0, friction: 0.4, mapColor: '#7f7f7f', render: 'opaque', custom: false,
    drop: 'self', dropItem: '', category: 'construction',
    recipe: { on: false, grid: ['', '', '', '', '', '', '', '', ''], count: 1 }
  };
};

S.newAsset = (kind, tplKey, key, name) => {
  const tpl = S.TEMPLATES[kind][tplKey] || Object.values(S.TEMPLATES[kind])[0];
  const a = { id: S.uid(), kind, key, name, nameEn: name, tex: { w: tpl.tex[0], h: tpl.tex[1], data: '' }, model: null, anims: [], cfg: S.defaultCfg(kind) };
  if (tpl.bones) {
    a.model = { bones: [] };
    const ids = {};
    tpl.bones.forEach(([n, parent, pivot, cubes]) => {
      const b = S.mkBone(n, pivot, parent ? ids[parent] : null, cubes.map(([o, s]) => S.mkCube(o, s)));
      ids[n] = b.id; a.model.bones.push(b);
    });
    if (kind === 'block') a.cfg.custom = true;
  }
  if (kind === 'entity' && tplKey === 'humanoid') { a.cfg.height = 1.9; }
  if (kind === 'entity' && tplKey === 'quadruped') { a.cfg.width = 0.9; a.cfg.height = 1.2; }
  if (kind === 'entity' && tplKey === 'spider') { a.cfg.width = 1.2; a.cfg.height = 0.7; a.cfg.behavior = 'hostile'; }
  if (kind === 'entity' && tplKey === 'slime') { a.cfg.width = 1; a.cfg.height = 1; }
  if (HAS_DOM) {
    a.tex.data = S.blankPng(a.tex.w, a.tex.h);
    if (a.model) { S.autoUV(a); S.paintTemplate(a); }
    else if (kind === 'block') S.paintNoise(a, '#8a8a8a', 0.12);
    else S.paintItemTemplate(a);
  }
  if (kind === 'entity' && a.model) S.genAnims(a, ['walk', 'idle']);
  return a;
};

S.newProject = (name, ns) => ({
  id: S.uid(), name, ns, desc: 'สร้างด้วย Mod Studio TH', version: [1, 0, 0],
  uuids: { bpH: S.uuid(), bpM: S.uuid(), rpH: S.uuid(), rpM: S.uuid() },
  assets: [], cur: null, created: Date.now(), updated: Date.now(), fmt: 1
});

// ---------------- molang (preview evaluator) ----------------
const DEG = Math.PI / 180;
S.M = {
  sin: x => Math.sin(x * DEG), cos: x => Math.cos(x * DEG), abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, trunc: Math.trunc, sqrt: Math.sqrt, pow: Math.pow, exp: Math.exp, ln: Math.log,
  min: Math.min, max: Math.max, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t,
  mod: (a, b) => a % b, random: (a, b) => a + Math.random() * (b - a), pi: Math.PI,
  asin: x => Math.asin(x) / DEG, acos: x => Math.acos(x) / DEG, atan: x => Math.atan(x) / DEG, atan2: (y, x) => Math.atan2(y, x) / DEG,
  die_roll: (n, a, b) => n * (a + Math.random() * (b - a)), hermite_blend: t => 3 * t * t - 2 * t * t * t
};
S._mlCache = new Map();
S.molangCompile = (src) => {
  if (S._mlCache.has(src)) return S._mlCache.get(src);
  let fn = null;
  try {
    let code = String(src).toLowerCase()
      .replace(/\b(query|q)\.(anim_time|life_time|time_of_day)\b/g, '(t)')
      .replace(/\b(query|q)\.(modified_distance_moved|walk_distance)\b/g, '(t*4)')
      .replace(/\b(query|q)\.(modified_move_speed|ground_speed)\b/g, '(1)')
      .replace(/\b(query|q)\.is_on_ground\b/g, '(1)')
      .replace(/\b(query|q|variable|v|temp|context|c)\.[a-z_][a-z0-9_]*(\.[a-z_0-9]+)*\b/g, '(0)')
      .replace(/\bmath\.([a-z_0-9]+)/g, (m, f) => (f in S.M ? 'M.' + f : '(0)'));
    const probe = code.replace(/M\.[a-z_0-9]+/g, '').replace(/\bt\b/g, '');
    if (/[a-z_$\[\]{};=`'"\\]/i.test(probe.replace(/[<>!=]=|&&|\|\|/g, ''))) throw new Error('bad');
    fn = new Function('M', 't', 'return +(' + code + ');');
    fn(S.M, 0);
  } catch (e) { fn = null; }
  S._mlCache.set(src, fn);
  return fn;
};
S.molang = (v, t) => {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim(); if (s === '') return 0;
  const n = Number(s); if (Number.isFinite(n)) return n;
  const fn = S.molangCompile(s); if (!fn) return 0;
  const r = fn(S.M, t); return Number.isFinite(r) ? r : 0;
};
S.molangValid = (v) => { if (typeof v === 'number') return true; const s = String(v).trim(); if (s === '' || Number.isFinite(Number(s))) return true; return !!S.molangCompile(s); };
S.parseVal = (s) => { const t = String(s).trim(); const n = Number(t); return t !== '' && Number.isFinite(n) ? n : t; };

// ---------------- animation ----------------
S.newAnim = (name, role) => ({ id: S.uid(), name, len: 1, loop: role !== 'attack', role: role || 'none', tracks: {} });
S.track = (anim, boneId, ch, create) => {
  let tb = anim.tracks[boneId];
  if (!tb) { if (!create) return null; tb = anim.tracks[boneId] = {}; }
  if (!tb[ch]) { if (!create) return null; tb[ch] = []; }
  return tb[ch];
};
S.setKey = (anim, boneId, ch, t, v, interp) => {
  const tr = S.track(anim, boneId, ch, true);
  t = S.round(t, 3);
  const k = tr.find(k => Math.abs(k.t - t) < 0.0005);
  if (k) { k.v = v.slice(); if (interp) k.i = interp; }
  else tr.push({ t, v: v.slice(), i: interp || 'linear' });
  tr.sort((a, b) => a.t - b.t);
};
S.delKey = (anim, boneId, ch, t) => {
  const tr = S.track(anim, boneId, ch); if (!tr) return false;
  const i = tr.findIndex(k => Math.abs(k.t - t) < 0.0005); if (i < 0) return false;
  tr.splice(i, 1);
  if (!tr.length) { delete anim.tracks[boneId][ch]; if (!Object.keys(anim.tracks[boneId]).length) delete anim.tracks[boneId]; }
  return true;
};
S.sample = (keys, t) => {
  if (!keys || !keys.length) return null;
  const ev = k => k.v.map(x => S.molang(x, t));
  if (keys.length === 1 || t <= keys[0].t) return ev(keys[0]);
  const last = keys[keys.length - 1]; if (t >= last.t) return ev(last);
  let i = 0; while (i < keys.length - 1 && keys[i + 1].t < t) i++;
  const k1 = keys[i], k2 = keys[i + 1]; const f = (t - k1.t) / Math.max(1e-6, k2.t - k1.t);
  const a = ev(k1), b = ev(k2);
  if (k1.i === 'step') return a;
  if (k1.i === 'smooth' || k2.i === 'smooth') {
    const p0 = ev(keys[Math.max(0, i - 1)]), p3 = ev(keys[Math.min(keys.length - 1, i + 2)]);
    const f2 = f * f, f3 = f2 * f;
    return a.map((_, j) => 0.5 * ((2 * a[j]) + (-p0[j] + b[j]) * f + (2 * p0[j] - 5 * a[j] + 4 * b[j] - p3[j]) * f2 + (-p0[j] + 3 * a[j] - 3 * b[j] + p3[j]) * f3));
  }
  return a.map((x, j) => x + (b[j] - x) * f);
};
S.pose = (anim, t) => {
  const out = {};
  if (!anim) return out;
  for (const bid in anim.tracks) {
    const tb = anim.tracks[bid];
    out[bid] = { rot: S.sample(tb.rot, t), pos: S.sample(tb.pos, t), scl: S.sample(tb.scl, t) };
  }
  return out;
};
S.animKeyTimes = (anim) => { const s = new Set(); for (const b in anim.tracks) for (const c in anim.tracks[b]) anim.tracks[b][c].forEach(k => s.add(k.t)); return [...s].sort((a, b) => a - b); };

// Auto-generate animations from bone names
S.side = (n) => /(^|_)(r|right)(\d|_|$)|right/i.test(n) ? 'R' : (/(^|_)(l|left)(\d|_|$)|left/i.test(n) ? 'L' : null);
S.genAnims = (a, which) => {
  const bones = a.model.bones;
  const legs = bones.filter(b => /leg/i.test(b.name)), arms = bones.filter(b => /arm|hand/i.test(b.name));
  const head = bones.find(b => /head/i.test(b.name)), body = bones.find(b => /body|torso|chest/i.test(b.name));
  const made = [];
  const phase = b => {
    const s = S.side(b.name) === 'L' ? 1 : -1;
    const d = (b.name.match(/(\d)/) || [])[1];
    const fb = /back|hind/i.test(b.name) ? -1 : (d ? (d % 2 ? 1 : -1) : 1);
    return s * fb;
  };
  if (which.includes('walk')) {
    const an = S.newAnim('walk', 'walk'); an.len = 1;
    legs.forEach(b => {
      const p = phase(b), sideways = /leg_[rl]\d/i.test(b.name);
      [0, 0.25, 0.5, 0.75, 1].forEach((t, j) => { const amp = [0, 30, 0, -30, 0][j] * p; const v = [0, 0, 0]; if (sideways) v[1] = amp * 0.6; else v[0] = amp; S.setKey(an, b.id, 'rot', t, v, 'smooth'); });
    });
    arms.forEach(b => { const p = S.side(b.name) === 'L' ? -1 : 1;
      [0, 0.25, 0.5, 0.75, 1].forEach((t, j) => S.setKey(an, b.id, 'rot', t, [[0, -25, 0, 25, 0][j] * p, 0, 0], 'smooth')); });
    if (body) [0, 0.25, 0.5, 0.75, 1].forEach((t, j) => S.setKey(an, body.id, 'pos', t, [0, [0, 0.5, 0, 0.5, 0][j], 0], 'smooth'));
    if (Object.keys(an.tracks).length) { a.anims = a.anims.filter(x => x.role !== 'walk'); a.anims.push(an); made.push('walk'); }
  }
  if (which.includes('idle')) {
    const an = S.newAnim('idle', 'idle'); an.len = 3;
    if (head) [0, 1.5, 3].forEach((t, j) => S.setKey(an, head.id, 'rot', t, [[0, 4, 0][j], 0, 0], 'smooth'));
    arms.forEach(b => { const p = S.side(b.name) === 'L' ? -1 : 1; [0, 1.5, 3].forEach((t, j) => S.setKey(an, b.id, 'rot', t, [0, 0, [0, 3, 0][j] * p], 'smooth')); });
    if (body && !arms.length && !head) [0, 1.5, 3].forEach((t, j) => S.setKey(an, body.id, 'scl', t, [1, [1, 1.04, 1][j], 1], 'smooth'));
    if (Object.keys(an.tracks).length) { a.anims = a.anims.filter(x => x.role !== 'idle'); a.anims.push(an); made.push('idle'); }
  }
  if (which.includes('attack')) {
    const an = S.newAnim('attack', 'attack'); an.len = 0.5; an.loop = false;
    const hitters = arms.length ? arms : (head ? [head] : legs.slice(0, 2));
    hitters.forEach(b => [0, 0.2, 0.5].forEach((t, j) => S.setKey(an, b.id, 'rot', t, [[0, -100, 0][j] * (b === head ? -0.3 : 1), 0, 0], 'linear')));
    if (body) [0, 0.2, 0.5].forEach((t, j) => S.setKey(an, body.id, 'rot', t, [0, [0, 15, 0][j], 0], 'linear'));
    if (Object.keys(an.tracks).length) { a.anims = a.anims.filter(x => x.role !== 'attack'); a.anims.push(an); made.push('attack'); }
  }
  return made;
};

// ---------------- validation ----------------
S.validate = (p) => {
  const errs = [], warns = [];
  if (!S.keyOk(p.ns)) errs.push('Namespace ต้องเป็น a-z, 0-9, _ และขึ้นต้นด้วยตัวอักษร');
  if (!p.assets.length) errs.push('โปรเจกต์ยังไม่มีอะไรเลย — เพิ่มมอบ/ไอเทม/บล็อกก่อน');
  const keys = new Set();
  p.assets.forEach(a => {
    const tag = `[${a.name || a.key}]`;
    if (!S.keyOk(a.key)) errs.push(`${tag} ไอดีต้องเป็น a-z 0-9 _`);
    if (keys.has(a.key)) errs.push(`${tag} ไอดี "${a.key}" ซ้ำ`); keys.add(a.key);
    if (a.model && (a.kind === 'entity' || a.cfg.custom)) {
      if (!S.allCubes(a).length) errs.push(`${tag} โมเดลไม่มีกล่องเลย`);
      const names = new Set();
      a.model.bones.forEach(b => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(b.name)) errs.push(`${tag} ชื่อกระดูก "${b.name}" ใช้ได้แค่ A-Z a-z 0-9 _`);
        if (names.has(b.name)) errs.push(`${tag} ชื่อกระดูก "${b.name}" ซ้ำ`); names.add(b.name);
      });
      S.allCubes(a).forEach(c => {
        const fp = S.uvFootprint(c);
        if (c.uv[0] + fp[0] > a.tex.w + 0.01 || c.uv[1] + fp[1] > a.tex.h + 0.01) warns.push(`${tag} มีกล่องที่ UV เกินขอบเท็กซ์เจอร์ — กด "จัด UV อัตโนมัติ"`);
      });
      if (a.kind === 'block') {
        const bd = S.bounds(a);
        if (bd.min[0] < -8 || bd.max[0] > 8 || bd.min[2] < -8 || bd.max[2] > 8 || bd.min[1] < 0 || bd.max[1] > 16) warns.push(`${tag} โมเดลบล็อกเกินขนาด 1 บล็อก (16×16×16) — เกม Bedrock อาจไม่ยอมโหลด`);
      }
    }
    (a.anims || []).forEach(an => {
      for (const b in an.tracks) for (const c in an.tracks[b]) an.tracks[b][c].forEach(k => k.v.forEach(v => { if (!S.molangValid(v)) warns.push(`${tag} แอนิเมชัน ${an.name}: สูตร "${v}" พรีวิวไม่ได้`); }));
    });
    if (a.kind === 'entity' && a.cfg.tameable && !a.cfg.tameItems.trim()) warns.push(`${tag} เลี้ยงได้แต่ยังไม่ใส่ไอเทมที่ใช้เลี้ยง`);
  });
  return { errs: [...new Set(errs)], warns: [...new Set(warns)] };
};

S.ITEM_IDS = ['minecraft:stick', 'minecraft:iron_ingot', 'minecraft:gold_ingot', 'minecraft:diamond', 'minecraft:emerald', 'minecraft:netherite_ingot',
  'minecraft:redstone', 'minecraft:coal', 'minecraft:copper_ingot', 'minecraft:amethyst_shard', 'minecraft:lapis_lazuli', 'minecraft:quartz',
  'minecraft:string', 'minecraft:leather', 'minecraft:feather', 'minecraft:bone', 'minecraft:slime_ball', 'minecraft:ender_pearl', 'minecraft:blaze_rod',
  'minecraft:gunpowder', 'minecraft:glowstone_dust', 'minecraft:wheat', 'minecraft:carrot', 'minecraft:apple', 'minecraft:sugar', 'minecraft:egg',
  'minecraft:cobblestone', 'minecraft:stone', 'minecraft:oak_planks', 'minecraft:oak_log', 'minecraft:glass', 'minecraft:sand', 'minecraft:dirt',
  'minecraft:iron_block', 'minecraft:gold_block', 'minecraft:diamond_block', 'minecraft:obsidian', 'minecraft:torch', 'minecraft:rotten_flesh',
  'minecraft:beef', 'minecraft:porkchop', 'minecraft:chicken', 'minecraft:cod', 'minecraft:spider_eye', 'minecraft:paper', 'minecraft:book', 'minecraft:flint'];
