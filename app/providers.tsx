"use client";

import type { ReactNode } from "react";
import { Web3Provider } from "@/providers/Web3Provider";
import { FarcasterProvider } from "@/providers/FarcasterProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Web3Provider>
      <FarcasterProvider>{children}</FarcasterProvider>
    </Web3Provider>
  );
}
