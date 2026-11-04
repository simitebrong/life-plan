// build/<id>.html -> build/<id>.png (440x492 at 2x)
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const build = path.join(__dirname, 'build'); const ids = JSON.parse(fs.readFileSync(path.join(build, 'ids.json')));
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 440, height: 492 }, deviceScaleFactor: 2 })).newPage();
  for (const id of ids) { await p.goto('file://' + path.join(build, id + '.html')); await p.screenshot({ path: path.join(build, id + '.png'), clip: { x: 0, y: 0, width: 440, height: 492 } }); }
  await b.close(); console.log('rendered', ids.length);
})();
