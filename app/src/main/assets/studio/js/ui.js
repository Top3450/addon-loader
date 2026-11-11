'use strict';
/* Mod Studio TH — UI: tabs, panels, modals, project/asset management */
(() => {
const $ = S.$, el = S.el;
const UI = S.UI = { manip: '', axis: 'free', drag: null, tab: 'model', step: 1, rstep: 15, playing: false, t: 0, animId: null, paint3d: false, lastBuild: null };
const panel = () => $('#panel');
const KIND_ICON = { entity: '🐾', item: '🗡', block: '🧱' };
const KIND_TH = { entity: 'มอบ/สิ่งมีชีวิต', item: 'ไอเทม', block: 'บล็อก' };

// ---------------- small builders ----------------
const sec = (title, ...kids) => el('div', { class: 'sec' }, title ? el('h3', null, title) : null, ...kids);
const row = (label, ...kids) => el('div', { class: 'row' }, label != null ? el('label', { class: 'l' }, label) : null, el('div', { class: 'f' }, ...kids));
const btn = (label, fn, cls, title) => el('button', { class: cls || '', onclick: fn, title: title || null }, label);
const tools = (...b) => el('div', { class: 'tools' }, ...b);
const note = (t, cls) => el('div', { class: 'muted ' + (cls || '') }, t);
function num(val, commit, o = {}) {
  const i = el('input', { type: 'number', step: 'any', inputmode: 'decimal', value: S.round(+val || 0, 4) });
  i.onchange = () => {
    let v = Number(i.value); if (!Number.isFinite(v)) { i.value = val; return; }
    if (o.int) v = Math.round(v); if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v);
    S.snap(); commit(v); S.changed(o.ev);
  };
  return i;
}
function txt(val, commit, ph, o = {}) {
  const i = el('input', { type: 'text', value: val == null ? '' : val, placeholder: ph || '', list: o.list || null, autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  i.onchange = () => { S.snap(); commit(i.value.trim()); S.changed(o.ev); };
  return i;
}
function chk(val, commit, label, ev) {
  const c = el('input', { type: 'checkbox' }); c.checked = !!val;
  c.onchange = () => { S.snap(); commit(c.checked); S.changed(ev); };
  return el('label', { class: 'row', style: 'gap:8px;margin:4px 0' }, c, label);
}
function sel(val, opts, commit, ev) {
  const s = el('select', null, ...opts.map(([v, l]) => el('option', { value: v }, l))); s.value = val;
  s.onchange = () => { S.snap(); commit(s.value); S.changed(ev); };
  return s;
}
function colorIn(val, commit) {
  const c = el('input', { type: 'color', value: val || '#000000' });
  c.onchange = () => { S.snap(); commit(c.value); S.changed(); };
  return c;
}
function vec(label, arr, set, step, key, o = {}) {
  const axes = ['x', 'y', 'z'].map((ax, i) => {
    const inp = el('input', { type: o.text ? 'text' : 'number', step: 'any', inputmode: o.text ? 'text' : 'decimal', value: typeof arr[i] === 'number' ? S.round(arr[i], 3) : arr[i] });
    inp.onchange = () => { const v = o.text ? S.parseVal(inp.value) : Number(inp.value); if (!o.text && !Number.isFinite(v)) return; S.snap(); set(i, v); S.changed(o.ev); };
    const bump = d => { const cur = typeof arr[i] === 'number' ? arr[i] : S.molang(arr[i], UI.t); S.snap(key + i); set(i, S.round(cur + d, 4)); S.changed(o.ev); };
    return el('div', { class: 'ax ' + ax }, inp, el('div', { class: 'pm' }, btn('−', () => bump(-step), 'sm'), btn('+', () => bump(step), 'sm')));
  });
  return row(label, el('div', { class: 'vec' }, ...axes));
}
const chips = (vals, cur, pick, fmt) => el('div', { class: 'chips' }, ...vals.map(v => btn(fmt ? fmt(v) : String(v), () => pick(v), 'sm' + (v === cur ? ' on' : ''))));
UI.idList = () => { let d = $('#idlist'); if (!d) { d = el('datalist', { id: 'idlist' }); document.body.append(d); } d.replaceChildren(...[...(S.P ? S.P.assets.map(a => `${S.P.ns}:${a.key}`) : []), ...S.ITEM_IDS].map(v => el('option', { value: v }))); return 'idlist'; };

// ---------------- modal ----------------
UI.modal = (title, build) => {
  UI.closeModal();
  const box = el('div', { class: 'box' }, el('h2', null, title));
  const m = el('div', { class: 'modal', onclick: e => { if (e.target === m && UI.modalClosable) UI.closeModal(); } }, box);
  UI.modalClosable = true;
  build(box); document.body.append(m); UI._modal = m;
};
UI.closeModal = () => { if (UI._modal) { UI._modal.remove(); UI._modal = null; } };
window.studioBack = () => { if (UI._modal && S.P) { UI.closeModal(); return 'true'; } if (UI.playing) { UI.playing = false; UI.render(); return 'true'; } return 'false'; };

// ---------------- files ----------------
UI.pickFile = (accept, as, cb) => {
  const inp = $('#filePick'); inp.value = ''; inp.accept = accept;
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(r.result, f.name); r.onerror = () => S.toast('อ่านไฟล์ไม่ได้');
    if (as === 'url') r.readAsDataURL(f); else r.readAsText(f);
  };
  inp.click();
};

// ---------------- project lifecycle ----------------
UI.open = (p) => {
  if (!p) return;
  S.saveNow();
  S.P = p; S.undoStack = []; S.redoStack = []; UI.animId = null; UI.t = 0; UI.playing = false;
  if (!p.cur && p.assets[0]) p.cur = p.assets[0].id;
  try { localStorage.setItem('mms_last', p.id); } catch (e) { /* storage unavailable */ }
  S.sel = { bone: null, cube: null }; S.fixSel();
  UI.closeModal(); S.emit('project'); S.View.frame(S.A()); S.Paint.fitted = false; S.Paint.fit(); S.saveNow();
};
UI.switchAsset = (id) => {
  S.P.cur = id; S.sel = { bone: null, cube: null }; S.fixSel(); UI.animId = null; UI.t = 0; UI.playing = false;
  S.emit('project'); S.View.frame(S.A()); S.Paint.fit(); S.saveSoon();
};
S.demoProject = () => {
  const p = S.newProject('ม็อดแรกของฉัน', 'myfirst');
  const m = S.newAsset('entity', 'humanoid', 'buddy', 'บัดดี้'); m.nameEn = 'Buddy';
  Object.assign(m.cfg, { behavior: 'passive', tameable: true, tameItems: 'minecraft:iron_ingot', rideable: true, eggBase: '#3a6ea5', eggDots: '#f1c40f', spawn: true });
  S.genAnims(m, ['attack']);
  const sw = S.newAsset('item', 'flat', 'ruby_sword', 'ดาบทับทิม'); sw.nameEn = 'Ruby Sword';
  Object.assign(sw.cfg, { damage: 7, durability: 500, handheld: true, category: 'equipment', recipe: { on: true, grid: ['', 'minecraft:redstone', '', '', 'minecraft:redstone', '', '', 'minecraft:stick', ''], count: 1 } });
  sw.code = { use: 'effect @s speed 5 1\nparticle minecraft:totem_particle ~ ~1 ~', hit: 'summon lightning_bolt ~ ~ ~' };
  m.code = { every: 5, interact: 'give @s apple 1', tick: 'effect @a[r=4] regeneration 2 0 true' };
  const cv = S.texCanvas(sw), x = cv.getContext('2d'); x.clearRect(0, 0, 16, 16);
  for (let i = 0; i < 9; i++) { x.fillStyle = i % 3 ? '#c0392b' : '#ff6f5e'; x.fillRect(4 + i, 11 - i, 1, 1); x.fillStyle = '#7a1414'; x.fillRect(5 + i, 11 - i, 1, 1); }
  x.fillStyle = '#e8c48a'; [[3, 10], [4, 11], [5, 12], [2, 9], [6, 13]].forEach(([a, b]) => x.fillRect(a, b, 1, 1));
  x.fillStyle = '#5a3a1e'; [[2, 13], [3, 12], [1, 14]].forEach(([a, b]) => x.fillRect(a, b, 1, 1)); S.syncTex(sw);
  const b = S.newAsset('block', 'full', 'glow_ore', 'แร่เรืองแสง'); b.nameEn = 'Glow Ore';
  Object.assign(b.cfg, { light: 10, destroy: 3, mapColor: '#2fd1c4', recipe: { on: false, grid: ['', '', '', '', '', '', '', '', ''], count: 1 } });
  const bx = S.texCanvas(b).getContext('2d'); for (let i = 0; i < 14; i++) { bx.fillStyle = i % 2 ? '#7fffef' : '#2fd1c4'; bx.fillRect((Math.random() * 15) | 0, (Math.random() * 15) | 0, 2, 1); } S.syncTex(b);
  p.assets.push(m, sw, b); p.cur = m.id;
  return p;
};

UI.home = () => {
  UI.modal('📁 โปรเจกต์ของฉัน', box => {
    UI.modalClosable = !!S.P;
    const list = S.store.list();
    const name = el('input', { type: 'text', placeholder: 'ชื่อม็อด เช่น ม็อดมังกร', value: '' });
    const ns = el('input', { type: 'text', placeholder: 'namespace (a-z, 0-9, _) เช่น dragonmod', autocapitalize: 'off' });
    const kind = el('select', null, ...['entity', 'item', 'block'].map(k => el('option', { value: k }, KIND_ICON[k] + ' ' + KIND_TH[k])));
    const tpl = el('select');
    const fillTpl = () => tpl.replaceChildren(...Object.entries(S.TEMPLATES[kind.value]).map(([k, t]) => el('option', { value: k }, t.label)));
    kind.onchange = fillTpl; fillTpl();
    const create = () => {
      const nm = name.value.trim() || 'ม็อดใหม่';
      let n = ns.value.trim().toLowerCase() || S.slug(nm.replace(/[^\x00-\x7f]/g, '')) ; if (!S.keyOk(n) || n === 'thing') n = 'mod' + Math.floor(Math.random() * 9000 + 1000);
      if (!S.keyOk(n)) return S.toast('namespace ใช้ได้แค่ a-z 0-9 _');
      const p = S.newProject(nm, n);
      const key = kind.value === 'entity' ? 'my_mob' : kind.value === 'item' ? 'my_item' : 'my_block';
      const a = S.newAsset(kind.value, tpl.value, key, KIND_TH[kind.value] + 'ของฉัน'); p.assets.push(a); p.cur = a.id;
      UI.open(p); S.toast('สร้างโปรเจกต์แล้ว ✨');
    };
    box.append(
      sec('✨ สร้างใหม่', row('ชื่อ', name), row('Namespace', ns), row('เริ่มด้วย', kind), row('แม่แบบ', tpl),
        tools(btn('➕ สร้างโปรเจกต์', create, 'ok'), btn('🎁 เปิดตัวอย่าง', () => { UI.open(S.demoProject()); S.toast('เปิดโปรเจกต์ตัวอย่าง: มอบ + ดาบ + บล็อก'); }, 'pri'))),
      sec('📂 โปรเจกต์ที่มี (' + list.length + ')',
        list.length ? el('div', { class: 'plist' }, ...list.map(it => el('div', { class: 'pitem' },
          el('div', { class: 'n' }, el('b', null, (S.P && S.P.id === it.id ? '▶ ' : '') + it.name), el('span', { class: 'muted' }, new Date(it.updated || Date.now()).toLocaleString('th-TH'))),
          btn('เปิด', () => { const p = S.store.read(it.id); if (p) UI.open(p); else S.toast('เปิดไม่ได้'); }, 'sm pri'),
          btn('📄', () => { const p = S.store.read(it.id); if (!p) return; p.id = S.uid(); p.name += ' (สำเนา)'; p.uuids = { bpH: S.uuid(), bpM: S.uuid(), rpH: S.uuid(), rpM: S.uuid() }; p.updated = Date.now(); S.store.write(p); UI.home(); }, 'sm', 'ทำสำเนา'),
          btn('🗑', () => { if (!confirm('ลบโปรเจกต์ "' + it.name + '" ถาวร?')) return; S.store.del(it.id); if (S.P && S.P.id === it.id) S.P = null; UI.home(); }, 'sm danger')
        ))) : note('ยังไม่มีโปรเจกต์'),
        tools(btn('📥 นำเข้าโปรเจกต์ (.json)', () => UI.pickFile('.json,application/json', 'text', t => {
          try { const p = JSON.parse(t); if (!p.assets || !p.ns) throw 0; p.id = S.uid(); p.updated = Date.now(); UI.open(p); S.toast('นำเข้าแล้ว'); } catch (e) { S.toast('ไฟล์นี้ไม่ใช่โปรเจกต์ Mod Studio'); }
        })))),
      S.P ? btn('ปิด', UI.closeModal) : note(S.isAndroid ? 'บันทึกอัตโนมัติในแอพ' : 'บันทึกอัตโนมัติในเบราว์เซอร์นี้')
    );
  });
};

UI.assets = () => {
  UI.modal('📚 ชิ้นงานในโปรเจกต์', box => {
    const P = S.P;
    const kind = el('select', null, ...['entity', 'item', 'block'].map(k => el('option', { value: k }, KIND_ICON[k] + ' ' + KIND_TH[k])));
    const tpl = el('select'); const fillTpl = () => tpl.replaceChildren(...Object.entries(S.TEMPLATES[kind.value]).map(([k, t]) => el('option', { value: k }, t.label)));
    kind.onchange = fillTpl; fillTpl();
    const name = el('input', { type: 'text', placeholder: 'ชื่อที่แสดงในเกม' });
    const key = el('input', { type: 'text', placeholder: 'ไอดี เช่น fire_dragon', autocapitalize: 'off' });
    box.append(
      el('div', { class: 'plist' }, ...P.assets.map(a => el('div', { class: 'pitem', style: a.id === P.cur ? 'outline:2px solid var(--acc)' : '' },
        el('div', { class: 'n' }, el('b', null, KIND_ICON[a.kind] + ' ' + (a.name || a.key)), el('span', { class: 'muted' }, `${P.ns}:${a.key}`)),
        btn('เลือก', () => { UI.closeModal(); UI.switchAsset(a.id); }, 'sm pri'),
        btn('📄', () => { S.snap(); const c = S.clone(a); c.id = S.uid(); let k = a.key + '_2', i = 3; while (P.assets.some(x => x.key === k)) k = a.key + '_' + (i++); c.key = k; c.name = (a.name || a.key) + ' 2';
          S.texCache.delete(c.id); P.assets.push(c); UI.closeModal(); UI.switchAsset(c.id); }, 'sm', 'ทำซ้ำ'),
        btn('🗑', () => { if (P.assets.length < 2) return S.toast('ต้องมีอย่างน้อย 1 ชิ้น'); if (!confirm('ลบ "' + (a.name || a.key) + '"?')) return; S.snap(); P.assets = P.assets.filter(x => x.id !== a.id); if (P.cur === a.id) P.cur = P.assets[0].id; UI.closeModal(); UI.switchAsset(P.cur); }, 'sm danger')
      ))),
      sec('➕ เพิ่มชิ้นใหม่', row('ประเภท', kind), row('แม่แบบ', tpl), row('ชื่อ', name), row('ไอดี', key),
        tools(btn('➕ เพิ่ม', () => {
          let k = (key.value.trim() || S.slug(name.value.replace(/[^\x00-\x7f]/g, '')) || '').toLowerCase();
          if (!S.keyOk(k) || k === 'thing') k = kind.value + '_' + (P.assets.length + 1);
          if (P.assets.some(a => a.key === k)) return S.toast('ไอดีนี้มีแล้ว');
          S.snap(); const a = S.newAsset(kind.value, tpl.value, k, name.value.trim() || k); P.assets.push(a);
          UI.closeModal(); UI.switchAsset(a.id); S.toast('เพิ่ม ' + KIND_TH[a.kind] + ' แล้ว');
        }, 'ok'))),
      btn('ปิด', UI.closeModal)
    );
  });
};

// ---------------- stage ----------------
UI.stage = () => {
  const a = S.A(), paint2d = UI.tab === 'paint' && !UI.paint3d;
  $('#view3d').style.display = paint2d ? 'none' : 'block';
  $('#paint2d').style.display = paint2d ? 'block' : 'none';
  $('#paint3dBtn').style.display = UI.tab === 'paint' ? 'block' : 'none';
  $('#paint3dBtn').classList.toggle('on', UI.paint3d);
  $('#paint3dBtn').textContent = UI.paint3d ? '🖼' : '🧊';
  $('#paint3dBtn').title = UI.paint3d ? 'กลับไปวาดแบบ 2D' : 'ระบายบนโมเดล 3D';
  S.View.paint = UI.tab === 'paint' && UI.paint3d;
  S.View.showSel = UI.tab === 'model' || UI.tab === 'anim';
  const canManip = (UI.tab === 'model' || UI.tab === 'anim') && a && a.model && (a.kind === 'entity' || a.cfg.custom);
  S.View.manip = canManip ? UI.manip : '';
  ['moveBtn', 'rotBtn', 'axisBtn'].forEach(id => { $('#' + id).style.display = canManip ? 'block' : 'none'; });
  $('#moveBtn').classList.toggle('on', UI.manip === 'move'); $('#rotBtn').classList.toggle('on', UI.manip === 'rot');
  $('#axisBtn').textContent = { free: '✳️', x: 'X', y: 'Y', z: 'Z' }[UI.axis];
  $('#axisBtn').style.color = { free: '', x: '#e0574f', y: '#6fcf5a', z: '#4f8fe0' }[UI.axis];
  S.View.highlight();
  if (paint2d) { S.Paint.resize(); } else S.View.resize();
  const info = $('#stageInfo');
  if (!a) info.textContent = '';
  else if (UI.tab === 'paint') info.textContent = paint2d ? `${a.tex.w}×${a.tex.h}px • นิ้วเดียววาด • สองนิ้วเลื่อน/ซูม` : 'ระบายบนโมเดล • สองนิ้วหมุน/ซูม';
  else if (UI.tab === 'anim') info.textContent = 'แตะโมเดลเพื่อเลือกกระดูก';
  else if (UI.tab === 'code') info.textContent = 'พิมพ์คำสั่งว่า ' + (a.name || a.key) + ' ทำอะไรได้';
  else info.textContent = a.kind === 'entity' || a.cfg.custom ? 'แตะกล่องเพื่อเลือก • ลากหมุน • สองนิ้วเลื่อน/ซูม' : 'ลากหมุน • สองนิ้วซูม';
  if (canManip && UI.manip) info.textContent = (UI.manip === 'move' ? '✋ ลากชิ้นส่วนเพื่อย้าย' : '🔄 ลากชิ้นส่วนเพื่อหมุน') + (UI.axis === 'free' ? '' : ' (แกน ' + UI.axis.toUpperCase() + ')') + ' • ลากที่ว่าง = หมุนกล้อง' + (UI.tab === 'anim' ? ' • ใส่คีย์ให้อัตโนมัติ' : '');
  UI.applyPose();
};
UI.applyPose = () => {
  const a = S.A();
  if (UI.tab === 'anim' && a && a.kind === 'entity') S.View.applyPose(S.pose(UI.anim(), UI.t));
  else S.View.applyPose(null);
};
UI.anim = () => { const a = S.A(); if (!a || !a.anims) return null; let an = a.anims.find(x => x.id === UI.animId); if (!an) { an = a.anims[0] || null; UI.animId = an && an.id; } return an; };

// ---------------- header + render ----------------
UI.header = () => {
  const a = S.A();
  $('#assetBtn').textContent = a ? `${KIND_ICON[a.kind]} ${a.name || a.key}  ▾` : 'เปิดโปรเจกต์';
  $('#undoBtn').disabled = !S.undoStack.length; $('#redoBtn').disabled = !S.redoStack.length;
};
UI.render = () => {
  const p = panel(), sc = p.scrollTop;
  UI.header();
  if (!S.P || !S.A()) { p.replaceChildren(note('ยังไม่ได้เปิดโปรเจกต์'), btn('📁 เปิด/สร้างโปรเจกต์', UI.home, 'pri')); return; }
  const f = { model: UI.pModel, paint: UI.pPaint, anim: UI.pAnim, cfg: UI.pCfg, code: UI.pCode, export: UI.pExport }[UI.tab];
  p.replaceChildren(...[].concat(f()));
  p.scrollTop = sc;
};

// ---------------- finger drag: move / rotate parts ----------------
UI.onManip = (phase, d) => {
  const a = S.A();
  if (phase === 'start') {
    const h = d.hit; if (!a || !a.model || !h || !h.cubeId) return false;
    const anim = UI.tab === 'anim' ? UI.anim() : null;
    if (UI.tab === 'anim' && !anim) { S.toast('สร้างท่าก่อน แล้วค่อยลากจัดท่า'); return false; }
    if (UI.tab === 'anim') { if (h.boneId !== S.sel.bone || S.sel.cube) S.sel = { bone: h.boneId, cube: null }; }
    else if (h.cubeId !== S.sel.cube && !(S.sel.cube == null && h.boneId === S.sel.bone)) S.sel = { bone: h.boneId, cube: h.cubeId };
    S.snap();
    const ch = UI.manip === 'move' ? 'pos' : 'rot', def = ch === 'pos' ? 0 : 0;
    let base = null;
    if (anim) { const tr = S.track(anim, S.sel.bone, ch), k = tr && tr.find(k => Math.abs(k.t - UI.t) < 0.0005);
      base = k ? k.v.map(v => S.molang(v, UI.t)) : (S.sample(tr, UI.t) || [def, def, def]); }
    UI.drag = { model: S.clone(a.model), tracks: anim ? S.clone(anim.tracks) : null, base, ch, moved: false };
    S.View.highlight(); UI.applyPose();
    return true;
  }
  const g = UI.drag; if (!g || !a) return;
  const restore = () => { a.model = S.clone(g.model); const an = UI.anim(); if (g.tracks && an) an.tracks = S.clone(g.tracks); };
  if (phase === 'cancel') { restore(); S.undoStack.pop(); UI.drag = null; S.View.build(a); UI.stage(); return; }
  if (phase === 'end') {
    UI.drag = null;
    if (!g.moved) { S.undoStack.pop(); S.emit('sel'); UI.stage(); return; }
    S.changed(UI.tab === 'anim' ? 'anim' : undefined); UI.stage(); return;
  }
  // move
  const i = 'xyz'.indexOf(UI.axis);
  let delta = [0, 0, 0];
  if (UI.manip === 'move') {
    const v = S.View.dragVec(d.dx, d.dy); delta = [-v.x, v.y, v.z];
    if (i >= 0) delta = delta.map((x, j) => j === i ? x : 0);
    const st = UI.tab === 'anim' ? Math.min(UI.step, 0.5) : UI.step;
    delta = delta.map(x => S.round(Math.round(x / st) * st, 4));
  } else {
    const { c, R } = S.View.camBasis(), k = 0.6;
    const yaw = -(Math.sign(c.z * R.x - c.x * R.z) || 1), pitch = -(Math.sign(c.z) || 1);
    if (i < 0) { delta[1] = d.dx * k * yaw; delta[0] = d.dy * k * pitch; }
    else if (i === 0) delta[0] = d.dy * k * pitch;
    else if (i === 1) delta[1] = d.dx * k * yaw;
    else delta[2] = d.dx * k * -pitch;
    const st = UI.tab === 'anim' ? Math.min(UI.rstep, 5) : UI.rstep;
    delta = delta.map(x => S.round(Math.round(x / st) * st, 3));
  }
  restore();
  if (delta.some(v => v)) g.moved = true;
  if (UI.tab === 'anim') {
    const an = UI.anim(), nv = g.base.map((v, j) => S.round(v + delta[j], 3));
    if (delta.some(v => v)) S.setKey(an, S.sel.bone, g.ch, UI.t, nv, UI.interp);
    UI.applyPose();
  } else {
    const b = S.bone(a, S.sel.bone), c = S.sel.cube && b && b.cubes.find(x => x.id === S.sel.cube);
    if (UI.manip === 'move') {
      if (c) for (let j = 0; j < 3; j++) { c.origin[j] = S.round(c.origin[j] + delta[j], 4); c.pivot[j] = S.round(c.pivot[j] + delta[j], 4); }
      else if (b) for (let j = 0; j < 3; j++) if (delta[j]) UI.moveBoneTree(a, b, j, delta[j]);
    } else {
      const t = c || b; if (t) t.rot = t.rot.map((v, j) => S.round(v + delta[j], 3));
    }
    S.View.build(a);
  }
  const lab = UI.manip === 'move' ? 'ย้าย' : 'หมุน', u = UI.manip === 'move' ? '' : '°';
  $('#stageInfo').textContent = `${lab} ${delta.map((v, j) => 'XYZ'[j] + (v >= 0 ? '+' : '') + v + u).join('  ')}`;
};

// ---------------- MODEL tab ----------------
UI.findUVSpot = (a, fp) => {
  const rects = S.allCubes(a).map(c => { const f = S.uvFootprint(c); return [c.uv[0], c.uv[1], f[0], f[1]]; });
  const free = (x, y) => x + fp[0] <= a.tex.w && y + fp[1] <= a.tex.h && !rects.some(r => x < r[0] + r[2] && x + fp[0] > r[0] && y < r[1] + r[3] && y + fp[1] > r[1]);
  for (let y = 0; y + fp[1] <= a.tex.h; y++) for (let x = 0; x + fp[0] <= a.tex.w; x++) if (free(x, y)) return [x, y];
  const oldH = a.tex.h; let H = a.tex.h * 2; while (H < oldH + fp[1]) H *= 2;
  let W = a.tex.w; while (W < fp[0]) W *= 2;
  S.resizeTex(a, W, H, true); return [0, oldH];
};
UI.ensureModel = (a) => {
  if (!a.model) a.model = { bones: [] };
  if (!a.model.bones.length) { const b = S.mkBone(a.kind === 'block' ? 'block' : 'root', [0, 0, 0]); a.model.bones.push(b); S.sel.bone = b.id; }
  if (!S.sel.bone) S.sel.bone = a.model.bones[0].id;
  return S.bone(a, S.sel.bone);
};
UI.addCube = () => {
  const a = S.A(); S.snap(); const b = UI.ensureModel(a);
  const c = S.mkCube([b.pivot[0] - 2, b.pivot[1], b.pivot[2] - 2], [4, 4, 4]);
  c.uv = UI.findUVSpot(a, S.uvFootprint(c)); b.cubes.push(c); S.sel.cube = c.id;
  const x = S.texCanvas(a).getContext('2d'); const R = S.faceRects(c), hue = Math.random() * 360 | 0;
  for (const f in R) { const [u, v, w, h] = R[f]; x.fillStyle = S.hsl(hue, 40, f === 'up' ? 60 : f === 'down' ? 35 : 48); x.fillRect(u, v, w, h); }
  S.syncTex(a); S.changed(); S.toast('เพิ่มกล่องแล้ว');
};
UI.addBone = () => {
  const a = S.A(); S.snap(); UI.ensureModel(a);
  const parent = S.sel.bone && S.bone(a, S.sel.bone);
  const b = S.mkBone(S.uniqueBoneName(a, 'bone'), parent ? parent.pivot : [0, 8, 0], parent ? parent.id : null);
  a.model.bones.push(b); S.sel = { bone: b.id, cube: null }; S.changed(); S.toast('เพิ่มกระดูกแล้ว — กด ➕ กล่อง เพื่อใส่ชิ้นส่วน');
};
const swapSide = n => n.replace(/right|Right|RIGHT|left|Left|LEFT/g, m => ({ right: 'left', Right: 'Left', RIGHT: 'LEFT', left: 'right', Left: 'Right', LEFT: 'RIGHT' }[m]))
  .replace(/(^|_)([rl])(\d|_|$)/g, (m, a, s, b) => a + (s === 'r' ? 'l' : 'r') + b);
const mirrorCube = c => { const n = S.clone(c); n.id = S.uid(); n.origin[0] = -(c.origin[0] + c.size[0]); n.pivot[0] = -c.pivot[0]; n.rot = [c.rot[0], -c.rot[1], -c.rot[2]]; n.mirror = !c.mirror; return n; };
UI.duplicate = (mirror) => {
  const a = S.A(); if (!a.model) return;
  const b = S.bone(a, S.sel.bone); if (!b) return S.toast('เลือกกล่องหรือกระดูกก่อน');
  S.snap();
  if (S.sel.cube) {
    const c = b.cubes.find(c => c.id === S.sel.cube);
    const n = mirror ? mirrorCube(c) : Object.assign(S.clone(c), { id: S.uid() });
    if (!mirror) { n.origin[0] -= UI.step; n.pivot[0] -= UI.step; }
    b.cubes.push(n); S.sel.cube = n.id;
  } else {
    const map = {}, list = [b, ...S.descendants(a, b.id)];
    list.forEach(src => {
      const nb = S.clone(src); nb.id = S.uid(); map[src.id] = nb.id;
      nb.name = S.uniqueBoneName(a, mirror ? (swapSide(src.name) !== src.name ? swapSide(src.name) : src.name + '_mirror') : src.name + '_copy');
      nb.parent = src === b ? src.parent : map[src.parent];
      nb.cubes = src.cubes.map(c => mirror ? mirrorCube(c) : Object.assign(S.clone(c), { id: S.uid() }));
      if (mirror) { nb.pivot[0] = -src.pivot[0]; nb.rot = [src.rot[0], -src.rot[1], -src.rot[2]]; }
      a.model.bones.push(nb);
    });
    S.sel = { bone: map[b.id], cube: null };
  }
  S.changed(); S.toast(mirror ? 'สะท้อนซ้าย-ขวาแล้ว' : 'ทำซ้ำแล้ว');
};
UI.deleteSel = () => {
  const a = S.A(); if (!a.model) return; const b = S.bone(a, S.sel.bone); if (!b) return;
  if (S.sel.cube) { S.snap(); b.cubes = b.cubes.filter(c => c.id !== S.sel.cube); S.sel.cube = null; S.changed(); return; }
  if (!confirm(`ลบกระดูก "${b.name}" และกล่องในนั้น? (กระดูกลูกจะย้ายไปอยู่กับกระดูกแม่)`)) return;
  S.snap();
  S.children(a, b.id).forEach(c => c.parent = b.parent);
  a.model.bones = a.model.bones.filter(x => x.id !== b.id);
  (a.anims || []).forEach(an => delete an.tracks[b.id]);
  S.sel = { bone: null, cube: null }; S.fixSel(); S.changed();
};
UI.moveBoneTree = (a, b, i, d) => {
  [b, ...S.descendants(a, b.id)].forEach(x => { x.pivot[i] = S.round(x.pivot[i] + d, 4); x.cubes.forEach(c => { c.origin[i] = S.round(c.origin[i] + d, 4); c.pivot[i] = S.round(c.pivot[i] + d, 4); }); });
};
UI.pModel = () => {
  const a = S.A(), out = [];
  if (a.kind === 'item') return [sec('🗡 ไอเทม', note('ไอเทมใช้ภาพ 2D ขนาด 16×16 (หรือ 32×32) — ไปวาดที่แท็บ 🎨 เท็กซ์เจอร์ แล้วตั้งค่าความสามารถที่แท็บ ⚙️'), tools(btn('🎨 ไปวาดภาพ', () => UI.go('paint'), 'pri')))];
  if (a.kind === 'block' && !a.cfg.custom) return [sec('🧱 บล็อกเต็มก้อน', note('บล็อกนี้ใช้รูปทรงลูกบาศก์มาตรฐาน ทุกด้านใช้ภาพเดียวกัน'),
    tools(btn('🎨 วาดลายบล็อก', () => UI.go('paint'), 'pri'), btn('🧊 เปลี่ยนเป็นโมเดลเอง', () => {
      S.snap(); a.cfg.custom = true;
      if (!a.model || !S.allCubes(a).length) { const t = S.newAsset('block', 'slab', a.key, a.name); a.model = t.model; a.tex = t.tex; S.texCache.delete(a.id); S.sel = { bone: a.model.bones[0].id, cube: null }; }
      S.changed(); S.View.frame(a);
    })))];
  out.push(sec('🛠 เครื่องมือ', tools(
    btn('➕ กล่อง', UI.addCube, 'ok'), btn('🦴 กระดูก', UI.addBone), btn('📄 ทำซ้ำ', () => UI.duplicate(false)), btn('🪞 สะท้อน', () => UI.duplicate(true)),
    btn('🗑 ลบ', UI.deleteSel, 'danger'),
    btn('📐 จัด UV อัตโนมัติ', () => { if (!confirm('จัดตำแหน่ง UV ใหม่ทั้งหมด? (ลายที่วาดไว้อาจไม่ตรงตำแหน่งเดิม)')) return; S.snap(); S.autoUV(a); S.changed(); }),
    btn('🎨 ลงสีแม่แบบ', () => { if (!confirm('ทับเท็กซ์เจอร์ด้วยสีแม่แบบตามรูปทรง?')) return; S.snap(); S.paintTemplate(a); S.changed(); }),
    btn('📥 นำเข้า .geo.json', () => UI.pickFile('.json,application/json', 'text', t => {
      try { S.snap(); const r = S.Bedrock.importGeo(JSON.parse(t), a); if (r.tw !== a.tex.w || r.th !== a.tex.h) S.resizeTex(a, r.tw, r.th, true);
        S.sel = { bone: null, cube: null }; S.fixSel(); S.changed(); S.View.frame(a); S.toast(r.perFace ? 'นำเข้าแล้ว (UV แบบรายหน้าถูกแปลงเป็น Box UV — ตรวจลายอีกที)' : 'นำเข้าโมเดลแล้ว 🎉');
      } catch (e) { S.undoStack.pop(); S.toast('นำเข้าไม่ได้: ' + e.message); }
    })),
    a.kind === 'block' ? btn('🧱 กลับเป็นบล็อกเต็มก้อน', () => { S.snap(); a.cfg.custom = false; S.changed(); S.View.frame(a); }) : null
  ), el('div', { class: 'row' }, el('span', { class: 'muted' }, 'ระยะขยับ:'), chips([0.25, 0.5, 1, 2, 4, 8], UI.step, v => { UI.step = v; UI.render(); }), el('span', { class: 'muted' }, 'หมุน:'), chips([5, 15, 45], UI.rstep, v => { UI.rstep = v; UI.render(); }, v => v + '°'))));
  // outliner
  const tree = el('div', { class: 'tree' });
  (a.model ? S.boneOrder(a) : []).forEach(b => {
    const d = S.depth(a, b);
    tree.append(el('div', { class: b.id === S.sel.bone && !S.sel.cube ? 'sel' : (b.id === S.sel.bone ? 'bsel' : ''), style: `padding-left:${8 + d * 16}px`, onclick: () => { S.sel = { bone: b.id, cube: null }; S.emit('sel'); } }, `🦴 ${b.name}`));
    b.cubes.forEach((c, i) => tree.append(el('div', { class: c.id === S.sel.cube ? 'sel' : '', style: `padding-left:${26 + d * 16}px`, onclick: () => { S.sel = { bone: b.id, cube: c.id }; S.emit('sel'); } }, `▫ กล่อง ${i + 1}  (${c.size.map(v => S.round(v, 2)).join('×')})`)));
  });
  out.push(sec('🌳 โครงสร้าง', tree.childNodes.length ? tree : note('ยังไม่มีอะไร — กด ➕ กล่อง')));
  // inspector
  const b = a.model && S.bone(a, S.sel.bone), c = b && S.sel.cube && b.cubes.find(c => c.id === S.sel.cube);
  if (c) {
    out.push(sec('▫ กล่องที่เลือก',
      vec('ตำแหน่ง', c.origin, (i, v) => { const d = v - c.origin[i]; c.origin[i] = v; c.pivot[i] = S.round(c.pivot[i] + d, 4); }, UI.step, 'co' + c.id),
      vec('ขนาด', c.size, (i, v) => { c.size[i] = Math.max(0, v); }, UI.step, 'cs' + c.id),
      vec('หมุน (°)', c.rot, (i, v) => { c.rot[i] = v; }, UI.rstep, 'cr' + c.id),
      vec('จุดหมุน', c.pivot, (i, v) => { c.pivot[i] = v; }, UI.step, 'cp' + c.id),
      row('UV', el('div', { class: 'vec' }, num(c.uv[0], v => c.uv[0] = Math.max(0, v), { int: true }), num(c.uv[1], v => c.uv[1] = Math.max(0, v), { int: true }))),
      row('พองออก', num(c.inflate, v => c.inflate = v)),
      chk(c.mirror, v => c.mirror = v, 'กลับลายซ้าย-ขวา (mirror)'),
      row('อยู่ในกระดูก', sel(b.id, a.model.bones.map(x => [x.id, x.name]), v => { const nb = S.bone(a, v); b.cubes = b.cubes.filter(x => x !== c); nb.cubes.push(c); S.sel.bone = v; })),
      tools(btn('จุดหมุนกึ่งกลาง', () => { S.snap(); c.pivot = c.origin.map((o, i) => S.round(o + c.size[i] / 2, 4)); S.changed(); }, 'sm'),
        btn('วางบนพื้น', () => { S.snap(); const d = -c.origin[1]; c.origin[1] = 0; c.pivot[1] += d; S.changed(); }, 'sm'))
    ));
  } else if (b) {
    const desc = new Set(S.descendants(a, b.id).map(x => x.id));
    out.push(sec('🦴 กระดูกที่เลือก',
      row('ชื่อ', txt(b.name, v => { const n = v.replace(/[^A-Za-z0-9_]/g, '_') || b.name; if (n !== b.name && S.boneByName(a, n)) return S.toast('ชื่อซ้ำ'); b.name = n; })),
      note('ตั้งชื่อ "head" เพื่อให้หัวหันมองผู้เล่นอัตโนมัติ • มี leg/arm ในชื่อเพื่อให้สร้างท่าเดินอัตโนมัติได้'),
      row('กระดูกแม่', sel(b.parent || '', [['', '(ไม่มี)'], ...a.model.bones.filter(x => x.id !== b.id && !desc.has(x.id)).map(x => [x.id, x.name])], v => b.parent = v || null)),
      vec('จุดหมุน', b.pivot, (i, v) => { b.pivot[i] = v; }, UI.step, 'bp' + b.id),
      vec('หมุน (°)', b.rot, (i, v) => { b.rot[i] = v; }, UI.rstep, 'br' + b.id),
      row('ย้ายทั้งชิ้น', el('div', { class: 'vec' }, ...['x', 'y', 'z'].map((ax, i) => el('div', { class: 'ax ' + ax }, el('div', { class: 'pm' },
        btn('−' + ax.toUpperCase(), () => { S.snap('mv' + i); UI.moveBoneTree(a, b, i, -UI.step); S.changed(); }, 'sm'),
        btn('+' + ax.toUpperCase(), () => { S.snap('mv' + i); UI.moveBoneTree(a, b, i, UI.step); S.changed(); }, 'sm'))))))
    ));
  }
  out.push(note('หน่วยเป็นพิกเซล (16 = 1 บล็อก) • ลูกศรเหลืองบนพื้นคือด้านหน้าของโมเดล • แกน X แดง, Y เขียว, Z น้ำเงิน'));
  return out;
};

// ---------------- PAINT tab ----------------
UI.pPaint = () => {
  const a = S.A(), T = S.Tool;
  const TOOLS = [['pencil', '✏️ ปากกา'], ['eraser', '🧽 ยางลบ'], ['fill', '🪣 เทสี'], ['picker', '💧 ดูดสี'], ['line', '📏 เส้น'], ['rect', '⬜ กรอบ'], ['shade', '🌑 เข้มขึ้น'], ['light', '🌕 สว่างขึ้น'], ['noise', '🌫 สุ่มเฉด']];
  const ci = el('input', { type: 'color', value: T.color }); ci.oninput = () => { T.color = ci.value; if (['eraser', 'picker'].includes(T.kind)) T.kind = 'pencil'; };
  ci.onchange = () => { S.addRecent(T.color); UI.render(); };
  const sw = (list) => el('div', { class: 'swatches' }, ...list.map(c => el('i', { class: c === T.color ? 'on' : '', style: 'background:' + c, onclick: () => { T.color = c; if (['eraser', 'picker'].includes(T.kind)) T.kind = 'pencil'; UI.render(); } })));
  const sizes = a.kind === 'item' ? [[16, 16], [32, 32], [64, 64]] : a.kind === 'block' && !a.cfg.custom ? [[16, 16], [32, 32], [64, 64]] : [[32, 32], [64, 32], [64, 64], [128, 64], [128, 128], [256, 256]];
  return [
    sec('🖌 เครื่องมือ', el('div', { class: 'chips' }, ...TOOLS.map(([k, l]) => btn(l, () => { T.kind = k; UI.render(); }, 'sm' + (T.kind === k ? ' on' : '')))),
      el('div', { class: 'row' }, el('span', { class: 'muted' }, 'ขนาดหัวแปรง:'), chips([1, 2, 3, 4], T.size, v => { T.size = v; UI.render(); }))),
    sec('🎨 สี', el('div', { class: 'row' }, ci, el('span', { class: 'muted' }, T.color), btn('💧 ดูดสี', () => { T.kind = 'picker'; UI.render(); }, 'sm')),
      note('ล่าสุด'), sw(T.recent), note('จานสี'), sw(S.PALETTE)),
    sec('🧩 มุมมอง', tools(
      btn(UI.paint3d ? '🖼 วาดแบบ 2D' : '🧊 ระบายบนโมเดล', () => { UI.paint3d = !UI.paint3d; UI.stage(); UI.render(); }, 'pri'),
      btn('🔍 พอดีจอ', () => S.Paint.fit()),
      btn((S.Paint.grid ? '☑' : '☐') + ' ตาราง', () => { S.Paint.grid = !S.Paint.grid; S.Paint.draw(); UI.render(); }),
      (a.model && (a.kind === 'entity' || a.cfg.custom)) ? btn((S.Paint.uv ? '☑' : '☐') + ' เส้น UV', () => { S.Paint.uv = !S.Paint.uv; S.Paint.draw(); UI.render(); }) : null)),
    sec('🖼 เท็กซ์เจอร์ ' + a.tex.w + '×' + a.tex.h, tools(
      ...sizes.map(([w, h]) => btn(`${w}×${h}`, () => {
        if (w === a.tex.w && h === a.tex.h) return;
        const scale = a.kind !== 'entity' && !a.cfg.custom;
        S.snap();
        if (scale) { const old = S.texCanvas(a), cv = S.newCanvas(w, h), x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(old, 0, 0, w, h); a.tex = { w, h, data: cv.toDataURL('image/png') }; S.texCache.delete(a.id); }
        else S.resizeTex(a, w, h, true);
        S.changed(); S.Paint.fit();
      }, 'sm' + (w === a.tex.w && h === a.tex.h ? ' on' : ''))))),
    sec('📁 ไฟล์ภาพ', tools(
      btn('📥 นำเข้า PNG', () => UI.pickFile('image/*', 'url', url => {
        const img = new Image(); img.onload = () => {
          S.snap(); const cv = S.newCanvas(img.width, img.height); cv.getContext('2d').drawImage(img, 0, 0);
          a.tex = { w: img.width, h: img.height, data: cv.toDataURL('image/png') }; S.texCache.delete(a.id); S.changed(); S.Paint.fit(); S.toast('นำเข้าภาพแล้ว');
        }; img.onerror = () => S.toast('เปิดภาพไม่ได้'); img.src = url;
      })),
      btn('💾 บันทึก PNG', () => S.deliver(`${a.key}.png`, S.dataUrlBytes(a.tex.data), 'image/png')),
      btn('🧹 ล้างทั้งหมด', () => { if (!confirm('ล้างเท็กซ์เจอร์ทั้งหมด?')) return; S.snap(); a.tex.data = S.blankPng(a.tex.w, a.tex.h); S.changed(); }, 'danger'),
      (a.model && (a.kind === 'entity' || a.cfg.custom)) ? btn('🎨 ลงสีแม่แบบ', () => { S.snap(); S.paintTemplate(a); S.changed(); }) : null,
      btn('🪨 เติมลายเม็ด (สีปัจจุบัน)', () => { S.snap(); S.paintNoise(a, T.color, 0.12); S.changed(); })
    )),
    note('สองนิ้ว = เลื่อน/ซูม • กรอบเหลือง = กล่องที่เลือก (คำว่า "หน้า" คือด้านหน้า) • ภาพจะบันทึกอัตโนมัติ')
  ];
};

// ---------------- ANIM tab ----------------
const ROLE = [['idle', '🧍 ยืนนิ่ง (idle)'], ['walk', '🚶 เดิน (walk)'], ['attack', '⚔️ โจมตี (attack)'], ['always', '🔁 เล่นตลอด'], ['none', '— ไม่ใช้อัตโนมัติ']];
const CH = [['rot', 'หมุน (°)', 0, '#e0574f'], ['pos', 'เลื่อน (px)', 0, '#6fcf5a'], ['scl', 'ขยาย (เท่า)', 1, '#4f8fe0']];
UI.setTime = (t, live) => {
  const an = UI.anim(); if (!an) return;
  UI.t = S.clamp(t, 0, an.len); UI.applyPose();
  if (UI.timeEls) { UI.timeEls.slider.value = UI.t; UI.timeEls.label.textContent = UI.t.toFixed(2) + ' / ' + an.len + ' วิ'; UI.timeEls.cursor.style.left = (UI.t / an.len * 100) + '%'; }
  if (!live) UI.render();
};
UI.pAnim = () => {
  const a = S.A();
  UI.timeEls = null;
  if (a.kind !== 'entity') return [sec('🎬 แอนิเมชัน', note('แอนิเมชันใช้ได้กับมอบ/สิ่งมีชีวิต — สลับชิ้นงานที่ปุ่มด้านบน'))];
  if (!a.model || !a.model.bones.length) return [sec('🎬 แอนิเมชัน', note('สร้างโมเดลก่อนที่แท็บ 🧊'))];
  const an = UI.anim(), out = [];
  const genBtns = tools(
    btn('🚶 สร้างท่าเดิน', () => gen('walk')), btn('🧍 สร้างท่ายืน', () => gen('idle')), btn('⚔️ สร้างท่าโจมตี', () => gen('attack')));
  function gen(w) {
    if (a.anims.some(x => x.role === w) && !confirm('มีท่านี้อยู่แล้ว สร้างใหม่ทับ?')) return;
    S.snap(); const made = S.genAnims(a, [w]);
    if (!made.length) { S.undoStack.pop(); return S.toast('หากระดูกที่ชื่อมี leg/arm/head/body ไม่เจอ'); }
    UI.animId = a.anims.find(x => x.role === w).id; UI.t = 0; S.changed('anim'); S.toast('สร้างท่าแล้ว — กด ▶ ดู');
  }
  const animSel = el('select', null, ...a.anims.map(x => el('option', { value: x.id }, `${x.name}  [${(ROLE.find(r => r[0] === x.role) || ROLE[4])[1]}]`)));
  animSel.value = an ? an.id : ''; animSel.onchange = () => { UI.animId = animSel.value; UI.t = 0; UI.playing = false; UI.applyPose(); UI.render(); };
  out.push(sec('🎬 ท่าทาง', a.anims.length ? row('ท่า', animSel) : note('ยังไม่มีท่า — สร้างอัตโนมัติหรือกด ➕'),
    tools(
      btn('➕ ใหม่', () => { const n = prompt('ชื่อท่า (a-z 0-9 _)', 'anim' + (a.anims.length + 1)); if (!n) return; const k = S.slug(n); if (a.anims.some(x => x.name === k)) return S.toast('ชื่อซ้ำ'); S.snap(); const x = S.newAnim(k, 'none'); a.anims.push(x); UI.animId = x.id; UI.t = 0; S.changed('anim'); }, 'ok'),
      an ? btn('✏️ ชื่อ', () => { const n = prompt('ชื่อใหม่', an.name); if (!n) return; const k = S.slug(n); if (a.anims.some(x => x.name === k && x !== an)) return S.toast('ชื่อซ้ำ'); S.snap(); an.name = k; S.changed('anim'); }) : null,
      an ? btn('📄', () => { S.snap(); const x = S.clone(an); x.id = S.uid(); let k = an.name + '_2', i = 3; while (a.anims.some(y => y.name === k)) k = an.name + '_' + (i++); x.name = k; x.role = 'none'; a.anims.push(x); UI.animId = x.id; S.changed('anim'); }, '', 'ทำซ้ำ') : null,
      an ? btn('🗑', () => { if (!confirm('ลบท่า ' + an.name + '?')) return; S.snap(); a.anims = a.anims.filter(x => x !== an); UI.animId = null; UI.t = 0; S.changed('anim'); }, 'danger') : null),
    genBtns));
  if (!an) return out;
  const tsl = el('input', { type: 'range', min: 0, max: an.len, step: 0.01, value: UI.t });
  tsl.oninput = () => { UI.playing = false; UI.setTime(+tsl.value, true); };
  tsl.onchange = () => UI.setTime(+tsl.value);
  const tlab = el('span', { class: 'muted', style: 'min-width:90px;text-align:right' }, UI.t.toFixed(2) + ' / ' + an.len + ' วิ');
  // timeline
  const cursor = el('div', { class: 'tl-cursor', style: `left:${UI.t / an.len * 100}%` });
  const inner = el('div', { style: 'position:relative;margin:0 10px' });
  S.boneOrder(a).forEach(b => {
    const r = el('div', { class: 'tl-row', style: b.id === S.sel.bone ? 'background:#22404a;border-radius:4px' : '' }, el('span', { class: 'lab' }, b.name));
    const tb = an.tracks[b.id] || {};
    CH.forEach(([ch, , , col]) => (tb[ch] || []).forEach(k => r.append(el('i', { style: `left:${k.t / an.len * 100}%;background:${col}`, title: ch + ' ' + k.t, onclick: e => { e.stopPropagation(); S.sel = { bone: b.id, cube: null }; UI.playing = false; UI.setTime(k.t); } }))));
    r.onclick = e => { const rc = inner.getBoundingClientRect(); S.sel = { bone: b.id, cube: null }; UI.playing = false; UI.setTime(S.round(S.clamp((e.clientX - rc.left) / rc.width, 0, 1) * an.len, 2)); S.View.highlight(); };
    inner.append(r);
  });
  inner.append(cursor);
  UI.timeEls = { slider: tsl, label: tlab, cursor };
  out.push(sec('⏱ ไทม์ไลน์',
    el('div', { class: 'row' },
      btn(UI.playing ? '⏸' : '▶', () => { UI.playing = !UI.playing; if (UI.playing && UI.t >= an.len - 0.001) UI.t = 0; UI.render(); }, 'pri'),
      btn('⏮', () => { UI.playing = false; UI.setTime(0); }),
      btn('◀', () => { UI.playing = false; UI.setTime(S.round(UI.t - 0.05, 3)); }, 'sm'),
      btn('▶|', () => { UI.playing = false; UI.setTime(S.round(UI.t + 0.05, 3)); }, 'sm'), tlab),
    tsl, el('div', { class: 'timeline' }, inner),
    el('div', { class: 'row' }, el('span', { class: 'muted' }, 'ความยาว (วิ)'), el('div', { style: 'width:80px' }, num(an.len, v => { an.len = Math.max(0.05, v); UI.t = Math.min(UI.t, an.len); }, { min: 0.05, ev: 'anim' })),
      chk(an.loop, v => an.loop = v, 'วนซ้ำ', 'anim')),
    row('ใช้ตอน', sel(an.role, ROLE, v => { an.role = v; if (v === 'attack') an.loop = false; }, 'anim')),
    tools(btn('🔁 ปิดลูป (ก๊อปคีย์แรกไปท้าย)', () => {
      S.snap(); for (const bid in an.tracks) for (const ch in an.tracks[bid]) { const ks = an.tracks[bid][ch]; if (ks.length && ks[0].t === 0) S.setKey(an, bid, ch, an.len, ks[0].v, ks[0].i); }
      S.changed('anim'); S.toast('คัดลอกคีย์ที่ 0 วิ ไปที่ท้ายท่าแล้ว');
    }, 'sm'))
  ));
  // key editor for selected bone
  const b = S.bone(a, S.sel.bone) || a.model.bones[0];
  if (b) {
    const bsel = el('select', null, ...S.boneOrder(a).map(x => el('option', { value: x.id }, x.name))); bsel.value = b.id;
    bsel.onchange = () => { S.sel = { bone: bsel.value, cube: null }; S.View.highlight(); UI.render(); };
    const rows = CH.map(([ch, lab, def]) => {
      const tr = S.track(an, b.id, ch), key = tr && tr.find(k => Math.abs(k.t - UI.t) < 0.0005);
      const cur = key ? key.v.slice() : (S.sample(tr, UI.t) || [def, def, def]).map(v => S.round(v, 3));
      const set = (i, v) => { const nv = cur.slice(); nv[i] = v; S.setKey(an, b.id, ch, UI.t, nv, key ? key.i : UI.interp); };
      return el('div', null,
        el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', null, (key ? '🔑 ' : '') + lab),
          el('span', { class: 'tools' },
            key ? sel(key.i, [['linear', 'เส้นตรง'], ['smooth', 'นุ่มนวล'], ['step', 'กระโดด']], v => key.i = v, 'anim') : null,
            key ? btn('🗑 คีย์', () => { S.snap(); S.delKey(an, b.id, ch, UI.t); S.changed('anim'); }, 'sm danger') : btn('🔑 ใส่คีย์', () => { S.snap(); S.setKey(an, b.id, ch, UI.t, cur, UI.interp); S.changed('anim'); }, 'sm ok'))),
        vec(null, cur, set, ch === 'rot' ? UI.rstep : ch === 'pos' ? UI.step : 0.1, 'k' + ch + b.id + UI.t, { text: true, ev: 'anim' }));
    });
    out.push(sec('🦴 คีย์ของกระดูก', row('กระดูก', bsel),
      note(`เวลา ${UI.t.toFixed(2)} วิ — แก้ตัวเลขแล้วจะใส่คีย์ให้อัตโนมัติ • พิมพ์สูตร Molang ได้ เช่น math.sin(q.anim_time*360)*20`),
      row('คีย์ใหม่แบบ', sel(UI.interp || 'linear', [['linear', 'เส้นตรง'], ['smooth', 'นุ่มนวล'], ['step', 'กระโดด']], v => { UI.interp = v; }, 'anim')),
      ...rows));
  }
  return out;
};

// ---------------- CFG tab ----------------
UI.pCfg = () => {
  const a = S.A(), c = a.cfg, P = S.P, list = UI.idList();
  const cn = (label, k, o) => row(label, num(c[k], v => c[k] = v, o));
  const common = sec('🏷 ชื่อและไอดี',
    row('ชื่อ (ไทย)', txt(a.name, v => a.name = v || a.key)),
    row('ชื่อ (EN)', txt(a.nameEn, v => a.nameEn = v || a.name)),
    row('ไอดี', txt(a.key, v => { const k = v.toLowerCase(); if (!S.keyOk(k)) return S.toast('ไอดีใช้ได้แค่ a-z 0-9 _'); if (P.assets.some(x => x !== a && x.key === k)) return S.toast('ไอดีซ้ำ'); a.key = k; })),
    note(`ไอดีในเกม: ${P.ns}:${a.key}  •  ใช้คำสั่ง /${a.kind === 'entity' ? 'summon' : 'give @s'} ${P.ns}:${a.key}`));
  const recipe = () => {
    const r = c.recipe;
    return sec('🛠 สูตรคราฟต์', chk(r.on, v => r.on = v, 'เปิดสูตรคราฟต์ (โต๊ะคราฟต์ 3×3)'),
      r.on ? el('div', null, el('div', { class: 'grid3' }, ...r.grid.map((g, i) => txt(g, v => r.grid[i] = v.toLowerCase(), 'ว่าง', { list }))),
        row('ได้จำนวน', num(r.count, v => r.count = v, { int: true, min: 1, max: 64 })),
        note('พิมพ์ไอดีไอเทม เช่น minecraft:stick หรือไอดีในโปรเจกต์นี้ เช่น ' + a.key)) : null);
  };
  if (a.kind === 'entity') {
    const BEH = [['passive', '🐑 สงบ (หนีเมื่อโดนตี)'], ['neutral', '🐺 กลาง (สู้กลับเมื่อโดนตี)'], ['hostile', '🧟 ดุร้าย (ไล่ตีผู้เล่น)'], ['statue', '🗿 นิ่ง (ไม่เดิน)']];
    const BIO = [['overworld', 'โลกปกติทั้งหมด'], ['plains', 'ทุ่งหญ้า'], ['forest', 'ป่า'], ['desert', 'ทะเลทราย'], ['jungle', 'ป่าดิบ'], ['taiga', 'ไทกา'], ['ocean', 'มหาสมุทร'], ['nether', 'เนเธอร์'], ['the_end', 'ดิเอนด์']];
    const drops = sec('🎁 ของดรอปเมื่อตาย', ...c.drops.map((d, i) => el('div', { class: 'row' },
      el('div', { style: 'flex:2;min-width:0' }, txt(d.item, v => d.item = v.toLowerCase(), 'ไอดีไอเทม', { list })),
      el('div', { style: 'width:58px' }, num(d.min, v => d.min = v, { int: true, min: 0 })), '–',
      el('div', { style: 'width:58px' }, num(d.max, v => d.max = v, { int: true, min: 0 })),
      btn('✕', () => { S.snap(); c.drops.splice(i, 1); S.changed(); }, 'sm danger'))),
      tools(btn('➕ เพิ่มของดรอป', () => { S.snap(); c.drops.push({ item: 'minecraft:bone', min: 0, max: 1 }); S.changed(); }, 'sm')),
      row('XP ที่ได้', num(c.xp, v => c.xp = v, { int: true, min: 0 })));
    return [common,
      sec('❤️ ค่าพลัง', cn('พลังชีวิต', 'health', { min: 1 }), note('20 = 10 หัวใจ'), cn('ความเร็ว', 'speed', { min: 0 }), note('0.25 = ปกติ • 0.35 = เร็ว'),
        cn('ดาเมจโจมตี', 'damage', { min: 0 }), cn('ระยะมองเห็น', 'follow', { min: 1 }),
        cn('ความกว้าง (บล็อก)', 'width', { min: 0.1 }), cn('ความสูง (บล็อก)', 'height', { min: 0.1 }), cn('ขนาดตัว (เท่า)', 'scale', { min: 0.1 })),
      sec('🧠 นิสัย', row('พฤติกรรม', sel(c.behavior, BEH, v => c.behavior = v)),
        chk(c.tameable, v => c.tameable = v, '🦴 เลี้ยงได้ (ทำให้เชื่อง)'),
        c.tameable ? row('ไอเทมที่ใช้เลี้ยง', txt(c.tameItems, v => c.tameItems = v, 'minecraft:bone', { list })) : null,
        chk(c.rideable, v => c.rideable = v, '🐎 ขี่ได้' + (c.tameable ? ' (หลังเลี้ยงแล้ว)' : '')),
        chk(c.breedable, v => c.breedable = v, '💕 ผสมพันธุ์ได้'),
        c.breedable ? row('ไอเทมผสมพันธุ์', txt(c.breedItems, v => c.breedItems = v, 'minecraft:wheat', { list })) : null,
        chk(c.fireImmune, v => c.fireImmune = v, '🔥 ไม่โดนไฟ/ลาวา'),
        chk(c.waterBreathing, v => c.waterBreathing = v, '🐟 หายใจใต้น้ำ/ว่ายน้ำ'),
        row('กลุ่ม (family)', txt(c.family, v => c.family = v, 'เช่น dragon, boss'))),
      sec('🥚 ไข่เกิด', el('div', { class: 'row' }, el('span', { class: 'muted' }, 'สีพื้น'), colorIn(c.eggBase, v => c.eggBase = v), el('span', { class: 'muted' }, 'สีจุด'), colorIn(c.eggDots, v => c.eggDots = v))),
      sec('🌍 เกิดเองในโลก', chk(c.spawn, v => c.spawn = v, 'ให้เกิดเองตามธรรมชาติ'),
        c.spawn ? el('div', null, row('ไบโอม', sel(c.biome, BIO, v => c.biome = v)), cn('โอกาสเกิด', 'spawnWeight', { int: true, min: 1 }),
          el('div', { class: 'row' }, el('span', { class: 'muted' }, 'ฝูงละ'), el('div', { style: 'width:64px' }, num(c.herdMin, v => c.herdMin = v, { int: true, min: 1 })), '–', el('div', { style: 'width:64px' }, num(c.herdMax, v => c.herdMax = v, { int: true, min: 1 })), el('span', { class: 'muted' }, 'ตัว')),
          chk(c.nightOnly, v => c.nightOnly = v, '🌙 เกิดเฉพาะที่มืด')) : null),
      drops];
  }
  if (a.kind === 'item') {
    const CAT = [['items', 'ไอเทม'], ['equipment', 'อุปกรณ์/อาวุธ'], ['nature', 'ธรรมชาติ'], ['construction', 'ก่อสร้าง']];
    return [common,
      sec('🗡 คุณสมบัติ', cn('ซ้อนได้ (ชิ้น)', 'stack', { int: true, min: 1, max: 64 }), row('หมวดในคลัง', sel(c.category, CAT, v => c.category = v)),
        cn('ดาเมจเพิ่ม', 'damage', { int: true, min: 0 }), note('ดาบเพชร ≈ 7'), cn('ความทนทาน', 'durability', { int: true, min: 0 }), note('0 = ไม่มีหลอดความทนทาน • ดาบเหล็ก ≈ 250'),
        chk(c.handheld, v => c.handheld = v, '✋ ถือแบบอาวุธ/เครื่องมือ'), chk(c.glint, v => c.glint = v, '✨ เรืองแสงเอนชานต์')),
      sec('🍗 อาหาร', chk(c.food, v => c.food = v, 'กินได้'),
        c.food ? el('div', null, cn('เติมความหิว', 'nutrition', { int: true, min: 0, max: 20 }), cn('ความอิ่ม', 'saturation', { min: 0 }), chk(c.alwaysEat, v => c.alwaysEat = v, 'กินได้แม้ไม่หิว')) : null),
      recipe()];
  }
  const RM = [['opaque', 'ทึบ'], ['alpha_test', 'ฉลุ/มีรูโปร่ง'], ['blend', 'โปร่งแสง (กระจกสี)']];
  const CAT = [['construction', 'ก่อสร้าง'], ['nature', 'ธรรมชาติ'], ['equipment', 'อุปกรณ์'], ['items', 'ไอเทม']];
  return [common,
    sec('🧱 คุณสมบัติบล็อก', cn('เวลาขุด (วิ)', 'destroy', { min: 0 }), cn('ทนระเบิด', 'resist', { min: 0 }),
      cn('แสง (0–15)', 'light', { int: true, min: 0, max: 15 }), cn('ความฝืด', 'friction', { min: 0, max: 0.9 }), note('0.4 = ปกติ • 0.02 = ลื่นแบบน้ำแข็ง'),
      row('สีบนแผนที่', colorIn(c.mapColor, v => c.mapColor = v)), row('การแสดงผล', sel(c.render, RM, v => c.render = v)),
      row('หมวดในคลัง', sel(c.category, CAT, v => c.category = v)),
      chk(c.custom, v => { c.custom = v; if (v && (!a.model || !S.allCubes(a).length)) { const t = S.newAsset('block', 'slab', a.key, a.name); a.model = t.model; a.tex = t.tex; S.texCache.delete(a.id); S.sel = { bone: a.model.bones[0].id, cube: null }; } }, '🧊 ใช้โมเดลเอง (แก้ที่แท็บโมเดล)')),
    sec('🎁 ขุดแล้วได้', row('ดรอป', sel(c.drop, [['self', 'ตัวบล็อกเอง'], ['item', 'ไอเทมอื่น'], ['nothing', 'ไม่ได้อะไร']], v => c.drop = v)),
      c.drop === 'item' ? row('ไอเทม', txt(c.dropItem, v => c.dropItem = v.toLowerCase(), 'minecraft:diamond', { list })) : null),
    recipe()];
};

// ---------------- CODE tab ----------------
function area(val, set, rows, ph) {
  const t = el('textarea', { class: 'code', rows, placeholder: ph || '', spellcheck: false, autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off' });
  t.value = val || ''; let dirty = false;
  t.onfocus = () => { dirty = false; };
  t.oninput = () => { if (!dirty) { S.snap(); dirty = true; } set(t.value); S.P.updated = Date.now(); S.saveSoon(); };
  t.onblur = () => UI.header();
  t.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); const p = t.selectionStart; t.setRangeText('  ', p, t.selectionEnd, 'end'); t.oninput(); } };
  return t;
}
UI.pCode = () => {
  const a = S.A(), P = S.P, K = S.code(a), out = [];
  const trig = el('div');
  Object.entries(S.TRIGGERS[a.kind]).forEach(([k, [label, who, ex]]) => {
    const n = S.cmdList(K[k]).length;
    const ta = area(K[k], v => { K[k] = v; }, Math.max(2, Math.min(8, String(K[k] || '').split('\n').length + 1)), 'เช่น ' + ex[0]);
    trig.append(el('div', { class: 'trig' },
      el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', null, label), n ? el('span', { class: 'good', style: 'font-size:12px' }, n + ' คำสั่ง') : null),
      note(who), ta,
      k === 'tick' ? el('div', { class: 'row' }, el('span', { class: 'muted' }, 'ทุก ๆ'), el('div', { style: 'width:80px' }, num(K.every || 1, v => { K.every = Math.max(0.05, v); }, { min: 0.05 })), el('span', { class: 'muted' }, 'วินาที')) : null,
      el('div', { class: 'chips' }, ...ex.map(c => btn('+ ' + c, () => { S.snap(); K[k] = (String(K[k] || '').replace(/\s+$/, '') + '\n' + c).replace(/^\n/, ''); S.changed('code'); }, 'sm ex')))
    ));
  });
  out.push(sec('⚡ คำสั่งของ ' + (a.name || a.key) + ' — ทำงานเมื่อ...',
    note('พิมพ์คำสั่ง Minecraft บรรทัดละ 1 คำสั่ง (ไม่ต้องใส่ /) • บรรทัดที่ขึ้นต้นด้วย # คือโน้ต • กดปุ่ม + เพื่อแทรกตัวอย่าง • ใช้ได้ทั้ง Bedrock และ Java'),
    trig));
  const err = S.checkJS(P.script);
  const status = el('div', { class: 'muted ' + (err ? 'err' : 'good') }, P.script && P.script.trim() ? (err ? '❌ ' + err : '✅ ไม่พบจุดผิดของไวยากรณ์') : 'ยังไม่มีสคริปต์');
  const js = area(P.script, v => { P.script = v; }, 14, '// เขียน JavaScript ด้วย @minecraft/server\nimport { world } from "@minecraft/server";\n');
  out.push(sec('📜 สคริปต์ JavaScript (ขั้นสูง • Bedrock)',
    note('ทั้งโปรเจกต์ใช้ไฟล์เดียว • import จาก "@minecraft/server" และ "@minecraft/server-ui" ได้ • ทำงานพร้อมคำสั่งด้านบน'),
    js, status,
    tools(btn('✅ ตรวจโค้ด', () => UI.render(), 'sm ok'),
      btn('🧹 ล้าง', () => { if (!confirm('ลบสคริปต์ทั้งหมด?')) return; S.snap(); P.script = ''; S.changed('code'); }, 'sm danger')),
    note('แทรกตัวอย่าง:'),
    el('div', { class: 'chips' }, ...S.JS_EXAMPLES(P).map(([l, c]) => btn(l, () => { S.snap(); P.script = S.mergeJS(P.script, c); S.changed('code'); }, 'sm'))),
    row('API เวอร์ชัน', txt(P.apiVer || S.API_VER, v => { P.apiVer = /^\d+\.\d+\.\d+(-beta)?$/.test(v) ? v : S.API_VER; })),
    note('@minecraft/server ' + S.API_VER + ' ใช้กับ Minecraft 1.20.80 ขึ้นไป • ถ้าใช้ API แบบ beta ต้องเปิด "Beta APIs" ในโลก')));
  out.push(sec('📖 ทริค', note('@s = ตัวที่ถูกอ้างถึงในแต่ละช่อง • @p = ผู้เล่นใกล้สุด • @a = ผู้เล่นทุกคน • @e[type=zombie,r=8] = ซอมบี้ในรัศมี 8 บล็อก'),
    note('~ ~ ~ = ตำแหน่งปัจจุบัน • ^ ^ ^5 = ข้างหน้า 5 บล็อกตามทิศที่มอง'),
    note('Java: แปลง effect/xp ให้อัตโนมัติ แต่ชื่อเสียง (playsound) และอนุภาค (particle) ของ Bedrock กับ Java ไม่เหมือนกัน • สคริปต์ JavaScript ไม่มีใน Java')));
  return out;
};

// ---------------- EXPORT tab ----------------
UI.exportAddon = (mode) => {
  const v = S.validate(S.P);
  if (v.errs.length) { S.toast('❌ แก้ข้อผิดพลาดก่อนส่งออก'); UI.render(); return; }
  const z = S.Bedrock.build(S.P), bytes = z.build();
  UI.lastBuild = z.files.map(f => f.path + '  (' + f.bytes.length + ' B)');
  const name = `${S.P.ns}_v${S.P.version.join('.')}.mcaddon`;
  S.P.version[2]++; // next export gets a higher version so Minecraft replaces the old pack
  if (mode === 'game' && S.isAndroid) {
    const saved = Android.saveToLibrary(name, S.bytesToB64(bytes));
    if (saved) { Android.installAddon(saved); S.toast('📥 ส่งเข้า Minecraft แล้ว — รอเกมนำเข้า'); } else S.toast('บันทึกไม่สำเร็จ');
  } else if (mode === 'lib' && S.isAndroid) {
    const saved = Android.saveToLibrary(name, S.bytesToB64(bytes)); S.toast(saved ? '✅ เก็บเข้าคลัง Addon Loader แล้ว: ' + saved : 'บันทึกไม่สำเร็จ');
  } else { S.deliver(name, bytes, 'application/octet-stream'); S.toast('⬇️ ' + name); }
  S.changed('export');
};
UI.pExport = () => {
  const P = S.P, v = S.validate(P), a = S.A();
  const out = [sec('📦 โปรเจกต์',
    row('ชื่อแพ็ค', txt(P.name, x => P.name = x || P.name)),
    row('Namespace', txt(P.ns, x => { const k = x.toLowerCase(); if (!S.keyOk(k)) return S.toast('ใช้ได้แค่ a-z 0-9 _'); P.ns = k; })),
    row('คำอธิบาย', txt(P.desc, x => P.desc = x)),
    note(`ส่งออกครั้งถัดไปเป็นเวอร์ชัน ${P.version.join('.')} (เพิ่มเองทุกครั้งที่ส่งออก เพื่อให้เกมอัปเดตแพ็คทับของเดิมได้) • ${P.assets.length} ชิ้น: ` + P.assets.map(x => KIND_ICON[x.kind] + (x.name || x.key)).join(', ')))];
  out.push(sec(v.errs.length ? '❌ ต้องแก้ก่อน' : (v.warns.length ? '⚠️ ตรวจแล้ว มีคำเตือน' : '✅ พร้อมส่งออก'),
    ...v.errs.map(e => note('• ' + e, 'err')), ...v.warns.map(e => note('• ' + e, 'warn')), (!v.errs.length && !v.warns.length) ? note('ไม่พบปัญหา', 'good') : null));
  out.push(sec('🟩 Minecraft Bedrock / มือถือ (.mcaddon)',
    S.isAndroid ? tools(btn('🎮 ส่งออกแล้วใส่เกมเลย', () => UI.exportAddon('game'), 'ok'), btn('📦 เก็บเข้าคลัง Addon Loader', () => UI.exportAddon('lib'), 'pri'), btn('💾 บันทึกเป็นไฟล์', () => UI.exportAddon('file')))
      : tools(btn('⬇️ ดาวน์โหลด .mcaddon', () => UI.exportAddon('file'), 'ok')),
    S.isAndroid ? tools(btn('▶️ เปิด Minecraft', () => Android.playMinecraft(), 'sm')) : note('เปิดไฟล์ .mcaddon บนมือถือที่มี Minecraft หรือใช้แอพ Addon Loader TH'),
    note('เปิด "Holiday Creator Features" ไม่จำเป็น • ในโลกต้องเปิด Behavior Pack ของแพ็คนี้ด้วย')));
  out.push(sec('☕ Minecraft Java (Fabric 1.20.1)',
    tools(btn('☕ ส่งออกซอร์สม็อด (.zip)', () => {
      if (v.errs.length) return S.toast('❌ แก้ข้อผิดพลาดก่อนส่งออก');
      const z = S.Java.build(P); UI.lastBuild = z.files.map(f => f.path + '  (' + f.bytes.length + ' B)');
      S.deliver(`${P.ns}-fabric-src.zip`, z.build(), 'application/zip'); S.toast('☕ ส่งออกแล้ว — อัปขึ้น GitHub เพื่อบิลด์ .jar'); S.changed('export');
    }, 'pri')),
    note('ได้โปรเจกต์ Fabric ครบ (โค้ด Java + เท็กซ์เจอร์ + สูตร + ของดรอป) พร้อม GitHub Actions — อัปโหลดขึ้น GitHub แล้วรอรับไฟล์ .jar จากแท็บ Actions')));
  out.push(sec('🧰 ไฟล์อื่น ๆ', tools(
    a.model && (a.kind === 'entity' || a.cfg.custom) ? btn('🧊 โมเดล .geo.json', () => S.deliver(`${a.key}.geo.json`, new TextEncoder().encode(JSON.stringify(S.Bedrock.geometry(a, P), null, 2)), 'application/json')) : null,
    btn('🖼 เท็กซ์เจอร์ PNG', () => S.deliver(`${a.key}.png`, S.dataUrlBytes(a.tex.data), 'image/png')),
    btn('💾 สำรองโปรเจกต์ (.json)', () => S.deliver(`${P.ns}_project.json`, new TextEncoder().encode(JSON.stringify(P)), 'application/json'))),
    note('.geo.json เปิดต่อใน Blockbench ได้ • ไฟล์สำรองนำเข้ากลับได้จากเมนู ☰')));
  if (UI.lastBuild) out.push(sec('📄 ไฟล์ที่สร้างล่าสุด (' + UI.lastBuild.length + ')', el('pre', { class: 'log' }, UI.lastBuild.join('\n'))));
  return out;
};

// ---------------- tabs + events ----------------
UI.go = (tab) => {
  UI.tab = tab; UI.playing = false;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  UI.stage(); panel().scrollTop = 0; UI.render();
};

UI.init = () => {
  S.View.init($('#view3d')); S.Paint.init($('#paint2d'));
  S.View.onTap = hit => {
    const a = S.A(); if (!a || !a.model || (UI.tab !== 'model' && UI.tab !== 'anim')) return;
    if (!hit || !hit.cubeId) { if (UI.tab === 'model') { S.sel.cube = null; S.emit('sel'); } return; }
    if (UI.tab === 'anim') S.sel = { bone: hit.boneId, cube: null };
    else if (S.sel.cube === hit.cubeId) S.sel = { bone: hit.boneId, cube: null };
    else S.sel = { bone: hit.boneId, cube: hit.cubeId };
    S.emit('sel');
  };
  let painting = false;
  S.View.onPaint = (phase, hit) => {
    const a = S.A(); if (!a) return;
    if (phase === 'start') { if (!hit || !hit.uv) { painting = false; return; } painting = true; const [x, y] = S.uvToPx(a, hit.uv); S.Brush.begin(a, x, y); }
    else if (phase === 'move' && painting) { if (hit && hit.uv) { const [x, y] = S.uvToPx(a, hit.uv); S.Brush.move(x, y); } }
    else if (phase === 'end' && painting) { painting = false; S.Brush.end(); }
    else if (phase === 'cancel' && painting) { painting = false; S.Brush.cancel(); }
  };
  let uiTick = 0;
  S.View.ticker = dt => {
    if (UI.tab !== 'anim' || !UI.playing) return false;
    const an = UI.anim(); if (!an) return false;
    let t = UI.t + dt;
    if (t > an.len) { if (an.loop) t = t % an.len; else { t = an.len; UI.playing = false; setTimeout(UI.render, 0); } }
    UI.t = t; UI.applyPose();
    if ((uiTick += dt) > 0.05) { uiTick = 0; UI.setTime(t, true); }
    return true;
  };
  S.on('project', () => { S.View.build(S.A()); UI.stage(); UI.render(); S.Paint.draw(); });
  S.on('change', () => { S.View.build(S.A()); UI.applyPose(); UI.render(); S.Paint.draw(); });
  S.on('anim', () => { UI.applyPose(); UI.render(); });
  S.on('export', () => UI.render());
  S.on('code', () => UI.render());
  S.on('sel', () => { S.View.highlight(); S.Paint.draw(); UI.render(); });
  S.on('tex', () => { const a = S.A(); if (a) S.View.texUpdated(a); S.Paint.draw(); UI.header(); });
  S.on('texpaint', a => { S.View.texUpdated(a); S.Paint.draw(); });
  S.on('tool', () => { if (UI.tab === 'paint') UI.render(); });
  $('#homeBtn').onclick = UI.home;
  $('#assetBtn').onclick = () => S.P ? UI.assets() : UI.home();
  $('#undoBtn').onclick = S.undo; $('#redoBtn').onclick = S.redo;
  $('#bigBtn').onclick = () => { $('#stage').classList.toggle('big'); setTimeout(() => { S.View.resize(); S.Paint.resize(); }, 220); };
  $('#resetCamBtn').onclick = () => { if (UI.tab === 'paint' && !UI.paint3d) S.Paint.fit(); else S.View.frame(S.A()); };
  $('#paint3dBtn').onclick = () => { UI.paint3d = !UI.paint3d; UI.stage(); UI.render(); };
  $('#moveBtn').onclick = () => { UI.manip = UI.manip === 'move' ? '' : 'move'; UI.stage(); };
  $('#rotBtn').onclick = () => { UI.manip = UI.manip === 'rot' ? '' : 'rot'; UI.stage(); };
  $('#axisBtn').onclick = () => { UI.axis = { free: 'x', x: 'y', y: 'z', z: 'free' }[UI.axis]; UI.stage(); };
  S.View.onManip = UI.onManip;
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => UI.go(b.dataset.tab));
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); S.redo(); }
  });
  window.addEventListener('pagehide', S.saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) S.saveNow(); });
  let last = null; try { last = localStorage.getItem('mms_last'); } catch (e) { /* storage unavailable */ }
  const p = last && S.store.read(last);
  if (p) UI.open(p); else { UI.render(); UI.stage(); UI.home(); }
};
window.addEventListener('DOMContentLoaded', UI.init);
})();
