// Scene registry.
import { TitleScene } from './title.js';
import { CrossroadsScene } from './crossroads.js';
import { TravelScene } from './travel.js';
import { EventScene } from './event.js';
import { MiningScene } from './mining.js';
import { CombatScene } from './combat.js';
import { MerchantScene } from './rooms.js';
import { TreasureScene } from './treasure.js';
import { CampScene } from './camp.js';
import { DelveScene } from './delve.js';
import { VeinScene } from './vein.js';
import { OldMapScene } from './oldmap.js';
import { DescendScene, GameOverScene, VictoryScene } from './endings.js';
import { BagOverlay } from './bag.js';
import { PauseOverlay } from './pause.js';
import { RevealOverlay } from './reveal.js';
import { TestScene } from './test.js';
import { ForgeTestScene } from './forgetest.js';
import { CutsceneScene } from './cutscene.js';

export function registerScenes(game) {
  game.register('title', TitleScene);
  game.register('map', CrossroadsScene);
  game.register('travel', TravelScene);
  game.register('delve', DelveScene);
  game.register('vein', VeinScene);
  game.register('oldmap', OldMapScene);
  game.register('event', EventScene);
  game.register('mining', MiningScene);
  game.register('combat', CombatScene);
  game.register('merchant', MerchantScene);
  game.register('treasure', TreasureScene);
  game.register('camp', CampScene);
  game.register('descend', DescendScene);
  game.register('gameover', GameOverScene);
  game.register('victory', VictoryScene);
  game.register('bag', BagOverlay);
  game.register('pause', PauseOverlay);
  game.register('reveal', RevealOverlay);
  game.register('test', TestScene);
  game.register('cutscene', CutsceneScene);
  game.register('forgetest', ForgeTestScene);
}
