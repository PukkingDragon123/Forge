import { Game } from '../../src/core/game.js';
import { CharPreview } from '../../src/scenes/preview_chars.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', CharPreview); g.go('p', {}, { transition: 'none' }); g.start(); window.FORGLITE = g;
