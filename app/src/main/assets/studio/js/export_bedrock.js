'use strict';
/* Bedrock export: .mcaddon (BP + RP), .geo.json, plus .geo.json import */
const R4 = v => typeof v === 'number' ? S.round(v, 4) : v;
const V3 = a => a.map(R4);
S.Bedrock = {
  ENGINE: [1, 20, 80],
  id: (p, a) => `${p.ns}:${a.key}`,
  ref(p, raw) { // turn "stick" / "my_item" / "minecraft:stick" into a full id
    const s = String(raw || '').trim().toLowerCase(); if (!s) return '';
    if (s.includes(':')) return s;
    return p.assets.some(a => a.key === s) ? `${p.ns}:${s}` : `minecraft:${s}`;
  },
  geometry(a, p) {
    const bd = S.bounds(a);
    const ext = Math.max(Math.abs(bd.min[0]), Math.abs(bd.max[0]), Math.abs(bd.min[2]), Math.abs(bd.max[2]));
    const bones = S.boneOrder(a).map(b => {
      const o = { name: b.name };
      const par = b.parent && S.bone(a, b.parent); if (par) o.parent = par.name;
      o.pivot = V3(b.pivot);
      if (b.rot.some(v => v)) o.rotation = V3(b.rot);
      o.cubes = b.cubes.map(c => {
        const q = { origin: V3(c.origin), size: V3(c.size), uv: V3(c.uv) };
        if (c.inflate) q.inflate = R4(c.inflate);
        if (c.mirror) q.mirror = true;
        if (c.rot && c.rot.some(v => v)) { q.pivot = V3(c.pivot); q.rotation = V3(c.rot); }
        return q;
      });
      return o;
    });
    return {
      format_version: '1.12.0',
      'minecraft:geometry': [{
        description: {
          identifier: `geometry.${p.ns}.${a.key}`, texture_width: a.tex.w, texture_height: a.tex.h,
          visible_bounds_width: Math.ceil(ext * 2 / 16) + 1, visible_bounds_height: Math.ceil(bd.max[1] / 16) + 1,
          visible_bounds_offset: [0, S.round(bd.max[1] / 32, 2), 0]
        }, bones
      }]
    };
  },
  tkey: t => { const s = String(S.round(t, 4)); return s.includes('.') ? s : s + '.0'; },
  animations(a, p) {
    const out = {};
    (a.anims || []).forEach(an => {
      const bones = {};
      for (const bid in an.tracks) {
        const b = S.bone(a, bid); if (!b) continue;
        const tb = {};
        for (const [ch, name] of [['rot', 'rotation'], ['pos', 'position'], ['scl', 'scale']]) {
          const keys = an.tracks[bid][ch]; if (!keys || !keys.length) continue;
          const kf = {};
          keys.forEach((k, j) => {
            const v = V3(k.v);
            const prevStep = j > 0 && keys[j - 1].i === 'step';
            if (k.i === 'smooth' || prevStep) {
              const o = { post: v }; if (prevStep) o.pre = V3(keys[j - 1].v); if (k.i === 'smooth') o.lerp_mode = 'catmullrom';
              kf[S.Bedrock.tkey(k.t)] = o;
            } else kf[S.Bedrock.tkey(k.t)] = v;
          });
          tb[name] = kf;
        }
        if (Object.keys(tb).length) bones[b.name] = tb;
      }
      const o = { animation_length: R4(an.len), bones };
      if (an.loop) o.loop = true;
      out[`animation.${p.ns}.${a.key}.${an.name}`] = o;
    });
    return { format_version: '1.8.0', animations: out };
  },
  roles(a) {
    const pick = r => (a.anims || []).find(x => x.role === r && Object.keys(x.tracks).length);
    return { idle: pick('idle'), walk: pick('walk'), attack: pick('attack'), always: (a.anims || []).filter(x => x.role === 'always') };
  },
  controller(a, p) {
    const r = S.Bedrock.roles(a); if (!r.idle && !r.walk && !r.attack) return null;
    const MOVE = 'query.modified_move_speed > 0.1', STOP = 'query.modified_move_speed < 0.1', ATK = 'variable.attack_time > 0';
    const states = { default: { animations: r.idle ? [r.idle.name] : [], transitions: [], blend_transition: 0.2 } };
    if (r.walk) {
      states.default.transitions.push({ moving: MOVE });
      states.moving = { animations: [r.walk.name], transitions: [{ default: STOP }], blend_transition: 0.2 };
    }
    if (r.attack) {
      states.default.transitions.push({ attacking: ATK });
      if (states.moving) states.moving.transitions.push({ attacking: ATK });
      states.attacking = { animations: [r.attack.name], transitions: [{ default: 'variable.attack_time <= 0' }], blend_transition: 0.1 };
    }
    return { format_version: '1.10.0', animation_controllers: { [`controller.animation.${p.ns}.${a.key}.move`]: { initial_state: 'default', states } } };
  },
  clientEntity(a, p, hasCtrl) {
    const anims = {}, animate = [];
    (a.anims || []).forEach(an => { if (Object.keys(an.tracks).length) anims[an.name] = `animation.${p.ns}.${a.key}.${an.name}`; });
    if (hasCtrl) { anims.move_ctrl = `controller.animation.${p.ns}.${a.key}.move`; animate.push('move_ctrl'); }
    if (S.boneByName(a, 'head')) { anims.look_at_target = 'animation.common.look_at_target'; animate.push('look_at_target'); }
    S.Bedrock.roles(a).always.forEach(an => { if (anims[an.name]) animate.push(an.name); });
    const desc = {
      identifier: S.Bedrock.id(p, a), materials: { default: 'entity_alphatest' },
      textures: { default: `textures/entity/${a.key}` }, geometry: { default: `geometry.${p.ns}.${a.key}` },
      render_controllers: ['controller.render.default'],
      spawn_egg: { base_color: a.cfg.eggBase, overlay_color: a.cfg.eggDots }
    };
    if (Object.keys(anims).length) desc.animations = anims;
    if (animate.length) desc.scripts = { animate };
    return { format_version: '1.10.0', 'minecraft:client_entity': { description: desc } };
  },
  items(p, raw) { return String(raw || '').split(/[,\s]+/).map(s => S.Bedrock.ref(p, s)).filter(Boolean); },
  behaviorEntity(a, p) {
    const c = a.cfg, id = S.Bedrock.id(p, a), ns = p.ns;
    const hostile = c.behavior === 'hostile', neutral = c.behavior === 'neutral', statue = c.behavior === 'statue';
    const fam = [a.key, 'mob', ...String(c.family || '').split(/[,\s]+/).filter(Boolean)];
    if (hostile) fam.push('monster');
    const comp = {
      'minecraft:type_family': { family: [...new Set(fam)] },
      'minecraft:health': { value: +c.health, max: +c.health },
      'minecraft:collision_box': { width: +c.width, height: +c.height },
      'minecraft:physics': {}, 'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
      'minecraft:nameable': {}, 'minecraft:jump.static': {},
      'minecraft:movement': { value: statue ? 0 : +c.speed }, 'minecraft:movement.basic': {},
      'minecraft:navigation.walk': { can_path_over_water: true, avoid_water: !c.waterBreathing, avoid_damage_blocks: true, can_swim: !!c.waterBreathing },
      'minecraft:behavior.float': { priority: 0 },
      'minecraft:experience_reward': { on_death: `query.last_hit_by_player ? ${c.xp | 0} : 0` },
      'minecraft:follow_range': { value: +c.follow, max: +c.follow }
    };
    if (+c.scale !== 1) comp['minecraft:scale'] = { value: +c.scale };
    if (c.fireImmune) comp['minecraft:fire_immune'] = {};
    if (c.waterBreathing) comp['minecraft:breathable'] = { total_supply: 15, suffocate_time: 0, breathes_water: true, breathes_air: true };
    if ((c.drops || []).some(d => d.item)) comp['minecraft:loot'] = { table: `loot_tables/entities/${a.key}.json` };
    if (!statue) {
      comp['minecraft:behavior.random_stroll'] = { priority: 6, speed_multiplier: 1 };
      comp['minecraft:behavior.look_at_player'] = { priority: 7, look_distance: 6, probability: 0.02 };
      comp['minecraft:behavior.random_look_around'] = { priority: 8 };
    }
    if (c.behavior === 'passive') comp['minecraft:behavior.panic'] = { priority: 1, speed_multiplier: 1.25 };
    const target = { priority: 2, must_see: true, reselect_targets: true, entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: +c.follow }] };
    if (hostile || neutral) {
      comp['minecraft:attack'] = { damage: +c.damage };
      comp['minecraft:behavior.melee_attack'] = { priority: 3, speed_multiplier: 1.2, track_target: true };
      comp['minecraft:behavior.hurt_by_target'] = { priority: 1 };
    }
    const groups = {}, events = {};
    const wild = `${ns}:wild`, tame = `${ns}:tame`;
    const lure = [...new Set([...(c.tameable ? S.Bedrock.items(p, c.tameItems) : []), ...(c.breedable ? S.Bedrock.items(p, c.breedItems) : [])])];
    if (lure.length && !statue) comp['minecraft:behavior.tempt'] = { priority: 4, speed_multiplier: 1.1, items: lure };
    const ride = { 'minecraft:rideable': { seat_count: 1, family_types: ['player'], interact_text: 'action.interact.ride.horse', seats: { position: [0, S.round(+c.height * 0.85 / Math.max(0.1, +c.scale), 2), 0] } }, 'minecraft:input_ground_controlled': {} };
    if (c.tameable) {
      groups[wild] = { 'minecraft:tameable': { probability: 0.34, tame_items: S.Bedrock.items(p, c.tameItems), tame_event: { event: `${ns}:on_tame`, target: 'self' } } };
      if (hostile) groups[wild]['minecraft:behavior.nearest_attackable_target'] = target;
      groups[tame] = {
        'minecraft:is_tamed': {},
        'minecraft:behavior.follow_owner': { priority: 4, speed_multiplier: 1, start_distance: 10, stop_distance: 2 },
        'minecraft:behavior.owner_hurt_by_target': { priority: 1 }, 'minecraft:behavior.owner_hurt_target': { priority: 2 }
      };
      if (!hostile && !neutral) { groups[tame]['minecraft:attack'] = { damage: +c.damage }; groups[tame]['minecraft:behavior.melee_attack'] = { priority: 3, speed_multiplier: 1.2, track_target: true }; }
      if (c.rideable) Object.assign(groups[tame], ride);
      events['minecraft:entity_spawned'] = { add: { component_groups: [wild] } };
      events[`${ns}:on_tame`] = { remove: { component_groups: [wild] }, add: { component_groups: [tame] } };
    } else {
      if (hostile) comp['minecraft:behavior.nearest_attackable_target'] = target;
      if (c.rideable) Object.assign(comp, ride);
    }
    if (c.breedable) {
      comp['minecraft:breedable'] = { require_tame: !!c.tameable, breed_items: S.Bedrock.items(p, c.breedItems), breeds_with: { mate_type: id, baby_type: id } };
      if (c.tameable) comp['minecraft:breedable'].breeds_with.breed_event = { event: 'minecraft:entity_born', target: 'baby' };
      if (c.tameable) events['minecraft:entity_born'] = { add: { component_groups: [wild] } };
      comp['minecraft:behavior.breed'] = { priority: 3, speed_multiplier: 1 };
    }
    const ent = { description: { identifier: id, is_spawnable: true, is_summonable: true, is_experimental: false }, components: comp };
    if (Object.keys(groups).length) ent.component_groups = groups;
    if (Object.keys(events).length) ent.events = events;
    return { format_version: '1.20.80', 'minecraft:entity': ent };
  },
  spawnRules(a, p) {
    const c = a.cfg, hostile = c.behavior === 'hostile';
    const cond = {
      'minecraft:spawns_on_surface': {},
      'minecraft:weight': { default: Math.max(1, c.spawnWeight | 0) },
      'minecraft:herd': { min_size: Math.max(1, c.herdMin | 0), max_size: Math.max(1, c.herdMax | 0, c.herdMin | 0) },
      'minecraft:biome_filter': { test: 'has_biome_tag', value: c.biome || 'overworld' }
    };
    if (c.biome === 'nether' || c.biome === 'the_end') delete cond['minecraft:spawns_on_surface'], cond['minecraft:spawns_underground'] = {};
    if (hostile || c.nightOnly) { cond['minecraft:brightness_filter'] = { min: 0, max: 7, adjust_for_weather: true }; cond['minecraft:difficulty_filter'] = { min: 'easy', max: 'hard' }; }
    return { format_version: '1.8.0', 'minecraft:spawn_rules': { description: { identifier: S.Bedrock.id(p, a), population_control: hostile ? 'monster' : (c.waterBreathing ? 'water_animal' : 'animal') }, conditions: [cond] } };
  },
  loot(p, drops) {
    return { pools: drops.filter(d => d.item).map(d => ({ rolls: 1, entries: [{ type: 'item', name: S.Bedrock.ref(p, d.item), weight: 1, functions: [{ function: 'set_count', count: { min: Math.max(0, d.min | 0), max: Math.max(d.min | 0, d.max | 0) } }] }] })) };
  },
  recipe(p, a) {
    const r = a.cfg.recipe; if (!r || !r.on) return null;
    const grid = r.grid.map(x => S.Bedrock.ref(p, x));
    if (!grid.some(Boolean)) return null;
    let rows = [0, 1, 2].map(y => [0, 1, 2].map(x => grid[y * 3 + x]));
    while (rows.length && rows[0].every(v => !v)) rows.shift();
    while (rows.length && rows[rows.length - 1].every(v => !v)) rows.pop();
    let c0 = 0, c1 = 2; while (c0 < 2 && rows.every(rw => !rw[c0])) c0++; while (c1 > c0 && rows.every(rw => !rw[c1])) c1--;
    rows = rows.map(rw => rw.slice(c0, c1 + 1));
    const letters = 'ABCDEFGHI', key = {}, map = {};
    const pattern = rows.map(rw => rw.map(v => { if (!v) return ' '; if (!map[v]) { map[v] = letters[Object.keys(map).length]; key[map[v]] = { item: v }; } return map[v]; }).join(''));
    return { format_version: '1.17.41', 'minecraft:recipe_shaped': { description: { identifier: `${p.ns}:${a.key}_recipe` }, tags: ['crafting_table'], pattern, key, result: { item: S.Bedrock.id(p, a), count: Math.max(1, r.count | 0) } } };
  },
  item(a, p) {
    const c = a.cfg, comp = {
      'minecraft:icon': { texture: `${p.ns}_${a.key}` },
      'minecraft:display_name': { value: `item.${p.ns}:${a.key}.name` },
      'minecraft:max_stack_size': c.durability > 0 ? 1 : S.clamp(c.stack | 0, 1, 64)
    };
    if (c.handheld || c.damage > 0) comp['minecraft:hand_equipped'] = true;
    if (c.glint) comp['minecraft:glint'] = true;
    if (c.damage > 0) comp['minecraft:damage'] = c.damage | 0;
    if (c.durability > 0) comp['minecraft:durability'] = { max_durability: c.durability | 0 };
    if (c.food) {
      comp['minecraft:food'] = { nutrition: c.nutrition | 0, saturation_modifier: +c.saturation, can_always_eat: !!c.alwaysEat };
      comp['minecraft:use_animation'] = 'eat';
      comp['minecraft:use_modifiers'] = { use_duration: 1.6, movement_modifier: 0.35 };
    }
    return { format_version: '1.20.80', 'minecraft:item': { description: { identifier: S.Bedrock.id(p, a), menu_category: { category: c.category || 'items' } }, components: comp } };
  },
  block(a, p) {
    const c = a.cfg, custom = c.custom && a.model && S.allCubes(a).length;
    const comp = {
      'minecraft:destructible_by_mining': { seconds_to_destroy: Math.max(0, +c.destroy) },
      'minecraft:destructible_by_explosion': { explosion_resistance: Math.max(0, +c.resist) },
      'minecraft:friction': S.clamp(+c.friction, 0, 0.9),
      'minecraft:map_color': c.mapColor || '#7f7f7f',
      'minecraft:geometry': custom ? `geometry.${p.ns}.${a.key}` : 'minecraft:geometry.full_block',
      'minecraft:material_instances': { '*': { texture: `${p.ns}_${a.key}`, render_method: c.render || 'opaque' } }
    };
    if (c.light > 0) comp['minecraft:light_emission'] = S.clamp(c.light | 0, 0, 15);
    if (custom) {
      const b = S.bounds(a);
      const mn = [S.clamp(b.min[0], -8, 8), S.clamp(b.min[1], 0, 16), S.clamp(b.min[2], -8, 8)];
      const mx = [S.clamp(b.max[0], -8, 8), S.clamp(b.max[1], 0, 16), S.clamp(b.max[2], -8, 8)];
      const box = { origin: V3(mn), size: V3(mx.map((v, i) => Math.max(0.1, v - mn[i]))) };
      comp['minecraft:collision_box'] = box; comp['minecraft:selection_box'] = box;
    }
    if (c.drop !== 'self') comp['minecraft:loot'] = `loot_tables/blocks/${a.key}.json`;
    return { format_version: '1.20.80', 'minecraft:block': { description: { identifier: S.Bedrock.id(p, a), menu_category: { category: c.category || 'construction' } }, components: comp } };
  },
  manifest(p, kind, scr) {
    const v = p.version.slice(), u = p.uuids;
    const h = { name: `${p.name} ${kind}`, description: p.desc || '', uuid: kind === 'BP' ? u.bpH : u.rpH, version: v, min_engine_version: S.Bedrock.ENGINE };
    const m = { format_version: 2, header: h, modules: [{ type: kind === 'BP' ? 'data' : 'resources', uuid: kind === 'BP' ? u.bpM : u.rpM, version: v }] };
    if (kind === 'BP') m.dependencies = [{ uuid: u.rpH, version: v }];
    if (kind === 'BP' && scr) {
      if (!u.scM) u.scM = S.uuid();
      m.modules.push({ type: 'script', language: 'javascript', uuid: u.scM, version: v, entry: 'scripts/main.js' });
      m.dependencies.push({ module_name: '@minecraft/server', version: p.apiVer || S.API_VER });
      if (scr.ui) m.dependencies.push({ module_name: '@minecraft/server-ui', version: p.uiApiVer || S.UI_API_VER });
    }
    return m;
  },
  packIcon(p) {
    if (typeof document === 'undefined') return null;
    const cv = S.newCanvas(128, 128), x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#2f6b35'); g.addColorStop(1, '#14301a');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); x.imageSmoothingEnabled = false;
    const a = p.assets.find(a => a.kind !== 'entity') || p.assets[0];
    if (a) { const t = S.texCanvas(a); const s = Math.min(96 / t.width, 96 / t.height); x.drawImage(t, 64 - t.width * s / 2, 64 - t.height * s / 2, t.width * s, t.height * s); }
    return S.dataUrlBytes(cv.toDataURL('image/png'));
  },
  lang(p, th) {
    const L = [];
    p.assets.forEach(a => {
      const n = th ? (a.name || a.key) : (a.nameEn || a.name || a.key), id = S.Bedrock.id(p, a);
      if (a.kind === 'entity') { L.push(`entity.${id}.name=${n}`); L.push(`item.spawn_egg.entity.${id}.name=${th ? 'ไข่เกิด ' : 'Spawn '}${n}`); }
      if (a.kind === 'item') L.push(`item.${id}.name=${n}`);
      if (a.kind === 'block') L.push(`tile.${id}.name=${n}`);
    });
    return L.join('\n') + '\n';
  },
  build(p) {
    const z = new S.Zip(), BP = `${p.ns}_BP/`, RP = `${p.ns}_RP/`;
    const scr = S.Bedrock.scripts ? S.Bedrock.scripts(p) : null;
    z.json(BP + 'manifest.json', S.Bedrock.manifest(p, 'BP', scr));
    if (scr) { z.add(BP + 'scripts/main.js', scr.main); if (scr.user) z.add(BP + 'scripts/user.js', scr.user); }
    z.json(RP + 'manifest.json', S.Bedrock.manifest(p, 'RP'));
    const icon = S.Bedrock.packIcon(p); if (icon) { z.add(BP + 'pack_icon.png', icon); z.add(RP + 'pack_icon.png', icon); }
    z.json(RP + 'texts/languages.json', ['en_US', 'th_TH']);
    z.add(RP + 'texts/en_US.lang', S.Bedrock.lang(p, false));
    z.add(RP + 'texts/th_TH.lang', S.Bedrock.lang(p, true));
    const itemTex = {}, terrainTex = {};
    for (const a of p.assets) {
      const png = S.dataUrlBytes(a.tex.data);
      if (a.kind === 'entity') {
        z.add(RP + `textures/entity/${a.key}.png`, png);
        z.json(RP + `models/entity/${a.key}.geo.json`, S.Bedrock.geometry(a, p));
        if ((a.anims || []).some(an => Object.keys(an.tracks).length)) z.json(RP + `animations/${a.key}.animation.json`, S.Bedrock.animations(a, p));
        const ctrl = S.Bedrock.controller(a, p);
        if (ctrl) z.json(RP + `animation_controllers/${a.key}.ac.json`, ctrl);
        z.json(RP + `entity/${a.key}.entity.json`, S.Bedrock.clientEntity(a, p, !!ctrl));
        z.json(BP + `entities/${a.key}.json`, S.Bedrock.behaviorEntity(a, p));
        if ((a.cfg.drops || []).some(d => d.item)) z.json(BP + `loot_tables/entities/${a.key}.json`, S.Bedrock.loot(p, a.cfg.drops));
        if (a.cfg.spawn) z.json(BP + `spawn_rules/${a.key}.json`, S.Bedrock.spawnRules(a, p));
      } else if (a.kind === 'item') {
        z.add(RP + `textures/items/${a.key}.png`, png);
        itemTex[`${p.ns}_${a.key}`] = { textures: `textures/items/${a.key}` };
        z.json(BP + `items/${a.key}.json`, S.Bedrock.item(a, p));
      } else {
        z.add(RP + `textures/blocks/${a.key}.png`, png);
        terrainTex[`${p.ns}_${a.key}`] = { textures: `textures/blocks/${a.key}` };
        if (a.cfg.custom && a.model) z.json(RP + `models/blocks/${a.key}.geo.json`, S.Bedrock.geometry(a, p));
        z.json(BP + `blocks/${a.key}.json`, S.Bedrock.block(a, p));
        if (a.cfg.drop === 'nothing') z.json(BP + `loot_tables/blocks/${a.key}.json`, { pools: [] });
        else if (a.cfg.drop === 'item') z.json(BP + `loot_tables/blocks/${a.key}.json`, S.Bedrock.loot(p, [{ item: a.cfg.dropItem, min: 1, max: 1 }]));
      }
      const rec = (a.kind !== 'entity') && S.Bedrock.recipe(p, a);
      if (rec) z.json(BP + `recipes/${a.key}.json`, rec);
    }
    if (Object.keys(itemTex).length) z.json(RP + 'textures/item_texture.json', { resource_pack_name: p.ns, texture_name: 'atlas.items', texture_data: itemTex });
    if (Object.keys(terrainTex).length) z.json(RP + 'textures/terrain_texture.json', { resource_pack_name: p.ns, num_mip_levels: 0, padding: 0, texture_name: 'atlas.terrain', texture_data: terrainTex });
    return z;
  },
  importGeo(json, a) {
    let geo = null, fmt = 'new';
    if (json['minecraft:geometry']) geo = json['minecraft:geometry'][0];
    else { const k = Object.keys(json).find(k => k.startsWith('geometry.')); if (k) { geo = json[k]; fmt = 'old'; } }
    if (!geo || !geo.bones) throw new Error('ไม่พบ geometry ในไฟล์');
    const d = geo.description || {};
    const tw = d.texture_width || geo.texturewidth || 64, th = d.texture_height || geo.textureheight || 64;
    const ids = {}, bones = [];
    let perFace = false;
    geo.bones.forEach(b => {
      const nb = S.mkBone(String(b.name || 'bone').replace(/[^A-Za-z0-9_]/g, '_'), b.pivot || [0, 0, 0], null, []);
      nb._parent = b.parent; nb.rot = (b.rotation || [0, 0, 0]).slice();
      (b.cubes || []).forEach(c => {
        let uv = c.uv;
        if (uv && !Array.isArray(uv)) { perFace = true; const f = uv.north || uv.east || Object.values(uv)[0]; uv = f && f.uv ? f.uv : [0, 0]; }
        const nc = S.mkCube(c.origin || [0, 0, 0], c.size || [1, 1, 1], { uv: (uv || [0, 0]).slice(0, 2), inflate: c.inflate != null ? c.inflate : (b.inflate || 0), mirror: c.mirror != null ? !!c.mirror : !!b.mirror });
        if (c.rotation) { nc.rot = c.rotation.slice(); nc.pivot = (c.pivot || nc.pivot).slice(); }
        nb.cubes.push(nc);
      });
      ids[b.name] = nb.id; bones.push(nb);
    });
    bones.forEach(b => { b.parent = b._parent && ids[b._parent] ? ids[b._parent] : null; delete b._parent; });
    a.model = { bones };
    void fmt;
    return { tw, th, perFace };
  }
};
