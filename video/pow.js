// Static "POW" cover image, reusing the drawing helpers from anim.js.
function drawPow() {
  X.setTransform(1, 0, 0, 1, 0, 0);
  // lavender grid background
  X.fillStyle = COL.lav; X.fillRect(0, 0, W, H);
  X.strokeStyle = 'rgba(255,255,255,0.35)'; X.lineWidth = 3;
  for (let x = 0; x <= W; x += 72) { X.beginPath(); X.moveTo(x, 0); X.lineTo(x, H); X.stroke(); }
  for (let y = 0; y <= H; y += 72) { X.beginPath(); X.moveTo(0, y); X.lineTo(W, y); X.stroke(); }
  const g = X.createRadialGradient(W / 2, 420, 100, W / 2, 540, 1100);
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(90,60,200,0.25)');
  X.fillStyle = g; X.fillRect(0, 0, W, H);

  // logo
  logo(W / 2, 300, 240, 10, 0, { float: 0 });

  // headline
  T('what is', W / 2, 455, { size: 110, fill: COL.white, stroke: COL.ink, sw: 22, shadow: 9 });
  T('@FomiesNFT?', W / 2, 590, { size: 132, fill: COL.yellow, stroke: COL.ink, sw: 26, shadow: 11 });
  pill('a walk through the department of fomo', W / 2, 730, 1, { size: 42 });

  // left: character card with "!!"
  X.save(); X.translate(270, 790); X.rotate(-0.08);
  const y = IMG.yellow, s = 1.45;
  X.drawImage(y, -y.width * s / 2, -y.height * s / 2, y.width * s, y.height * s);
  X.restore();
  X.save(); X.translate(270, 575); X.rotate(-0.12);
  T('!!', 0, 0, { size: 170, fill: '#fff', stroke: COL.ink, sw: 24, shadow: 8 });
  X.restore();

  // right: the clerk in a framed window
  X.save(); X.translate(1665, 790); X.rotate(0.06); X.scale(0.82, 0.82);
  box(-215, -215, 430, 430, 30, COL.gold, { sw: 9, shadow: 14 });
  X.save(); rr(-190, -190, 380, 380, 18); X.clip();
  X.drawImage(IMG.clerk, -190, -190, 380, 380); X.restore();
  rr(-190, -190, 380, 380, 18); X.lineWidth = 7; X.strokeStyle = COL.ink; X.stroke();
  box(-110, -268, 220, 64, 12, COL.gold, { sw: 7, shadow: 5 });
  T('WINDOW 3', 0, -235, { size: 34, fam: 'Inter', w: 800, fill: COL.ink, ls: 3 });
  X.restore();

  // stamp + small details
  const st = makeStamp([{ t: 'DEPT. OF FOMO', size: 50, ls: 5 }, { t: '— EST. 2026 —', size: 28, ls: 6, dy: 6 }], COL.red, 560, 170, 'pow');
  X.save(); X.translate(330, 160); X.rotate(-0.12); X.globalAlpha = 0.95; X.drawImage(st, -st.width / 2, -st.height / 2); X.restore();
  X.save(); X.translate(1600, 160); X.rotate(0.08); folderIcon(0, 0, 0.9); X.restore();
  sparkle(560, 340, 30); sparkle(1360, 330, 26); sparkle(1250, 900, 22); sparkle(660, 930, 24);
  T('always early. always watching.', W / 2, 1010, { size: 44, fam: 'Elite', w: 400, fill: COL.ink });
  vignette(0.35);
}
window.ready.then(() => { drawPow(); window.powDone = true; });
