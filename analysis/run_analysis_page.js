// Run the analysis page headless on a folder of participant zips and save the page text.
// Serve dist/ first (any static server; the page reads the zips locally and needs no password for that).
//
//   node analysis/run_analysis_page.js http://localhost:8787/gripspread_analysis.html <folder with zips> <out.txt>
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const [url, dir, out] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.zip')).sort().map(f => dir + '/' + f);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.setInputFiles('#files', files);
  let text = '';
  for (let i = 0; i < 60; i++) {                       // wait until the report has rendered
    await page.waitForTimeout(3000);
    text = await page.evaluate(() => document.body.innerText);
    if (text.includes('Holm') && text.length > 20000) break;
  }
  await page.waitForTimeout(5000);
  text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(out, text);
  console.log(files.length, 'zips,', text.length, 'chars', errors.length ? errors : '');
  await browser.close();
})();
