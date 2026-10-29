import { Game } from '../../src/core/game.js';
import { StageVoxPreview } from '../../src/scenes/preview_stagevox.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', StageVoxPreview);
g.go('p', Object.fromEntries(new URLSearchParams(location.search).entries()), { transition: 'none' });
g.start();
window.FORGLITE = g;
