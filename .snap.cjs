const { chromium } = require('playwright');
(async () => {
  const [page_, query, out, wait = '9000', W = '1280', H = '720', evalJs = ''] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('file://' + page_ + '?' + query);
  await page.waitForTimeout(1500);
  if (evalJs) await page.evaluate(evalJs);
  await page.waitForTimeout(+wait);
  const t0 = Date.now();
  await page.screenshot({ path: out, timeout: 180000 });
  console.log('shot ms', Date.now() - t0, 'fps', await page.evaluate(() => window.FORGLITE && window.FORGLITE.fps.toFixed(1)));
  await browser.close();
})();
