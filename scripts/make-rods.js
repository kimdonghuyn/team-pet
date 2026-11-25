// 🎣 도감 낚싯대 pictures: each rod (and from step 10 its sky) from scripts/rods-art.html, as a strip
// of 12 stills 200 ms apart, into client/assets/rods/ (rod-01.png … rod-15.png, sky-10.png …),
// with rods.json (each step's name, line and float colours, whether it has a sky) for the pet
// and the page. Needs Chrome or Edge; run after changing the designs: node scripts/make-rods.js
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { RODS } from '../server/fish.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'client', 'assets', 'rods');
const page = pathToFileURL(path.join(here, 'rods-art.html')).href;
const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  .find((p) => fs.existsSync(p));
if (!browser) throw new Error('Chrome 이나 Edge 가 있어야 그릴 수 있어요');
const FRAMES = 12, W = 250, H = 190;
fs.mkdirSync(out, { recursive: true });

const shot = (file, query) => {
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--window-size=${W * FRAMES},${H}`, '--virtual-time-budget=2000', `--screenshot=${file}`, `${page}?${query}`], { stdio: 'ignore' });
  if (!fs.existsSync(file)) throw new Error(`${path.basename(file)} 를 못 그렸어요`);
};
RODS.forEach((r, i) => {
  const n = String(i + 1).padStart(2, '0');
  shot(path.join(out, `rod-${n}.png`), `sheet=rod&i=${i}`);
  if (r.sky) shot(path.join(out, `sky-${n}.png`), `sheet=sky&i=${i}`);
  console.log(`${n} ${r.name}${r.sky ? ' + 하늘' : ''}`);
});
fs.writeFileSync(path.join(out, 'rods.json'), JSON.stringify({ frames: FRAMES, step: 200, w: W, h: H,
  // Where the hand and the tip of the pole are in each still (the page draws them there).
  hand: [168, 140], tip: [58, 34],
  rods: RODS.map((r) => ({ name: r.name, line: r.line, bob: r.bob, sky: !!r.sky })) }, null, 1));
