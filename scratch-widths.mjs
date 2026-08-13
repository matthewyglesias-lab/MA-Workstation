import { chromium } from '@playwright/test';
import fs from 'node:fs';

const outDir = '/tmp/claude-0/-home-user-MA-Workstation/4dcd19d3-88c9-5ef9-a56a-9bb81e9cf042/scratchpad/widths-check';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const widths = [1440, 1200, 1181, 1100, 1040, 1000, 900, 841, 800];
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.click('text=Injection >> nth=0').catch(()=>{});
  await page.click('text=Start new injection', { timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(600);
  const el = await page.$('.cd2004-record-actions');
  if (el) {
    await el.screenshot({ path: `${outDir}/w${width}.png` }).catch((e)=>console.log(width, 'shot failed', e.message));
  } else {
    console.log(width, 'record-actions not found');
  }
  await page.close();
}

await browser.close();
console.log('done');
