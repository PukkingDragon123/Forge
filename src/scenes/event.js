// Mystery event: a dressed 3D room + a hand-drawn storybook page with choices, QTEs and item pickers.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildStage as buildSet } from '../models/stage2d.js';
import { buildCharacter } from '../models/characters.js';
import * as Props from '../models/props.js';
import { buildMonster } from '../models/monsters.js';
import { makeWorld, hud, speech, ambientDust } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { EVENTS } from '../data/events.js';
import { REGIONS } from '../data/regions.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { RECIPES } from '../data/blueprints.js';
import { makeItem, matOf, itemTooltip } from '../systems/items.js';
import { materialCard } from '../ui/cards.js';
import { materialSprite } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { clamp, ease } from '../core/math.js';
import { TimingQTE, MashQTE, ShellGame } from './travel_qte.js';

const PROP_ALIAS = { rubble: 'rock', silk: 'web' };
const NPC_MONSTER = { mole: ['mole_brute', 0.55], snail: ['moss_snail', 1.0], kobold: ['kobold', 1.0] };

function safeProp(name, opts) {
  if (Props.PROP_NAMES && !Props.PROP_NAMES.includes(name)) return null;
  try { return Props.buildProp(name, opts); } catch (e) { return null; }
}

export class EventScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.node = params.node || null;
    this.ev = EVENTS.find((e) => e.id === params.event) || EVENTS[0];
    this.region = run ? run.region : 0;
    this.rng = run ? run.rng.fork('event' + this.ev.id + (this.node ? this.node.id : '')) : null;
    const R = REGIONS[this.region];
    this.set = buildSet('room', this.region, { room: 'event' });
    this.world = makeWorld(this.set, { fogDensity: 0.04 });
    this.rig = this.world.rig;
    this.extra = new THREE.Group();
    this.world.scene.add(this.extra);
    const A = this.set.anchors || {};
    const center = A.center ? A.center.clone() : new THREE.Vector3(0, 0, 0);
    this.center = center;
    const pp = new THREE.Vector3(center.x - 0.85, A.player ? A.player.y : center.y, center.z + 0.6);
    this.char = buildCharacter(run ? run.char : 'clover');
    this.char.group.position.copy(pp);
    this.char.group.rotation.y = Math.PI / 2 - 0.5;
    this.world.scene.add(this.char.group);
    this.char.play('idle', { loop: true });
    this.monsters = [];
    this.dress(center);

    const cp = new THREE.Vector3().copy(center);
    this.camBase = { pos: [cp.x + 0.4, cp.y + 2.1, cp.z + 6.0], look: [cp.x + 0.4, cp.y + 0.35, cp.z - 0.2] }; // centred: the narration sits below
    this.rig.cut(this.camBase.pos, this.camBase.look, 38);

    this.phase = 'intro';
    this.text = this.ev.text;
    this.typed = 0;
    this.results = [];      // lines shown on the result page
    this.gained = [];       // items gained (for cards)
    this.qte = null;
    this.picker = null;
    this.pendingFight = null;
    this.bubble = null;
    this.done = false;
    game.audio && game.audio.music(R.music);
    game.audio && game.audio.play('page_turn');
  }

  exit() { this.game.timeScale = 1; }

  dress(center) {
    const props = this.ev.props || [];
    const slots = [[0.5, 0, -0.6], [1.5, 0, -1.0], [-0.1, 0, -1.5], [1.9, 0, -0.1], [-0.6, 0, -1.9]];
    let si = 0;
    const npc = this.ev.npc && NPC_MONSTER[this.ev.npc];
    const place = (obj, s) => { obj.position.set(center.x + s[0], center.y + s[1], center.z + s[2]); this.extra.add(obj); };
    for (const name of [...(npc ? [this.ev.npc] : []), ...props]) {
      const s = slots[si++ % slots.length];
      if (NPC_MONSTER[name]) {
        try {
          const [id, sc] = NPC_MONSTER[name];
          const m = buildMonster(id);
          m.group.scale.setScalar(sc);
          place(m.group, [0.95, 0, -0.2]);
          m.group.rotation.y = -0.3;
          m.play('idle');
          this.monsters.push(m);
          si--;
        } catch (e) { /* model not ready */ }
        continue;
      }
      if (name === 'rubble') {
        for (let i = 0; i < 4; i++) { const r = safeProp('rock', { size: 0.5 + i * 0.1 }); if (r) { place(r, [s[0] + (i - 1.5) * 0.35, 0, s[2] + (i % 2) * 0.3]); r.rotation.y = i; } }
        const lan = safeProp('pickaxe', {}); if (lan) { place(lan, [s[0] + 0.8, 0, s[2] + 0.4]); lan.rotation.z = 1.2; }
        continue;
      }
      const obj = safeProp(PROP_ALIAS[name] || name, name === 'waterpool' ? { size: 1.6 } : {});
      if (obj) place(obj, s);
    }
  }

  // ------------------------------------------------------------------ outcomes
  choose(c) {
    const run = this.game.run;
    const rng = this.rng;
    this.game.audio && this.game.audio.play('click');
    const out = c.out(run, rng) || {};
    this.apply(out);
  }

  apply(out) {
    const game = this.game, run = game.run, rng = this.rng;
    if (out.qte) { this.startQTE(out.qte); if (out.text) this.results.push(out.text); return; }
    if (out.pick) { this.openPicker(out.pick); return; }
    const lines = [];
    let mood = 'neutral';
    if (out.text) this.text = out.text;
    if (out.gain) for (const [id, q] of out.gain) {
      if (!MATERIALS[id]) continue;
      const it = makeItem(id, q ?? 2);
      run.addItem(it);
      this.gained.push(it);
      mood = 'good';
      game.audio && game.audio.play(RARITY[MATERIALS[id].rarity].order >= 2 ? 'ore_rare' : 'ore_common');
    }
    if (out.coins) {
      if (out.coins > 0) { const c = run.gain(out.coins); lines.push(`{gold}+${c} coins{/}`); mood = 'good'; game.audio && game.audio.play('coins'); }
      else { const c = Math.min(run.coins, -out.coins); run.coins -= c; lines.push(`{bad}-${c} coins{/}`); mood = 'bad'; }
    }
    if (out.maxHp) { run.maxHp += out.maxHp; lines.push(`{good}+${out.maxHp} max HP{/}`); }
    if (out.hp) {
      if (out.hp > 0) { const h = run.heal(out.hp); lines.push(`{heal}+${h} HP{/}`); game.audio && game.audio.play('heal'); if (mood !== 'bad') mood = 'good'; }
      else { run.hurt(-out.hp); lines.push(`{bad}${out.hp} HP{/}`); mood = 'bad'; game.audio && game.audio.play('hurt'); this.rig.shake(0.4); game.renderer.doFlash(0.25, [1, 0.3, 0.2]); }
    }
    if (out.learn) {
      const id = out.learn === true ? run.unknownRecipe(rng || undefined) : out.learn;
      if (id && RECIPES[id]) {
        const fresh = run.learnRecipe(id);
        lines.push(`{gold}Recipe learned: ${RECIPES[id].name}{/}`);
        game.ui.toast(`${fresh ? 'New recipe' : 'Recipe'}: ${RECIPES[id].name}`, { icon: 'recipe', color: COLORS.gold });
        game.audio && game.audio.play('recipe_discover');
        mood = 'good';
      } else lines.push('{dim}You already know every secret written here.{/}');
    }
    if (out.fight) { this.pendingFight = out.fight; mood = 'bad'; game.audio && game.audio.play('monster_growl'); }
    this.results.push(...lines);
    this.react(mood);
    this.phase = 'result';
    this.typed = 0;
    if (run.hp <= 0) { this.phase = 'dead'; this.co.start(function* () { yield 1.4; gameOver(game, this.ev.title); }.bind(this)); }
  }

  react(mood) {
    const ch = this.char;
    if (mood === 'good') { ch.play('cheer', { onDone: () => ch.play('idle', { loop: true }) }); ch.setExpression('happy'); }
    else if (mood === 'bad') { ch.play('hurt', { onDone: () => ch.play('idle', { loop: true }) }); ch.setExpression('hurt'); }
    else { ch.play('shrug', { onDone: () => ch.play('idle', { loop: true }) }); ch.setExpression('neutral'); }
  }

  startQTE(q) {
    const game = this.game;
    const pos = () => ({ x: Math.round((game.ui.w - 262) / 2), y: Math.round(game.ui.h / 2) });
    let obj;
    if (q.kind === 'mash') obj = new MashQTE(game, { label: q.label, need: 12, dur: 3.4, pos });
    else if (q.kind === 'shells') obj = new ShellGame(game, { rng: this.rng, cx: pos().x, cy: pos().y });
    else obj = new TimingQTE(game, { action: 'strike', label: q.label, dur: 1.1, window: 0.16, pos });
    this.qte = { obj, def: q, resolved: false, linger: 0 };
    this.phase = 'qte';
    this.char.setExpression('determined');
  }

  openPicker(pick) {
    const run = this.game.run;
    const items = run.bag.all().filter((it) => { try { return pick.filter({ ...matOf(it), ...it }); } catch (e) { return false; } });
    if (!items.length) {
      this.text = 'You rummage through your pack, but have nothing suitable.';
      this.typed = 0;
      this.phase = 'choose';
      return;
    }
    this.picker = { pick, items };
    this.phase = 'pick';
  }

  continueOn() {
    const game = this.game;
    if (this.done) return;
    this.done = true;
    if (this.pendingFight) { game.go('combat', { node: this.node, monster: this.pendingFight, fromEvent: true }, { transition: 'dither' }); return; }
    const go = () => { if (this.node) finish(game); else game.go('map', {}); };
    if (game.run && game.run.bag.overflow.length) openBag(game, { title: 'Loot', onClose: go });
    else go();
  }

  // ------------------------------------------------------------------ loop
  update(dt, rdt) {
    if (this.set.update) this.set.update(dt, this.time);
    if (Props.tickProps) Props.tickProps(this.extra, dt, this.time, { add: this.world.sparks, alpha: this.world.dust });
    this.char.update(dt);
    for (const m of this.monsters) m.update(dt);
    this.world.sparks.update(dt);
    this.world.dust.update(dt);
    const b = this.camBase;
    const sway = Math.sin(this.time * 0.25) * 0.35;
    const q = this.phase === 'qte' ? 1 : 0;
    this.rig.aim([b.pos[0] + sway - q * 0.5, b.pos[1] - q * 0.25, b.pos[2] - q * 0.9], [b.look[0] - q * 0.6, b.look[1], b.look[2]], q ? 34 : 38, 1.5);
    this.rig.update(dt);
    ambientDust(this.world, [this.center.x + 0.5, this.center.y + 1.4, this.center.z], [3, 1.2, 1.5], REGIONS[this.region].pal.glow2, 0.25);
    this.typed += rdt * 70;

    if (this.qte) {
      const st = this.qte.obj.update(rdt);
      if (st !== 'pending' && !this.qte.resolved) { this.qte.resolved = true; this.qte.linger = 0.5; this.qte.win = st === 'win'; }
      if (this.qte.resolved) {
        this.qte.linger -= rdt;
        if (this.qte.linger <= 0) {
          const d = this.qte.def, win = this.qte.win;
          this.qte = null;
          this.apply((win ? d.win : d.lose) || { text: win ? 'Success!' : 'No luck.' });
        }
      }
    }
    this.game.timeScale = 1;
  }

  draw(ui) {
    const game = this.game, run = game.run;
    if (this.phase === 'qte' && this.qte) {
      hud(ui, game, { bag: false });
      const lx = Math.round((ui.w - 262) / 2);
      if (this.qte.def.kind === 'shells') ui.text(this.qte.def.label || '', lx, 44, { align: 'center', color: COLORS.gold, outline: '#140c10' });
      this.qte.obj.draw(ui);
      return;
    }
    // cinematic: the scene plays above, the narrator and your choices sit in the letterbox below
    this.lbT = Math.min(1, (this.lbT || 0) + ui.dt * 1.8);
    const fullText = this.text;
    const typing = this.phase === 'intro' || this.phase === 'result';
    const shown = typing && !fullText.includes('{') ? fullText.slice(0, Math.floor(this.typed)) : fullText;
    const textW = 620, x = Math.round(ui.w / 2 - textW / 2);
    const choices = this.ev.choices;
    const typedOut = this.typed >= fullText.length;
    let body = 22 + ui.layout(fullText, 'body', textW).length * 11 + 8;
    if (this.phase === 'choose' || this.phase === 'intro') body += choices.length * 16 + 4;
    if (this.phase === 'result') body += this.results.length * 11 + (this.gained.length ? 52 : 0) + 18;
    if (this.phase === 'pick') body += 70;
    const H = Math.round(Math.max(96, body + 10) * ease.outCubic(this.lbT));
    ui.rect(0, 0, ui.w, Math.round(32 * ease.outCubic(this.lbT)), '#050406');
    ui.rect(0, ui.h - H, ui.w, H, '#050406');
    for (let i = 0; i < 6; i++) ui.rect(0, ui.h - H - 6 + i, ui.w, 1, '#050406', (i + 1) / 7);
    const h = hud(ui, game, { bag: this.phase !== 'pick' });
    if (h.bagClicked && (this.phase === 'choose' || this.phase === 'intro' || this.phase === 'result')) openBag(game, {});
    if (this.lbT < 0.6) return;
    let y = ui.h - H + 10;
    ui.text(`{gold}${this.ev.title}{/}`, x, y, {});
    y += 14;
    const pageHit = ui.hit('event-page', 0, ui.h - H, ui.w, H, { cursor: false, sound: false });
    if (pageHit.clicked && typing && this.typed < fullText.length) this.typed = 9999;
    ui.text(shown, x, y, { maxW: textW, color: '#efe2c8' });
    y += ui.layout(fullText, 'body', textW).length * 11 + 8;
    if ((this.phase === 'intro' || this.phase === 'choose') && typedOut) {
      this.phase = 'choose';
      choices.forEach((c, i) => {
        const req = c.req ? c.req(run) : true;
        const disabled = req !== true;
        const label = `${i + 1}. ${c.label}`;
        const lw = ui.measure(label) + 12;
        const hh = ui.hit('evc' + i, x - 4, y - 2, Math.max(lw, 300), 14, { sound: false, cursor: disabled ? 'arrow' : 'hand' });
        const col = disabled ? '#6a6058' : hh.hover ? '#ffe2a0' : '#d8c8b0';
        if (hh.hover && !disabled) ui.text('›', x - 10 + Math.round(Math.sin(this.time * 8)), y, { color: '#ffd27a' });
        ui.text(label, x + (hh.hover && !disabled ? 4 : 0), y, { color: col });
        const note = disabled ? req : c.hint;
        if (note) ui.text(`{dim}— ${note}{/}`, x + lw + 10, y, { font: 'small', color: disabled ? '#9a5a4a' : '#9a8a7a' });
        if (((hh.clicked) || game.input.keyPressed('Digit' + (i + 1))) && !disabled) { game.audio && game.audio.play('ui_pop'); this.choose(c); }
        y += 16;
      });
    }
    if (this.phase === 'result' && typedOut) {
      for (const l of this.results) { ui.text(l, x, y, { color: '#d8c8b0' }); y += 11; }
      if (this.gained.length) {
        this.gained.slice(0, 8).forEach((it, i) => {
          const sx = x + i * 74;
          const hh = ui.hit('evg' + it.uid, sx, y, 70, 46);
          ui.img(materialSprite(it.id, 40), sx, y + 2 - (hh.hover ? 2 : 0));
          ui.text(matOf(it).name, sx + 20, y + 40, { align: 'center', font: 'small', color: COLORS[matOf(it).rarity] || '#d8c8b0' });
          if (hh.hover) ui.tooltip(itemTooltip(it));
        });
        y += 52;
      }
      const label = this.pendingFight ? 'Fight!' : 'Continue';
      const hh = ui.hit('ev-continue', x - 4, y, 200, 14, { sound: false });
      ui.text(`${hh.hover ? '› ' : ''}${label}`, x, y + 2, { color: this.pendingFight ? '#ff8a7a' : '#ffe2a0' });
      ui.text('{dim}(space){/}', x + ui.measure(label) + 20, y + 2, { font: 'small' });
      if (hh.clicked || game.input.actionPressed('confirm')) this.continueOn();
    }
    if (this.phase === 'pick' && this.picker) this.drawPicker(ui, x, y);
  }

  drawPicker(ui, x, y) {
    const game = this.game, run = game.run;
    const { pick, items } = this.picker;
    ui.text(`Choose something to {gold}${pick.verb || 'use'}{/}:`, x, y, { color: '#d8c8b0' });
    y += 14;
    items.slice(0, 10).forEach((it, i) => {
      const sx = x + i * 58;
      const hh = ui.hit('pick' + it.uid, sx, y, 52, 44);
      ui.img(materialSprite(it.id, 40), sx + 4, y - (hh.hover ? 3 : 0));
      if (hh.hover) { ui.tooltip(itemTooltip(it)); const card = materialCard(it); ui.img(card, Math.round(clamp(sx + 24 - card.width / 2, 6, ui.w - card.width - 6)), y - card.height - 30); }
      if (hh.clicked) {
        this.picker = null;
        game.audio && game.audio.play('card_place');
        const out = pick.then(it, run, this.rng) || {};
        this.apply(out);
      }
    });
    const nv = ui.hit('pick-cancel', x + Math.min(10, items.length) * 58 + 10, y + 14, 90, 14, { sound: false });
    ui.text(`${nv.hover ? '› ' : ''}Never mind`, x + Math.min(10, items.length) * 58 + 10, y + 16, { color: nv.hover ? '#ffe2a0' : '#9a8a7a' });
    if (this.picker && (nv.clicked || game.input.actionPressed('back'))) { this.picker = null; this.phase = 'choose'; }
  }

}
