import { Game } from '../../src/core/game.js';
import { PreviewMonsters } from '../../src/scenes/preview_monsters.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', PreviewMonsters); g.go('p', {}, { transition: 'none' }); g.start(); window.FORGLITE = g;
