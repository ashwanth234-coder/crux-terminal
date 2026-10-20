import Link from "next/link";

/** The one action: a restrained text link behind a thin circular arrow. No pill, no fill. */
export function EnterCrux({ href = "/launches", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-5 ${className}`}>
      <span className="grid h-14 w-14 place-items-center rounded-full border border-signal/70 text-chrome transition-colors duration-200 group-hover:border-signal group-hover:bg-signal/[0.08]">
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true">
          <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[12px] font-medium uppercase tracking-[0.32em] text-chrome transition-colors group-hover:text-signal">Enter Crux</span>
    </Link>
  );
}
