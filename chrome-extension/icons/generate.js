// icons/generate.js — renders the Kanban AI clipper icon at 16/48/128 px.
// Uses sharp (already a project dep) + SVG input. Drawing a simple emerald
// rounded square with a white "K" — recognizable at 16px, crisp at 128.
//
// Run:  bun public/extension/icons/generate.js   (or: node public/extension/icons/generate.js)
//
// Produces icon16.png, icon48.png, icon128.png next to this script.

import fs from "fs";
import path from "path";
import sharp from "sharp";

// Render the icon as an SVG at a generous base size, then downscale to each
// target with sharp. SVG lets us keep the "K" vector-crisp at any size.
function svgFor(size) {
  // Stroke-width scales a touch so the K is legible at 16px without
  // dominating at 128px.
  const stroke = size >= 96 ? 3.2 : size >= 32 ? 2.6 : 2.2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <path
    d="M ${size * 0.30} ${size * 0.26} L ${size * 0.30} ${size * 0.74}
      M ${size * 0.30} ${size * 0.50} L ${size * 0.66} ${size * 0.26}
      M ${size * 0.30} ${size * 0.50} L ${size * 0.66} ${size * 0.74}"
    stroke="#ffffff"
    stroke-width="${stroke}"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
</svg>`;
}

async function main() {
  const outDir = __dirname;
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    // Always render from the largest SVG (best fidelity), then resize to
    // the exact target px. Avoids density surprises.
    const svg = Buffer.from(svgFor(512));
    const outPath = path.join(outDir, `icon${size}.png`);
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(outPath);
    const stat = fs.statSync(outPath);
    console.log(`  wrote ${path.relative(process.cwd(), outPath)} (${stat.size} bytes)`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error("Icon generation failed:", e);
  process.exit(1);
});
