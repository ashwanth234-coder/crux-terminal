/** A branded PNG of the chart: a header strip with the token's numbers above the chart itself. */
export async function chartSnapshot(chart: HTMLCanvasElement, head: { title: string; value: string; change: string | null; up: boolean; sub: string }): Promise<Blob> {
  const scale = chart.width / Math.max(1, chart.clientWidth || chart.width);
  const band = Math.round(64 * Math.max(1, scale));
  const out = document.createElement("canvas");
  out.width = chart.width;
  out.height = chart.height + band;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, out.width, out.height);
  const pad = Math.round(18 * Math.max(1, scale));
  const px = (n: number) => `${Math.round(n * Math.max(1, scale))}px`;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f3f3f0";
  ctx.font = `600 ${px(18)} ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(head.title, pad, Math.round(band * 0.45));
  ctx.fillStyle = "#8f939b";
  ctx.font = `${px(11)} ui-monospace, monospace`;
  ctx.fillText(head.sub, pad, Math.round(band * 0.8));

  ctx.textAlign = "right";
  ctx.font = `600 ${px(18)} ui-monospace, monospace`;
  ctx.fillStyle = "#f3f3f0";
  const right = out.width - pad;
  ctx.fillText(head.value, right, Math.round(band * 0.45));
  if (head.change) {
    ctx.font = `${px(12)} ui-monospace, monospace`;
    ctx.fillStyle = head.up ? "#5cc08c" : "#e5484d";
    ctx.fillText(head.change, right, Math.round(band * 0.8));
  }
  ctx.drawImage(chart, 0, band);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ff5500";
  ctx.font = `600 ${px(11)} ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText("cruxprotocol.xyz", right, out.height - pad);

  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't render the image"))), "image/png"));
}

/** Copies the PNG to the clipboard; where that isn't allowed, downloads it. Returns what happened. */
export async function shareImage(blob: Blob, filename: string): Promise<"copied" | "downloaded"> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "copied";
    }
  } catch {
    // Clipboard images need a secure, focused page; fall back to a download.
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
  return "downloaded";
}
