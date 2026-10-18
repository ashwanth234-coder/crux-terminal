"use client";

import dynamic from "next/dynamic";

// three.js never runs on the server; each scene is its own client chunk.
export const MobiusHero = dynamic(() => import("./MobiusHero"), { ssr: false });
export const TokenOrbs = dynamic(() => import("./TokenOrbs"), { ssr: false });
export const GlassHelix = dynamic(() => import("./GlassHelix"), { ssr: false });
export const BatchAuctionRings = dynamic(() => import("./BatchAuctionRings"), { ssr: false });
export const LiquidVortex = dynamic(() => import("./LiquidVortex"), { ssr: false });
export const DerivativesGrid = dynamic(() => import("./DerivativesGrid"), { ssr: false });
export const CruxCoin = dynamic(() => import("./CruxCoin"), { ssr: false });
export const MonolithScene = dynamic(() => import("./MonolithScene"), { ssr: false });
