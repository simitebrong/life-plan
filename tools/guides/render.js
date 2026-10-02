// Renders build/*.html to ../../guides/<id>.pdf and build/<id>.png
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const build = path.join(__dirname, 'build'); const out = path.join(__dirname, '..', '..', 'guides');
  fs.mkdirSync(out, { recursive: true });
  const ids = JSON.parse(fs.readFileSync(path.join(build, 'ids.json')));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 480, height: 200 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  for (const id of ids) {
    await p.goto('file://' + path.join(build, id + '.html'));
    await p.evaluate(() => document.fonts.ready);
    const h = await p.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
    await p.screenshot({ path: path.join(build, id + '.png'), fullPage: true });
    await p.pdf({ path: path.join(out, id + '.pdf'), width: '480px', height: (h + 1) + 'px', printBackground: true, pageRanges: '1' });
  }
  await b.close(); console.log('rendered', ids.length);
})();
