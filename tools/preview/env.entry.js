import { Game } from '../../src/core/game.js';
import { EnvPreview } from '../../src/scenes/preview_env.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', EnvPreview);
g.go('p', Object.fromEntries(new URLSearchParams(location.search).entries()), { transition: 'none' });
g.start();
window.FORGLITE = g;
