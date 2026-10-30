import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "buy" | "sell" | "outline" | "ghost";
type Size = "sm" | "md";

const base =
  "group inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  // Electric Orange with black text and the orange glow: the one primary action on a surface.
  primary: "bg-signal text-on-signal glow-signal hover:bg-signal-lift",
  // Trades carry their direction: green to buy, red to sell.
  buy: "bg-up text-void hover:brightness-110",
  sell: "bg-down text-void hover:brightness-110",
  outline: "border border-line-2 text-chrome hover:border-chrome/60 hover:bg-tint/[0.04]",
  ghost: "text-muted hover:text-chrome",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-12 px-6 text-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function ArrowUpRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={`${className} transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5`} aria-hidden="true">
      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={`${className} transition-transform duration-300 group-hover:translate-x-0.5`} aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type LinkButtonProps = ComponentPropsWithoutRef<"a"> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function LinkButton({ variant = "primary", size = "md", className = "", children, ...props }: LinkButtonProps) {
  return (
    <a className={buttonClass(variant, size, className)} {...props}>
      {children}
    </a>
  );
}
