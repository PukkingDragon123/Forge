// Room scenes: the wandering merchant, treasure chests (and mimics), and campsites. Played like
// cutscenes: a letterboxed narration line, and every choice is something in the room you touch:
// goods laid out on the mole's rug with paper price tags, his brass scales to sell, chests that
// sprout tags when you walk up to them, the anvil/fire/bedroll at camp, an arrow sign to move on.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildStage as buildSet } from '../models/stage2d.js';
import { buildProp } from '../models/props.js';
import { buildCharacter } from '../models/characters.js';
import { buildMonster } from '../models/monsters.js';
import { materialCard } from '../ui/cards.js';
import { materialSprite } from '../art/sprites.js';
import { tagCanvas, glowCanvas } from '../art/handpaint.js';
import { rugCanvas, arrowSign, scalesCanvas } from '../art/room_art.js';
import { makeWorld, hud, speech, bark } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { merchantStock, chestLoot, CHESTS } from '../systems/run.js';
import { itemTooltip, itemValue, matOf, makeItem } from '../systems/items.js';
import { MATERIALS, QUALITY, RARITY } from '../data/materials.js';
import { REGIONS } from '../data/regions.js';
import { COLORS } from '../ui/font.js';
import { fx as rnd } from '../core/rng.js';
import { clamp, ease } from '../core/math.js';

const LB = 32;

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
    this.flyers = [];
    this.narr = { text: '', t: 0 };
    this.lb = 0;
    this.game.audio.music(opts.music || REGIONS[run.region].music);
    this.t = 0;
  }
  say(text, who = 'hero', dur = 2.6) { this.bubble = { text, who, t: dur }; }
  narrate(text) { if (text !== this.narr.text) this.narr = { text, t: 0 }; }
  tick(dt) {
    this.t += dt;
    this.lb = Math.min(1, this.lb + dt * 1.6);
    this.narr.t += dt;
    this.w.rig.update(dt); this.w.sparks.update(dt); this.w.dust.update(dt);
    this.set.update && this.set.update(dt, this.time);
    this.hero.update(dt);
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    for (let i = this.flyers.length - 1; i >= 0; i--) { const f = this.flyers[i]; f.t += dt; if (f.t >= f.dur) { this.flyers.splice(i, 1); this.game.audio.play('card_place', { vol: 0.4, pitch: 0.8 }); } }
    if (Math.random() < 0.3) this.w.dust.emit({ pos: [0, 1.5, 0], posSpread: [4, 1.2, 2], vel: [0.04, 0.01, 0], spread: 0.03, life: [3, 6], size: 1, color: '#d8c8b0', alpha: 0.5, fadeIn: 1 });
  }
  proj(v, ui) { return this.w.rig.project(v, ui.w, ui.h); }
  drawBubble(ui, target) {
    if (!this.bubble) return;
    const pos = target || (this.hero.headPos ? this.hero.headPos() : this.hero.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
    const p = this.proj(pos, ui);
    speech(ui, p.x, p.y, this.bubble.text, { alpha: clamp(this.bubble.t * 3, 0, 1) });
  }
  /** Paper tag on twine; returns {hover, clicked} when it is clickable. */
  tag(ui, id, x, y, text, opts = {}) {
    const w = ui.measure(text) + 16 + (opts.icon ? 12 : 0);
    const c = tagCanvas(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4)), by = Math.round(y);
    const h = id ? ui.hit(id, bx + 4, by + 6, c.width - 8, c.height - 8, { sound: false }) : { hover: false, clicked: false };
    ui.img(c, bx, by - (h.hover ? 2 : 0), { alpha: opts.dim ? 0.6 : 1 });
    if (opts.icon) ui.icon(opts.icon, bx + 9, by + 10 - (h.hover ? 2 : 0));
    ui.text(text, bx + 10 + (opts.icon ? 12 : 0), by + 11 - (h.hover ? 2 : 0), { color: opts.color || '#3a2214' });
    return h;
  }
  /** Arrow sign to move on (bottom right, above the letterbox). */
  moveOn(ui, label = 'Move on') {
    const s = arrowSign(), x = ui.w - s.width - 14, y = ui.h - LB - s.height + 4;
    const h = ui.hit('moveon', x, y, s.width, s.height, { sound: false });
    ui.img(s, x, y - (h.hover ? 2 : 0));
    ui.text(label, x + 38, y + 14 - (h.hover ? 2 : 0), { align: 'center', color: '#f6e6c4', outline: '#2a1608' });
    return h.clicked;
  }
  fly(it, from) { this.flyers.push({ item: it, x0: from.x, y0: from.y, t: 0, dur: 0.8 }); }
  drawFrame(ui) {
    // letterbox, the narrator's line, a heart and a purse
    const bar = Math.round(LB * ease.outCubic(this.lb));
    ui.rect(0, 0, ui.w, bar, '#050406');
    ui.rect(0, ui.h - bar, ui.w, bar, '#050406');
    const h = hud(ui, this.game);
    if (h.bagClicked) openBag(this.game);
    const n = Math.floor(this.narr.t * 70);
    let shown = '', vis = 0;
    for (let i = 0; i < this.narr.text.length && vis < n; i++) { const ch = this.narr.text[i]; if (ch === '{') { const j = this.narr.text.indexOf('}', i); shown += this.narr.text.slice(i, j + 1); i = j; continue; } shown += ch; vis++; }
    if ((shown.match(/\{(?!\/)[^}]*\}/g) || []).length > (shown.match(/\{\/\}/g) || []).length) shown += '{/}';
    ui.text(shown, ui.w / 2, ui.h - bar + 10, { align: 'center', color: '#efe2c8', maxW: ui.w - 220 });
    for (const f of this.flyers) {
      const k = ease.inOutCubic(Math.min(1, f.t / f.dur));
      const x = f.x0 + (22 - f.x0) * k, y = f.y0 + (ui.h - 20 - f.y0) * k - Math.sin(k * Math.PI) * 80;
      ui.img(materialSprite(f.item.id, 32), x - 16, y - 16);
    }
  }
  leaveWithLoot(title) {
    const bag = this.run.bag;
    if (bag.overflow.length) openBag(this.game, { title, onClose: () => finish(this.game) });
    else finish(this.game);
  }
  /** Items laid out on a rug, each with a paper tag. Returns the clicked item. */
  rugItems(ui, items, opts) {
    const per = Math.min(9, Math.max(4, items.length));
    const rows = Math.max(1, Math.ceil(items.length / per));
    const W = opts.w || 420, H = 40 + rows * 64;
    const x = Math.round(opts.cx - W / 2), y = ui.h - LB - H - 6;
    ui.img(rugCanvas(W, H, opts.color || '#7a2e22', 5), x - 4, y - 4);
    let clicked = null, hovered = null;
    items.forEach((it, i) => {
      const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, items.length - row * per);
      const step = (W - 40) / Math.max(1, inRow);
      const ix = Math.round(x + 20 + step * (col + 0.5) - 20), iy = y + 10 + row * 64;
      const h = ui.hit(opts.id + it.uid, ix, iy, 40, 52, { sound: false });
      const lift = h.hover ? 4 : 0;
      ui.img(materialSprite(it.id, 40), ix, iy - lift, { alpha: opts.dim && opts.dim(it) ? 0.45 : 1 });
      const label = opts.label(it);
      const tw = ui.measure(label.text) + 32, tx = Math.round(ix + 20 - (tw + 8) / 2);
      ui.img(tagCanvas(tw), tx, iy + 36);
      if (opts.coin !== false) ui.icon('coin', tx + 9, iy + 46);
      ui.text(label.text, tx + (opts.coin !== false ? 24 : 12), iy + 47, { color: label.color || '#3a2214' });
      if (h.hover) hovered = { it, ix, iy };
      if (h.clicked) clicked = it;
    });
    if (hovered) {
      // the full card rises above whatever you're looking at
      const card = materialCard(hovered.it);
      ui.img(card, Math.round(clamp(hovered.ix + 20 - card.width / 2, 6, ui.w - card.width - 6)), Math.round(y - card.height - 8));
      const tt = itemTooltip(hovered.it);
      if (opts.tip) tt.body += opts.tip(hovered.it);
      ui.tooltip(tt);
    }
    if (!items.length && opts.empty) ui.text(opts.empty, opts.cx, y + H / 2 - 4, { align: 'center', color: '#f0dcb0', outline: '#140c10' });
    return clicked;
  }
}

// ============================================================================ MERCHANT
const MERCHANT_LINES = [
  'Ores! Parts! Keys! Shiny things! No refunds!',
  'Mossworth has what you need. And what you don\'t need, too.',
  'Cursed? Pfft. I\'m cursed with excellent prices.',
  'You look like someone who appreciates a fine rock.',
];

export class MerchantScene extends RoomBase {
  enter(p) {
    this.setup('merchant', { music: 'shop' });
    const a = this.set.anchors;
    this.npc = a.npc;
    this.npcPos = (a.merchant || a.center).clone();
    this.stock = merchantStock(this.run);
    this.tab = 'buy';
    this.npcBubble = { text: rnd.pick(MERCHANT_LINES), t: 3.5 };
    this.w.rig.cut([a.center.x + 0.6, 1.9, a.center.z + 6.0], [a.center.x + 0.6, 0.8, a.center.z - 0.4], 38);
    this.game.audio.play('door_creak');
    this.narrate('{gold}Mossworth\'s Wandering Wares.{/} A mole in tiny spectacles spreads his goods on a rug.');
  }
  update(dt) {
    this.tick(dt);
    if (this.npcBubble) { this.npcBubble.t -= dt; if (this.npcBubble.t <= 0) this.npcBubble = null; }
  }
  npcSay(text) { this.npcBubble = { text, t: 2.6 }; }
  draw(ui) {
    const g = this.game, run = this.run;
    // the scales: weigh your own things to sell them
    const sc = scalesCanvas(this.tab === 'sell' ? 1 : 0);
    const sx = 212, sy = ui.h - LB - 150;
    const sh = ui.hit('scales', sx, sy, sc.width, sc.height, { sound: false });
    ui.img(sc, sx, sy - (sh.hover ? 2 : 0));
    if (sh.hover) this.tag(ui, null, sx + 32, sy - 26, this.tab === 'sell' ? 'Back to his wares' : 'Sell your things');
    if (sh.clicked) { this.tab = this.tab === 'sell' ? 'buy' : 'sell'; g.audio.play('coin'); this.narrate(this.tab === 'sell' ? 'Mossworth eyes your bag hungrily. "Let\'s see what you\'ve got…"' : '{gold}Mossworth\'s Wandering Wares.{/} Point at anything you like.'); }
    if (this.tab === 'buy') {
      const it = this.rugItems(ui, this.stock, {
        id: 'buy', cx: ui.w / 2 + 70, w: 460, color: '#7a2e22',
        label: (x) => ({ text: String(x.price), color: run.coins >= x.price ? '#3a2214' : '#a02020' }),
        dim: (x) => run.coins < x.price, tip: (x) => `\n{gold}Price: ${x.price}{/}`, empty: 'Sold out! "Come back next layer!"',
      });
      if (it) {
        if (run.coins < it.price) { g.audio.play('deny'); this.npcSay('No coin, no rock!'); }
        else {
          run.coins -= it.price;
          this.stock.splice(this.stock.indexOf(it), 1);
          delete it.price;
          if (!run.addItem(it)) ui.toast('Bag full: it went to your loot pile', { icon: 'bag' });
          g.audio.play('coins');
          this.fly(it, { x: ui.w / 2 + 70, y: ui.h - 120 });
          this.npcSay(rnd.pick(['Pleasure doing business!', 'Good choice! Probably!', 'Hehehe, coins!']));
          if (it.id === 'recipe_scroll') ui.toast('Right-click scrolls in your bag to read them', { icon: 'recipe' });
        }
      }
    } else {
      const it = this.rugItems(ui, run.bag.items.slice(0, 18), {
        id: 'sell', cx: ui.w / 2 + 70, w: 460, color: '#2e4a5a',
        label: (x) => ({ text: '+' + itemValue(x), color: '#5a3a08' }),
        tip: (x) => `\n{gold}Sells for ${itemValue(x)}{/}`, empty: 'Your bag is empty.',
      });
      if (it) { const v = itemValue(it); run.removeItem(it); run.coins += v; g.audio.play('coin'); this.npcSay(rnd.pick(['Ooh, I\'ll take it!', 'Mossworth loves junk. Er, treasure.', 'Into the pile!'])); }
    }
    if (this.moveOn(ui, 'Move on') || g.input.actionPressed('back')) this.leaveWithLoot('Purchases');
    if (this.npcBubble) {
      const p = this.proj(this.npcPos.clone().add(new THREE.Vector3(0, 1.1, 0)), ui);
      speech(ui, p.x, p.y, this.npcBubble.text, { maxW: 140, alpha: clamp(this.npcBubble.t * 3, 0, 1) });
    }
    this.drawBubble(ui);
    this.drawFrame(ui);
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
      const anchor = a['chest' + (n === 2 ? i * 2 : i)];
      const pos = anchor ? anchor.clone() : new THREE.Vector3(a.center.x + (i - (n - 1) / 2) * 1.5, 0, a.center.z - 0.3);
      const isMimic = i === mimicIdx;
      let obj;
      if (isMimic) { obj = buildMonster('mimic'); obj.play('disguise'); obj.group.position.copy(pos); obj.group.rotation.y = Math.PI / 2; this.w.scene.add(obj.group); }
      else { obj = buildProp('chest', { kind: k }); obj.position.copy(pos); this.w.scene.add(obj); }
      return { kind: isMimic ? 'wood' : k, mimic: isMimic, obj, pos, opened: false, inspected: false, tell: rng.pick(['blinks', 'drools', 'breathes', 'twitches']) };
    });
    this.hero.group.position.copy(a.player || new THREE.Vector3(a.center.x - 2.4, 0, a.center.z + 0.9));
    this.hero.group.rotation.y = Math.PI / 2;
    this.w.rig.cut([a.center.x - 0.3, 2.3, a.center.z + 6.6], [a.center.x - 0.3, 0.5, a.center.z], 40);
    this.sel = null;
    if (run.char === 'clover' && mimicIdx >= 0) this.say('*sniff sniff* …one of these smells like teeth.');
    else this.say(bark(run.char, 'mine'));
    this.narrate(`${n === 3 ? 'Three' : 'Two'} chests sit in the lamplight. Gold glitters on the floor. It's quiet… too quiet?`);
  }
  update(dt) {
    this.tick(dt);
    for (const c of this.chests) {
      if (c.mimic) { c.obj.update(dt); if (!c.revealed) c.obj.group.scale.y = 1 + Math.sin(this.time * 2.2) * 0.012; }
      else if (c.obj.userData.update) c.obj.userData.update(dt, this.time);
    }
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
    const sp = this.proj(c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), g.ui);
    g.ui.float(`+${gained}`, sp.x, sp.y - 30, { big: true, scale: 2, top: '#fff6c8', bottom: '#ffd25e' });
    for (const it of loot.items) { run.bag.toOverflow(it); this.fly(it, sp); }
    this.narrate(loot.items.length ? `Inside: ${loot.items.map((it) => `{${matOf(it).rarity}}${matOf(it).name}{/}`).join(', ')} and ${gained} coins.` : `Just ${gained} coins. Still counts.`);
    this.hero.play('cheer', { onDone: () => this.hero.play('idle', { loop: true }) });
    this.say(bark(run.char, 'win'));
  }
  mimicAttack(c) {
    c.revealed = true;
    const g = this.game;
    g.audio.play('mimic_reveal');
    c.obj.play('intro');
    this.w.rig.shake(0.6);
    this.hero.setExpression && this.hero.setExpression('surprised');
    this.say('IT\'S A MIMIC!', 'hero', 2);
    this.narrate('{bad}The chest grins. It has a LOT of teeth.{/}');
    this.co.start(function* () { yield 1.1; g.go('combat', { node: this.node, monster: 'mimic', fromTreasure: true }, { transition: 'dither' }); }.bind(this));
  }
  draw(ui) {
    const g = this.game, run = this.run;
    for (const c of this.chests) {
      const p = this.proj(c.pos.clone().add(new THREE.Vector3(0, 0.75, 0)), ui);
      if (c.opened || c.revealed) continue;
      const hit = ui.hit('chest' + c.pos.x, p.x - 36, p.y - 6, 72, 64, { sound: false });
      const lock = CHESTS[c.kind].lock;
      if (hit.hover && this.sel !== c) {
        ui.ctx.save(); ui.ctx.globalCompositeOperation = 'lighter'; ui.ctx.globalAlpha = 0.3; ui.ctx.drawImage(glowCanvas(40, '#ffd27a'), p.x - 40, p.y - 20); ui.ctx.restore();
        this.tag(ui, null, p.x, p.y - 34, `${CHESTS[c.kind].name}${lock ? ' (locked)' : ''}`, { icon: lock ? 'lock' : null });
      }
      if (c.inspected) this.tag(ui, null, p.x, p.y + 58, c.detected ? `It ${c.tell}!` : c.kicked ? 'Just a chest.' : 'Seems safe…', { color: c.detected ? '#a02020' : '#3a5a20' });
      if (hit.clicked) { this.sel = this.sel === c ? null : c; g.audio.play('ui_pop'); }
    }
    if (this.sel && !this.sel.opened && !this.sel.revealed) {
      // walk up to the chest: what do you do? Choices sprout as tags above it
      const c = this.sel;
      const p = this.proj(c.pos.clone().add(new THREE.Vector3(0, 0.75, 0)), ui);
      const key = this.keyFor(c.kind), lock = CHESTS[c.kind].lock;
      const acts = [];
      if (!lock) acts.push(['open', 'Open it', 'chest']);
      else {
        acts.push(['key', key ? `Use ${MATERIALS[key.id].name}` : 'No key', 'key', !key]);
        acts.push(['pry', run.char === 'clover' ? 'Pick the lock' : 'Pry it open (-1 quality)', 'tool']);
      }
      if (!c.inspected) acts.push(['inspect', 'Look closer', 'eye']);
      acts.push(['kick', 'Kick it', null]);
      acts.forEach(([id, label, icon, off], i) => {
        const h = this.tag(ui, 'act' + id, p.x, p.y - 40 - (acts.length - i) * 26, label, { icon, dim: off });
        if (!h.clicked || off) return;
        this.sel = null;
        if (id === 'open') this.open(c);
        else if (id === 'key') { run.removeItem(key); g.audio.play('key_unlock'); this.open(c); }
        else if (id === 'pry') this.open(c, run.char === 'clover' ? 'open' : 'pry');
        else if (id === 'inspect') { c.inspected = true; c.detected = c.mimic && (rnd.chance(0.6) || run.char === 'clover'); if (c.detected) g.audio.play('qte_prompt'); }
        else if (id === 'kick') {
          if (c.mimic) this.mimicAttack(c);
          else { run.hurt(3); g.audio.play('hurt'); this.hero.play('hurt', { onDone: () => this.hero.play('idle', { loop: true }) }); this.say('OW. Just a chest.'); c.inspected = true; c.kicked = true; if (run.hp <= 0) gameOver(g, 'Stubbed toe'); }
        }
      });
      if (g.input.actionPressed('back')) this.sel = null;
    }
    if (this.moveOn(ui, 'Move on')) this.leaveWithLoot('Treasure');
    this.drawBubble(ui);
    this.drawFrame(ui);
  }
}

// ============================================================================ CAMP
export class CampScene extends RoomBase {
  enter(p) {
    this.setup('camp', { music: 'campfire' });
    const a = this.set.anchors;
    const fire = a.fire || a.center;
    this.fire = fire.clone();
    this.anvil = (a.anvil || fire.clone().add(new THREE.Vector3(1.6, 0, 0.5))).clone();
    if (a.seat) this.hero.group.position.copy(a.seat).y -= 0.32;
    else this.hero.group.position.copy(fire).add(new THREE.Vector3(-1.2, 0, 0.4));
    this.hero.group.lookAt(fire.x, this.hero.group.position.y, fire.z);
    this.hero.setSeated && this.hero.setSeated(true, 0.32);
    this.hero.play('sit', { loop: true });
    this.w.rig.cut([fire.x + 0.3, 1.8, fire.z + 5.4], [fire.x - 0.1, 0.55, fire.z], 38);
    this.crackle = this.game.audio.loop('campfire');
    this.chosen = null;
    this.say('A safe spot. Finally.');
    this.narrate('A campsite. The embers are still warm. You have time for one thing: rest, temper or smelt.');
    this.picking = null;
  }
  exit() { this.crackle && this.crackle.stop(1); }
  update(dt) { this.tick(dt); }
  draw(ui) {
    const g = this.game, run = this.run;
    if (!this.chosen) {
      const heal = Math.round(run.maxHp * 0.35);
      const spots = [
        { id: 'rest', at: this.hero.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), label: `Rest: heal ${heal} HP`, icon: 'heart', tip: 'Lie down by the fire.' },
        { id: 'temper', at: this.anvil.clone().add(new THREE.Vector3(0, 0.8, 0)), label: 'Temper on the anvil', icon: 'hammer', tip: 'Raise the quality of up to 2 materials.' },
        { id: 'smelt', at: this.fire.clone().add(new THREE.Vector3(0, 0.9, 0)), label: 'Smelt in the coals', icon: 'forge', tip: 'Melt 3 identical materials into 1 rarer one.' },
      ];
      for (const s of spots) {
        const p = this.proj(s.at, ui);
        const h = this.tag(ui, 'camp' + s.id, p.x, p.y - 20 + Math.round(Math.sin(this.time * 2 + p.x) * 2), s.label, { icon: s.icon });
        if (h.hover) ui.tooltip({ body: s.tip, w: 160 });
        if (h.clicked) this.choose(s.id);
      }
    } else if (this.chosen === 'temper' || this.chosen === 'smelt') this.drawPicker(ui);
    else if (this.moveOn(ui, 'Move on')) this.leaveWithLoot('Camp');
    this.drawBubble(ui);
    this.drawFrame(ui);
  }
  choose(id) {
    const g = this.game, run = this.run;
    this.chosen = id;
    if (id === 'rest') {
      const n = run.heal(Math.round(run.maxHp * 0.35));
      g.audio.play('heal');
      g.ui.float(`+${n}`, g.ui.w / 2, g.ui.h / 2, { big: true, top: '#d8ffe0', bottom: '#6dff9a' });
      this.hero.play('sleep', { loop: true });
      this.hero.setExpression && this.hero.setExpression('sleepy');
      this.say('Zzz…');
      this.narrate(`You sleep by the fire. {heal}+${n} HP.{/}`);
    } else {
      this.picking = { left: id === 'temper' ? 2 : 1, picked: [] };
      this.narrate(id === 'temper' ? 'Pick up to two materials to temper on the anvil.' : 'Pick a material you have three of. The coals will melt them into something rarer.');
      this.hero.setSeated && this.hero.setSeated(false);
      this.hero.play(id === 'temper' ? 'hammer' : 'forge', { loop: true });
    }
  }
  drawPicker(ui) {
    const g = this.game, run = this.run;
    const seen = new Set();
    const items = run.bag.items.filter((it) => {
      if (this.chosen === 'temper') return it.q < 4;
      const ok = run.bag.items.filter((o) => o.id === it.id).length >= 3 && RARITY[matOf(it).rarity].order < 4;
      if (!ok || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    const it = this.rugItems(ui, items.slice(0, 18), {
      id: 'pick', cx: ui.w / 2, w: 480, color: '#3a3a2a', coin: false,
      label: (x) => ({ text: this.chosen === 'temper' ? `${QUALITY[x.q].name} → ${QUALITY[Math.min(4, x.q + 1)].name}` : `×${run.bag.items.filter((o) => o.id === x.id).length}` }),
      empty: 'Nothing suitable in your bag.',
    });
    if (it) {
      if (this.chosen === 'temper') {
        it.q++; g.audio.play('anvil_ring'); this.picking.left--;
        this.w.sparks.emit({ pos: [this.anvil.x, this.anvil.y + 0.7, this.anvil.z], radial: [0.8, 2], radialUp: 1.4, count: 18, life: [0.2, 0.6], size: 1, color: ['#fff0b0', '#ffb040'], glow: 4, gravity: 6 });
        this.narrate(`${MATERIALS[it.id].name} is now {gold}${QUALITY[it.q].name}{/}.${this.picking.left > 0 ? ' One more?' : ''}`);
      } else {
        const same = run.bag.items.filter((o) => o.id === it.id).slice(0, 3);
        for (const o of same) run.removeItem(o);
        const order = RARITY[matOf(it).rarity].order + 1;
        const pool = Object.values(MATERIALS).filter((m) => m.regions && RARITY[m.rarity].order === order && m.kind !== 'part' && !m.unlock);
        const out = makeItem(rnd.pick(pool).id, 2);
        run.addItem(out);
        g.audio.play('metal_pour');
        this.narrate(`The coals roar. Three ${MATERIALS[it.id].name} melt into {${MATERIALS[out.id].rarity}}${MATERIALS[out.id].name}{/}!`);
        this.picking.left = 0;
      }
      if (this.picking.left <= 0) { this.chosen = 'done'; this.say(bark(run.char, 'forge')); this.hero.play('cheer', { onDone: () => this.hero.play('idle', { loop: true }) }); }
    }
    if (this.moveOn(ui, 'Done')) { this.chosen = 'done'; this.hero.play('idle', { loop: true }); }
  }
}
