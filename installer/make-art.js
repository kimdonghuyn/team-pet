#!/usr/bin/env node
// Draws the installer art from client/assets/icon.png:
//   installer/icon.ico          16..256 px, for the setup .exe, shortcuts and Apps & features
//                               (also copied to client/assets/icon.ico for the desktop icon)
//   installer/wizard.bmp        the tall picture on the first and last pages (2x of 164x314)
//   installer/wizard-small.bmp  the small one at the top of the other pages (2x of 55x55)
// Run again only when the character picture changes; the outputs are kept in the repo.
// The drawing is System.Drawing through PowerShell, passed encoded like scripts/autostart.js.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

const ps = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile(${lit(path.join(ROOT, 'client', 'assets', 'icon.png'))})
$out = ${lit(HERE)}
function Draw($w, $h, $paint) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  & $paint $g
  $g.Dispose()
  return $bmp
}
foreach ($s in ${SIZES.join(',')}) {
  $bmp = Draw $s $s { param($g) $g.DrawImage($src, 0, 0, $s, $s) }
  $bmp.Save((Join-Path $out "icon-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}
$purple = [System.Drawing.Color]::FromArgb(255, 108, 92, 231)
$deep = [System.Drawing.Color]::FromArgb(255, 58, 44, 140)
$wiz = Draw 328 628 {
  param($g)
  $rect = New-Object System.Drawing.Rectangle 0, 0, 328, 628
  $g.FillRectangle((New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $purple, $deep, 90), $rect)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 255, 255, 255))), 44, 150, 240, 240)
  $g.DrawImage($src, 64, 170, 200, 200)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
  $px = [System.Drawing.GraphicsUnit]::Pixel
  $g.DrawString('${'팀 펫'}', (New-Object System.Drawing.Font 'Malgun Gothic', 30, ([System.Drawing.FontStyle]::Bold), $px), [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 410, 328, 50), $fmt)
  $soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(210, 255, 255, 255))
  $g.DrawString("${'같은 층 사람들과'}\`n${'바탕화면에서 대화하고 놀기'}", (New-Object System.Drawing.Font 'Malgun Gothic', 17, ([System.Drawing.FontStyle]::Regular), $px), $soft, (New-Object System.Drawing.RectangleF 0, 466, 328, 60), $fmt)
}
$wiz.Save((Join-Path $out 'wizard.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp); $wiz.Dispose()
$small = Draw 110 110 { param($g) $g.Clear([System.Drawing.Color]::White); $g.DrawImage($src, 5, 5, 100, 100) }
$small.Save((Join-Path $out 'wizard-small.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp); $small.Dispose()
$src.Dispose()
`;
execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { stdio: 'inherit', windowsHide: true });

// The icon file: every size as a PNG entry (Windows Vista and later read those).
const pngs = SIZES.map((s) => fs.readFileSync(path.join(HERE, `icon-${s}.png`)));
const head = Buffer.alloc(6 + 16 * SIZES.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(SIZES.length, 4);
let offset = head.length;
SIZES.forEach((s, i) => {
  const o = 6 + 16 * i;
  head[o] = s % 256; head[o + 1] = s % 256;
  head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(pngs[i].length, o + 8); head.writeUInt32LE(offset, o + 12);
  offset += pngs[i].length;
});
const ico = Buffer.concat([head, ...pngs]);
fs.writeFileSync(path.join(HERE, 'icon.ico'), ico);
fs.writeFileSync(path.join(ROOT, 'client', 'assets', 'icon.ico'), ico);
for (const s of SIZES) fs.unlinkSync(path.join(HERE, `icon-${s}.png`));
console.log(`icon.ico (${SIZES.join(', ')} px), wizard.bmp, wizard-small.bmp`);
