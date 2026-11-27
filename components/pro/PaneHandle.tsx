"use client";

import { useRef } from "react";

/**
 * A pane's draggable edge (wide screens): a thin bar along the edge that lights up on hover and drags the pane's size.
 * `onMove` gets how far the pointer moved since the drag began (right/down positive); arrow keys move it 16 px at a
 * time; a double-click resets the pane. Sits absolutely on its pane's edge, so the pane needs `relative`.
 */
export function PaneHandle({
  edge,
  label,
  onStart,
  onMove,
  onEnd,
  onReset,
}: {
  edge: "left" | "right" | "top";
  label: string;
  onStart: () => void;
  onMove: (delta: number) => void;
  onEnd: () => void;
  onReset: () => void;
}) {
  const from = useRef<number | null>(null);
  const vertical = edge === "top";
  const place =
    edge === "top" ? "-top-[4px] left-0 right-0 h-[7px] cursor-row-resize" : `${edge === "left" ? "-left-[4px]" : "-right-[4px]"} top-0 bottom-0 w-[7px] cursor-col-resize`;
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-label={label}
      title={`${label} (drag; double-click to reset)`}
      tabIndex={0}
      className={`group absolute z-30 hidden touch-none select-none lg:block ${place}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        from.current = vertical ? e.clientY : e.clientX;
        onStart();
      }}
      onPointerMove={(e) => {
        if (from.current === null) return;
        onMove((vertical ? e.clientY : e.clientX) - from.current);
      }}
      onPointerUp={(e) => {
        if (from.current === null) return;
        from.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onEnd();
      }}
      onPointerCancel={() => {
        if (from.current === null) return;
        from.current = null;
        onEnd();
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.key === (vertical ? "ArrowDown" : "ArrowRight") ? 16 : e.key === (vertical ? "ArrowUp" : "ArrowLeft") ? -16 : 0;
        if (!step) return;
        e.preventDefault();
        onStart();
        onMove(step);
        onEnd();
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute bg-signal/0 transition-colors group-hover:bg-signal/70 group-focus-visible:bg-signal/70 group-active:bg-signal ${
          vertical ? "left-0 right-0 top-[3px] h-px" : "bottom-0 top-0 left-[3px] w-px"
        }`}
      />
    </div>
  );
}
