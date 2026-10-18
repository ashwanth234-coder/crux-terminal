// Renders the Farcaster mini app images from the Crux mark.
//   public/icon-1024.png  1024x1024, opaque RGB (Farcaster rejects alpha)
//   public/splash.png      200x200, opaque RGB
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const STAR = "M12 1.2 Q13.1 10.9 22.8 12 Q13.1 13.1 12 22.8 Q10.9 13.1 1.2 12 Q10.9 10.9 12 1.2 Z";
const STAR_INNER = "M12 6.4 Q12.6 11.4 17.6 12 Q12.6 12.6 12 17.6 Q11.4 12.6 6.4 12 Q11.4 11.4 12 6.4 Z";

/** Full-bleed square (clients round the corners themselves). */
function markSvg(size) {
  const mark = size * 0.7;
  const offset = (size - mark) / 2;
  const scale = mark / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="lift" cx="0.5" cy="0.42" r="0.65">
      <stop offset="0" stop-color="#1a1c21"/>
      <stop offset="0.6" stop-color="#0a0a0b"/>
      <stop offset="1" stop-color="#050505"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#lift)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale}) rotate(45 12 12)" fill="none" stroke="#D4F933" stroke-linejoin="round">
    <path d="${STAR}" stroke-width="1.15"/>
    <path d="${STAR_INNER}" stroke-width="0.8" opacity="0.7"/>
    <path d="M12 1.2 V22.8 M1.2 12 H22.8" stroke-width="0.45" opacity="0.35"/>
  </g>
</svg>`;
}

async function render(size, file) {
  const out = fileURLToPath(new URL(`../public/${file}`, import.meta.url));
  await sharp(Buffer.from(markSvg(size)))
    .flatten({ background: "#050505" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`${file}: ${meta.width}x${meta.height}, channels=${meta.channels}, alpha=${meta.hasAlpha}`);
}

await render(1024, "icon-1024.png");
await render(200, "splash.png");
