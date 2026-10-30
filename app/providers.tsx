"use client";

import type { ReactNode } from "react";
import { Web3Provider } from "@/providers/Web3Provider";
import { FarcasterProvider } from "@/providers/FarcasterProvider";
import { PrivyProvider } from "@/providers/PrivyProvider";
import { I18nProvider } from "@/providers/I18nProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <PrivyProvider>
        <Web3Provider>
          <FarcasterProvider>{children}</FarcasterProvider>
        </Web3Provider>
      </PrivyProvider>
    </I18nProvider>
  );
}
