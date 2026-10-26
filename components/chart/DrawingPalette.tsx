"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { ChartSettings } from "./settings";
import type { DrawTool } from "./drawings";

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
    {d}
  </svg>
);
const S = { stroke: "currentColor", strokeWidth: 1.2, fill: "none" } as const;

export const TOOL_INFO: Record<DrawTool, { label: string; key?: string; icon: ReactNode }> = {
  trend: {
    label: "Trendline",
    key: "T",
    icon: svg(
      <>
        <path d="m3 12.5 10-9" {...S} />
        <circle cx="3" cy="12.5" r="1.5" fill="currentColor" />
        <circle cx="13" cy="3.5" r="1.5" fill="currentColor" />
      </>,
    ),
  },
  ray: {
    label: "Horizontal ray",
    key: "J",
    icon: svg(
      <>
        <circle cx="3.5" cy="8" r="1.6" fill="currentColor" />
        <path d="M3.5 8h11" {...S} />
      </>,
    ),
  },
  hline: { label: "Horizontal line", key: "H", icon: svg(<path d="M1.5 8h13" {...S} />) },
  vline: { label: "Vertical line", key: "V", icon: svg(<path d="M8 1.5v13" {...S} strokeDasharray="2 1.5" />) },
  arrow: { label: "Arrow", icon: svg(<path d="m3 13 9-9M7.5 4H12v4.5" {...S} />) },
  channel: { label: "Parallel channel", icon: svg(<path d="m2 10 9-6M5 13l9-6" {...S} />) },
  rect: { label: "Rectangle", key: "B", icon: svg(<rect x="2.5" y="4" width="11" height="8" {...S} />) },
  text: { label: "Text note", key: "N", icon: svg(<path d="M3.5 3.5h9M8 3.5v9.5" {...S} strokeWidth={1.5} />) },
  emoji: {
    label: "Sticker",
    icon: svg(
      <>
        <circle cx="8" cy="8" r="6" {...S} />
        <path d="M5.5 9.5c.6 1 1.4 1.5 2.5 1.5s1.9-.5 2.5-1.5" {...S} />
        <circle cx="6" cy="6.5" r=".8" fill="currentColor" />
        <circle cx="10" cy="6.5" r=".8" fill="currentColor" />
      </>,
    ),
  },
  brush: { label: "Brush", key: "P", icon: svg(<path d="M2.5 12.5c2-.3 2.6-2.2 4-3.4 1.6-1.4 3.7-.6 4.6-2.4.7-1.4 2-3 2.5-4.2" {...S} strokeLinecap="round" />) },
  ruler: {
    label: "Measure (% ruler)",
    key: "M",
    icon: svg(
      <>
        <rect x="3" y="4" width="10" height="8" {...S} strokeWidth={1.1} fill="currentColor" fillOpacity={0.2} />
        <path d="M8 5.5v5M6.5 7 8 5.5 9.5 7" {...S} strokeWidth={1.1} />
      </>,
    ),
  },
  fib: { label: "Fib retracement", key: "F", icon: svg(<path d="M2.5 3.5h11M2.5 6.5h11M2.5 9h11M2.5 12.5h11" {...S} strokeWidth={1.1} />) },
  long: {
    label: "Long position",
    key: "L",
    icon: svg(
      <>
        <rect x="2.5" y="2.5" width="11" height="6" fill="#5cc08c" fillOpacity="0.35" />
        <rect x="2.5" y="8.5" width="11" height="4" fill="#e5484d" fillOpacity="0.35" />
        <path d="M2.5 8.5h11" {...S} />
      </>,
    ),
  },
  short: {
    label: "Short position",
    key: "S",
    icon: svg(
      <>
        <rect x="2.5" y="3.5" width="11" height="4" fill="#e5484d" fillOpacity="0.35" />
        <rect x="2.5" y="7.5" width="11" height="6" fill="#5cc08c" fillOpacity="0.35" />
        <path d="M2.5 7.5h11" {...S} />
      </>,
    ),
  },
};

/** Alt + key shortcuts (TradingView's where it has one). */
export const TOOL_KEYS: Record<string, DrawTool> = Object.fromEntries(
  (Object.entries(TOOL_INFO) as [DrawTool, { key?: string }][]).filter(([, v]) => v.key).map(([t, v]) => [v.key!.toLowerCase(), t]),
);

export const STICKERS = ["🚀", "🔥", "💎", "🐋", "📈", "📉", "⚠️", "✅", "❌", "👀", "🎯", "💀"];

const GROUPS: { id: string; label: string; tools: DrawTool[] }[] = [
  { id: "lines", label: "Lines", tools: ["trend", "ray", "hline", "vline", "arrow", "channel"] },
  { id: "fib", label: "Fib and positions", tools: ["fib", "long", "short"] },
  { id: "shapes", label: "Shapes and notes", tools: ["rect", "text"] },
];

const CURSORS: { id: ChartSettings["cursor"]; label: string; icon: ReactNode }[] = [
  { id: "cross", label: "Cross", icon: svg(<path d="M8 1.5v13M1.5 8h13" {...S} />) },
  {
    id: "dot",
    label: "Dot",
    icon: svg(<circle cx="8" cy="8" r="2" fill="currentColor" />),
  },
  { id: "arrow", label: "Arrow", icon: svg(<path d="M4 2.5v10l3-3 2 4.5 1.6-.7-2-4.4H13Z" {...S} strokeLinejoin="round" />) },
];

function Btn({
  label,
  pressed,
  onClick,
  disabled,
  children,
  danger,
}: {
  label: string;
  pressed?: boolean;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-[3px] transition-colors disabled:opacity-30 ${
        pressed
          ? "bg-signal/15 text-signal ring-1 ring-inset ring-signal/60"
          : danger
            ? "text-muted hover:bg-down/10 hover:text-down"
            : "text-muted hover:bg-white/[0.05] hover:text-chrome"
      }`}
    >
      {children}
    </button>
  );
}

const Corner = () => <span className="absolute bottom-0.5 right-0.5 h-0 w-0 border-l-[3px] border-t-[3px] border-l-transparent border-t-current opacity-60" aria-hidden="true" />;
const Rule = () => <span className="my-0.5 h-px shrink-0 bg-line" aria-hidden="true" />;

/**
 * The drawing toolbar on the chart's left edge, in TradingView's order: cursor (cross / dot / arrow), line tools, Fib
 * and positions, shapes and notes, brush, stickers, then measure and zoom, then magnet, lock, show / hide and remove.
 * Grouped tools open beside it and remember the last one used. It folds away to a small tab.
 */
export function DrawingPalette({
  open,
  setOpen,
  tool,
  setTool,
  count,
  onClear,
  settings,
  onSettings,
  hidden,
  onHidden,
  zoom,
  onZoom,
  sticker,
  onSticker,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  tool: DrawTool | null;
  setTool: (t: DrawTool | null) => void;
  count: number;
  onClear: () => void;
  settings: ChartSettings;
  onSettings: (s: ChartSettings) => void;
  hidden: boolean;
  onHidden: () => void;
  zoom: boolean;
  onZoom: () => void;
  sticker: string;
  onSticker: (s: string) => void;
}) {
  // The open group menu and how far down the toolbar its button sits (menus live outside the scrolling column).
  const [flyout, setFlyoutState] = useState<string | null>(null);
  const [flyTop, setFlyTop] = useState(0);
  const setFlyout = (id: string | null) => setFlyoutState(id);
  const toggleFly = (id: string) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.closest("[data-palette]")?.getBoundingClientRect();
    setFlyTop(box ? e.currentTarget.getBoundingClientRect().top - box.top : 0);
    setFlyoutState(flyout === id ? null : id);
  };
  const [last, setLast] = useState<Record<string, DrawTool>>({ lines: "trend", fib: "fib", shapes: "rect" });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setFlyout(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFlyout(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Show drawing tools"
        title="Drawing tools"
        className="absolute left-0 top-1/2 z-20 grid h-10 w-3.5 -translate-y-1/2 place-items-center rounded-r-[4px] border border-l-0 border-line-2 bg-panel-2/90 text-dim transition-colors hover:w-4 hover:text-chrome"
      >
        <svg viewBox="0 0 8 12" className="h-2.5 w-2" aria-hidden="true">
          <path d="m2 2 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    );
  }

  const menus: ReactNode[] = [];
  const menu = (id: string, label: string, body: ReactNode) => {
    if (flyout === id) menus.push(<div key={id}>{flyoutBox(id, label, body)}</div>);
    return null;
  };
  const flyoutBox = (id: string, label: string, body: ReactNode) =>
    flyout === id && (
      <div role="menu" aria-label={label} style={{ top: flyTop }} className="pointer-events-auto absolute left-full z-30 ml-1.5 w-56 rounded-[5px] border border-line-2 bg-panel-2 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
        <p className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-[0.14em] text-dim">{label}</p>
        {body}
      </div>
    );
  const item = (key: string, active: boolean, icon: ReactNode, text: string, onClick: () => void, hint?: string) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={() => {
        onClick();
        setFlyout(null);
      }}
      className={`flex w-full items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-left text-[12px] transition-colors ${active ? "bg-signal/10 text-signal" : "text-muted hover:bg-white/[0.05] hover:text-chrome"}`}
    >
      {icon}
      <span className="flex-1">{text}</span>
      {hint && <kbd className="font-mono text-[10px] text-dim">{hint}</kbd>}
    </button>
  );
  const cursor = CURSORS.find((c) => c.id === settings.cursor) ?? CURSORS[0];

  return (
    <div
      ref={ref}
      // Clicks here are for the toolbar, not for placing a point on the chart underneath.
      onClick={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
      data-palette
      className="pointer-events-none absolute bottom-2 left-1.5 top-2 z-20 flex w-10 flex-col"
    >
      <div
        className="pointer-events-auto flex max-h-full flex-col gap-0.5 overflow-y-auto overflow-x-visible rounded-[5px] border border-line-2 bg-panel-2/95 p-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)] [scrollbar-width:none]"
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
      >
        <div className="relative">
          <Btn label={`Cursor: ${cursor.label}`} pressed={flyout === "cursor"} onClick={toggleFly("cursor")}>
            {cursor.icon}
            <Corner />
          </Btn>
          {menu(
            "cursor",
            "Cursor",
            CURSORS.map((c) => item(c.id, settings.cursor === c.id, c.icon, c.label, () => onSettings({ ...settings, cursor: c.id }))),
          )}
        </div>
        {GROUPS.map((g) => {
          const active = tool !== null && g.tools.includes(tool);
          const shown = active ? tool! : last[g.id];
          return (
            <div key={g.id} className="relative">
              <Btn label={`${g.label}: ${TOOL_INFO[shown].label}`} pressed={active || flyout === g.id} onClick={toggleFly(g.id)}>
                {TOOL_INFO[shown].icon}
                <Corner />
              </Btn>
              {menu(
                g.id,
                g.label,
                g.tools.map((t) =>
                  item(
                    t,
                    tool === t,
                    TOOL_INFO[t].icon,
                    TOOL_INFO[t].label,
                    () => {
                      setTool(tool === t ? null : t);
                      setLast((l) => ({ ...l, [g.id]: t }));
                    },
                    TOOL_INFO[t].key && `Alt+${TOOL_INFO[t].key}`,
                  ),
                ),
              )}
            </div>
          );
        })}
        <Btn label="Brush (Alt+P): drag to draw" pressed={tool === "brush"} onClick={() => setTool(tool === "brush" ? null : "brush")}>
          {TOOL_INFO.brush.icon}
        </Btn>
        <div className="relative">
          <Btn label={`Sticker ${sticker}`} pressed={tool === "emoji" || flyout === "emoji"} onClick={toggleFly("emoji")}>
            {TOOL_INFO.emoji.icon}
            <Corner />
          </Btn>
          {menu(
            "emoji",
            "Stickers",
            <div className="grid grid-cols-6 gap-0.5 px-1 pb-1">
              {STICKERS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`Place ${e}`}
                  onClick={() => {
                    onSticker(e);
                    setTool("emoji");
                    setFlyout(null);
                  }}
                  className={`grid h-8 place-items-center rounded-[3px] text-[17px] hover:bg-white/[0.06] ${sticker === e && tool === "emoji" ? "bg-signal/15" : ""}`}
                >
                  {e}
                </button>
              ))}
            </div>,
          )}
        </div>
        <Rule />
        <Btn label="Measure (Alt+M)" pressed={tool === "ruler"} onClick={() => setTool(tool === "ruler" ? null : "ruler")}>
          {TOOL_INFO.ruler.icon}
        </Btn>
        <Btn label="Zoom in: drag a box" pressed={zoom} onClick={onZoom}>
          {svg(
            <>
              <circle cx="7" cy="7" r="4.5" {...S} />
              <path d="m10.5 10.5 3.5 3.5M5 7h4M7 5v4" {...S} />
            </>,
          )}
        </Btn>
        <Rule />
        <Btn
          label={settings.snap ? "Magnet on: points snap to the bar's open, high, low or close" : "Magnet off"}
          pressed={settings.snap}
          onClick={() => onSettings({ ...settings, snap: !settings.snap })}
        >
          {svg(<path d="M4 2.5v5a4 4 0 0 0 8 0v-5M4 5h2.5M9.5 5H12M6.5 2.5v5a1.5 1.5 0 0 0 3 0v-5" {...S} />)}
        </Btn>
        <Btn
          label={settings.drawLocked ? "Drawings locked: click to unlock" : "Lock all drawings"}
          pressed={settings.drawLocked}
          onClick={() => onSettings({ ...settings, drawLocked: !settings.drawLocked })}
        >
          {settings.drawLocked
            ? svg(
                <>
                  <rect x="3.5" y="7" width="9" height="6.5" rx="1" {...S} />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" {...S} />
                </>,
              )
            : svg(
                <>
                  <rect x="3.5" y="7" width="9" height="6.5" rx="1" {...S} />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" {...S} />
                </>,
              )}
        </Btn>
        <Btn label={hidden ? `Show ${count} drawing${count === 1 ? "" : "s"}` : "Hide drawings"} pressed={hidden} onClick={onHidden} disabled={count === 0 && !hidden}>
          {hidden
            ? svg(<path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4ZM3 3l10 10" {...S} />)
            : svg(
                <>
                  <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" {...S} />
                  <circle cx="8" cy="8" r="1.8" {...S} />
                </>,
              )}
        </Btn>
        <Btn label={`Remove ${count} drawing${count === 1 ? "" : "s"}`} onClick={onClear} disabled={count === 0} danger>
          {svg(<path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8.5h4.8l.6-8.5" {...S} strokeLinejoin="round" />)}
        </Btn>
        <button
          type="button"
          onClick={() => {
            setTool(null);
            setOpen(false);
          }}
          aria-label="Hide drawing tools"
          title="Hide the toolbar"
          className="grid h-6 w-8 shrink-0 place-items-center rounded-[3px] text-dim hover:text-chrome"
        >
          <svg viewBox="0 0 8 12" className="h-2.5 w-2" aria-hidden="true">
            <path d="m6 2-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>
      {menus}
    </div>
  );
}
