"use client";

import { useState, type DragEvent } from "react";
import { DISPLAY_IMAGE_TYPES, dataUriBytes, encodeDisplayImage } from "@/lib/displayImage";

/**
 * The launch form's display image: upload (or drop) a picture, stored with the token as a small square WebP, or paste
 * an https image URL instead. `value` is either; the preview shows exactly what will be stored.
 */
export function DisplayImageField({
  id,
  value,
  onChange,
  invalid,
  inputCls,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  inputCls: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploaded = value.startsWith("data:image/");
  const preview = uploaded || /^https:\/\/\S+\.\S+/.test(value.trim()) ? value.trim() : null;

  const take = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      onChange(await encodeDisplayImage(file));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That image couldn't be used.");
    } finally {
      setBusy(false);
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  };

  return (
    <div className="flex items-start gap-4">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`group relative grid h-[84px] w-[84px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border bg-void/60 transition-[border-color,box-shadow] focus-within:border-signal focus-within:shadow-[var(--glow)] ${
          dragging ? "border-signal shadow-[var(--glow)]" : preview ? "border-line-2" : "border-dashed border-line-2 hover:border-signal"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local data: URI or the creator's own https URL, shown as stored
          <img src={preview} alt="Display image preview" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[11px] text-muted transition-colors group-hover:text-signal">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {busy ? "Reading…" : "Upload"}
          </span>
        )}
        <input
          id={id}
          type="file"
          accept={DISPLAY_IMAGE_TYPES.join(",")}
          className="sr-only"
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <div className="min-w-0 flex-1 space-y-2">
        {uploaded ? (
          <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-line bg-void/60 px-3 py-2.5 text-[13px]">
            <span className="truncate text-chrome">
              Uploaded image <span className="font-mono text-[11.5px] text-dim">· 96px · {(dataUriBytes(value) / 1024).toFixed(1)} KB</span>
            </span>
            <button type="button" onClick={() => onChange("")} className="shrink-0 text-[12px] text-muted transition-colors hover:text-signal">
              Remove
            </button>
          </div>
        ) : (
          <input
            className={inputCls}
            placeholder="or paste an https:// image URL"
            inputMode="url"
            aria-label="Display image URL"
            aria-invalid={invalid}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <p className={`text-[11.5px] ${problem ? "text-down" : "text-dim"}`}>{problem ?? "Optional. Click or drop a PNG, JPG, WebP or GIF; it's cropped square and stored with the token."}</p>
      </div>
    </div>
  );
}
