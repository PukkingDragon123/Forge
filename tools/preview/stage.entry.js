import { Game } from '../../src/core/game.js';
import { StagePreview } from '../../src/scenes/preview_stage.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', StagePreview);
g.go('p', Object.fromEntries(new URLSearchParams(location.search).entries()), { transition: 'none' });
g.start();
window.FORGLITE = g;
