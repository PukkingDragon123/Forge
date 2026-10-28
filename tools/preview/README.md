Isolated preview entries. Each `*.entry.js` builds a Game with one preview scene:

```js
import { Game } from '../../src/core/game.js';
import { MyPreview } from '../../src/scenes/preview_x.js';
const g = new Game(document.getElementById('stage'), null);
g.register('p', MyPreview); g.go('p', {}, { transition: 'none' }); g.start(); window.FORGLITE = g;
```
Run: `node tools/preview.mjs tools/preview/x.entry.js /path/out.png "query" 3000`
