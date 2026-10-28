import { Game } from '../../src/core/game.js';
import { SpritePreview } from '../../src/scenes/preview_sprites.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', SpritePreview);
g.go('p', Object.fromEntries(new URLSearchParams(location.search)), { transition: 'none' });
g.start();
window.FORGLITE = g;
