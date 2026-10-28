import { Game } from '../../src/core/game.js';
import { PropPreview } from '../../src/scenes/preview_props.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', PropPreview);
g.go('p', {}, { transition: 'none' });
g.start();
window.FORGLITE = g;
