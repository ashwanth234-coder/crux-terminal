/**
 * A launch's display image, uploaded from the creator's device: cropped to a square and shrunk in the browser to a small
 * WebP data URI, so it is stored with the token's metadata on-chain (no image host, nothing to pin). Every byte is
 * calldata and token storage, so it is kept to a few KB.
 */

export const DISPLAY_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
/** Target size of the stored data URI: a 96px WebP is usually 2-4 KB. */
const TARGET_CHARS = 6_000;
const STEPS: [size: number, quality: number][] = [
  [96, 0.86],
  [96, 0.72],
  [80, 0.62],
  [64, 0.55],
];

export async function encodeDisplayImage(file: File): Promise<string> {
  if (!DISPLAY_IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG, WebP or GIF image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is over 10 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be read as an image.");
  }
  try {
    // Centre square crop, so a wide or tall picture still fills the round and square avatars.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    let out = "";
    for (const [size, quality] of STEPS) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser can't resize images.");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
      out = canvas.toDataURL("image/webp", quality);
      // Browsers without a WebP encoder hand back PNG; that is still a valid display image, only larger.
      if (out.length <= TARGET_CHARS) break;
    }
    return out;
  } finally {
    bitmap.close();
  }
}

/** Bytes of image a data URI carries (base64 decoded), for the "stored with the token" note. */
export const dataUriBytes = (uri: string) => Math.floor(((uri.length - uri.indexOf(",") - 1) * 3) / 4);
