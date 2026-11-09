'use strict';
/* Texture painting: tools shared by the 2D pixel editor and painting directly on the 3D model */
S.Tool = { kind: 'pencil', color: '#d94a3a', size: 1, recent: ['#d94a3a', '#3a7fd9', '#3fae4a', '#f1c40f', '#ffffff', '#202020'] };
S.PALETTE = ['#000000', '#3b3b3b', '#7a7a7a', '#bdbdbd', '#ffffff', '#5a3a1e', '#8b5a2b', '#c08a4a', '#e8c48a', '#7a1414', '#c0392b', '#ff6f5e',
  '#e67e22', '#f1c40f', '#fff59d', '#1e5c1e', '#3fae4a', '#8fe388', '#0f4c5c', '#1abc9c', '#1f3a7a', '#3a7fd9', '#9ad0ff', '#4a1f6e', '#9b59b6', '#ff9ad6'];

S.Brush = {
  stroke: null,
  begin(a, px, py) {
    const cv = S.texCanvas(a), ctx = cv.getContext('2d');
    const k = S.Tool.kind;
    if (k === 'picker') { this.pick(ctx, px, py); return; }
    S.snap();
    this.stroke = { a, ctx, cv, base: ctx.getImageData(0, 0, cv.width, cv.height), sx: px, sy: py, lx: px, ly: py };
    if (k === 'fill') { this.fill(ctx, px, py); this.stroke.done = true; S.emit('texpaint', a); return; }
    this.move(px, py);
  },
  move(px, py) {
    const s = this.stroke; if (!s || s.done || px == null) return;
    const k = S.Tool.kind;
    if (k === 'line' || k === 'rect') {
      s.ctx.putImageData(s.base, 0, 0);
      if (k === 'line') this.line(s.sx, s.sy, px, py, (x, y) => this.dot(s.ctx, x, y));
      else { const x0 = Math.min(s.sx, px), x1 = Math.max(s.sx, px), y0 = Math.min(s.sy, py), y1 = Math.max(s.sy, py);
        for (let x = x0; x <= x1; x++) { this.dot(s.ctx, x, y0); this.dot(s.ctx, x, y1); }
        for (let y = y0; y <= y1; y++) { this.dot(s.ctx, x0, y); this.dot(s.ctx, x1, y); } }
    } else {
      this.line(s.lx, s.ly, px, py, (x, y) => this.dot(s.ctx, x, y));
    }
    s.lx = px; s.ly = py;
    S.emit('texpaint', s.a);
  },
  end() {
    const s = this.stroke; if (!s) return; this.stroke = null;
    S.syncTex(s.a); S.changed('tex');
    S.addRecent(S.Tool.color);
  },
  cancel() {
    const s = this.stroke; if (!s) return; this.stroke = null;
    s.ctx.putImageData(s.base, 0, 0); S.undoStack.pop(); S.emit('texpaint', s.a);
  },
  dot(ctx, x, y) {
    const n = S.Tool.size, o = Math.floor((n - 1) / 2), k = S.Tool.kind;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    for (let yy = y - o; yy < y - o + n; yy++) for (let xx = x - o; xx < x - o + n; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (k === 'eraser') ctx.clearRect(xx, yy, 1, 1);
      else if (k === 'shade' || k === 'light' || k === 'noise') {
        const d = ctx.getImageData(xx, yy, 1, 1).data; if (!d[3]) continue;
        const f = k === 'shade' ? 0.88 : k === 'light' ? 1.12 : 1 + (Math.random() * 2 - 1) * 0.1;
        ctx.fillStyle = `rgba(${S.clamp(d[0] * f, 0, 255) | 0},${S.clamp(d[1] * f, 0, 255) | 0},${S.clamp(d[2] * f, 0, 255) | 0},${d[3] / 255})`;
        ctx.clearRect(xx, yy, 1, 1); ctx.fillRect(xx, yy, 1, 1);
      } else { ctx.fillStyle = S.Tool.color; ctx.clearRect(xx, yy, 1, 1); ctx.fillRect(xx, yy, 1, 1); }
    }
  },
  line(x0, y0, x1, y1, plot) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, guard = 0;
    for (;;) { plot(x0, y0); if ((x0 === x1 && y0 === y1) || guard++ > 4096) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  },
  fill(ctx, x, y) {
    const W = ctx.canvas.width, H = ctx.canvas.height; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, i0 = (y * W + x) * 4;
    const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
    const erase = S.Tool.kind === 'eraser';
    const c = S.hexToRgb(S.Tool.color), nc = [c[0], c[1], c[2], 255];
    if (t.every((v, j) => v === nc[j])) return;
    const same = i => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const st = [x, y], seen = new Uint8Array(W * H);
    while (st.length) {
      const yy = st.pop(), xx = st.pop(); if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const p = yy * W + xx; if (seen[p]) continue; seen[p] = 1; const i = p * 4; if (!same(i)) continue;
      if (erase) d[i + 3] = 0; else { d[i] = nc[0]; d[i + 1] = nc[1]; d[i + 2] = nc[2]; d[i + 3] = 255; }
      st.push(xx + 1, yy, xx - 1, yy, xx, yy + 1, xx, yy - 1);
    }
    ctx.putImageData(img, 0, 0);
  },
  pick(ctx, x, y) {
    if (x < 0 || y < 0 || x >= ctx.canvas.width || y >= ctx.canvas.height) return;
    const d = ctx.getImageData(x, y, 1, 1).data;
    if (!d[3]) return S.toast('จุดนี้โปร่งใส');
    S.Tool.color = S.rgbToHex(d[0], d[1], d[2]); S.Tool.kind = 'pencil'; S.emit('tool');
    S.toast('ดูดสี ' + S.Tool.color);
  }
};
S.addRecent = (c) => { const r = S.Tool.recent.filter(x => x !== c); r.unshift(c); S.Tool.recent = r.slice(0, 10); };
S.uvToPx = (a, uv) => uv ? [Math.floor(S.clamp(uv[0], 0, 0.9999) * a.tex.w), Math.floor(S.clamp(1 - uv[1], 0, 0.9999) * a.tex.h)] : [null, null];

// ---------------- 2D pixel editor ----------------
S.Paint = {
  init(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.z = 8; this.ox = 0; this.oy = 0; this.uv = true; this.grid = true;
    new ResizeObserver(() => { this.resize(); }).observe(cv.parentElement);
    const pts = new Map(); let gest = null, drawing = false;
    const pinch = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const a = S.A(); if (!a) return;
      if (pts.size === 1) { const [px, py] = this.toPx(e); drawing = true; S.Brush.begin(a, px, py); this.draw(); }
      else if (pts.size === 2) { if (drawing) S.Brush.cancel(); drawing = false; gest = pinch(); this.draw(); }
    });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1 && drawing) { const [px, py] = this.toPx(e); S.Brush.move(px, py); this.draw(); }
      else if (pts.size === 2 && gest) {
        const g = pinch(), r = cv.getBoundingClientRect();
        if (g.d > 10 && gest.d > 10) this.zoomAt(g.mx - r.left, g.my - r.top, g.d / gest.d);
        this.ox += g.mx - gest.mx; this.oy += g.my - gest.my; gest = g; this.draw();
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (drawing && pts.size === 0) { drawing = false; S.Brush.end(); this.draw(); }
      if (pts.size < 2) gest = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 0.85 : 1.18); this.draw(); }, { passive: false });
    const pc = document.createElement('canvas'); pc.width = pc.height = 16; const x = pc.getContext('2d');
    x.fillStyle = '#2a2f2a'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#3a403a'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
    this.checker = this.ctx.createPattern(pc, 'repeat');
  },
  resize() {
    const p = this.cv.parentElement, dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr; this.w = p.clientWidth; this.h = p.clientHeight;
    if (!this.w || !this.h) return;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    if (!this.fitted) this.fit(); else this.draw();
  },
  fit() {
    const a = S.A(); if (!a || !this.w) return;
    this.z = Math.max(1, Math.floor(Math.min((this.w - 24) / a.tex.w, (this.h - 24) / a.tex.h)));
    this.ox = Math.round((this.w - a.tex.w * this.z) / 2); this.oy = Math.round((this.h - a.tex.h * this.z) / 2);
    this.fitted = true; this.draw();
  },
  zoomAt(x, y, f) {
    const nz = S.clamp(this.z * f, 1, 80);
    this.ox = x - (x - this.ox) * nz / this.z; this.oy = y - (y - this.oy) * nz / this.z; this.z = nz;
  },
  toPx(e) { const r = this.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - this.ox) / this.z), Math.floor((e.clientY - r.top - this.oy) / this.z)]; },
  draw() {
    const a = S.A(), c = this.ctx; if (!c || !this.w) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#0f1810'; c.fillRect(0, 0, this.w, this.h);
    if (!a) return;
    const W = a.tex.w * this.z, H = a.tex.h * this.z;
    c.fillStyle = this.checker; c.save(); c.translate(this.ox, this.oy); c.fillRect(0, 0, W, H); c.restore();
    c.imageSmoothingEnabled = false; c.drawImage(S.texCanvas(a), this.ox, this.oy, W, H);
    if (this.grid && this.z >= 6) {
      c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.beginPath();
      for (let x = 0; x <= a.tex.w; x++) { const X = Math.round(this.ox + x * this.z) + 0.5; c.moveTo(X, this.oy); c.lineTo(X, this.oy + H); }
      for (let y = 0; y <= a.tex.h; y++) { const Y = Math.round(this.oy + y * this.z) + 0.5; c.moveTo(this.ox, Y); c.lineTo(this.ox + W, Y); }
      c.stroke();
    }
    if (this.uv && a.model && (a.kind === 'entity' || a.cfg.custom)) {
      a.model.bones.forEach(b => b.cubes.forEach(cu => {
        const sel = cu.id === S.sel.cube, bs = b.id === S.sel.bone;
        c.strokeStyle = sel ? '#f1c40f' : bs ? 'rgba(79,208,224,.8)' : 'rgba(255,255,255,.25)'; c.lineWidth = sel ? 2 : 1;
        const R = S.faceRects(cu);
        for (const f in R) { const [u, v, w, h] = R[f]; if (w > 0 && h > 0) c.strokeRect(this.ox + u * this.z + 0.5, this.oy + v * this.z + 0.5, w * this.z - 1, h * this.z - 1); }
        if (sel && this.z >= 4) { c.fillStyle = '#f1c40f'; c.font = '11px sans-serif'; c.fillText('หน้า', this.ox + (R.north[0] + 0.2) * this.z, this.oy + (R.north[1] + R.north[3]) * this.z - 3); }
      }));
    }
    c.strokeStyle = '#8fe388'; c.lineWidth = 1; c.strokeRect(this.ox - 0.5, this.oy - 0.5, W + 1, H + 1);
  }
};
