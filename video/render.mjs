// Render the canvas animation to video frames with headless Chromium, piping into ffmpeg.
// usage:
//   node render.mjs stills 0.5 3 7.5 ...      -> out/still_<t>.jpg
//   node render.mjs video [fps] [out.mp4]     -> silent video + out/cues.json
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.wav': 'audio/wav' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?render=1`);
await page.evaluate(() => window.ready);

const grab = async t => {
  const b64 = await page.evaluate(tt => { window.renderFrame(tt); return document.getElementById('c').toDataURL('image/jpeg', 0.96).split(',')[1]; }, t);
  return Buffer.from(b64, 'base64');
};

const mode = process.argv[2] || 'stills';
if (mode === 'stills') {
  for (const s of process.argv.slice(3)) {
    const t = parseFloat(s);
    fs.writeFileSync(path.join(OUT, `still_${t.toFixed(2)}.jpg`), await grab(t));
  }
} else {
  const fps = parseInt(process.argv[3] || '30', 10);
  const outFile = process.argv[4] || path.join(OUT, 'silent.mp4');
  const dur = await page.evaluate(() => window.DURATION);
  const cues = await page.evaluate(() => window.cueList());
  fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(cues, null, 1));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * fps);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await grab(i / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % (fps * 5) === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', outFile);
}
await browser.close();
server.close();
