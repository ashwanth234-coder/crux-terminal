// Renders the Farcaster mini app images (and the push-notification icon) from the Crux mark.
//   public/icon-1024.png  1024x1024, opaque RGB (Farcaster rejects alpha)
//   public/splash.png      200x200, opaque RGB
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

/** components/site/Logo.tsx CRUX_MARK_PATH: the X with a diamond cut from its centre (fill-rule evenodd). */
const MARK = "M2 2 H6 L12 8 L18 2 H22 V6 L16 12 L22 18 V22 H18 L12 16 L6 22 H2 V18 L8 12 L2 6 Z M12 9.8 L14.2 12 L12 14.2 L9.8 12 Z";

/** Full-bleed black square (clients round the corners themselves) with the mark in Electric Orange. */
function markSvg(size) {
  const mark = size * 0.62;
  const offset = (size - mark) / 2;
  const scale = mark / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000"/>
  <path transform="translate(${offset} ${offset}) scale(${scale})" fill="#ff5500" fill-rule="evenodd" d="${MARK}"/>
</svg>`;
}

async function render(size, file) {
  const out = fileURLToPath(new URL(`../public/${file}`, import.meta.url));
  await sharp(Buffer.from(markSvg(size)))
    .flatten({ background: "#000000" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`${file}: ${meta.width}x${meta.height}, channels=${meta.channels}, alpha=${meta.hasAlpha}`);
}

await render(1024, "icon-1024.png");
await render(200, "splash.png");
