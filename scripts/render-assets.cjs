// Use an existing Playwright installation; this is release tooling, not extension code.
// PLAYWRIGHT_MODULE=/path/to/playwright node scripts/render-assets.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
  const output = path.join(root, 'store_assets', `v${manifest.version}`);
  await fs.mkdir(output, { recursive: true });
  const mark = await fs.readFile(path.join(root, 'extension/icons/mark.svg'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || undefined, headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const render = async (html, width, height, destination, transparent = false) => {
      await page.setViewportSize({ width, height });
      await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}svg{display:block}</style>${html}`);
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await page.screenshot({ path: destination, omitBackground: transparent });
      const png = await fs.readFile(destination);
      assert.equal(png.readUInt32BE(16), width);
      assert.equal(png.readUInt32BE(20), height);
    };
    // Chrome's store icon guidance: 96px artwork with 16px transparent padding at 128px.
    for (const size of [16, 32, 48, 128]) {
      const file = path.join(root, 'extension/icons', `icon${size}.png`);
      await render(`<div style="padding:12.5%;width:100%;height:100%">${mark}</div>`, size, size, file, true);
    }
    await fs.copyFile(path.join(root, 'extension/icons/icon128.png'), path.join(output, 'icon_128x128.png'));
    const design = (large) => `<main style="position:relative;width:100%;height:100%;background:#006b50;color:#f7faf5;overflow:hidden">
      <div style="position:absolute;width:${large ? 640 : 260}px;height:${large ? 640 : 260}px;right:${large ? -140 : -80}px;top:${large ? -260 : -128}px;border-radius:35% 65% 52% 48%;background:#b9f3d4;transform:rotate(-18deg)"></div>
      <div style="position:absolute;width:${large ? 220 : 90}px;height:${large ? 220 : 90}px;right:${large ? 145 : 30}px;bottom:${large ? -110 : -45}px;border-radius:50%;background:#f6e69f"></div>
      <div style="position:absolute;left:${large ? 92 : 29}px;top:${large ? 74 : 25}px;width:${large ? 176 : 108}px;height:${large ? 176 : 108}px">${mark}</div>
      <div style="position:absolute;left:${large ? 96 : 36}px;bottom:${large ? 93 : 41}px;font-size:${large ? 98 : 49}px;font-weight:750;letter-spacing:${large ? -5 : -2.5}px;line-height:1">FrameDeck</div>
      ${large ? '<div style="position:absolute;left:100px;bottom:47px;font-size:26px;letter-spacing:.2px;color:#b9f3d4">A slide deck of webpages.</div>' : ''}
    </main>`;
    await render(design(false), 440, 280, path.join(output, 'promo_tile_440x280.png'));
    await render(design(true), 1400, 560, path.join(output, 'marquee_1400x560.png'));
    // Compose the original captured control-panel PNGs without recreating or editing their UI.
    const captures = [
      { source: 'popup-light.png', name: 'setup', label: 'FREE CHROME EXTENSION', headline: 'A slide deck<br>of webpages.', points: ["Works with pages that block embedding.", 'Set how long each page is shown.'] },
      { source: 'popup-playing.png', name: 'playing', label: 'PLAYBACK CONTROLS', headline: 'Pause on the<br>tab you need.', points: ['Resume with the time remaining.', 'Use the arrows to change tabs.'] },
    ];
    for (const capture of captures) {
      let png;
      try { png = await fs.readFile(path.join(root, 'artifacts', capture.source)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const scale = png.readUInt32BE(16) / 420;
      assert([1, 2].includes(scale), 'Expected a 420px control-panel capture at 1x or 2x');
      assert.equal(png.readUInt32BE(20), 600 * scale, 'Expected a full 600px control-panel capture');
      const html = `<main style="position:relative;width:1280px;height:800px;background:#f7faf5;color:#17251f">
        <div style="position:absolute;left:650px;top:0;width:630px;height:800px;background:#006b50"></div>
        <div style="position:absolute;left:-86px;bottom:-215px;width:410px;height:410px;background:#b9f3d4;border-radius:38% 62% 49% 51%;transform:rotate(20deg)"></div>
        <div style="position:absolute;left:72px;top:68px;display:flex;align-items:center;gap:14px;font-size:31px;font-weight:750;letter-spacing:-1px"><div style="width:52px;height:52px">${mark}</div>FrameDeck</div>
        <div style="position:absolute;left:72px;top:202px;font-size:13px;letter-spacing:2.2px;font-weight:750;color:#006b50">${capture.label}</div>
        <h1 style="position:absolute;left:68px;top:239px;margin:0;font-size:64px;line-height:1.02;font-weight:750;letter-spacing:-3.2px">${capture.headline}</h1>
        <div style="position:absolute;left:74px;top:439px;display:grid;gap:23px;font-size:22px;color:#53635a">${capture.points.map(point => `<div style="display:flex;align-items:center;gap:14px"><span style="width:10px;height:10px;border-radius:50%;background:#006b50"></span>${point}</div>`).join('')}</div>
        <div style="position:absolute;left:74px;bottom:49px;font-size:13px;color:#53635a">FrameDeck with example tabs</div>
        <img src="data:image/png;base64,${png.toString('base64')}" alt="Captured FrameDeck controls" style="position:absolute;left:708px;top:40px;width:504px;height:720px;box-shadow:0 14px 48px #00382666">
      </main>`;
      await render(html, 1280, 800, path.join(output, `screenshot-${capture.name}.png`));
    }
    console.log(`Rendered icons, promotional art, and available captured screenshots in ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
