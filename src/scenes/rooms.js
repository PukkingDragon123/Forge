// Room scenes: the wandering merchant, treasure chests (and mimics), and campsites.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildSet } from '../models/environments.js';
import { buildProp } from '../models/props.js';
import { buildCharacter } from '../models/characters.js';
import { buildMonster } from '../models/monsters.js';
import { materialCard, drawCard } from '../ui/cards.js';
import { makeWorld, hud, speech, prompt, dim, ribbonTitle, bark } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { merchantStock, chestLoot, CHESTS } from '../systems/run.js';
import { itemTooltip, itemValue, matOf, makeItem } from '../systems/items.js';
import { MATERIALS, QUALITY, RARITY } from '../data/materials.js';
import { REGIONS } from '../data/regions.js';
import { COLORS } from '../ui/font.js';
import { fx as rnd } from '../core/rng.js';
import { clamp } from '../core/math.js';

class RoomBase extends Scene {
  setup(room, opts = {}) {
    const run = this.game.run;
    this.run = run;
    this.set = buildSet('room', run.region, { room });
    this.w = makeWorld(this.set, { fogDensity: 0.04 });
    this.world = this.w;
    const a = this.set.anchors;
    this.hero = buildCharacter(run.char);
    const hp = a.player || a.center.clone().add(new THREE.Vector3(-1.4, 0, 0.4));
    this.hero.group.position.copy(hp);
    this.hero.group.rotation.y = Math.PI / 2 * 0.6;
    this.w.scene.add(this.hero.group);
    this.hero.play('idle', { loop: true });
    this.bubble = null;
    this.game.audio.music(opts.music || REGIONS[run.region].music);
    this.t = 0;
  }
  say(text, who = 'hero', dur = 2.6) { this.bubble = { text, who, t: dur }; }
  tick(dt) {
    this.t += dt;
    this.w.rig.update(dt); this.w.sparks.update(dt); this.w.dust.update(dt);
    this.set.update && this.set.update(dt, this.time);
    this.hero.update(dt);
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    if (Math.random() < 0.3) this.w.dust.emit({ pos: [0, 1.5, 0], posSpread: [4, 1.2, 2], vel: [0.04, 0.01, 0], spread: 0.03, life: [3, 6], size: 1, color: '#d8c8b0', alpha: 0.5, fadeIn: 1 });
  }
  drawBubble(ui, target) {
    if (!this.bubble) return;
    const pos = target || (this.hero.headPos ? this.hero.headPos() : this.hero.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
    const p = this.w.rig.project(pos, ui.w, ui.h);
    speech(ui, p.x, p.y, this.bubble.text, { alpha: clamp(this.bubble.t * 3, 0, 1) });
  }
  leaveWithLoot(title) {
    const bag = this.run.bag;
    if (bag.overflow.length) openBag(this.game, { title, onClose: () => finish(this.game) });
    else finish(this.game);
  }
}

// ============================================================================ MERCHANT
const MERCHANT_LINES = [
  'Ores! Parts! Keys! Shiny things! No refunds!',
  'Tibbs has what you need. Tibbs has what you don\'t need too.',
  'Cursed? Pfft. Tibbs is cursed with good prices.',
  'You look like someone who appreciates a fine rock.',
];

export class MerchantScene extends RoomBase {
  enter(p) {
    this.setup('merchant', { music: 'shop' });
    const a = this.set.anchors;
    this.cart = buildProp('merchantcart');
    this.cart.position.copy(a.center).add(new THREE.Vector3(0.9, 0, -0.6));
    this.w.scene.add(this.cart);
    this.npc = buildMonster('kobold');
    this.npc.group.position.copy(a.center).add(new THREE.Vector3(0.6, 0, 0.4));
    this.npc.group.scale.multiplyScalar(1.1);
    this.w.scene.add(this.npc.group);
    this.npc.play('idle');
    this.stock = merchantStock(this.run);
    this.tab = 'buy';
    this.npcBubble = { text: rnd.pick(MERCHANT_LINES), t: 3.5 };
    this.w.rig.cut([a.center.x + 1.2, 1.9, a.center.z + 6.2], [a.center.x + 2.1, 0.75, a.center.z], 38);
    this.game.audio.play('door_creak');
  }
  update(dt) {
    this.tick(dt);
    this.npc.update(dt);
    if (this.npcBubble) { this.npcBubble.t -= dt; if (this.npcBubble.t <= 0) this.npcBubble = null; }
  }
  npcSay(text) { this.npcBubble = { text, t: 2.6 }; }
  draw(ui) {
    const g = this.game, run = this.run;
    const h = hud(ui, g);
    if (h.bagClicked) openBag(g);
    const W = 300, H = 196, x = ui.w - W - 10, y = 40;
    ui.panel('wood', x, y, W, H, { tone: 'dark' });
    ribbonTitle(ui, 'Tibbs\' Wandering Wares', x + W / 2, y - 8, 'brown');
    // tabs
    ['buy', 'sell'].forEach((t, i) => {
      if (ui.button('mtab' + t, x + 8 + i * 60, y + 12, 56, 16, t === 'buy' ? 'Buy' : 'Sell', { style: this.tab === t ? 'gold' : 'wood', font: 'body' })) this.tab = t;
    });
    if (this.tab === 'buy') {
      this.stock.forEach((it, i) => {
        const cx = x + 10 + (i % 5) * 57, cy = y + 34 + Math.floor(i / 5) * 80;
        const can = run.coins >= it.price;
        const card = materialCard(it, { dim: !can });
        const hit = ui.hit('buy' + it.uid, cx, cy, 48, 64);
        drawCard(ui, card, cx, cy, { lift: hit.hover ? 3 : 0, hover: hit.hover });
        ui.icon('coin', cx + 6, cy + 66);
        ui.text(String(it.price), cx + 17, cy + 67, { color: can ? COLORS.gold : COLORS.bad, outline: '#140c10', outlineShadow: false });
        if (hit.hover) { const tt = itemTooltip(it); tt.body += `\n{gold}Price: ${it.price}{/}`; ui.tooltip(tt); }
        if (hit.clicked) {
          if (!can) { g.audio.play('deny'); this.npcSay('No coin, no rock!'); }
          else {
            run.coins -= it.price;
            this.stock.splice(this.stock.indexOf(it), 1);
            delete it.price;
            if (!run.addItem(it)) ui.toast('Bag full — it went to your loot tray', { icon: 'bag' });
            g.audio.play('coins');
            this.npcSay(rnd.pick(['Pleasure doing business!', 'Good choice! Probably!', 'Hehehe, coins!']));
            if (it.id === 'recipe_scroll') ui.toast('Right-click scrolls in your bag to read them', { icon: 'recipe' });
          }
        }
      });
      if (!this.stock.length) ui.text('Sold out!', x + W / 2, y + 100, { align: 'center', color: COLORS.dim });
    } else {
      const items = run.bag.items;
      items.forEach((it, i) => {
        const cx = x + 10 + (i % 5) * 57, cy = y + 34 + Math.floor(i / 5) * 76;
        if (cy > y + H - 70) return;
        const v = itemValue(it);
        const hit = ui.hit('sell' + it.uid, cx, cy, 48, 64);
        drawCard(ui, materialCard(it), cx, cy, { lift: hit.hover ? 3 : 0, hover: hit.hover });
        ui.icon('coin', cx + 6, cy + 64); ui.text('+' + v, cx + 17, cy + 65, { color: COLORS.gold, outline: '#140c10', outlineShadow: false });
        if (hit.hover) { const tt = itemTooltip(it); tt.body += `\n{gold}Sells for ${v}{/}`; ui.tooltip(tt); }
        if (hit.clicked) { run.removeItem(it); run.coins += v; g.audio.play('coin'); this.npcSay(rnd.pick(['Ooh, I\'ll take it!', 'Tibbs loves junk. Er, treasure.', 'Into the pile!'])); }
      });
      if (!items.length) ui.text('Nothing to sell.', x + W / 2, y + 100, { align: 'center', color: COLORS.dim });
    }
    if (ui.button('mleave', x + W - 90, y + H + 6, 84, 20, 'Leave', { style: 'stone', icon: 'arrowR' }) || g.input.actionPressed('back')) this.leaveWithLoot('Purchases');
    // bubbles
    if (this.npcBubble) {
      const p = this.w.rig.project(this.npc.group.position.clone().add(new THREE.Vector3(0, 1.0, 0)), ui.w, ui.h);
      speech(ui, p.x, p.y, this.npcBubble.text, { maxW: 110, alpha: clamp(this.npcBubble.t * 3, 0, 1) });
    }
  }
}

// ============================================================================ TREASURE
export class TreasureScene extends RoomBase {
  enter(p) {
    this.node = p.node;
    this.setup('treasure');
    const run = this.run, rng = run.rng, a = this.set.anchors;
    const n = rng.chance(0.35) ? 3 : 2;
    const kinds = ['wood', rng.pick(['iron', 'iron', 'crystal', 'bone']), rng.pick(['wood', 'iron', 'gold'])].slice(0, n);
    const mimicIdx = rng.chance(0.4 + run.region * 0.05) ? rng.int(0, n - 1) : -1;
    this.chests = kinds.map((k, i) => {
      const x = a.center.x + (i - (n - 1) / 2) * 1.5;
      const pos = new THREE.Vector3(x, 0, a.center.z - 0.3);
      const isMimic = i === mimicIdx;
      let obj;
      if (isMimic) { obj = buildMonster('mimic'); obj.play('disguise'); obj.group.position.copy(pos); obj.group.rotation.y = Math.PI / 2; this.w.scene.add(obj.group); }
      else { obj = buildProp('chest', { kind: k }); obj.position.copy(pos); this.w.scene.add(obj); }
      return { kind: isMimic ? 'wood' : k, mimic: isMimic, obj, pos, opened: false, inspected: false, tell: rng.pick(['blinks', 'drools', 'breathes', 'twitches']) };
    });
    this.hero.group.position.set(a.center.x - 2.4, 0, a.center.z + 0.9);
    this.hero.group.rotation.y = Math.PI / 2;
    this.w.rig.cut([a.center.x - 0.3, 2.3, a.center.z + 6.6], [a.center.x - 0.3, 0.5, a.center.z], 40);
    this.sel = null;
    if (run.char === 'clover' && mimicIdx >= 0) this.say('*sniff sniff* …one of these smells like teeth.');
    else this.say(bark(run.char, 'mine'));
    this.coins = 0;
  }
  update(dt) {
    this.tick(dt);
    for (const c of this.chests) {
      if (c.mimic) { c.obj.update(dt); if (!c.revealed) c.obj.group.scale.y = 1 + Math.sin(this.time * 2.2) * 0.012; }
      else if (c.obj.userData.update) c.obj.userData.update(dt, this.time);
    }
    // mimic tell particles (subtle)
    for (const c of this.chests) if (c.mimic && !c.revealed && Math.random() < 0.02) this.w.dust.emit({ pos: [c.pos.x + 0.25, 0.25, c.pos.z + 0.3], vel: [0, -0.3, 0], life: [0.6, 0.9], size: 1, color: '#9affc8', alpha: 0.8 });
  }
  keyFor(kind) {
    const lock = CHESTS[kind].lock;
    if (!lock) return null;
    return this.run.bag.all().find((it) => (MATERIALS[it.id].opens || []).includes(lock));
  }
  open(c, how = 'open') {
    const g = this.game, run = this.run;
    if (c.mimic) return this.mimicAttack(c);
    c.opened = true;
    if (c.obj.userData.open) this.tw.value(0, 1, 0.6, (v) => c.obj.userData.open(v), { ease: 'outBack' });
    g.audio.play('chest_open');
    const loot = chestLoot(run, c.kind);
    if (how === 'pry') for (const it of loot.items) it.q = Math.max(0, it.q - 1);
    const gained = run.gain(loot.coins);
    this.w.sparks.emit({ pos: [c.pos.x, 0.5, c.pos.z], radial: [1, 2.5], radialUp: 2, count: 40, life: [0.6, 1.4], size: 1, color: ['#ffe08a', '#fff6c8', '#ffd25e'], glow: 3, gravity: 3 });
    g.ui.float(`+${gained}`, g.ui.w / 2, g.ui.h / 2 - 30, { big: true, scale: 2, top: '#fff6c8', bottom: '#ffd25e' });
    for (const it of loot.items) run.bag.toOverflow(it);
    this.lastLoot = { items: loot.items, t: 3 };
    this.hero.play('cheer', { onDone: () => this.hero.play('idle', { loop: true }) });
    this.say(bark(run.char, 'win'));
  }
  mimicAttack(c) {
    c.revealed = true;
    const g = this.game;
    g.audio.play('mimic_reveal');
    c.obj.play('intro');
    this.w.rig.shake(0.6);
    this.hero.setExpression('surprised');
    this.say('IT\'S A MIMIC!', 'hero', 2);
    this.co.start(function* () {
      yield 1.1;
      g.go('combat', { node: this.node, monster: 'mimic', fromTreasure: true }, { transition: 'dither' });
    }.bind(this));
  }
  draw(ui) {
    const g = this.game, run = this.run;
    const h = hud(ui, g);
    if (h.bagClicked) openBag(g);
    ribbonTitle(ui, 'Treasure Room', ui.w / 2, 30, 'gold');
    for (const c of this.chests) {
      const p = this.w.rig.project(c.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), ui.w, ui.h);
      if (c.opened) { ui.text('{dim}Empty{/}', p.x, p.y - 4, { align: 'center' }); continue; }
      const hit = ui.hit('chest' + c.pos.x, p.x - 28, p.y - 10, 56, 60);
      const lock = CHESTS[c.kind].lock;
      ui.text(CHESTS[c.kind].name, p.x, p.y - 10, { align: 'center', color: lock ? COLORS.key : COLORS.white, outline: '#140c10', outlineShadow: false });
      if (lock) ui.icon('lock', p.x - 3, p.y + 2);
      if (c.inspected) ui.text(c.detected ? `{bad}It ${c.tell}!{/}` : c.kicked ? '{dim}Just a chest.{/}' : '{good}Seems safe…{/}', p.x, p.y + 12, { align: 'center', font: 'small' });
      if (hit.hover) ui.tooltip({ title: CHESTS[c.kind].name, body: lock ? `Locked (${lock}). Use a matching key, or pry it open (contents lose quality).` : 'Unlocked. Probably fine.' });
      if (hit.clicked) this.sel = c;
    }
    if (this.sel && !this.sel.opened && !this.sel.revealed) {
      const c = this.sel;
      ui.block(3);
      const p = this.w.rig.project(c.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), ui.w, ui.h);
      const bx = Math.round(clamp(p.x - 60, 4, ui.w - 124)), by = Math.round(clamp(p.y + 10, 40, ui.h - 110));
      ui.panel('dark', bx, by, 120, 98);
      const key = this.keyFor(c.kind);
      const lock = CHESTS[c.kind].lock;
      let yy = by + 6;
      if (!lock) { if (ui.button('copen', bx + 6, yy, 108, 18, 'Open', { style: 'gold', icon: 'chest' })) { this.open(c); this.sel = null; } }
      else {
        if (ui.button('ckey', bx + 6, yy, 108, 18, key ? `Use ${MATERIALS[key.id].name}` : 'No key', { style: 'gold', icon: 'key', disabled: !key })) { run.removeItem(key); g.audio.play('key_unlock'); this.open(c); this.sel = null; }
      }
      yy += 22;
      if (lock && ui.button('cpry', bx + 6, yy, 108, 18, run.char === 'clover' ? 'Pick the lock' : 'Pry it open', { style: 'wood', icon: 'tool', tip: run.char === 'clover' ? 'Clover\'s nimble paws: no quality loss.' : 'Items inside lose 1 quality.' })) { this.open(c, run.char === 'clover' ? 'open' : 'pry'); this.sel = null; }
      if (lock) yy += 22;
      if (ui.button('cinspect', bx + 6, yy, 108, 18, 'Inspect', { style: 'wood', icon: 'eye', disabled: c.inspected })) {
        c.inspected = true;
        c.detected = c.mimic && (rnd.chance(0.6) || run.char === 'clover');
        if (c.detected) g.audio.play('qte_prompt');
        this.sel = null;
      }
      yy += 22;
      if (ui.button('ckick', bx + 6, yy, 52, 18, 'Kick', { style: 'red', tip: 'Reveals mimics for sure. Hurts if it\'s just a chest.' })) {
        this.sel = null;
        if (c.mimic) this.mimicAttack(c);
        else { run.hurt(3); g.audio.play('hurt'); this.hero.play('hurt', { onDone: () => this.hero.play('idle', { loop: true }) }); this.say('OW. Just a chest.'); c.inspected = true; c.kicked = true; if (run.hp <= 0) gameOver(g, 'Stubbed toe'); }
      }
      if (ui.button('cback', bx + 62, yy, 52, 18, 'Back', { style: 'stone' }) || g.input.actionPressed('back')) this.sel = null;
      ui.unblock();
    }
    if (this.lastLoot && this.lastLoot.t > 0) {
      this.lastLoot.t -= g.ui.dt;
      this.lastLoot.items.forEach((it, i) => drawCard(ui, materialCard(it), ui.w / 2 - this.lastLoot.items.length * 26 + i * 52, ui.h - 120, { lift: Math.max(0, (this.lastLoot.t - 2.6) * 30) }));
    }
    if (ui.button('tleave', ui.w - 94, ui.h - 26, 88, 20, 'Move on', { style: 'stone', icon: 'arrowR' })) this.leaveWithLoot('Treasure');
    this.drawBubble(ui);
  }
}

// ============================================================================ CAMP
export class CampScene extends RoomBase {
  enter(p) {
    this.setup('camp', { music: 'campfire' });
    const a = this.set.anchors;
    this.fire = buildProp('campfire');
    this.fire.position.copy(a.center);
    this.w.scene.add(this.fire);
    this.hero.group.position.copy(a.center).add(new THREE.Vector3(-0.9, 0, 0.5));
    this.hero.group.rotation.y = Math.PI / 2;
    this.hero.play('sit', { loop: true });
    this.w.rig.cut([a.center.x + 0.3, 1.8, a.center.z + 5.4], [a.center.x - 0.3, 0.55, a.center.z], 38);
    this.crackle = this.game.audio.loop('campfire');
    this.chosen = null;
    this.say('A safe spot. Finally.');
    this.picking = null;
  }
  exit() { this.crackle && this.crackle.stop(1); }
  update(dt) {
    this.tick(dt);
    if (this.fire.userData.update) this.fire.userData.update(dt, this.time);
    if (this.fire.userData.emit) this.fire.userData.emit(this.w.P, dt);
  }
  draw(ui) {
    const g = this.game, run = this.run;
    const h = hud(ui, g);
    if (h.bagClicked) openBag(g);
    ribbonTitle(ui, 'Campsite', ui.w / 2, 30, 'brown');
    if (!this.chosen) {
      const heal = Math.round(run.maxHp * 0.35);
      const opts = [
        { id: 'rest', label: 'Rest', icon: 'heart', desc: `Heal {heal}${heal} HP{/}.` },
        { id: 'temper', label: 'Temper', icon: 'hammer', desc: 'Raise the quality of up to 2 materials.' },
        { id: 'smelt', label: 'Smelt', icon: 'forge', desc: 'Melt 3 identical materials into 1 rarer one.' },
      ];
      opts.forEach((o, i) => {
        const x = ui.w / 2 - 165 + i * 112, y = ui.h - 110;
        ui.panel('leather', x, y, 104, 70, { tone: 'dark' });
        ui.icon(o.icon, x + 8, y + 8);
        ui.text(o.label, x + 22, y + 8, { color: COLORS.gold });
        ui.text(o.desc, x + 8, y + 24, { maxW: 90, color: COLORS.white });
        if (ui.hit('camp' + o.id, x, y, 104, 70).clicked) this.choose(o.id);
      });
    } else if (this.chosen === 'temper' || this.chosen === 'smelt') this.drawPicker(ui);
    else if (ui.button('cleave', ui.w - 94, ui.h - 26, 88, 20, 'Move on', { style: 'stone', icon: 'arrowR' })) this.leaveWithLoot('Camp');
    this.drawBubble(ui);
  }
  choose(id) {
    const g = this.game, run = this.run;
    this.chosen = id;
    if (id === 'rest') {
      const n = run.heal(Math.round(run.maxHp * 0.35));
      g.audio.play('heal');
      g.ui.float(`+${n}`, g.ui.w / 2, g.ui.h / 2, { big: true, top: '#d8ffe0', bottom: '#6dff9a' });
      this.hero.play('sleep', { loop: true });
      this.hero.setExpression('sleepy');
      this.say('Zzz…');
    } else this.picking = { left: id === 'temper' ? 2 : 1, picked: [] };
  }
  drawPicker(ui) {
    const g = this.game, run = this.run;
    const items = run.bag.items.filter((it) => (this.chosen === 'temper' ? it.q < 4 : run.bag.items.filter((o) => o.id === it.id).length >= 3 && RARITY[matOf(it).rarity].order < 4));
    const W = 300, x = ui.w / 2 - W / 2, y = 50;
    ui.panel('parchment', x, y, W, 200);
    ui.text(this.chosen === 'temper' ? `Temper ${this.picking.left} more` : 'Choose a material to smelt (needs 3)', ui.w / 2, y + 10, { align: 'center', color: '#3a2618' });
    const seen = new Set();
    let i = 0;
    for (const it of items) {
      if (this.chosen === 'smelt') { if (seen.has(it.id)) continue; seen.add(it.id); }
      const cx = x + 10 + (i % 5) * 57, cy = y + 26 + Math.floor(i / 5) * 70;
      i++;
      if (cy > y + 140) break;
      const hit = ui.hit('pick' + it.uid, cx, cy, 48, 64);
      drawCard(ui, materialCard(it), cx, cy, { lift: hit.hover ? 3 : 0 });
      if (hit.hover) ui.tooltip(itemTooltip(it));
      if (hit.clicked) {
        if (this.chosen === 'temper') {
          it.q++; g.audio.play('anvil_ring'); this.picking.left--;
          g.ui.toast(`${MATERIALS[it.id].name} → ${QUALITY[it.q].name}`, { icon: 'quality' });
        } else {
          const same = run.bag.items.filter((o) => o.id === it.id).slice(0, 3);
          for (const o of same) run.removeItem(o);
          const order = RARITY[matOf(it).rarity].order + 1;
          const pool = Object.values(MATERIALS).filter((m) => m.regions && RARITY[m.rarity].order === order && m.kind !== 'part' && !m.unlock);
          const out = makeItem(rnd.pick(pool).id, 2);
          run.addItem(out);
          g.audio.play('metal_pour');
          g.ui.toast(`Smelted into ${MATERIALS[out.id].name}!`, { icon: 'forge', color: COLORS[MATERIALS[out.id].rarity] });
          this.picking.left = 0;
        }
        if (this.picking.left <= 0) { this.chosen = 'done'; this.say(bark(run.char, 'forge')); }
      }
    }
    if (!i) ui.text('{dim}Nothing suitable in your bag.{/}', ui.w / 2, y + 90, { align: 'center' });
    if (ui.button('pdone', x + W - 90, y + 206, 84, 18, 'Done', { style: 'wood' })) this.chosen = 'done';
  }
}
